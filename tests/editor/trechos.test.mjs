// Copiar e colar trechos entre bots (js/trechos.js), com os bots de exemplo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botsDeExemplo, js } from './apoio.mjs';

const { extrairTrecho, colarTrecho, trechoValido } = await js('trechos.js');
const { CAMPOS_ESTADO_POR_TIPO, TABLE_KEY_ORDER } = await js('dictionaries.js');

const exemplos = botsDeExemplo();
const clone = (x) => JSON.parse(JSON.stringify(x));
const A = exemplos.find(({ bot }) => (bot.BOT_STATES || []).length >= 4)?.bot;
const B = (exemplos.find(({ bot }) => bot !== A && (bot.BOT_STATES || []).length >= 2) || { bot: A }).bot;

const unicos = (linhas) => new Set(linhas.map((l) => l.ID)).size === linhas.length;
const espelhosOk = (tabela, linhas) => linhas.every((l) => TABLE_KEY_ORDER[tabela].every((k, i) => l[String(i)] === l[k]));
const refsDeEstado = (acoes) => acoes.flatMap((a) => (CAMPOS_ESTADO_POR_TIPO[a.ACTION_TYPE] || []).map((c) => a.ACTION_DATA?.[c]).filter((v) => v !== undefined && v !== ''));

test('há bots de exemplo com estados', () => assert.ok(A && B));

test('extrair não altera o bot e o trecho passa por JSON (storage)', () => {
  const antes = JSON.stringify(A);
  const t = extrairTrecho(A, { estados: ['1', '2'] }, { host: 'a.exemplo.com', botId: '7', botNome: 'A' });
  assert.equal(JSON.stringify(A), antes);
  assert.ok(trechoValido(t));
  assert.ok(trechoValido(JSON.parse(JSON.stringify(t))));
  assert.equal(t.linhas.estados.length, 2);
  assert.ok(t.linhas.transicoes.every((x) => ['1', '2'].includes(x.STATE)));
  assert.ok(t.linhas.estados.every((e) => !('0' in e)), 'sem chaves espelhadas guardadas');
});

test('colar estados: vão para o fim, sem mexer nos existentes', () => {
  const trecho = extrairTrecho(A, { estados: ['1', '2'] });
  const dest = clone(B);
  const antes = clone(dest);
  const maior = Math.max(-1, ...antes.BOT_STATES.map((s) => parseInt(s.STATE_NUMBER, 10) || 0)); // há bots de exemplo com número não numérico ("A1")
  const r = colarTrecho(dest, trecho);
  assert.deepEqual(r.estadosNovos, [String(maior + 1), String(maior + 2)]);
  assert.deepEqual(dest.BOT_STATES.slice(0, antes.BOT_STATES.length), antes.BOT_STATES, 'estados existentes iguais');
  assert.deepEqual(dest.BOT_TRANSITIONS.slice(0, antes.BOT_TRANSITIONS.length), antes.BOT_TRANSITIONS);
  assert.deepEqual(dest.BOT_ACTIONS.slice(0, antes.BOT_ACTIONS.length), antes.BOT_ACTIONS);
  assert.deepEqual(dest.BOT_CONDITIONS.slice(0, antes.BOT_CONDITIONS.length), antes.BOT_CONDITIONS);
});

