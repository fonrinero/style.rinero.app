import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_ORIGIN = process.env.STYLE_API_BASE_URL || 'http://127.0.0.1:3200';
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_BODY_BYTES = 32 * 1024;

async function limitedBody(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

async function proxy(request, context) {
  if (!METHODS.has(request.method)) return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 });
  const { path = [] } = await context.params;
  const safePath = path.map((part) => encodeURIComponent(part)).join('/');
  const target = new URL(`/api/v1/${safePath}${new URL(request.url).search}`, API_ORIGIN);
  const headers = new Headers();
  for (const name of ['accept', 'authorization', 'content-type', 'cookie', 'origin', 'user-agent', 'x-style-client']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await limitedBody(request);
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual'
    });
    const responseHeaders = new Headers();
    for (const name of ['content-type', 'cache-control', 'x-content-type-options', 'referrer-policy']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    const cookies = upstream.headers.getSetCookie?.() || (upstream.headers.get('set-cookie') ? [upstream.headers.get('set-cookie')] : []);
    for (const cookie of cookies) responseHeaders.append('set-cookie', cookie);
    responseHeaders.set('cache-control', 'no-store');
    return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: responseHeaders });
  } catch (err) {
    if (err.status === 413) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
    return NextResponse.json({ error: 'The account service is temporarily unavailable.' }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
