/**
 * URL do banco para os testes de integração, com o pool contido.
 *
 * O Jest roda ~7 arquivos em paralelo e cada `PrismaClient` abre
 * `(cpus × 2 + 1)` conexões por padrão. O pooler do Supabase tem teto de 60, e
 * com a API de desenvolvimento também conectada isso estoura — a falha aparece
 * como erro de query em specs aleatórios, que parece bug de lógica e some ao
 * rodar de novo. Cada spec é sequencial dentro de si, então uma conexão basta.
 *
 * Devolve `undefined` quando `TEST_DATABASE_URL` não está definido, que é o
 * sinal para os specs se pularem.
 */
export function urlDeTeste(): string | undefined {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return undefined;
  if (url.includes('connection_limit')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=1`;
}
