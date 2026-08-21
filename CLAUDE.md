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
| 3 — Registro por texto | feita (`57f85a8`…`eafd4e0`), mais o rascunho local do que ela digita e não salvou; falta só o teste de modo avião |
| 4 — Voz e resumo padronizado | feita e **verificada por chamada real** (`0100041`…`fbb7499`), pela Groq; o caminho Anthropic segue sem saldo |
| 5 — Progresso e histórico | feita (`e5598f2`…`3fd2fd5`); falta o teste de reconhecimento com ela |
| 6 — Capacitor no Android | **em andamento**: frente B (empacotar a web) feita e o lado de API da frente C também (`COOKIE_CROSS_SITE`); faltam A (build na nuvem), o lado wrapper de C e D (o plugin de alarme) — ver "Fase 6 — detalhamento" em `docs/PLANO.md` |
| 7 — Exportação com filtros | **feita**; falta ela exportar um bimestre real e mandar |
| 8 — Importar o Plano de Ensino da Unifor | **feita**, e o PDF é que cria o plano; falta ela importar o dela de verdade |

**Hospedagem: VPS própria** (decidido 17/08/2026). O processo fica vivo, então o
`@Cron(EVERY_MINUTE)` dos dois alarmes funciona como está escrito. **Não proponha serverless nem
`pg_cron` batendo nos endpoints de `/jobs`** — os dois só existiam como contorno para servidor que
dorme, e a decisão já foi tomada. Ver "Hospedagem" em `docs/PLANO.md`.

> Esta tabela ficou três fases atrasada uma vez, enquanto as Convenções abaixo eram atualizadas a
> cada commit. É o primeiro que uma sessão lê: **atualize a linha da fase no mesmo commit que a
> entrega**, senão a próxima sessão começa reconstruindo algo que já existe.

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

- **Comparar com 5 falas reais dela**, que é o critério de aceite da fase (PLANO, "Verificação").
  O que `fbb7499` mediu foram falas de exemplo, não as dela — a resolução de referência funcionou
  ("continuei o que eu tinha planejado" → "Terminou frações equivalentes e iniciou a soma"), mas
  quem decide se o resumo está certo é ela reconhecendo a própria aula.
- **O caminho Anthropic continua não exercitado.** A chave autentica (chega na org e no workspace
  certos), mas toda chamada volta `400` de crédito, e **a cobrança é checada antes da validação de
  parâmetros** — com um modelo inexistente o erro é o mesmo. Então `output_config.format` e a
  ausência de `effort` ainda não foram aceitos por ninguém. Só importa se um dia trocar de provedor:
  hoje quem roda é a Groq, verificada.

### O que falta na fase 3

- **Teste de modo avião no aparelho** — preencher um fechamento offline, fechar o app, voltar
  online. É o critério de aceite da fase e nenhum teste automatizado substitui.

### Pendências humanas (não são de código)

- ~~Rodar as migrações de `semestre` e do anexo de plano~~ — **feito** (16/08/2026). O CHECK
  `anexos_um_dono` foi conferido: recusar anexo sem dono vem dele, não de coluna ausente.

  **Migração continua sendo passo seu, não meu:** a classificação de permissão bloqueia
  `prisma db push` e DDL pelo MCP do Supabase para o agente. Depois de mexer no `schema.prisma`,
  espere o pedido — e lembre que `prisma:rls` **não** é opcional quando o arquivo de SQL muda.

- ~~Gerar as chaves VAPID~~, ~~colar as strings de conexão~~, ~~colar a chave de serviço do
  Storage~~ e ~~colar a chave da Anthropic~~ — **feito**.
