import {
  dataIsoNaTz,
  hhmmNaTz,
  instanteDeParede,
  minutos,
  offsetMinutos,
  somarDias,
} from './tz';

describe('tz', () => {
  describe('offsetMinutos', () => {
    it('devolve -180 para São Paulo (sem horário de verão desde 2019)', () => {
      expect(offsetMinutos(new Date('2026-08-14T12:00:00Z'), 'America/Sao_Paulo')).toBe(-180);
      // Em janeiro, quando o horário de verão existia antigamente.
      expect(offsetMinutos(new Date('2026-01-14T12:00:00Z'), 'America/Sao_Paulo')).toBe(-180);
    });

    it('distingue os fusos brasileiros', () => {
      const instante = new Date('2026-08-14T12:00:00Z');
      expect(offsetMinutos(instante, 'America/Rio_Branco')).toBe(-300); // Acre, UTC−5
      expect(offsetMinutos(instante, 'America/Manaus')).toBe(-240); // UTC−4
      expect(offsetMinutos(instante, 'America/Noronha')).toBe(-120); // UTC−2
    });
  });

  describe('instanteDeParede', () => {
    it('converte 07:00 de São Paulo para 10:00 UTC', () => {
      const t = instanteDeParede('2026-08-14', '07:00', 'America/Sao_Paulo');
      expect(t.toISOString()).toBe('2026-08-14T10:00:00.000Z');
    });

    it('a mesma hora de parede é um instante diferente em cada fuso', () => {
      const sp = instanteDeParede('2026-08-14', '07:00', 'America/Sao_Paulo');
      const acre = instanteDeParede('2026-08-14', '07:00', 'America/Rio_Branco');
      // Este é o teste que justifica a coluna timestamptz: com comparação por
      // string de "HH:mm", estes dois disparariam no mesmo tick do cron.
      expect(acre.getTime() - sp.getTime()).toBe(2 * 60 * 60 * 1000);
    });

    it('atravessa a virada do dia sem perder a data', () => {
      const t = instanteDeParede('2026-08-14', '22:30', 'America/Sao_Paulo');
      expect(t.toISOString()).toBe('2026-08-15T01:30:00.000Z');
    });

    it('resolve a borda de horário de verão (Nova York, primavera)', () => {
      // 2026-03-08: EST (−5) vira EDT (−4) às 02:00 local.
      const antes = instanteDeParede('2026-03-08', '01:00', 'America/New_York');
      const depois = instanteDeParede('2026-03-08', '03:00', 'America/New_York');
      expect(antes.toISOString()).toBe('2026-03-08T06:00:00.000Z');
      expect(depois.toISOString()).toBe('2026-03-08T07:00:00.000Z');
      // Uma hora de parede de diferença aparente, mas só uma hora real —
      // é a hora que não existiu. A segunda passada é o que acerta isto.
      expect(depois.getTime() - antes.getTime()).toBe(60 * 60 * 1000);
    });
  });

  describe('ida e volta', () => {
    it('hhmmNaTz desfaz instanteDeParede', () => {
      for (const tz of ['America/Sao_Paulo', 'America/Rio_Branco', 'America/Noronha']) {
        const t = instanteDeParede('2026-08-14', '07:50', tz);
        expect(hhmmNaTz(t, tz)).toBe('07:50');
        expect(dataIsoNaTz(t, tz)).toBe('2026-08-14');
      }
    });

    it('preserva a data de parede perto da meia-noite', () => {
      const t = instanteDeParede('2026-08-14', '23:50', 'America/Sao_Paulo');
      expect(dataIsoNaTz(t, 'America/Sao_Paulo')).toBe('2026-08-14');
      // Em UTC já é dia 15 — é justamente por isso que a data de parede precisa
      // ser derivada com a tz, e não com getUTCDate().
      expect(t.toISOString().slice(0, 10)).toBe('2026-08-15');
    });
  });

  describe('utilitários', () => {
    it('minutos converte HH:mm', () => {
      expect(minutos('00:00')).toBe(0);
      expect(minutos('07:50')).toBe(470);
      expect(minutos('23:59')).toBe(1439);
    });

    it('somarDias não perde precisão', () => {
      const d = new Date('2026-08-14T00:00:00.000Z');
      expect(somarDias(d, 60).toISOString()).toBe('2026-10-13T00:00:00.000Z');
    });
  });
});
