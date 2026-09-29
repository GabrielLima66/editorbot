// Aviso de estados renumerados (VALIDACAO.md, itens 4.3 e 4.4), com as
// mesmas funções que o editor usa para mover, duplicar e excluir estados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botsDeExemplo, js } from './apoio.mjs';

const { fromGetBotResponse, toUpdateBotPayload } = await js('orpen-adapter.js');
const { fotografarNumeros, mudancasDeNumero } = await js('renumeracao.js');
const I = await js('bot-view-interactions.js');

const exemplo = botsDeExemplo().find(({ bot }) => (bot.BOT_STATES || []).length >= 6)?.bot;

function carregar() {
  const p = toUpdateBotPayload(exemplo);
  return fromGetBotResponse({
    ID: '1',
    NAME: 'teste',
    states: p.states.map((s) => ({ STATE: s.state_number, ALIAS: s.alias })),
    transitions: [],
  });
}

function depoisDe(operacao) {
  const bot = carregar();
  const foto = fotografarNumeros(bot);
  operacao(bot);
  return mudancasDeNumero(bot, foto);
}

const ultimo = (bot) => String(bot.BOT_STATES.length - 1);

test('há um bot com pelo menos 6 estados', () => assert.ok(exemplo));

test('sem mudança, sem aviso', () => assert.equal(depoisDe(() => {}), null));
test('renomear não avisa', () => assert.equal(depoisDe((b) => I.renomearEstado(b, '2', 'Outro nome')), null));
test('adicionar no fim não avisa', () => assert.equal(depoisDe((b) => I.adicionarEstado(b)), null));

test('excluir o último: 1 excluído, entrada igual', () => {
  const r = depoisDe((b) => I.excluirEstado(b, ultimo(b)));
  assert.equal(r.excluidos.length, 1);
  assert.equal(r.mudados.length, 0);
  assert.equal(r.entrada, null);
});

test('excluir um estado do meio renumera os seguintes', () => {
  const r = depoisDe((b) => I.excluirEstado(b, '1'));
  assert.equal(r.excluidos.length, 1);
  assert.ok(r.mudados.length >= 1);
  assert.ok(r.mudados.every((m) => Number(m.para) === Number(m.de) - 1));
});

test('duplicar empurra os seguintes, sem mudar a entrada', () => {
  const r = depoisDe((b) => I.duplicarEstado(b, '0'));
  assert.ok(r.mudados.length >= 1);
  assert.equal(r.entrada, null);
});

test('arrastar para o topo muda a entrada', () => {
  const r = depoisDe((b) => I.moverEstado(b, '5', 0));
  assert.ok(r.entrada);
  assert.notEqual(r.entrada.antes, r.entrada.depois);
});

test('excluir o estado 0 muda a entrada', () => {
  const r = depoisDe((b) => I.excluirEstado(b, '0'));
  assert.ok(r.entrada);
});

test('excluir o último e adicionar outro (ID reaproveitado) continua avisando a exclusão', () => {
  const r = depoisDe((b) => { I.excluirEstado(b, ultimo(b)); I.adicionarEstado(b); });
  assert.equal(r.excluidos.length, 1);
});

test('mover e voltar para a posição original não avisa', () => {
  assert.equal(depoisDe((b) => { I.moverEstado(b, '3', 1); I.moverEstado(b, '1', 3); }), null);
});
