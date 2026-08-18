#!/bin/sh
# Roda a cada boot do container — inclusive num restart avulso, não só num
# deploy novo. Os dois passos abaixo são repetíveis: sem diferença a fazer,
# são no-op rápido.
#
# Por que aqui e não num passo de CI: a API sobe pelo EasyPanel direto do
# Dockerfile, sem GitHub Actions no caminho. Um passo de CI rodaria em paralelo
# com o build, sem garantia de ordem. Aqui, dentro do próprio boot, é
# IMPOSSÍVEL a API subir com o banco atrás do schema.
#
# set -e é fail-closed de propósito: se qualquer passo falhar, o container nunca
# chega a escutar tráfego, o healthcheck nem entra em jogo, e o EasyPanel mantém
# o container anterior servindo. Melhor não subir do que subir errado.
set -e

if [ -z "$DIRECT_URL" ]; then
  echo "[entrypoint] DIRECT_URL não definida — ela é a conexão direta (5432), sem o pooler." >&2
  echo "[entrypoint] DDL pelo pgbouncer em modo transaction falha de formas confusas." >&2
  exit 1
fi

# 1. Schema. `db push` diffa o schema.prisma contra o banco e aplica o que
#    faltar. Sem --accept-data-loss e sem TTY, ele RECUSA qualquer mudança que
#    apagaria dado — nunca destrutivo por acidente num boot automático.
echo "[entrypoint] Sincronizando schema (prisma db push)…"
npx prisma db push --skip-generate --schema apps/api/prisma/schema.prisma

# 2. RLS. O Prisma não gera policy nenhuma, e tabela nova sem policy vaza entre
#    contas sem erro nenhum — é o tipo de falha que só aparece quando já
#    aconteceu. O arquivo é idempotente por construção (todo CREATE POLICY vem
#    depois de um DROP POLICY IF EXISTS), então repetir a cada boot é seguro.
#    Vai pela DIRECT_URL: DDL não passa bem pelo pooler.
echo "[entrypoint] Aplicando RLS (enable-rls.sql)…"
npx prisma db execute --url "$DIRECT_URL" --file apps/api/prisma/sql/enable-rls.sql

echo "[entrypoint] Banco em dia — iniciando a API…"
exec node apps/api/dist/main.js
