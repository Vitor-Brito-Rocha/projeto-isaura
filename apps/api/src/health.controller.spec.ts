import { HealthController } from './health.controller';

/**
 * O health é a única rota que responde com o banco fora do ar — é justamente
 * para isso que ela existe. Um `throw` aqui deixaria o healthcheck do Docker
 * vermelho por causa do banco, e o EasyPanel derrubaria um container são.
 */
function controlador(consulta: () => Promise<unknown>) {
  return new HealthController({ $queryRaw: consulta } as never);
}

describe('HealthController', () => {
  it('diz ok com o banco respondendo', async () => {
    const r = await controlador(async () => [{ '?column?': 1 }]).health();

    expect(r.ok).toBe(true);
    expect(r.banco).toBe('ok');
  });

  it('responde 200 com o banco fora do ar, dizendo que ele caiu', async () => {
    const r = await controlador(async () => {
      throw new Error('connection refused');
    }).health();

    expect(r.ok).toBe(false);
    expect(r.banco).toBe('indisponível');
  });

  it('identifica quem respondeu, para achar container duplicado', async () => {
    // Sem isto, dois containers atrás da mesma rota fazem a MESMA url alternar
    // entre 200 e erro do proxy, sem jeito de saber qual atendeu.
    const r = await controlador(async () => []).health();

    expect(r.instancia).toBeTruthy();
    expect(typeof r.instancia).toBe('string');
    expect(Date.parse(r.desde)).not.toBeNaN();
  });

  it('o "desde" é do processo, não da chamada', async () => {
    const c = controlador(async () => []);
    const primeira = await c.health();
    const segunda = await c.health();

    expect(segunda.desde).toBe(primeira.desde);
    // `agora` é o oposto: muda a cada chamada, e é o que prova que o processo
    // está vivo agora, não só que subiu um dia.
    expect(Date.parse(segunda.agora)).toBeGreaterThanOrEqual(Date.parse(primeira.agora));
  });
});
