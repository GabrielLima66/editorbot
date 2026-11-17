// Ação 23 "Enviar Flow (WhatsApp)" (PRD-2594 da Orpen): detecção pela
// versão, formato gravado, travas do salvar, variáveis e cópia entre bots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botsDeExemplo, servidorOrpen, js } from './apoio.mjs';

const { state } = await js('state.js');
const F = await js('flows.js');
const R = await js('bot-view-render.js');
const I = await js('bot-view-interactions.js');
const { fromGetBotResponse, toUpdateBotPayload, serializeBracketNotation } = await js('orpen-adapter.js');
const { problemaAntesDeSalvar } = await js('validacao-salvar.js');
const { extrairTrecho, colarTrecho } = await js('trechos.js');
const { CAMPOS_ESTADO_POR_TIPO, ACTION_TYPE_LABELS } = await js('dictionaries.js');

const clone = (x) => JSON.parse(JSON.stringify(x));
const COM_FLOWS = { flows: { entradas: [{ id: '77', name: 'Vendas (5511999)' }], cta: 'Preencher formulário', timeout: '600' } };

// Como o nativo grava uma ação 23 completa (docs/internal/bots/bot-actions.md da PRD-2594).
const FLOW_OK = {
  flow_entrance: '77', flow_id: '1234567890', flow_name: 'Cadastro', flow_mode: 'published',
  flow_screen: 'INICIO', flow_variables: 'nome,cpf', flow_text: 'Olá {$contact_first_name}, preencha o cadastro',
  flow_cta: 'Abrir', callback_state: '1', fallback_state: '2', timeout: '600',
};

const abrir = (b) => fromGetBotResponse(servidorOrpen(serializeBracketNotation(toUpdateBotPayload(b))));
const umBot = () => abrir(botsDeExemplo().find(({ bot }) => (bot.BOT_TRANSITIONS || []).length && (bot.BOT_STATES || []).length >= 3).bot);
const comFlow = (data) => {
  const bot = umBot();
  bot.BOT_ACTIONS.push({ ID: '999999', TRANSITION_ID: bot.BOT_TRANSITIONS[0].ID, ACTION_TYPE: '23', ACTION_DATA: data });
  return bot;
};

test('"Enviar Flow" só é oferecida na versão da Orpen com Flows', () => {
  state.ambienteOrpen = { variables: [] };
  assert.equal(R.tiposDeAcaoDisponiveis()['23'], undefined, 'bot.php sem flowEntrances');
  state.ambienteOrpen = { flows: { entradas: [] } };
  assert.equal(R.tiposDeAcaoDisponiveis()['23'], 'Enviar Flow (WhatsApp)', 'com Flows e nenhuma rota apta, o nativo mostra a ação');
  state.ambienteOrpen = null;
  assert.equal(R.tiposDeAcaoDisponiveis()['23'], undefined, 'modo avulso');
  assert.equal(ACTION_TYPE_LABELS['23'], 'Enviar Flow (WhatsApp)', 'o rótulo existe sempre, para ação já gravada');
});

test('ação nova: as 11 chaves do nativo, com botão e tempo limite do formulário', () => {
  state.ambienteOrpen = clone(COM_FLOWS);
  const d = R.defaultActionData('23');
  assert.deepEqual(Object.keys(d), F.CHAVES_FLOW);
  assert.equal(d.flow_cta, 'Preencher formulário');
  assert.equal(d.timeout, '600');
  assert.equal(d.flow_mode, 'published');
});

test('trocar para "Enviar Flow" já escolhe o primeiro estado nos dois campos (selects sem opção vazia)', () => {
  state.ambienteOrpen = clone(COM_FLOWS);
  const bot = umBot();
  const a = bot.BOT_ACTIONS[0];
  I.mudarTipoAcao(bot, a.TRANSITION_ID, a.ID, '23');
  const primeiro = String(Math.min(...bot.BOT_STATES.map((s) => parseInt(s.STATE_NUMBER, 10))));
  assert.equal(a.ACTION_DATA.callback_state, primeiro);
  assert.equal(a.ACTION_DATA.fallback_state, primeiro);
});

