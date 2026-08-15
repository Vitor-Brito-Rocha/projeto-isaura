# Orientação para o agente

O `README.md` cobre setup e as duas decisões que explicam o código.
O **`docs/PLANO.md` é a fonte da verdade** do produto: contexto, modelo de dados,
fases, armadilhas conhecidas e as decisões já tomadas com o usuário.
`docs/arquitetura.html` é a mesma coisa em versão navegável, para mostrar à professora.

## Estado

| Fase | Situação |
|---|---|
| 1 — Fundação multitenant e grade | feita (`8921d81`, `8ed4568`) |
| 2 — Os dois alarmes + casca PWA | feita (`aa71e52`, `37baa31`, `9c8dfdb`); falta só a verificação em aparelho real |
| 3 — Registro por texto | **em andamento** (`57f85a8`, `HEAD`) — falta cadastro de plano na UI, anexos e local-first |
| 4 — Voz e resumo padronizado | não começada |
| 5 — Progresso e histórico | não começada |
| 6 — Capacitor no Android | não começada (deixou de ser condicional) |

### O que já saiu da fase 3

1. ~~**`PlanoCurricular`**~~ — feito. `Unidade` pendura no plano, não na cadeira;
   `Cadeira.planoCurricularId` é nulável. Endpoints em `src/planos/`.
2. ~~**A rota `/aula/[id]` não existe**~~ — feito. `apps/web/src/app/aula/[id]/page.tsx` com os dois
   formulários, alimentada por `GET /registros/ocorrencia/:id`.

3. ~~**Cadastro de plano curricular na UI**~~ — feito. `/planos` (lista + criação) e
   `/planos/[id]` (unidades e tópicos). Vínculo turma↔plano no card de cada cadeira.

### O que falta na fase 3

- **Anexos** (foto/documento) e **escrita local-first** (IndexedDB + fila de sync). O local-first é
  requisito, não refinamento: é no fechamento que a rede falta.
- **Editar unidade/tópico** — hoje só criar e remover. Renomear exige apagar e recriar, o que
  perde o vínculo com registros que já cobriram aquele tópico. Os endpoints `PATCH` já existem.

### Pendências humanas (não são de código)

- ~~Gerar as chaves VAPID~~ e ~~colar as strings de conexão~~ — **feito**.
- **Criar a conta da professora e um plano curricular de verdade** para o select de unidades sair
  do vazio.
- Teste de relógio no aparelho real: aula terminando em ~3 min, confirmar que os dois pushes
  chegam. É o critério de aceite da fase 2; nenhum teste automatizado substitui.
- Pedir o plano de curso escrito da professora (ele existe) antes da fase 5 — o formato decide se
  a importação é parsing ou visão.

### Onde os `.env` moram

O real da API é **`apps/api/.env`**, não a raiz: `npm run --workspace apps/api` roda com
cwd = `apps/api`, e é de lá que `ConfigModule.forRoot()` e o Prisma leem. Um `.env` na raiz é
lido por ninguém. O `.env.example` fica na raiz só como documentação das variáveis.
O do front é `apps/web/.env.local`.

**Nunca ponha valor real em `.env.example`, que é versionado** — o `.gitignore` tem um
`!.env.example` explícito, então ele passa por cima da regra `.env` e é commitado.

### Testes de integração

Ficam pulados sem `TEST_DATABASE_URL`. Para rodar, aponte-o para o **session pooler** (5432) —
o mesmo valor de `DIRECT_URL`. Eles não fazem `TRUNCATE`: cada spec só apaga professores de id
sintético fixo (`prof-alarmes`, `prof-registros`…), então rodar contra o banco de desenvolvimento
não toca em dado real.

## Comandos

```bash
npm test              # 75 testes de API + 16 de web
npm run test:api      # inclui integração contra Postgres real
npm run dev:api       # http://localhost:3333/api
npm run dev:web       # http://localhost:3000
npm run prisma:push && npm run prisma:rls
```

Depois de mexer no `schema.prisma`: `prisma:generate` → `prisma:push` → `prisma:rls`.
**Tabela nova exige policy nova** em `apps/api/prisma/sql/enable-rls.sql` — o Prisma não
gera RLS, e uma tabela sem policy vaza entre contas sem erro nenhum.

## Convenções

**Domínio em português.** `Ocorrencia`, `Cadeira`, `RegistroAula`, `alarmeAbertura` — a professora
e o código falam a mesma língua. Só termos de infraestrutura ficam em inglês.

**`professorId` nunca vem do cliente.** Sempre do `@CurrentProfessor()`, que lê o JWT validado.
Aceitar do body ou da query seria vazamento entre contas com uma linha. O RLS é a segunda barreira,
não a primeira.

**Comentário explica *por quê*, não *o quê*.** O código já diz o que faz. Os comentários existentes
registram a razão de escolhas não óbvias (por que `timestamptz` e não `"HH:mm"`, por que rede larga
em vez de instante pré-calculado, por que o claim vem antes do envio) — seguir esse padrão.

**Hora.** `Ocorrencia` guarda a hora de parede (`horaInicio`, o que ela lê na grade) **e**
`inicioEm`/`fimEm` em `timestamptz`, derivados na materialização via `common/tz.ts`. Comparar
`"HH:mm"` como string quebra em silêncio para professores em outro fuso.

**Alarme ≠ notificação.** `lib/capacidade.ts` decide o que cada aparelho entrega de verdade, e a UI
avisa **antes** quando vai degradar. Prometer alarme que não toca é o pior desfecho do produto —
16 testes travam essa regra.

**Saída da IA é sempre rascunho.** `revisadoEm` nulo = não conta como registro. O histórico pode
virar prova de trabalho na frente da coordenação.

**Nome de aluno não entra** (dado pessoal de menor). Não é só instrução de prompt: `transcricaoBruta`
e o áudio existem só até a revisão e são descartados depois. Ver "LGPD" em `docs/PLANO.md`.
