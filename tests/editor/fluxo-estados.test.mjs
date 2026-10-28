// Entradas e saídas por estado (js/fluxo-estados.js), base dos chips
// "vem de / vai para" do cabeçalho do estado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botSintetico, botsDeExemplo, js } from './apoio.mjs';

const { fluxoDoBot, htmlFluxoEstado } = await js('fluxo-estados.js');
const I = await js('bot-view-interactions.js');

function exemplo() {
  return botSintetico({
    estados: ['0', '1', '2', '3', '4'],
    transicoes: [
      ['0', '0', [], [[1, { message: 'oi' }], [2, { destiny: '2' }]]],
      ['1', '0', [], [[18, { callback_state: '2' }]]],
      ['1', '1', [], [[20, { callback_state: '3', fallback_state: '2' }]]],
      ['2', '1', [], [[2, { destiny: '2' }], [5, { destiny: '7100' }]]],
      ['2', '0', [], [[6, { crm_status: '1' }], [2, { destiny: '9' }]]],
      ['3', '0', [], [[22, { callback_state: '{$proximo}', fallback_state: '1' }]]],
    ],
    timeout: { TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '2' },
  });
}

const chave = (o) => (o.tipo === 'timeout' ? 'timeout' : `${o.actionId}:${o.campo}`);

test('entradas: ações de outros estados e o timeout, sem o próprio estado', () => {
  const { porEstado } = fluxoDoBot(exemplo());
  assert.deepEqual(porEstado.get('2').entradas.map((o) => [o.tipo, o.estado, o.actionType, o.campo]), [
    ['acao', '0', '2', 'destiny'],
    ['acao', '1', '18', 'callback_state'],
    ['acao', '1', '20', 'fallback_state'],
    ['timeout', undefined, undefined, undefined],
  ]);
  assert.deepEqual(porEstado.get('4').entradas, []);
});

test('saídas: na ordem das transições, com o próprio estado e destino inexistente', () => {
  const { porEstado } = fluxoDoBot(exemplo());
  assert.deepEqual(porEstado.get('2').saidas.map((s) => [s.prioridade, s.destino]), [['0', '9'], ['1', '2']]);
  assert.deepEqual(porEstado.get('1').saidas.map((s) => [s.campo, s.destino]), [['callback_state', '2'], ['callback_state', '3'], ['fallback_state', '2']]);
});

test('destino por variável fica à parte e marca o bot', () => {
  const f = fluxoDoBot(exemplo());
  assert.deepEqual(f.porEstado.get('3').variaveis.map((v) => v.variavel), ['{$proximo}']);
  assert.deepEqual(f.porEstado.get('3').saidas.map((s) => s.destino), ['1']);
  assert.equal(f.porVariavel, true);
  assert.equal(fluxoDoBot(botSintetico({ estados: ['0'] })).porVariavel, false);
});

test('saídas finais: Transf. Agente, Transf. Fila e Finalizar, sem repetir', () => {
  const { porEstado } = fluxoDoBot(exemplo());
  assert.deepEqual(porEstado.get('2').finais.sort(), ['5', '6']);
  assert.deepEqual(porEstado.get('0').finais, []);
});

test('timeout por variável conta como destino por variável', () => {
  const bot = botSintetico({ estados: ['0', '1'], timeout: { TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '{$x}' } });
  const f = fluxoDoBot(bot);
  assert.equal(f.porVariavel, true);
  assert.deepEqual(f.porEstado.get('1').entradas, []);
});

test('entradas batem com "Quem aponta" (origensDoEstado sem o próprio estado) nos bots de exemplo', () => {
  const bots = [{ nome: 'sintético', bot: exemplo() }, ...botsDeExemplo()];
  for (const { nome, bot } of bots) {
    const { porEstado } = fluxoDoBot(bot);
    for (const s of bot.BOT_STATES) {
      const n = String(s.STATE_NUMBER);
      const esperado = I.origensDoEstado(bot, n).filter((o) => !o.proprioEstado).map(chave).sort();
      assert.deepEqual(porEstado.get(n).entradas.map(chave).sort(), esperado, `${nome}, estado ${n}`);
    }
  }
});

