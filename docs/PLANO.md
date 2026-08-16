# projeto-isaura — Sistema de registro de aulas com alarmes

## Context

Uma professora com **11 cadeiras** precisa de um sistema que a lembre, em cada aula, de registrar
o que planejou e o que de fato deu. Hoje ela perde esse registro porque não há gatilho — quando
lembra, a informação já esfriou.

O sistema cadastra séries de aulas com horários padrão, materializa ocorrências datadas e dispara
**dois alarmes por aula**: um pouco antes do início (o que planeja dar) e pouco depois do fim (o
que deu, unidade, atividade de casa, plano da próxima). Ela registra por texto ou por voz, e a IA
normaliza a fala num resumo padronizado — o diferencial do produto, porque 11 cadeiras geram
dezenas de textos que precisam ser comparáveis entre si.

Repo: `/home/user/projeto-isaura`, branch `claude/teacher-class-management-system-p9dulm`.
Peças transplantadas de `Vitor-Brito-Rocha/projeto-professor` (clonado em
`/workspace/projeto-professor` @ `2d94119`).

### Estado atual — fase 1 entregue (`8921d81`, `8ed4568`)

API NestJS + Prisma no ar: escolas, cadeiras, séries recorrentes, materialização de ocorrências,
agenda, auth Supabase, guard global, RLS, cron noturno de geração. 35 testes (15 de integração
contra Postgres real). Verificado de ponta a ponta: schema aplicado, RLS executado, API subindo e
respondendo.

Duas divergências deliberadas do plano original, ambas confirmadas por teste:

- **`Ocorrencia` guarda `inicioEm`/`fimEm` como `timestamptz`**, além da hora de parede. O
  projeto-professor compara `"HH:mm"` como string com janela de 2 min; isso só funciona com um fuso
  só, e o produto é multitenant (Acre é UTC−5, Noronha UTC−2). Teste de integração com duas
  professoras em fusos diferentes cadastrando `07:00` prova a diferença.
- **Padrões de alarme moram no `Professor`**, e `ConfigAlarme` só existe como override por cadeira
  com campos nuláveis. Uma linha "global" com `cadeiraId` nulo não é enforçável por UNIQUE no
  Postgres (NULLs são distintos), então nada impediria duas linhas globais.

**Ainda não existe `apps/web`.** A grade existe na API mas não numa tela.

### Decisões já tomadas com o usuário
1. **Repo novo**, transplantando peças do projeto-professor (não fork — metade daquele projeto é
   cobrança/recibo/PIX/Stripe/aulão/equipe e não serve aqui).
2. **A professora escolhe a intensidade do alarme por aula** (silencioso / notificação / alarme).
3. **Os dois aparelhos**, não um. Android ganha o wrapper Capacitor (alarme real); iOS fica no PWA
   com degradação honesta. A fase 6 deixa de ser condicional — *"o sistema não precisa se voltar só
   pra professora"*.
4. **Multitenant desde o dia 1** — é produto para vários professores, não ferramenta de uma pessoa.
   A Isaura é a primeira usuária e a fonte dos requisitos, não a única.
5. **Nome de aluno não entra.** Ver "LGPD" abaixo — a decisão não é só de prompt, decide retenção
   de áudio e transcrição.
6. **11 cadeiras = 11 turmas**, agrupadas em poucas disciplinas (ex.: 2 turmas de uma, 4 de outra).
   Consequência de modelagem na seção seguinte.

---

## Restrição que define a arquitetura

**Um PWA não dá alarme. Dá notificação forte.** A diferença é de categoria, não de grau: alarme
fura o silencioso e ocupa a tela; notificação respeita o modo silencioso. Só o SO dá alarme, e só
para app instalado.

- A `Notification Triggers API` (`TimestampTrigger`) resolveria isso pelo navegador, mas ficou em
  origin trial no Chrome e nunca foi para o estável. Não dá para contar com ela.
- No **iOS** não existe caminho para alarme real (exigiria entitlement *Critical Alerts* da Apple,
  concedido praticamente só para saúde/segurança).
