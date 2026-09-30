// Condições do assistente OpenAI no formato do modal nativo:
// raiz 1 (status) ou 2 (conteúdo), operador dentro do data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botsDeExemplo, servidorOrpen, js } from './apoio.mjs';

const { fromGetBotResponse, toUpdateBotPayload, serializeBracketNotation, payloadEsperadoNoServidor } = await js('orpen-adapter.js');
const I = await js('bot-view-interactions.js');

const abrir = (b) => fromGetBotResponse(servidorOrpen(serializeBracketNotation(toUpdateBotPayload(b))));
const exemplo = botsDeExemplo().find(({ bot }) => (bot.BOT_TRANSITIONS || []).length).bot;

function comCondicao() {
  const bot = abrir(exemplo);
  const t = bot.BOT_TRANSITIONS[0];
  I.adicionarCondicao(bot, t.ID);
  const c = bot.BOT_CONDITIONS[bot.BOT_CONDITIONS.length - 1];
  return { bot, t, c };
}
const tipoNoPayload = (bot, c) => toUpdateBotPayload(bot).states
  .flatMap((s) => s.transitions).flatMap((tr) => tr.conditions)
  .find((x) => x.data === c.CONDITION_DATA)?.type;

test('escolher um assistente na variável vira "Status da análise: Sucesso", como no nativo', () => {
  const { bot, t, c } = comCondicao();
  I.mudarCondicaoParaAssistente(bot, t.ID, c.ID, 'asst_abc');
  assert.equal(c.CONDITION_TYPE, '1');
  assert.deepEqual(c.CONDITION_DATA, { variable: 'assistant_analysis_status', value: 'success', assistant_id: 'asst_abc' });
});

test('status: detalhe Falha grava em data.value', () => {
  const { bot, t, c } = comCondicao();
  I.mudarCondicaoParaAssistente(bot, t.ID, c.ID, 'asst_abc');
  I.mudarCondicaoIaDetalhe(bot, t.ID, c.ID, 'error');
  assert.equal(c.CONDITION_DATA.value, 'error');
  assert.equal(c.CONDITION_TYPE, '1');
});

test('operador Conteúdo da análise: raiz 2, Igual a, texto limpo; detalhe vai para data.type', () => {
  const { bot, t, c } = comCondicao();
  I.mudarCondicaoParaAssistente(bot, t.ID, c.ID, 'asst_abc');
  I.mudarCondicaoOperador(bot, t.ID, c.ID, '2');
  assert.equal(c.CONDITION_TYPE, '2');
  assert.deepEqual(c.CONDITION_DATA, { variable: 'assistant_analysis_text', type: '1', value: '', assistant_id: 'asst_abc' });
  I.mudarCondicaoIaDetalhe(bot, t.ID, c.ID, '2');
  I.mudarCondicaoValor(bot, t.ID, c.ID, 'cancelar');
  assert.equal(c.CONDITION_DATA.type, '2');
  assert.equal(c.CONDITION_DATA.value, 'cancelar');
  I.mudarCondicaoOperador(bot, t.ID, c.ID, '1');
  assert.deepEqual(c.CONDITION_DATA, { variable: 'assistant_analysis_status', value: 'success', assistant_id: 'asst_abc' });
});

test('trocar o assistente mantém o resto da condição', () => {
  const { bot, t, c } = comCondicao();
  I.mudarCondicaoParaAssistente(bot, t.ID, c.ID, 'asst_abc');
  I.mudarCondicaoIaDetalhe(bot, t.ID, c.ID, 'error');
  I.mudarCondicaoParaAssistente(bot, t.ID, c.ID, 'asst_xyz');
  assert.equal(c.CONDITION_DATA.assistant_id, 'asst_xyz');
  assert.equal(c.CONDITION_DATA.value, 'error');
});

test('voltar para uma variável comum tira os campos do assistente', () => {
  const { bot, t, c } = comCondicao();
  I.mudarCondicaoVariavel(bot, t.ID, c.ID, 'assistant_analysis_text');
  I.mudarCondicaoVariavel(bot, t.ID, c.ID, 'message');
  assert.equal(c.CONDITION_DATA.assistant_id, undefined);
  assert.equal(c.CONDITION_DATA.type, undefined);
  assert.notEqual(c.CONDITION_TYPE, '2');
});

test('condição salva antes com o operador na raiz sai corrigida no payload', () => {
  const { bot, c } = comCondicao();
  c.CONDITION_TYPE = 'success';
  c.CONDITION_DATA = { variable: 'assistant_analysis_status', value: 'success', assistant_id: 'asst_x' };
  assert.equal(tipoNoPayload(bot, c), 1);
  c.CONDITION_TYPE = '3';
  c.CONDITION_DATA = { variable: 'assistant_analysis_text', type: '3', value: 'oi', assistant_id: 'asst_x' };
  assert.equal(tipoNoPayload(bot, c), 2);
});

