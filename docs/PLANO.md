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
| Modelo | **`openai/gpt-oss-120b` pela Groq** — é o que roda hoje |
| Formato | JSON schema com `strict: true` (sem regex, sem retry de parse) |
| Onde roda | NestJS — a chave nunca sai do servidor |
| Custo | grátis, com limite de requisições por minuto |

**Por que um modelo pequeno basta:** o schema já garante os campos, e a saída passa por revisão
humana antes de virar registro. O único ponto onde um modelo maior ajudaria é resolver referência
vaga (*"continuei o que eu tinha planejado"* → o conteúdo real, puxando do `planoPrevisto`) — e
isso a Groq já resolveu numa chamada real (`fbb7499`).

**Critério de upgrade:** se ao comparar com 5 falas reais dela o resumo errar a resolução de
referência ou a associação com a `Unidade`, trocar `IA_PROVEDOR` para `anthropic`. É troca de uma
variável de ambiente. Não trocar preventivamente — medir primeiro.

### Provedor de IA — a Groq é o que roda

O plano original era Anthropic. A conta ficou sem saldo, o pipeline ganhou um segundo caminho, e
**foi o segundo que passou numa chamada real** — então a Groq deixou de ser plano B. `IA_PROVEDOR`
escolhe; o prompt, o `ESQUEMA` e `aplicarResumo` são os mesmos nos dois, só o transporte muda.

| | **Groq (em uso)** | Anthropic (comparação) | Gemini free tier |
|---|---|---|---|
| Modelo | **`openai/gpt-oss-120b`** | `claude-haiku-4-5` | `gemini-*-flash` |
| Custo | grátis, com limite de req/min | ~US$ 0,33/mês | grátis |
| Schema garantido | sim (`strict: true`) | sim | sim (`responseSchema`) |
| **Treina com o que você manda** | **não, em nenhum plano** | **não** | **sim, no free tier** |
| Verificado ponta a ponta | **sim** (`fbb7499`) | não — conta sem saldo | não testado |

**O critério que decidiu não foi preço nem qualidade: foi a última linha.** O free tier do Gemini
usa prompts e respostas para melhorar os produtos do Google, e só o tier pago desliga isso. O que
trafega aqui é a **fala da professora**, que pode ter nome de aluno — e a decisão de LGPD deste
projeto é que esse texto exista só para ela. Mandá-lo para um plano que treina com ele contradiz a
decisão inteira. A Groq não treina com dado de API em nenhum plano: é provedor de inferência, não
de modelo fundacional.

`gpt-oss-120b` e não `20b`: a diferença aparece justamente em resolver referência vaga em português,
que é o único ponto onde este pipeline precisa de cabeça.

**Comprar crédito na Anthropic não é pré-requisito de nada** — é o que permite comparar os dois com
as mesmas 5 falas. Como o gratuito já passou, a comparação é para saber se vale pagar, não para
destravar a fase.

**O `[12]` que o título consertou.** A primeira versão numerava unidades e tópicos e pedia o número
de volta; com dois tópicos marcados, o modelo devolvia `topicos: [12]` — concatenando os dígitos de
1 e 2, de forma determinística mesmo a temperatura 0. O `strict: true` da Groq **valida depois de
gerar, não restringe a geração**, então o efeito era um 400 na cara dela. Duas correções: o schema
passou a trafegar **títulos** em vez de números, e a chamada tenta estrito e repete sem — erro de
schema vira rascunho pior, nunca tela de erro.

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

## Fase 2 — detalhamento (feita)

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
4. **Voz e resumo padronizado** — **construída e verificada pela Groq** (`fbb7499`). Ditado sem
   gravar áudio, `POST /ia/ocorrencia/:id/resumo` devolvendo rascunho, revisão que preserva a fala
   e descarta o áudio. Uma chamada real passou ponta a ponta: referência vaga resolvida, data
   relativa resolvida e nenhum nome de aluno na saída. **Falta o critério de aceite:** comparar com
   5 falas reais dela. A Anthropic segue sem saldo — é comparação, não bloqueio.
