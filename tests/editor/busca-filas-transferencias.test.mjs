// Localizar por fila e por destino de transferência (js/busca.js:
// textoDeFila, textoDeFilaCondicao, textoDeTransferencia).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js } from './apoio.mjs';

const { textoDeFila, textoDeFilaCondicao, textoDeTransferencia } = await js('busca.js');

const acao = (tipo, destiny) => ({ ID: '1', TRANSITION_ID: '1', ACTION_TYPE: tipo, ACTION_DATA: { destiny } });
const cond = (variable, tipo) => ({ ID: '1', TRANSITION_ID: '1', CONDITION_TYPE: tipo, CONDITION_DATA: { variable } });
const filas = { 7: 'SUPORTE - Cobrança N2', 9: 'Comercial' };
const nomeDaFila = (id) => filas[id] ?? null;
const destinos = { 12: '[Agente 12] Maria', 3: '[Bot 3] Pesquisa de satisfação' };
const nomeDoDestino = (id) => destinos[id] ?? null;

test('Transf. Fila mostra o nome e o ID da fila', () => {
  assert.equal(textoDeFila(acao('5', '7'), nomeDaFila), 'SUPORTE - Cobrança N2 (ID 7)');
  assert.equal(textoDeFila(acao(5, '9'), nomeDaFila), 'Comercial (ID 9)');
  assert.equal(textoDeFila(acao('5', '55'), nomeDaFila), 'ID 55');
});

test('Transf. Fila com variável no destino', () => {
  assert.equal(textoDeFila(acao('5', '{$FILA_DESTINO}'), nomeDaFila), '{$FILA_DESTINO} (variável)');
});

test('condição AGENTES NA FILA mostra a fila', () => {
  assert.equal(textoDeFilaCondicao(cond('agent_on_queue', '7'), nomeDaFila), 'SUPORTE - Cobrança N2 (ID 7)');
  assert.equal(textoDeFilaCondicao(cond('agent_on_queue', '40'), nomeDaFila), 'ID 40');
  assert.equal(textoDeFilaCondicao(cond('agent_on_queue', ''), nomeDaFila), null);
  assert.equal(textoDeFilaCondicao(cond('agent_on_queue', '0'), nomeDaFila), null);
  assert.equal(textoDeFilaCondicao(cond('agent_online', '7'), nomeDaFila), null);
  assert.equal(textoDeFilaCondicao(cond('calendario', '7'), nomeDaFila), null);
});

test('Transf. Agente mostra o agente ou o bot de destino', () => {
  assert.equal(textoDeTransferencia(acao('4', '12'), nomeDoDestino), '[Agente 12] Maria');
  assert.equal(textoDeTransferencia(acao(4, '3'), nomeDoDestino), '[Bot 3] Pesquisa de satisfação');
  assert.equal(textoDeTransferencia(acao('4', '99'), nomeDoDestino), 'ID 99');
  assert.equal(textoDeTransferencia(acao('4', '{$pref_agent}'), nomeDoDestino), '{$pref_agent} (variável)');
});

test('outras ações e destino vazio não entram', () => {
  assert.equal(textoDeFila(acao('4', '7'), nomeDaFila), null);
  assert.equal(textoDeFila(acao('2', '7'), nomeDaFila), null);
  assert.equal(textoDeFila(acao('5', ''), nomeDaFila), null);
  assert.equal(textoDeFila({ ID: '1', ACTION_TYPE: '5' }, nomeDaFila), null);
  assert.equal(textoDeTransferencia(acao('5', '12'), nomeDoDestino), null);
  assert.equal(textoDeTransferencia(acao('2', '12'), nomeDoDestino), null);
  assert.equal(textoDeTransferencia(acao('4', '  '), nomeDoDestino), null);
});
