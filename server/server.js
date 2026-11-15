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
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3200';
const publicUrl = new URL(PUBLIC_URL);
const RP_ID = process.env.WEBAUTHN_RP_ID || publicUrl.hostname;
const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'Style by Rinero';
const SESSION_DAYS = 30;
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

let webauthnPromise;
const webauthn = () => (webauthnPromise ||= import('@simplewebauthn/server'));
const rateBuckets = new Map();
function rateLimit(req, key, limit=12, windowMs=10*60*1000) {
  const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const id = `${key}:${ip}`; const now = Date.now(); let entry = rateBuckets.get(id);
  if (!entry || now-entry.start > windowMs) entry = {start:now,count:0};
  entry.count++; rateBuckets.set(id,entry);
  if (rateBuckets.size > 10000) for (const [k,v] of rateBuckets) if (now-v.start > windowMs) rateBuckets.delete(k);
  return entry.count <= limit;
}
function originAllowed(req) {
  const origin = req.headers.origin;
  return !origin || origin === publicUrl.origin;
}
function cookie(req,name) {
  const part=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length+1)) : '';
}
function sessionCookie(token,maxAge=SESSION_DAYS*86400) {
  return `style_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function hash(value) { return crypto.createHash('sha256').update(value).digest(); }
function digestEqual(a,b) { return a.length===b.length && crypto.timingSafeEqual(a,b); }
function passwordHash(password) {
  const salt=crypto.randomBytes(16);
  return new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(err,key)=>err?reject(err):resolve(`scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`)));
}
function verifyPassword(password,stored) {
  const [scheme,salt,key]=String(stored||'').split('$');
  if(scheme!=='scrypt'||!salt||!key) return Promise.resolve(false);
  const expected=Buffer.from(key,'base64url');
  return new Promise((resolve,reject)=>crypto.scrypt(password,Buffer.from(salt,'base64url'),expected.length,(err,actual)=>err?reject(err):resolve(actual.length===expected.length&&crypto.timingSafeEqual(actual,expected))));
}
function challengeFromResponse(response) {
  try { return JSON.parse(Buffer.from(response.response.clientDataJSON,'base64url').toString('utf8')).challenge; }
  catch { throw Object.assign(new Error('Invalid passkey response.'),{status:400}); }
}
async function consumeChallenge(response,purpose) {
  const challenge=challengeFromResponse(response); const challengeHash=hash(challenge);
  const rows=await query('SELECT id,user_id,purpose FROM webauthn_challenges WHERE challenge_hash=? AND purpose=? AND expires_at>UTC_TIMESTAMP() LIMIT 1',[challengeHash,purpose]);
  if(!rows.length) throw Object.assign(new Error('Passkey request expired. Start again.'),{status:400});
  await query('DELETE FROM webauthn_challenges WHERE id=?',[rows[0].id]);
  return {challenge,userId:rows[0].user_id};
}
async function issueSession(res,userId) {
  const token=crypto.randomBytes(32).toString('base64url');
  await query('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? DAY))',[uuid(),userId,hash(token),SESSION_DAYS]);
  res.setHeader('Set-Cookie',sessionCookie(token));
}
async function currentUser(req) {
  const token=cookie(req,'style_session'); if(!token) return null;
  const rows=await query('SELECT u.id,u.email,u.display_name,u.phone,u.gender,u.age,u.role,u.preferred_language FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>UTC_TIMESTAMP() LIMIT 1',[hash(token)]);
  return rows[0]||null;
}
function assertSameOrigin(req) {
  if(!originAllowed(req)) throw Object.assign(new Error('Request origin was not accepted.'),{status:403});
}
function localToUtcSql(date,time,tz) {
  const target=Date.parse(`${date}T${time}Z`); let guess=target;
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let i=0;i<4;i++) {
    const parts=Object.fromEntries(fmt.formatToParts(new Date(guess)).map(p=>[p.type,p.value]));
    const seen=Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    const delta=target-seen; if(!delta) break; guess+=delta;
  }
  return new Date(guess).toISOString().slice(0,19).replace('T',' ');
}
function validUuid(v){return typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v)}
function validLocalDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value}
function localParts(date,time,tz){
  const utc=localToUtcSql(date,time,tz);
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const parts=Object.fromEntries(fmt.formatToParts(new Date(`${utc.replace(' ','T')}Z`)).map(x=>[x.type,x.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:00`===`${date} ${time}:00`?utc:null;
}
function weekdayMondayZero(date){return (new Date(`${date}T00:00:00Z`).getUTCDay()+6)%7}
function minutesOfTime(value){const [h,m]=String(value).split(':').map(Number);return h*60+m}
function sqlUtcMs(value){return value instanceof Date?value.getTime():new Date(`${String(value).replace(' ','T')}Z`).getTime()}
async function getOpenSlots({serviceId,locationId,date,professionalId}){
  if(!validUuid(serviceId)||!validUuid(locationId)||!validLocalDate(date))throw Object.assign(new Error('Choose a valid service, location and date.'),{status:400});
  const dayStart=Date.parse(`${date}T00:00:00Z`),today=new Date().toISOString().slice(0,10);
  if(date<today||date>new Date(dayStart+90*86400000).toISOString().slice(0,10))throw Object.assign(new Error('Choose a date from today to the next 90 days.'),{status:400});
  const targetRows=await query(`SELECT s.id service_id,s.business_id,s.duration_minutes,s.audience,l.id location_id,l.timezone FROM services s JOIN locations l ON l.business_id=s.business_id JOIN businesses b ON b.id=s.business_id WHERE s.id=? AND l.id=? AND s.active=1 AND l.active=1 AND b.status='active'`,[serviceId,locationId]);
  if(!targetRows.length)throw Object.assign(new Error('That service or location is unavailable.'),{status:404});
  const target=targetRows[0];
  const pros=await query(`SELECT p.id,p.name FROM professionals p WHERE p.business_id=? AND p.active=1 AND (? IS NULL OR p.id=?) AND (NOT EXISTS(SELECT 1 FROM professional_services x WHERE x.service_id=?) OR EXISTS(SELECT 1 FROM professional_services x WHERE x.service_id=? AND x.professional_id=p.id)) ORDER BY p.name`,[target.business_id,professionalId||null,professionalId||null,serviceId,serviceId]);
  if(professionalId&&!pros.length)return {target,slots:[]};
  const slots=[];const now=Date.now();
  const dayStartUtc=localParts(date,'00:00',target.timezone)||`${date} 00:00:00`;
  const nextDate=new Date(dayStart+86400000).toISOString().slice(0,10);
  const dayEndUtc=localParts(nextDate,'00:00',target.timezone)||`${nextDate} 00:00:00`;
  const dayExceptions=await query(`SELECT professional_id,starts_at,ends_at,exception_type FROM schedule_exceptions WHERE location_id=? AND starts_at < ? AND ends_at > ?`,[locationId,dayEndUtc,dayStartUtc]);
  const busy=await query(`SELECT professional_id,starts_at,ends_at FROM bookings WHERE location_id=? AND booking_status IN ('pending_payment','confirmed') AND starts_at < ? AND ends_at > ?`,[locationId,dayEndUtc,dayStartUtc]);
  for(const pro of pros){
    const rules=await query('SELECT start_time,end_time,break_start,break_end FROM availability_rules WHERE professional_id=? AND location_id=? AND weekday=? AND active=1',[pro.id,locationId,weekdayMondayZero(date)]);
    const exceptions=dayExceptions.filter(e=>e.professional_id===pro.id);
    const ranges=rules.map(r=>({start:minutesOfTime(r.start_time),end:minutesOfTime(r.end_time),breakStart:r.break_start?minutesOfTime(r.break_start):null,breakEnd:r.break_end?minutesOfTime(r.break_end):null}));
    for(let minute=0;minute<1440;minute+=15){
      const finish=minute+Number(target.duration_minutes);if(finish>1440)continue;
      const range=ranges.find(r=>minute>=r.start&&finish<=r.end);
      const startTime=`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
      const endTime=`${String(Math.floor(finish/60)).padStart(2,'0')}:${String(finish%60).padStart(2,'0')}`;
      const starts=localParts(date,startTime,target.timezone),ends=localParts(date,endTime,target.timezone);if(!starts||!ends||sqlUtcMs(starts)<=now)continue;
      const startMs=sqlUtcMs(starts),endMs=sqlUtcMs(ends);
      const covered=exceptions.some(e=>e.exception_type==='extra_hours'&&startMs>=sqlUtcMs(e.starts_at)&&endMs<=sqlUtcMs(e.ends_at));
      if(!range&&!covered)continue;
      if(range&&range.breakStart!==null&&minute<range.breakEnd&&finish>range.breakStart)continue;
      if(busy.some(b=>b.professional_id===pro.id&&startMs<sqlUtcMs(b.ends_at)&&endMs>sqlUtcMs(b.starts_at)))continue;
      if(exceptions.some(e=>e.exception_type!=='extra_hours'&&startMs<sqlUtcMs(e.ends_at)&&endMs>sqlUtcMs(e.starts_at)))continue;
      slots.push({professional_id:pro.id,professional_name:pro.name,starts_at:starts.replace(' ','T')+'Z',ends_at:ends.replace(' ','T')+'Z',local_time:startTime});
    }
  }
  return {target,slots:slots.sort((a,b)=>a.starts_at.localeCompare(b.starts_at)||a.professional_name.localeCompare(b.professional_name))};
}
async function requireUser(req,res,roles) {
  const user=await currentUser(req);
  if(!user){send(res,401,{error:'Sign in to your customer account first.'});return null;}
  if(roles && !roles.includes(user.role)){send(res,403,{error:'This account does not have access to that area.'});return null;}
  return user;
}

async function authApi(req,res,p) {
  if(req.method==='POST') assertSameOrigin(req);
  if(p==='/api/v1/auth/password/register'&&req.method==='POST') {
    if(!rateLimit(req,'password-reg',8)) return send(res,429,{error:'Too many attempts. Try again later.'});
    const input=await bodyJson(req); const email=String(input.email||'').trim().toLowerCase(); const password=String(input.password||'');
    const displayName=String(input.display_name||'').trim(); const phone=String(input.phone||'').trim(); const digits=phone.replace(/\D/g,'');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||displayName.length<2||displayName.length>160) return send(res,400,{error:'Enter a valid email and your first and last name.'});
    if(password.length<10||password.length>128) return send(res,400,{error:'Choose a password between 10 and 128 characters.'});
    if(!/^\+?[0-9\s().-]{7,32}$/.test(phone)||digits.length<7||digits.length>15) return send(res,400,{error:'Enter a valid phone number, including the country code.'});
    const exists=await query('SELECT id FROM users WHERE email=? LIMIT 1',[email]); if(exists.length) return send(res,409,{error:'An account already exists for this email. Sign in instead.'});
    const userId=uuid(),gender=['male','female','nonbinary','unspecified'].includes(input.gender)?input.gender:'unspecified',age=Number.isInteger(input.age)&&input.age>=13&&input.age<=120?input.age:null;
    const encoded=await passwordHash(password);
    await query('INSERT INTO users(id,email,display_name,phone,gender,age,role,password_hash) VALUES(?,?,?,?,?,?,\'customer\',?)',[userId,email,displayName,phone,gender,age,encoded]);
    await issueSession(res,userId); const users=await query('SELECT id,email,display_name,phone,gender,age,role,preferred_language FROM users WHERE id=?',[userId]);
    return send(res,201,{user:users[0]});
  }
  if(p==='/api/v1/auth/password/login'&&req.method==='POST') {
    if(!rateLimit(req,'password-login',8)) return send(res,429,{error:'Too many attempts. Try again later.'});
    const input=await bodyJson(req),email=String(input.email||'').trim().toLowerCase(),password=String(input.password||'');
    const rows=await query('SELECT id,password_hash FROM users WHERE email=? LIMIT 1',[email]);
    if(!rows.length||!rows[0].password_hash||!await verifyPassword(password,rows[0].password_hash)) return send(res,401,{error:'Email or password is incorrect.'});
    await issueSession(res,rows[0].id); const users=await query('SELECT id,email,display_name,phone,gender,age,role,preferred_language FROM users WHERE id=?',[rows[0].id]);
    return send(res,200,{user:users[0]});
  }
  if(p==='/api/v1/auth/register/options'&&req.method==='POST') {
    if(!rateLimit(req,'reg')) return send(res,429,{error:'Too many attempts. Try again later.'});
    const input=await bodyJson(req); const email=String(input.email||'').trim().toLowerCase(); const displayName=String(input.display_name||'').trim(); const phone=String(input.phone||'').trim(); const phoneDigits=phone.replace(/\D/g,'');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||displayName.length<2||displayName.length>160) return send(res,400,{error:'Enter a valid email and your first and last name.'});
    if(!/^\+?[0-9\s().-]{7,32}$/.test(phone)||phoneDigits.length<7||phoneDigits.length>15) return send(res,400,{error:'Enter a valid phone number, including the country code.'});
    const accountType=input.account_type==='business'?'business':'customer';
    const businessName=String(input.business_name||'').trim(); const businessCategory=String(input.business_category||'').trim();
    if(accountType==='business'&&(businessName.length<2||businessName.length>180||businessCategory.length<2||businessCategory.length>50))return send(res,400,{error:'Enter your business name and category.'});
    const exists=await query('SELECT id FROM users WHERE email=? LIMIT 1',[email]); if(exists.length) return send(res,409,{error:'An account already exists for this email. Sign in with its passkey or password.'});
    const userId=uuid(); const gender=['male','female','nonbinary','unspecified'].includes(input.gender)?input.gender:'unspecified'; const age=Number.isInteger(input.age)&&input.age>=13&&input.age<=120?input.age:null;
    await query('INSERT INTO users(id,email,display_name,phone,gender,age,role) VALUES(?,?,?,?,?,?,?)',[userId,email,displayName,phone,gender,age,accountType==='business'?'business_owner':'customer']);
    if(accountType==='business'){
      const businessId=uuid();
      await query('INSERT INTO businesses(id,owner_user_id,name,category,status) VALUES(?,?,?, ?,\'pending\')',[businessId,userId,businessName,businessCategory]);
      await query("INSERT INTO business_memberships(id,business_id,user_id,access_role) VALUES(?,?,?,'owner')",[uuid(),businessId,userId]);
    }
    const creds=await query('SELECT credential_id,transports FROM passkey_credentials WHERE user_id=?',[userId]);
    const wa=await webauthn(); const options=await wa.generateRegistrationOptions({rpName:RP_NAME,rpID:RP_ID,userName:email,userDisplayName:displayName,userID:new Uint8Array(Buffer.from(userId)),attestationType:'none',excludeCredentials:creds.map(c=>({id:c.credential_id,transports:c.transports?JSON.parse(c.transports):[]})),authenticatorSelection:{residentKey:'required',userVerification:'required'}});
    await query('INSERT INTO webauthn_challenges(id,challenge_hash,user_id,purpose,expires_at) VALUES(?,?,?,\'register\',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE))',[uuid(),hash(options.challenge),userId]);
    return send(res,200,options);
  }
  if(p==='/api/v1/auth/register/verify'&&req.method==='POST') {
    if(!rateLimit(req,'regverify',10)) return send(res,429,{error:'Too many attempts. Try again later.'});
    const credential=await bodyJson(req); const pending=await consumeChallenge(credential,'register');
    const wa=await webauthn(); const verified=await wa.verifyRegistrationResponse({response:credential,expectedChallenge:pending.challenge,expectedOrigin:publicUrl.origin,expectedRPID:RP_ID,requireUserVerification:true});
    if(!verified.verified||!verified.registrationInfo) return send(res,400,{error:'The device did not confirm passkey setup.'});
    const info=verified.registrationInfo; const stored=info.credential || {id:info.credentialID,publicKey:info.credentialPublicKey,counter:info.counter,transports:credential.response.transports||[]};
    await query('INSERT INTO passkey_credentials(id,user_id,credential_id,public_key,sign_count,transports) VALUES(?,?,?,?,?,?)',[uuid(),pending.userId,stored.id,Buffer.from(stored.publicKey),stored.counter,JSON.stringify(stored.transports||credential.response.transports||[])]);
    await issueSession(res,pending.userId); const rows=await query('SELECT id,email,display_name,phone,gender,age,role,preferred_language FROM users WHERE id=?',[pending.userId]);
    return send(res,201,{user:rows[0]});
  }
  if(p==='/api/v1/auth/login/options'&&req.method==='POST') {
    if(!rateLimit(req,'login')) return send(res,429,{error:'Too many attempts. Try again later.'});
    const {email}=await bodyJson(req); const rows=await query('SELECT id FROM users WHERE email=? LIMIT 1',[String(email||'').trim().toLowerCase()]);
    if(!rows.length) return send(res,404,{error:'No account found for that email.'});
    const credentials=await query('SELECT credential_id,transports FROM passkey_credentials WHERE user_id=?',[rows[0].id]); if(!credentials.length) return send(res,409,{error:'This account has no passkey. Contact support to recover it.'});
    const wa=await webauthn(); const options=await wa.generateAuthenticationOptions({rpID:RP_ID,userVerification:'required',allowCredentials:credentials.map(c=>({id:c.credential_id,transports:c.transports?JSON.parse(c.transports):[]}))});
    await query('INSERT INTO webauthn_challenges(id,challenge_hash,user_id,purpose,expires_at) VALUES(?,?,?,\'authenticate\',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE))',[uuid(),hash(options.challenge),rows[0].id]); return send(res,200,options);
  }
  if(p==='/api/v1/auth/login/verify'&&req.method==='POST') {
    if(!rateLimit(req,'loginverify',12)) return send(res,429,{error:'Too many attempts. Try again later.'});
    const credential=await bodyJson(req); const pending=await consumeChallenge(credential,'authenticate');
    const id=credential.id||credential.rawId; const rows=await query('SELECT id,credential_id,public_key,sign_count,transports FROM passkey_credentials WHERE user_id=? AND credential_id=? LIMIT 1',[pending.userId,id]);
    if(!rows.length) return send(res,401,{error:'Passkey not recognized.'}); const c=rows[0]; const wa=await webauthn();
    const result=await wa.verifyAuthenticationResponse({response:credential,expectedChallenge:pending.challenge,expectedOrigin:publicUrl.origin,expectedRPID:RP_ID,requireUserVerification:true,credential:{id:c.credential_id,publicKey:new Uint8Array(c.public_key),counter:Number(c.sign_count),transports:c.transports?JSON.parse(c.transports):[]}});
    if(!result.verified) return send(res,401,{error:'Passkey sign-in failed.'});
    await query('UPDATE passkey_credentials SET sign_count=?,last_used_at=UTC_TIMESTAMP() WHERE id=?',[result.authenticationInfo.newCounter,c.id]); await issueSession(res,pending.userId); const users=await query('SELECT id,email,display_name,phone,gender,age,role,preferred_language FROM users WHERE id=?',[pending.userId]); return send(res,200,{user:users[0]});
  }
  if(p==='/api/v1/auth/me'&&req.method==='GET') {const user=await currentUser(req);return user?send(res,200,{user}):send(res,401,{error:'Sign in first.'});}
  if(p==='/api/v1/auth/logout'&&req.method==='POST') {assertSameOrigin(req);const token=cookie(req,'style_session');if(token)await query('UPDATE sessions SET revoked_at=UTC_TIMESTAMP() WHERE token_hash=?',[hash(token)]);res.setHeader('Set-Cookie',sessionCookie('',0));return send(res,200,{ok:true});}
  return null;
}

async function api(req, res, url) {
  const p = url.pathname;
  if (p.startsWith('/api/v1/auth/')) {
    const handled = await authApi(req, res, p);
    if (handled !== null) return handled;
  }
  if (p === '/api/health' && req.method === 'GET') {
    let db='not_configured';
    if(pool){try{await pool.query('SELECT 1');db='connected'}catch{db='disconnected'}}
    return send(res, db==='connected'||db==='not_configured'?200:503, { ok:db==='connected', database:db });
  }
  if (p === '/api/v1/me/family-profiles' && req.method === 'GET') {
    const user=await requireUser(req,res,['customer']); if(!user)return;
    const profiles=await query('SELECT id,name,age,gender,created_at FROM family_profiles WHERE user_id=? ORDER BY created_at,id',[user.id]);
    return send(res,200,{profiles,limit:5});
  }
  if (p === '/api/v1/businesses/mine' && req.method === 'GET') {
    const user=await requireUser(req,res,['business_owner','staff','admin']); if(!user)return;
    const businesses=await query(`SELECT b.id,b.name,b.category,b.description,b.accepts_children,b.minimum_child_age,b.cancellation_hours,b.payment_mode,b.status,m.access_role FROM businesses b JOIN business_memberships m ON m.business_id=b.id WHERE m.user_id=? AND m.active=1 ORDER BY b.created_at`,[user.id]);
    return send(res,200,{businesses});
  }
  if (p === '/api/v1/me/bookings' && req.method === 'GET') {
    const user=await requireUser(req,res,['customer']); if(!user)return;
    const bookings=await query(`SELECT b.id,b.public_code,b.business_id,b.location_id,b.professional_id,b.service_id,b.starts_at,b.ends_at,b.price_cents,b.payment_status,b.booking_status,b.family_profile_id,s.name service_name,p.name professional_name,l.name location_name,l.city,biz.name business_name,biz.cancellation_hours FROM bookings b JOIN businesses biz ON biz.id=b.business_id JOIN services s ON s.id=b.service_id JOIN professionals p ON p.id=b.professional_id JOIN locations l ON l.id=b.location_id WHERE b.customer_user_id=? ORDER BY b.starts_at DESC LIMIT 100`,[user.id]);
    return send(res,200,{bookings});
  }
  const customerBookingMatch=p.match(/^\/api\/v1\/me\/bookings\/([0-9a-f-]{36})\/cancel$/i);
  if(customerBookingMatch&&req.method==='POST') {
    assertSameOrigin(req); const user=await requireUser(req,res,['customer']); if(!user)return;
    if(!rateLimit(req,'booking-cancel',12,60*60*1000))return send(res,429,{error:'Too many cancellation attempts. Please try again later.'});
    const connection=await pool.getConnection(); let result;
    try {
      await connection.beginTransaction();
      const [rows]=await connection.execute(`SELECT b.id,b.starts_at,b.booking_status,b.payment_status,biz.cancellation_hours FROM bookings b JOIN businesses biz ON biz.id=b.business_id WHERE b.id=? AND b.customer_user_id=? FOR UPDATE`,[customerBookingMatch[1],user.id]);
      if(!rows.length){await connection.rollback();return send(res,404,{error:'Appointment not found.'});}
      const booking=rows[0];
      if(booking.booking_status!=='confirmed'||sqlUtcMs(booking.starts_at)<=Date.now()){await connection.rollback();return send(res,409,{error:'Only future confirmed appointments can be cancelled.'});}
      if(booking.payment_status!=='not_required'){await connection.rollback();return send(res,409,{error:'This appointment has a payment record. Contact the shop; online refund handling is not available yet.'});}
      const late=sqlUtcMs(booking.starts_at)-Date.now()<Number(booking.cancellation_hours)*60*60*1000;
      await connection.execute("UPDATE bookings SET booking_status='cancelled' WHERE id=? AND customer_user_id=? AND booking_status='confirmed'",[booking.id,user.id]);
      await connection.commit(); result={cancelled:true,late,cancellation_hours:Number(booking.cancellation_hours),payment_collected:false};
    } catch(err) { await connection.rollback(); throw err; }
    finally { connection.release(); }
    return send(res,200,result);
  }
  if (p === '/api/v1/me/family-profiles' && req.method === 'POST') {
    assertSameOrigin(req); const user=await requireUser(req,res,['customer']); if(!user)return;
    const input=await bodyJson(req); const name=String(input.name||'').trim(); const age=Number(input.age); const gender=String(input.gender||'unspecified');
    if(name.length<1||name.length>100||String(input.age??'').trim()===''||!Number.isInteger(age)||age<0||age>120||!['male','female','nonbinary','unspecified'].includes(gender)) return send(res,400,{error:'Enter the family member’s name, age and gender.'});
    const id=uuid(); const connection=await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[user.id]);
      const [count]=await connection.execute('SELECT COUNT(*) total FROM family_profiles WHERE user_id=?',[user.id]);
      if(Number(count[0]?.total||0)>=5){await connection.rollback();return send(res,409,{error:'You can add up to five family profiles.'});}
      await connection.execute('INSERT INTO family_profiles(id,user_id,name,age,gender) VALUES(?,?,?,?,?)',[id,user.id,name,age,gender]);
      await connection.commit();
    } catch(err) { await connection.rollback(); throw err; }
    finally { connection.release(); }
    const rows=await query('SELECT id,name,age,gender,created_at FROM family_profiles WHERE id=? AND user_id=?',[id,user.id]);
    return send(res,201,{profile:rows[0]});
  }
  const familyProfileMatch=p.match(/^\/api\/v1\/me\/family-profiles\/([0-9a-f-]{36})$/i);
  if(familyProfileMatch&&req.method==='PATCH') {
    assertSameOrigin(req);const user=await requireUser(req,res,['customer']);if(!user)return;
    const input=await bodyJson(req);const name=String(input.name||'').trim();const age=Number(input.age);const gender=String(input.gender||'unspecified');
    if(name.length<1||name.length>100||String(input.age??'').trim()===''||!Number.isInteger(age)||age<0||age>120||!['male','female','nonbinary','unspecified'].includes(gender))return send(res,400,{error:'Enter the family member’s name, age and gender.'});
    const result=await query('UPDATE family_profiles SET name=?,age=?,gender=? WHERE id=? AND user_id=?',[name,age,gender,familyProfileMatch[1],user.id]);
    const rows=await query('SELECT id,name,age,gender,created_at FROM family_profiles WHERE id=? AND user_id=?',[familyProfileMatch[1],user.id]);
    return rows.length?send(res,200,{profile:rows[0]}):send(res,404,{error:'Family profile not found.'});
  }
  if(familyProfileMatch&&req.method==='DELETE') {
    assertSameOrigin(req);const user=await requireUser(req,res,['customer']);if(!user)return;
    const rows=await query('SELECT id FROM family_profiles WHERE id=? AND user_id=?',[familyProfileMatch[1],user.id]);if(!rows.length)return send(res,404,{error:'Family profile not found.'});
    await query('DELETE FROM family_profiles WHERE id=? AND user_id=?',[familyProfileMatch[1],user.id]);return send(res,200,{ok:true});
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
  const shopOptionsMatch=p.match(/^\/api\/v1\/shops\/([0-9a-f-]{36})\/booking-options$/i);
  if(shopOptionsMatch&&req.method==='GET'){
    const id=shopOptionsMatch[1];
    const businesses=await query("SELECT id,name,category,description,accepts_children,minimum_child_age,cancellation_hours,payment_mode,logo_url,cover_photo_url FROM businesses WHERE id=? AND status='active' LIMIT 1",[id]);
    if(!businesses.length)return send(res,404,{error:'Shop not found.'});
    const [locations,services,professionals]=await Promise.all([
      query('SELECT id,name,address,city,country_code,timezone,latitude,longitude,phone,photo_url FROM locations WHERE business_id=? AND active=1 ORDER BY name',[id]),
      query('SELECT id,name,description,audience,duration_minutes,price_cents FROM services WHERE business_id=? AND active=1 ORDER BY name',[id]),
      query('SELECT id,name,bio,photo_url FROM professionals WHERE business_id=? AND active=1 ORDER BY name',[id])
    ]);
    return send(res,200,{business:businesses[0],locations,services,professionals});
  }
  if(p==='/api/v1/availability'&&req.method==='GET'){
    const result=await getOpenSlots({serviceId:url.searchParams.get('service_id'),locationId:url.searchParams.get('location_id'),date:url.searchParams.get('date'),professionalId:url.searchParams.get('professional_id')||null});
    return send(res,200,{slots:result.slots,timezone:result.target.timezone,duration_minutes:result.target.duration_minutes});
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
    assertSameOrigin(req);const user=await requireUser(req,res,['customer']);if(!user)return;
    if(!rateLimit(req,'booking',8,60*60*1000))return send(res,429,{error:'Too many booking attempts. Please try again later.'});
    const input=await bodyJson(req);const serviceId=String(input.service_id||''),locationId=String(input.location_id||''),professionalId=String(input.professional_id||''),profileId=input.family_profile_id?String(input.family_profile_id):null,startsAt=String(input.starts_at||''),localDate=String(input.local_date||'');
    if(!validUuid(serviceId)||!validUuid(locationId)||!validUuid(professionalId)||!validLocalDate(localDate)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:00Z$/.test(startsAt)||(profileId&&!validUuid(profileId)))return send(res,400,{error:'Choose a valid appointment time and customer profile.'});
    const services=await query(`SELECT s.id,s.business_id,s.audience,s.duration_minutes,s.price_cents,b.accepts_children,b.minimum_child_age,b.cancellation_hours,b.payment_mode,b.status FROM services s JOIN businesses b ON b.id=s.business_id WHERE s.id=? AND s.active=1 LIMIT 1`,[serviceId]);
    const service=services[0];if(!service||service.status!=='active')return send(res,404,{error:'That service is no longer available.'});
    if(service.payment_mode!=='onsite')return send(res,409,{error:'This shop requires online payment. Booking is unavailable until its Stripe payment account is connected.'});
    let client={id:user.id,age:user.age,gender:user.gender};
    if(profileId){const profiles=await query('SELECT id,age,gender FROM family_profiles WHERE id=? AND user_id=? LIMIT 1',[profileId,user.id]);if(!profiles.length)return send(res,403,{error:'That family profile does not belong to your account.'});client={id:profileId,...profiles[0]};}
    if(client.age!==null&&client.age<18&&(!service.accepts_children||(service.minimum_child_age!==null&&client.age<service.minimum_child_age)))return send(res,400,{error:'This shop does not accept customers of this age for appointments.'});
    if((service.audience==='men'&&client.gender!=='male')||(service.audience==='women'&&client.gender!=='female'))return send(res,400,{error:'This service is not listed for the selected customer profile.'});
    const banned=await query('SELECT id FROM shop_bans WHERE business_id=? AND customer_user_id=? AND active=1 LIMIT 1',[service.business_id,user.id]);if(banned.length)return send(res,403,{error:'This shop cannot accept a booking from this account.'});
    const startDate=new Date(startsAt);if(Number.isNaN(startDate.valueOf()))return send(res,400,{error:'Choose a valid appointment time.'});
    const endDate=new Date(startDate.getTime()+Number(service.duration_minutes)*60000);const startsSql=startsAt.replace('T',' ').replace('Z','');const endsSql=endDate.toISOString().slice(0,19).replace('T',' ');
    const connection=await pool.getConnection();let bookingId,publicCode;
    try{
      await connection.beginTransaction();
      const [proRows]=await connection.execute('SELECT id FROM professionals WHERE id=? AND business_id=? AND active=1 FOR UPDATE',[professionalId,service.business_id]);
      if(!proRows.length){await connection.rollback();return send(res,400,{error:'Choose an active professional for this service.'});}
      const availability=await getOpenSlots({serviceId,locationId,date:localDate,professionalId});
      if(!availability.slots.some(s=>s.professional_id===professionalId&&s.starts_at===startsAt)){await connection.rollback();return send(res,409,{error:'That appointment time was just taken. Choose another time.'});}
      const [location]=await connection.execute('SELECT id FROM locations WHERE id=? AND business_id=? AND active=1',[locationId,service.business_id]);if(!location.length){await connection.rollback();return send(res,400,{error:'Choose an active shop location.'});}
      const [profileCheck]=profileId?await connection.execute('SELECT id FROM family_profiles WHERE id=? AND user_id=?',[profileId,user.id]):[[{id:user.id}]];if(!profileCheck.length){await connection.rollback();return send(res,403,{error:'That family profile does not belong to your account.'});}
      bookingId=uuid();publicCode=crypto.randomBytes(6).toString('hex').toUpperCase();
      await connection.execute("INSERT INTO bookings(id,public_code,customer_user_id,family_profile_id,business_id,location_id,professional_id,service_id,starts_at,ends_at,price_cents,payment_status,booking_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,'not_required','confirmed')",[bookingId,publicCode,user.id,profileId,service.business_id,locationId,professionalId,serviceId,startsSql,endsSql,service.price_cents]);
      await connection.commit();
    }catch(err){await connection.rollback();throw err;}finally{connection.release();}
    const rows=await query(`SELECT b.id,b.public_code,b.starts_at,b.ends_at,b.price_cents,b.booking_status,s.name service_name,p.name professional_name,l.name location_name,l.city FROM bookings b JOIN services s ON s.id=b.service_id JOIN professionals p ON p.id=b.professional_id JOIN locations l ON l.id=b.location_id WHERE b.id=?`,[bookingId]);
    return send(res,201,{booking:rows[0],cancellation_hours:service.cancellation_hours,payment_mode:'onsite'});
  }
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