5. **Progresso e histórico** — painel por cadeira/unidade, linha do tempo, busca, exportação e a
   importação do plano de curso. Detalhada abaixo. *Entrega: a resposta para "onde eu parei no
   8º A?".*
6. **Capacitor no Android** — alarme real: canal categoria alarme + full-screen intent, furando o
   silencioso. **Deixou de ser condicional** (decisão 3). O `capacidade.ts` já detecta
   `window.Capacitor`, então entra como casca fina sobre o mesmo web — não é app paralelo.
   Custos que só aparecem aqui: conta de desenvolvedor Google (US$ 25, uma vez) ou APK por fora, e
   atualização que passa a exigir build/redistribuição em vez de sair no deploy do web. Canal de
   teste interno da Play Store resolve no começo. O iPhone segue no PWA, com o teto que ele tem.

---

## Fase 5 — detalhamento (entregue em `e5598f2`…`3fd2fd5`)

Toda a fase 5 é **leitura**. Nenhuma tabela nova, nenhuma coluna nova, nenhuma policy nova — o
schema que a fase 3 deixou já tem tudo: `RegistroTopico` liga registro a tópico, `Unidade.ordem` dá
a sequência e `Unidade.dataFimPrevista` existe e **hoje não é consumida por ninguém**. É a fase de
menor risco do projeto e a de maior efeito visível, porque é a primeira em que o sistema *devolve*
alguma coisa em vez de só guardar.

Ordem proposta: **5a → 5b → 5d → 5c → 5e**. Cada uma é entregável sozinha.

### A regra que atravessa a fase inteira

**Rascunho não conta.** Progresso, histórico, busca e exportação filtram `revisadoEm != null`. Um
tópico marcado por um resumo de IA que ela ainda não conferiu não pode empurrar a barra de
progresso — senão o número que ela mostra para a coordenação é, em parte, invenção de modelo.

Na prática o filtro é barato: `salvarFechamento` sempre preenche `revisadoEm`, então só rascunho
pendente fica de fora.

### 5a — Progresso por cadeira e unidade — **feito**

O numerador sai de `RegistroTopico` (distinto, porque um tópico revisitado em três aulas conta
uma vez); o denominador, dos tópicos das unidades do `PlanoCurricular` da cadeira.

- `GET /progresso` — uma linha por cadeira: unidade corrente, tópicos cobertos / total, e a data
  prevista de fim.
- `GET /progresso/:cadeiraId` — unidade a unidade, com quais tópicos ainda faltam.

**A porcentagem não é o número que importa.** "55%" não diz o que fazer. O que ela precisa é
**ritmo**: *"faltam 4 tópicos e 3 aulas até 30/09"* — isso se responde cruzando os tópicos
pendentes com as ocorrências `AGENDADA` até `Unidade.dataFimPrevista`. É o único lugar do sistema
que transforma registro em aviso, e é o que justifica a fase.

**Turmas irmãs lado a lado** saiu quase de graça depois disso: mesmo plano, cadeiras diferentes.
E o dado de teste mostrou o valor sozinho — 8ºA e 8ºB no mesmo ponto do plano, mas *"3 aulas até
21/08"* contra *"2 aulas"*. Mesmo progresso, ritmos diferentes; é o que 11 turmas tornam impossível
de manter na cabeça, e o motivo de o `PlanoCurricular` ter sido separado da cadeira na fase 3.

Cuidado de desempenho que a implementação toma: **três consultas no total, não três por cadeira.**
Com onze cadeiras, o laço ingênuo seriam trinta e três idas ao banco para desenhar uma tela; o
agrupamento acontece em memória, onde o volume de uma professora cabe folgado.

Cadeira sem plano vinculado não tem denominador. Mostra as aulas registradas e um convite para
vincular um plano, nunca uma barra vazia que parece atraso.

### 5b — Linha do tempo da cadeira — **feita**

