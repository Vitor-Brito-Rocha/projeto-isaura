import { avisoDeBase, normalizarBase, validarBase } from './base-api';

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
