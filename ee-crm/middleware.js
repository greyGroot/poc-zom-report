import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        if (process.env.NEXT_PUBLIC_EE_CRM_AUTH_BYPASS === 'true') {
          return true;
        }
        return !!token;
      },
    },
    pages: {
      signIn: '/login',
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api/auth (NextAuth API routes)
     * - api/health (Health check endpoint)
     * - login, uk/login, pl/login (Login pages)
     * - _next/static, _next/image (Static assets)
     * - favicon.ico, icons, images
     */
    '/((?!api/auth|api/health|login|uk/login|pl/login|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
