// Correções da auditoria (bloco A): o que a tela mostra tem que ser o que é gravado,
// e nenhum padrão pode fazer a condição ou o destino sumirem ao salvar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js } from './apoio.mjs';

const { state } = await js('state.js');
const I = await js('bot-view-interactions.js');
const R = await js('bot-view-render.js');
const { comValorAtual, rotulosUnicos } = await js('orpen-env.js');

const botCom = (extra = {}) => ({
  BOT_STATES: [{ STATE_NUMBER: '0', ALIAS: 'Início' }, { STATE_NUMBER: '3', ALIAS: 'Fila' }, { STATE_NUMBER: '1', ALIAS: 'Menu' }],
  BOT_TRANSITIONS: [{ ID: 't1', STATE: '0', PRIORITY: '0' }],
  BOT_CONDITIONS: [],
  BOT_ACTIONS: [],
  ...extra,
});

// --- 1. operador padrão ao trocar a variável -------------------------------

const condicao = (variavel) => ({
  ID: 'c1', TRANSITION_ID: 't1', CONDITION_TYPE: '1', CONDITION_DATA: { variable: variavel, type: '1', value: '' },
});

test('trocar para variável de texto não deixa "Sempre verdadeiro" como operador', () => {
  const bot = botCom({ BOT_CONDITIONS: [condicao('message')] });
  I.mudarCondicaoVariavel(bot, 't1', 'c1', 'cpf_cliente');
  assert.equal(String(bot.BOT_CONDITIONS[0].CONDITION_TYPE), '1');
});

test('contato começa em "É Vip" (10), como no nativo', () => {
  const bot = botCom({ BOT_CONDITIONS: [condicao('message')] });
  I.mudarCondicaoVariavel(bot, 't1', 'c1', 'contact');
  assert.equal(String(bot.BOT_CONDITIONS[0].CONDITION_TYPE), '10');
});

test('contador de erros começa em "Igual" e não em "Sempre verdadeiro"', () => {
  const bot = botCom({ BOT_CONDITIONS: [condicao('message')] });
  I.mudarCondicaoVariavel(bot, 't1', 'c1', 'error_count');
  assert.equal(String(bot.BOT_CONDITIONS[0].CONDITION_TYPE), '1');
});

test('"Sempre verdadeiro" continua escolhível na lista de operadores', () => {
  const valores = R.buildOperatorOptions('text', '').map((o) => String(o.value));
  assert.ok(valores.includes('0'));
});

// --- 2. Troca Estado e timeout: destino padrão -------------------------------

test('Troca Estado nova já nasce apontando para o primeiro estado', () => {
  const bot = botCom({ BOT_ACTIONS: [{ ID: 'a1', TRANSITION_ID: 't1', ACTION_TYPE: '1', ACTION_DATA: { message_text: 'oi' } }] });
  I.mudarTipoAcao(bot, 't1', 'a1', '2');
  assert.equal(bot.BOT_ACTIONS[0].ACTION_DATA.destiny, '0');
});

test('o primeiro estado é o de menor número, não o primeiro da lista', () => {
  const bot = botCom({ BOT_STATES: [{ STATE_NUMBER: '5' }, { STATE_NUMBER: '2' }, { STATE_NUMBER: '9' }] });
  assert.equal(I.primeiroNumeroDeEstado(bot), '2');
  assert.equal(I.primeiroNumeroDeEstado({ BOT_STATES: [] }), '');
});

test('select de estado vazio mostra "Selecione o estado…" e não o estado 0', () => {
  const porNumero = { 0: { STATE_NUMBER: '0', ALIAS: 'A' }, 1: { STATE_NUMBER: '1', ALIAS: 'B' } };
  const opcoes = R.opcoesDeEstado(porNumero, '');
  assert.equal(opcoes[0].value, '');
  assert.match(opcoes[0].label, /Selecione/);
});

test('select de estado com número inexistente mostra o valor gravado', () => {
  const porNumero = { 0: { STATE_NUMBER: '0', ALIAS: 'A' } };
  const opcoes = R.opcoesDeEstado(porNumero, '7');
  assert.deepEqual(opcoes.at(-1), { value: '7', label: '7 (estado inexistente)' });
  assert.equal(R.opcoesDeEstado(porNumero, '0').length, 1);
});

test('trocar o timeout para "Trocar estado" não herda o status CRM de antes', () => {
  const bot = botCom({ TIMEOUT_ACTION: 'close', TIMEOUT_DESTINY: '5' });
  I.trocarAcaoTimeout(bot, 'bot');
  assert.equal(bot.TIMEOUT_ACTION, 'bot');
  assert.equal(bot.TIMEOUT_DESTINY, '0');
});

