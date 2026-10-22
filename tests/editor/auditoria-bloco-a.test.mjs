// Correções da auditoria (bloco A): o que a tela mostra tem que ser o que é gravado,
// e nenhum padrão pode fazer a condição ou o destino sumirem ao salvar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { js } from './apoio.mjs';

const { state } = await js('state.js');
const I = await js('bot-view-interactions.js');
const R = await js('bot-view-render.js');
const { comValorAtual, rotulosUnicos } = await js('orpen-env.js');

const botCom = (extra = {}) => ({
  BOT_STATES: [{ STATE_NUMBER: '0', ALIAS: 'Início' }, { STATE_NUMBER: '3', ALIAS: 'Fila' }, { STATE_NUMBER: '1', ALIAS: 'Menu' }],
  BOT_TRANSITIONS: [{ ID: 't1', STATE: '0', PRIORITY: '0' }],
  BOT_CONDITIONS: [],
  BOT_ACTIONS: [],
  ...extra,
});

// --- 1. operador padrão ao trocar a variável -------------------------------

const condicao = (variavel) => ({
  ID: 'c1', TRANSITION_ID: 't1', CONDITION_TYPE: '1', CONDITION_DATA: { variable: variavel, type: '1', value: '' },
});

test('trocar para variável de texto não deixa "Sempre verdadeiro" como operador', () => {
  const bot = botCom({ BOT_CONDITIONS: [condicao('message')] });
  I.mudarCondicaoVariavel(bot, 't1', 'c1', 'cpf_cliente');
  assert.equal(String(bot.BOT_CONDITIONS[0].CONDITION_TYPE), '1');
});

test('contato começa em "É Vip" (10), como no nativo', () => {
  const bot = botCom({ BOT_CONDITIONS: [condicao('message')] });
  I.mudarCondicaoVariavel(bot, 't1', 'c1', 'contact');
  assert.equal(String(bot.BOT_CONDITIONS[0].CONDITION_TYPE), '10');
});

test('contador de erros começa em "Igual" e não em "Sempre verdadeiro"', () => {
  const bot = botCom({ BOT_CONDITIONS: [condicao('message')] });
  I.mudarCondicaoVariavel(bot, 't1', 'c1', 'error_count');
  assert.equal(String(bot.BOT_CONDITIONS[0].CONDITION_TYPE), '1');
});

test('"Sempre verdadeiro" continua escolhível na lista de operadores', () => {
  const valores = R.buildOperatorOptions('text', '').map((o) => String(o.value));
  assert.ok(valores.includes('0'));
});

// --- 2. Troca Estado e timeout: destino padrão -------------------------------

test('Troca Estado nova já nasce apontando para o primeiro estado', () => {
  const bot = botCom({ BOT_ACTIONS: [{ ID: 'a1', TRANSITION_ID: 't1', ACTION_TYPE: '1', ACTION_DATA: { message_text: 'oi' } }] });
  I.mudarTipoAcao(bot, 't1', 'a1', '2');
  assert.equal(bot.BOT_ACTIONS[0].ACTION_DATA.destiny, '0');
});

test('o primeiro estado é o de menor número, não o primeiro da lista', () => {
  const bot = botCom({ BOT_STATES: [{ STATE_NUMBER: '5' }, { STATE_NUMBER: '2' }, { STATE_NUMBER: '9' }] });
  assert.equal(I.primeiroNumeroDeEstado(bot), '2');
  assert.equal(I.primeiroNumeroDeEstado({ BOT_STATES: [] }), '');
});

test('campo de estado vazio fica em branco (placeholder) e não mostra o estado 0', () => {
  const porNumero = { 0: { STATE_NUMBER: '0', ALIAS: 'A' }, 1: { STATE_NUMBER: '1', ALIAS: 'B' } };
  assert.equal(R.textoDeEstado(porNumero, ''), '');
  assert.equal(R.textoDeEstado(porNumero, undefined), '');
});

test('campo de estado com número inexistente mostra o valor gravado', () => {
  const porNumero = { 0: { STATE_NUMBER: '0', ALIAS: 'A' } };
  assert.equal(R.textoDeEstado(porNumero, '7'), '7 (estado inexistente)');
  assert.equal(R.textoDeEstado(porNumero, '0'), '0 - A');
});