test('colar estados: IDs únicos, espelhos refeitos, ordem das transições preservada', () => {
  const trecho = extrairTrecho(A, { estados: ['1', '2'] });
  const dest = clone(B);
  const antes = { state: dest.BOT_STATES.length, transition: dest.BOT_TRANSITIONS.length, condition: dest.BOT_CONDITIONS.length, action: dest.BOT_ACTIONS.length };
  const r = colarTrecho(dest, trecho);
  for (const [tabela, lista] of [['state', dest.BOT_STATES], ['transition', dest.BOT_TRANSITIONS], ['condition', dest.BOT_CONDITIONS], ['action', dest.BOT_ACTIONS]]) {
    assert.ok(unicos(lista), `IDs únicos em ${tabela}`);
    // Só as linhas coladas: os bots de exemplo vêm sem as chaves espelhadas.
    assert.ok(espelhosOk(tabela, lista.slice(antes[tabela])), `espelhos em ${tabela}`);
  }
  const novas = dest.BOT_TRANSITIONS.filter((t) => r.transicoesNovas.includes(t.ID));
  assert.equal(novas.length, trecho.linhas.transicoes.length);
  ['1', '2'].forEach((origem, i) => {
    const doTrecho = trecho.linhas.transicoes.filter((t) => t.STATE === origem).map((t) => t.PRIORITY);
    const coladas = novas.filter((t) => t.STATE === r.estadosNovos[i]).map((t) => t.PRIORITY);
    assert.deepEqual(coladas, doTrecho, 'mesma prioridade, na mesma ordem');
  });
  assert.ok(dest.BOT_CONDITIONS.concat(dest.BOT_ACTIONS).every((x) => dest.BOT_TRANSITIONS.some((t) => t.ID === x.TRANSITION_ID)), 'sem órfãs');
});

test('referências a estado: internas remapeadas, externas esvaziadas e listadas', () => {
  const trecho = extrairTrecho(A, { estados: ['1', '2'] });
  const dest = clone(B);
  const r = colarTrecho(dest, trecho);
  const novos = new Set(r.estadosNovos);
  const coladas = dest.BOT_ACTIONS.slice(-trecho.linhas.acoes.length);
  refsDeEstado(coladas).forEach((v) => assert.ok(novos.has(v), `referência ${v} aponta para estado colado`));
  const originais = refsDeEstado(trecho.linhas.acoes).length;
  const mantidas = refsDeEstado(coladas).length;
  assert.equal(mantidas + r.soltas.length, originais, 'toda referência ou foi remapeada ou foi listada');
  r.soltas.forEach((s) => assert.ok(s.valorOriginal && !['1', '2'].includes(s.valorOriginal)));
});

test('colar transições: vão para o fim do estado de destino e laço vira o próprio estado', () => {
  const fonte = A.BOT_TRANSITIONS.filter((t) => t.STATE === '1').map((t) => t.ID);
  assert.ok(fonte.length, 'estado 1 tem transições');
  const trecho = extrairTrecho(A, { transicoes: fonte });
  const dest = clone(B);
  const antes = dest.BOT_TRANSITIONS.filter((t) => t.STATE === '0').length;
  const r = colarTrecho(dest, trecho, { estadoDestino: '0' });
  const noDestino = dest.BOT_TRANSITIONS.filter((t) => t.STATE === '0');
  assert.equal(noDestino.length, antes + fonte.length);
  const novasPrioridades = noDestino.filter((t) => r.transicoesNovas.includes(t.ID)).map((t) => +t.PRIORITY);
  const maiorAntes = Math.max(-1, ...noDestino.filter((t) => !r.transicoesNovas.includes(t.ID)).map((t) => +t.PRIORITY));
  assert.ok(novasPrioridades.every((p, i) => p === maiorAntes + 1 + i), 'entram depois das existentes, em sequência');
  const coladas = dest.BOT_ACTIONS.filter((a) => r.transicoesNovas.includes(a.TRANSITION_ID));
  refsDeEstado(coladas).forEach((v) => assert.equal(v, '0', 'só sobra referência ao próprio estado'));
});

test('transições de estados diferentes e estado de destino inexistente dão erro', () => {
  assert.throws(() => extrairTrecho(A, { transicoes: [A.BOT_TRANSITIONS.find((t) => t.STATE === '0').ID, A.BOT_TRANSITIONS.find((t) => t.STATE === '1').ID] }));
  const t = extrairTrecho(A, { transicoes: [A.BOT_TRANSITIONS[0].ID] });
  assert.throws(() => colarTrecho(clone(B), t, { estadoDestino: '999' }));
  assert.throws(() => colarTrecho(clone(B), { formato: 'outro' }));
});

