// Condição AGENTE LOGADO com "Usar do extra data" (como no editor nativo): o
// agente vem de uma {$variável} no valor, em vez de um ID fixo em CONDITION_TYPE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { botSintetico, js } from './apoio.mjs';

const { state } = await js('state.js');
const R = await js('bot-view-render.js');
const I = await js('bot-view-interactions.js');
const S = await js('simulador.js');
const { problemaAntesDeSalvar } = await js('validacao-salvar.js');
const { marcadorAgenteExtraData, ehAgenteDoExtraData } = await js('orpen-env.js');

const MARCADOR = 'extra_data';
const AGENTES = [{ id: '7', name: '[Agente] Maria' }, { id: '9', name: '[Agente] João' }];

const cond = (tipo, valor = '', variable = 'agent_online') => ({ ID: '1', TRANSITION_ID: '10', CONDITION_TYPE: tipo, CONDITION_DATA: { variable, value: valor } });
const botCom = (...conds) => ({
  BOT_STATES: [{ STATE_NUMBER: '0', ALIAS: 'Início' }],
  BOT_TRANSITIONS: [{ ID: '10', STATE: '0', PRIORITY: '1' }],
  BOT_CONDITIONS: conds,
  BOT_ACTIONS: [],
});

function limpar() {
  state.ambienteOrpen = null;
  state.botCarregado = null;
  state.botTransformado = null;
}

test('ehAgenteDoExtraData: só tipo não numérico e não vazio', () => {
  assert.equal(ehAgenteDoExtraData('extra_data'), true);
  assert.equal(ehAgenteDoExtraData('-1'), true);
  for (const t of ['7', '0', '', null, undefined, ' ']) assert.equal(ehAgenteDoExtraData(t), false, String(t));
});

test('a opção aparece no topo de AGENTE LOGADO quando a página informa o marcador', () => {
  limpar();
  state.ambienteOrpen = { agents: AGENTES, agenteExtraData: MARCADOR };
  const opcoes = R.buildOperatorOptions('ref_agente', '7', 'agent_online');
  assert.deepEqual(opcoes[0], { value: MARCADOR, label: 'Usar do extra data' });
  assert.deepEqual(opcoes.slice(1).map((o) => o.value), ['7', '9']);
});

test('DISPONÍVEL CHAT (mesma kind) não ganha a opção', () => {
  limpar();
  state.ambienteOrpen = { agents: AGENTES, agenteExtraData: MARCADOR };
  const opcoes = R.buildOperatorOptions('ref_agente', '7', 'agent_available_on_chat');
  assert.ok(!opcoes.some((o) => o.value === MARCADOR));
});

test('sem marcador conhecido a opção não é oferecida; aprende com uma condição do bot', () => {
  limpar();
  state.ambienteOrpen = { agents: AGENTES };
  assert.ok(!R.buildOperatorOptions('ref_agente', '', 'agent_online').some((o) => o.label === 'Usar do extra data'));
  state.botCarregado = botCom(cond('xd', '{$x}'));
  assert.equal(marcadorAgenteExtraData(), 'xd');
  assert.equal(R.buildOperatorOptions('ref_agente', '', 'agent_online')[0].value, 'xd');
});

test('condição que já usa a opção mostra "Usar do extra data" e o campo de valor', () => {
  limpar();
  state.ambienteOrpen = { agents: AGENTES };
  const c = cond('qualquer', '{$agent_last_att}');
  const opcoes = R.buildOperatorOptions('ref_agente', 'qualquer', 'agent_online');
  assert.equal(opcoes[0].label, 'Usar do extra data');
  assert.ok(!opcoes.some((o) => /não encontrado/.test(o.label)), 'não vira "agente não encontrado"');
  const html = R.renderCondicao(c, 0, 1);
  assert.match(html, /value="Usar do extra data"/);
  assert.match(html, /<textarea rows="2" class="textarea-view" placeholder="[^"]*agent_last_att[^"]*"/);
  assert.match(html, /\{\$agent_last_att\}<\/textarea>/);
  // Com um agente escolhido o valor continua escondido.
  assert.match(R.renderCondicao(cond('7'), 0, 1), /class="textarea-view hidden"/);
});

test('sem ambiente (JSON importado) a condição existente continua legível', () => {
  limpar();
  const opcoes = R.buildOperatorOptions('ref_agente', 'extra_data', 'agent_online');
  assert.deepEqual(opcoes.map((o) => o.label), ['Usar do extra data']);
});

test('trocar a variável para AGENTE LOGADO começa no primeiro agente, não no extra data', () => {
  limpar();
  state.ambienteOrpen = { agents: AGENTES, agenteExtraData: MARCADOR };
  const bot = botCom(cond('1', 'oi', 'message'));
  I.mudarCondicaoVariavel(bot, '10', '1', 'agent_online');
  assert.equal(bot.BOT_CONDITIONS[0].CONDITION_TYPE, '7');
});