test('destino de Troca Estado é um campo de busca com a lista de estados', () => {
  const porNumero = { 0: { STATE_NUMBER: '0', ALIAS: 'Início' } };
  const html = R.campoEstadoDestinoComAtalho(porNumero, 't1', 'a1', '0');
  assert.match(html, /<input type="search" list="bv-estados-datalist"/);
  assert.doesNotMatch(html, /<select/);
  assert.match(html, /value="0 - Início"/);
});

test('Enter prefere o estado de nome exato ao que só contém o texto', async () => {
  const { correspondeExato } = await import('../../js/combobox.js');
  const opcoes = ['2 - Menu principal', '5 - Menu'];
  assert.equal(opcoes.findIndex((o) => correspondeExato(o, 'Menu')), 1);
  assert.equal(opcoes.findIndex((o) => correspondeExato(o, 'menu principal')), 0);
  assert.equal(opcoes.findIndex((o) => correspondeExato(o, '5 - menu')), 1);
  assert.equal(opcoes.findIndex((o) => correspondeExato(o, 'men')), -1);
});

test('busca de estado aceita "N - Nome", número ou nome e rejeita o que não existe', () => {
  const bot = botCom({ BOT_STATES: [{ STATE_NUMBER: '0', ALIAS: 'Início' }, { STATE_NUMBER: '12', ALIAS: 'Menu Principal' }] });
  assert.equal(I.resolverEstadoDigitado(bot, '12 - Menu Principal'), '12');
  assert.equal(I.resolverEstadoDigitado(bot, ' 12 '), '12');
  assert.equal(I.resolverEstadoDigitado(bot, 'menu principal'), '12');
  assert.equal(I.resolverEstadoDigitado(bot, '0'), '0');
  assert.equal(I.resolverEstadoDigitado(bot, '99'), null);
  assert.equal(I.resolverEstadoDigitado(bot, 'menu'), null);
  assert.equal(I.resolverEstadoDigitado(bot, ''), null);
});

test('trocar o timeout para "Trocar estado" não herda o status CRM de antes', () => {
  const bot = botCom({ TIMEOUT_ACTION: 'close', TIMEOUT_DESTINY: '5' });
  I.trocarAcaoTimeout(bot, 'bot');
  assert.equal(bot.TIMEOUT_ACTION, 'bot');
  assert.equal(bot.TIMEOUT_DESTINY, '0');
});

test('trocar o timeout para "Encerrar" não herda o número do estado', () => {
  const bot = botCom({ TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '3' });
  I.trocarAcaoTimeout(bot, 'close');
  assert.equal(bot.TIMEOUT_DESTINY, '');
});

test('escolher a mesma ação do timeout não mexe no destino', () => {
  const bot = botCom({ TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '3' });
  I.trocarAcaoTimeout(bot, 'bot');
  assert.equal(bot.TIMEOUT_DESTINY, '3');
});

// --- 4. Transf. Fila oferece filas e variáveis --------------------------------------

test('Transf. Fila lista filas e variáveis; valor de bot/agente já gravado continua visível', () => {
  state.ambienteOrpen = {
    queues: [{ id: '10', name: 'Vendas' }],
    bots: [{ id: '77', name: 'Bot X' }],
    agents: [{ id: '5', name: 'Ana' }],
    variables: [{ id: 'FILA_ESCOLHIDA', name: 'Fila escolhida', parent: null, fixa: false, tipo: 'queue' }],
  };
  const html = R.renderAcao({ ID: 'a1', TRANSITION_ID: 't1', ACTION_TYPE: '5', ACTION_DATA: { destiny: '77' } }, {}, 0, 1);
  assert.match(html, /Vendas/);
  assert.doesNotMatch(html, /Bot X/);
  assert.doesNotMatch(html, /Ana/);
  assert.match(html, /77 \(não encontrado no ambiente\)/);
  // Variáveis aparecem no grupo "Variáveis do bot"
  assert.match(html, /Fila escolhida/);
  assert.match(html, /Vari.veis do bot/);
  state.ambienteOrpen = null;
});

