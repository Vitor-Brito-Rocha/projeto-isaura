# Orientação para o agente

O `README.md` cobre setup e as duas decisões que explicam o código.
O **`docs/PLANO.md` é a fonte da verdade** do produto: contexto, modelo de dados,
fases, armadilhas conhecidas e as decisões já tomadas com o usuário.
`docs/arquitetura.html` é a mesma coisa em versão navegável, para mostrar à professora.

## Estado

| Fase | Situação |
|---|---|
| 1 — Fundação multitenant e grade | feita (`8921d81`, `8ed4568`); a **tela** de séries só chegou em `3670473` |
| 2 — Os dois alarmes + casca PWA | feita (`aa71e52`, `37baa31`, `9c8dfdb`); falta só a verificação em aparelho real |
| 3 — Registro por texto | feita (`57f85a8`…`eafd4e0`); falta só o teste de modo avião |
| 4 — Voz e resumo padronizado | **em andamento** (`HEAD`) — construída, **não verificada: conta Anthropic sem saldo** |
| 5 — Progresso e histórico | não começada |
| 6 — Capacitor no Android | não começada (deixou de ser condicional) |

### Fase 4 — o que existe

- **`src/ia/`** — `POST /ia/ocorrencia/:id/resumo` recebe a fala e devolve um rascunho.
  `resumo.prompt.ts` é puro e testado; `resumo.service.ts` faz a chamada.
- **O modelo nunca vê um uuid.** Unidades e tópicos vão numerados, e `aplicarResumo` traduz os
  números de volta. Número fora da lista simplesmente não existe — é o que impede alucinação de
  id de virar tópico marcado, um passo antes de `garantirTopicos`.
- **Ditado sem áudio** (`lib/ditado.ts`): Web Speech API onde existe, microfone do teclado onde
  não existe. Nenhum arquivo de áudio é criado — ver "Transcrição de áudio" em `docs/PLANO.md`
  para a decisão que falta se isso não bastar na sala.
- **Revisão = salvar.** `salvarFechamento` marca `revisadoEm`. Não há botão de "confirmar"
  separado: o rascunho vira registro no mesmo gesto que ela já fazia.
- **A fala e o resumo da IA são guardados para sempre** (decisão do usuário, 15/08/2026, revendo o
  PLANO): a dúvida sobre um registro aparece meses depois, e é aí que a auditoria serve. **Áudio,
  não** — `descartarAudios` continua rodando na revisão, porque voz é biométrico e de menor.

- **Dois provedores, um pipeline — e quem roda é a Groq.** `IA_PROVEDOR` escolhe entre `groq`
  (`openai/gpt-oss-120b`, gratuito, **o único verificado por chamada real**) e `anthropic`
  (`claude-haiku-4-5`, sem saldo na conta). O prompt, o `ESQUEMA` e `aplicarResumo` são os mesmos —
  só o transporte muda. O schema já nasceu compatível com o modo estrito da Groq (todo campo
  obrigatório, `additionalProperties: false`). Groq e não o free tier do Gemini **porque o Gemini
  grátis treina com o que você manda e a Groq não treina em nenhum plano** — e o que trafega é a
  fala da professora, que pode ter nome de aluno. Ver "Provedor de IA" em `docs/PLANO.md`.

### O que falta na fase 4

- **Uma chamada real que passe.** Nenhum dos dois caminhos foi exercitado ponta a ponta:
  - **Anthropic** — a chave autentica (chega na org e no workspace certos), mas toda chamada volta
    `400` de crédito. **A cobrança é checada antes da validação de parâmetros** — testei com um
    modelo inexistente e o erro é o mesmo —, então o schema, o `output_config.format` e a ausência
    de `effort` **ainda não foram aceitos por ninguém**.
  - **Groq** — falta a chave (`GROQ_API_KEY` em `apps/api/.env`, grátis em console.groq.com) e
    `IA_PROVEDOR="groq"`. O `response_format`/`strict` também não foi validado por ninguém ainda.

  Não tratar nenhum dos dois como funcionando até uma chamada real passar.
- **Comparar com 5 falas reais dela**, que é o critério de aceite da fase (PLANO, "Verificação").

### O que falta na fase 3

- **Teste de modo avião no aparelho** — preencher um fechamento offline, fechar o app, voltar
  online. É o critério de aceite da fase e nenhum teste automatizado substitui.

### Pendências humanas (não são de código)

- **Rodar a migração do `semestre`.** O código está pronto e o banco está uma coluna atrás — a
  classificação de permissão bloqueou tanto `prisma db push` quanto DDL pelo MCP do Supabase.
  Enquanto não rodar, **qualquer query de cadeira ou plano quebra** com
  "The column `cadeiras.semestre` does not exist", e dois testes de integração falham:

  ```bash
  npm run --workspace apps/api prisma:push
  ```

  Só acrescenta duas colunas anuláveis (`cadeiras.semestre`, `planos_curriculares.semestre`).
  Nenhuma tabela nova, então **não precisa de policy nova** e `prisma:rls` não muda.

- ~~Gerar as chaves VAPID~~, ~~colar as strings de conexão~~, ~~colar a chave de serviço do
  Storage~~ e ~~colar a chave da Anthropic~~ — **feito**.
