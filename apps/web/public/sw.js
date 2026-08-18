// Service worker — recebe o push e mostra a notificação.
//
// A diferença para o projeto-professor, de onde este arquivo veio: som e
// vibração chegam NO PAYLOAD em vez de saírem de uma tabela fixa aqui. A
// intensidade é escolha da professora por cadeira, então o SW não tem como
// saber qual usar — ele só sabe o que chegou.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const ICONE = {
  ABERTURA_AULA: '/icons/abertura.png',
  FECHAMENTO_AULA: '/icons/fechamento.png',
  SEM_REGISTRO: '/icons/alerta.png',
  GERAL: '/icons/icone.png',
};

// Padrões de vibração por tipo. Distinguíveis no bolso: abertura é um toque
// curto ("vai começar"), fechamento é mais insistente ("registra agora, antes
// de esfriar").
const VIBRACAO = {
  ABERTURA_AULA: [200, 100, 200],
  FECHAMENTO_AULA: [300, 150, 300, 150, 300],
  SEM_REGISTRO: [400, 200, 400],
  GERAL: [200],
};

const ROTA_PADRAO = {
  ABERTURA_AULA: '/',
  FECHAMENTO_AULA: '/',
  SEM_REGISTRO: '/',
  GERAL: '/',
};

self.addEventListener('push', (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { title: 'Projeto Isaura', body: event.data ? event.data.text() : '' };
  }

  const tipo = dados.tipo || 'GERAL';
  const ehAlarme = dados.intensidade === 'ALARME';

  event.waitUntil(
    self.registration.showNotification(dados.title || 'Projeto Isaura', {
      body: dados.body || '',
      icon: ICONE[tipo] || ICONE.GERAL,
      badge: '/icons/badge.png',
      tag: dados.tag,
      data: {
        url: dados.url || null,
        ocorrenciaId: dados.ocorrenciaId,
        tipo,
      },
      actions: Array.isArray(dados.actions) ? dados.actions.slice(0, 2) : [],
      // `vibra: false` tem de significar silêncio de verdade — por isso o array
      // vazio, e não o padrão do tipo.
      vibrate: dados.vibra === false ? [] : VIBRACAO[tipo] || VIBRACAO.GERAL,
      silent: dados.som === false,
      // `renotify` exige `tag`; sem ela o navegador reclama no console.
      renotify: Boolean(dados.tag),
      // Alarme fica na tela até ela interagir. Notificação normal também, aqui:
      // o ponto do produto é justamente não deixar o registro passar batido.
      requireInteraction: true,
      // Só o wrapper nativo entrega alarme de verdade. No navegador isto é o
      // mais perto que dá — e a tela de configuração já avisou que seria assim.
      urgency: ehAlarme ? 'high' : 'normal',
    }),
  );
});

/** Mesmo valor de `lib/rota-notificacao.ts` — mudar de um lado só faz o clique virar nada. */
const CANAL_ROTA = 'ir-para';

function mesmaTela(urlDaAba, alvo) {
  try {
    const a = new URL(urlDaAba);
    const b = new URL(alvo, self.location.origin);
    return a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
}

/**
 * O caminho do clique até a tela da aula — e por que ele tem degraus.
 *
 * O desenho anterior tinha um só (`navigate()` e pronto) e falhava MUDO no
 * iPhone: o app vinha para a frente na tela em que ela tinha parado, como se o
 * alarme não soubesse de qual aula era. Um alarme que não abre o registro é um
 * alarme que não serve.
 *
 * 1. **Aba já no destino** — só focar. Não recarrega a tela que ela já está
 *    olhando, o que apagaria texto ainda não salvo.
 * 2. **`postMessage` para a página** — é o degrau que funciona no iPhone com o
 *    app em segundo plano: ali o `navigate()` daqui resolve SEM navegar, e quem
 *    consegue trocar de rota é a própria página, que está viva. Quem escuta é
 *    `<RotaPorNotificacao>`.
 * 3. **`navigate()`** — cobre a aba que não está ouvindo (build antigo em
 *    cache) e é o que funciona no Android e no navegador. Precisa de `await` e
 *    de `catch`: ele REJEITA quando a aba não é controlada por este service
 *    worker, e `includeUncontrolled: true` pede justamente essas abas. Sem o
 *    catch a rejeição ficava solta, o `waitUntil` morria junto e o `openWindow`
 *    nunca era alcançado — que é como um clique virava nada.
 *
 * Os degraus 2 e 3 rodam os dois, sem condição: o modo de falhar do iOS é o
 * `navigate()` RESOLVER sem ter navegado, então não existe resposta dele que
 * sirva de teste. Os dois apontam para a mesma URL, então o pior caso aqui é
 * uma recarga a mais — e o pior caso do outro desenho é abrir a aula errada.
 */
async function abrirNoApp(url) {
  const abas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const aba = abas.find((a) => 'focus' in a);

  // App fechado: `openWindow` é o único caminho, e é o que funciona em todo
  // lugar. É também o único caso em que o iPhone acerta sozinho.
  if (!aba) return self.clients.openWindow ? self.clients.openWindow(url) : undefined;

  if (mesmaTela(aba.url, url)) return aba.focus();

  aba.postMessage({ tipo: CANAL_ROTA, url });
  if (typeof aba.navigate === 'function') {
    await aba.navigate(url).catch(() => undefined);
  }
  return aba.focus();
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};

  // Precedência: ação rápida > url do payload > rota padrão do tipo > home.
  let url;
  if (event.action === 'registrar' && d.ocorrenciaId) url = `/aula?ocorrencia=${d.ocorrenciaId}`;
  else if (d.url) url = d.url;
  else url = ROTA_PADRAO[d.tipo] || '/';

  event.waitUntil(abrirNoApp(url));
});
