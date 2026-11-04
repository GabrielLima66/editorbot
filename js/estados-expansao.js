// ---------------------------------------------------------------------------
// Abrir e fechar estados na lista do editor: um estado (clique no cabeçalho)
// ou todos de uma vez (botões "Expandir" / "Recolher" na barra "Transições",
// ou Alt+clique no cabeçalho de qualquer estado, sem precisar rolar até os
// botões). Só exibição: nada é gravado no bot.
//
// Os estados já estão desenhados por inteiro (o corpo fechado só tem a classe
// `hidden`), então abrir todos não redesenha nada: troca três classes por
// estado. Abrir ou fechar dezenas de estados muda a altura da lista inteira;
// para a pessoa não se perder, o estado clicado (ou, pelos botões, o que
// estava no topo da área visível) continua no mesmo lugar da tela.
// ---------------------------------------------------------------------------

import { getRootNode } from './dom-root.js';

const $r = (sel) => getRootNode().querySelector(sel);

/** Abre (true) ou fecha (false) um estado da lista: corpo, borda e seta. */
export function definirEstadoAberto(wrap, aberto) {
  const corpo = wrap?.querySelector(':scope > .estado-body');
  if (!corpo) return;
  corpo.classList.toggle('hidden', !aberto);
  wrap.classList.toggle('estado-expandido', aberto);
  wrap.querySelector(':scope > .estado-header .estado-chevron')?.classList.toggle('rotate-180', aberto);
}

export function estadoEstaAberto(wrap) {
  const corpo = wrap?.querySelector(':scope > .estado-body');
  return !!corpo && !corpo.classList.contains('hidden');
}

/**
 * Índice do primeiro estado que aparece na área visível (o de cima, mesmo
 * cortado), dadas as caixas dos estados em ordem e o topo da área rolável.
 * -1 se a lista está toda acima do topo (ou vazia).
 */
export function indiceDoEstadoNoTopo(caixas, topoVisivel) {
  return caixas.findIndex((c) => c.bottom > topoVisivel);
}

// Topo da parte visível da lista: o da área rolável ou, com a trilha fixa no
// topo (js/trilha.js), a borda de baixo dela.
function topoVisivel(area) {
  const topo = area.getBoundingClientRect().top;
  const trilha = $r('#bv-trilha:not(.hidden)');
  return trilha ? Math.max(topo, trilha.getBoundingClientRect().bottom) : topo;
}

/**
 * Abre (true) ou fecha (false) todos os estados. Devolve quantos mudaram.
 * `fixo`: o estado que não pode sair do lugar na tela (o do Alt+clique). Sem
 * ele, vale o que estava no topo da área visível.
 */
export function definirTodosAbertos(aberto, fixo = null) {
  const wraps = [...getRootNode().querySelectorAll('#bv-estados > .estado-wrap')];
  const mudar = wraps.filter((w) => estadoEstaAberto(w) !== aberto);
  if (!mudar.length) return 0;

  const area = $r('#bot-view-overlay .bv-body');
  const topo = area ? topoVisivel(area) : 0;
  let ancora = fixo;
  if (!ancora) {
    const i = indiceDoEstadoNoTopo(wraps.map((w) => w.getBoundingClientRect()), topo);
    ancora = i >= 0 ? wraps[i] : null;
  }
  const deslocamento = ancora ? ancora.getBoundingClientRect().top - topo : 0;

  // O Chrome tem a própria ancoragem de rolagem (overflow-anchor), presa a um
  // elemento escolhido por ele, e também mexe na rolagem quando a lista muda.
  // Desligada só durante a troca, para a posição depender só da correção
  // abaixo.
  if (area) area.style.overflowAnchor = 'none';
  mudar.forEach((w) => definirEstadoAberto(w, aberto));

  if (area && ancora) {
    // Mantém a âncora na mesma posição da tela. Fechando a partir do meio de
    // um estado aberto (o topo dele estava acima da área visível), o
    // cabeçalho dele vai para o topo, senão ficaria escondido acima.
    const alvo = aberto || fixo ? deslocamento : Math.max(deslocamento, 0);
    // O painel tem `zoom` (1,15 vezes o tamanho da interface, css/styles.css):
    // as posições na tela vêm com o zoom e o scrollTop é sem ele. O zoom
    // medido sai arredondado (offsetHeight é inteiro), e num bot grande a
    // lista muda centenas de milhares de pixels: uma segunda passada corrige
    // o que sobrou. Parado no fim ou no começo da rolagem, para.
    const zoom = area.getBoundingClientRect().height / area.offsetHeight || 1;
    for (let i = 0; i < 3; i++) {
      const erro = ancora.getBoundingClientRect().top - topo - alvo;
      if (Math.abs(erro) < 1) break;
      const antes = area.scrollTop;
      area.scrollTop += erro / zoom;
      if (area.scrollTop === antes) break;
    }
  }
  if (area) requestAnimationFrame(() => { area.style.overflowAnchor = ''; });
  return mudar.length;
}

/**
 * Clique no cabeçalho de um estado: abre ou fecha só ele. Com Alt, faz o
 * mesmo com todos (aberto → fecha todos; fechado → abre todos), sem tirar o
 * estado clicado do lugar: funciona do meio da lista, longe dos botões.
 */
export function alternarPeloCabecalho(wrap, todos) {
  const abrir = !estadoEstaAberto(wrap);
  if (todos) definirTodosAbertos(abrir, wrap);
  else definirEstadoAberto(wrap, abrir);
}

/** Ligado uma vez (initBotViewWiring): os dois botões da barra "Transições". */
export function initExpansaoTodos() {
  $r('#btn-expandir-todos')?.addEventListener('click', () => definirTodosAbertos(true));
  $r('#btn-recolher-todos')?.addEventListener('click', () => definirTodosAbertos(false));
}
