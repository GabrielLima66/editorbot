// Corpo do estado sob demanda (js/bot-view-render.js): abrir o editor desenha
// só os cabeçalhos; o corpo (transições, condições, ações) é montado quando o
// estado abre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js, botsDeExemplo, botSintetico } from './apoio.mjs';

const R = await js('bot-view-render.js');

const bot = botSintetico({
  estados: ['0', '1'],
  transicoes: [
    ['1', 1, [['message', '1', 'sim']], [[1, { message_text: 'Segunda' }]]],
    ['1', 0, [['message', '1', 'não']], [[2, { destiny: '0' }]]],
    ['0', 0, [], [[1, { message_text: 'Oi' }]]],
  ],
});
const desenhar = (numero, opcoes) => {
  const d = R.dadosDoEstado(bot, numero);
  return R.renderEstado(d.estado, d.transicoesPorEstado, d.condicoesPorTransicao, d.acoesPorTransicao, d.estadoPorNumero, d.totalEstados, opcoes);
};

test('sem o corpo: cabeçalho completo, corpo vazio, fechado e marcado como pendente', () => {
  const html = desenhar('1', { corpo: false });
  assert.match(html, /class="estado-alias" value="E1"/);
  assert.match(html, /<span class="estado-resumo">2 transições<\/span>/);
  assert.match(html, /<div class="estado-body hidden" data-pendente="1">\s*<\/div>/);
  assert.doesNotMatch(html, /estado-row|condicao-item|acao-item|add-transicao/);
});

test('padrão continua desenhando o corpo, fechado; `aberto` desenha o estado expandido', () => {
  const fechado = desenhar('1');
  assert.match(fechado, /<div class="estado-body hidden">/);
  assert.doesNotMatch(fechado, /data-pendente|estado-expandido|rotate-180/);
  assert.equal((fechado.match(/class="estado-row /g) || []).length, 2);
  const aberto = desenhar('1', { aberto: true });
  assert.match(aberto, /class="estado-wrap estado-expandido /);
  assert.match(aberto, /class="estado-chevron rotate-180 /);
  assert.match(aberto, /<div class="estado-body">/);
});

test('dadosDoEstado: só as transições do estado, por prioridade; itens por ID', () => {
  const d = R.dadosDoEstado(bot, '1');
  assert.deepEqual(d.transicoesPorEstado['1'].map((t) => t.PRIORITY), ['0', '1']);
  assert.equal(Object.keys(d.condicoesPorTransicao).length, 2);
  assert.equal(d.totalEstados, 2);
  assert.equal(d.estado.STATE_NUMBER, '1');
});

test('desenhar o corpo de qualquer estado não altera o bot (montar ao abrir não vira "alteração não salva")', () => {
  for (const { nome, bot: exemplo } of botsDeExemplo()) {
    const antes = JSON.stringify(exemplo);
    for (const e of exemplo.BOT_STATES) {
      const d = R.dadosDoEstado(exemplo, e.STATE_NUMBER);
      R.renderCorpoEstado(d.estado, d.transicoesPorEstado, d.condicoesPorTransicao, d.acoesPorTransicao, d.estadoPorNumero);
    }
    assert.equal(JSON.stringify(exemplo), antes, nome);
  }
});

// Elementos falsos com só o que garantirCorpoDoEstado/expandirEstado tocam.
function classes(...iniciais) {
  const s = new Set(iniciais);
  return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), lista: s };
}
function estadoFalso(numero, pendente = true) {
  const eventos = [];
  const corpo = {
    attrs: new Set(pendente ? ['data-pendente'] : []),
    hasAttribute(n) { return this.attrs.has(n); },
    removeAttribute(n) { this.attrs.delete(n); },
    innerHTML: '',
    classList: classes('estado-body', 'hidden'),
    querySelectorAll: () => [],
    dispatchEvent: (e) => eventos.push([e.type, e.detail, e.bubbles]),
  };
  const chevron = { classList: classes('estado-chevron') };
  const wrap = {
    dataset: { estadoNumero: numero },
    classList: classes('estado-wrap'),
    querySelector: (sel) => (sel === ':scope > .estado-body' ? corpo : sel === '.estado-chevron' ? chevron : null),
  };
  return { wrap, corpo, chevron, eventos };
}

test('garantirCorpoDoEstado monta o corpo uma vez, com as linhas do estado, e avisa quem marca linhas', () => {
  const { wrap, corpo, eventos } = estadoFalso('1');
  assert.equal(R.garantirCorpoDoEstado(wrap, bot), wrap);
  assert.equal((corpo.innerHTML.match(/class="estado-row /g) || []).length, 2);
  assert.match(corpo.innerHTML, /data-action="add-transicao" data-state="1"/);
  assert.equal(corpo.hasAttribute('data-pendente'), false);
  assert.ok(corpo.classList.contains('hidden'), 'montar não abre o estado');
  assert.deepEqual(eventos, [['editor:corpo-montado', '1', true]]);
  const html = corpo.innerHTML;
  R.garantirCorpoDoEstado(wrap, bot);
  assert.equal(corpo.innerHTML, html);
  assert.equal(eventos.length, 1, 'já montado: não monta de novo');
});

test('garantirCorpoDoEstado não mexe em estado já montado, sem bot ou que não existe mais', () => {
  const montado = estadoFalso('1', false);
  R.garantirCorpoDoEstado(montado.wrap, bot);
  assert.equal(montado.corpo.innerHTML, '');
  const semBot = estadoFalso('1');
  R.garantirCorpoDoEstado(semBot.wrap, null);
  assert.ok(semBot.corpo.hasAttribute('data-pendente'));
  const sumiu = estadoFalso('9');
  R.garantirCorpoDoEstado(sumiu.wrap, bot);
  assert.ok(sumiu.corpo.hasAttribute('data-pendente'));
  assert.equal(R.garantirCorpoDoEstado(null, bot), null);
});

test('expandirEstado abre (montando antes) e diz se estava fechado', async () => {
  const { state } = await js('state.js');
  state.botCarregado = bot;
  try {
    const { wrap, corpo, chevron } = estadoFalso('0');
    assert.equal(R.expandirEstado(wrap), true);
    assert.match(corpo.innerHTML, /class="estado-row /);
    assert.equal(corpo.classList.contains('hidden'), false);
    assert.ok(wrap.classList.contains('estado-expandido'));
    assert.ok(chevron.classList.contains('rotate-180'));
    assert.equal(R.expandirEstado(wrap), false, 'já aberto');
    assert.equal(R.expandirEstado(null), false);
  } finally {
    state.botCarregado = null;
  }
});