- **Colar os dois templates de email no Supabase** (`docs/emails/`, com o passo a passo no
  `README.md` de lá) e conferir a **Site URL** e as **Redirect URLs** do projeto. Enquanto o
  template de fábrica estiver lá, o link de confirmação cai na raiz do site com os tokens no
  fragmento da URL — que nenhuma tela lê — e o de recuperação aponta para uma tela que não existe.
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
npm test              # 255 testes de API (69 de integração, pulados sem TEST_DATABASE_URL) + 215 de web
npm run test:api      # inclui integração contra Postgres real
npm run dev:api       # http://localhost:3333/api
npm run dev:web       # http://localhost:3000
npm run build:web         # build do navegador
npm run build:web:nativo  # build do APK — exige NEXT_PUBLIC_API_URL absoluta
npm run prisma:push && npm run prisma:rls
```

**`next build` exige `NODE_ENV=production`.** Se o ambiente fixar `development` (acontece em
container de agente), o prerender mistura o runtime de desenvolvimento do React e **todas** as
páginas falham com `<Html> should not be imported outside of pages/_document` — inclusive as que
ninguém tocou. O erro aponta para o lugar errado; a causa é a variável.

Depois de mexer no `schema.prisma`: `prisma:generate` → `prisma:push` → `prisma:rls`.
**Tabela nova exige policy nova** em `apps/api/prisma/sql/enable-rls.sql` — o Prisma não
gera RLS, e uma tabela sem policy vaza entre contas sem erro nenhum.

### Subir a API na VPS

`docker-compose.yml` na raiz + `apps/api/Dockerfile`. No EasyPanel: Build Path `.` (a RAIZ — o
`package-lock.json` mora lá e `npm ci` sem ele instala versões diferentes das testadas),
Dockerfile Path `apps/api/Dockerfile`, domínio apontando para a porta de `API_PORT`.

**Um serviço só, e nenhum Postgres no compose:** o banco é o Supabase e o front vai para a Vercel.
Subir um segundo banco ao lado seria dois lugares onde o dado dela pode estar.

**A porta em `expose` é interna do Docker e não briga com o host.** Cada container tem o próprio
espaço de rede, então `3334` aqui dentro convive com qualquer coisa na `3334` da máquina. Só
`ports:` publica de verdade — e publicar deixaria a API em HTTP puro por fora do proxy, com o
cookie `Secure` do outro lado.

**As variáveis obrigatórias usam `${VAR:?}`, que derruba o deploy quando faltam.** É de propósito:
sem `DATABASE_URL` a API sobe, responde 500 em tudo e o health fica vermelho — barulho que custa
meia hora para virar "faltou a variável". As de push entram na mesma lista porque a falha delas é
pior: a API sobe inteira, o app deixa ativar as notificações e nenhum alarme sai.

**O `docker-entrypoint.sh` roda `db push` e o `enable-rls.sql` a cada boot, e é fail-closed.** Os
dois são idempotentes (todo `CREATE POLICY` vem depois de um `DROP POLICY IF EXISTS`), então
repetir é no-op. O RLS vai junto porque tabela nova sem policy vaza entre contas sem erro nenhum —
com ele no boot, é impossível a API subir sem as policies. O `db execute` vai pela `DIRECT_URL`:
DDL pelo pooler em modo transaction falha de formas confusas. Se qualquer passo falhar, o container
não chega a escutar e o EasyPanel mantém o anterior servindo.

**`NODE_OPTIONS=--max-old-space-size` fica abaixo do limite do container** para o V8 coletar lixo
antes de o kernel matar o processo. Sem isso o Node olha a RAM da máquina inteira, enche à vontade
e leva OOM kill — que aparece como "a API reiniciou sozinha", sem nada no log.

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

**Quem rola é o `<main>`, não a página.** A casca é `h-dvh` + `overflow-hidden`, e a barra de baixo
é a última linha do flex — **nada de `fixed`**. Com `fixed bottom-0` (que é o certo no papel) a barra
deslizava junto com o dedo no Safari do iPhone: enquanto a barra do navegador encolhe, o elemento
fixo é posicionado contra o viewport de LAYOUT, que não encolheu, e só assenta quando a rolagem
para. Não há ajuste de `fixed` que conserte — o que conserta é a página não rolar. `dvh` e não `vh`
pelo mesmo motivo: `100vh` no iOS é a altura COM a barra escondida. Consequências que vêm junto:
o `<header>` não precisa mais de `sticky`, o `pb-24` do main sumiu (a barra ocupa espaço em vez de
cobrir), e **o Next rola a JANELA ao trocar de rota** — por isso o `useEffect` que zera o
`scrollTop` do main, senão sair de uma lista longa cairia no meio da tela seguinte. Diálogo em
`<AlertDialog.Portal>` continua fora da casca, então o `overflow-hidden` não o corta. Medido em
viewport de 390×664: `navBottom` = 664 antes e depois de rolar 1200px.

**O alarme é oferecido na HOME, não escondido em Ajustes** (`lib/primeiro-uso.ts`, puro e testado).
Sem isso o caminho para ligar a única coisa que o produto promete era descobrir a tela de Ajustes
sozinha — e o desfecho provável é usar uma semana sem receber aviso e concluir que não funciona.
**Nunca chamar `Notification.requestPermission()` sozinho:** o navegador dá uma chance só, recusa é
quase irreversível no celular, e prompt sem contexto é recusado. O cartão é o pedido ANTES do
pedido; a permissão do sistema só aparece no clique dela. A ordem dos passos é deliberada — instalar
(iOS), ativar, e só então sugerir os padrões: perguntar "quantos minutos antes?" a quem nunca
recebeu um aviso é pedir opinião sobre o que ela não viu funcionar. Dispensar silencia **7 dias, não
para sempre**, e cada passo tem a própria dispensa. Estado em `localStorage` porque permissão é por
aparelho — e porque o sinal de conta que existiria (`Professor.atualizadoEm`) é reescrito a cada
login pelo `upsert` do `garantirPerfil`.

**Tag repetida chega MUDA.** Notificação com a mesma `tag` substitui a anterior, e a plataforma não
re-alerta ao substituir — sem som, sem vibração. Quem pede o contrário é o `renotify`, e **o iOS não
o implementa**. Por isso o push de teste usa `teste-${Date.now()}` e o alerta de erro usa a
assinatura do erro: com tag fixa, o primeiro apitava no iPhone e todos os seguintes chegavam mudos,
que é o oposto do que um botão de teste prova. Os alarmes de aula já nascem únicos
(`abertura-${oc.id}`). **Volume não é ajustável por código**: no iOS o aviso sai no volume de "Toque
e Alertas", que não muda com os botões laterais enquanto "Mudar com Botões" estiver desligado — o
`avisoDeDegradacao` diz onde fica, porque é a única parte que ela pode resolver.

**O clique no alarme abre a AULA, e isso são dois caminhos porque um não basta.** O push manda
`/aula?ocorrencia=…&momento=abertura|fechamento`, e o `notificationclick` do `sw.js` faz três coisas:
foca sem recarregar se a aba já estiver naquela aula (recarregar apagaria texto não salvo), manda
`postMessage` para a página, e chama `navigate()`. Os dois últimos rodam **sem condição**, porque o
modo de falhar do iPhone é o `navigate()` *resolver sem ter navegado* — não existe resposta dele que
sirva de teste, e com o app em segundo plano quem ainda consegue trocar de rota é a página viva
(`<RotaPorNotificacao>`, no `Providers`). O preço é uma recarga a mais; o preço do outro desenho era
abrir a aula errada. **`navigate()` precisa de `await` e de `catch`**: ele REJEITA em aba não
controlada por este service worker, e `includeUncontrolled: true` pede justamente essas — a rejeição
solta matava o `waitUntil` e o clique não fazia nada, sem erro em lugar nenhum. `lib/sw.spec.ts` lê
o `public/sw.js` e o executa contra um `self` de mentira, porque é a única lógica do produto que roda
fora da página: clique que não abre nada não gera erro na tela, nem log na API, nem reclamação do
`next build`. Rodar o spec novo contra o `sw.js` antigo **derruba o processo Node**.

**Alarme ≠ notificação.** `lib/capacidade.ts` decide o que cada aparelho entrega de verdade, e a UI
avisa **antes** quando vai degradar. Prometer alarme que não toca é o pior desfecho do produto —
16 testes travam essa regra.

**Nenhuma rota dinâmica em `app/`.** O wrapper Android é `output: 'export'`, que exige enumerar os
parâmetros de toda rota `[param]` em `generateStaticParams` — e id de ocorrência não dá para
enumerar. Por isso a aula é `/aula?ocorrencia=`, o plano é `/planos/detalhe?plano=` e a turma é
`/progresso/cadeira?cadeira=`. **O parâmetro nomeia a entidade, nunca `id`**: `/aula?id=` não diz
que aquilo é uma `Ocorrencia` (não existe entidade "Aula"), e só o código do fetch revelava —
`/progresso/[cadeiraId]` ao menos dizia. Os detalhes ficam **dentro** da seção (e não em rota irmã no topo) porque
`estaNaSecao` casa por prefixo: `/plano?id=` apagaria a navegação inteira. Quem consome
`useSearchParams` precisa de um limite de `<Suspense>`, senão o build reclama e a página vira
dinâmica de novo. Se criar uma rota `[param]`, o `build:web:nativo` quebra — de propósito.

**Dois builds, um código.** `build:web` é o do navegador (o Next serve, faz proxy da API e devolve
headers); `build:web:nativo` é o do APK (`APP_NATIVO=1` → `output: 'export'`, sem servidor). O
`next.config.mjs` **recusa** o build nativo se `NEXT_PUBLIC_API_URL` não for absoluta: o padrão
`/api` resolveria para `https://localhost/api` dentro da WebView, e o app instalaria, abriria e
falharia em toda chamada com cara de "erro de rede".

