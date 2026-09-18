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

// lucide.createIcons() já aceita um {root} próprio (vendor/lucide.umd.js,
// função createIcons) — só precisa sempre receber o root ativo em vez de
// depender do `document` implícito, senão ícones dentro do shadow root nunca
// são substituídos pelo SVG.
export function criarIcones() {
  if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
    lucide.createIcons({ root: rootNode });
  }
}
