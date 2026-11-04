// Listas de sugestões compartilhadas (js/listas-compartilhadas.js): campos com
// as mesmas opções apontam para a mesma <datalist>, e fechar o editor libera o
// bot da tela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js, idDaLista, opcoesDaLista } from './apoio.mjs';

const { state } = await js('state.js');
const L = await js('listas-compartilhadas.js');
const R = await js('bot-view-render.js');
const { setRootNode } = await js('dom-root.js');

const AMBIENTE = {
  queues: [{ id: 'SUP', name: 'Suporte' }, { id: 'VEN', name: 'Vendas' }],
  agents: [{ id: '5', name: '[Agente] Ana' }],
  bots: [{ id: '77', name: '[Bot] Triagem' }],
  variables: [{ id: 'FILA_ESCOLHIDA', name: 'Fila escolhida', parent: null }],
};
const fila = (id, destiny) => ({ ID: id, TRANSITION_ID: 't1', ACTION_TYPE: '5', ACTION_DATA: { destiny } });
const agente = (id, destiny) => ({ ID: id, TRANSITION_ID: 't1', ACTION_TYPE: '4', ACTION_DATA: { destiny } });
const condicao = (id, variable, tipo = '1') => ({ ID: id, TRANSITION_ID: 't1', CONDITION_TYPE: tipo, CONDITION_DATA: { variable, value: 'x' } });

// Raiz falsa com só o que as funções procuram (getRootNode().querySelector).
function raizFalsa(elementos = {}, activeElement = null) {
  return { activeElement, querySelector: (sel) => elementos[sel] ?? null };
}
function caixaFalsa() {
  return {
    html: '',
    insercoes: 0,
    insertAdjacentHTML(_onde, h) { this.html += h; this.insercoes++; },
    set innerHTML(v) { this.html = v; },
    get innerHTML() { return this.html; },
  };
}

test('mesmas opções, mesma lista; opções diferentes ou em outra ordem, outra lista', () => {
  L.zerarListasCompartilhadas();
  const a = L.listaCompartilhada([{ value: '1', label: 'Um' }, { value: '2', label: 'Dois' }]);
  const b = L.listaCompartilhada([{ value: '1', label: 'Um' }, { value: '2', label: 'Dois' }]);
  const c = L.listaCompartilhada([{ value: '2', label: 'Dois' }, { value: '1', label: 'Um' }]);
  const d = L.listaCompartilhada([{ value: '1', label: 'Um', grupo: 'G' }, { value: '2', label: 'Dois' }]);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
});

test('o <option> é o mesmo que cada campo montava, com o texto do bot escapado', () => {
  assert.equal(
    L.htmlDasOpcoes([{ value: '{$X}', label: 'A "B" <c>', grupo: 'Variáveis do bot' }, { value: '2', label: 'Sem grupo' }]),
    '<option value="A &quot;B&quot; &lt;c&gt;" data-value="{$X}" data-grupo="Variáveis do bot"><option value="Sem grupo" data-value="2">',
  );
});

test('a lista entra uma vez em #bv-listas; zerar esvazia a caixa e esquece as listas', () => {
  const caixa = caixaFalsa();
  setRootNode(raizFalsa({ '#bv-listas': caixa }));
  try {
    L.zerarListasCompartilhadas();
    const id = L.listaCompartilhada([{ value: '1', label: 'Um' }]);
    L.listaCompartilhada([{ value: '1', label: 'Um' }]);
    assert.equal(caixa.insercoes, 1);
    assert.equal(caixa.html, `<datalist id="${id}"><option value="Um" data-value="1"></datalist>`);
    L.zerarListasCompartilhadas();
    assert.equal(caixa.html, '');
    assert.equal(L.opcoesDaLista(id), null);
    // depois de zerar, a mesma lista volta com um id novo (nenhum id é reaproveitado)
    assert.notEqual(L.listaCompartilhada([{ value: '1', label: 'Um' }]), id);
  } finally {
    setRootNode(document);
  }
});

