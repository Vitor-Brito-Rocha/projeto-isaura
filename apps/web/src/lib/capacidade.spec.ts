import {
  avisoDeDegradacao,
  detectarCapacidade,
  intensidadeEfetiva,
  rotuloCapacidade,
  type Capacidade,
} from './capacidade';

const TODAS: Capacidade[] = [
  'NATIVO',
  'ANDROID_WEB',
  'IOS_PWA',
  'IOS_NAVEGADOR',
  'DESKTOP',
  'SEM_SUPORTE',
];

describe('intensidadeEfetiva', () => {
  it('só o wrapper nativo entrega ALARME de verdade', () => {
    expect(intensidadeEfetiva('ALARME', 'NATIVO')).toBe('ALARME');
  });

  it('em todo o resto, ALARME vira notificação', () => {
    for (const c of TODAS.filter((c) => c !== 'NATIVO')) {
      expect(intensidadeEfetiva('ALARME', c)).toBe('NOTIFICACAO');
    }
  });

  it('NOTIFICACAO e SILENCIOSO passam intactos em qualquer aparelho', () => {
    for (const c of TODAS) {
      expect(intensidadeEfetiva('NOTIFICACAO', c)).toBe('NOTIFICACAO');
      expect(intensidadeEfetiva('SILENCIOSO', c)).toBe('SILENCIOSO');
    }
  });
});

describe('avisoDeDegradacao', () => {
  it('não avisa quando a escolha é entregue como pedida', () => {
    expect(avisoDeDegradacao('ALARME', 'NATIVO')).toBeNull();
    expect(avisoDeDegradacao('NOTIFICACAO', 'ANDROID_WEB')).toBeNull();
    expect(avisoDeDegradacao('SILENCIOSO', 'IOS_PWA')).toBeNull();
  });

  it('avisa sempre que ALARME for rebaixado — esta é a regra do produto', () => {
    // O pior desfecho possível deste app é ela confiar num alarme que não toca.
    // Se algum aparelho rebaixa em silêncio, este teste falha.
    for (const c of TODAS.filter((c) => c !== 'NATIVO')) {
      expect(avisoDeDegradacao('ALARME', c)).toBeTruthy();
    }
  });

  it('no iPhone sem instalar, avisa mesmo com intensidade branda', () => {
    // Aqui nem notificação funciona: a Push API do iOS só existe para app na
    // tela inicial. Silenciar este caso deixaria a professora achando que está
    // coberta quando não recebe nada.
    expect(avisoDeDegradacao('SILENCIOSO', 'IOS_NAVEGADOR')).toContain('Tela de Início');
    expect(avisoDeDegradacao('NOTIFICACAO', 'IOS_NAVEGADOR')).toContain('Tela de Início');
  });

  it('sem suporte, o aviso diz que os registros continuam salvos', () => {
    // A pessoa não pode concluir que perdeu o trabalho junto com o alarme.
    expect(avisoDeDegradacao('NOTIFICACAO', 'SEM_SUPORTE')).toContain('continuam salvos');
  });

  it('explica que a limitação do iPhone é do iOS, não do app', () => {
    expect(avisoDeDegradacao('ALARME', 'IOS_PWA')).toContain('limitação do iOS');
  });

  it('no Android web, aponta o caminho de saída', () => {
    expect(avisoDeDegradacao('ALARME', 'ANDROID_WEB')).toContain('Instalar o app');
  });
});

describe('rotuloCapacidade', () => {
  it('tem rótulo para todas as capacidades', () => {
    for (const c of TODAS) {
      expect(rotuloCapacidade(c)).toBeTruthy();
    }
  });
});

describe('detectarCapacidade', () => {
  const globalQualquer = globalThis as Record<string, unknown>;
  const original = { window: globalQualquer.window, navigator: globalQualquer.navigator, document: globalQualquer.document };

  afterEach(() => {
    globalQualquer.window = original.window;
    globalQualquer.navigator = original.navigator;
    globalQualquer.document = original.document;
  });

  function simular(opcoes: {
    ua: string;
    capacitor?: boolean;
    standalone?: boolean;
    comPush?: boolean;
  }) {
    const comPush = opcoes.comPush ?? true;
    globalQualquer.window = {
      ...(opcoes.capacitor ? { Capacitor: {} } : {}),
      ...(comPush ? { PushManager: function () {} } : {}),
      matchMedia: () => ({ matches: Boolean(opcoes.standalone) }),
    };
    globalQualquer.navigator = {
      userAgent: opcoes.ua,
      ...(comPush ? { serviceWorker: {} } : {}),
      ...(opcoes.standalone !== undefined ? { standalone: opcoes.standalone } : {}),
    };
    globalQualquer.document = {};
  }

  const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1';
  const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile';
  const UA_DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120';

  it('o wrapper ganha de tudo', () => {
    // Mesmo com UA de iPhone: se o Capacitor está lá, o app é nativo e o alarme
    // é real. A ordem da checagem importa.
    simular({ ua: UA_IPHONE, capacitor: true });
    expect(detectarCapacidade()).toBe('NATIVO');
  });

  it('iPhone instalado na tela inicial', () => {
    simular({ ua: UA_IPHONE, standalone: true });
    expect(detectarCapacidade()).toBe('IOS_PWA');
  });

  it('iPhone no Safari comum', () => {
    simular({ ua: UA_IPHONE, standalone: false });
    expect(detectarCapacidade()).toBe('IOS_NAVEGADOR');
  });

  it('Android no navegador', () => {
    simular({ ua: UA_ANDROID });
    expect(detectarCapacidade()).toBe('ANDROID_WEB');
  });

  it('desktop', () => {
    simular({ ua: UA_DESKTOP });
    expect(detectarCapacidade()).toBe('DESKTOP');
  });

  it('navegador sem Push API', () => {
    simular({ ua: UA_DESKTOP, comPush: false });
    expect(detectarCapacidade()).toBe('SEM_SUPORTE');
  });
});
