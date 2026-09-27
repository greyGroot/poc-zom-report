/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_EE_CRM_AUTH_BYPASS: process.env.NEXT_PUBLIC_EE_CRM_AUTH_BYPASS ?? 'true',
  },
};

export default nextConfig;
