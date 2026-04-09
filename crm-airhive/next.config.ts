import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/clientes',
        destination: '/empresas?view=leads',
        permanent: false,
      },
      {
        source: '/clientes/:path*',
        destination: '/empresas?view=leads',
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'skkjexpbbfmcuxyoodmo.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
