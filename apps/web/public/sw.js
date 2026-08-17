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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};

  // Precedência: ação rápida > url do payload > rota padrão do tipo > home.
  let url;
  if (event.action === 'registrar' && d.ocorrenciaId) url = `/aula?id=${d.ocorrenciaId}`;
  else if (d.url) url = d.url;
  else url = ROTA_PADRAO[d.tipo] || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
      for (const aba of abas) {
        if ('focus' in aba) {
          aba.navigate(url);
          return aba.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
