import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { rascunhoSerieDe, rascunhoSerieNovo } from '@/lib/horarios';
import type { Serie } from '@/lib/types';
import { Editor, PainelHorarios } from './painel-horarios';

/**
 * Prova que a árvore monta — não que ela é bonita.
 *
 * Mesmo motivo do `Button asChild`: quebra de montagem não aparece no `tsc` nem
 * no `next build`, só ao renderizar. Aqui pesa mais ainda, porque esta tela
 * mistura Radix Select, formulário e estado local, e é a única porta para a
 * professora cadastrar a grade dela.
 *
 * Sem testing-library de propósito, seguindo `button.spec.ts`.
 */
const comQuery = (no: React.ReactElement) =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      no,
    ),
  );

const SERIE: Serie = {
  id: 's1',
  cadeiraId: 'c1',
  frequencia: 'SEMANAL',
  dataInicio: '2026-08-06T00:00:00.000Z',
  dataFim: null,
  ativo: true,
  horarios: [
    { id: 'h1', diaSemana: 2, horaInicio: '07:00', horaFim: '07:50' },
    { id: 'h2', diaSemana: 4, horaInicio: '07:00', horaFim: '07:50' },
  ],
  cadeira: { id: 'c1', disciplina: 'Matemática', turma: '8º A', corHex: '#2F4A9C' },
};

describe('PainelHorarios', () => {
  it('mostra o resumo da série em vez de obrigar a abrir', () => {
    const marcacao = comQuery(
      createElement(PainelHorarios, { cadeiraId: 'c1', series: [SERIE] }),
    );

    expect(marcacao).toContain('ter e qui · 07:00–07:50');
    expect(marcacao).toContain('Toda semana');
    // Com ano: ela consulta semestre passado, e "06/08" sozinho é ambíguo.
    expect(marcacao).toContain('06/08/2026');
  });

  it('sem série, explica a consequência em vez de só ficar vazio', () => {
    const marcacao = comQuery(createElement(PainelHorarios, { cadeiraId: 'c1', series: [] }));

    expect(marcacao).toContain('não gera aula nenhuma');
    expect(marcacao).toContain('Definir');
  });
});

describe('Editor de série', () => {
  const props = {
    titulo: 'Novo horário',
    salvando: false,
    onSalvar: () => {},
    onCancelar: () => {},
  };

  it('monta em branco, com os sete dias para escolher', () => {
    const marcacao = renderToStaticMarkup(
      createElement(Editor, { ...props, inicial: rascunhoSerieNovo('2026-08-17') }),
    );

    for (const dia of ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']) {
      expect(marcacao).toContain(`>${dia}<`);
    }
    // A data escolhida escrita por extenso: o seletor nativo desenha no formato
    // do sistema operacional, e num aparelho em inglês seria 08/17/2026.
    expect(marcacao).toContain('seg, 17/08/2026');
  });

  it('não deixa salvar sem dia marcado', () => {
    const marcacao = renderToStaticMarkup(
      createElement(Editor, { ...props, inicial: rascunhoSerieNovo('2026-08-17') }),
    );

    expect(marcacao).toContain('Escolha pelo menos um dia');
    expect(marcacao).toContain('disabled');
  });

  it('monta com uma série existente e antecipa o que vai gerar', () => {
    const marcacao = renderToStaticMarkup(
      createElement(Editor, { ...props, inicial: rascunhoSerieDe(SERIE) }),
    );

    expect(marcacao).toContain('ter e qui · 07:00–07:50');
    expect(marcacao).toContain('Vai gerar');
    expect(marcacao).toContain('value="07:00"');
  });
});