**Três lugares guardam trabalho dela, e são degraus diferentes.** A **fila** (`fila-offline.ts`) é
o que ela mandou salvar e a rede não deixou subir. O **rascunho local**
(`rascunho-local.ts` + `usar-rascunho-local.ts`) é o que ela nem chegou a mandar: vivia só em
`useState` e sumia ao trocar de aba, sair da tela ou fechar o app — sem erro, sem aviso. O
**rascunho da IA** (`rascunho.ts`) é o que o modelo escreveu e ela ainda não conferiu. **Nenhum dos
três conta como registro.**

O rascunho local mora numa loja PRÓPRIA do IndexedDB, nunca na da fila: misturados, a sincronização
mandaria para o servidor exatamente o que ela não pediu para salvar. Some sozinho quando fica igual
ao que já está gravado (`recuperar`) — senão o aviso diria "isto não foi salvo" apontando para o que
está salvo — e é podado em 30 dias. A cópia em memória de módulo é o que faz a troca entre "o que
planejo dar" e "o que eu dei" não perder nada: são componentes distintos, e trocar de aba desmonta
um. **Quem usa aplica em DOIS efeitos, servidor primeiro e rascunho por cima.** Num efeito só
(`aplicar(local ?? doServidor)`), toda mudança do servidor reaplicaria o rascunho — ela recupera o
texto, corrige, salva, a consulta volta e a correção sumia. O rascunho é com o que a tela ABRE, não
uma fonte que continua valendo. E a tela **diz** que recuperou, pela mesma razão de `avisar`
separar "registrada" de "salvo no aparelho": texto na tela que não está salvo precisa se anunciar,
senão ela fecha o app achando que a coordenação já pode ver aquilo.

