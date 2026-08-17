/**
 * Dois builds saem deste mesmo código.
 *
 * O do NAVEGADOR é servido pelo Next, que faz proxy da API e devolve headers.
 * O do WRAPPER (`APP_NATIVO=1`) vira arquivos estáticos empacotados no APK:
 * dentro da WebView não existe servidor Next, então `rewrites()` e `headers()`
 * simplesmente não são executados por ninguém.
 */
const nativo = process.env.APP_NATIVO === '1';

/**
 * No wrapper, `NEXT_PUBLIC_API_URL` PRECISA ser absoluta.
 *
 * O padrão de `lib/api.ts` é `/api`, que no navegador cai no proxy abaixo. Na
 * WebView a página é servida de `https://localhost`, então `/api` resolveria
 * para `https://localhost/api` — um endereço que não existe. O app instalaria,
 * abriria e falharia em toda chamada, e o sintoma na tela seria "erro de rede",
 * não "configuração faltando". Falhar no build é a única hora barata de achar
 * isso: depois é APK publicado.
 */
if (nativo) {
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api || !/^https?:\/\//.test(api)) {
    throw new Error(
      'APP_NATIVO=1 exige NEXT_PUBLIC_API_URL absoluta (ex.: https://api.seudominio.com/api). ' +
        `Recebido: ${api ?? '(vazia)'}. Sem isso o APK sobe sem alcançar a API.`,
    );
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  ...(nativo
    ? {
        output: 'export',
        // Sem servidor não há otimização de imagem sob demanda.
        images: { unoptimized: true },
        // Cada rota vira `pasta/index.html`. Sem isto, a WebView pede `/aula`
        // e não acha arquivo — o carregamento por caminho de arquivo não tem
        // o fallback que um servidor HTTP daria.
        trailingSlash: true,
      }
    : {
        /**
         * O navegador nunca fala com a API diretamente — só com a origem do
         * Next, que repassa. Duas razões, e a segunda é a que morde:
         *
         * 1. A API deixa de precisar ser porta pública. Em produção ela pode
         *    ficar numa rede interna, e o único endereço exposto é o do front.
         * 2. O cookie de sessão é `SameSite=Lax`. Com front e API em domínios
         *    diferentes (Vercel + Railway, por exemplo) isso vira cross-site e o
         *    navegador NÃO manda o cookie — o login não persistiria, sem erro
         *    visível na tela. Passando por aqui tudo é same-origin e `Lax` volta
         *    a valer. De quebra some o preflight de CORS a cada chamada.
         *
         * `API_INTERNAL_URL` é lida no servidor (sem `NEXT_PUBLIC_`): é como o
         * Next alcança a API, e nunca chega ao navegador.
         *
         * É exatamente este proxy que o wrapper NÃO tem — por isso a frente de
         * auth cross-origin da fase 6 existe. Ver "Fase 6" em `docs/PLANO.md`.
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
      }),
};

export default nextConfig;