`GET /registros?cadeiraId=&pagina=` — os registros revisados em ordem cronológica, com conteúdo,
unidade, tópicos e anexos. É a tela que ela abre quando a coordenação pergunta o que foi dado.

Reaproveita a paginação de `AdminService.erros`, que já resolve o mesmo problema.

### 5c — Busca no histórico — **feita**

Sobre `conteudoDado`, `planoPrevisto`, `atividadeCasa` e `planoProximaAula`, filtrada por professor.

**Deliberadamente burra quanto a desempenho**, e não quanto a acerto. Sem índice: são ~500
registros por ano e a varredura é instantânea; `tsvector` com stemming seria engenharia para um
problema que ela não tem.

**Mas `ILIKE` puro não bastava, e isso só apareceu medindo.** Com o `contains` do Prisma, `frações`
achava 14 registros e **`fracoes` achava zero** — e ela digita no celular, com pressa, entre uma
aula e outra. A correção é a extensão `unaccent` do Postgres, que o Supabase já oferece, aplicada
numa consulta crua que só colhe ids; o `findMany` com os `include` continua em Prisma.

Sem a extensão instalada, a busca **degrada para o casamento com acento** em vez de devolver 500, e
o log diz qual comando rodar. Pior busca é melhor que tela de erro.

Buscar em `transcricaoBruta` **não** entra: é o campo que pode conter nome de aluno, e busca é o
caminho mais fácil de transformar um campo privado em índice consultável.

### 5d — Exportação — **feita**

Dois formatos, nenhuma dependência nova:

- **Página de impressão** (`/cadeiras/:id/relatorio`) com `@media print`. O navegador dela já
  imprime em PDF; uma biblioteca de PDF no servidor seria peso morto para gerar o que o Chrome
  gera de graça.
- **CSV** para quando pedirem planilha.

**A exportação é o artefato que sai da mão dela — é onde a regra de LGPD tem de ser estrutural,
não editorial.** O que sai: conteúdo dado, unidade, tópicos, atividade, datas. O que **nunca**
sai: `transcricaoBruta` e `resumoPadronizado`. A fala é dela e pode ter nome de aluno; o registro
revisado é o documento. Isso não é opção de tela — é o `select` do endpoint que não busca as
colunas.

### 5e — Importação do plano de curso

**Já feito, e é o que destrava enquanto a leitura por IA não existe: o documento tem onde morar.**
`Anexo` passou a pendurar numa aula **ou** num plano de curso, e a tela do plano tem a seção
"Documento do plano". Ela fotografa as folhas e digita as unidades olhando para elas, em vez de
procurar o papel na mochila — e quando a leitura automática entrar, o arquivo já está no lugar
certo, com o mesmo caminho de upload, a mesma URL assinada e o mesmo bucket privado.

**A extração também está feita, e verificada** — o formato é PDF (decisão do usuário, 16/08/2026),
que é o caminho barato: extrai a camada de texto no servidor e manda só texto pelo pipeline que já
existe. Nenhuma visão, nenhuma troca de provedor.

| Formato real | Caminho | Provedor |
|---|---|---|
| **PDF digital** | extrai texto e manda pelo pipeline de texto | **Groq, grátis — é o que roda** |
| PDF escaneado, foto | precisa de visão | recusado com mensagem clara; o arquivo fica guardado |

`ImportacaoService` lê o anexo que ela já subiu, `pdf.ts` extrai o texto e `plano.prompt.ts` faz o
resto — puro e testável, como `resumo.prompt.ts`. A saída é **sempre rascunho**: ela vê as unidades
na tela, desmarca o que não for, e só o confirmar cria `Unidade` + `Topico`, num POST só.
**Rascunho nenhum toca o banco**, o que dispensa tabela de rascunho e portanto policy nova. As
unidades entram no fim da lista em vez de substituir — importar não é motivo para apagar o que ela
digitou na mão.

