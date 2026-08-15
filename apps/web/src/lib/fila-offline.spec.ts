import {
  criarFila,
  ErroPermanente,
  type Armazenamento,
  type ItemFila,
} from './fila-offline';

/**
 * O critério de aceite da fase 3 é de comportamento, não de código: preencher
 * um fechamento em modo avião, fechar o app, voltar online e não perder nada.
 * Estes testes cobrem os jeitos de perder — que são silenciosos, todos.
 */
function memoria(inicial: ItemFila[] = []): Armazenamento & { itens: ItemFila[] } {
  const estado = { itens: [...inicial] };
  return {
    get itens() {
      return estado.itens;
    },
    async ler() {
      return [...estado.itens];
    },
    async gravar(itens) {
      estado.itens = [...itens];
    },
  };
}

const fechamento = (aula: string, texto: string) => ({
  chave: `fechamento:${aula}`,
  caminho: `/registros/ocorrencia/${aula}/fechamento`,
  metodo: 'PUT',
  corpo: JSON.stringify({ conteudoDado: texto }),
});

describe('fila offline', () => {
  it('guarda o que não conseguiu subir', async () => {
    const arm = memoria();
    const fila = criarFila(arm);

    await fila.enfileirar(fechamento('aula-1', 'frações'));

    expect(await fila.contar()).toBe(1);
  });

  it('substitui em vez de acumular quando ela reescreve a mesma aula', async () => {
    const arm = memoria();
    const fila = criarFila(arm);

    await fila.enfileirar(fechamento('aula-1', 'primeira versão'));
    await fila.enfileirar(fechamento('aula-1', 'segunda versão'));
    await fila.enfileirar(fechamento('aula-1', 'versão final'));

    const pendentes = await fila.pendentes();
    expect(pendentes).toHaveLength(1);
    // O servidor precisa receber a ÚLTIMA intenção dela, não as três.
    expect(JSON.parse(pendentes[0].corpo).conteudoDado).toBe('versão final');
  });

  it('envia na ordem e esvazia quando a rede volta', async () => {
    const arm = memoria();
    const fila = criarFila(arm);
    await fila.enfileirar(fechamento('aula-1', 'a'));
    await fila.enfileirar(fechamento('aula-2', 'b'));

    const enviados: string[] = [];
    const r = await fila.sincronizar(async (i) => {
      enviados.push(i.chave);
    });

    expect(enviados).toEqual(['fechamento:aula-1', 'fechamento:aula-2']);
    expect(r).toEqual({ enviados: 2, descartados: 0, restantes: 0 });
    expect(await fila.contar()).toBe(0);
  });

  it('para no primeiro erro de rede e preserva a ordem do que sobrou', async () => {
    const arm = memoria();
    const fila = criarFila(arm);
    await fila.enfileirar(fechamento('aula-1', 'a'));
    await fila.enfileirar(fechamento('aula-2', 'b'));
    await fila.enfileirar(fechamento('aula-3', 'c'));

    const r = await fila.sincronizar(async (i) => {
      if (i.chave === 'fechamento:aula-2') throw new Error('rede caiu de novo');
    });

    expect(r).toEqual({ enviados: 1, descartados: 0, restantes: 2 });
    expect((await fila.pendentes()).map((i) => i.chave)).toEqual([
      'fechamento:aula-2',
      'fechamento:aula-3',
    ]);
  });

  it('descarta o que nunca vai passar, para não travar a fila atrás dele', async () => {
    const arm = memoria();
    const fila = criarFila(arm);
    await fila.enfileirar(fechamento('aula-apagada', 'a'));
    await fila.enfileirar(fechamento('aula-2', 'b'));

    const r = await fila.sincronizar(async (i) => {
      if (i.chave === 'fechamento:aula-apagada') throw new ErroPermanente('404');
    });

    expect(r).toEqual({ enviados: 1, descartados: 1, restantes: 0 });
  });

  it('não apaga a correção feita DURANTE a sincronização', async () => {
    const arm = memoria();
    const fila = criarFila(arm);
    await fila.enfileirar(fechamento('aula-1', 'texto com erro'));

    // Ela corrige o mesmo fechamento enquanto o envio do anterior está no ar.
    const r = await fila.sincronizar(async () => {
      await fila.enfileirar(fechamento('aula-1', 'texto corrigido'));
    });

    // O item enviado saiu, mas a correção continua na fila para o próximo ciclo.
    expect(r.enviados).toBe(1);
    const pendentes = await fila.pendentes();
    expect(pendentes).toHaveLength(1);
    expect(JSON.parse(pendentes[0].corpo).conteudoDado).toBe('texto corrigido');
  });
});
