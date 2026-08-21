# Projeto Isaura

Registro de aulas com alarmes, para professores com muitas turmas.

O sistema cadastra séries de aulas com horários padrão, materializa cada aula
concreta e dispara **dois alarmes por aula**: um pouco antes do início (o que ela
planeja dar) e pouco depois do fim (o que de fato deu, unidade, atividade de
casa, plano da próxima). O registro pode ser por texto ou por voz — nesse caso a
IA normaliza a fala num resumo padronizado.

- **Front:** Next.js (App Router) — `apps/web`
- **Back:** NestJS + Prisma — `apps/api`
- **Banco/Auth/Storage:** Supabase
- **Multitenant** por `professorId` desde o primeiro commit

## Pré-requisitos

- Node 22+
- Um projeto no [Supabase](https://supabase.com)

## Começando

```bash
npm install
cp .env.example apps/api/.env        # DATABASE_URL, DIRECT_URL, SUPABASE_*, VAPID_*
cp apps/web/.env.example apps/web/.env.local

npx web-push generate-vapid-keys     # cole o par no .env da API e a pública no do web

npm run prisma:generate
npm run prisma:push                  # cria o schema no banco
npm run prisma:rls                   # habilita Row Level Security

npm run dev:api                      # API em http://localhost:3333/api
npm run dev:web                      # Web em http://localhost:3000
```

Health check: `GET http://localhost:3333/api/health` — ele toca o banco de
propósito, então fica vermelho se o Postgres estiver fora.

**Sem as chaves VAPID a API sobe e tudo funciona, menos o envio de push** — é
degradação deliberada, para uma configuração faltando não virar indisponibilidade.
O log avisa no boot.

## Estrutura

```
apps/
  api/   # NestJS + Prisma (schema em apps/api/prisma/schema.prisma)
  web/   # Next.js PWA
```

## Duas decisões que explicam o resto do código

### 1. Alarme e notificação são coisas diferentes

Um PWA **não** consegue dar alarme — consegue dar notificação forte. Alarme fura
o silencioso e toma a tela; notificação respeita o modo silencioso. Só o sistema
operacional dá alarme, e só para app instalado.

Por isso `IntensidadeAlarme` é uma **intenção**, não uma garantia. Ela degrada
por plataforma:

| Intensidade   | Android + wrapper        | Android navegador     | iPhone                |
| ------------- | ------------------------ | --------------------- | --------------------- |
| `SILENCIOSO`  | só histórico             | só histórico          | só histórico          |
| `NOTIFICACAO` | completo                 | vibração própria      | som/vibração do SO    |
| `ALARME`      | fura silencioso, tela cheia | rebaixa p/ notificação | rebaixa p/ notificação |

**A interface tem de avisar na hora** quando `ALARME` vai chegar rebaixado. O
pior desfecho deste produto é a professora confiar num alarme que nunca toca e
perder o registro de uma aula.

### 2. Hora de parede e instante absoluto são coisas diferentes

A grade guarda hora de parede (`horaInicio = "07:00"`) porque é o que ela lê e
edita. Mas o cron compara **instantes** (`inicioEm`, `fimEm`, `timestamptz`),
derivados na materialização a partir da timezone do professor.

A razão é o multitenant: o Brasil não tem um fuso só (Acre é UTC−5, Fernando de
Noronha UTC−2). Comparar `"07:00"` como string funciona até o primeiro professor
de Rio Branco se cadastrar — e aí falha em silêncio, disparando o alarme na hora
errada sem erro nenhum no log. Ver `src/common/tz.ts`.

## Multitenant

- `Professor.id` **é** o `auth.uid()` do Supabase.
- Toda tabela de domínio carrega `professorId` com `onDelete: Cascade`.
- O guard `SupabaseJwtGuard` é **global**: rota nova nasce fechada, e abrir exige
  `@Public()` explícito.
- `professorId` vem sempre do decorator `@CurrentProfessor()`, **nunca** do body
  ou da query.
- RLS (`prisma/sql/enable-rls.sql`) é a segunda barreira, para os acessos que
  passam pelo PostgREST do Supabase em vez do nosso código.

## Testes

```bash
npm test                             # api + web

# Os testes de integração pulam sozinhos sem banco. Para rodá-los:
TEST_DATABASE_URL=postgresql://... npm run test:api
```

A cobertura mira a lógica que falha **em silêncio**, que é a que morde neste
produto: conversão de fuso (incluindo borda de horário de verão), geração de
recorrência (quinzenal ancorada, mensal, janelas parciais), janelas e claim
atômico dos alarmes, herança campo a campo da config, e a degradação de
intensidade por plataforma.

Os **dois deploys rodam esta suíte**, e param se algo falhar: o
`apps/api/Dockerfile` antes do `nest build`, e o `build` do `apps/web` antes do
`next build`. Não há CI separado no caminho — esses são os portões, e é por isso
que eles vivem dentro dos builds em vez de num workflow ao lado.

## Ícones

São gerados por script, não commitados como blobs opacos:

```bash
npm run icones --workspace apps/web
```

O motivo de serem PNG e não SVG: o Chrome no Android não decodifica SVG em
`icon`/`badge` de notificação de forma confiável, e o sintoma é silencioso — cai
no ícone padrão do sistema sem erro nenhum.

## Status

- [x] **Fase 1 — Fundação e grade.** Monorepo, auth Supabase, escolas, cadeiras,
      séries, horários, materialização de ocorrências, agenda, RLS.
- [x] **Fase 2 — Os dois alarmes.** Crons de abertura/fechamento com minutos
      configuráveis, web push com VAPID, service worker, config de intensidade
      por cadeira, casca web (login, grade da semana, cadeiras, ajustes).
- [ ] **Fase 3 — Registro por texto.** Unidades, tópicos, atividade de casa,
      anexos, encadeamento do plano da próxima aula, escrita local-first.
- [ ] **Fase 4 — Voz e resumo padronizado.** Gravação, transcrição, normalização
      com Claude, revisão lado a lado.
- [ ] **Fase 5 — Progresso e histórico.** Painel por cadeira/unidade, busca,
      exportação.
- [ ] **Fase 6 — Capacitor, se precisar.** Alarme real no Android — condicional:
      só se a fase 2 mostrar que notificação pura não basta.
