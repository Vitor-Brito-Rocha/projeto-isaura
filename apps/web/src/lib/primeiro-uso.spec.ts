import { DIAS_DE_SILENCIO, proximoPasso, type EstadoInicial } from './primeiro-uso';

const AGORA = Date.UTC(2026, 7, 18, 12, 0, 0);

const estado = (p: Partial<EstadoInicial> = {}): EstadoInicial => ({
  capacidade: 'ANDROID_WEB',
  notificacoesAtivas: false,
  jaAjustouPadroes: false,
  dispensas: {},
  agora: AGORA,
  ...p,
});

describe('proximoPasso', () => {
  it('oferece ativar antes de qualquer outra coisa', () => {
    expect(proximoPasso(estado())).toBe('ATIVAR_NOTIFICACOES');
  });

  /**
   * A ordem importa: perguntar "quantos minutos antes?" para quem ainda não
   * recebeu aviso nenhum é pedir opinião sobre o que ela não viu funcionar.
   */
  it('só sugere ajustar padrões depois de o alarme existir', () => {
    expect(proximoPasso(estado({ notificacoesAtivas: true }))).toBe('AJUSTAR_PADROES');
  });

  it('cala a boca quando as duas coisas estão feitas', () => {
    expect(
      proximoPasso(estado({ notificacoesAtivas: true, jaAjustouPadroes: true })),
    ).toBeNull();
  });

  /**
   * No iPhone a Push API só existe para app instalado na tela inicial. Pedir
   * permissão antes disso falha com um erro que não diz o que fazer — então o
   * passo é instalar, e ativar vem depois.
   */
  it('no Safari não instalado, o passo é instalar — não ativar', () => {
    expect(proximoPasso(estado({ capacidade: 'IOS_NAVEGADOR' }))).toBe('INSTALAR_IOS');
  });

  it('instalado na tela inicial, volta a ser ativar', () => {
    expect(proximoPasso(estado({ capacidade: 'IOS_PWA' }))).toBe('ATIVAR_NOTIFICACOES');
  });

  /**
   * Oferecer onde não há como entregar seria prometer alarme que não toca — a
   * única coisa que este produto não pode fazer.
   */
  it('não oferece nada onde não há suporte nenhum', () => {
    expect(proximoPasso(estado({ capacidade: 'SEM_SUPORTE' }))).toBeNull();
  });

  describe('dispensa', () => {
    it('silencia logo depois do toque', () => {
      const e = estado({ dispensas: { ATIVAR_NOTIFICACOES: AGORA - 1000 } });
      expect(proximoPasso(e)).toBeNull();
    });

    /**
     * "Para sempre" transformaria um toque errado em app mudo pelo resto do
     * ano — e ela não teria como desconfiar que apagou o cartão.
     */
    it('volta depois de uma semana', () => {
      const umDiaAMais = (DIAS_DE_SILENCIO + 1) * 24 * 3600 * 1000;
      const e = estado({ dispensas: { ATIVAR_NOTIFICACOES: AGORA - umDiaAMais } });
      expect(proximoPasso(e)).toBe('ATIVAR_NOTIFICACOES');
    });

    it('ainda silenciado no último dia', () => {
      const seisDias = 6 * 24 * 3600 * 1000;
      const e = estado({ dispensas: { ATIVAR_NOTIFICACOES: AGORA - seisDias } });
      expect(proximoPasso(e)).toBeNull();
    });

    /**
     * Dispensar um passo não pode enterrar o outro: quem adiou "ativar" ainda
     * merece a sugestão dos padrões quando ativar por conta própria.
     */
    it('cada passo tem a própria dispensa', () => {
      const e = estado({
        notificacoesAtivas: true,
        dispensas: { ATIVAR_NOTIFICACOES: AGORA - 1000 },
      });
      expect(proximoPasso(e)).toBe('AJUSTAR_PADROES');
    });
  });
});