**Saída da IA é sempre rascunho.** `revisadoEm` nulo = não conta como registro. O histórico pode
virar prova de trabalho na frente da coordenação. Quem preenche `revisadoEm` é `salvarFechamento`,
e só ele — gerar um resumo *zera* a marca, porque o que está na tela voltou a ser saída de modelo.

**Um transporte para o modelo, dois usos.** `ModeloService.pedirJson` faz a chamada com schema e
guarda o retry estrito→frouxo, o timeout e a chave; `ResumoService` (fala da aula) e
`ImportacaoService` (PDF do plano) só trocam prompt e schema. `MAX_CARACTERES` em `pdf.ts` são 16
mil porque o plano gratuito da Groq dá **8000 tokens por minuto** — medido, não estimado: 40 mil
levou 429.

**O PDF é que CRIA o plano** (`POST /planos/importar`). Antes, criar um plano pedia nome,
disciplina, ano e semestre — os quatro escritos no documento que ela anexaria no passo seguinte.
Eram três passos até o primeiro clique, e o primeiro deles era digitar a fonte antes de entregá-la.
A ordem dentro do endpoint é a regra: **ler e recusar o que não dá para ler ANTES de criar
qualquer coisa**, senão um PDF escaneado deixa um plano vazio para trás toda vez que ela tenta.
Só o plano e o anexo são gravados — unidades, tópicos, datas e grade continuam nascendo apenas
quando ela confirma. Documento de outro formato ainda cria o plano, com o nome do arquivo
(`planos/identidade.ts`): um formulário antes do upload traria de volta a digitação que este
caminho existe para acabar. Plano repetido **avisa e não bloqueia** — dois semestres com a mesma
disciplina são legítimos.

**Dado que a importação propõe tem de continuar editável DEPOIS.** Nome do plano, datas previstas
da unidade e rótulo da turma nasciam congelados: os três `UpdateDto` sempre aceitaram o `PATCH` e
nenhuma tela chamava, então a conferência da importação era a única janela. O conserto era apagar
e refazer — e apagar plano leva unidades, tópicos e a marcação de todas as aulas; apagar cadeira
leva as aulas inteiras. Renomear passa por `TextoEditavel`, que já é o padrão. **Na cadeira, só a
turma:** disciplina, ano e semestre dizem o que ela É, e trocá-los num clique mudaria a identidade
do grupo com o histórico pendurado — isso é criar outra turma, não corrigir digitação.

**A turma também sai do documento, e turma repetida é REAPROVEITADA.** `Ocorrencia.cadeiraId` é
obrigatório: sem cadeira não há aula, e sem aula não há alarme. Para quem estava começando, o
select de turmas vinha vazio e ela importava o plano inteiro sem conseguir criar uma única aula.
`cadeiraDoDocumento` propõe a turma a partir do `Código/Turma` — `T203 - 30(31)` → `30(31)`, os
**dois** números, porque são a mesma turma encontrando duas vezes por semana e guardar metade
convidaria alguém a cadastrar as duas separadas depois. O rótulo é editável antes de criar (vai
para a grade, o alarme e o relatório da coordenação), e uma cadeira já existente com a mesma
`(disciplina, turma, ano, semestre)` é reusada em vez de duplicada — duas cadeiras para o mesmo
grupo partem o progresso ao meio e disparam alarme em duplicata, com a grade de mesma cara na
tela. Traço sem nada depois não vira turma: `T203 -` no alarme é pior que pedir.

**Guarda de provedor mora junto da CHAMADA ao provedor, nunca na porta do método.** O
`extrair` começava recusando quem não tem `IA_PROVEDOR`, e o parser da Unifor — que não fala com
modelo nenhum — estava atrás dela: sem chave da Groq a tela sumia inteira, e ninguém descobria que
o app lê o documento sozinho. Trancar o caminho grátis com a chave do caminho pago é mudo dos dois
lados. A tela também não esconde mais nada por falta de provedor; documento de formato livre volta
503 dizendo POR QUE. `importacao.service.spec.ts` monta o serviço com um `ModeloService` que
estoura se for chamado — é o que transforma "não precisa de IA" em algo provável.

**O `Plano de Ensino` da Unifor é lido por PARSER, não por modelo** (`ia/unifor.ts`). Formato
regular não precisa de IA: é grátis, instantâneo, funciona sem rede e não tem como alucinar — o
que importa porque unidade errada contamina todo registro que apontar para ela. `ImportacaoService`
tenta o parser primeiro e cai na Groq para documento de formato livre. O parser recebe o texto
**sem o teto** de `MAX_CARACTERES`, que existe pelo limite de tokens da Groq e não vale para quem
não a chama.

