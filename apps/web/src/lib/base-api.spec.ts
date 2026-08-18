import {
  avisoDeBase,
  avisoDeSessaoCruzada,
  ehOutroSite,
  normalizarBase,
  validarBase,
} from './base-api';

describe('normalizarBase', () => {
  /**
   * A barra final é o caso comum de copiar e colar do navegador, e
   * `${base}${caminho}` viraria `//agenda` — que o navegador resolve como outro
   * HOST, não como caminho relativo. Falha confusa o bastante para normalizar.
   */
  it('tira barra final, que viraria outro host', () => {
    expect(normalizarBase('http://localhost:3333/api/')).toBe('http://localhost:3333/api');
    expect(normalizarBase('http://localhost:3333/api///')).toBe('http://localhost:3333/api');
  });

  it('tira espaço de quem colou com sobra', () => {
    expect(normalizarBase('  https://api.exemplo.com/api  ')).toBe('https://api.exemplo.com/api');
  });

  it('deixa o caminho relativo em paz', () => {
    expect(normalizarBase('/api')).toBe('/api');
  });
});

describe('validarBase', () => {
  it('aceita os três formatos que fazem sentido', () => {
    expect(validarBase('http://localhost:3333/api')).toBeNull();
    expect(validarBase('https://api.exemplo.com/api')).toBeNull();
    expect(validarBase('/api')).toBeNull();
  });

  it('recusa vazio, e diz o que fazer', () => {
    expect(validarBase('')).toMatch(/Digite/);
    expect(validarBase('   ')).toMatch(/Digite/);
  });

  /**
   * O que mais importa aqui.
   *
   * Num campo que vira endereço de requisição, `javascript:` e `data:` são
   * execução de código, não navegação. A regra de só aceitar http(s) ou caminho
   * relativo é o que os barra — e ela precisa de teste porque é fácil alguém
   * "melhorar" a validação depois e abrir isso sem perceber.
   */
  it('recusa esquema que não é http — inclusive os que executam código', () => {
    expect(validarBase('javascript:alert(1)')).not.toBeNull();
    expect(validarBase('data:text/html,<script>alert(1)</script>')).not.toBeNull();
    expect(validarBase('file:///etc/passwd')).not.toBeNull();
    expect(validarBase('ftp://exemplo.com')).not.toBeNull();
  });

  it('recusa texto solto que não é endereço', () => {
    expect(validarBase('localhost:3333')).not.toBeNull();
    expect(validarBase('api.exemplo.com')).not.toBeNull();
  });

  it('recusa esquema sem host', () => {
    expect(validarBase('https://')).not.toBeNull();
  });
});

describe('avisoDeBase', () => {
  /**
   * Avisa, não impede: a API pode estar atrás de um proxy que já resolve o
   * prefixo. Mas esquecer o `/api` dá 404 em toda chamada com cara de servidor
   * fora do ar, e é o erro mais provável de quem digita o endereço.
   */
  it('lembra do sufixo /api sem bloquear', () => {
    expect(avisoDeBase('http://localhost:3333')).toMatch(/\/api/);
    expect(avisoDeBase('http://localhost:3333/api')).toBeNull();
  });

  it('não avisa sobre endereço que nem é válido — a validação já falou', () => {
    expect(avisoDeBase('javascript:alert(1)')).toBeNull();
    expect(avisoDeBase('')).toBeNull();
  });
});

describe('ehOutroSite', () => {
  /**
   * Porta não conta para cookie: `localhost:3000` e `localhost:3333` são o
   * mesmo site, e é a topologia normal do desenvolvimento. Avisar ali seria
   * alarme falso todo dia — e alarme falso todo dia é aviso que ninguém lê.
   */
  it('porta diferente não é outro site', () => {
    expect(ehOutroSite('http://localhost:3333/api', 'http://localhost:3000')).toBe(false);
  });

  it('caminho relativo nunca é outro site — é a própria origem', () => {
    expect(ehOutroSite('/api', 'https://projeto-isaura.vercel.app')).toBe(false);
  });

  /** O caso que custou a tarde: front publicado falando com um túnel. */
  it('vercel falando com ngrok é outro site', () => {
    expect(
      ehOutroSite('https://xyz.ngrok-free.dev/api', 'https://projeto-isaura.vercel.app'),
    ).toBe(true);
  });

  it('subdomínio do mesmo domínio não é outro site', () => {
    expect(ehOutroSite('https://api.exemplo.com/api', 'https://app.exemplo.com')).toBe(false);
  });

  it('endereço inválido não vira aviso — a validação já falou', () => {
    expect(ehOutroSite('javascript:alert(1)', 'https://app.exemplo.com')).toBe(false);
  });
});

describe('avisoDeSessaoCruzada', () => {
  const vercel = 'https://projeto-isaura.vercel.app';
  const tunel = 'https://xyz.ngrok-free.dev/api';

  /**
   * No iPhone não é risco, é certeza: o Safari vem com Prevent Cross-Site
   * Tracking ligado e descarta o cookie de outro site mesmo com
   * `SameSite=None; Secure`. O texto precisa dizer isso sem rodeio — foi
   * exatamente aqui que "login OK e tela seguinte deslogada" queimou uma tarde.
   */
  it('no iPhone afirma que a sessão não vai durar', () => {
    const m = avisoDeSessaoCruzada(tunel, vercel, true)!;
    expect(m).toMatch(/NÃO vai durar/);
    expect(m).toMatch(/Safari/);
  });

  it('fora do iOS avisa do risco, sem afirmar', () => {
    const m = avisoDeSessaoCruzada(tunel, vercel, false)!;
    expect(m).toMatch(/pode não durar/);
  });

  it('cala a boca no caminho normal, em qualquer aparelho', () => {
    expect(avisoDeSessaoCruzada('/api', vercel, true)).toBeNull();
    expect(avisoDeSessaoCruzada('/api', vercel, false)).toBeNull();
  });

  it('cala a boca entre portas do localhost', () => {
    expect(avisoDeSessaoCruzada('http://localhost:3333/api', 'http://localhost:3000', false)).toBeNull();
  });
});