test('trocar o timeout para "Encerrar" não herda o número do estado', () => {
  const bot = botCom({ TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '3' });
  I.trocarAcaoTimeout(bot, 'close');
  assert.equal(bot.TIMEOUT_DESTINY, '');
});

test('escolher a mesma ação do timeout não mexe no destino', () => {
  const bot = botCom({ TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '3' });
  I.trocarAcaoTimeout(bot, 'bot');
  assert.equal(bot.TIMEOUT_DESTINY, '3');
});

// --- 4. Transf. Fila só oferece filas ---------------------------------------

test('Transf. Fila lista só filas; valor de bot/agente já gravado continua visível', () => {
  state.ambienteOrpen = {
    queues: [{ id: '10', name: 'Vendas' }],
    bots: [{ id: '77', name: 'Bot X' }],
    agents: [{ id: '5', name: 'Ana' }],
  };
  const html = R.renderAcao({ ID: 'a1', TRANSITION_ID: 't1', ACTION_TYPE: '5', ACTION_DATA: { destiny: '77' } }, {}, 0, 1);
  assert.match(html, /Vendas/);
  assert.doesNotMatch(html, /Bot X/);
  assert.doesNotMatch(html, /Ana/);
  assert.match(html, /77 \(não encontrado no ambiente\)/);
  state.ambienteOrpen = null;
});

// --- 7. rótulos repetidos ----------------------------------------------------

test('cadastros com o mesmo nome ganham o ID no rótulo; os demais ficam iguais', () => {
  const opcoes = [
    { value: '12', label: '[Agente] Maria Silva' },
    { value: '87', label: '[Agente] Maria Silva' },
    { value: '3', label: '[Agente] João' },
  ];
  const r = rotulosUnicos(opcoes);
  assert.equal(new Set(r.map((o) => o.label)).size, 3);
  assert.equal(r[2].label, '[Agente] João');
  assert.match(r[0].label, /ID 12/);
  assert.match(r[1].label, /ID 87/);
});

test('comValorAtual devolve rótulos únicos e a lista sem repetição fica intacta', () => {
  const sem = [{ value: '1', label: 'A' }, { value: '2', label: 'B' }];
  assert.equal(comValorAtual(sem, '1'), sem);
  const com = comValorAtual([{ value: '1', label: 'A' }, { value: '2', label: 'A' }], '');
  assert.notEqual(com[0].label, com[1].label);
});

// --- 10. resumo da ferramenta avulsa dentro da extensão --------------------

test('mostrarResumoBot não quebra quando a página não tem a seção de upload', async () => {
  const { mostrarResumoBot } = await js('upload.js');
  state.botCarregado = botCom({ NAME: 'X', ID: '1' });
  assert.doesNotThrow(() => mostrarResumoBot());
  state.botCarregado = null;
});

// --- ID junto do nome de agentes e bots, e busca pelo ID --------------------

test('agentes e bots aparecem com o ID junto do nome', async () => {
  const { opcoesAgentes, opcoesBots, rotuloComId } = await js('orpen-env.js');
  state.ambienteOrpen = {
    agents: [{ id: '12', name: '[Agente] Maria Silva' }, { id: '9', name: '9' }],
    bots: [{ id: '77', name: '[Bot] Atendimento' }],
  };
  try {
    assert.deepEqual(opcoesAgentes().map((o) => o.label), ['[Agente 12] Maria Silva', '[Agente 9]']);
    assert.deepEqual(opcoesBots().map((o) => o.label), ['[Bot 77] Atendimento']);
    assert.equal(opcoesAgentes()[0].value, '12', 'o valor gravado continua sendo o ID');
    assert.equal(rotuloComId('Agente', '5', '[Agente 5] Já com id'), '[Agente 5] Já com id', 'idempotente');
    assert.equal(rotuloComId('Bot', '3', 'Sem prefixo'), '[Bot 3] Sem prefixo');
  } finally {
    state.ambienteOrpen = null;
  }
});

test('o ambiente guardado continua com o nome como o coletor entregou (o fluxograma lê assim)', async () => {
  const { opcoesAgentes } = await js('orpen-env.js');
  state.ambienteOrpen = { agents: [{ id: '12', name: '[Agente] Maria' }] };
  try {
    opcoesAgentes();
    assert.equal(state.ambienteOrpen.agents[0].name, '[Agente] Maria');
  } finally {
    state.ambienteOrpen = null;
  }
});