**Do cronograma daquele PDF só saem as DATAS, nunca o pareamento data → tópico.** A tabela não tem
régua entre as linhas (das 244 operações de desenho, as horizontais são uma ou duas por página, e
são separadores de seção), e a célula de data é centralizada contra um bloco de altura variável:
três métodos independentes — ordem do texto, centro da célula, réguas — discordam sobre as mesmas
linhas. E mesmo lido certo não serviria: no plano medido `03.01` aparece em 11 aulas seguidas
enquanto `03.02`, `03.03` e `03.04` aparecem uma vez cada. O que cai em cada aula é **estimado**
pelas horas-aula (`planos/cronograma.ts`, maior resto). `unifor.spec.ts` trava isso — é a decisão
que alguém vai querer "melhorar".

**Isso acorda o `calcularRitmo`.** `Unidade.dataFimPrevista` existia desde a fase 1, a API já a
aceitava e o `progresso/calcular.ts` já dependia dela para dizer "4 tópicos e 3 aulas até 30/09" —
e nenhuma tela preenchia. O recurso estava escrito, testado e morto por falta deste dado.

**`M3EF` é turno + dia da semana + tempos, e os dois códigos são UMA cadeira** (`unifor-horarios.ts`).
O dígito é dia na notação brasileira (2=segunda…6=sexta), não número do tempo; as letras são tempos
de 50 min aos pares. `M3EF (30), M5EF (31)` é uma turma que encontra duas vezes por semana — a conta
fecha (4 tempos × 18 semanas = as 72 h/a da ementa). Duas cadeiras partiriam o progresso ao meio e
dariam alarme em duplicata, com a grade de mesma cara na tela. Letras coladas viram UM encontro
(`E+F` = 11:20–13:00); com buraco no meio, o parser recusa. Noite não tem bloco `E/F`.

**A grade importada nasce em DATAS, não em série** (`criarDoCalendario`). O documento traz o
calendário real com os dias sem aula já fora; uma `SerieAula` semanal criaria aula nos feriados da
universidade — e o estrago é o alarme tocando num dia sem aula. Marcar como feriado depois não
resolve: `materializarFaltantes` só cria 60 dias à frente, então metade do semestre nem existe no
banco na hora do import. O preço é não ter regra para editar em bloco, e a tela **diz isso**.
Importar duas vezes é recusado pela checagem de choque, não pelo banco — não há unique em
`(cadeira, data, horaInicio)`.

**PDF escaneado é recusado antes de chamar o modelo.** `pareceEscaneado` mede caracteres por
página; camada de texto vazia produziria unidades inventadas a partir do nada, e plano errado
contamina todo registro que apontar para ele. O arquivo continua guardado para ela consultar.

**Anexo tem exatamente um dono: uma aula ou um plano de curso.** As duas FKs são anuláveis e o
CHECK `anexos_um_dono` (em `sql/enable-rls.sql`, porque o Prisma não expressa isso) garante que
uma e só uma vale. Uma tabela só, e não duas, porque o que tem valor é o caminho de upload —
sanitização de nome, teto de 10 MB, URL assinada na leitura, descarte de áudio; duplicar isso é
como as duas cópias divergem. O documento do plano **não pendura numa aula**: cobre o período
inteiro, e é o que ela olha na tela enquanto digita as unidades.

**401 e 404 têm dois degraus, e o caminho atual é o estado.** `useRedirecionaEmErro`: fora da home
manda para a home, já na home manda para o login. O `apiFetch` já tentou renovar a sessão antes de
o 401 virar erro, mas um endpoint com problema não pode derrubar a sessão inteira — chegar na home
prova que ela está viva. `replace` e não `push`, senão o botão voltar devolve para a tela quebrada
e ela redireciona de novo. **403 fica de fora**: é "área restrita", não sessão morta.

**Todo cancelamento, exclusão e edição destrutiva passa por `<Confirmar>`.** `AlertDialog` do Radix
e não `Dialog` — o alerta obriga uma escolha e não fecha ao clicar fora, e fechar sem responder é o
gesto que produziria o acidente. Nunca `window.confirm`: ele não deixa dizer o que exatamente some
e, no celular, aparece com o endereço do site na frente, parecendo golpe. A descrição diz a
consequência concreta, não "esta ação não pode ser desfeita".

**Exportar são DOIS artefatos, e nunca um.** O resumo das aulas é o que ela entrega; as pendências
são a lista das aulas que ela não registrou — documento contra ela mesma se sair junto por engano.
Botões separados, com o público dito **antes** do clique. O recorte é um só (`FiltroExportacaoDto`,
`ondeDaOcorrencia`) para "o que eu dei" e "o que falta" nunca responderem sobre conjuntos
diferentes. `cadeiraIds: { in: [] }` casa **zero** no Prisma: o vazio não aplica o filtro, e quem
barra o envio sem turma é a tela.

