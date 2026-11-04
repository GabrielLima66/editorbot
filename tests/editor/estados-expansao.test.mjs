// Expandir / Recolher todos os estados (js/estados-expansao.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { js } from './apoio.mjs';

const { indiceDoEstadoNoTopo, definirEstadoAberto, estadoEstaAberto } = await js('estados-expansao.js');
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('estado no topo da área visível: o primeiro que termina abaixo do topo', () => {
  const caixas = [{ bottom: 40 }, { bottom: 120 }, { bottom: 300 }];
  assert.equal(indiceDoEstadoNoTopo(caixas, 0), 0);
  assert.equal(indiceDoEstadoNoTopo(caixas, 40), 1, 'o que termina exatamente no topo já saiu da vista');
  assert.equal(indiceDoEstadoNoTopo(caixas, 100), 1, 'cortado no topo ainda conta');
  assert.equal(indiceDoEstadoNoTopo(caixas, 500), -1);
  assert.equal(indiceDoEstadoNoTopo([], 0), -1);
});

// Estado mínimo: o que definirEstadoAberto toca (corpo, borda e seta).
function classes(iniciais = []) {
  const s = new Set(iniciais);
  return { contains: (c) => s.has(c), toggle: (c, f) => (f ? s.add(c) : s.delete(c)), has: (c) => s.has(c) };
}
function estadoFalso(aberto) {
  const corpo = { classList: classes(aberto ? [] : ['hidden']) };
  const seta = { classList: classes(aberto ? ['rotate-180'] : []) };
  const wrap = {
    classList: classes(aberto ? ['estado-expandido'] : []),
    querySelector: (sel) => (sel === ':scope > .estado-body' ? corpo : sel === ':scope > .estado-header .estado-chevron' ? seta : null),
  };
  return { wrap, corpo, seta };
}

test('abrir e fechar um estado troca corpo, borda e seta juntos', () => {
  const { wrap, corpo, seta } = estadoFalso(false);
  assert.equal(estadoEstaAberto(wrap), false);
  definirEstadoAberto(wrap, true);
  assert.equal(estadoEstaAberto(wrap), true);
  assert.equal(wrap.classList.has('estado-expandido'), true);
  assert.equal(seta.classList.has('rotate-180'), true);
  definirEstadoAberto(wrap, true); // de novo: continua aberto (não alterna)
  assert.equal(corpo.classList.has('hidden'), false);
  definirEstadoAberto(wrap, false);
  assert.equal(corpo.classList.has('hidden'), true);
  assert.equal(wrap.classList.has('estado-expandido'), false);
  assert.equal(seta.classList.has('rotate-180'), false);
});

test('sem estado ou sem corpo, não quebra', () => {
  assert.doesNotThrow(() => definirEstadoAberto(null, true));
  assert.equal(estadoEstaAberto(null), false);
});

test('os botões estão na barra "Transições" do editor (a extensão só injeta o #bot-view-overlay)', () => {
  const html = fs.readFileSync(path.join(raiz, 'bot_transform.html'), 'utf8');
  const inicio = html.indexOf('id="bot-view-overlay"');
  const fim = html.indexOf('id="copiar-overlay"');
  ['btn-expandir-todos', 'btn-recolher-todos'].forEach((id) => {
    const pos = html.indexOf(`id="${id}"`);
    assert.ok(pos > inicio && pos < fim, `#${id} fora do #bot-view-overlay`);
    assert.ok(pos < html.indexOf('id="btn-copiar-colar"'), `#${id} deveria vir antes do Copiar / colar`);
  });
});
