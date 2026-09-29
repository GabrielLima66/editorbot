// ---------------------------------------------------------------------------
// Indireção pro nó raiz usado em toda busca de elemento do editor (`$` em
// utils.js, as buscas em bot-view-interactions.js, o toast). Por padrão é
// `document` — modo standalone, bot_transform.html rodando numa aba normal.
// A extensão troca pra um ShadowRoot (setRootNode) antes de montar o overlay,
// porque document.querySelector NÃO atravessa fronteira de shadow DOM: um
// elemento com id="bv-estados" dentro do shadow root é invisível pra
// document.querySelector('#bv-estados') vindo de fora.
//
// getRootNode() é lido em toda chamada (não capturado uma vez só) porque
// abrirBotView() recria boa parte da árvore (#bv-estados inteiro) a cada
// render — o *root* em si (document ou o shadowRoot) nunca muda depois de
// setRootNode(), só o que há dentro dele.
// ---------------------------------------------------------------------------
let rootNode = document;

export function setRootNode(node) {
  rootNode = node;
}

export function getRootNode() {
  return rootNode;
}

// Esc em pilha: quem abriu por último (janela, painel, o próprio editor)
// trata o Esc, esteja o foco onde estiver. Escuta no document em captura,
// então nenhum listener de baixo recebe o mesmo Esc (antes, com o foco fora
// da janela, o Esc fechava o editor inteiro por baixo dela). O handler
// devolve false quando não se aplica agora, e o Esc passa pro de baixo.
// empilharEsc devolve a função que tira o handler da pilha.
const pilhaEsc = [];

function aoEsc(e) {
  if (e.key !== 'Escape') return;
  for (let i = pilhaEsc.length - 1; i >= 0; i--) {
    if (pilhaEsc[i](e) === false) continue;
    e.stopPropagation();
    e.preventDefault();
    return;
  }
}

export function empilharEsc(fn) {
  if (!pilhaEsc.length) document.addEventListener('keydown', aoEsc, true);
  pilhaEsc.push(fn);
  return () => {
    const i = pilhaEsc.lastIndexOf(fn);
    if (i >= 0) pilhaEsc.splice(i, 1);
    if (!pilhaEsc.length) document.removeEventListener('keydown', aoEsc, true);
  };
}

// lucide.createIcons() já aceita um {root} próprio (vendor/lucide.umd.js,
// função createIcons) — só precisa sempre receber o root ativo em vez de
// depender do `document` implícito, senão ícones dentro do shadow root nunca
// são substituídos pelo SVG.
export function criarIcones() {
  if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
    lucide.createIcons({ root: rootNode });
  }
}