**O arquivo sai por `lib/entrega.ts`, não por `<a download>`.** `navigator.share({ files })` já
funciona no Chrome do Android e no Safari do iOS — não depende do Capacitor, ele só melhora dentro
dele. Duas perguntas e não uma (`temShare` **e** `aceitaArquivo`): há navegador que compartilha
texto e recusa arquivo, e aí a folha do sistema abre e a entrega falha *depois* do clique. O rótulo
do botão promete o gesto — mesma regra de `avisoDeDegradacao`. `AbortError` é **desistência**, não
falha: nada de toast vermelho nem download automático depois de ela fechar a folha.

**Identificação vai no NOME do arquivo, não em cabeçalho dentro do CSV.** Linhas de preâmbulo
quebram justamente o que o CSV serve para fazer — quem abrir vê lixo antes da tabela e todo
importador tropeça. O documento para ler com olho humano é `/historico/relatorio`, e lá a
identificação aparece escrita, com as turmas sempre por extenso.

**A fala não sai pela exportação, e isso é estrutural.** O `select` do `HistoricoService` não busca
`transcricaoBruta` nem `resumoPadronizado` — não é omissão na tela. O histórico alimenta a lista, a
busca, o CSV e o relatório de impressão, e é o artefato que sai da mão dela para a coordenação. A
busca também não varre a fala: busca é o jeito mais fácil de transformar campo privado em índice
consultável.

**Busca ignora acento, por `unaccent`.** Medido: `frações` achava 14 registros e `fracoes` achava
zero. Consulta crua só para colher ids; o `findMany` com os `include` segue em Prisma. Sem a
extensão instalada, degrada para o casamento com acento e loga o comando — nunca 500.

**O endereço da API é decidido em execução, por `lib/base-api.ts`.** `NEXT_PUBLIC_API_URL` é o
padrão do build; a troca pela tela de Ajustes é o que permite conferir a mesma tela contra a API
local e a da VPS sem gerar outro build — e no APK evita um arquivo por ambiente. **Só existe com
`NEXT_PUBLIC_API_ALTERNAVEL=1`**, e o valor guardado é ignorado sem a flag (verificado plantando um
endereço estranho no localStorage). Nunca aceitar o endereço por parâmetro de URL: viajaria num
link e levaria a sessão junto. `validarBase` recusa o que não for http(s) ou caminho relativo — é
o que barra `javascript:` e `data:`, que num campo de endereço são execução de código. Quem troca
limpa o cache do React Query (ele guarda por chave, não por servidor) e avisa por
`EVENTO_BASE_API`, porque o evento `storage` do navegador não dispara na aba que escreveu.

**Toda chamada leva `ngrok-skip-browser-warning`** (`CABECALHOS_DA_API`). No plano gratuito o ngrok
intercepta o que tem cara de navegador e devolve a página de aviso DELE — `200 OK`, `text/html`,
`ngrok-error-code: ERR_NGROK_6024` — sem chamar a API. O `.json()` estoura em cima de HTML e a tela
mostra falha genérica: status 200 na aba de rede, nada no log da API, nenhuma pista do túnel. Vai em
todas, inclusive no `/auth/refresh` e nos anexos — uma chamada que escape volta HTML e derruba a
tela sozinha. Vai também no caminho do proxy, porque o rewrite do Next repassa o que recebeu e o
destino pode ser um túnel. O preflight não precisa dele: o ngrok não intercepta `OPTIONS`, e o
`enableCors` sem `allowedHeaders` já reflete o que o navegador pediu.

**Cookie de sessão não atravessa sites no iPhone, e a tela diz isso antes.** Medido: no Chromium,
`SameSite=None; Secure` entre sites diferentes é guardado E reenviado; no Safari do iOS, não — o
Prevent Cross-Site Tracking vem ligado e descarta o cookie na chegada. O desfecho é mudo dos dois
lados: login responde `201` com os dois `Set-Cookie` corretos, e toda chamada seguinte volta
`401 Token de autenticação ausente`. Nada no log da API além disso, nada na tela além de "sessão
expirada". `avisoDeSessaoCruzada` afirma no iOS e alerta fora dele — mesma regra do
`avisoDeDegradacao`: dizer antes do clique o que o aparelho realmente entrega. **A saída é o proxy**
(`API_INTERNAL_URL`), que devolve tudo para a mesma origem; `COOKIE_CROSS_SITE` só resolve para
navegador que aceita cookie de terceiro, e o iPhone não é um.

A troca aparece em **duas** telas: cartão nos Ajustes e um link discreto **no login**. O login não
é enfeite — os Ajustes ficam atrás dele, então endereço errado deixava um laço fechado: sem alcançar
a API ela não entra, e sem entrar não chega na tela que conserta. **A flag é decidida no BUILD**,
porque o Next inlina `NEXT_PUBLIC_*` no bundle: salvar a variável no painel da hospedagem não muda
nada até sair um build novo (aconteceu num deploy do Vercel — subiu inteiro, sem erro, e só faltava
o botão). Quando a troca some da tela, suspeite da variável ausente antes do código;
`components/trocar-api.spec.ts` trava os dois lados, porque a falha é muda nos dois.

