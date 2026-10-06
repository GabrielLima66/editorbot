// Na extensão, orpen-bridge.js injeta só alguns blocos do bot_transform.html
// (extrairEsqueletoOverlay). A página standalone tem tudo, então um modal que
// falte na lista funciona nos testes isolados e fica morto na Orpen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8');
const html = ler('bot_transform.html');
const ponte = ler('js', 'orpen-bridge.js');

// Tudo que vem depois do início do #bot-view-overlay é do editor; antes ficam
// o upload e o modal de transformação, que só existem no standalone.
const inicioEditor = html.indexOf('id="bot-view-overlay"');

test('todo overlay do editor no bot_transform.html é injetado pela ponte', () => {
  const ids = [...html.matchAll(/<div id="([a-z-]+-overlay)"/g)].filter((m) => m.index >= inicioEditor).map((m) => m[1]);
  assert.ok(ids.includes('copiar-overlay') && ids.includes('pendencias-overlay'));
  ids.forEach((id) => assert.ok(ponte.includes(`'#${id}'`), `orpen-bridge.js não injeta #${id}`));
});

test('os elementos que copiar-colar.js procura estão dentro do editor, não no standalone', () => {
  const codigo = ler('js', 'copiar-colar.js');
  const usados = [...new Set([...codigo.matchAll(/\$\('#([a-z-]+)'\)/g)].map((m) => m[1]))];
  assert.ok(usados.length > 5);
  usados.forEach((id) => {
    const pos = html.indexOf(`id="${id}"`);
    assert.ok(pos >= inicioEditor, `#${id} não está no bot_transform.html ou está só na parte standalone`);
  });
});
