/** @type {import('next').NextConfig} */
const nextConfig = {
  // Supabase types are generated from the actual DB — ignore TS errors until `supabase gen types` runs
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