test('outro domínio: campos de cadastro esvaziados', () => {
  const trecho = extrairTrecho(A, { estados: A.BOT_STATES.map((s) => s.STATE_NUMBER) });
  const dest = clone(B);
  const r = colarTrecho(dest, trecho, { esvaziarAmbiente: true });
  const coladas = dest.BOT_ACTIONS.slice(-trecho.linhas.acoes.length);
  const enderecos = { '4': 'destiny', '5': 'destiny', '6': 'crm_status', '7': 'script_name', '9': 'check_point', '12': 'entrances', '14': 'substatus', '17': 'send_file', '18': 'openai_account' };
  coladas.forEach((a) => { const c = enderecos[a.ACTION_TYPE]; if (c) assert.equal(a.ACTION_DATA[c], '', `tipo ${a.ACTION_TYPE} esvaziado`); });
  assert.ok(Array.isArray(r.ambiente));
});

test('ordem de condições e ações segue a do ID de origem, mesmo com o trecho embaralhado', () => {
  const trecho = extrairTrecho(A, { estados: A.BOT_STATES.map((s) => s.STATE_NUMBER) });
  trecho.linhas.acoes.reverse();
  trecho.linhas.condicoes.reverse();
  const dest = clone(B);
  const antes = dest.BOT_ACTIONS.length;
  colarTrecho(dest, trecho);
  const coladas = dest.BOT_ACTIONS.slice(antes);
  const tiposOrigem = [...trecho.linhas.acoes].sort((a, b) => a.ID - b.ID).map((a) => a.ACTION_TYPE);
  assert.deepEqual(coladas.map((a) => a.ACTION_TYPE), tiposOrigem);
  assert.ok(coladas.every((a, i) => i === 0 || +a.ID > +coladas[i - 1].ID));
});

test('outro domínio: {$variável} no destino da ação não é esvaziado', () => {
  const trecho = extrairTrecho(A, { estados: ['0'] });
  trecho.linhas.acoes.push({ ID: '9999', TRANSITION_ID: trecho.linhas.transicoes[0].ID, ACTION_TYPE: '4', ACTION_DATA: { destiny: '{$agente_responsavel}' } });
  trecho.linhas.acoes.push({ ID: '10000', TRANSITION_ID: trecho.linhas.transicoes[0].ID, ACTION_TYPE: '4', ACTION_DATA: { destiny: '123' } });
  const dest = clone(B);
  colarTrecho(dest, trecho, { esvaziarAmbiente: true });
  const [comVariavel, comId] = dest.BOT_ACTIONS.slice(-2);
  assert.equal(comVariavel.ACTION_DATA.destiny, '{$agente_responsavel}');
  assert.equal(comId.ACTION_DATA.destiny, '');
});

// ---- colar no meio da lista (depoisDe) e validação ----

const { simularColagem, problemasDeEstados } = await js('trechos.js');
const { fotografarNumeros, mudancasDeNumero } = await js('renumeracao.js');

const n = (bot) => bot.BOT_STATES.map((s) => s.STATE_NUMBER);
const refsExistentes = (bot, ate) => bot.BOT_ACTIONS.slice(0, ate).flatMap((a) => (CAMPOS_ESTADO_POR_TIPO[a.ACTION_TYPE] || []).map((c) => [a.ID, c, a.ACTION_DATA?.[c]]));

function destinoContiguo() {
  const dest = clone(A); // estados 0..5
  assert.deepEqual(n(dest), ['0', '1', '2', '3', '4', '5']);
  return dest;
}

