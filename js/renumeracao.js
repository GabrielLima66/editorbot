// ---------------------------------------------------------------------------
// Renumeração de estados. Cada atendimento em andamento guarda só o NÚMERO do
// estado em que o cliente está (ctc_attendance.bot_state), e o motor relê o
// bot do banco a cada ciclo (Bot.class.php, loadTransitions, cache de 60 s).
// Arrastar, duplicar ou excluir estados renumera os outros: quem está parado
// num número que mudou passa a rodar o estado que ficou com aquele número.
// Configurações fora do bot também guardam número de estado (failover de
// entrada com destino "estado", Chat.class.php:3977) e não são atualizadas.
// O editor muta os objetos de estado no lugar (remapStateNumbers), então o
// próprio objeto identifica o estado entre o último salvamento e agora (o ID
// não serve: nextId pode reaproveitar o de um estado excluído).
// Módulo puro (sem DOM) pra ser testado em tests/editor/.
// ---------------------------------------------------------------------------

/** Foto dos números atuais: Map<objeto do estado, { numero, alias }>. */
export function fotografarNumeros(bot) {
  return new Map((bot.BOT_STATES || []).map((s) => [s, { numero: String(s.STATE_NUMBER), alias: s.ALIAS || '' }]));
}

/**
 * O que mudou desde a foto: { mudados, excluidos, entrada } ou null se nenhum
 * estado mudou de número nem foi excluído. `entrada` diz se o estado nº 0
 * (onde toda conversa nova começa) passou a ser outro.
 */
export function mudancasDeNumero(bot, foto) {
  if (!foto) return null;
  const atuais = new Set(bot.BOT_STATES || []);
  const mudados = [];
  const excluidos = [];
  foto.forEach(({ numero, alias }, estado) => {
    if (!atuais.has(estado)) excluidos.push({ numero, alias });
    else if (String(estado.STATE_NUMBER) !== numero) mudados.push({ alias: estado.ALIAS || '', de: numero, para: String(estado.STATE_NUMBER) });
  });
  if (!mudados.length && !excluidos.length) return null;
  const porNumero = (a, b) => parseInt(a.de ?? a.numero, 10) - parseInt(b.de ?? b.numero, 10);

  let entrada = null;
  const inicialAntes = [...foto].find(([, v]) => v.numero === '0');
  const inicialAgora = (bot.BOT_STATES || []).find((s) => String(s.STATE_NUMBER) === '0');
  if (inicialAntes && inicialAntes[0] !== inicialAgora) {
    entrada = { antes: inicialAntes[1].alias, depois: inicialAgora ? inicialAgora.ALIAS || '' : null };
  }
  return { mudados: mudados.sort(porNumero), excluidos: excluidos.sort(porNumero), entrada };
}
