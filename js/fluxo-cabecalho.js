// ---------------------------------------------------------------------------
// Chips "vem de / vai para" no cabeçalho de cada estado: de onde se chega e
// para onde ele leva, mesmo com o estado fechado. Clicar num chip leva até a
// ação de origem ("ir-para-origem") ou ao estado de destino ("ir-para-estado"),
// tratados em bot-view-interactions.js. Só exibição: nada é gravado.
//
// Uma edição num estado muda as entradas de outros, então cada atualização
// recalcula o bot inteiro (fluxoDoBot, uma passada pelas ações) e só reescreve
// os cabeçalhos cujo HTML mudou.
// ---------------------------------------------------------------------------

import { state } from './state.js';
import { getRootNode } from './dom-root.js';
import { fluxoDoBot, htmlFluxoEstado } from './fluxo-estados.js';

const desenhado = new WeakMap();

export function atualizarFluxoCabecalhos() {
  const bot = state.botCarregado;
  const alvos = getRootNode()?.querySelectorAll('#bv-estados .estado-wrap > .estado-header [data-role="estado-fluxo"]');
  if (!bot || !alvos?.length) return;
  const { porEstado, porVariavel } = fluxoDoBot(bot);
  const estadoPorNumero = {};
  (bot.BOT_STATES || []).forEach((s) => { estadoPorNumero[String(s.STATE_NUMBER)] = s; });
  alvos.forEach((el) => {
    const numero = el.closest('.estado-wrap').dataset.estadoNumero;
    const html = htmlFluxoEstado(numero, porEstado.get(numero), estadoPorNumero, porVariavel);
    if (desenhado.get(el) === html) return;
    el.innerHTML = html;
    desenhado.set(el, html);
  });
}

// Mutações que são só a escrita dos próprios chips (ou do resumo da regra da
// transição, regra-transicao.js) não mudam o fluxo.
const SO_EXIBICAO = '.estado-fluxo, .transicao-regra';

/** Ligado uma vez (initBotViewWiring). */
export function initFluxoCabecalhos() {
  const estados = getRootNode()?.querySelector('#bv-estados');
  const overlay = getRootNode()?.querySelector('#bot-view-overlay');
  if (!estados) return;
  // Re-render (abrir o bot, duplicar, mover, excluir...): roda antes da
  // pintura, então o cabeçalho recriado já aparece com os chips.
  new MutationObserver((registros) => {
    if (registros.every((r) => r.target.closest?.(SO_EXIBICAO))) return;
    atualizarFluxoCabecalhos();
  }).observe(estados, { childList: true, subtree: true });
  // Edição de campo (destino, nome do estado, timeout do bot): depois dos
  // ouvintes que gravam o valor.
  (overlay || estados).addEventListener('change', () => setTimeout(atualizarFluxoCabecalhos, 0));
}
