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
| 3 — Registro por texto | **próxima** |
| 4 — Voz e resumo padronizado | não começada |
| 5 — Progresso e histórico | não começada |
| 6 — Capacitor no Android | não começada (deixou de ser condicional) |

### Onde a fase 3 começa

1. **`PlanoCurricular`** — hoje `Unidade` pendura em `cadeiraId`, o que faria a professora digitar
   o mesmo plano de Matemática uma vez por turma. Ver "Correção pendente" em `docs/PLANO.md`.
2. **A rota `/aula/[id]` não existe.** `alarmes.service.ts` já manda
   `url: /aula/${oc.id}?momento=abertura|fechamento` no payload do push, e o service worker abre
   esse link no clique — então hoje **um alarme clicado cai em 404**.

### Pendências humanas (não são de código)

- Gerar as chaves VAPID e colocá-las em `.env` (raiz) e `apps/web/.env.local`.
  **Nunca em `.env.example`, que é versionado** — o `.gitignore` tem um `!.env.example` explícito.
- Teste de relógio no aparelho real: aula terminando em ~3 min, confirmar que os dois pushes
  chegam. É o critério de aceite da fase 2; nenhum teste automatizado substitui.
- Pedir o plano de curso escrito da professora (ele existe) antes da fase 5 — o formato decide se
  a importação é parsing ou visão.

## Comandos

```bash
npm test              # 65 testes de API + 16 de web
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