**A fronteira que mais importa é digital × escaneado.** Os dois são PDF, têm a mesma cara na tela e
só o primeiro tem texto. `pareceEscaneado` mede caracteres por página e recusa antes de chamar o
modelo: camada vazia produziria unidades inventadas a partir do nada — o pior desfecho possível
para um documento que vira currículo.

Verificado contra o modelo de verdade (16/08/2026): um plano de curso escrito devolveu as 3
unidades e os 11 tópicos com os títulos exatos em 1,8 s, sem levar junto avaliação, bibliografia,
carga horária nem assinatura; e um PDF real de 14 páginas que **não** é plano de curso devolveu
lista vazia, em vez de inventar.

**O teto de texto é medido, não estimado.** `MAX_CARACTERES` são 16 mil porque o plano gratuito da
Groq dá 8000 tokens por minuto — a primeira versão tinha 40 mil e a verificação levou 429 na cara.

---

## Fase 6 — detalhamento

O que a fase 6 realmente entrega, e que nenhuma outra entrega: **a camada 1 do motor de alarmes**.
Hoje só existe a camada 2 (cron + push), e ela depende de rede no instante do alarme. Numa escola
com sinal ruim, o alarme chega quando a conexão voltar — que é depois da aula. É esse o furo que a
fase 6 fecha, não o barulho.

### O degrau que o Capacitor sozinho não sobe

`@capacitor/local-notifications` entrega **notificação local agendada** — o nível 2 da tabela de
degradação, não o nível 3. Alarme de verdade exige, do lado Android:

- `AlarmManager.setAlarmClock()` — o único agendamento que sobrevive ao Doze
- `NotificationChannel` com `IMPORTANCE_HIGH` e `AudioAttributes.USAGE_ALARM` — é o que fura o
  silencioso
- Activity de tela cheia via *full-screen intent*
- permissões `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` e `USE_FULL_SCREEN_INTENT`

Ou seja: **um plugin nativo pequeno, escrito à mão.** Planejar a fase 6 como "instalar o Capacitor
e pronto" é subestimá-la pela metade — e é o erro que faria a fase entregar exatamente o que o PWA
já entrega.

### Riscos que só aparecem aqui

- **Android 14+ restringe full-screen intent** a apps de alarme e chamada. A permissão é declarada
  e **revisada pelo Google**; um registro de aulas precisa argumentar o caso. Se for negada, o app
  cai para notificação — o mesmo teto do PWA, com o custo de manter um build Android.
- **Otimização de bateria** (Xiaomi, Samsung, Motorola) mata o agendamento em silêncio. Precisa de
  uma tela que detecte e conduza ela até a exceção. Não se resolve em código.
- **Atualização deixa de ser deploy.** Web sai no push; Android exige build e redistribuição.
- **Assets embarcados, não `server.url`.** Apontar o Capacitor para a web publicada tornaria a
  atualização instantânea, mas o app pararia de abrir sem rede — jogando fora o local-first da
  fase 3. Empacotar o web e deixar só a API remota preserva o offline.

### As duas surpresas, e nenhuma é o alarme

Levantadas lendo o código em 17/08/2026, antes de escrever uma linha de Capacitor. As duas nascem
do mesmo fato: **dentro do wrapper não existe servidor Next.** O app são arquivos estáticos servidos
de `https://localhost`, e tudo que o Next fazia em tempo de requisição desaparece.

**1. O proxy do `next.config.js` é o que sustenta o login.** O comentário lá já diz por quê: o
cookie de sessão é `SameSite=Lax`, então com front e API em domínios diferentes o navegador
**não manda o cookie** — e o login não persiste, sem erro visível na tela. Hoje o `rewrites()`
torna tudo mesma origem. No wrapper não há `rewrites()`, e a chamada vira cross-site.

**Três saídas, e a decisão não é obviamente do Bearer.** Levantadas depois de o usuário
contestar, com razão, que sair do cookie abre porta para roubo de token por XSS:

