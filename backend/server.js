'use strict';

// Minimal production-minded HTTP/API server. Secrets are loaded from a protected .env file.
// Payment and passkey routes intentionally fail closed until their providers are configured.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !Object.hasOwn(process.env, m[1])) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {}
}
loadEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 3200);
let pool = null;
try {
  const mysql = require('mysql2/promise');
  if (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER) {
    pool = mysql.createPool({
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER, password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME, waitForConnections: true, connectionLimit: 8,
      charset: 'utf8mb4', timezone: 'Z', decimalNumbers: true
    });
  }
} catch (err) {
  console.error('mysql2 is missing. Run npm install from the project folder.');
}

const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon' };
function send(res, status, data) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin', 'X-Frame-Options':'DENY', 'Content-Security-Policy':"default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" });
  res.end(body);
}
async function bodyJson(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 32768) throw Object.assign(new Error('Request too large'), { status:413 }); }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('Invalid JSON'), { status:400 }); }
}
async function query(sql, params = []) {
  if (!pool) throw Object.assign(new Error('Database is not configured'), { status:503 });
  const [rows] = await pool.execute(sql, params);
  return rows;
}
function uuid() { return crypto.randomUUID(); }

async function api(req, res, url) {
  const p = url.pathname;
  if (p === '/api/health' && req.method === 'GET') {
    let db='not_configured';
    if(pool){try{await pool.query('SELECT 1');db='connected'}catch{db='disconnected'}}
    return send(res, db==='connected'||db==='not_configured'?200:503, { ok:db==='connected', database:db });
  }
  if (p === '/api/v1/shops' && req.method === 'GET') {
    const city = (url.searchParams.get('city') || '').trim().slice(0,100);
    const term = (url.searchParams.get('q') || '').trim().slice(0,100);
    const category=(url.searchParams.get('category')||'').trim().slice(0,50);
    const latValue=url.searchParams.get('lat'),lngValue=url.searchParams.get('lng');
    const lat = latValue===null?NaN:Number(latValue); const lng = lngValue===null?NaN:Number(lngValue);
    const where = ["b.status='active'", 'l.active=1']; const args=[];
    if (city) { where.push('l.city LIKE ?'); args.push(`%${city}%`); }
    if (term) { where.push('(b.name LIKE ? OR b.category LIKE ? OR l.city LIKE ? OR s.name LIKE ?)'); args.push(`%${term}%`,`%${term}%`,`%${term}%`,`%${term}%`); }
    if (category) { where.push('b.category LIKE ?'); args.push(`%${category}%`); }
    const distance = Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180
      ? `, (6371 * ACOS(LEAST(1,COS(RADIANS(?))*COS(RADIANS(l.latitude))*COS(RADIANS(l.longitude)-RADIANS(?))+SIN(RADIANS(?))*SIN(RADIANS(l.latitude))))) distance_km`
      : ', NULL distance_km';
    if (Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180) args.unshift(lat,lng,lat);
    const rows = await query(`SELECT b.id business_id,b.name,b.category,b.description,l.id location_id,l.name location_name,l.address,l.city,l.latitude,l.longitude,l.photo_url,COUNT(DISTINCT s.id) service_count,MIN(s.price_cents) from_price_cents${distance} FROM businesses b JOIN locations l ON l.business_id=b.id LEFT JOIN services s ON s.business_id=b.id AND s.active=1 WHERE ${where.join(' AND ')} GROUP BY b.id,b.name,b.category,b.description,l.id,l.name,l.address,l.city,l.latitude,l.longitude,l.photo_url ORDER BY distance_km IS NULL,distance_km,b.name,l.city LIMIT 100`, args);
    return send(res,200,{shops:rows});
  }
  const servicesMatch = p.match(/^\/api\/v1\/shops\/([0-9a-f-]{36})\/services$/i);
  if (servicesMatch && req.method === 'GET') {
    const rows = await query('SELECT id,name,description,audience,duration_minutes,price_cents FROM services WHERE business_id=? AND active=1 ORDER BY name', [servicesMatch[1]]);
    return send(res,200,{services:rows});
  }
  const listingMatch = p === '/api/v1/listings' && req.method === 'GET';
  if (listingMatch) {
    const type = url.searchParams.get('type'); const city=(url.searchParams.get('city')||'').trim().slice(0,100);
    const where=['x.published=1','(x.expires_at IS NULL OR x.expires_at>UTC_TIMESTAMP())']; const args=[];
    if (type === 'job' || type === 'chair_rental') { where.push('x.listing_type=?'); args.push(type); }
    if (city) { where.push('x.city LIKE ?'); args.push(`%${city}%`); }
    const rows=await query(`SELECT x.id,x.listing_type,x.title,x.description,x.contact_email,x.contact_phone,x.city,b.name business_name FROM business_listings x JOIN businesses b ON b.id=x.business_id WHERE ${where.join(' AND ')} ORDER BY x.created_at DESC LIMIT 100`,args);
    return send(res,200,{listings:rows});
  }
  if (p === '/api/v1/bookings' && req.method === 'POST') {
    // Requires an authenticated passkey-backed customer session. Never accept customer IDs from body.
    return send(res,401,{error:'Sign in with your Style by Rinero account before booking.'});
  }
  if (p.startsWith('/api/v1/auth/')) return send(res,503,{error:'Passkey sign-in is not configured on this installation yet.'});
  if (p.startsWith('/api/v1/payments/')) return send(res,503,{error:'Online payments are not enabled until the business payment account is connected.'});
  return send(res,404,{error:'Not found'});
}

const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await api(req,res,url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res,405,'Method not allowed');
    let rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(ROOT, `.${rel}`);
    if (!file.startsWith(ROOT + path.sep)) return send(res,400,'Bad path');
    let stat; try { stat=fs.statSync(file); } catch { return send(res,404,'Not found'); }
    if (!stat.isFile()) return send(res,404,'Not found');
    const data=fs.readFileSync(file);
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Content-Length':data.length,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'self'; frame-ancestors 'none'"});
    res.end(req.method==='HEAD'?undefined:data);
  } catch (err) {
    const status=err.status||500;
    if (status>=500) console.error('Request failed:',err.message);
    if (!res.headersSent) send(res,status,{error:status>=500?'The service could not complete this request.':err.message}); else res.destroy();
  }
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Style by Rinero listening on port ${PORT}`));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
