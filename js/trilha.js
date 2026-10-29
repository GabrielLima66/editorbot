// ---------------------------------------------------------------------------
// Trilha de navegação: os saltos feitos pelo editor ("ir para o estado" da
// Troca Estado, os chips "vem de / vai para", "Quem aponta" e o aviso de
// exclusão) ficam numa barra fixa acima da lista, "0 Início › 3 Menu (T1) ›
// 7 Financeiro", com um Voltar que leva ao ponto exato de onde se saiu. O
// estado de chegada ganha o aviso "Você veio de ...".
//
// Só os saltos contam: rolar a lista à mão não mexe na trilha. Cada passo
// guarda o próprio objeto do estado, então renumerar ou renomear um estado
// atualiza a trilha; ela zera ao fechar o editor ou se um estado dela sumir.
// Sem atalho de teclado: Alt+← é o "voltar" do navegador e sairia da página.
// Só exibição: nada é gravado.
// ---------------------------------------------------------------------------

import { state } from './state.js';
import { getRootNode } from './dom-root.js';
import { escapeHtml } from './utils.js';

const MAX_PASSOS = 8;

// Cada passo: { obj (o estado em BOT_STATES), transitionId?, actionId? }. O
// último é onde se está; os outros, de onde se saiu em cada salto.
let passos = [];
let cortado = false;
let irPara = () => {};

const raiz = () => getRootNode();
const estadoDe = (n) => (state.botCarregado?.BOT_STATES || []).find((s) => String(s.STATE_NUMBER) === String(n));
const numero = (p) => String(p.obj.STATE_NUMBER);
const prioridade = (p) => (p.transitionId ? (state.botCarregado?.BOT_TRANSITIONS || []).find((t) => t.ID === p.transitionId)?.PRIORITY : undefined);

function pontoDe(el) {
  const wrap = el?.closest?.('.estado-wrap');
  if (!wrap) return null;
  const obj = estadoDe(wrap.dataset.estadoNumero);
  if (!obj) return null;
  return { obj, transitionId: el.closest('.estado-row')?.dataset.transitionId, actionId: el.closest('.acao-item')?.dataset.actionId };
}

/** Chamado antes de um salto: `origemEl` é o botão clicado, `destino` = { estado, actionId? }. */
export function registrarSalto(origemEl, destino) {
  const origem = pontoDe(origemEl);
  const alvo = estadoDe(destino?.estado);
  if (!origem || !alvo || alvo === origem.obj) return;
  // Saindo do estado onde a trilha está: só refina de onde se saiu. De outro
  // estado (chegou rolando): ele entra como um passo novo.
  if (passos.length && passos[passos.length - 1].obj === origem.obj) passos[passos.length - 1] = origem;
  else passos.push(origem);
  passos.push({ obj: alvo, actionId: destino.actionId });
  if (passos.length > MAX_PASSOS) {
    passos = passos.slice(-MAX_PASSOS);
    cortado = true;
  }
  desenhar();
}

export function limparTrilha() {
  passos = [];
  cortado = false;
  desenhar();
}

// Volta ao passo `indice` (o anterior, no Voltar) e descarta os seguintes.
function voltarPara(indice) {
  const alvo = passos[indice];
  if (!alvo) return;
  passos = passos.slice(0, indice + 1);
  if (passos.length < 2) { passos = []; cortado = false; }
  desenhar();
  irPara({ estado: numero(alvo), transitionId: alvo.transitionId, actionId: alvo.actionId });
}

// Um estado excluído (ou outro bot carregado) invalida a trilha.
const trilhaValida = () => passos.every((p) => (state.botCarregado?.BOT_STATES || []).includes(p.obj));

const rotuloPasso = (p) => `${escapeHtml(numero(p))} ${escapeHtml(p.obj.ALIAS || 'Sem nome')}`;

function htmlBarra() {
  const ultimo = passos.length - 1;
  const itens = passos.map((p, i) => {
    if (i === ultimo) return `<span class="trilha-passo trilha-atual">${rotuloPasso(p)}</span>`;
    const t = prioridade(p);
    const via = t !== undefined ? `<span class="trilha-via" title="Saiu pela transição ${escapeHtml(t)}">T${escapeHtml(t)}</span>` : '';
    return `<button type="button" class="trilha-passo" data-trilha="ir" data-indice="${i}" title="Voltar para este ponto">${rotuloPasso(p)}</button>${via}<span class="trilha-sep" aria-hidden="true">›</span>`;
  }).join('');
  return `<button type="button" class="trilha-voltar" data-trilha="voltar" title="Voltar para onde estava antes do último salto">← Voltar</button>`
    + `<span class="trilha-passos">${cortado ? '<span class="trilha-sep" title="Passos mais antigos foram descartados">…</span>' : ''}${itens}</span>`
    + '<button type="button" class="trilha-fechar" data-trilha="limpar" title="Limpar a trilha" aria-label="Limpar a trilha">×</button>';
}