- No **Android** dá, via wrapper Capacitor com canal de notificação categoria alarme +
  full-screen intent.

Consequência de design: `intensidade` é uma **intenção** que degrada por plataforma, e a UI tem
que dizer isso na hora — se ela marcar `ALARME` num iPhone, a tela avisa que vai chegar como
notificação. Nunca prometer o que não entrega; o pior desfecho é ela confiar num alarme que não
toca.

| Intensidade | Android + wrapper | Android navegador | iPhone |
|---|---|---|---|
| `SILENCIOSO` | só histórico | só histórico | só histórico |
| `NOTIFICACAO` | completo | vibração própria, som do sistema | som/vibração do sistema |
| `ALARME` | fura silencioso, tela cheia | rebaixa p/ notificação | rebaixa p/ notificação |

### Motor de alarmes — duas camadas, mas só uma existe sem o wrapper

O desenho é de duas camadas, porque nenhuma sozinha é confiável: servidor não alcança celular sem
rede; dispositivo não sabe de aula remarcada enquanto o app não abre.

1. **Agenda local no aparelho** — agenda notificações locais dos próximos ~14 dias. Dispara
   offline, no horário exato.
2. **Cron por minuto no NestJS** — varre alarmes vencendo e manda web push. Cobre celular
   reiniciado, desktop, app semanas sem abrir.

> ⚠️ **A camada 1 não existe em PWA puro.** Agendar notificação local pelo navegador exigiria a
> Notification Triggers API, que morreu em origin trial. Ou seja: **até a fase 6, só existe a
> camada 2.** Consequência prática, que vale dizer para a professora antes de ela confiar no
> sistema — se o celular estiver sem rede no instante do alarme, ele não toca na hora; chega quando
> a conexão voltar, porque FCM e APNs enfileiram. Numa escola com sinal ruim isso não é hipótese.
> É o argumento mais forte a favor da fase 6, se ela for Android.

Contra duplicata: **claim atômico** (`updateMany` condicional em `IS NULL`; se `count === 0`, outro
tick já pegou) — as colunas `aberturaNotificadaEm` / `fechamentoNotificadoEm` já existem no schema —
e a **mesma `tag`** nas duas camadas, para o SO substituir em vez de empilhar.

---

## Reaproveitamento do projeto-professor

Caminhos reais em `/workspace/projeto-professor`:

| Arquivo | O que faz | O que muda |
|---|---|---|
| `apps/api/prisma/schema.prisma` — `SerieAula`, `SerieHorario` | série recorrente + horário por dia da semana (`diaSemana` 0–6, `horaInicio`/`horaFim` "HH:mm") | `alunoId` → `cadeiraId`; remove `tipoCobranca`, `valorAula`, `valorHora`, `horasPadrao` |
| `schema.prisma` — `Ocorrencia` | sessão concreta datada, `status`, `notificadaEm`, `preAvisadaEm` | mantém espinha; 1:1 com `RegistroAula`; renomeia marcas p/ `aberturaNotificadaEm` / `fechamentoNotificadoEm` |
| `apps/api/src/jobs/jobs.service.ts` — `gerarOcorrencias` (`@Cron('0 3 * * *')`) | materializa ocorrências futuras das séries | quase intacto; perde cálculo de valor |
| `jobs.service.ts` — `preAvisoAula` (`@Cron(EVERY_MINUTE)`) | pré-aviso 15 min antes, janela de tolerância 2 min, claim atômico | antecedência vira configurável; **nasce o gêmeo de fechamento** olhando `horaFim` |
| `jobs.service.ts` — `lembreteInicioAula` | dispara no início da aula | vira base do alarme de abertura |
| `jobs.service.ts` — helper `protegido()` | isola falha de job sem derrubar o resto | direto |
| `apps/api/src/push/push.service.ts` | VAPID, envio multi-device, remove subscription morta (404/410), persiste `Notificacao` in-app mesmo sem device | quase nada; ganha `intensidade` no payload |
| `apps/web/public/sw.js` | ícone/vibração por tipo, `actions`, `requireInteraction`, `renotify`, roteamento no clique | vibração e som passam a vir do payload em vez de tabela fixa |
| `schema.prisma` — `Notificacao` + `apps/api/src/notificacoes/` | central in-app; grava mesmo sem device inscrito | direto — é a rede de segurança |
| `schema.prisma` — `PushSubscription` | endpoint/p256dh/auth por professor | direto |
| `schema.prisma` — `Professor` (linha 75) | perfil 1:1 com uid do Supabase Auth; raiz do multitenant | poda campos comerciais (`plano`, PIX, Stripe) |
| `apps/api/src/auth/` | guard que valida o JWT do Supabase e injeta o professor no request | direto — é o que impede esquecer `professorId` num `where` |
| `apps/api/src/prisma/` | `PrismaService` | direto |

