/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone' solo cuando se hace build para Electron (reduce el bundle)
  ...(process.env.ELECTRON_BUILD === '1' ? { output: 'standalone' } : {}),

  experimental: {
    // sharp/geotiff son nativos / resueltos dinámicamente: no bundlearlos con
    // webpack y resolverlos en runtime desde node_modules.
    serverComponentsExternalPackages: ['sharp', 'geotiff'],
    // CRÍTICO (build desktop): el file-tracing de Next NO incluye solo los
    // binarios nativos de sharp (@img/sharp-*). Sin esto, en la app empaquetada
    // `require('sharp')` falla y /api/orthophoto/process devuelve 500 siempre.
    // Forzamos su inclusión en .next/standalone.
    outputFileTracingIncludes: {
      '/api/orthophoto/process': [
        './node_modules/sharp/**/*',
        './node_modules/@img/**/*',
        './node_modules/geotiff/**/*',
      ],
    },
  },

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
