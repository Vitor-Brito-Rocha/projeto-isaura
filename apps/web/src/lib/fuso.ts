/**
 * O nome do fuso do jeito que uma pessoa diz.
 *
 * `America/Sao_Paulo` é identificador de sistema: a barra, o sublinhado e o
 * "America" na frente são estrutura do banco de dados IANA, não informação para
 * quem lê. Ela quer conferir uma coisa só — se o app está usando o horário do
 * lugar onde ela dá aula.
 *
 * O que fica guardado continua sendo o identificador inteiro; isto é só o
 * rótulo. Trocar o valor guardado por "São Paulo" quebraria todo cálculo de
 * hora, que é feito com o IANA.
 */

/**
 * Só os que perdem acento na grafia IANA.
 *
 * Não é um mapa de tradução — "Fortaleza" e "Manaus" já saem certos da regra
 * geral, e listá-los seria uma segunda fonte de verdade para manter em dia.
 * `Noronha` está aqui porque o nome curto não é como ninguém a chama.
 */
const COM_ACENTO: Record<string, string> = {
  'America/Sao_Paulo': 'São Paulo',
  'America/Belem': 'Belém',
  'America/Maceio': 'Maceió',
  'America/Cuiaba': 'Cuiabá',
  'America/Santarem': 'Santarém',
  'America/Araguaina': 'Araguaína',
  'America/Eirunepe': 'Eirunepé',
  'America/Noronha': 'Fernando de Noronha',
};

export function cidadeDoFuso(fuso: string | null | undefined): string {
  const limpo = fuso?.trim();
  if (!limpo) return '';

  const conhecido = COM_ACENTO[limpo];
  if (conhecido) return conhecido;

  // Regra geral: a última parte é a cidade, e o sublinhado é só o jeito de o
  // IANA não usar espaço. `America/Argentina/Buenos_Aires` tem três partes, e a
  // que interessa continua sendo a última.
  const ultima = limpo.split('/').pop() ?? limpo;
  return ultima.replace(/_/g, ' ');
}
