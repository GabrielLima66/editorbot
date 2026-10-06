// Localizar por calendário (js/busca.js, textoDeCalendario).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js } from './apoio.mjs';

const { textoDeCalendario } = await js('busca.js');

const cond = (variable, tipo) => ({ ID: '1', TRANSITION_ID: '1', CONDITION_TYPE: tipo, CONDITION_DATA: { variable } });
const nomes = { 12: 'Horário comercial', 40: 'Plantão fim de semana' };
const nomeDe = (id) => nomes[id] ?? null;

test('condição de calendário mostra o nome e o ID do calendário', () => {
  assert.equal(textoDeCalendario(cond('calendario', '12'), nomeDe), 'Horário comercial (ID 12)');
  assert.equal(textoDeCalendario(cond('calendario_falso', '40'), nomeDe), 'Plantão fim de semana (ID 40)');
});

test('sem o cadastro do ambiente só há o ID', () => {
  assert.equal(textoDeCalendario(cond('calendario', '99'), nomeDe), 'ID 99');
});

test('outras condições e calendário não escolhido não entram', () => {
  assert.equal(textoDeCalendario(cond('message', '1'), nomeDe), null);
  assert.equal(textoDeCalendario(cond('agent_online', '12'), nomeDe), null);
  assert.equal(textoDeCalendario(cond('calendario', ''), nomeDe), null);
  assert.equal(textoDeCalendario(cond('calendario', '0'), nomeDe), null);
  assert.equal(textoDeCalendario({ ID: '2', TRANSITION_ID: '1', CONDITION_TYPE: '5' }, nomeDe), null);
});