test('travas do salvar na ordem do nativo', () => {
  assert.equal(F.problemaDoFlow(FLOW_OK), null);
  assert.match(F.problemaDoFlow({ ...FLOW_OK, flow_screen: '' }), /preencha a rota, o Flow, o texto e o botão/);
  assert.match(F.problemaDoFlow({ ...FLOW_OK, flow_text: '   ' }), /preencha a rota/);
  assert.match(F.problemaDoFlow({ ...FLOW_OK, flow_cta: '' }), /preencha a rota/);
  assert.match(F.problemaDoFlow({ ...FLOW_OK, fallback_state: '' }), /estado de retorno e o estado de não resposta/);
  assert.match(F.problemaDoFlow({ ...FLOW_OK, timeout: '1.5' }), /só números inteiros de até 6 dígitos/);
  assert.match(F.problemaDoFlow({ ...FLOW_OK, timeout: '1234567' }), /6 dígitos/);
  assert.equal(F.problemaDoFlow({ ...FLOW_OK, timeout: '' }), null, 'vazio usa o padrão');
  // Obrigatórios vêm antes dos estados, como no nativo.
  assert.match(F.problemaDoFlow({ ...FLOW_OK, flow_id: '', callback_state: '' }), /preencha a rota/);
});

test('tamanho estimado como o nativo: 6 por caractere fora do ASCII, limite 3500', () => {
  const base = F.tamanhoEstimadoFlow({ ...FLOW_OK, flow_text: '' });
  assert.equal(F.tamanhoEstimadoFlow({ ...FLOW_OK, flow_text: 'aé' }) - base, 1 + 6);
  assert.match(F.problemaDoFlow({ ...FLOW_OK, flow_text: 'ç'.repeat(600) }), /grande demais/);
  assert.equal(F.problemaDoFlow({ ...FLOW_OK, flow_text: 'a'.repeat(600) }), null);
});

test('salvar bloqueado com a mensagem do nativo e o lugar da ação', () => {
  state.ambienteOrpen = clone(COM_FLOWS);
  assert.equal(problemaAntesDeSalvar(comFlow(FLOW_OK)), null);
  const msg = problemaAntesDeSalvar(comFlow({ ...FLOW_OK, flow_screen: '' }));
  assert.match(msg, /^na ação "Enviar Flow \(WhatsApp\)" no estado .*, preencha a rota/);
  // Sem Flows nesta versão, rota e Flow não podem ser escolhidos: não trava.
  state.ambienteOrpen = { variables: [] };
  assert.equal(problemaAntesDeSalvar(comFlow({ ...FLOW_OK, flow_screen: '' })), null);
});

test('memória da lista: mantida nos redesenhos do mesmo bot, zerada em outro bot', () => {
  const bot = {};
  F.limparMemoriaFlows(bot);
  F.memoriaFlows.listas.set('77', { flows: [] });
  F.limparMemoriaFlows(bot);
  assert.ok(F.memoriaFlows.listas.has('77'));
  F.limparMemoriaFlows({});
  assert.ok(!F.memoriaFlows.listas.has('77'));
});

test('gravado como o nativo e conferido sem diferença depois de salvar', () => {
  const bot = comFlow({ flow_text: 'oi', flow_id: '9', flow_mode: 'qualquer', flow_entrance: '77' });
  const enviado = toUpdateBotPayload(bot);
  const acao = enviado.states.flatMap((s) => s.transitions).flatMap((t) => t.actions).find((a) => a.type === 23);
  assert.deepEqual(Object.keys(acao.data), F.CHAVES_FLOW);
  assert.equal(acao.data.flow_mode, 'published');
  const relido = toUpdateBotPayload(fromGetBotResponse(servidorOrpen(serializeBracketNotation(enviado))));
  assert.equal(serializeBracketNotation(relido), serializeBracketNotation(enviado));
});

test('callback e fallback do Flow seguem a renumeração e a cópia de estados', () => {
  assert.deepEqual(CAMPOS_ESTADO_POR_TIPO['23'], ['callback_state', 'fallback_state']);
});

test('colar em outro ambiente esvazia a rota e o Flow inteiro', () => {
  const origem = comFlow(clone(FLOW_OK));
  const t = origem.BOT_TRANSITIONS[0];
  const trecho = extrairTrecho(origem, { estados: [t.STATE] });
  const dest = clone(umBot());
  colarTrecho(dest, trecho, { esvaziarAmbiente: true });
  const colada = dest.BOT_ACTIONS.filter((a) => a.ACTION_TYPE === '23').pop();
  assert.ok(colada);
  const d = colada.ACTION_DATA;
  assert.deepEqual([d.flow_entrance, d.flow_id, d.flow_name, d.flow_screen, d.flow_variables, d.flow_mode], ['', '', '', '', '', 'published']);
  assert.equal(d.flow_text, FLOW_OK.flow_text, 'texto e botão não dependem do ambiente');
});