**Não transplantar:** `Recibo`, `Aulao`/`SessaoAulao`/`PresencaAulao`, `assinatura`, `financeiro`,
`convites`, `equipe`, `leads`, `integracoes/google`, `mail`, `admin`.

---

## Multitenant — o padrão

Herdado inteiro do projeto-professor, que já resolve isso:

- **`Professor`** é 1:1 com o usuário do Supabase Auth (`id` = auth uid). Transplante direto de
  `schema.prisma:75`, podando os campos comerciais (`plano`, PIX, Stripe).
- **Toda tabela de domínio carrega `professorId`** com `onDelete: Cascade` e índice composto
  começando por ele (`@@index([professorId, data])`). O cascade é o que faz "excluir minha conta"
  ser uma linha de código em vez de um roteiro de limpeza.
- **RLS no Supabase** em cada tabela: `professor_id = auth.uid()`. É a segunda barreira — a API já
  filtra por professor autenticado, mas RLS garante que um bug de query não vaze dado entre contas.
- **Os crons já são multitenant por construção.** `preAvisoAula` varre ocorrências de *todos* os
  professores e usa `oc.professorId` para escolher o destinatário do push. Não precisa de laço por
  tenant nem de job por conta.
- **Storage** particionado por professor (`{professorId}/{registroId}/{arquivo}`), com policy
  espelhando a RLS.

> **Cuidado que isso adiciona:** cada `findMany` precisa do `professorId` no `where`. O padrão do
> projeto-professor é resolver isso num guard que injeta o professor autenticado no request — vale
> transplantar `apps/api/src/auth/` junto, em vez de reimplementar e esquecer um filtro.

## Modelo de dados novo

Todas as entidades abaixo carregam `professorId` + índice, além dos campos listados.

```
Professor          id (= auth uid), nome, email, timezone, criadoEm      ← reaproveitado
Escola             nome, turno?                                          ← opcional, mas barato agora
Cadeira            escolaId?, disciplina, turma, anoLetivo, corHex
Unidade            cadeiraId, ordem, titulo, dataInicio, dataFimPrevista, topicos[]
RegistroAula       ocorrenciaId (1:1)
                   planoPrevisto        ← preenchido no alarme de abertura
                   conteudoDado         ← preenchido no alarme de fechamento
                   unidadeId, topicosCobertos[]
                   atividadeCasa, dataEntrega?
                   planoProximaAula     ← alimenta a abertura da aula seguinte
                   transcricaoBruta     ← fala original, intacta
                   resumoPadronizado    ← saída da IA
                   revisadoEm           ← null = ainda rascunho
ConfigAlarme       escopo (professor | cadeira), cadeiraId?,
                   antecedenciaMin, atrasoMin,
                   intensidadeAbertura, intensidadeFechamento, som, vibra, diasSemanaAtivos
Anexo              registroId, tipo (foto|documento|audio), storagePath, enviadoEm
```

`Escola` entra agora porque em multitenant ela deixa de ser detalhe: professor que dá aula em duas
escolas com grades e calendários diferentes é caso comum, e enfiar isso depois exige migrar
`Cadeira` que já terá histórico pendurado.

