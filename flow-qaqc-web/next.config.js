/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite importar desde lib/ y hooks/ con alias absolutos
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'uimlobhczjctoytejkgh.supabase.co',
      },
    ],
  },
};

module.exports = nextConfig;