test('variáveis do Flow na condição: Flow_Status/Response e as flow_<campo> do próprio bot', () => {
  state.ambienteOrpen = {
    ...clone(COM_FLOWS),
    variables: [
      { id: 'message', name: 'MENSAGEM', parent: null, fixa: true },
      { id: 'Flow_Status', name: '[Flow] Status', parent: 'flow', fixa: false },
      { id: 'Flow_Response', name: '[Flow] Resposta (JSON)', parent: 'flow', fixa: false },
      { id: 'flow_de_outro_bot', name: 'Flow: de_outro_bot', parent: 'flow', fixa: false },
    ],
  };
  const semFlow = { BOT_ACTIONS: [] };
  assert.ok(!R.opcoesVariavelCondicao(semFlow).some((o) => o.grupo === 'Flow'), 'sem ação 23, nada de Flow');
  const bot = { BOT_ACTIONS: [{ ID: '1', TRANSITION_ID: '1', ACTION_TYPE: '23', ACTION_DATA: { flow_variables: 'nome, cpf-x,nome' } }] };
  const flow = R.opcoesVariavelCondicao(bot).filter((o) => o.grupo === 'Flow').map((o) => o.value);
  assert.deepEqual(flow, ['Flow_Status', 'Flow_Response', 'flow_nome', 'flow_cpfx']);
  assert.equal(R.nomeVariavelCondicao('flow_nome'), 'Flow: nome');
});

test('linha das variáveis de retorno como no nativo', () => {
  assert.equal(F.textoVariaveisFlow('nome, cpf'), '{$flow_nome}, {$flow_cpf}');
  assert.equal(F.textoVariaveisFlow(''), 'Nenhuma variável encontrada no Flow.');
});

test('formulário: com Flows, rota e Flow são listas; sem Flows, ficam só para leitura', () => {
  const a = { ID: '5', TRANSITION_ID: '3', ACTION_TYPE: '23', ACTION_DATA: clone({ ...FLOW_OK, flow_mode: 'draft' }) };
  state.ambienteOrpen = clone(COM_FLOWS);
  F.limparMemoriaFlows();
  let html = R.renderAcao(a, {}, 0, 1);
  assert.match(html, /data-action="flow-rota"/);
  assert.match(html, /<option value="77" selected>Vendas \(5511999\)<\/option>/);
  assert.match(html, /<option value="1234567890" selected>Cadastro \(rascunho\)<\/option>/, 'sem a lista, mostra o Flow gravado');
  assert.match(html, /maxlength="600"/);
  assert.match(html, /maxlength="20"/);
  assert.match(html, /\{\$flow_nome\}, \{\$flow_cpf\}/);
  state.ambienteOrpen = { variables: [] };
  html = R.renderAcao(a, {}, 0, 1);
  assert.doesNotMatch(html, /flow-rota|flow-escolher/);
  assert.match(html, /não tem a ação Enviar Flow/);
});

test('item da lista de Flows como o select nativo', () => {
  assert.deepEqual(F.opcaoDoFlow({ id: 1, name: 'A', status: 'draft' }), { value: '1', nome: 'A', rascunho: true, label: 'A (rascunho)' });
  assert.equal(F.opcaoDoFlow({ id: 2, status: 'PUBLISHED' }).label, '2');
  assert.equal(F.mensagemErroFlow('flow_route_without_credentials'), 'A rota não tem as credenciais da Gupshup configuradas.');
  assert.equal(F.mensagemErroFlow('flows_list_failed'), 'Não foi possível carregar os Flows desta rota.');
});

test('ao abrir, botão e tempo limite vazios mostram o padrão (o nativo grava o padrão ao salvar)', () => {
  const bot = { BOT_ACTIONS: [
    { ID: '1', ACTION_TYPE: '23', ACTION_DATA: { ...FLOW_OK, flow_cta: '', timeout: '' } },
    { ID: '2', ACTION_TYPE: '23', ACTION_DATA: { ...FLOW_OK } },
  ] };
  F.completarPadroesFlow(bot, { cta: 'Abrir formulário', timeout: '600' });
  assert.equal(bot.BOT_ACTIONS[0].ACTION_DATA.flow_cta, 'Abrir formulário');
  assert.equal(bot.BOT_ACTIONS[0].ACTION_DATA.timeout, '600');
  assert.equal(bot.BOT_ACTIONS[1].ACTION_DATA.flow_cta, 'Abrir', 'valor gravado não muda');
});
