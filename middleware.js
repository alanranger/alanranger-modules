import { NextResponse } from 'next/server';

const ALLOWED_ORIGIN = process.env.EXAMS_API_ORIGIN || 'https://www.alanranger.com';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Memberstack-Id',
    Vary: 'Origin',
  };
}

function hasAuthEvidence(request) {
  const auth = request.headers.get('authorization') || '';
  const memberId = request.headers.get('x-memberstack-id') || '';
  const cookie = request.headers.get('cookie') || '';
  if (auth.startsWith('Bearer ') && auth.slice(7).trim()) return true;
  if (memberId.trim()) return true;
  if (/(^|;\s*)_ms-mid=/.test(cookie)) return true;
  return false;
}

/**
 * COST SAFEGUARD: reject unauthenticated /api/exams/whoami at the Edge
 * so the Node serverless function is never invoked (stops Function Invocation billing).
 */
export function middleware(request) {
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
  }

  if (!hasAuthEvidence(request)) {
    return NextResponse.json(
      { error: 'Not logged in' },
      { status: 401, headers: corsHeaders() }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/exams/whoami',
};