**`planoProximaAula` é a peça mais valiosa do modelo.** Ele pré-preenche a abertura da aula
seguinte, transformando o alarme de abertura num toque de confirmação em vez de digitação do zero.
É o que torna 11 cadeiras sustentáveis.

`Unidade` + `topicosCobertos` destravam a tela de progresso que ela pediu ("dar check nas
unidades"): *"8º A · Unidade 2 — 5 de 9 tópicos, 3 aulas até a prova"*.

### ~~Correção pendente~~: currículo é da disciplina, não da cadeira — **feita** (`57f85a8`)

Foi feita no início da fase 3, antes dos formulários, como planejado. `Unidade` pendurava em
`cadeiraId` (`@@unique([cadeiraId, ordem])`). Com 11 turmas em poucas disciplinas, isso obrigava a
digitar o mesmo plano de Matemática 4 vezes — e a corrigir 4 vezes. É o atrito que faz abandonar o
app na segunda semana.

Separar o que hoje está colado:

- **O que se ensina** → `PlanoCurricular` (professorId, nome, disciplina?, anoLetivo) → `Unidade`
  → `Topico`. `Cadeira.planoCurricularId?` aponta para um. Nulável: cadeira sem plano continua
  funcionando.
- **Onde cada turma está** → não muda de lugar. `RegistroTopico` já pendura no registro de cada
  aula, então "8ºA no tópico 5, 8ºB no tópico 3" sai de graça.

O plano é objeto que ela cria quantas vezes quiser — **não** é derivado do nome da disciplina,
porque a mesma disciplina em escolas diferentes pode ter currículo diferente.

**Ganho colateral, maior que o `planoProximaAula` para o caso dela:** turmas irmãs andam com poucos
dias de diferença. Na abertura do 8ºB, mostrar *o que ela deu no 8ºA na mesma unidade* transforma o
formulário em confirmação em vez de digitação.

Custo agora: uma migration sem dado nenhum. Custo depois: migrar histórico. (Saiu por uma
migration vazia, como previsto.)

O ganho colateral já está implementado e coberto por teste: `GET /registros/ocorrencia/:id`
devolve, junto com a aula, o que foi dado na **turma irmã** mais recente que segue o mesmo plano.
Só é possível porque a unidade saiu da cadeira.

---

## Pipeline de voz → resumo padronizado

1. **Grava** — `MediaRecorder`, áudio fica no aparelho primeiro (sala sem sinal é o caso normal).
2. **Transcreve** — serviço de transcrição no backend quando houver rede; ditado nativo do teclado
   como caminho rápido paralelo.

### Transcrição de áudio — decisão pendente

**O que foi construído é só o caminho 2b: o ditado.** `lib/ditado.ts` usa a Web Speech API quando
existe e, onde não existe, a tela manda ela usar o microfone do teclado do sistema. Nos dois casos
**o que sai é texto — nenhum arquivo de áudio chega a existir.**

Isso não foi economia de esforço: gravar e transcrever no servidor exige um provedor de
transcrição, e a Anthropic não faz áudio. Escolher um significa **mandar a voz dela, com nome de
aluno falado, para um terceiro** — exatamente o artefato que a seção de LGPD manda descartar. Sem
áudio, o problema não existe: não há o que subir, guardar nem apagar.

O que se perde: numa sala barulhenta o ditado erra mais que uma transcrição boa, e o iOS corta o
ditado do teclado depois de ~30 s de fala contínua.

**Decisão para o usuário, se o ditado não bastar no uso real:** escolher provedor (Whisper da
OpenAI, Google STT, Deepgram), aceitar que a voz sai do aparelho, e pagar por minuto. O código
já está preparado — `AUDIO` existe em `TipoAnexo` e o descarte na revisão já está implementado e
testado, mesmo sem nada produzir áudio hoje.
3. **Normaliza** — Claude recebe transcrição **+ contexto da cadeira + plano da unidade + o que ela
   planejou na abertura**. O contexto é o que separa resumo útil de genérico: sem ele, *"continuei
   o que eu tinha planejado"* fica como está; com ele, a referência é resolvida.
4. **Ela confirma** — rascunho editável ao lado da fala original.

| Decisão | Escolha |
|---|---|
| Modelo | **`claude-haiku-4-5`** |
| Formato | `output_config.format` com JSON schema (sem regex, sem retry de parse) |
| Thinking | desligado — é extração com schema, não raciocínio |
| Onde roda | NestJS — a chave nunca sai do servidor |
| Resposta | fila + Realtime do Supabase (sem spinner) |
| Custo | ~US$ 0,33/mês (~95 aulas × ~1.500 in / ~400 out tokens) |

**Por que o modelo pequeno basta:** o schema já garante os campos, e a saída passa por revisão
humana antes de virar registro. O único ponto onde um modelo maior ajudaria é resolver referência
vaga (*"continuei o que eu tinha planejado"* → o conteúdo real, puxando do `planoPrevisto`).

**Critério de upgrade:** se na fase 4, ao comparar com 5 falas reais dela, o resumo errar a
resolução de referência ou a associação com a `Unidade`, subir para `claude-sonnet-5`. É troca de
uma string. Não subir preventivamente — medir primeiro.

### Provedor de IA — Groq como plano gratuito do MVP

A conta da Anthropic está sem saldo, então o pipeline ganhou um segundo caminho. `IA_PROVEDOR`
escolhe; o prompt, o schema e a tradução dos números são os mesmos nos dois.

| | Anthropic (alvo) | **Groq (MVP grátis)** | Gemini free tier |
|---|---|---|---|
| Modelo | `claude-haiku-4-5` | `openai/gpt-oss-120b` | `gemini-*-flash` |
| Custo | ~US$ 0,33/mês | grátis, com limite de req/min | grátis |
| Schema garantido | sim | sim (`strict: true`) | sim (`responseSchema`) |
| **Treina com o que você manda** | **não** | **não, em nenhum plano** | **sim, no free tier** |

**O critério que decidiu não foi preço nem qualidade: foi a última linha.** O free tier do Gemini
usa prompts e respostas para melhorar os produtos do Google, e só o tier pago desliga isso. O que
trafega aqui é a **fala da professora**, que pode ter nome de aluno — e a decisão de LGPD deste
projeto é que esse texto exista só para ela. Mandá-lo para um plano que treina com ele contradiz a
decisão inteira. A Groq não treina com dado de API em nenhum plano: é provedor de inferência, não
de modelo fundacional.

`gpt-oss-120b` e não `20b`: a diferença aparece justamente em resolver referência vaga em português,
que é o único ponto onde este pipeline precisa de cabeça.

**Quando comprar crédito na Anthropic, é trocar `IA_PROVEDOR` para `anthropic`.** Vale medir os dois
com as mesmas 5 falas antes de decidir — pode ser que o gratuito baste.

*Nota: `claude-haiku-4-5` não aceita o parâmetro `effort` (erro) e usa a forma antiga de thinking;
como thinking fica desligado aqui, nenhum dos dois é problema.*

**Regra inegociável:** saída da IA é sempre rascunho, nunca registro. O histórico dela pode virar
prova de trabalho na frente da coordenação; resumo que inventa tópico é pior que resumo nenhum.

**LGPD — decidido: nome de aluno não entra.** Três consequências concretas, porque a decisão não se
resolve só no prompt:

1. **Resumo** — instrução explícita no prompt e nenhum campo de pessoa no JSON schema de saída.
   Nome falado vira *"um aluno"*.
2. **Transcrição bruta e áudio** — é onde o nome fica literal.

   **Revisto em 15/08/2026, por decisão do usuário.** A regra original descartava a transcrição
   junto com o áudio na revisão. Passou a ser: **o texto fica, o áudio não.**

   - **`transcricaoBruta` e `resumoPadronizado` sobrevivem à revisão.** A dúvida sobre um registro
     não aparece no dia seguinte; aparece meses depois, na frente da coordenação — e é exatamente
     aí que ela precisa poder mostrar o que falou e o que a IA entendeu. Descartar destruía a
     auditoria justamente antes da hora em que ela serve.
   - **O áudio continua sendo descartado** em `revisadoEm` (`AnexosService.descartarAudios`). Voz é
     identificador biométrico, e de menor: guardar a frase *"um aluno perguntou"* é uma coisa,
     guardar a voz dele é outra. Hoje isso é preventivo — o ditado não produz arquivo de áudio.
   - **O que ainda protege:** o prompt proíbe nome no resumo e o JSON schema não tem campo de
     pessoa, então o **registro** — a parte que vira histórico e relatório — continua sem nomes.
     O que sobrevive com nome é a fala dela, visível só para ela.
3. **Fotos** — nenhum código impede fotografar um caderno com nome na capa. Vira uma linha na tela
   de anexo (*"fotos do quadro e do material, não dos alunos"*) e a decisão fica com ela.

---

## Armadilhas conhecidas

- **Otimização de bateria no Android** (Xiaomi/Samsung/Motorola matam background) — o app precisa
  detectar e pedir exceção com passo a passo na tela de config. Não se resolve no código.
- **Limite de 64 notificações locais pendentes no iOS** — 11 cadeiras × 2 alarmes estoura rápido.
  Janela rolante de ~14 dias, renovada a cada abertura do app.
- **Sala sem sinal** — escrita local-first (IndexedDB) + fila de sync é requisito, não refinamento.
  É exatamente no fechamento que a rede falta.
- **Feriado / semana de prova / aula trocada** — ocorrência editável individualmente sem quebrar a
  série; cancelar aula cancela os alarmes dela.
- **Fuso** — regra como hora local + dia da semana; materializar em `timestamptz`.
- **Alarme demais vira alarme nenhum** — 22 toques/semana cansam. Medir taxa de resposta antes de
  assumir que funciona.

---

## Fase 2 — detalhamento (próxima a executar)

### Motor: dois crons gêmeos, por minuto

| Cron | Dispara em | Marca de claim | Pergunta |
|---|---|---|---|
| `alarmeAbertura` | `inicioEm − antecedenciaMin` | `aberturaNotificadaEm` | "o que você planeja dar?" |
| `alarmeFechamento` | `fimEm + atrasoMin` | `fechamentoNotificadoEm` | "o que você deu?" |

A query é **rede larga + filtro em memória**, não instante calculado no banco:

```ts
// Pega tudo que começa dentro da maior antecedência possível (teto: 120 min,
// validado no DTO). O índice [status, inicioEm] do schema já serve isto.
where: { status: AGENDADA, aberturaNotificadaEm: null,
         inicioEm: { gte: agora - 30min, lte: agora + 120min } }
// ...depois, por linha: resolve a config e testa se inicioEm - antecedencia <= agora
```

**Por que não guardar um `alarmeAberturaEm` calculado:** ele dependeria da config, e toda edição de
antecedência exigiria reescrever as ocorrências futuras — o mesmo tipo de recálculo em cascata que
o projeto-professor tem para valor de aula e que é fonte de bug. A janela é limitada por índice,
então o custo do filtro em memória é irrelevante.

**Piso de 30 min:** alarme de abertura com mais de meia hora de atraso não toca. A aula já começou,
e perguntar "o que você planeja dar?" no meio dela é pior que silêncio. A linha fica com a marca
nula e simplesmente sai da janela — sem lixo, sem varredura crescente.

### Resolução da config

Função **pura e testável** `resolverAlarme(professor, configDaCadeira)` — cada campo nulo do
override cai no padrão do `Professor`. É a única lógica nova com ramificação de verdade, então é
onde os testes unitários vão.

### `SILENCIOSO` grava, mas não toca

Cria a `Notificacao` in-app e pula o push. A tabela de degradação promete "só histórico", e o
histórico é justamente a rede de segurança: se o push falhar, o registro do alarme não se perde.

### Degradação honesta na UI

Helper `capacidadeDoAparelho()` no cliente: detecta wrapper nativo (`window.Capacitor`), Android e
iOS/standalone. A tela de config usa isso para rotular o que ela escolheu — quando `ALARME` vai
chegar rebaixado, **a tela diz na hora**. É a regra que mais importa nesta fase.

### Casca web mínima (`apps/web`)

Next.js 14 App Router + Tailwind + TanStack Query + sonner — mesmo stack do projeto-professor.
Escopo deliberadamente curto: **o mínimo para um alarme chegar e ser testado.**

- `/login`, `/cadastro`
- `/` — grade da semana (fecha a entrega prometida da fase 1)
- `/cadeiras` — CRUD + config de alarme por cadeira
- `/config` — padrões da conta, ativar notificações, botão de push de teste
- PWA: `manifest.webmanifest`, `sw.js`, ícones

Formulários de registro de aula **não** entram aqui — são fase 3.

### Arquivos

| Novo/alterado | O que |
|---|---|
| `apps/api/src/push/` | transplante de `push.service.ts` do projeto-professor + `intensidade` no payload |
| `apps/api/src/alarmes/alarmes.service.ts` | os dois crons + `resolverAlarme` |
| `apps/api/src/notificacoes/` | central in-app (listar, marcar lida) |
| `apps/api/src/cadeiras/` | endpoints de `ConfigAlarme` (upsert por cadeira) |
| `apps/api/src/jobs/jobs.controller.ts` | disparo manual dos dois alarmes, para o teste de relógio |
| `apps/web/**` | casca acima |

Modelos `Notificacao`, `PushSubscription` e `ConfigAlarme` **já existem no schema** — fase 2 não
mexe em migration.

---

## Fases

Cada fase entrega algo usável; a decisão cara (Capacitor) fica por último, depois que a realidade
mostrar se é necessária.

1. ~~**Fundação e grade**~~ — **feito** (`8921d81`, `8ed4568`), menos a tela, que foi para a fase 2.
2. ~~**Os dois alarmes**~~ — **feito** (`aa71e52`, `37baa31`). Falta só a verificação que exige
   aparelho real: gerar as chaves VAPID e fazer o teste de relógio no celular dela.
3. ~~**Registro por texto**~~ — **feito.** `PlanoCurricular` + unidades + tópicos, `RegistroAula`
   por ocorrência, a tela `/aula/[id]` com os dois formulários, encadeamento `planoProximaAula`,
   sugestão da turma irmã, telas de plano curricular e vínculo cadeira↔plano, anexos e escrita
   local-first. Falta só o teste de modo avião no aparelho.
   *Entrega: substitui o caderno.*
4. **Voz e resumo padronizado** — **em andamento.** Feitos: ditado por voz sem gravar áudio,
   normalização com `claude-haiku-4-5` (`POST /ia/ocorrencia/:id/resumo`), rascunho ao lado da
   fala e revisão que descarta a fala. **Não verificado com o modelo de verdade: a conta da
   Anthropic está sem saldo** — a chave autentica, mas toda chamada volta 400 de crédito, e a
   cobrança é checada *antes* da validação de parâmetros, então nem o schema foi aceito ainda.
   Falta também a transcrição de áudio no servidor (ver "Transcrição de áudio" abaixo).
5. **Progresso e histórico** — painel por cadeira/unidade, linha do tempo, busca, exportação.
   *Entrega: a resposta para "onde eu parei no 8º A?".*
6. **Capacitor no Android** — alarme real: canal categoria alarme + full-screen intent, furando o
   silencioso. **Deixou de ser condicional** (decisão 3). O `capacidade.ts` já detecta
   `window.Capacitor`, então entra como casca fina sobre o mesmo web — não é app paralelo.
   Custos que só aparecem aqui: conta de desenvolvedor Google (US$ 25, uma vez) ou APK por fora, e
   atualização que passa a exigir build/redistribuição em vez de sair no deploy do web. Canal de
   teste interno da Play Store resolve no começo. O iPhone segue no PWA, com o teto que ele tem.

---

## Verificação

- ~~**Fase 1**~~ — **feito.** Postgres real, schema aplicado, RLS executado (14 policies), API
  subindo e respondendo, 35 testes com 15 de integração. A verificação achou 3 bugs que o
  compilador não pegaria — inclusive um `CREATE POLICY` que falhava com `text = uuid` e teria
  deixado o RLS ausente em produção sem ninguém notar.
- **Fase 2** — o teste que importa é **de relógio, no aparelho dela, não no simulador**: cadastrar
  uma aula terminando em 3 minutos e confirmar que os dois pushes chegam. Além disso:
  - **Claim atômico:** rodar os dois crons concorrentes no mesmo tick (ou reiniciar a API no meio)
    e conferir que não chega push duplicado. Cobrível por teste de integração.
  - **Degradação:** celular no silencioso, confirmando na prática o que a tabela promete — e que a
    tela avisou antes.
  - **Config:** override por cadeira ganha do padrão da conta; campo nulo herda. Teste unitário na
    função pura `resolverAlarme`.
  - **Piso de 30 min:** ocorrência antiga com marca nula não dispara alarme atrasado.
- **Fase 3** — modo avião: preencher um fechamento offline, fechar o app, voltar online, confirmar
  que sincronizou sem perder nada.
- **Fase 4** — gravar 5 falas reais dela (não texto sintético) e comparar o resumo padronizado com
  o que ela teria escrito. O critério é ela reconhecer a própria aula no resumo.
- **Testes automatizados** — seguir o padrão de `apps/api/src/jobs/jobs.service.spec.ts`, que já
  cobre janelas de tolerância e idempotência dos crons.

---

## Perguntas — todas respondidas

~~1. O currículo já existe em papel?~~ **Respondido: sim, o plano de curso já existe escrito.**
~~2. Que celular ela usa?~~ **Respondido:** fazer os dois (decisão 3).
~~3. 11 cadeiras = 11 turmas?~~ **Respondido:** 11 turmas, poucas disciplinas (decisão 6).
~~4. Nome de aluno entra?~~ **Respondido:** não (decisão 5).
~~5. É só para ela ou vira produto?~~ **Respondido:** produto multitenant desde o dia 1.

### O que a resposta 1 muda

O plano de curso existente vira **carga inicial**, e isso reordena valor:

- A fase 5 (progresso por unidade) serve **desde a primeira semana**, em vez de esperar meses de
  uso para ter o que comparar.
- O fechamento pergunta *"qual unidade?"* num **select das unidades reais dela**, não em campo de
  texto livre. É isso que torna os registros comparáveis entre si — o ponto do produto inteiro.
  Sem unidades cadastradas, "unidade" vira mais um texto escrito diferente toda vez.
- Abre a importação por foto/PDF do documento com extração pela IA. **Cuidado de escopo:** é a
  melhor primeira impressão possível (ela abre o app e o ano dela já está lá), mas é trabalho de
  fase 5, não de fase 3. Na fase 3 basta o cadastro manual das unidades — sem ele, nada consome
  o plano curricular e a importação não teria onde pousar.
- Reforça a correção do `PlanoCurricular`: com o documento em mãos ela vai digitar (ou importar)
  uma vez por disciplina, não uma vez por turma.

**Pedir o documento antes de começar a fase 5** — o formato real (Word, PDF, planilha, foto do
caderno) decide se a importação é parsing ou visão, e isso não dá para adivinhar.

---

*A versão navegável deste plano (com as tabelas de degradação, o diagrama do motor e o mapa de
reaproveitamento) está em `docs/arquitetura.html`, versionada junto. A tabela de IA já diz
`claude-haiku-4-5`. Posso publicá-la como página compartilhável se você quiser mostrar para a
professora.*