**O cookie de sessão é `SameSite=Lax`, e `COOKIE_CROSS_SITE=1` é a exceção consciente.** No
caminho normal o front pede `/api` da própria origem e o Next repassa — tudo same-origin, `Lax`
vale e não há preflight. Quando o front fala DIRETO com a API (front publicado apontando para um
túnel ou para a VPS, e o wrapper), `Lax` faz o navegador **guardar o cookie e não mandá-lo**: o
login parece dar certo e a tela seguinte já está deslogada, sem erro em lugar nenhum. A variável
troca para `None` e **força `Secure` junto** — sem ele o navegador descarta calado, então os dois
lados precisam ser https. Ligar isso afrouxa uma defesa de verdade (`Lax` é o que impede site
qualquer de disparar chamada autenticada em nome dela) e deixa o `WEB_ORIGIN` como único porteiro:
mantenha aquela lista curta. `clearSessionCookies` repete os mesmos atributos de propósito — cookie
apagado com `SameSite` diferente é outro cookie, e o antigo sobreviveria ao logout.

**Chave de terceiro nunca vai para o navegador.** `ANTHROPIC_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY`
existem só dentro de `ResumoService` e `StorageService`. É por isso que upload e resumo passam pela
API em vez de o front falar direto com o serviço.

**Cartão tem um respiro só, sem degrau por tamanho de tela.** O `cn` resolve conflito do Tailwind
pelo MODIFICADOR, então um `sm:pt-0` no primitivo sobrevive a um `py-3` vindo de fora — e como
media query sai depois no CSS, ela ganha. Medido: acima de 640px, todo `<CardContent
className="py-3">` ficava com **zero** de padding em cima e 20 embaixo (pendências, progresso,
filtro e cada linha do histórico, com o texto encostado na borda). No celular estava certo, e é por
isso que passou tanto tempo. A regra que sobra: **`components/ui/*` não põe classe com `sm:` no que
o `className` pode querer sobrescrever**.

**`Label` ao lado de botão precisa de `block`.** `<label>` é inline e `Button` é inline-flex: os
dois caem na mesma linha e o `space-y` do pai não separa nada — margem entre irmãos não vale para
caixas na mesma linha. Era o que punha "Anexos" grudado em "Anexar foto ou PDF". Só aparece onde o
irmão do rótulo não é um `<input>` de bloco.

**A `AppShell` É a fronteira de autenticação.** `useExigeSessao` pergunta `/auth/eu` uma vez por
carregamento e, sem sessão, a casca nem renderiza os filhos — vai para o login. Não dá para ser
middleware: o build do wrapper é `output: 'export'` e não tem servidor. Antes, cada tela descobria
o 401 pela própria consulta, e quem esquecesse o `useRedirecionaEmErro` (os Ajustes) ficava
carregando para sempre; pior, **o modo de falhar era mostrar a tela VAZIA** — "Nenhum plano de curso
ainda" para quem só está deslogada. `/historico/relatorio` chama o hook à mão, porque é a única tela
autenticada sem casca. **Só 401 conta como deslogada**: rede caída vira `TypeError` e não pode
expulsar do app justo quem está offline com registro na fila.

**`ApiError.sessaoMorta` é o que separa os dois 401.** Só é verdade quando o `apiFetch` já tentou
renovar e falhou — aí não há sessão, e `destinoDoErro` pula o degrau da home. O degrau continua
existindo para o 401 que sobrevive a uma renovação bem-sucedida: aí quem recusou foi o endpoint, e
um endpoint com problema não pode derrubar a sessão inteira. `podeRenovar` lista as rotas que
ESTABELECEM sessão (`/auth/login`, `signup`, `refresh`, `logout`) em vez de barrar o prefixo
`/auth/` inteiro — a regra antiga barrava `/auth/eu` e jogava para o login quem só estava com o
access token de uma hora vencido.

**Cancelar aula sai da tela, e a volta é medida pelo `history.length`** (`lib/navegacao.ts`).
Cancelada, a tela deixou de ter assunto: o formulário some e sobra um cartão dizendo que a aula não
vai acontecer. Volta para de onde ela veio — e **para a home quando não há de onde**, que é o caso
do alarme: o push abre `/aula?ocorrencia=` direto, e `history.back()` ali sairia do app (tela branca
num app instalado). A conta é o CRESCIMENTO do `history.length` desde o carregamento, não um
contador de rotas visitadas: `replace` não empilha entrada, e é assim que `<RotaPorNotificacao>`
troca de rota — um contador próprio acharia que houve navegação e mandaria `back()` para fora.
Comparar com o valor do carregamento também descarta o site de onde ela veio. "Devolver à grade" NÃO
volta: ali ela está retomando o trabalho nesta aula.