// ---------------------------------------------------------------- chips

function chips(bot, n) {
  const f = fluxoDoBot(bot);
  const porNumero = Object.fromEntries(bot.BOT_STATES.map((s) => [s.STATE_NUMBER, s]));
  const html = htmlFluxoEstado(n, f.porEstado.get(n), porNumero, f.porVariavel);
  const [vem, vai] = html.split('vai para');
  const textos = (parte) => [...parte.matchAll(/class="fluxo-chip ([a-z-]+)"[^>]*>([^<]*)</g)].map((m) => `${m[1]}:${m[2]}`);
  return { html, vem: textos(vem), vai: textos(vai) };
}

test('chips: entradas agrupadas por estado, timeout, saídas, próprio, inexistente e finais', () => {
  const c = chips(exemplo(), '2');
  assert.deepEqual(c.vem, ['fluxo-entrada:0', 'fluxo-entrada:1', 'fluxo-entrada:timeout']);
  assert.deepEqual(c.vai, ['fluxo-erro:9?', 'fluxo-proprio:↻ 2', 'fluxo-final:Transf. Fila', 'fluxo-final:Finalizar']);
  assert.match(c.html, /data-action="ir-para-origem" data-origem="acao" data-state="1" data-origem-acao="\d+"/);
  assert.match(c.html, /data-action="ir-para-origem" data-origem="timeout"/);
});

test('chips: estado 0 é o início; saída por variável fica tracejada', () => {
  assert.deepEqual(chips(exemplo(), '0').vem, ['fluxo-inicio:início']);
  assert.deepEqual(chips(exemplo(), '3').vai, ['fluxo-saida:1', 'fluxo-variavel:{$proximo}']);
  assert.match(chips(exemplo(), '3').html, /data-action="ir-para-estado" data-state="1"/);
});

test('chips: sem entradas é "ninguém", ou "só por {$}" se o bot tem destino por variável', () => {
  assert.deepEqual(chips(exemplo(), '4').vem, ['fluxo-variavel:só por {$}']);
  const semVariavel = botSintetico({ estados: ['0', '1'], transicoes: [['1', '0', [], [[1, { message: 'x' }]]]] });
  assert.deepEqual(chips(semVariavel, '1').vem, ['fluxo-nenhum:ninguém']);
  assert.deepEqual(chips(semVariavel, '1').vai, ['fluxo-nenhum-saida:—']);
});

test('chips: mais de 5 viram 4 + "+N", com os outros no title', () => {
  const estados = ['0', '1', '2', '3', '4', '5', '6', '7'];
  const bot = botSintetico({ estados, transicoes: estados.slice(1).map((d, i) => ['0', String(i), [], [[2, { destiny: d }]]]) });
  const c = chips(bot, '0');
  assert.deepEqual(c.vai, ['fluxo-saida:1', 'fluxo-saida:2', 'fluxo-saida:3', 'fluxo-saida:4', 'fluxo-mais:+3']);
  assert.match(c.html, /title="5 · E5\n6 · E6\n7 · E7">\+3</);
});

test('chips: nome do estado vai escapado no title', () => {
  const bot = botSintetico({ estados: ['0', '1'], transicoes: [['0', '0', [], [[2, { destiny: '1' }]]]] });
  bot.BOT_STATES[1].ALIAS = '<b>"x"</b>';
  assert.ok(!chips(bot, '0').html.includes('<b>'));
});

test('chips: travessão no nome do estado não corta o title da saída', () => {
  const bot = botSintetico({ estados: ['0', '1'], transicoes: [['0', '0', [], [[2, { destiny: '1' }]]]] });
  bot.BOT_STATES[0].ALIAS = 'Menu — Principal';
  assert.match(chips(bot, '0').html, /title="1 · E1\n→ Transição 0, Troca Estado"/);
});
