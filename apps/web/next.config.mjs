/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * O navegador nunca fala com a API diretamente — só com a origem do Next,
   * que repassa. Duas razões, e a segunda é a que morde:
   *
   * 1. A API deixa de precisar ser porta pública. Em produção ela pode ficar
   *    numa rede interna, e o único endereço exposto é o do front.
   * 2. O cookie de sessão é `SameSite=Lax`. Com front e API em domínios
   *    diferentes (Vercel + Railway, por exemplo) isso vira cross-site e o
   *    navegador NÃO manda o cookie — o login não persistiria, sem erro
   *    visível na tela. Passando por aqui tudo é same-origin e `Lax` volta a
   *    valer. De quebra some o preflight de CORS a cada chamada.
   *
   * `API_INTERNAL_URL` é lida no servidor (sem `NEXT_PUBLIC_`): é como o Next
   * alcança a API, e nunca chega ao navegador.
   */
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? 'http://localhost:3333';
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },

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
