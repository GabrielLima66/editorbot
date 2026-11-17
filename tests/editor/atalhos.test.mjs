// Ctrl+S no editor (js/atalhos.js; ligado em orpen-bridge.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { js } from './apoio.mjs';

const { ehAtalhoSalvar, janelaPorCima, localizadorDoCampo, campoVoltaAoFoco } = await js('atalhos.js');
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('Ctrl+S e Cmd+S salvam; com Shift, Alt ou sem modificador, não', () => {
  assert.equal(ehAtalhoSalvar({ ctrlKey: true, key: 's' }), true);
  assert.equal(ehAtalhoSalvar({ metaKey: true, key: 's' }), true);
  assert.equal(ehAtalhoSalvar({ ctrlKey: true, key: 'S' }), true, 'Caps Lock ligado');
  assert.equal(ehAtalhoSalvar({ ctrlKey: true, shiftKey: true, key: 'S' }), false);
  assert.equal(ehAtalhoSalvar({ ctrlKey: true, altKey: true, key: 's' }), false, 'AltGr no Windows é Ctrl+Alt');
  assert.equal(ehAtalhoSalvar({ key: 's' }), false);
  assert.equal(ehAtalhoSalvar({ ctrlKey: true, key: 'f' }), false);
  assert.equal(ehAtalhoSalvar({ ctrlKey: true }), false);
  assert.equal(ehAtalhoSalvar(null), false);
});

// Raiz mínima: só o que janelaPorCima consulta.
function elemento({ visivel = true, minimizado = false, classes = [] } = {}) {
  return {
    classList: { contains: (c) => classes.includes(c) },
    getClientRects: () => (visivel ? [{}] : []),
    closest: (sel) => (sel === '.minimizado' && minimizado ? {} : null),
  };
}
function raizCom({ pendencias = null, modais = [] } = {}) {
  return {
    querySelector: (sel) => (sel === '#pendencias-overlay' ? pendencias : null),
    querySelectorAll: (sel) => (sel === '[aria-modal="true"]' ? modais : []),
  };
}

test('janela por cima: modal visível ou pendências abertas', () => {
  assert.equal(janelaPorCima(raizCom()), false);
  assert.equal(janelaPorCima(raizCom({ modais: [elemento()] })), true);
  assert.equal(janelaPorCima(raizCom({ pendencias: elemento() })), true);
  assert.equal(janelaPorCima(raizCom({ pendencias: elemento({ classes: ['hidden'] }) })), false);
  assert.equal(janelaPorCima(null), false);
});

test('modal escondido (copiar/colar fechado) e mini-chat do teste não contam', () => {
  assert.equal(janelaPorCima(raizCom({ modais: [elemento({ visivel: false })] })), false);
  assert.equal(janelaPorCima(raizCom({ modais: [elemento({ minimizado: true })] })), false);
  assert.equal(janelaPorCima(raizCom({ modais: [elemento({ minimizado: true }), elemento()] })), true);
});

const campo = (tagName, dataset = {}, { id = '', type = null, list = false } = {}) => ({
  tagName, id, dataset,
  getAttribute: (a) => (a === 'type' ? type : null),
  hasAttribute: (a) => a === 'list' && list,
});

test('localizador: id quando há, senão a tag com os data-* que identificam o campo', () => {
  assert.equal(localizadorDoCampo(campo('INPUT', {}, { id: 'bv-nome' })), '#bv-nome');
  assert.equal(
    localizadorDoCampo(campo('TEXTAREA', { action: 'mudar-campo-acao', transitionId: '12', actionId: '40', campo: 'message_text' })),
    'textarea[data-action="mudar-campo-acao"][data-transition-id="12"][data-action-id="40"][data-campo="message_text"]',
  );
  assert.equal(
    localizadorDoCampo(campo('INPUT', { action: 'renomear-estado', state: '3', outro: 'x' })),
    'input[data-action="renomear-estado"][data-state="3"]',
  );
  assert.equal(localizadorDoCampo(campo('INPUT', { campoBot: 'TIMEOUT_DESTINY' })), 'input[data-campo-bot="TIMEOUT_DESTINY"]');
  assert.equal(localizadorDoCampo(campo('INPUT', { action: 'a"b' })), 'input[data-action="a\\"b"]');
  assert.equal(localizadorDoCampo(campo('INPUT', {})), null);
  assert.equal(localizadorDoCampo(null), null);
});

test('o cursor volta para caixas de texto e campos simples, não para busca com lista', () => {
  assert.equal(campoVoltaAoFoco(campo('TEXTAREA')), true);
  assert.equal(campoVoltaAoFoco(campo('INPUT', {}, { type: 'text' })), true);
  assert.equal(campoVoltaAoFoco(campo('INPUT')), true, 'input sem type é texto');
  assert.equal(campoVoltaAoFoco(campo('INPUT', {}, { type: 'number' })), true);
  assert.equal(campoVoltaAoFoco(campo('INPUT', {}, { type: 'search', list: true })), false);
  assert.equal(campoVoltaAoFoco(campo('INPUT', { lista: 'bv-lista-3' }, { type: 'text' })), false);
  assert.equal(campoVoltaAoFoco(campo('SELECT')), false);
});

test('a ponte liga o Ctrl+S ao mesmo salvamento do botão e avisa no title', () => {
  const ponte = fs.readFileSync(path.join(raiz, 'js', 'orpen-bridge.js'), 'utf8');
  assert.match(ponte, /ehAtalhoSalvar\(e\)/);
  assert.match(ponte, /async function salvarPeloAtalho\(\)[\s\S]*?await salvarBotNaOrpen\(\)/);
  assert.match(ponte, /id="btn-bv-salvar"[^>]*title="[^"]*Ctrl\+S/);
});