test('colar depois do estado 1: os de número maior sobem, a entrada não muda', () => {
  const trecho = extrairTrecho(B, { estados: ['1', '2'] });
  const dest = destinoContiguo();
  dest.TIMEOUT_ACTION = 'bot';
  dest.TIMEOUT_DESTINY = '4';
  const antes = clone(dest);
  const r = colarTrecho(dest, trecho, { depoisDe: '1' });
  assert.deepEqual(r.estadosNovos, ['2', '3']);
  assert.deepEqual(n(dest), ['0', '1', '2', '3', '4', '5', '6', '7'], 'numeração contínua e em ordem no array');
  // os estados antigos 2..5 viraram 4..7, mesma identidade (ID e nome)
  [['2', '4'], ['3', '5'], ['4', '6'], ['5', '7']].forEach(([de, para]) => {
    const antigo = antes.BOT_STATES.find((s) => s.STATE_NUMBER === de);
    const agora = dest.BOT_STATES.find((s) => s.ID === antigo.ID);
    assert.equal(agora.STATE_NUMBER, para);
    assert.equal(agora.ALIAS, antigo.ALIAS);
  });
  assert.equal(dest.BOT_STATES[0].STATE_NUMBER, '0');
  assert.equal(dest.TIMEOUT_DESTINY, '6', 'timeout acompanhou o estado 4');
  // referências das ações que já existiam acompanharam
  refsExistentes(antes, antes.BOT_ACTIONS.length).forEach(([id, campo, v]) => {
    if (v === undefined || v === '') return;
    const agora = dest.BOT_ACTIONS.find((a) => a.ID === id).ACTION_DATA[campo];
    assert.equal(agora, +v > 1 ? String(+v + 2) : v, `ação ${id}.${campo}`);
  });
  assert.deepEqual(problemasDeEstados(dest), problemasDeEstados(antes));
});

test('colar depois do último estado é o mesmo que colar no fim', () => {
  const trecho = extrairTrecho(B, { estados: ['1', '2'] });
  const noFim = clone(destinoContiguo());
  const depois = clone(destinoContiguo());
  colarTrecho(noFim, trecho);
  colarTrecho(depois, trecho, { depoisDe: '5' });
  assert.deepEqual(n(depois), n(noFim));
  assert.equal(JSON.stringify(depois.BOT_ACTIONS), JSON.stringify(noFim.BOT_ACTIONS));
});

test('estado de referência inexistente ou não numérico recusa', () => {
  const trecho = extrairTrecho(B, { estados: ['1'] });
  assert.throws(() => colarTrecho(destinoContiguo(), trecho, { depoisDe: '99' }));
  assert.throws(() => colarTrecho(destinoContiguo(), trecho, { depoisDe: 'x' }));
  assert.equal(simularColagem(destinoContiguo(), trecho, { depoisDe: '99' }).ok, false);
});

test('estados com número não numérico ("A1") não quebram nem são deslocados', () => {
  const trecho = extrairTrecho(A, { estados: ['1'] });
  const dest = clone(B); // 0,1,2,3,A1,B2,10
  const r = colarTrecho(dest, trecho, { depoisDe: '3' });
  assert.deepEqual(r.estadosNovos, ['4']);
  assert.ok(dest.BOT_STATES.some((s) => s.STATE_NUMBER === 'A1') && dest.BOT_STATES.some((s) => s.STATE_NUMBER === 'B2'));
  assert.ok(dest.BOT_STATES.some((s) => s.STATE_NUMBER === '11'), 'o 10 virou 11');
  assert.ok(!dest.BOT_STATES.some((s) => s.STATE_NUMBER === '10'));
});

test('mesmo bot: referência a estado que não foi copiado e continua igual é mantida', () => {
  const trecho = extrairTrecho(A, { estados: ['1'] });
  const comum = clone(A);
  const r = colarTrecho(comum, trecho, { depoisDe: '1', mesmoBot: true });
  const outro = clone(A);
  const r2 = colarTrecho(outro, trecho, { depoisDe: '1', mesmoBot: false });
  assert.ok(r2.soltas.length > 0, 'em outro bot as referências externas são esvaziadas');
  assert.equal(r.soltas.length, 0, 'no mesmo bot ficam');
  const coladas = comum.BOT_ACTIONS.filter((a) => r.transicoesNovas.includes(a.TRANSITION_ID));
  const todas = new Set(comum.BOT_STATES.map((s) => s.STATE_NUMBER));
  refsDeEstado(coladas).forEach((v) => assert.ok(todas.has(v), `referência ${v} existe`));
  assert.deepEqual(problemasDeEstados(comum), problemasDeEstados(A));
});

