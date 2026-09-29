// Ida e volta do salvamento (VALIDACAO.md, itens 1.3 e 6.4): o que o editor
// envia, depois de gravado e relido, tem que bater com o esperado; e uma
// gravação parcial do servidor tem que ser detectada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botsDeExemplo, servidorOrpen, js } from './apoio.mjs';

const { fromGetBotResponse, toUpdateBotPayload, serializeBracketNotation, payloadEsperadoNoServidor } = await js('orpen-adapter.js');

const serializar = (bot) => serializeBracketNotation(toUpdateBotPayload(bot));
// Abre como a extensão abre: o bot sempre chega pelo formato do getBot.
const abrir = (botExportado) => fromGetBotResponse(servidorOrpen(serializar(botExportado)));
const conferir = (bot, perder) => {
  const payload = toUpdateBotPayload(bot);
  const { esperado, descartados } = payloadEsperadoNoServidor(payload);
  const gravado = serializar(fromGetBotResponse(servidorOrpen(serializeBracketNotation(payload), perder)));
  return { bate: gravado === serializeBracketNotation(esperado), descartados };
};

const bots = botsDeExemplo();

test('há bots de exemplo para testar', () => {
  assert.ok(bots.length >= 1);
});

for (const { nome, bot } of bots) {
  test(`salvamento correto não dá falso alarme: ${nome}`, () => {
    assert.equal(conferir(abrir(bot)).bate, true);
  });
}

test('ação perdida no servidor é detectada', () => {
  const bot = abrir(bots.find(({ bot: b }) => (b.BOT_ACTIONS || []).length)?.bot);
  const r = conferir(bot, (getBot) => {
    getBot.transitions.find((t) => t.actions.length).actions.pop();
  });
  assert.equal(r.bate, false);
});

test('estado perdido no servidor é detectado', () => {
  const bot = abrir(bots.find(({ bot: b }) => (b.BOT_STATES || []).length > 1).bot);
  const r = conferir(bot, (getBot) => { getBot.states.pop(); });
  assert.equal(r.bate, false);
});

test('ação sem tipo é ignorada pelo servidor e contada à parte', () => {
  const bot = abrir(bots.find(({ bot: b }) => (b.BOT_TRANSITIONS || []).length)?.bot);
  const t = bot.BOT_TRANSITIONS[0];
  bot.BOT_ACTIONS.push({ ID: '999999', TRANSITION_ID: t.ID, ACTION_TYPE: '0', ACTION_DATA: {} });
  const r = conferir(bot);
  assert.equal(r.bate, true);
  assert.equal(r.descartados, 1);
});

test('áudio (20) sem velocidade é gravado com 1, como no nativo', () => {
  const bot = abrir(bots.find(({ bot: b }) => (b.BOT_TRANSITIONS || []).length)?.bot);
  const t = bot.BOT_TRANSITIONS[0];
  bot.BOT_ACTIONS.push({ ID: '999998', TRANSITION_ID: t.ID, ACTION_TYPE: '20', ACTION_DATA: { message_content: 'oi', speed: '' } });
  const acao = toUpdateBotPayload(bot).states.flatMap((s) => s.transitions).flatMap((tr) => tr.actions).find((a) => a.type === 20);
  assert.equal(acao.data.speed, '1');
  assert.equal(conferir(bot).bate, true);
});