| Saída | httpOnly | CSRF | Custo |
|---|---|---|---|
| **`SameSite=None` para todos** | mantém | **volta a superfície** — `Lax` era a defesa | precisa de checagem de origem ou token anti-CSRF |
| **`SameSite=None` só para o app** (login decide pelo cliente) | mantém | intacto no navegador | ramo por cliente no auth + WebView |
| **Bearer só no app**, cookie `Lax` no navegador | perde no app | não existe | login em modo nativo + guarda no aparelho |

As duas primeiras exigem, além do atributo, **ligar cookie de terceiro na WebView**:
`setAcceptThirdPartyCookies` é `false` por padrão no Android, então cookie cross-site é descartado
em silêncio — o modo de falhar é o pior possível, o login "funciona" e não persiste.

Contra o Bearer pesa o XSS. A favor, medido em 17/08/2026: **o app não tem um único
`dangerouslySetInnerHTML`, `innerHTML` ou `eval`**, e a WebView carrega apenas arquivos empacotados —
sem CDN, sem script de terceiro. A superfície real é comprometimento de dependência, que rouba o
token com ou sem httpOnly (basta chamar a API de dentro da página).

**Recomendação: a segunda linha.** `SameSite=None` emitido só quando o cliente é o app mantém
httpOnly onde ele protege, **não mexe em nada no caminho do navegador** — que é onde está a maior
parte do uso — e concentra a mudança num ramo do login. A terceira fica como plano B se a WebView
der trabalho com cookie de terceiro.

**Nada disso precisa ser decidido agora:** só importa quando a fase 6 começar, e o teste de relógio
vem antes.

**2. Três rotas dinâmicas não sobrevivem a `output: 'export'`.** `/aula/[id]`, `/planos/[id]` e
`/progresso/[cadeiraId]` exigiriam `generateStaticParams`, e id de aula não dá para enumerar. A pior
parte: `/aula/[id]` é **justamente a tela que o alarme abre**. Ou elas viram parâmetro de busca
(`/aula?id=…`), ou o app aponta para a web publicada com `server.url` — o que reintroduz dependência
de rede e joga fora o local-first da fase 3.

### Quatro frentes, e só uma é o alarme

| Frente | O que é | Tamanho |
|---|---|---|
| **A. Build na nuvem** | GitHub Actions com JDK 17 + Android SDK, `cap sync`, `gradlew`, APK como artefato. Keystore em secrets. Grátis no repo. | pequena |
| **B. Empacotar a web** | ~~`output: 'export'` só no build do wrapper, as três rotas dinâmicas viram query, e a base da API passa a ser URL absoluta.~~ **feita** — ver abaixo. | ~~média~~ |
| **C. Auth cross-origin** | `SameSite=None` só para o app (ver acima), ou Bearer como plano B. | média, e delicada |
| **D. O alarme de verdade** | O plugin nativo descrito acima, mais o pedido de permissão de tela cheia e o fluxo de exceção de bateria. | grande |

Notar que **A é a menor**, e é a única que o usuário mencionou como restrição. Fazer build na nuvem
não é o problema desta fase; é o detalhe mais fácil dela.

### Frente B — feita

`APP_NATIVO=1` (script `build:web:nativo`) troca o mesmo código do build de navegador para
`output: 'export'` + `trailingSlash`. As três rotas dinâmicas viraram rota estática + parâmetro de
busca, e ficaram **dentro da seção** de propósito: `estaNaSecao` casa por prefixo, então uma rota
irmã no topo (`/plano?id=`) apagaria a navegação inteira enquanto ela edita.

| Antes | Agora |
|---|---|
| `/aula/[id]?momento=` | `/aula?id=…&momento=` |
| `/planos/[id]` | `/planos/detalhe?id=` |
| `/progresso/[cadeiraId]` | `/progresso/cadeira?id=` |

Os dois payloads de push em `alarmes.service.ts` e a ação rápida do `sw.js` acompanharam — o
`sw.js` monta a URL por conta própria no botão "registrar", então ficar só nos payloads teria
deixado o atalho do alarme apontando para 404.

