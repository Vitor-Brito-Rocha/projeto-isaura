import { readFileSync } from 'fs';
import { join } from 'path';
import { ImportacaoService } from './importacao.service';
import type { ModeloService } from './modelo.service';

/**
 * O caminho da Unifor não pode depender de provedor de IA.
 *
 * A regra parece óbvia lida assim, e mesmo assim já foi quebrada uma vez: a
 * guarda `if (!this.modelo.ativo) throw` morava na porta de `extrair`, antes do
 * parser, e trancava o caminho grátis com a chave do caminho pago. O efeito era
 * mudo — sem chave da Groq a tela some inteira, e ninguém descobre que o app lê
 * o documento sozinho.
 *
 * O dublê do modelo estoura se alguém o chamar. É isso que transforma "não
 * precisa de IA" em algo que o teste consegue provar, em vez de conferir só o
 * resultado — que um modelo bem-humorado também poderia produzir.
 */
const PLANO = readFileSync(join(__dirname, 'exemplos', 'plano-unifor.txt'), 'utf8');

function servicoSemProvedor() {
  const modelo = {
    ativo: false,
    provedorAtual: null,
    pedirJson: () => {
      throw new Error('O caminho da Unifor não pode chamar o modelo.');
    },
  } as unknown as ModeloService;

  // Prisma, Storage e Erros ficam nulos: `proporDeTexto` não toca em nenhum, e
  // um nulo aqui denuncia na hora se um dia passar a tocar.
  return new ImportacaoService(null as never, null as never, modelo, null as never);
}

const textos = (t: string) => ({ texto: t, textoCompleto: t, paginas: 7 });

describe('proporDeTexto', () => {
  it('lê o plano da Unifor com o provedor DESLIGADO', async () => {
    const r = await servicoSemProvedor().proporDeTexto('prof-1', null, textos(PLANO));

    expect(r.origem).toBe('unifor');
    expect(r.unidades).toHaveLength(4);
    expect(r.encontros).toHaveLength(37);
  });

  it('devolve o cronograma estimado junto', async () => {
    // As datas de unidade são o que acorda o aviso de ritmo do
    // `progresso/calcular.ts`, que sem elas devolve null e nunca aparece.
    const r = await servicoSemProvedor().proporDeTexto('prof-1', null, textos(PLANO));

    expect(r.unidades.map((u) => u.aulas)).toEqual([3, 6, 16, 12]);
    expect(r.unidades[0].dataInicio).toBe('2026-08-04');
    expect(r.unidades[3].dataFimPrevista).toBe('2026-12-10');
  });

  it('devolve a grade decodificada do código de horário', async () => {
    const r = await servicoSemProvedor().proporDeTexto('prof-1', null, textos(PLANO));

    expect(r.grade).toEqual([
      { diaSemana: 2, horaInicio: '11:20', horaFim: '13:00' },
      { diaSemana: 4, horaInicio: '11:20', horaFim: '13:00' },
    ]);
  });

  it('devolve a identificação para o plano nascer sem ela digitar nada', async () => {
    const r = await servicoSemProvedor().proporDeTexto('prof-1', null, textos(PLANO));

    expect(r.identificacao).toMatchObject({
      disciplina: 'Ambiente De Dados',
      ano: 2026,
      semestre: 2,
    });
  });

  it('sem provedor, documento de formato livre diz POR QUE não dá', async () => {
    // E não "importação indisponível", que era a mensagem antiga: ela sugeria
    // que nada funciona, quando o que falta cobre um formato só.
    const outro = 'Plano de curso\n1º bimestre\nFrações\nDecimais';

    await expect(
      servicoSemProvedor().proporDeTexto('prof-1', null, textos(outro)),
    ).rejects.toThrow(/formato da Unifor/);
  });
});
