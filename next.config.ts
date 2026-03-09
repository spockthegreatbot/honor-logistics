import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  serverExternalPackages: ['pdf-parse', 'imapflow', 'mailparser'],
}

export default nextConfig
