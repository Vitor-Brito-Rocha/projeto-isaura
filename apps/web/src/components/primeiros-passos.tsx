'use client';

import { BellRing, Settings, Share, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { detectarCapacidade, type Capacidade } from '@/lib/capacidade';
import {
  dispensar,
  jaAjustouPadroes,
  lerDispensas,
  proximoPasso,
  type PassoInicial,
} from '@/lib/primeiro-uso';
import { ativarNotificacoes, notificacoesAtivas } from '@/lib/push';

/**
 * O primeiro passo, oferecido na home — não escondido em Ajustes.
 *
 * Sem isto, o caminho para ligar o alarme era: descobrir que existe uma tela de
 * Ajustes, abri-la, achar o cartão certo. O desfecho provável é ela usar o app
 * por uma semana sem receber aviso nenhum e concluir que não funciona. O
 * produto inteiro se apoia nesse alarme.
 *
 * **A permissão do sistema só é pedida no clique dela.** Este cartão é o pedido
 * ANTES do pedido: o navegador dá uma chance só, e uma recusa é quase
 * irreversível no celular. Explicar primeiro é o que faz ela dizer sim ao
 * prompt de verdade — e é a mesma regra do `avisoDeDegradacao`: dizer o que vai
 * acontecer antes de acontecer.
 */
export function PrimeirosPassos() {
  const [passo, setPasso] = useState<PassoInicial>(null);
  const [capacidade, setCapacidade] = useState<Capacidade | null>(null);
  const [ativando, setAtivando] = useState(false);

  async function recalcular() {
    const cap = detectarCapacidade();
    setCapacidade(cap);
    setPasso(
      proximoPasso({
        capacidade: cap,
        notificacoesAtivas: await notificacoesAtivas(),
        jaAjustouPadroes: jaAjustouPadroes(),
        dispensas: lerDispensas(),
        agora: Date.now(),
      }),
    );
  }

  // Só no cliente: tudo aqui lê `navigator`, `Notification` e localStorage.
  useEffect(() => {
    void recalcular();
  }, []);

  if (!passo) return null;

  function adiar() {
    if (!passo) return;
    dispensar(passo);
    setPasso(null);
  }

  async function ativar() {
    setAtivando(true);
    try {
      await ativarNotificacoes();
      toast.success('Pronto — este aparelho vai avisar você em cada aula.');
      await recalcular();
    } catch (erro) {
      // A mensagem vem de `ativarNotificacoes` e é específica de propósito:
      // "negou a permissão" e "precisa instalar o app" pedem coisas diferentes.
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível ativar.', {
        duration: Infinity,
        closeButton: true,
      });
    } finally {
      setAtivando(false);
    }
  }

  const conteudo = {
    INSTALAR_IOS: {
      Icone: Share,
      titulo: 'Instale o app para receber os avisos',
      texto:
        'No iPhone, o aviso de aula só funciona com o app na tela de início. Toque em Compartilhar e depois em "Adicionar à Tela de Início" — abra por lá e o botão de ativar aparece aqui.',
      acao: null,
    },
    ATIVAR_NOTIFICACOES: {
      Icone: BellRing,
      titulo: 'Ativar os avisos de aula',
      texto:
        'São dois por aula: um pouco antes, para você anotar o que vai dar, e um pouco depois, para registrar o que deu. É o que faz o registro acontecer na hora, em vez de no fim do dia.',
      acao: (
        <Button size="sm" onClick={ativar} loading={ativando}>
          <BellRing />
          Ativar avisos
        </Button>
      ),
    },
    AJUSTAR_PADROES: {
      Icone: Settings,
      titulo: 'Ajuste como quer ser avisada',
      texto:
        'Hoje o aviso chega 5 minutos antes e 5 depois, como notificação. Dá para mudar os minutos, o som e a intensidade — e cada turma pode ter o seu.',
      acao: (
        <Button size="sm" variant="outline" asChild>
          <Link href="/config">
            <Settings />
            Abrir ajustes
          </Link>
        </Button>
      ),
    },
  }[passo];

  const { Icone } = conteudo;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex gap-3 py-3">
        <Icone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium">{conteudo.titulo}</p>
          <p className="text-xs text-muted-foreground">{conteudo.texto}</p>

          {/*
            Diz o que ESTE aparelho entrega antes de ela apostar nele. No iPhone
            instalado, "alarme" chega como notificação, e descobrir isso só na
            manhã em que o alarme não tocou é o pior desfecho do produto.
          */}
          {capacidade === 'IOS_PWA' && passo === 'ATIVAR_NOTIFICACOES' && (
            <p className="text-xs text-muted-foreground">
              Neste aparelho o aviso chega como notificação — no iPhone nenhum app que não seja da
              Apple consegue tocar como alarme.
            </p>
          )}

          {conteudo.acao && <div className="pt-0.5">{conteudo.acao}</div>}
        </div>

        {/*
          Adiar, e não fechar para sempre: some por uma semana. Um toque errado
          não pode deixar o app mudo pelo resto do ano numa coisa que ela nem
          saberia que existiu.
        */}
        <Button
          variant="ghost"
          size="icon"
          className="-mr-1 -mt-1 size-8 shrink-0 text-muted-foreground"
          onClick={adiar}
          aria-label="Adiar por uma semana"
        >
          <X className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
