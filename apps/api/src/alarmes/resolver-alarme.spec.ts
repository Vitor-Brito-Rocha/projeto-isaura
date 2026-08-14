import { IntensidadeAlarme } from '@prisma/client';
import { OverrideCadeira, PadroesProfessor, resolverAlarme } from './resolver-alarme';

const padroes: PadroesProfessor = {
  antecedenciaPadraoMin: 5,
  atrasoPadraoMin: 5,
  intensidadeAberturaPadrao: IntensidadeAlarme.NOTIFICACAO,
  intensidadeFechamentoPadrao: IntensidadeAlarme.NOTIFICACAO,
  somPadrao: true,
  vibraPadrao: true,
};

const vazio: OverrideCadeira = {
  antecedenciaMin: null,
  atrasoMin: null,
  intensidadeAbertura: null,
  intensidadeFechamento: null,
  som: null,
  vibra: null,
};

describe('resolverAlarme', () => {
  it('sem override, usa os padrões da conta', () => {
    expect(resolverAlarme(padroes, null)).toEqual({
      antecedenciaMin: 5,
      atrasoMin: 5,
      intensidadeAbertura: IntensidadeAlarme.NOTIFICACAO,
      intensidadeFechamento: IntensidadeAlarme.NOTIFICACAO,
      som: true,
      vibra: true,
    });
  });

  it('override indefinido é tratado como ausente', () => {
    expect(resolverAlarme(padroes, undefined)).toEqual(resolverAlarme(padroes, null));
  });

  it('override com todos os campos nulos herda tudo', () => {
    expect(resolverAlarme(padroes, vazio)).toEqual(resolverAlarme(padroes, null));
  });

  it('herda campo a campo, não tudo-ou-nada', () => {
    // O caso real: ela quer mais antecedência só na primeira aula do dia, e não
    // deveria ter de reconfigurar som e vibração junto.
    const r = resolverAlarme(padroes, { ...vazio, antecedenciaMin: 15 });

    expect(r.antecedenciaMin).toBe(15);
    expect(r.atrasoMin).toBe(5);
    expect(r.som).toBe(true);
    expect(r.vibra).toBe(true);
    expect(r.intensidadeAbertura).toBe(IntensidadeAlarme.NOTIFICACAO);
  });

  it('respeita zero como valor legítimo', () => {
    // Zero é "toque exatamente na hora", não "não configurado". Um `||` no
    // lugar do `??` faria isto virar 5 silenciosamente.
    const r = resolverAlarme(padroes, { ...vazio, antecedenciaMin: 0, atrasoMin: 0 });
    expect(r.antecedenciaMin).toBe(0);
    expect(r.atrasoMin).toBe(0);
  });

  it('respeita false como valor legítimo', () => {
    // Mesma armadilha: "sem vibração" não pode virar "vibração padrão".
    const r = resolverAlarme(padroes, { ...vazio, som: false, vibra: false });
    expect(r.som).toBe(false);
    expect(r.vibra).toBe(false);
  });

  it('permite silenciar só a abertura, mantendo o fechamento', () => {
    // Cadeira logo depois de outra: ela já está na escola, o alarme de abertura
    // é ruído. O de fechamento continua importando.
    const r = resolverAlarme(padroes, {
      ...vazio,
      intensidadeAbertura: IntensidadeAlarme.SILENCIOSO,
    });
    expect(r.intensidadeAbertura).toBe(IntensidadeAlarme.SILENCIOSO);
    expect(r.intensidadeFechamento).toBe(IntensidadeAlarme.NOTIFICACAO);
  });

  it('permite subir para ALARME numa cadeira só', () => {
    const r = resolverAlarme(padroes, {
      ...vazio,
      intensidadeAbertura: IntensidadeAlarme.ALARME,
      intensidadeFechamento: IntensidadeAlarme.ALARME,
    });
    expect(r.intensidadeAbertura).toBe(IntensidadeAlarme.ALARME);
    expect(r.intensidadeFechamento).toBe(IntensidadeAlarme.ALARME);
  });

  it('não vaza o padrão quando a conta inteira é silenciosa', () => {
    const silenciosa: PadroesProfessor = {
      ...padroes,
      intensidadeAberturaPadrao: IntensidadeAlarme.SILENCIOSO,
      intensidadeFechamentoPadrao: IntensidadeAlarme.SILENCIOSO,
      somPadrao: false,
      vibraPadrao: false,
    };
    const r = resolverAlarme(silenciosa, vazio);
    expect(r.intensidadeAbertura).toBe(IntensidadeAlarme.SILENCIOSO);
    expect(r.som).toBe(false);
  });
});
