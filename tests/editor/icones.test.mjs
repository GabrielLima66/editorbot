// criarIcones (js/dom-root.js): só os ícones novos viram SVG. O lucide de
// verdade (vendor/lucide.umd.js, replaceElement) copia o data-lucide para o
// SVG que gera, então sem a limpeza cada chamada redesenhava todos os ícones
// já na tela. O lucide falso abaixo faz o mesmo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js } from './apoio.mjs';

const { setRootNode, criarIcones } = await js('dom-root.js');

function elemento(tag, attrs) {
  return { tag, attrs: new Map(Object.entries(attrs)), removeAttribute(n) { this.attrs.delete(n); } };
}
function raizFalsa(elementos) {
  return {
    nos: elementos,
    querySelectorAll(sel) {
      if (sel === '[data-lucide]') return this.nos.filter((n) => n.attrs.has('data-lucide'));
      if (sel === 'svg[data-lucide]') return this.nos.filter((n) => n.tag === 'svg' && n.attrs.has('data-lucide'));
      throw new Error(`seletor inesperado: ${sel}`);
    },
  };
}
const lucideFalso = {
  trocados: [],
  createIcons({ root }) {
    root.querySelectorAll('[data-lucide]').forEach((el) => {
      const nome = el.attrs.get('data-lucide');
      const svg = elemento('svg', { ...Object.fromEntries(el.attrs), 'data-lucide': nome, class: `lucide lucide-${nome} ${el.attrs.get('class') ?? ''}`.trim() });
      root.nos[root.nos.indexOf(el)] = svg;
      this.trocados.push(nome);
    });
  },
};

test('cada chamada desenha só os ícones novos; os já desenhados ficam como estão', () => {
  globalThis.lucide = lucideFalso;
  const raiz = raizFalsa([elemento('i', { 'data-lucide': 'trash-2', class: 'w-4 h-4' }), elemento('i', { 'data-lucide': 'copy' })]);
  setRootNode(raiz);
  try {
    criarIcones();
    assert.deepEqual(lucideFalso.trocados, ['trash-2', 'copy']);
    const [lixeira] = raiz.nos;
    // o SVG pronto perde o data-lucide, mas o nome do ícone segue na classe
    assert.equal(lixeira.tag, 'svg');
    assert.equal(lixeira.attrs.has('data-lucide'), false);
    assert.equal(lixeira.attrs.get('class'), 'lucide lucide-trash-2 w-4 h-4');

    lucideFalso.trocados = [];
    raiz.nos.push(elemento('i', { 'data-lucide': 'plus' }));
    criarIcones();
    assert.deepEqual(lucideFalso.trocados, ['plus']);
    assert.equal(raiz.nos[0], lixeira, 'o ícone já desenhado não foi recriado');

    lucideFalso.trocados = [];
    criarIcones();
    assert.deepEqual(lucideFalso.trocados, []);
  } finally {
    setRootNode(document);
    delete globalThis.lucide;
  }
});

test('sem o lucide carregado, criarIcones não faz nada', () => {
  delete globalThis.lucide;
  assert.doesNotThrow(() => criarIcones());
});
