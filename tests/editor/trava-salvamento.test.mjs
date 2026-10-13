// Um salvamento por vez: chamadas durante um em andamento recebem o mesmo
// resultado e não disparam outro envio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js } from './apoio.mjs';

const { criarTravaDeSalvamento } = await js('trava-salvamento.js');
const { fotografarNumeros, mudancasDeNumero } = await js('renumeracao.js');

function envioControlado() {
  let envios = 0;
  let liberar;
  const trava = criarTravaDeSalvamento(() => {
    envios++;
    return new Promise((resolve) => { liberar = resolve; });
  });
  return { trava, envios: () => envios, liberar: (v) => liberar(v) };
}

test('duas chamadas seguidas enviam uma vez só e recebem o mesmo resultado', async () => {
  const c = envioControlado();
  const a = c.trava.salvar();
  const b = c.trava.salvar();
  await Promise.resolve();
  assert.equal(c.envios(), 1);
  assert.equal(a, b);
  c.liberar(true);
  assert.equal(await a, true);
  assert.equal(await b, true);
});

test('terminado o salvamento, o próximo envia de novo', async () => {
  const c = envioControlado();
  const a = c.trava.salvar();
  await Promise.resolve();
  c.liberar(true);
  await a;
  assert.equal(c.trava.emAndamento(), null);
  c.trava.salvar();
  await Promise.resolve();
  assert.equal(c.envios(), 2);
});

test('falha no envio também libera a trava', async () => {
  let n = 0;
  const trava = criarTravaDeSalvamento(async () => {
    n++;
    if (n === 1) throw new Error('rede');
    return true;
  });
  await assert.rejects(trava.salvar(), /rede/);
  assert.equal(trava.emAndamento(), null);
  assert.equal(await trava.salvar(), true);
});

test('emAndamento acompanha o salvamento em curso', async () => {
  const c = envioControlado();
  assert.equal(c.trava.emAndamento(), null);
  const a = c.trava.salvar();
  assert.equal(c.trava.emAndamento(), a);
  await Promise.resolve();
  c.liberar(false);
  await a;
  assert.equal(c.trava.emAndamento(), null);
});

test('a foto dos números tirada antes do envio não acompanha o que muda depois', () => {
  const s0 = { STATE_NUMBER: '0', ALIAS: 'A' };
  const s1 = { STATE_NUMBER: '1', ALIAS: 'B' };
  const s2 = { STATE_NUMBER: '2', ALIAS: 'C' };
  const bot = { BOT_STATES: [s0, s1, s2], BOT_TRANSITIONS: [], BOT_ACTIONS: [], BOT_CONDITIONS: [] };
  const enviados = fotografarNumeros(bot); // o que foi para o servidor
  s2.STATE_NUMBER = '1'; s1.STATE_NUMBER = '2'; // a pessoa arrasta durante o "Salvando…"
  const aviso = mudancasDeNumero(bot, enviados);
  assert.ok(aviso, 'a mudança feita durante o salvamento ainda gera o aviso de renumeração');
  assert.equal(aviso.mudados.length, 2);
});
