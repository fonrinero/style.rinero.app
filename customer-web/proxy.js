import { NextResponse } from 'next/server';

function contentSecurityPolicy(nonce, pathname) {
  const needsEval = process.env.NODE_ENV === 'development' || pathname === '/search';
  const evalPolicy = needsEval ? " 'unsafe-eval'" : '';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://maps.googleapis.com https://maps.gstatic.com${evalPolicy}`,
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com https://*.ggpht.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://google.com https://*.google.com https://*.googleusercontent.com",
    "frame-src https://*.google.com",
    'worker-src blob:',
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
  ].join('; ');
}

export function proxy(request) {
  const nonce = Buffer.from(globalThis.crypto.randomUUID()).toString('base64');
  const policy = contentSecurityPolicy(nonce, request.nextUrl.pathname);
  const requestHeaders = new Headers(request.headers);

  // Next.js reads this request CSP and adds the nonce to its generated scripts.
  requestHeaders.set('Content-Security-Policy', policy);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|woff2?)$).*)',
  ],
};