test('Transf. Agente lista agentes, bots e variáveis; variável gravada aparece pelo nome', () => {
  state.ambienteOrpen = {
    queues: [{ id: '10', name: 'Vendas' }],
    bots: [{ id: '77', name: 'Bot X' }],
    agents: [{ id: '5', name: 'Ana' }],
    variables: [{ id: 'AGENTE_DESTINO', name: 'Agente destino', parent: null, fixa: false, tipo: 'agent' }],
  };
  const html = R.renderAcao({ ID: 'a1', TRANSITION_ID: 't1', ACTION_TYPE: '4', ACTION_DATA: { destiny: '{$AGENTE_DESTINO}' } }, {}, 0, 1);
  assert.match(html, /Ana/);
  assert.match(html, /Bot X/);
  assert.doesNotMatch(html, /Vendas/);
  assert.match(html, /data-value="\{\$AGENTE_DESTINO\}"/);
  assert.match(html, /value="Agente destino"/);
  assert.doesNotMatch(html, /não encontrado no ambiente/);
  state.ambienteOrpen = null;
});

test('destino de transferência: a lista do campo é só de filas; variáveis ficam numa lista à parte (botão {$})', () => {
  state.ambienteOrpen = {
    queues: [{ id: '10', name: 'Suporte' }],
    bots: [], agents: [],
    variables: [
      { id: 'message', name: 'MENSAGEM', parent: null },
      { id: 'agent_on_queue', name: 'AGENTES NA FILA', parent: null },
      { id: 'calendario', name: 'CALENDARIO - Verdadeiro', parent: null },
      { id: 'FILA_ESCOLHIDA', name: 'Fila escolhida', parent: null },
    ],
  };
  const html = R.renderAcao({ ID: 'a1', TRANSITION_ID: 't1', ACTION_TYPE: '5', ACTION_DATA: { destiny: '10' } }, {}, 0, 1);
  const listaFila = /<datalist id="dl-a1-destiny">(.*?)<\/datalist>/s.exec(html)[1];
  const listaVar = /<datalist id="dl-a1-destiny-var">(.*?)<\/datalist>/s.exec(html)[1];
  assert.match(listaFila, /Suporte/);
  assert.doesNotMatch(listaFila, /MENSAGEM|Fila escolhida|\{\$/);
  assert.match(listaVar, /data-value="\{\$FILA_ESCOLHIDA\}"/);
  assert.doesNotMatch(listaVar, /Suporte/);
  // só variáveis: as fixas de condição (Mensagem, Agentes e filas, Calendário) ficam de fora
  assert.doesNotMatch(listaVar, /MENSAGEM|AGENTES NA FILA|CALENDARIO|data-grupo="(Mensagem|Agentes e filas|Calendário)"/);
  // valor de fila: o campo usa a lista de filas; o botão {$} começa desligado
  assert.match(html, /<input type="search" list="dl-a1-destiny" /);
  assert.match(html, /data-action="alternar-lista-variaveis" aria-pressed="false"/);
  state.ambienteOrpen = null;
});

test('Transf. Agente oferece AG. PREFERIDO e Último agente que atendeu entre as variáveis; a fila não', () => {
  state.ambienteOrpen = {
    queues: [{ id: '10', name: 'Suporte' }],
    bots: [], agents: [{ id: '5', name: 'Ana' }],
    variables: [
      { id: 'pref_agent', name: 'AG. PREFERIDO', parent: null },
      { id: 'agent_last_att', name: 'Último agente que atendeu', parent: null },
      { id: 'name_pref_agent', name: 'NOME AG. PREFERIDO', parent: null },
      { id: 'message', name: 'MENSAGEM', parent: null },
      { id: 'AGENTE_DESTINO', name: 'Agente destino', parent: null },
    ],
  };
  const agente = R.renderAcao({ ID: 'a1', TRANSITION_ID: 't1', ACTION_TYPE: '4', ACTION_DATA: { destiny: '5' } }, {}, 0, 1);
  const listaAgente = /<datalist id="dl-a1-destiny-var">(.*?)<\/datalist>/s.exec(agente)[1];
  assert.match(listaAgente, /data-value="\{\$pref_agent\}"/);
  assert.match(listaAgente, /data-value="\{\$agent_last_att\}"/);
  assert.match(listaAgente, /data-value="\{\$AGENTE_DESTINO\}"/);
  assert.doesNotMatch(listaAgente, /MENSAGEM|name_pref_agent/);
  const fila = R.renderAcao({ ID: 'a2', TRANSITION_ID: 't1', ACTION_TYPE: '5', ACTION_DATA: { destiny: '10' } }, {}, 0, 1);
  const listaFila = /<datalist id="dl-a2-destiny-var">(.*?)<\/datalist>/s.exec(fila)[1];
  assert.doesNotMatch(listaFila, /pref_agent|agent_last_att|AG\. PREFERIDO|Último agente/);
  // gravado na 0.8.27: aparece pelo nome, não como "não encontrado"
  const gravado = R.renderAcao({ ID: 'a3', TRANSITION_ID: 't1', ACTION_TYPE: '4', ACTION_DATA: { destiny: '{$agent_last_att}' } }, {}, 0, 1);
  assert.match(gravado, /value="Último agente que atendeu"/);
  assert.doesNotMatch(gravado, /não encontrado no ambiente/);
  state.ambienteOrpen = null;
});

test('destino de transferência com {$variável} gravada: o campo usa a lista de variáveis e o botão fica ligado', () => {
  state.ambienteOrpen = {
    queues: [{ id: '10', name: 'Suporte' }],
    bots: [], agents: [],
    variables: [{ id: 'FILA_ESCOLHIDA', name: 'Fila escolhida', parent: null }],
  };
  const html = R.renderAcao({ ID: 'a1', TRANSITION_ID: 't1', ACTION_TYPE: '5', ACTION_DATA: { destiny: '{$FILA_ESCOLHIDA}' } }, {}, 0, 1);
  assert.match(html, /<input type="search" list="dl-a1-destiny-var" [^>]*value="Fila escolhida"/);
  assert.match(html, /aria-pressed="true"/);
  assert.doesNotMatch(html, /não encontrado no ambiente/);
  state.ambienteOrpen = null;
});

test('outros campos do ambiente continuam sem o botão {$}', () => {
  state.ambienteOrpen = { queues: [], bots: [], agents: [], scripts: [{ id: '3', name: 'Survey' }], variables: [] };
  const html = R.renderAcao({ ID: 'a1', TRANSITION_ID: 't1', ACTION_TYPE: '7', ACTION_DATA: { script_name: '3' } }, {}, 0, 1);
  assert.doesNotMatch(html, /alternar-lista-variaveis/);
  state.ambienteOrpen = null;
});

// --- fila e status CRM do timeout: campo de busca --------------------------------

test('timeout (fila/status): campo de busca com o valor gravado, sem opção vazia na lista', () => {
  const opcoes = comValorAtual([{ value: '10', label: 'Suporte' }, { value: '11', label: 'Vendas' }], '11');
  const html = R.campoBuscaDoTimeout(opcoes, 'CONF_DELIVERY_QUEUE', '11', 'Selecione a fila…');
  assert.match(html, /<input type="search" id="bv-destino-select" list="bv-destino-datalist"/);
  assert.match(html, /value="Vendas"/);
  assert.match(html, /data-campo-bot="CONF_DELIVERY_QUEUE" data-busca-lista="1"/);
  assert.match(html, /<option value="Suporte" data-value="10">/);
  assert.equal((html.match(/<option /g) || []).length, 2);
  assert.doesNotMatch(html, /<select/);
});

test('timeout: sem valor o campo fica vazio (placeholder); valor fora do ambiente continua visível e gravável', () => {
  const vazio = R.campoBuscaDoTimeout(comValorAtual([{ value: '10', label: 'Suporte' }], ''), 'TIMEOUT_DESTINY', '', 'Selecione o status…');
  assert.match(vazio, /placeholder="Selecione o status…" value=""/);
  const fora = R.campoBuscaDoTimeout(comValorAtual([{ value: '10', label: 'Suporte' }], '99'), 'TIMEOUT_DESTINY', '99', 'x');
  assert.match(fora, /value="99 \(não encontrado no ambiente\)"/);
  assert.match(fora, /<option value="99 \(não encontrado no ambiente\)" data-value="99">/);
});

test('timeout: status com o mesmo nome ganham o ID e cada um grava o seu', () => {
  const opcoes = comValorAtual([{ value: '5', label: 'Resolvido' }, { value: '8', label: 'Resolvido' }], '');
  const lista = opcoes.map((o) => ({ valor: o.label, id: o.value }));
  assert.notEqual(lista[0].valor, lista[1].valor);
  assert.equal(I.resolverOpcaoDaLista(lista, lista[0].valor).id, '5');
  assert.equal(I.resolverOpcaoDaLista(lista, lista[1].valor).id, '8');
});

test('texto do campo de busca do ambiente volta ao item: rótulo exato ou ID único', () => {
  const lista = [{ valor: 'Suporte', id: '10' }, { valor: 'Vendas', id: '11' }, { valor: 'Vendas 2', id: '11' }];
  assert.equal(I.resolverOpcaoDaLista(lista, 'Suporte').id, '10');
  assert.equal(I.resolverOpcaoDaLista(lista, ' 10 ').id, '10');
  assert.equal(I.resolverOpcaoDaLista(lista, '11'), null); // dois cadastros com o ID: ambíguo
  assert.equal(I.resolverOpcaoDaLista(lista, 'Supor'), null);
  assert.equal(I.resolverOpcaoDaLista(lista, ''), null);
});

// --- 7. rótulos repetidos ----------------------------------------------------

test('cadastros com o mesmo nome ganham o ID no rótulo; os demais ficam iguais', () => {
  const opcoes = [
    { value: '12', label: '[Agente] Maria Silva' },
    { value: '87', label: '[Agente] Maria Silva' },
    { value: '3', label: '[Agente] João' },
  ];
  const r = rotulosUnicos(opcoes);
  assert.equal(new Set(r.map((o) => o.label)).size, 3);
  assert.equal(r[2].label, '[Agente] João');
  assert.match(r[0].label, /ID 12/);
  assert.match(r[1].label, /ID 87/);
});

test('comValorAtual devolve rótulos únicos e a lista sem repetição fica intacta', () => {
  const sem = [{ value: '1', label: 'A' }, { value: '2', label: 'B' }];
  assert.equal(comValorAtual(sem, '1'), sem);
  const com = comValorAtual([{ value: '1', label: 'A' }, { value: '2', label: 'A' }], '');
  assert.notEqual(com[0].label, com[1].label);
});

// --- 10. resumo da ferramenta avulsa dentro da extensão --------------------

test('mostrarResumoBot não quebra quando a página não tem a seção de upload', async () => {
  const { mostrarResumoBot } = await js('upload.js');
  state.botCarregado = botCom({ NAME: 'X', ID: '1' });
  assert.doesNotThrow(() => mostrarResumoBot());
  state.botCarregado = null;
});

// --- ID junto do nome de agentes e bots, e busca pelo ID --------------------

test('agentes e bots aparecem com o ID junto do nome', async () => {
  const { opcoesAgentes, opcoesBots, rotuloComId } = await js('orpen-env.js');
  state.ambienteOrpen = {
    agents: [{ id: '12', name: '[Agente] Maria Silva' }, { id: '9', name: '9' }],
    bots: [{ id: '77', name: '[Bot] Atendimento' }],
  };
  try {
    assert.deepEqual(opcoesAgentes().map((o) => o.label), ['[Agente 12] Maria Silva', '[Agente 9]']);
    assert.deepEqual(opcoesBots().map((o) => o.label), ['[Bot 77] Atendimento']);
    assert.equal(opcoesAgentes()[0].value, '12', 'o valor gravado continua sendo o ID');
    assert.equal(rotuloComId('Agente', '5', '[Agente 5] Já com id'), '[Agente 5] Já com id', 'idempotente');
    assert.equal(rotuloComId('Bot', '3', 'Sem prefixo'), '[Bot 3] Sem prefixo');
  } finally {
    state.ambienteOrpen = null;
  }
});

test('o ambiente guardado continua com o nome como o coletor entregou (o fluxograma lê assim)', async () => {
  const { opcoesAgentes } = await js('orpen-env.js');
  state.ambienteOrpen = { agents: [{ id: '12', name: '[Agente] Maria' }] };
  try {
    opcoesAgentes();
    assert.equal(state.ambienteOrpen.agents[0].name, '[Agente] Maria');
  } finally {
    state.ambienteOrpen = null;
  }
});

// --- paridade: valor da condição, timeout fila/status e fila importada -------

test('trocar a variável limpa o valor da condição, como o nativo', () => {
  const bot = botCom({ BOT_CONDITIONS: [{ ...condicao('message'), CONDITION_DATA: { variable: 'message', type: '1', value: 'oi' } }] });
  I.mudarCondicaoVariavel(bot, 't1', 'c1', 'cpf_cliente');
  assert.equal(bot.BOT_CONDITIONS[0].CONDITION_DATA.value, '');
});

test('trocar de "Possui os labels" para texto não deixa a lista como valor', () => {
  const bot = botCom({ BOT_CONDITIONS: [{ ID: 'c1', TRANSITION_ID: 't1', CONDITION_TYPE: '18', CONDITION_DATA: { variable: 'contact', type: '18', value: ['3', '9'] } }] });
  I.mudarCondicaoVariavel(bot, 't1', 'c1', 'message');
  assert.equal(bot.BOT_CONDITIONS[0].CONDITION_DATA.value, '');
});

test('escolher de novo a mesma variável não apaga o valor', () => {
  const bot = botCom({ BOT_CONDITIONS: [{ ...condicao('message'), CONDITION_DATA: { variable: 'message', type: '1', value: 'oi' } }] });
  I.mudarCondicaoVariavel(bot, 't1', 'c1', 'message');
  assert.equal(bot.BOT_CONDITIONS[0].CONDITION_DATA.value, 'oi');
});

test('timeout "Encerrar" já nasce com o primeiro status CRM e "Fila" com a primeira fila', () => {
  state.ambienteOrpen = { crm_status: [{ id: '4', name: 'Resolvido' }, { id: '9', name: 'Outro' }], queues: [{ id: 'VENDAS', name: '[VENDAS] Vendas' }] };
  try {
    const a = botCom({ TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '3' });
    I.trocarAcaoTimeout(a, 'close');
    assert.equal(a.TIMEOUT_DESTINY, '4');
    const b = botCom({ TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '3', CONF_DELIVERY_QUEUE: '' });
    I.trocarAcaoTimeout(b, 'queue');
    assert.equal(b.CONF_DELIVERY_QUEUE, 'VENDAS');
    const c = botCom({ TIMEOUT_ACTION: 'bot', CONF_DELIVERY_QUEUE: 'SUPORTE' });
    I.trocarAcaoTimeout(c, 'queue');
    assert.equal(c.CONF_DELIVERY_QUEUE, 'SUPORTE', 'fila já escolhida não é trocada');
  } finally {
    state.ambienteOrpen = null;
  }
});

test('bot importado com fila só no TIMEOUT_DESTINY mostra a fila e não a perde ao salvar', async () => {
  const { fromGetBotResponse, toUpdateBotPayload } = await js('orpen-adapter.js');
  const bot = fromGetBotResponse({
    ID: '5', NAME: 'x', TIMEOUT_ACTION: 'queue', TIMEOUT_DESTINY: 'SUPORTE', CONF_DELIVERY_QUEUE: '',
    BOT_STATES: [], BOT_TRANSITIONS: [], BOT_CONDITIONS: [], BOT_ACTIONS: [],
  });
  assert.equal(bot.CONF_DELIVERY_QUEUE, 'SUPORTE');
  assert.equal(toUpdateBotPayload(bot).timeout_queue, 'SUPORTE');
});

test('fila: o simulador mostra o nome e o ID uma vez só', async () => {
  const { nomeDoCadastro } = await js('simulador.js');
  state.ambienteOrpen = { queues: [{ id: 'SUPORTE', name: '[SUPORTE] Suporte N1' }, { id: 'GERAL', name: 'GERAL' }] };
  try {
    assert.equal(nomeDoCadastro('agent_on_queue', 'SUPORTE'), '"Suporte N1" (ID SUPORTE)');
    assert.equal(nomeDoCadastro('agent_on_queue', 'GERAL'), 'ID GERAL');
  } finally {
    state.ambienteOrpen = null;
  }
});

// --- ida e volta do timeout e fila do simulador ------------------------------

test('Encerrar -> Trocar estado -> Encerrar conserva o status CRM escolhido', () => {
  state.ambienteOrpen = { crm_status: [{ id: '4', name: 'Resolvido' }, { id: '5', name: 'Outro' }] };
  try {
    const bot = botCom({ TIMEOUT_ACTION: 'close', TIMEOUT_DESTINY: '5' });
    I.trocarAcaoTimeout(bot, 'bot');
    assert.equal(bot.TIMEOUT_DESTINY, '0');
    I.trocarAcaoTimeout(bot, 'close');
    assert.equal(bot.TIMEOUT_DESTINY, '5');
  } finally {
    state.ambienteOrpen = null;
  }
});

test('simulador: timeout de fila usa a fila escolhida no editor', async () => {
  const { criarSessao } = await js('simulador.js');
  const bot = botCom({ TIMEOUT_ACTION: 'queue', TIMEOUT_DESTINY: '', CONF_DELIVERY_QUEUE: 'VENDAS' });
  assert.equal(criarSessao(bot).bot.TIMEOUT_DESTINY, 'VENDAS');
});

// --- primeiro item como padrão nas ações de lista (paridade com o nativo) ----

const AMBIENTE_PADRAO = {
  agents: [{ id: '12', name: '[Agente] Maria' }, { id: '15', name: '[Agente] João' }],
  bots: [{ id: '77', name: '[Bot] Bot X' }],
  queues: [{ id: 'SUPORTE', name: '[SUPORTE] Suporte' }, { id: 'VENDAS', name: 'VENDAS' }],
  crm_status: [{ id: '4', name: 'Resolvido' }, { id: '9', name: 'Outro' }],
  scripts: [{ id: '81', name: 'Consulta CPF' }],
  checkpoints: [{ id: '3', name: 'Início' }],
  entrances: [{ id: 'WABA1', name: '[Whatsapp] WABA1' }],
  subStatus: [{ id: '20', name: 'Cliente desistiu' }],
};

const acaoMensagem = () => ({ ID: 'a1', TRANSITION_ID: 't1', ACTION_TYPE: '1', ACTION_DATA: { message_text: 'oi' } });

test('ações de lista nascem com o primeiro item do ambiente', () => {
  state.ambienteOrpen = AMBIENTE_PADRAO;
  try {
    const esperado = {
      '4': { destiny: '12' }, '5': { destiny: 'SUPORTE' }, '6': { crm_status: '4' }, '7': { script_name: '81' },
      '9': { check_point: '3' }, '12': { entrances: 'WABA1' }, '14': { substatus: '20' },
    };
    for (const [tipo, dados] of Object.entries(esperado)) {
      const bot = botCom({ BOT_ACTIONS: [acaoMensagem()] });
      I.mudarTipoAcao(bot, 't1', 'a1', tipo);
      for (const [campo, valor] of Object.entries(dados)) {
        assert.equal(bot.BOT_ACTIONS[0].ACTION_DATA[campo], valor, `ação ${tipo}.${campo}`);
      }
    }
  } finally {
    state.ambienteOrpen = null;
  }
});

test('Transf. Agente começa pelo primeiro agente, nunca por um bot', () => {
  state.ambienteOrpen = { ...AMBIENTE_PADRAO, agents: [] };
  try {
    assert.deepEqual(I.padraoDaAcao('4'), {});
  } finally {
    state.ambienteOrpen = null;
  }
});

test('sem o ambiente (modo avulso) a ação nasce em branco como antes', () => {
  state.ambienteOrpen = null;
  const bot = botCom({ BOT_ACTIONS: [acaoMensagem()] });
  I.mudarTipoAcao(bot, 't1', 'a1', '5');
  assert.equal(bot.BOT_ACTIONS[0].ACTION_DATA.destiny, '');
  assert.deepEqual(I.padraoDaAcao('1'), {});
});

// --- timeout: o que foi escolhido em cada ação volta na ida e volta ----------

test('Trocar estado -> Encerrar -> Trocar estado conserva o estado escolhido', () => {
  state.ambienteOrpen = { crm_status: [{ id: '4', name: 'Resolvido' }] };
  try {
    const bot = botCom({ TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '3' });
    I.trocarAcaoTimeout(bot, 'close');
    assert.equal(bot.TIMEOUT_DESTINY, '4');
    I.trocarAcaoTimeout(bot, 'bot');
    assert.equal(bot.TIMEOUT_DESTINY, '3');
  } finally {
    state.ambienteOrpen = null;
  }
});

test('Fila -> Encerrar -> Fila conserva a fila escolhida, mesmo depois de trocar duas vezes', () => {
  state.ambienteOrpen = { queues: [{ id: 'SUPORTE', name: 'SUPORTE' }, { id: 'VENDAS', name: 'VENDAS' }], crm_status: [{ id: '4', name: 'A' }] };
  try {
    const bot = botCom({ TIMEOUT_ACTION: 'queue', CONF_DELIVERY_QUEUE: 'VENDAS', TIMEOUT_DESTINY: '' });
    I.trocarAcaoTimeout(bot, 'close');
    I.trocarAcaoTimeout(bot, 'bot');
    I.trocarAcaoTimeout(bot, 'queue');
    assert.equal(bot.CONF_DELIVERY_QUEUE, 'VENDAS');
    assert.equal(bot.TIMEOUT_ACTION, 'queue');
  } finally {
    state.ambienteOrpen = null;
  }
});

test('estado lembrado que deixou de existir volta ao primeiro estado', () => {
  const bot = botCom({ TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '3' });
  I.trocarAcaoTimeout(bot, 'queue');
  bot.BOT_STATES = bot.BOT_STATES.filter((e) => e.STATE_NUMBER !== '3');
  I.trocarAcaoTimeout(bot, 'bot');
  assert.equal(bot.TIMEOUT_DESTINY, '0');
});

// --- ajustes da revisão final ------------------------------------------------

test('ação 12 começa pela primeira entrada na ordem do nativo, não pela do grupo', () => {
  state.ambienteOrpen = { entrances: [{ id: 'WA1', name: '[Whatsapp] WA1' }, { id: 'FB1', name: '[Facebook] FB1' }] };
  try {
    assert.deepEqual(I.padraoDaAcao('12'), { entrances: 'WA1' });
  } finally {
    state.ambienteOrpen = null;
  }
});

test('o estado lembrado do timeout acompanha a renumeração', () => {
  const bot = botCom({ TIMEOUT_ACTION: 'bot', TIMEOUT_DESTINY: '3' });
  I.trocarAcaoTimeout(bot, 'close');
  I.remapStateNumbers(bot, new Map([['3', '4'], ['1', '3']]));
  I.trocarAcaoTimeout(bot, 'bot');
  assert.equal(bot.TIMEOUT_DESTINY, '4');
});

test('backup com timeout de fila leva a fila também em TIMEOUT_DESTINY', async () => {
  const { botParaBackup } = await js('orpen-adapter.js');
  const bot = { TIMEOUT_ACTION: 'queue', TIMEOUT_DESTINY: '', CONF_DELIVERY_QUEUE: 'VENDAS', '7': '' };
  const copia = botParaBackup(bot);
  assert.equal(copia.TIMEOUT_DESTINY, 'VENDAS');
  assert.equal(copia['7'], 'VENDAS');
  assert.equal(bot.TIMEOUT_DESTINY, '', 'o bot do editor não é alterado');
  const outro = { TIMEOUT_ACTION: 'close', TIMEOUT_DESTINY: '4', CONF_DELIVERY_QUEUE: 'VENDAS' };
  assert.equal(botParaBackup(outro), outro);
});
