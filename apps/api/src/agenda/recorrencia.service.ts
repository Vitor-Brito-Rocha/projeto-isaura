import { Injectable } from '@nestjs/common';
import { Frequencia } from '@prisma/client';
import { somarDias } from '../common/tz';

/**
 * Quantos dias à frente materializar. 60 dias cobre um bimestre inteiro, então a
 * grade da professora já nasce completa até a próxima virada de unidade.
 */
export const JANELA_DIAS = 60;

export interface HorarioDia {
  diaSemana: number; // 0=domingo .. 6=sábado
  horaInicio: string; // "HH:mm"
  horaFim: string;
}

export interface OcorrenciaCandidata {
  data: Date; // meia-noite UTC (convenção das colunas @db.Date)
  horaInicio: string;
  horaFim: string;
}

function dateUTC(ano: number, mes0: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes0, dia));
}

/** Domingo (00:00 UTC) da semana que contém a data. */
function inicioSemanaUTC(d: Date): Date {
  const base = dateUTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return somarDias(base, -base.getUTCDay());
}

/**
 * Lógica pura de geração de datas a partir de uma série recorrente. Não toca no
 * banco: recebe a configuração e a janela [de, ate] e devolve as ocorrências.
 *
 * Trabalha só com data de parede — a conversão para instante absoluto acontece
 * na materialização, onde a timezone do professor está disponível.
 */
@Injectable()
export class RecorrenciaService {
  gerar(params: {
    frequencia: Frequencia;
    dataInicio: Date;
    dataFim: Date | null;
    horarios: HorarioDia[];
    de: Date;
    ate: Date;
  }): OcorrenciaCandidata[] {
    const { frequencia, dataInicio, dataFim, horarios, de, ate } = params;
    if (horarios.length === 0) return [];

    const inicioJanela = dataInicio > de ? dataInicio : de;
    const fimJanela = dataFim && dataFim < ate ? dataFim : ate;
    if (inicioJanela > fimJanela) return [];

    // PONTUAL: uma aula só, na dataInicio, com o horário do dia da semana
    // correspondente (ou o primeiro cadastrado, se ela cadastrou outro dia).
    if (frequencia === Frequencia.PONTUAL) {
      if (dataInicio < de || dataInicio > ate) return [];
      const h = horarios.find((x) => x.diaSemana === dataInicio.getUTCDay()) ?? horarios[0];
      return [{ data: dataInicio, horaInicio: h.horaInicio, horaFim: h.horaFim }];
    }

    const porDia = new Map<number, HorarioDia[]>();
    for (const h of horarios) {
      const lista = porDia.get(h.diaSemana) ?? [];
      lista.push(h);
      porDia.set(h.diaSemana, lista);
    }

    const out: OcorrenciaCandidata[] = [];
    const semanaBase = inicioSemanaUTC(dataInicio);
    let cursor = dateUTC(
      inicioJanela.getUTCFullYear(),
      inicioJanela.getUTCMonth(),
      inicioJanela.getUTCDate(),
    );

    while (cursor <= fimJanela) {
      const lista = porDia.get(cursor.getUTCDay());
      if (lista && this.incluiData(frequencia, cursor, semanaBase)) {
        for (const h of lista) {
          out.push({ data: cursor, horaInicio: h.horaInicio, horaFim: h.horaFim });
        }
      }
      cursor = somarDias(cursor, 1);
    }
    return out;
  }

  private incluiData(frequencia: Frequencia, data: Date, semanaBase: Date): boolean {
    switch (frequencia) {
      case Frequencia.SEMANAL:
        return true;
      case Frequencia.QUINZENAL: {
        // Contado em semanas desde a semana da dataInicio — não em dias — para a
        // paridade não escorregar quando a série começa no meio da semana.
        const semanas = Math.round(
          (inicioSemanaUTC(data).getTime() - semanaBase.getTime()) / (7 * 86_400_000),
        );
        return semanas % 2 === 0;
      }
      case Frequencia.MENSAL:
        // Mensal por dia da semana: só a 1ª ocorrência daquele dia no mês.
        return data.getUTCDate() <= 7;
      default:
        return false;
    }
  }
}