test('transferências para o mesmo cadastro compartilham a lista de filas e a de variáveis', () => {
  state.ambienteOrpen = AMBIENTE;
  L.zerarListasCompartilhadas();
  const a1 = R.renderAcao(fila('a1', 'SUP'), {}, 0, 3);
  const a2 = R.renderAcao(fila('a2', 'VEN'), {}, 1, 3);
  const a3 = R.renderAcao(agente('a3', '5'), {}, 2, 3);
  assert.equal(idDaLista(a1, 'data-lista-fila'), idDaLista(a2, 'data-lista-fila'));
  assert.equal(idDaLista(a1, 'data-lista-variavel'), idDaLista(a2, 'data-lista-variavel'));
  // agente usa outra lista (agentes e bots), com as variáveis próprias do agente
  assert.notEqual(idDaLista(a3, 'data-lista-fila'), idDaLista(a1, 'data-lista-fila'));
  assert.match(opcoesDaLista(idDaLista(a3, 'data-lista-fila')), /value="\[Agente 5\] Ana" data-value="5" data-grupo="Agentes"><option value="\[Bot 77\] Triagem" data-value="77" data-grupo="Bots">/);
  // o HTML do campo não leva mais a lista
  assert.doesNotMatch(a1 + a2 + a3, /<datalist/);
  state.ambienteOrpen = null;
});

test('valor gravado fora do ambiente ganha lista própria com o "não encontrado"; a dos outros não muda', () => {
  state.ambienteOrpen = AMBIENTE;
  L.zerarListasCompartilhadas();
  const normal = R.renderAcao(fila('a1', 'SUP'), {}, 0, 2);
  const sumida = R.renderAcao(fila('a2', 'ANTIGA'), {}, 1, 2);
  const idNormal = idDaLista(normal, 'data-lista-fila');
  const idSumida = idDaLista(sumida, 'data-lista-fila');
  assert.notEqual(idNormal, idSumida);
  assert.match(opcoesDaLista(idSumida), /ANTIGA \(não encontrado no ambiente\)/);
  assert.doesNotMatch(opcoesDaLista(idNormal), /não encontrado/);
  assert.match(sumida, /value="ANTIGA \(não encontrado no ambiente\)"/);
  state.ambienteOrpen = null;
});

test('condições do mesmo tipo compartilham a lista de operadores, sem tópico (como antes)', () => {
  L.zerarListasCompartilhadas();
  const c1 = R.renderCondicao(condicao('c1', 'message'), 0, 3);
  const c2 = R.renderCondicao(condicao('c2', 'message'), 1, 3);
  const c3 = R.renderCondicao(condicao('c3', 'error_count', '7'), 2, 3);
  const operador = (html) => /list="(bv-lista-\d+)" class="field-view condicao-operador/.exec(html)[1];
  assert.equal(operador(c1), operador(c2));
  assert.notEqual(operador(c1), operador(c3));
  assert.match(opcoesDaLista(operador(c1)), /<option value="Sempre verdadeiro \(else\)" data-value="0">/);
  assert.doesNotMatch(opcoesDaLista(operador(c1)), /data-grupo/);
  assert.doesNotMatch(c1, /<datalist/);
});

test('fechar o editor confirma o campo em edição e depois tira o bot e as listas da tela', () => {
  const ordem = [];
  const estados = { innerHTML: '<div class="estado-wrap">…</div>', contains: (el) => el === campo };
  const campo = { blur: () => ordem.push(`blur com o bot na tela: ${estados.innerHTML !== ''}`) };
  const overlay = { classList: { add: (c) => ordem.push(`overlay ${c}`) } };
  const caixa = caixaFalsa();
  globalThis.document.body ??= { style: {} };
  globalThis.document.documentElement ??= { style: {} };
  setRootNode(raizFalsa({ '#bv-estados': estados, '#bot-view-overlay': overlay, '#bv-listas': caixa }, campo));
  try {
    L.zerarListasCompartilhadas();
    const id = L.listaCompartilhada([{ value: '1', label: 'Um' }]);
    R.fecharBotView();
    assert.deepEqual(ordem, ['blur com o bot na tela: true', 'overlay hidden']);
    assert.equal(estados.innerHTML, '');
    assert.equal(caixa.html, '');
    assert.equal(L.opcoesDaLista(id), null);
  } finally {
    setRootNode(document);
  }
});

test('fechar sem campo em edição não tira o foco de nada fora do editor', () => {
  const fora = { blur: () => assert.fail('blur num campo fora do editor') };
  const estados = { innerHTML: 'x', contains: () => false };
  const overlay = { classList: { add() {} } };
  globalThis.document.body ??= { style: {} };
  globalThis.document.documentElement ??= { style: {} };
  setRootNode(raizFalsa({ '#bv-estados': estados, '#bot-view-overlay': overlay }, fora));
  try {
    R.fecharBotView();
    assert.equal(estados.innerHTML, '');
  } finally {
    setRootNode(document);
  }
});