function htmlAviso() {
  const de = passos[passos.length - 2];
  const t = prioridade(de);
  const via = t !== undefined ? `, transição <span class="trilha-via">T${escapeHtml(t)}</span>` : '';
  return `<span>Você veio de <button type="button" class="estado-chegada-link" data-trilha="voltar" title="Voltar para lá">${escapeHtml(numero(de))} · ${escapeHtml(de.obj.ALIAS || 'Sem nome')}</button>${via}.</span>`;
}

let ultimoAviso = '';
function desenhar() {
  const barra = raiz()?.querySelector('#bv-trilha');
  if (!barra) return;
  if (passos.length && !trilhaValida()) { passos = []; cortado = false; }
  const ativa = passos.length >= 2;
  const htmlB = ativa ? htmlBarra() : '';
  if (barra.innerHTML !== htmlB) {
    barra.innerHTML = htmlB;
    // Passos demais para a largura: mostra o fim (onde se está).
    const lista = barra.querySelector('.trilha-passos');
    if (lista) lista.scrollLeft = lista.scrollWidth;
  }
  barra.classList.toggle('hidden', !ativa);
  // Com a barra fixa no topo, quem rola até um estado (scrollIntoView) para
  // abaixo dela, e não por baixo.
  raiz().querySelector('#bot-view-overlay')?.classList.toggle('trilha-ativa', ativa);

  // Aviso só no estado onde se está; some dos outros.
  const atual = ativa ? numero(passos[passos.length - 1]) : null;
  raiz().querySelectorAll('#bv-estados [data-role="estado-chegada"]').forEach((el) => {
    if (el.closest('.estado-wrap')?.dataset.estadoNumero !== atual) el.remove();
  });
  if (!ativa) return;
  const wrap = raiz().querySelector(`#bv-estados .estado-wrap[data-estado-numero="${CSS.escape(atual)}"]`);
  const aviso = htmlAviso();
  let el = wrap?.querySelector(':scope > [data-role="estado-chegada"]');
  if (wrap && !el) {
    wrap.querySelector(':scope > .estado-header')?.insertAdjacentHTML('afterend', '<div class="estado-chegada" data-role="estado-chegada"></div>');
    el = wrap.querySelector(':scope > [data-role="estado-chegada"]');
  }
  if (el && (el.innerHTML === '' || ultimoAviso !== aviso)) { el.innerHTML = aviso; ultimoAviso = aviso; }
}

/** Ligado uma vez (initBotViewWiring). `irParaPonto(passo)` abre o estado e rola até o ponto. */
export function initTrilha(irParaPonto) {
  irPara = irParaPonto;
  const estados = raiz()?.querySelector('#bv-estados');
  if (!estados) return;
  if (!raiz().querySelector('#bv-trilha')) estados.insertAdjacentHTML('beforebegin', '<div id="bv-trilha" class="hidden" role="navigation" aria-label="Trilha de navegação entre estados"></div>');
  raiz().querySelector('#bot-view-overlay')?.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-trilha]');
    if (!btn) return;
    if (btn.dataset.trilha === 'voltar') voltarPara(passos.length - 2);
    else if (btn.dataset.trilha === 'ir') voltarPara(Number(btn.dataset.indice));
    else if (btn.dataset.trilha === 'limpar') limparTrilha();
  });
  // Re-render do estado (ou do bot) recria o wrap sem o aviso, e renumerar
  // ou excluir estados pode invalidar a trilha.
  new MutationObserver((registros) => {
    if (!passos.length) return;
    if (registros.every((r) => r.target.closest?.('[data-role="estado-chegada"], .estado-fluxo, .transicao-regra'))) return;
    desenhar();
  }).observe(estados, { childList: true, subtree: true });
  // Renomear um estado da trilha muda o texto dela.
  estados.addEventListener('change', (e) => {
    if (passos.length && e.target.matches?.('.estado-alias')) setTimeout(desenhar, 0);
  });
}
