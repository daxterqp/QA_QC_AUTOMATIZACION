/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone' solo cuando se hace build para Electron (reduce el bundle)
  ...(process.env.ELECTRON_BUILD === '1' ? { output: 'standalone' } : {}),

  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false, // requerido por react-pdf / pdfjs-dist
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
