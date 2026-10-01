import NextAuth from 'next-auth';
import { authOptions } from '@/lib/infrastructure/auth';

const nextAuthFn =
  typeof NextAuth === 'function'
    ? NextAuth
    : typeof NextAuth?.default === 'function'
    ? NextAuth.default
    : typeof NextAuth?.default?.default === 'function'
    ? NextAuth.default.default
    : NextAuth;

const handler = nextAuthFn(authOptions);

export { handler as GET, handler as POST };