test('voltar de "Usar do extra data" para um agente limpa a variável', () => {
  limpar();
  const bot = botCom(cond(MARCADOR, '{$agent_last_att}'));
  I.mudarCondicaoOperador(bot, '10', '1', '9');
  assert.equal(bot.BOT_CONDITIONS[0].CONDITION_TYPE, '9');
  assert.equal(bot.BOT_CONDITIONS[0].CONDITION_DATA.value, '');
  // e escolher a opção mantém o valor digitado
  const bot2 = botCom(cond('7', ''));
  I.mudarCondicaoOperador(bot2, '10', '1', MARCADOR);
  I.mudarCondicaoValor(bot2, '10', '1', '{$agent_last_att}');
  assert.equal(bot2.BOT_CONDITIONS[0].CONDITION_TYPE, MARCADOR);
  assert.equal(bot2.BOT_CONDITIONS[0].CONDITION_DATA.value, '{$agent_last_att}');
});

test('salvar: bloqueia "Usar do extra data" sem variável; com ela passa', () => {
  limpar();
  const c = cond(MARCADOR, '');
  const bot = botCom(c);
  assert.match(problemaAntesDeSalvar(bot), /Usar do extra data/);
  c.CONDITION_DATA.value = '{$agent_last_att}';
  assert.equal(problemaAntesDeSalvar(bot), null);
});

test('simulador: troca a variável e pergunta pelo agente certo', () => {
  limpar();
  const b = botSintetico({ estados: ['0', '1'], transicoes: [
    ['0', 1, [['message', 1, 'oi'], ['agent_online', MARCADOR, '{$agente_alvo}']], [['1', { message_text: 'online' }]]],
    ['0', 2, [], [['1', { message_text: 'fila' }]]],
  ] });
  assert.ok(!S.requisitosDeContexto(b).some((r) => r.chave.startsWith('agent_online')), 'o agente só se sabe no teste');
  const s = S.criarSessao(b);
  s.extra.agente_alvo = '7';
  S.enviarMensagem(s, 'oi');
  assert.equal(s.requisitos.at(-1)?.chave, 'agent_online:7');
  S.definirExterna(s, 'agent_online:7', 'sim');
  S.continuar(s);
  assert.ok(s.eventos.some((e) => e.texto === 'online'));
});

test('simulador: variável vazia deixa a condição falsa, com aviso', () => {
  limpar();
  const b = botSintetico({ estados: ['0', '1'], transicoes: [
    ['0', 1, [['agent_online', MARCADOR, '{$agente_alvo}']], [['1', { message_text: 'online' }]]],
    ['0', 2, [], [['1', { message_text: 'fila' }], ['2', { destiny: '1' }]]],
  ] });
  const s = S.criarSessao(b);
  S.enviarMensagem(s, 'oi');
  const textos = s.eventos.filter((e) => e.tipo === 'bot').map((e) => e.texto);
  assert.deepEqual(textos, ['fila']);
  assert.ok(s.rodadas[0].avisos.some((a) => /está vazio/.test(a)));
});

// O coletor roda na página da Orpen; aqui, numa página falsa.
function coletarCom({ opcoes = [], scripts = [] }) {
  const gravado = {};
  const el = (tag, extra) => ({ tagName: tag, ...extra });
  const documento = {
    getElementsByTagName: (t) => (t === 'option' ? opcoes.map(([value, textContent]) => el('option', { value, textContent }))
      : t === 'script' ? scripts.map((textContent) => el('script', { textContent })) : []),
    getElementById: (id) => gravado[id] ?? null,
    createElement: (tag) => el(tag, {}),
    head: { appendChild: (n) => { gravado[n.id] = n; } },
    addEventListener() {},
    dispatchEvent() {},
  };
  const ctx = { document: documento, console: { log() {}, warn() {}, error() {} }, setTimeout() {}, fetch() {} };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(new URL('../../content/page-env-collector.js', import.meta.url), 'utf8'), ctx);
  return JSON.parse(gravado.__orpen_bot_env_data__.textContent).agenteExtraData;
}

test('coletor: lê o marcador da <option> nativa na tela', () => {
  assert.equal(coletarCom({ opcoes: [['7', 'Maria'], ['extra_data', 'Usar do extra data']] }), 'extra_data');
});

test('coletor: lê o marcador do código do bot.php nos formatos comuns', () => {
  const casos = [
    [`html += "<option value='extra'>Usar do extra data</option>";`, 'extra'],
    [`html += '<option value=\\"-1\\">Usar do extra data</option>';`, '-1'],
    [`opts.push({ value: 'use_extra', text: 'Usar do extra data' });`, 'use_extra'],
    [`$('<option>').val('var').text('Usar do Extra Data').appendTo(s);`, 'var'],
  ];
  for (const [codigo, esperado] of casos) assert.equal(coletarCom({ scripts: [codigo] }), esperado, codigo);
});

test('coletor: não pega o value de outra opção nem ID numérico; sem a opção devolve null', () => {
  assert.equal(coletarCom({ scripts: [`"<option value='7'>Maria</option><option>Usar do extra data</option>"`] }), null);
  assert.equal(coletarCom({ scripts: [`"<option value='12'>Usar do extra data</option>"`] }), null);
  assert.equal(coletarCom({ scripts: ['var x = 1;'] }), null);
});
