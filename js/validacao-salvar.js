// ---------------------------------------------------------------------------
// Mesmas travas do "Salvar" do modal nativo (bot.php:2299-2544), que a Orpen
// nunca deixou passar: JSON inválido nas ações 10/11/13 (e no payload da 22,
// quando preenchido) quebra o bot em execução; nome acima de 50 caracteres
// não cabe (o UPDATE do bot falha e o resto é gravado assim mesmo); I.A. no
// fluxo (18 chamando assistente, ou 20) exige conta de transcrição de áudio.
// Módulo puro (sem DOM, sem fetch) pra ser testado em tests/editor/.
// ---------------------------------------------------------------------------

import { ACTION_TYPE_LABELS, VARIABLE_KIND } from './dictionaries.js';
import { lerContaTranscricao } from './bot-view-render.js';

const CAMPO_JSON_OBRIGATORIO = { '10': 'message_option_text', '11': 'message_option_form', '13': 'bot_variables_text' };

/** Devolve a primeira falha em texto (para completar "Não foi possível salvar: …"), ou null. */
export function problemaAntesDeSalvar(bot) {
  if (String(bot.NAME).length > 50) return 'o nome do bot passa de 50 caracteres.';

  const estadoPorNumero = {};
  (bot.BOT_STATES || []).forEach((s) => { estadoPorNumero[s.STATE_NUMBER] = s; });
  const transicaoPorId = {};
  (bot.BOT_TRANSITIONS || []).forEach((t) => { transicaoPorId[t.ID] = t; });
  const onde = (a) => {
    const t = transicaoPorId[a.TRANSITION_ID];
    if (!t) return '';
    const e = estadoPorNumero[t.STATE];
    return ` no estado ${t.STATE}${e?.ALIAS ? ` "${e.ALIAS}"` : ''}, transição ${t.PRIORITY}`;
  };
  const jsonInvalido = (v) => {
    if (typeof v !== 'string') return v == null;
    try { JSON.parse(v); return false; } catch { return true; }
  };

  const acoes = (bot.BOT_ACTIONS || []).filter((a) => transicaoPorId[a.TRANSITION_ID]);
  let usaIa = false;
  for (const a of acoes) {
    const tipo = String(a.ACTION_TYPE);
    const d = a.ACTION_DATA || {};
    const rotulo = ACTION_TYPE_LABELS[tipo] || `tipo ${tipo}`;
    const campo = CAMPO_JSON_OBRIGATORIO[tipo];
    if (campo && jsonInvalido(d[campo])) return `a ação "${rotulo}"${onde(a)} está vazia ou com JSON inválido.`;
    if (tipo === '22' && d.payload && jsonInvalido(d.payload)) return `o payload da ação "${rotulo}"${onde(a)} não é um JSON válido.`;
    if ((tipo === '18' && d.openai === 'call_assistant') || tipo === '20') usaIa = true;
  }
  // Condição de cadastro (fila, agente, calendário, status CRM, entrada) guarda o
  // cadastro em CONDITION_TYPE. Vazio vira tipo 0 no payload e o servidor descarta a
  // condição (Bot.class.php:225): a transição passaria a valer sempre. Acontece depois
  // de colar de outro ambiente, onde o cadastro é esvaziado para ser escolhido de novo.
  for (const c of bot.BOT_CONDITIONS || []) {
    const t = transicaoPorId[c.TRANSITION_ID];
    const tipo = String(c.CONDITION_TYPE ?? '').trim();
    if (!t || !String(VARIABLE_KIND[c.CONDITION_DATA?.variable] || '').startsWith('ref_')) continue;
    if (tipo === '' || tipo === '0') {
      const e = estadoPorNumero[t.STATE];
      return `uma condição${` no estado ${t.STATE}${e?.ALIAS ? ` "${e.ALIAS}"` : ''}, transição ${t.PRIORITY}`} está sem o cadastro escolhido (fila, agente, entrada, calendário ou status). Sem ele o servidor descarta a condição.`;
    }
  }
  if (usaIa && !lerContaTranscricao(bot)) {
    return 'o bot usa I.A. no fluxo, então é preciso selecionar a "Conta para transcrição de áudio" nos dados do bot.';
  }
  return null;
}
