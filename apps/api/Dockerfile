# Contexto de build: a RAIZ do monorepo (é um workspace npm — o package-lock
# mora lá, e `npm ci` sem ele instala versões diferentes das testadas).
#
# No EasyPanel: Build Path = "." (raiz), Dockerfile Path = "apps/api/Dockerfile".
#
# Debian slim e não alpine: o engine do Prisma precisa de libssl, e a alpine não
# traz a versão que ele espera — o erro aparece só em runtime ("Prisma engines
# do not seem to be compatible with your system"), depois de o build passar.
# Instalar openssl nos DOIS estágios corta isso pela raiz.

FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Manifests primeiro: enquanto as dependências não mudam, o Docker reaproveita
# esta camada e o build não baixa nada.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci

COPY apps/api apps/api
RUN npm run prisma:generate --workspace apps/api

# O portão. Não existe CI entre o commit e a VPS: o EasyPanel constrói ESTA
# imagem direto do repositório, então este `RUN` é o único lugar onde um teste
# vermelho consegue impedir um deploy. Falhando, o build para aqui, a imagem
# nova nunca nasce e o EasyPanel mantém a anterior servindo — mesma regra
# fail-closed do `docker-entrypoint.sh`.
#
# Antes do `nest build` de propósito: a regressão de lógica é o que este passo
# existe para pegar, e ela aparece em 8 segundos em vez de depois da compilação
# inteira. Erro de tipo em arquivo que nenhum spec importa continua sendo do
# `nest build` logo abaixo — os dois gates se completam, não se repetem.
#
# Os 69 testes de integração se PULAM aqui, porque o build não tem
# `TEST_DATABASE_URL` — e não pode ter: eles apagam professores de id sintético,
# e um build que escreve no banco de produção é pior que build nenhum. O
# `.dockerignore` já barra `**/.env`, então a variável não entra por acidente.
RUN npm run test --workspace apps/api

RUN npm run build --workspace apps/api

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Node usa o ICU embutido, então isto não muda a interpretação dos horários das
# aulas (quem faz isso é `Professor.timezone`, por `common/tz.ts`) — muda o
# carimbo dos logs, de UTC para o horário de Brasília, que é o que se lê quando
# ela diz "o alarme não chegou às 7h".
ENV TZ=America/Sao_Paulo
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/apps/api/dist ./apps/api/dist
# `prisma/` inteiro, e não só o schema: o entrypoint roda o
# `prisma/sql/enable-rls.sql` daqui.
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
RUN chmod +x ./apps/api/docker-entrypoint.sh

# Documentação da imagem — quem decide de fato é `API_PORT`, e o healthcheck
# abaixo lê essa variável.
EXPOSE 3334

# Diz ao Docker quando o container está PRONTO, não só "processo no ar". Sem
# isto o EasyPanel derruba o container antigo assim que o novo escuta a porta,
# e o intervalo em que o Nest ainda está montando módulos vira 502 na cara dela.
# Bate em /api/health, que toca o banco de propósito.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "const p=process.env.API_PORT||3333;require('http').get('http://127.0.0.1:'+p+'/api/health',r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

ENTRYPOINT ["./apps/api/docker-entrypoint.sh"]
