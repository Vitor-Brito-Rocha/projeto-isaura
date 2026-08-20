'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Check, Info, Loader2, LogOut, Send, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppShell, SO_NO_CELULAR, useEhAdmin } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { cidadeDoFuso } from '@/lib/fuso';
import { AlternarApi } from './api';
import { avisoDeDegradacao, detectarCapacidade, rotuloCapacidade, type Capacidade } from '@/lib/capacidade';
import { marcarPadroesAjustados } from '@/lib/primeiro-uso';
import { ativarNotificacoes, desativarNotificacoes, enviarPushTeste, notificacoesAtivas } from '@/lib/push';
import type { IntensidadeAlarme, Perfil } from '@/lib/types';

const INTENSIDADES: ReadonlyArray<{ valor: IntensidadeAlarme; rotulo: string }> = [
  { valor: 'SILENCIOSO', rotulo: 'Só no histórico' },
  { valor: 'NOTIFICACAO', rotulo: 'Notificação' },
  { valor: 'ALARME', rotulo: 'Alarme' },
];

const MINUTOS = [0, 5, 10, 15, 30];

export default function Config() {
  const router = useRouter();
  const qc = useQueryClient();
  const [capacidade, setCapacidade] = useState<Capacidade | null>(null);
  const [ativas, setAtivas] = useState<boolean | null>(null);
  const [alternando, setAlternando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);

  useEffect(() => {
    setCapacidade(detectarCapacidade());
    notificacoesAtivas().then(setAtivas);
  }, []);

  const { data: perfil, isLoading } = useQuery({
    queryKey: ['perfil'],
    queryFn: () => apiFetch<Perfil>('/perfil'),
  });

  const salvar = useMutation({
    mutationFn: ({ campo, valor }: { campo: string; valor: unknown }) => {
      setSalvando(campo);
      return apiFetch('/perfil', { method: 'PATCH', body: JSON.stringify({ [campo]: valor }) });
    },
    onSuccess: async (_r, { campo }) => {
      // Mexeu num padrão = a sugestão da home já cumpriu o papel dela.
      marcarPadroesAjustados();
      await qc.invalidateQueries({ queryKey: ['perfil'] });
      await qc.invalidateQueries({ queryKey: ['alarme'] });
      setSalvo(campo);
      setTimeout(() => setSalvo((s) => (s === campo ? null : s)), 1600);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.'),
    onSettled: () => setSalvando(null),
  });

  async function alternar() {
    setAlternando(true);
    try {
      if (ativas) {
        await desativarNotificacoes();
        setAtivas(false);
        toast.success('Notificações desativadas neste aparelho.');
      } else {
        await ativarNotificacoes();
        setAtivas(true);
        toast.success('Pronto — este aparelho vai receber os alarmes.');
      }
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível alterar.');
    } finally {
      setAlternando(false);
    }
  }

  async function testar() {
    setTestando(true);
    try {
      const enviados = await enviarPushTeste();
      if (enviados === 0) {
        // Zero aqui quase sempre é "nenhum aparelho inscrito", não "o servidor
        // falhou" — dizer isso poupa a busca pelo erro errado.
        toast.warning('Nada enviado: nenhum aparelho está inscrito nesta conta.');
      } else {
        toast.success(`Enviado para ${enviados} aparelho(s). Deve chegar em instantes.`);
      }
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível enviar.');
    } finally {
      setTestando(false);
    }
  }

  const Estado = ({ campo }: { campo: string }) => {
    if (salvando === campo) return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
    if (salvo === campo) return <Check className="size-3.5 text-sucesso" />;
    return null;
  };

  const bloqueado = capacidade === 'IOS_NAVEGADOR' || capacidade === 'SEM_SUPORTE';
  const avisoPlataforma = capacidade && bloqueado ? avisoDeDegradacao('NOTIFICACAO', capacidade) : null;
  const avisoPadrao =
    perfil && capacidade ? avisoDeDegradacao(perfil.intensidadeAberturaPadrao, capacidade) : null;

  return (
    <AppShell titulo="Ajustes">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Notificações neste aparelho</CardTitle>
              {ativas !== null && (
                <Badge variant={ativas ? 'sucesso' : 'neutro'}>{ativas ? 'Ativas' : 'Desativadas'}</Badge>
              )}
            </div>
            <CardDescription>{capacidade ? rotuloCapacidade(capacidade) : 'Verificando…'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* O aviso vem ANTES do botão de propósito: no iPhone sem instalar,
                apertar "Ativar" só produz um erro. */}
            {avisoPlataforma && (
              <Alert variant="alarme">
                <Info aria-hidden />
                <AlertDescription>{avisoPlataforma}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={alternar}
                loading={alternando}
                disabled={ativas === null || capacidade === 'SEM_SUPORTE'}
                variant={ativas ? 'outline' : 'default'}
              >
                {!alternando && (ativas ? <BellOff /> : <Bell />)}
                {ativas === null ? 'Verificando…' : ativas ? 'Desativar' : 'Ativar notificações'}
              </Button>
              <Button variant="outline" onClick={testar} loading={testando} disabled={!ativas}>
                {!testando && <Send />}
                Enviar teste
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Padrões dos alarmes</CardTitle>
            <CardDescription>
              Valem para todas as cadeiras que não tiverem ajuste próprio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading || !perfil ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-11 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoSelect
                    id="ant"
                    rotulo="Avisar antes da aula"
                    valor={String(perfil.antecedenciaPadraoMin)}
                    onChange={(v) => salvar.mutate({ campo: 'antecedenciaPadraoMin', valor: Number(v) })}
                    estado={<Estado campo="antecedenciaPadraoMin" />}
                    opcoes={MINUTOS.map((m) => ({
                      valor: String(m),
                      rotulo: m === 0 ? 'Na hora exata' : `${m} minutos antes`,
                    }))}
                  />
                  <CampoSelect
                    id="atr"
                    rotulo="Avisar depois da aula"
                    valor={String(perfil.atrasoPadraoMin)}
                    onChange={(v) => salvar.mutate({ campo: 'atrasoPadraoMin', valor: Number(v) })}
                    estado={<Estado campo="atrasoPadraoMin" />}
                    opcoes={MINUTOS.map((m) => ({
                      valor: String(m),
                      rotulo: m === 0 ? 'Assim que terminar' : `${m} minutos depois`,
                    }))}
                  />
                  <CampoSelect
                    id="iab"
                    rotulo="Como avisar na abertura"
                    valor={perfil.intensidadeAberturaPadrao}
                    onChange={(v) => salvar.mutate({ campo: 'intensidadeAberturaPadrao', valor: v })}
                    estado={<Estado campo="intensidadeAberturaPadrao" />}
                    opcoes={INTENSIDADES.map((i) => ({ valor: i.valor, rotulo: i.rotulo }))}
                  />
                  <CampoSelect
                    id="ife"
                    rotulo="Como avisar no fechamento"
                    valor={perfil.intensidadeFechamentoPadrao}
                    onChange={(v) => salvar.mutate({ campo: 'intensidadeFechamentoPadrao', valor: v })}
                    estado={<Estado campo="intensidadeFechamentoPadrao" />}
                    opcoes={INTENSIDADES.map((i) => ({ valor: i.valor, rotulo: i.rotulo }))}
                  />
                </div>

                {avisoPadrao && (
                  <Alert variant="alarme">
                    <Info aria-hidden />
                    <AlertDescription>{avisoPadrao}</AlertDescription>
                  </Alert>
                )}

                {/* A cidade, não o identificador: `America/Sao_Paulo` é
                    nome de sistema. Ver `lib/fuso.ts`. */}
                <p className="text-xs text-muted-foreground">
                  Fuso horário: <strong className="text-foreground">{cidadeDoFuso(perfil.timezone)}</strong>.
                  Os horários das aulas são interpretados nele.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <AlternarApi />

        <AtalhoDeAdmin />

        <Button
          variant="outline"
          className="w-full text-destructive hover:bg-destructive/5 hover:text-destructive"
          onClick={async () => {
            await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
            router.push('/login');
          }}
        >
          <LogOut />
          Sair
        </Button>
      </div>
    </AppShell>
  );
}

/**
 * O caminho para o painel de administração em quem não vê a navegação do topo.
 *
 * O Admin fica só na barra de cima, que é de desktop: a barra do celular tem
 * cinco lugares e eles são das telas do dia a dia, não de uma tela que existe
 * para UMA conta. O efeito colateral era um beco sem saída — no celular não
 * havia caminho nenhum para `/admin`, e a única saída era digitar a URL.
 *
 * Aparece exatamente onde a navegação do topo não está, pela classe que a
 * própria casca exporta. Escrever `sm:hidden` à mão aqui é o que faria os dois
 * lados se separarem depois — ver o comentário de `SO_NO_CELULAR`.
 *
 * Quem decide se você é admin continua sendo o servidor: `useEhAdmin` pergunta
 * ao `/admin/status`, que responde 403 para todo mundo que não é. Some para
 * quem não é, e o painel recusa igual se alguém forçar a URL.
 */
function AtalhoDeAdmin() {
  const ehAdmin = useEhAdmin();
  if (!ehAdmin) return null;

  return (
    <Card className={SO_NO_CELULAR}>
      <CardHeader>
        <CardTitle className="text-base">Painel de administração</CardTitle>
        <CardDescription>
          No computador ele fica na navegação do topo. Aqui a barra de baixo é das telas do dia a
          dia, então o caminho é este.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="w-full">
          <Link href="/admin">
            <ShieldCheck /> Abrir o painel
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function CampoSelect({
  id,
  rotulo,
  valor,
  onChange,
  opcoes,
  estado,
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: ReadonlyArray<{ valor: string; rotulo: string }>;
  estado?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex h-4 items-center gap-2">
        <Label htmlFor={id}>{rotulo}</Label>
        {estado}
      </div>
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
