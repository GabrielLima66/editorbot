// "Quem aponta para este estado": origensDoEstado / origensPorVariavel e o
// painel de exclusão, que passou a usar a mesma varredura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botSintetico, botsDeExemplo, js } from './apoio.mjs';

const I = await js('bot-view-interactions.js');
const R = await js('bot-view-render.js');
const { escapeHtml } = await js('utils.js');
const { ACTION_TYPE_LABELS } = await js('dictionaries.js');

function exemplo() {
  return botSintetico({
    estados: ['0', '1', '2', '3'],
    transicoes: [
      ['0', '0', [], [[1, { message: 'oi' }], [2, { destiny: '2' }]]],
      ['1', '0', [], [[18, { callback_state: '2' }]]],
      ['1', '1', [], [[20, { callback_state: '3', fallback_state: '2' }]]],
      ['2', '0', [], [[2, { destiny: '2' }]]],
      ['3', '0', [], [[22, { callback_state: '{$proximo}', fallback_state: '1' }], [2, { destiny: '{$volta}' }]]],
    ],
    timeout: { TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '2' },
  });
}

test('acha Troca Estado, callback/fallback, self-loop e timeout', () => {
  const bot = exemplo();
  const origens = I.origensDoEstado(bot, '2');
  assert.deepEqual(origens.map((o) => [o.tipo, o.estado, o.actionType, o.campo, o.proprioEstado]), [
    ['acao', '0', '2', 'destiny', false],
    ['acao', '1', '18', 'callback_state', false],
    ['acao', '1', '20', 'fallback_state', false],
    ['acao', '2', '2', 'destiny', true],
    ['timeout', undefined, undefined, undefined, undefined],
  ]);
  const t = bot.BOT_TRANSITIONS.find((x) => x.STATE === '1' && x.PRIORITY === '1');
  const a = bot.BOT_ACTIONS.find((x) => x.TRANSITION_ID === t.ID);
  assert.equal(origens[2].transitionId, t.ID);
  assert.equal(origens[2].actionId, a.ID);
  assert.equal(origens[2].prioridade, '1');
});

test('estado sem origem devolve lista vazia', () => {
  assert.deepEqual(I.origensDoEstado(exemplo(), '0'), []);
});

test('mensagem (tipo 1) não conta como origem, mesmo com campo parecido', () => {
  const bot = botSintetico({ estados: ['0', '1'], transicoes: [['0', '0', [], [[1, { destiny: '1' }]]]] });
  assert.deepEqual(I.origensDoEstado(bot, '1'), []);
});

test('timeout que não é "Trocar estado" não conta', () => {
  const bot = botSintetico({ estados: ['0', '1'], timeout: { TIMEOUT_ACTION: 'queue', TIMEOUT_DESTINY: '1' } });
  assert.deepEqual(I.origensDoEstado(bot, '1'), []);
});

test('destinos por variável ficam à parte', () => {
  const bot = exemplo();
  bot.TIMEOUT_DESTINY = '{$tempo}';
  const porVariavel = I.origensPorVariavel(bot);
  assert.deepEqual(porVariavel.map((o) => [o.tipo, o.estado, o.campo, o.variavel]), [
    ['acao', '3', 'callback_state', '{$proximo}'],
    ['acao', '3', 'destiny', '{$volta}'],
    ['timeout', undefined, undefined, '{$tempo}'],
  ]);
  assert.ok(I.origensDoEstado(bot, '2').every((o) => o.tipo !== 'timeout'));
});

test('exclusão ignora o self-loop e cada bloqueio traz a origem', () => {
  const bloqueios = I.bloqueiosDeExclusao(exemplo(), '2');
  assert.equal(bloqueios.length, 4);
  assert.ok(bloqueios.every((b) => !b.origem.proprioEstado));
  assert.deepEqual(bloqueios.map((b) => b.texto), I.referenciasParaEstado(exemplo(), '2'));
});

