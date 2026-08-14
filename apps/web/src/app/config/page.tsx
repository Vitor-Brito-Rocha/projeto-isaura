'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import {
  avisoDeDegradacao,
  detectarCapacidade,
  rotuloCapacidade,
  type Capacidade,
} from '@/lib/capacidade';
import { ativarNotificacoes, desativarNotificacoes, enviarPushTeste, notificacoesAtivas } from '@/lib/push';
import type { IntensidadeAlarme, Perfil } from '@/lib/types';
import { AvisoAlarme, Botao, Cabecalho, Cartao, Navegacao, Selecao } from '@/components/ui';

const INTENSIDADES: ReadonlyArray<{ valor: IntensidadeAlarme; rotulo: string }> = [
  { valor: 'SILENCIOSO', rotulo: 'Só no histórico' },
  { valor: 'NOTIFICACAO', rotulo: 'Notificação' },
  { valor: 'ALARME', rotulo: 'Alarme' },
];

export default function Config() {
  const router = useRouter();
  const qc = useQueryClient();
  const [capacidade, setCapacidade] = useState<Capacidade>('SEM_SUPORTE');
  const [ativas, setAtivas] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    setCapacidade(detectarCapacidade());
    notificacoesAtivas().then(setAtivas);
  }, []);

  const { data: perfil } = useQuery({
    queryKey: ['perfil'],
    queryFn: () => apiFetch<Perfil>('/perfil'),
  });

  const salvar = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      apiFetch('/perfil', { method: 'PATCH', body: JSON.stringify(dados) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['perfil'] });
      toast.success('Ajustes salvos.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.'),
  });

  async function alternarNotificacoes() {
    setOcupado(true);
    try {
      if (ativas) {
        await desativarNotificacoes();
        setAtivas(false);
        toast.success('Notificações desativadas neste aparelho.');
      } else {
        await ativarNotificacoes();
        setAtivas(true);
        toast.success('Notificações ativadas neste aparelho.');
      }
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível alterar.');
    } finally {
      setOcupado(false);
    }
  }

  async function testar() {
    setOcupado(true);
    try {
      const enviados = await enviarPushTeste();
      if (enviados === 0) {
        // Zero aqui quase sempre significa "nenhum aparelho inscrito", e não
        // "o servidor falhou" — dizer isso poupa a busca pelo erro errado.
        toast.warning('Nada foi enviado: nenhum aparelho está inscrito nesta conta.');
      } else {
        toast.success(`Enviado para ${enviados} aparelho(s). Deve chegar em instantes.`);
      }
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível enviar.');
    } finally {
      setOcupado(false);
    }
  }

  const aviso = perfil ? avisoDeDegradacao(perfil.intensidadeAberturaPadrao, capacidade) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <Cabecalho titulo="Ajustes" />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <Cartao className="space-y-3">
          <div>
            <h2 className="font-semibold">Notificações neste aparelho</h2>
            <p className="mt-0.5 text-xs text-slate-500">{rotuloCapacidade(capacidade)}</p>
          </div>

          {/* O aviso de plataforma vem antes do botão de propósito: no iPhone
              sem instalar, apertar "Ativar" só produz um erro. */}
          {(capacidade === 'IOS_NAVEGADOR' || capacidade === 'SEM_SUPORTE') && (
            <AvisoAlarme texto={avisoDeDegradacao('NOTIFICACAO', capacidade) ?? ''} />
          )}

          <div className="flex flex-wrap gap-2">
            <Botao
              onClick={alternarNotificacoes}
              disabled={ocupado || ativas === null || capacidade === 'SEM_SUPORTE'}
              variante={ativas ? 'secundario' : 'primario'}
            >
              {ativas === null ? 'Verificando…' : ativas ? 'Desativar' : 'Ativar notificações'}
            </Botao>
            <Botao variante="secundario" onClick={testar} disabled={ocupado || !ativas}>
              Enviar teste
            </Botao>
          </div>
        </Cartao>

        {perfil && (
          <Cartao className="space-y-3">
            <div>
              <h2 className="font-semibold">Padrões dos alarmes</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Valem para todas as cadeiras que não tiverem ajuste próprio.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Selecao
                label="Antes da aula"
                value={String(perfil.antecedenciaPadraoMin)}
                onChange={(e) => salvar.mutate({ antecedenciaPadraoMin: Number(e.target.value) })}
                opcoes={[0, 5, 10, 15, 30].map((m) => ({
                  valor: String(m),
                  rotulo: m === 0 ? 'Na hora exata' : `${m} minutos antes`,
                }))}
              />
              <Selecao
                label="Depois da aula"
                value={String(perfil.atrasoPadraoMin)}
                onChange={(e) => salvar.mutate({ atrasoPadraoMin: Number(e.target.value) })}
                opcoes={[0, 5, 10, 15, 30].map((m) => ({
                  valor: String(m),
                  rotulo: m === 0 ? 'Assim que terminar' : `${m} minutos depois`,
                }))}
              />
              <Selecao
                label="Aviso de abertura"
                value={perfil.intensidadeAberturaPadrao}
                onChange={(e) => salvar.mutate({ intensidadeAberturaPadrao: e.target.value })}
                opcoes={INTENSIDADES}
              />
              <Selecao
                label="Aviso de fechamento"
                value={perfil.intensidadeFechamentoPadrao}
                onChange={(e) => salvar.mutate({ intensidadeFechamentoPadrao: e.target.value })}
                opcoes={INTENSIDADES}
              />
            </div>

            {aviso && <AvisoAlarme texto={aviso} />}

            <p className="text-xs text-slate-500">
              Fuso horário: <strong>{perfil.timezone}</strong>. Os horários das aulas são
              interpretados nele.
            </p>
          </Cartao>
        )}

        <Botao
          variante="perigo"
          className="w-full"
          onClick={async () => {
            await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
            router.push('/login');
          }}
        >
          Sair
        </Botao>
      </main>

      <Navegacao />
    </div>
  );
}
