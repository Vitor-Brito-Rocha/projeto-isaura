/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // O service worker precisa de escopo raiz para receber push de
        // qualquer rota. Sem este header o navegador limita o escopo ao
        // diretório do arquivo, e o push só chegaria em /sw.js.
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