test('ida e volta com condições de I.A. confere', () => {
  const { bot, t, c } = comCondicao();
  I.mudarCondicaoParaAssistente(bot, t.ID, c.ID, 'asst_x');
  I.mudarCondicaoOperador(bot, t.ID, c.ID, '2');
  I.mudarCondicaoValor(bot, t.ID, c.ID, 'cancelar');
  const payload = toUpdateBotPayload(bot);
  const gravado = serializeBracketNotation(toUpdateBotPayload(fromGetBotResponse(servidorOrpen(serializeBracketNotation(payload)))));
  assert.equal(gravado, serializeBracketNotation(payloadEsperadoNoServidor(payload).esperado));
});

// "Possui os labels" (18) e "Adicionar labels"
test('condição 18: valor editado vira lista de IDs', () => {
  const { bot, t, c } = comCondicao();
  I.mudarCondicaoVariavel(bot, t.ID, c.ID, 'contact');
  I.mudarCondicaoOperador(bot, t.ID, c.ID, '18');
  I.mudarCondicaoValor(bot, t.ID, c.ID, '12, 15 ,');
  assert.deepEqual(c.CONDITION_DATA.value, ['12', '15']);
});

test('condição 18 salva antes como texto sai como lista no payload e confere', () => {
  const { bot, c } = comCondicao();
  c.CONDITION_TYPE = '18';
  c.CONDITION_DATA = { variable: 'contact', value: '7, 9' };
  const payload = toUpdateBotPayload(bot);
  const enviada = payload.states.flatMap((s) => s.transitions).flatMap((tr) => tr.conditions).find((x) => x.type === 18);
  assert.deepEqual(enviada.data.value, ['7', '9']);
  const gravado = serializeBracketNotation(toUpdateBotPayload(fromGetBotResponse(servidorOrpen(serializeBracketNotation(payload)))));
  assert.equal(gravado, serializeBracketNotation(payloadEsperadoNoServidor(payload).esperado));
});

// Tela no formato do nativo: nada de digitar ID
const { state } = await js('state.js');
const R = await js('bot-view-render.js');
const CONTAS = [
  { id: '7', name: 'Conta Suporte', assistants: [{ id: 'asst_abc', name: 'Triagem' }, { id: 'asst_def', name: 'Cobrança' }] },
  { id: '8', name: 'Conta Vazia', assistants: [] },
];

test('condição de I.A. mostra "[Conta] Assistente: Nome", sem campo de ID', () => {
  state.ambienteOrpen = { openAiAccounts: CONTAS };
  const { bot, t, c } = comCondicao();
  I.mudarCondicaoParaAssistente(bot, t.ID, c.ID, 'asst_abc');
  const html = R.renderCondicao(c, 0, 1);
  assert.match(html, /value="\[Conta Suporte\] Assistente: Triagem"/);
  assert.match(html, /value="Status da análise"/);
  assert.match(html, /value="Sucesso"/);
  assert.doesNotMatch(html, /Assistente \(ID\)|asst_…/);
});

test('ação OpenAI: só contas com assistentes, e os assistentes da conta escolhida', () => {
  state.ambienteOrpen = { openAiAccounts: CONTAS };
  const html = R.renderAcao({ ID: '1', TRANSITION_ID: '1', ACTION_TYPE: '18', ACTION_DATA: { openai: 'call_assistant', openai_account: '7', assistant_id: 'asst_def' } }, {}, 0, 1);
  assert.match(html, /value="Conta Suporte"/);
  assert.doesNotMatch(html, /Conta Vazia/);
  assert.match(html, /value="Cobrança"/);
  assert.match(html, /option value="Triagem" data-value="asst_abc"/);
  assert.doesNotMatch(html, /Assistente \(ID\)/);
});

test('trocar a conta da ação OpenAI esvazia o assistente, como no nativo', () => {
  const { bot, t } = comCondicao();
  bot.BOT_ACTIONS.push({ ID: '999997', TRANSITION_ID: t.ID, ACTION_TYPE: '18', ACTION_DATA: { openai: 'call_assistant', openai_account: '7', assistant_id: 'asst_abc' } });
  I.mudarCampoAcao(bot, t.ID, '999997', 'openai_account', '8');
  assert.equal(bot.BOT_ACTIONS.at(-1).ACTION_DATA.assistant_id, '');
});