**Horário repetido é oferta, nunca automatismo** (`ofertaDeRepeticao`). Marcados ter, qui e sex, os
três nascem no padrão; ao corrigir um, o botão oferece levar a mesma faixa aos outros e **diz quais
dias mudam antes do toque**. Some depois de ela mexer em DOIS dias — aí ela está dizendo que a grade
não é uniforme, e insistir apagaria o que acabou de digitar. Complementa a herança que já existia no
`alternarDia`, que só cobre quem acerta a hora antes de marcar os outros dias.

**O link do email nunca leva credencial ao navegador.** Os dois templates (`docs/emails/`) mandam o
`{{ .TokenHash }}` para uma tela nossa (`/senha?codigo=`, `/confirmar?codigo=`), e quem troca por
sessão é a API pelo `/auth/v1/verify` — mesmo cookie httpOnly do login. O padrão do Supabase
(`{{ .ConfirmationURL }}`) devolve com os tokens no FRAGMENTO da URL, que nenhuma tela lê: o
desfecho era ela confirmar o cadastro, cair no login e concluir que não funcionou. `POST
/auth/recuperar` responde `{ ok: true }` sempre, com email cadastrado ou não — mesma regra do login,
senão o formulário vira verificador de quem tem conta.

**Fuso na tela é cidade, não identificador** (`lib/fuso.ts`). `America/Sao_Paulo` é nome de sistema;
o que fica guardado continua sendo o IANA inteiro, porque é ele que faz a conta de hora. Fuso
desconhecido degrada para o último trecho — nunca para vazio, senão ela deixa de saber em que fuso
está.

**Nome de aluno não entra no REGISTRO** (dado pessoal de menor). Não é só instrução de prompt: o
JSON schema de saída não tem campo de pessoa, então não há onde um nome caber mesmo se o modelo
desobedecer. A fala dela (`transcricaoBruta`) pode conter nome e **é guardada** — só ela vê. Áudio
é descartado na revisão. Ver "LGPD" em `docs/PLANO.md`.

**Duas turmas no mesmo horário são recusadas, e a mensagem diz qual.** `series/conflito.ts` é puro
e testado; `recusarSeChocar` compara contra as OCORRÊNCIAS já materializadas, não contra as outras
séries — só elas sabem em que dias a regra de fato cai (quinzenal alternando, série encerrada, aula
cancelada à mão). Canceladas ficam de fora: aula desmarcada não ocupa horário. **Encostar não é
sobrepor** — 07:50 depois de 07:00–07:50 é o intervalo entre dois tempos, e tratar isso como choque
tornaria a checagem inútil justo para quem dá aulas seguidas. Ao editar, a própria série é ignorada,
senão toda edição chocaria consigo mesma. O choque DENTRO do mesmo formulário é checado à parte
(`choqueInterno`): as ocorrências dele ainda não existem, e a checagem de duplicata não pega, porque
`(dia, horaInicio)` são diferentes. O estrago que isso evita não é a linha errada na grade — são os
dois alarmes de abertura tocando no mesmo minuto para turmas diferentes.

**Registrar não tem janela de tempo.** Os 5 minutos de antecedência/atraso são só quando o *alarme
toca*; `salvarAbertura` e `salvarFechamento` nunca olharam o relógio. `GET /agenda/pendencias` é a
porta de quem não conseguiu escrever na hora — sem ela, registrar a terça passada exigia lembrar a
data e voltar semana a semana na grade.

**Admin é `ADMIN_EMAIL`, não coluna no banco.** `AdminGuard` compara o email do JWT com a variável
de ambiente. Uma flag `ehAdmin` no `Professor` estaria a um `UPDATE` de virar escalação de
privilégio, e o `ErrosService` já escolhe quem alertar por este mesmo caminho.

**O Admin está em UMA das duas navegações, e as duas trocam no mesmo ponto.** Ele fica só na barra
do topo (desktop): a de baixo tem cinco lugares e eles são das telas do dia a dia, não de uma tela
que existe para uma conta só. O preço disso era um beco sem saída — no celular não havia caminho
nenhum para `/admin`, e a saída era digitar a URL. Quem cobre é um cartão nos Ajustes com
`SO_NO_CELULAR`, o par de `NAV_SO_NO_DESKTOP` que a casca exporta. **Nunca escrever `sm:hidden` à
mão numa tela**: com os dois lados separados, mudar o breakpoint de um deixa uma faixa de largura
sem caminho nenhum, e isso não gera erro, log nem reclamação de build — só uma tela que não oferece
nada. `app-shell.spec.ts` compara os dois. A classe também vai por extenso e nunca montada com
template: o Tailwind varre o código atrás do TEXTO dela, e `` `${ponto}:hidden` `` não gera CSS
nenhum. Quem decide se você é admin continua sendo o servidor (`useEhAdmin` → `/admin/status`).