- **Comprar crédito na conta da Anthropic.** A chave está no `.env` e autentica, mas a conta está
  zerada e nenhuma chamada passa. Bloqueia a fase 4 inteira.
- **Criar a conta da professora e um plano curricular de verdade.** Para *testar*, use
  `dados:teste` (6 cadeiras — uma delas de faculdade, com semestre e aula à noite —, histórico,
  duas turmas irmãs e dois alarmes plantados).
  Ele exige conta já criada — não cria conta nem senha — e só apaga o que tem id `decafbad-`.
  **Os ids que ele gera são uuid v4 de verdade**: a primeira versão usava `demo-u2` e a tela
  devolvia "unidadeId must be a UUID" no primeiro salvamento.
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

`common/teste-db.ts` acrescenta `connection_limit=1` à URL. O Jest roda ~7 arquivos em paralelo e
cada `PrismaClient` abriria `(cpus × 2 + 1)` conexões, contra um teto de 60 no pooler — com a API
de desenvolvimento também conectada, estoura.

**Instabilidade observada, causa não confirmada.** Houve rodadas com falhas em specs aleatórios que
passavam com `--runInBand` e depois pararam de aparecer; o `connection_limit` é precaução para a
hipótese mais provável, não um conserto comprovado. Se voltar a acontecer, **capture o log inteiro
antes de mexer** (`npx jest > /tmp/x.log 2>&1`) — foi justamente o que faltou para diagnosticar.

## Comandos

```bash
npm run --workspace apps/api dados:teste -- voce@exemplo.com   # popula uma conta EXISTENTE
npm test              # 97 testes de API + 37 de web
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

**Data na tela é sempre DD/MM/YYYY, e sempre por `lib/datas.ts`.** Nada de `toLocaleDateString`
solto em componente — havia três cópias divergentes e uma delas mostrava 14/08 para a aula do dia
15. Dia puro (`Ocorrencia.data`, `dataEntrega`) formata com `timeZone: 'UTC'`, porque é gravado à
meia-noite UTC e o fuso local o recuaria um dia; instante (log de erro) usa o fuso local, que é o
certo para "quando aconteceu". O ano vai junto: ela registra aula atrasada e consulta semestre
passado. O `<input type="date">` desenha no formato do SISTEMA e não dá para controlar — por isso a
tela escreve a data escolhida por extenso ao lado dele.

**Quem define a grade é ela, e por `lib/horarios.ts`.** Frequência e dias da semana vêm do painel
dentro da cadeira — nada é suposto. `PONTUAL` esconde os botões de dia de propósito: o dia É a data
escolhida, e perguntar as duas coisas deixa as respostas se contradizerem (a `RecorrenciaService`,
não achando horário para aquele dia, usa o primeiro da lista e a aula nasce no horário errado).

**Período letivo é `lib/periodo.ts`, nunca `anoLetivo` cru na tela.** Faculdade divide por semestre
("2026.1"), escola básica não. Por isso `semestre` é anulável **ao lado** do ano em vez de
substituí-lo: um "1º ou 2º semestre?" obrigatório seria pergunta sem resposta para quem dá aula no
8º ano. `semestreDoCampo('')` devolve `undefined` e não `0` — `Number('')` é 0, e 0 bateria no
`@Min(1)` da API como erro de validação em vez de "não informado".

**Alarme ≠ notificação.** `lib/capacidade.ts` decide o que cada aparelho entrega de verdade, e a UI
avisa **antes** quando vai degradar. Prometer alarme que não toca é o pior desfecho do produto —
16 testes travam essa regra.

**Saída da IA é sempre rascunho.** `revisadoEm` nulo = não conta como registro. O histórico pode
virar prova de trabalho na frente da coordenação. Quem preenche `revisadoEm` é `salvarFechamento`,
e só ele — gerar um resumo *zera* a marca, porque o que está na tela voltou a ser saída de modelo.

**Chave de terceiro nunca vai para o navegador.** `ANTHROPIC_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY`
existem só dentro de `ResumoService` e `StorageService`. É por isso que upload e resumo passam pela
API em vez de o front falar direto com o serviço.

**Nome de aluno não entra no REGISTRO** (dado pessoal de menor). Não é só instrução de prompt: o
JSON schema de saída não tem campo de pessoa, então não há onde um nome caber mesmo se o modelo
desobedecer. A fala dela (`transcricaoBruta`) pode conter nome e **é guardada** — só ela vê. Áudio
é descartado na revisão. Ver "LGPD" em `docs/PLANO.md`.

**Registrar não tem janela de tempo.** Os 5 minutos de antecedência/atraso são só quando o *alarme
toca*; `salvarAbertura` e `salvarFechamento` nunca olharam o relógio. `GET /agenda/pendencias` é a
porta de quem não conseguiu escrever na hora — sem ela, registrar a terça passada exigia lembrar a
data e voltar semana a semana na grade.

**Admin é `ADMIN_EMAIL`, não coluna no banco.** `AdminGuard` compara o email do JWT com a variável
de ambiente. Uma flag `ehAdmin` no `Professor` estaria a um `UPDATE` de virar escalação de
privilégio, e o `ErrosService` já escolhe quem alertar por este mesmo caminho.