// Cópia da varredura de antes (v0.8.28), pra garantir que o texto do painel de
// exclusão não mudou com a troca para origensDoEstado.
function referenciasAntigas(bot, stateNumber) {
  const referencias = [];
  const estadoPorNumero = {};
  (bot.BOT_STATES || []).forEach((s) => (estadoPorNumero[s.STATE_NUMBER] = s));
  const transicaoPorId = {};
  (bot.BOT_TRANSITIONS || []).forEach((t) => (transicaoPorId[t.ID] = t));
  (bot.BOT_ACTIONS || []).forEach((a) => {
    const transicao = transicaoPorId[a.TRANSITION_ID];
    if (!transicao || transicao.STATE === stateNumber) return;
    const estadoOrigem = estadoPorNumero[transicao.STATE];
    const nomeOrigem = `Estado "${escapeHtml(estadoOrigem ? estadoOrigem.ALIAS : '?')}" (nº ${escapeHtml(transicao.STATE)})`;
    if (a.ACTION_TYPE === '2' && a.ACTION_DATA && a.ACTION_DATA.destiny === stateNumber) {
      referencias.push(`${nomeOrigem} tem uma ação "Troca Estado" (transição prioridade ${escapeHtml(transicao.PRIORITY)}) que aponta para este estado.`);
    }
    if (['18', '20', '22'].includes(a.ACTION_TYPE) && a.ACTION_DATA) {
      ['callback_state', 'fallback_state'].forEach((campo) => {
        if (a.ACTION_DATA[campo] === stateNumber) {
          referencias.push(`${nomeOrigem} tem uma ação "${ACTION_TYPE_LABELS[a.ACTION_TYPE] || a.ACTION_TYPE}" (transição prioridade ${escapeHtml(transicao.PRIORITY)}) que aponta para este estado via "${campo}".`);
        }
      });
    }
  });
  if (bot.TIMEOUT_ACTION === 'bot' && bot.TIMEOUT_DESTINY === stateNumber) {
    referencias.push('A configuração de timeout do bot ("Ações de timeout" → Trocar estado) aponta para este estado.');
  }
  return referencias;
}

test('texto da exclusão igual ao de antes em todos os bots de exemplo', () => {
  const bots = [exemplo(), ...botsDeExemplo().map((e) => e.bot)];
  let comparados = 0;
  bots.forEach((bot) => {
    (bot.BOT_STATES || []).forEach((s) => {
      assert.deepEqual(I.referenciasParaEstado(bot, s.STATE_NUMBER), referenciasAntigas(bot, s.STATE_NUMBER));
      comparados++;
    });
  });
  assert.ok(comparados > 4);
});

test('painel de origens: link para a ação, marca do self-loop e estado inicial', () => {
  const bot = exemplo();
  const estadoPorNumero = Object.fromEntries(bot.BOT_STATES.map((s) => [s.STATE_NUMBER, s]));
  const html = R.renderPainelOrigens(bot.BOT_STATES[2], I.origensDoEstado(bot, '2'), [], estadoPorNumero);
  const o = I.origensDoEstado(bot, '2')[0];
  assert.ok(html.includes(`data-origem="acao" data-state="0" data-origem-acao="${o.actionId}"`));
  assert.ok(html.includes('data-origem="timeout"'));
  assert.ok(html.includes('class="origem-marca">este estado<'));
  assert.ok(html.includes('Estado de falha (fallback)'));
  assert.ok(!html.includes('data-action-id='), 'link não pode usar data-action-id (analise.js procura por ele)');
  assert.ok(!html.includes('Estado inicial'));

  const vazio = R.renderPainelOrigens(bot.BOT_STATES[0], [], [], estadoPorNumero);
  assert.ok(vazio.includes('Estado inicial'));
  assert.ok(vazio.includes('Nenhuma ação nem o timeout apontam'));
});

test('painel de bloqueio: cada linha é um link para a origem', () => {
  const bot = exemplo();
  const html = R.renderPainelBloqueio(bot.BOT_STATES[2], I.bloqueiosDeExclusao(bot, '2'));
  assert.equal((html.match(/data-action="ir-para-origem"/g) || []).length, 4);
});

test('ação na tela tem data-action-id para a navegação achar', () => {
  const bot = exemplo();
  const a = bot.BOT_ACTIONS[0];
  const html = R.renderAcao(a, {}, 0, 1);
  assert.ok(html.includes(`class="acao-item" data-action-id="${a.ID}"`));
});
