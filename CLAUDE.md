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
| 4 — Voz e resumo padronizado | feita e **verificada por chamada real** (`0100041`…`fbb7499`), pela Groq; o caminho Anthropic segue sem saldo |
| 5 — Progresso e histórico | feita (`e5598f2`…`3fd2fd5`); falta o teste de reconhecimento com ela |
| 6 — Capacitor no Android | **em andamento**: frente B (empacotar a web) feita e o lado de API da frente C também (`COOKIE_CROSS_SITE`); faltam A (build na nuvem), o lado wrapper de C e D (o plugin de alarme) — ver "Fase 6 — detalhamento" em `docs/PLANO.md` |
| 7 — Exportação com filtros | **feita** (`HEAD`); falta ela exportar um bimestre real e mandar |

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
npm test              # 166 testes de API (63 de integração, pulados sem TEST_DATABASE_URL) + 116 de web
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

**Saída da IA é sempre rascunho.** `revisadoEm` nulo = não conta como registro. O histórico pode
virar prova de trabalho na frente da coordenação. Quem preenche `revisadoEm` é `salvarFechamento`,
e só ele — gerar um resumo *zera* a marca, porque o que está na tela voltou a ser saída de modelo.

**Um transporte para o modelo, dois usos.** `ModeloService.pedirJson` faz a chamada com schema e
guarda o retry estrito→frouxo, o timeout e a chave; `ResumoService` (fala da aula) e
`ImportacaoService` (PDF do plano) só trocam prompt e schema. `MAX_CARACTERES` em `pdf.ts` são 16
mil porque o plano gratuito da Groq dá **8000 tokens por minuto** — medido, não estimado: 40 mil
levou 429.

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