test('mesmo bot: se o estado referenciado mudou de nome desde a cópia, a referência é esvaziada', () => {
  const trecho = extrairTrecho(A, { estados: ['1'] });
  const dest = clone(A);
  dest.BOT_STATES.forEach((s) => { if (s.STATE_NUMBER !== '1') s.ALIAS = `${s.ALIAS}-mudou`; });
  const r = colarTrecho(dest, trecho, { depoisDe: '1', mesmoBot: true });
  assert.ok(r.soltas.length > 0);
});

test('simularColagem: não altera o bot e só lista como renumerados os que já existiam', () => {
  const trecho = extrairTrecho(B, { estados: ['1', '2'] });
  const dest = destinoContiguo();
  const antes = JSON.stringify(dest);
  const s = simularColagem(dest, trecho, { depoisDe: '1' });
  assert.equal(JSON.stringify(dest), antes, 'bot intacto');
  assert.ok(s.ok, s.erros.join(' | '));
  assert.equal(s.mudancas.mudados.length, 4, 'estados 2..5 mudaram de número');
  assert.deepEqual(s.mudancas.mudados.map((m) => `${m.de}>${m.para}`), ['2>4', '3>5', '4>6', '5>7']);
  assert.equal(s.mudancas.entrada, null);
  assert.equal(s.mudancas.excluidos.length, 0);
  const fim = simularColagem(dest, trecho);
  assert.ok(fim.ok);
  assert.equal(fim.mudancas, null, 'no fim ninguém é renumerado');
});

test('o aviso de renumeração do salvar enxerga só os deslocados quando a colagem é real', () => {
  const trecho = extrairTrecho(B, { estados: ['1', '2'] });
  const dest = destinoContiguo();
  const foto = fotografarNumeros(dest);
  colarTrecho(dest, trecho, { depoisDe: '1' });
  const m = mudancasDeNumero(dest, foto);
  assert.equal(m.mudados.length, 4);
  assert.equal(m.excluidos.length, 0);
});

test('{$variável} em campo de estado (Troca Estado) é mantida ao colar, em qualquer bot', () => {
  const trecho = extrairTrecho(A, { estados: ['0'] });
  trecho.linhas.acoes.push({ ID: '9998', TRANSITION_ID: trecho.linhas.transicoes[0].ID, ACTION_TYPE: '2', ACTION_DATA: { destiny: '{$proximo}' } });
  const dest = clone(B);
  const r = colarTrecho(dest, trecho);
  assert.equal(dest.BOT_ACTIONS.at(-1).ACTION_DATA.destiny, '{$proximo}');
  assert.ok(!r.soltas.some((s) => s.valorOriginal === '{$proximo}'));
});

test('mesmo bot: dois estados com o mesmo nome não se confundem depois de renumerar', () => {
  const comum = clone(A);
  comum.BOT_STATES.forEach((s) => { s.ALIAS = 'Novo Estado'; });
  const trecho = extrairTrecho(comum, { estados: ['1'] });
  // depois de copiar, o usuário troca o estado 2 de lugar com o 3: os números são os mesmos, os estados não
  const e2 = comum.BOT_STATES.find((s) => s.STATE_NUMBER === '2');
  const e3 = comum.BOT_STATES.find((s) => s.STATE_NUMBER === '3');
  e2.STATE_NUMBER = '3'; e3.STATE_NUMBER = '2';
  const r = colarTrecho(comum, trecho, { depoisDe: '1', mesmoBot: true });
  const alvos = trecho.linhas.acoes.flatMap((a) => (CAMPOS_ESTADO_POR_TIPO[a.ACTION_TYPE] || []).map((c) => a.ACTION_DATA?.[c])).filter((v) => v === '2' || v === '3');
  if (alvos.length) assert.ok(r.soltas.some((s) => ['2', '3'].includes(s.valorOriginal)), 'referência a estado que trocou de lugar foi esvaziada');
});
