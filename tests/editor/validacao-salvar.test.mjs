// Travas do "Salvar" nativo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botsDeExemplo, servidorOrpen, js } from './apoio.mjs';

const { fromGetBotResponse, toUpdateBotPayload, serializeBracketNotation } = await js('orpen-adapter.js');
const { problemaAntesDeSalvar } = await js('validacao-salvar.js');

const bots = botsDeExemplo();
const abrir = (b) => fromGetBotResponse(servidorOrpen(serializeBracketNotation(toUpdateBotPayload(b))));
const umBot = () => abrir(bots.find(({ bot }) => (bot.BOT_TRANSITIONS || []).length).bot);
const comAcao = (tipo, data) => {
  const bot = umBot();
  bot.BOT_ACTIONS.push({ ID: '999999', TRANSITION_ID: bot.BOT_TRANSITIONS[0].ID, ACTION_TYPE: tipo, ACTION_DATA: data });
  return bot;
};

// Bots sintéticos (feitos para cobrir o parser do fluxograma) não precisam
// ser salváveis; os demais são bots reais ou templates e não podem travar.
const sintetico = (bot) => /sint[eé]tico/i.test(bot.NAME || '');

for (const { nome, bot } of bots.filter(({ bot: b }) => !sintetico(b))) {
  test(`bot de exemplo não é bloqueado: ${nome}`, () => {
    assert.equal(problemaAntesDeSalvar(abrir(bot)), null);
  });
}

test('formulário (11) sem message_option_form é bloqueado (o motor só lê esse campo)', () => {
  const cobertura = bots.find(({ nome }) => nome === 'cobertura-port.json');
  if (!cobertura) return;
  assert.match(problemaAntesDeSalvar(abrir(cobertura.bot)), /Mensagem Form/);
});

test('nome com mais de 50 caracteres é bloqueado', () => {
  const bot = umBot();
  bot.NAME = 'x'.repeat(51);
  assert.match(problemaAntesDeSalvar(bot), /50 caracteres/);
});

test('menu (10) vazio ou com JSON inválido é bloqueado', () => {
  assert.match(problemaAntesDeSalvar(comAcao('10', { message_option_text: '' })), /JSON inválido/);
  assert.match(problemaAntesDeSalvar(comAcao('10', { message_option_text: '{quebrado' })), /JSON inválido/);
  assert.equal(problemaAntesDeSalvar(comAcao('10', { message_option_text: '{"type":"button"}' })), null);
});

test('payload da automação (22) só é conferido quando preenchido', () => {
  assert.equal(problemaAntesDeSalvar(comAcao('22', { url: 'x', payload: '' })), null);
  assert.match(problemaAntesDeSalvar(comAcao('22', { url: 'x', payload: '{x' })), /payload/);
});

test('I.A. no fluxo exige conta de transcrição', () => {
  const bot = comAcao('20', { message_content: 'oi' });
  bot.INTEGRATIONS = {};
  assert.match(problemaAntesDeSalvar(bot), /transcrição/);
  bot.INTEGRATIONS = { audio_transcription_account: '12' };
  assert.equal(problemaAntesDeSalvar(bot), null);
});

test('assistente (18) só exige conta quando chama o assistente', () => {
  const bot = comAcao('18', { openai: 'call_assistant' });
  bot.INTEGRATIONS = {};
  assert.match(problemaAntesDeSalvar(bot), /transcrição/);
});

test('condição de cadastro (fila, agente...) sem o cadastro escolhido é bloqueada; com ele passa', () => {
  const bot = umBot();
  const tid = bot.BOT_TRANSITIONS[0].ID;
  const cond = { ID: '999998', TRANSITION_ID: tid, CONDITION_TYPE: '', CONDITION_DATA: { variable: 'agent_online', value: '' } };
  bot.BOT_CONDITIONS.push(cond);
  assert.match(problemaAntesDeSalvar(bot), /sem o cadastro escolhido/);
  cond.CONDITION_TYPE = '0';
  assert.match(problemaAntesDeSalvar(bot), /sem o cadastro escolhido/);
  cond.CONDITION_TYPE = '7';
  assert.equal(problemaAntesDeSalvar(bot), null);
  // variável de texto com "sempre verdadeiro" (tipo 0) continua válida
  bot.BOT_CONDITIONS.push({ ID: '999997', TRANSITION_ID: tid, CONDITION_TYPE: '0', CONDITION_DATA: { variable: 'message', value: '' } });
  assert.equal(problemaAntesDeSalvar(bot), null);
});
