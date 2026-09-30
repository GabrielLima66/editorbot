// Labels de contato escolhidas pelo nome: a tela mostra
// nomes, o bot grava IDs; sem a lista do ambiente, cai no campo de IDs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botsDeExemplo, servidorOrpen, js } from './apoio.mjs';

const { state } = await js('state.js');
const { fromGetBotResponse, toUpdateBotPayload, serializeBracketNotation } = await js('orpen-adapter.js');
const { campoLabels } = await js('bot-view-render.js');
const I = await js('bot-view-interactions.js');

const LABELS = [{ id: 12, name: 'VIP' }, { id: 15, name: 'Inadimplente' }, { id: 20, name: 'Novo cliente' }];
const exemplo = botsDeExemplo().find(({ bot }) => (bot.BOT_TRANSITIONS || []).length).bot;
const abrir = () => fromGetBotResponse(servidorOrpen(serializeBracketNotation(toUpdateBotPayload(exemplo))));

test('com a lista do ambiente: mostra os nomes e oferece só as que faltam', () => {
  state.ambienteOrpen = { labels: LABELS };
  const html = campoLabels('Labels', ['12'], 'data-alvo="acao"', 'FALLBACK');
  assert.match(html, /VIP/);
  assert.match(html, /data-label-id="12"/);
  assert.doesNotMatch(html, /data-action="escolher-label" data-label-id="12"/);
  assert.match(html, /data-action="escolher-label" data-label-id="15"[^>]*>Inadimplente</);
  assert.doesNotMatch(html, /Selecione as labels/);
  assert.doesNotMatch(html, /FALLBACK/);
});

test('sem nada escolhido: só a orientação, sem dizer que não há label', () => {
  state.ambienteOrpen = { labels: LABELS };
  const html = campoLabels(null, [], '', '');
  assert.match(html, /Selecione as labels/);
  assert.doesNotMatch(html, /Nenhuma label/);
  assert.equal((html.match(/data-action="escolher-label"/g) || []).length, 3);
});

test('label que não existe mais aparece identificada, sem sumir', () => {
  state.ambienteOrpen = { labels: LABELS };
  assert.match(campoLabels(null, ['99'], '', ''), /ID 99 \(não encontrada\)/);
});

test('sem a lista (API fora ou modo avulso): campo de IDs', () => {
  state.ambienteOrpen = { labels: null };
  assert.equal(campoLabels('Labels', ['12'], '', 'FALLBACK'), 'FALLBACK');
  state.ambienteOrpen = null;
  assert.equal(campoLabels('Labels', ['12'], '', 'FALLBACK'), 'FALLBACK');
});

test('adicionar e remover na ação "Adicionar labels" grava IDs', () => {
  const bot = abrir();
  const t = bot.BOT_TRANSITIONS[0];
  bot.BOT_ACTIONS.push({ ID: '999999', TRANSITION_ID: t.ID, ACTION_TYPE: '16', ACTION_DATA: { update_contact_value: 'add-labels', labels: [] } });
  I.mudarLabels(bot, 'acao', t.ID, '999999', (ids) => [...ids, '12']);
  I.mudarLabels(bot, 'acao', t.ID, '999999', (ids) => [...ids, '15']);
  I.mudarLabels(bot, 'acao', t.ID, '999999', (ids) => ids.filter((id) => id !== '12'));
  assert.deepEqual(bot.BOT_ACTIONS.at(-1).ACTION_DATA.labels, ['15']);
});

test('adicionar na condição "Possui os labels" grava lista, mesmo se antes era texto', () => {
  const bot = abrir();
  const t = bot.BOT_TRANSITIONS[0];
  I.adicionarCondicao(bot, t.ID);
  const c = bot.BOT_CONDITIONS.at(-1);
  c.CONDITION_TYPE = '18';
  c.CONDITION_DATA = { variable: 'contact', value: '12' };
  I.mudarLabels(bot, 'condicao', t.ID, c.ID, (ids) => [...ids, '20']);
  assert.deepEqual(c.CONDITION_DATA.value, ['12', '20']);
});

// Ação "Enviar anexo" (17): lista de anexos pelo nome, como no nativo
const R = await js('bot-view-render.js');
test('anexo: com a lista, mostra "<tipo> - <título>"; sem a lista, campo de ID', () => {
  const acao = { ID: '1', TRANSITION_ID: '1', ACTION_TYPE: '17', ACTION_DATA: { send_file: '55' } };
  state.ambienteOrpen = { anexos: [{ id: 55, name: 'imagem - Boas-vindas' }, { id: 56, name: 'vídeo - Tutorial' }] };
  const html = R.renderAcao(acao, {}, 0, 1);
  assert.match(html, /value="imagem - Boas-vindas"/);
  assert.match(html, /option value="vídeo - Tutorial" data-value="56"/);
  assert.doesNotMatch(html, /Arquivo \(ID\)/);
  state.ambienteOrpen = { anexos: null };
  assert.match(R.renderAcao(acao, {}, 0, 1), /Arquivo \(ID\)/);
});

// Ação "Enviar mensagem de áudio" (20): mesmo formulário do nativo
test('áudio: voz por idioma com "ouvir", modelo TTS e velocidade numérica', () => {
  const html = R.renderAcao({ ID: '1', TRANSITION_ID: '1', ACTION_TYPE: '20', ACTION_DATA: { model_audio: 'nova', model_openai: 'tts-1-hd', speed: '1.5' } }, {}, 0, 1);
  for (const g of ['Português', 'Inglês', 'Espanhol']) assert.match(html, new RegExp(`optgroup label="${g}"`));
  assert.equal((html.match(/value="nova"[^>]*selected/g) || []).length, 1);
  assert.match(html, /data-action="ouvir-voz"/);
  assert.match(html, /value="tts-1-hd" selected/);
  assert.match(html, /type="number"[^>]*min="\.25" max="4"[^>]*value="1\.5"/);
});