Verificado: 15/15 rotas saem como `○ (Static)`, `out/aula/index.html` existe (é a tela que o alarme
abre) e a URL absoluta da API está embutida no bundle. 102 testes de web passando.

**A trava que importa:** o build nativo **recusa** rodar se `NEXT_PUBLIC_API_URL` não for absoluta.
O padrão `/api` do `lib/api.ts` resolveria para `https://localhost/api` dentro da WebView — o app
instalaria, abriria e falharia em toda chamada com cara de "erro de rede", não de configuração
faltando. Falhar no build é a hora barata; depois é APK publicado.

**O que a frente B não resolve:** o login. O `rewrites()` some no wrapper, a chamada vira
cross-site e o cookie `SameSite=Lax` não é enviado. É a frente C, e continua valendo a recomendação
acima — `SameSite=None` só para o app.

### Pré-requisito

Fazer o **teste de relógio da fase 2 no aparelho dela antes de começar a fase 6.** Ele responde a
única pergunta que dimensiona esta fase: o push chega a tempo na escola dela? Se chegar, a fase 6
é conforto — e B + C são muito trabalho para conforto. Se não chegar, ela é o produto.

### Hospedagem — decidido: VPS própria (17/08/2026)

**Isso fecha uma discussão inteira antes de ela virar trabalho.** Serverless (Vercel) e gratuito que
dorme (Render Free) esbarravam no mesmo ponto: sem processo acordado, o `@Cron(EVERY_MINUTE)` dos
dois alarmes não roda, e o alarme por minuto **é** o produto. As saídas eram tirar o agendamento de
dentro do serviço — `pg_cron` do Supabase batendo em `/jobs/alarme-abertura`, que já existe — ou
pagar plano sem sleep.

Com VPS, nada disso é necessário: o processo fica vivo, o `@nestjs/schedule` funciona como escrito,
e a camada 2 volta a ser confiável como o desenho original supunha.

**Consequência para a fase 6:** ela volta a ser sobre a *qualidade* do alarme — furar o silencioso,
tomar a tela — e não sobre compensar um servidor que dorme. O teste de relógio no aparelho dela
continua sendo o que dimensiona a fase.

*Não reintroduzir `pg_cron` nem handler serverless em plano futuro sem que essa decisão mude.*

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
  o que ela teria escrito. O critério é ela reconhecer a própria aula no resumo. *Uma chamada real
  já passou pela Groq (`fbb7499`), com referência vaga e data relativa resolvidas e nenhum nome na
  saída — mas texto escrito por mim não é fala dela, e é a fala dela que decide.*
- **Fase 5** — o teste é de reconhecimento, não de número: abrir o painel do 8º A e ela dizer se
  aquilo bate com onde a turma está. Além disso:
  - **Rascunho não conta:** gerar um resumo por IA sem revisar e conferir que a barra de progresso
    não se mexe. É a regra mais fácil de furar sem ninguém notar.
  - **Tópico repetido conta uma vez:** marcar o mesmo tópico em três aulas e conferir que o
    denominador não some.
  - **Exportação sem fala:** conferir que `transcricaoBruta` e `resumoPadronizado` não aparecem em
    nenhum dos dois formatos. Cobrível por teste — e deve ser, porque é regra de LGPD.
  - **Cadeira sem plano** não mostra barra vazia nem divide por zero.
- **Fase 6** — o mesmo teste de relógio da fase 2, mas **com o celular em modo avião**: é a única
  prova de que a camada 1 existe. Depois: silencioso ligado (o alarme tem de furar) e o app fechado
  há dias (o agendamento tem de sobreviver).
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
reaproveitamento) está em `docs/arquitetura.html`, versionada junto e sincronizada com este
documento — a tabela de IA diz `openai/gpt-oss-120b` pela Groq, que é o que roda. Posso publicá-la
como página compartilhável se você quiser mostrar para a professora.*
