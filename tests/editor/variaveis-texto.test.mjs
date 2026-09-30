// Inserir variável nas caixas de texto (botão direito ou "{$"), como o
// contextMenuHint do modal nativo, mas no cursor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js } from './apoio.mjs';

const { state } = await js('state.js');
const V = await js('variaveis-texto.js');

test('botão direito: insere no cursor, não no fim', () => {
  const r = V.textoComVariavel('Olá , tudo bem?', 4, 4, 'nome', 'menu');
  assert.equal(r.texto, 'Olá {$nome}, tudo bem?');
  assert.equal(r.cursor, 4 + '{$nome}'.length);
});

test('botão direito com texto selecionado: troca a seleção', () => {
  assert.equal(V.textoComVariavel('Olá FULANO!', 4, 10, 'nome', 'menu').texto, 'Olá {$nome}!');
});

test('digitando "{$no": completa trocando o parcial', () => {
  const texto = 'Seu CPF: {$cp e mais';
  const fim = 'Seu CPF: {$cp'.length;
  const r = V.textoComVariavel(texto, fim, fim, 'cpf_cliente', 'digitando');
  assert.equal(r.texto, 'Seu CPF: {$cpf_cliente} e mais');
});

test('lista: variáveis do bot e as gravadas pelo próprio bot, sem assistentes', () => {
  state.ambienteOrpen = {
    variables: [{ id: 'message', name: 'MENSAGEM', parent: null }, { id: 'cpf_cliente', name: 'cpf_cliente', parent: null }],
    openAiAccounts: [{ id: '7', name: 'Conta', assistants: [{ id: 'asst_1', name: 'Triagem' }] }],
  };
  const bot = { BOT_ACTIONS: [{ ID: '1', TRANSITION_ID: '1', ACTION_TYPE: '13', ACTION_DATA: { bot_variables_text: '{"protocolo":"{$message}","etapa":"2"}' } }] };
  const itens = V.variaveisDisponiveis(bot);
  const valores = itens.map((i) => i.valor);
  assert.ok(valores.includes('message') && valores.includes('cpf_cliente'));
  assert.ok(valores.includes('protocolo') && valores.includes('etapa'));
  assert.equal(itens.find((i) => i.valor === 'etapa').grupo, 'Gravadas neste bot');
  assert.ok(!valores.includes('asst_1'));
});

test('JSON incompleto na ação "Armazenar variável" não quebra a lista', () => {
  state.ambienteOrpen = null;
  const bot = { BOT_ACTIONS: [{ ID: '1', TRANSITION_ID: '1', ACTION_TYPE: '13', ACTION_DATA: { bot_variables_text: '{"a":' } }] };
  assert.ok(V.variaveisDisponiveis(bot).length > 0);
});
