// ---------------------------------------------------------------------------
// Selo de problemas no cabeçalho de cada estado: quantos erros e avisos o
// "Analisar bot" (js/analise-bot.js) achou ali, visível com o estado fechado e
// sem abrir o painel. Clicar abre o painel no primeiro problema do estado
// ("ir-para-analise", em bot-view-interactions.js). Os informativos ficam só
// no painel: dependem do que a análise não vê e encheriam a lista de selos.
// Só exibição: nada é gravado.
//
// A análise roda de novo a cada edição (analise.js); cada atualização só
// reescreve os cabeçalhos cujo selo mudou.
// ---------------------------------------------------------------------------

import { escapeHtml } from './utils.js';
import { getRootNode, criarIcones } from './dom-root.js';

const MAX_TITULOS = 6;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * Erros e avisos de cada estado: Map "número" → { erro, aviso, achados }.
 * `achados` vem na ordem da análise (erros antes dos avisos). Achados da
 * configuração do bot (sem estado) e informativos ficam de fora.
 */
export function selosPorEstado(achados) {
  const porEstado = new Map();
  (achados || []).forEach((a) => {
    if (a.estadoNumero === null || a.estadoNumero === undefined) return;
    if (a.severidade !== 'erro' && a.severidade !== 'aviso') return;
    const numero = String(a.estadoNumero);
    if (!porEstado.has(numero)) porEstado.set(numero, { erro: 0, aviso: 0, achados: [] });
    const selo = porEstado.get(numero);
    selo[a.severidade] += 1;
    selo.achados.push(a);
  });
  return porEstado;
}

/** Texto do selo para leitores de tela e para o title: "2 erros e 1 aviso". */
export function resumoDoSelo(selo) {
  const partes = [];
  if (selo.erro) partes.push(plural(selo.erro, 'erro', 'erros'));
  if (selo.aviso) partes.push(plural(selo.aviso, 'aviso', 'avisos'));
  return partes.join(' e ');
}

/** HTML do selo de um estado; vazio quando não há erro nem aviso. */
export function htmlSeloEstado(numero, selo) {
  if (!selo || (!selo.erro && !selo.aviso)) return '';
  const linhas = selo.achados.slice(0, MAX_TITULOS).map((a) => `• ${a.titulo}`);
  if (selo.achados.length > MAX_TITULOS) linhas.push(`… e mais ${selo.achados.length - MAX_TITULOS}`);
  const resumo = resumoDoSelo(selo);
  const titulo = `${resumo} neste estado (clique para ver no Analisar bot)\n${linhas.join('\n')}`;
  const contagem = (sev, icone, qtd) => (qtd ? `<span class="estado-selo-parte estado-selo-${sev}"><i data-lucide="${icone}"></i>${qtd}</span>` : '');
  return `<button type="button" class="estado-selo" data-action="ir-para-analise" data-state="${escapeHtml(numero)}" data-gravidade="${selo.erro ? 'erro' : 'aviso'}" title="${escapeHtml(titulo)}" aria-label="${escapeHtml(`${resumo} neste estado. Abrir no Analisar bot`)}">`
    + contagem('erro', 'circle-x', selo.erro)
    + contagem('aviso', 'triangle-alert', selo.aviso)
    + '</button>';
}

const desenhado = new WeakMap();

/** Reescreve os selos dos cabeçalhos a partir dos achados da análise. */
export function atualizarSelosEstados(achados) {
  const alvos = getRootNode()?.querySelectorAll('#bv-estados > .estado-wrap > .estado-header [data-role="estado-selo"]');
  if (!alvos?.length) return;
  const porEstado = selosPorEstado(achados);
  let mudou = false;
  alvos.forEach((el) => {
    const numero = el.closest('.estado-wrap').dataset.estadoNumero;
    const html = htmlSeloEstado(numero, porEstado.get(numero));
    if (desenhado.get(el) === html) return;
    el.innerHTML = html;
    desenhado.set(el, html);
    mudou = true;
  });
  if (mudou) criarIcones();
}
