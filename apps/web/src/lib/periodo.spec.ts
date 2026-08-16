import { periodoLetivo, semestreDoCampo } from './periodo';

describe('periodoLetivo', () => {
  it('escreve o semestre no formato da faculdade', () => {
    expect(periodoLetivo(2026, 1)).toBe('2026.1');
    expect(periodoLetivo(2026, 2)).toBe('2026.2');
  });

  it('sem semestre, mostra só o ano', () => {
    // A escola básica trabalha o ano inteiro — "2026.0" ou "2026.null" na tela
    // seria pior do que não ter o campo.
    expect(periodoLetivo(2026, null)).toBe('2026');
    expect(periodoLetivo(2026, undefined)).toBe('2026');
    expect(periodoLetivo(2026)).toBe('2026');
  });
});

describe('semestreDoCampo', () => {
  it('converte a escolha do select em número', () => {
    expect(semestreDoCampo('1')).toBe(1);
    expect(semestreDoCampo('2')).toBe(2);
  });

  it('"ano inteiro" não vira 0 — vira ausência', () => {
    // `Number('')` é 0, e 0 passaria pelo `@Min(1)` da API como erro de
    // validação em vez de "não informado".
    expect(semestreDoCampo('')).toBeUndefined();
  });
});
