// Lista de variáveis da condição igual à do modal nativo (bot.php:3065-3364).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js } from './apoio.mjs';

const { state } = await js('state.js');
const R = await js('bot-view-render.js');
const { agruparOpcoes, ACTION_TYPE_LABELS, GRUPOS_ACAO } = await js('dictionaries.js');

// Como o coletor entrega bot_variables do nativo.
const VARIAVEIS = [
  { id: 'message', name: 'MENSAGEM', parent: null, fixa: true },
  { id: 'calendario', name: 'CALENDARIO - Verdadeiro', parent: null, fixa: true },
  { id: 'automate_status', name: '[Automação] Status', parent: 'automate', fixa: false },
  { id: 'cpf_cliente', name: 'cpf_cliente', parent: null, fixa: true },
  { id: '81_protocolo', name: '[Survey] 81_protocolo', parent: '81', fixa: false },
  { id: '90_saldo', name: '[Saldo] 90_saldo', parent: '90', fixa: false },
];
const botCom = (...acoes) => ({ BOT_ACTIONS: acoes.map(([tipo, data], i) => ({ ID: String(i), TRANSITION_ID: '1', ACTION_TYPE: tipo, ACTION_DATA: data || {} })) });
const valores = (bot) => R.opcoesVariavelCondicao(bot).map((o) => o.value);

test('variáveis do bot (getBotVars) aparecem e podem ser escolhidas', () => {
  state.ambienteOrpen = { variables: VARIAVEIS };
  const opcoes = R.opcoesVariavelCondicao(botCom());
  const cpf = opcoes.find((o) => o.value === 'cpf_cliente');
  assert.ok(cpf);
  assert.equal(cpf.grupo, 'Variáveis do bot');
});

test('nomes iguais aos do nativo', () => {
  state.ambienteOrpen = { variables: VARIAVEIS };
  assert.equal(R.opcoesVariavelCondicao(botCom()).find((o) => o.value === 'calendario').label, 'CALENDARIO - Verdadeiro');
});

test('variável de script só com a ação "Executar Script" daquele script', () => {
  state.ambienteOrpen = { variables: VARIAVEIS };
  assert.ok(!valores(botCom()).includes('81_protocolo'));
  const v = valores(botCom(['7', { script_name: '81' }]));
  assert.ok(v.includes('81_protocolo'));
  assert.ok(!v.includes('90_saldo'));
});

test('variáveis da Automação só com a ação "Executar Automação"', () => {
  state.ambienteOrpen = { variables: VARIAVEIS };
  assert.ok(!valores(botCom()).includes('automate_status'));
  assert.ok(valores(botCom(['22', {}])).includes('automate_status'));
});

test('variável escondida agora ainda aparece pelo nome na condição existente', () => {
  state.ambienteOrpen = { variables: VARIAVEIS };
  assert.equal(R.nomeVariavelCondicao('81_protocolo'), '[Survey] 81_protocolo');
});

test('lista agrupada por tópicos, grupos contíguos', () => {
  state.ambienteOrpen = { variables: VARIAVEIS, openAiAccounts: [{ id: '7', name: 'Conta', assistants: [{ id: 'asst_1', name: 'Triagem' }] }] };
  const grupos = R.opcoesVariavelCondicao(botCom(['7', { script_name: '81' }], ['22', {}])).map((o) => o.grupo);
  const sequencia = grupos.filter((g, i) => g !== grupos[i - 1]);
  assert.equal(new Set(sequencia).size, sequencia.length, `grupo repetido: ${sequencia.join(' > ')}`);
  assert.ok(sequencia.includes('Assistentes OpenAI'));
});

test('tipos de ação agrupados cobrem todos os tipos, sem "Outras"', () => {
  const opcoes = agruparOpcoes(ACTION_TYPE_LABELS, GRUPOS_ACAO);
  assert.equal(opcoes.length, Object.keys(ACTION_TYPE_LABELS).length);
  assert.ok(!opcoes.some((o) => o.grupo === 'Outras'), opcoes.filter((o) => o.grupo === 'Outras').map((o) => o.label).join(', '));
});

test('sem ambiente (modo avulso): lista fixa do editor', () => {
  state.ambienteOrpen = null;
  assert.ok(valores(botCom()).includes('message'));
});

test('condição ENTRADA lista as entradas pelo nome e grava o ID, como no nativo', () => {
  state.ambienteOrpen = {
    entradasCondicao: [{ id: '11', name: 'WhatsApp Vendas' }, { id: '12', name: 'ID: 12' }],
    entrances: [{ id: '5511999', name: '[Whatsapp] 5511999' }],
  };
  const opcoes = R.buildOperatorOptions('ref_entrance', '');
  assert.deepEqual(opcoes.map((o) => [o.value, o.label]), [['11', 'WhatsApp Vendas'], ['12', 'ID: 12']]);
});
