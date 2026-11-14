import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_ORIGIN = process.env.STYLE_API_BASE_URL || 'http://127.0.0.1:3200';
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

async function proxy(request, context) {
  if (!METHODS.has(request.method)) return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 });
  const { path = [] } = await context.params;
  const safePath = path.map((part) => encodeURIComponent(part)).join('/');
  const target = new URL(`/api/v1/${safePath}${new URL(request.url).search}`, API_ORIGIN);
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'cookie', 'origin', 'user-agent', 'x-forwarded-for']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      cache: 'no-store',
      redirect: 'manual'
    });
    const responseHeaders = new Headers();
    for (const name of ['content-type', 'set-cookie', 'cache-control', 'x-content-type-options', 'referrer-policy']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set('cache-control', 'no-store');
    return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: 'The account service is temporarily unavailable.' }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
