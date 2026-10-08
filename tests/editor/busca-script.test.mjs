// Localizar por script de integração (js/busca.js, textoDeScript).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js } from './apoio.mjs';

const { textoDeScript } = await js('busca.js');

const acao = (tipo, script_name) => ({ ID: '1', TRANSITION_ID: '1', ACTION_TYPE: tipo, ACTION_DATA: { script_name } });
const nomes = { 81: 'Consulta de boleto', 90: 'Abrir chamado' };
const nomeDe = (id) => nomes[id] ?? null;

test('ação Executar Script mostra o nome e o ID do script', () => {
  assert.equal(textoDeScript(acao('7', '81'), nomeDe), 'Consulta de boleto (ID 81)');
  assert.equal(textoDeScript(acao(7, '90'), nomeDe), 'Abrir chamado (ID 90)');
});

test('sem o cadastro do ambiente só há o ID', () => {
  assert.equal(textoDeScript(acao('7', '123'), nomeDe), 'ID 123');
});

test('outras ações e script não escolhido não entram', () => {
  assert.equal(textoDeScript(acao('1', '81'), nomeDe), null);
  assert.equal(textoDeScript(acao('22', '81'), nomeDe), null);
  assert.equal(textoDeScript(acao('7', ''), nomeDe), null);
  assert.equal(textoDeScript(acao('7', undefined), nomeDe), null);
  assert.equal(textoDeScript({ ID: '2', TRANSITION_ID: '1', ACTION_TYPE: '7' }, nomeDe), null);
});
