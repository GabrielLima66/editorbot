// ---------------------------------------------------------------------------
// Ação 23 "Enviar Flow (WhatsApp)" (PRD-2594 da Orpen): envia um formulário
// do WhatsApp (Flow da Gupshup) e pausa o atendimento até a resposta.
// Referência: bot.php da branch PRD-2594 (createAction case 23, coleta do
// salvar, flowLoadList/flowLoadDetail, registerFlowVariables,
// flowEstimatedSize) e ajax.php (getWhatsappFlows, getWhatsappFlowDetail).
//
// As regras são puras (testadas em tests/editor/flows.test.mjs); as duas
// chamadas ao ajax.php ficam no fim e só rodam quando a pessoa troca a rota,
// escolhe um Flow ou clica em Recarregar, como no nativo: getWhatsappFlows
// também cria/reativa a assinatura de respostas na Gupshup, então nunca é
// chamado só por abrir o bot.
// ---------------------------------------------------------------------------

export const TIPO_FLOW = '23';
export const LIMITE_TAMANHO_FLOW = 3500;

// Ordem e chaves exatamente como o nativo grava (bot.php, case 23 do salvar).
export const CHAVES_FLOW = ['flow_entrance', 'flow_id', 'flow_name', 'flow_mode', 'flow_screen', 'flow_variables', 'flow_text', 'flow_cta', 'callback_state', 'fallback_state', 'timeout'];

const MSG = {
  obrigatorios: 'preencha a rota, o Flow, o texto e o botão. Se o Flow foi escolhido, aguarde carregar a tela inicial ou clique em Recarregar.',
  estados: 'escolha o estado de retorno e o estado de não resposta. Se um deles aparece vazio, o estado escolhido antes foi apagado.',
  timeout: 'o tempo limite aceita só números inteiros de até 6 dígitos, sem ponto, vírgula ou sinal. Deixe vazio para usar o padrão de 600s.',
  grande: 'a ação ficou grande demais para salvar. Diminua o texto da mensagem.',
};

const txt = (v) => (v === undefined || v === null ? '' : String(v));

/** ACTION_DATA no formato do nativo: as 11 chaves, na ordem dele, flow_mode só draft|published. */
export function normalizarDadosFlow(d = {}) {
  const out = {};
  CHAVES_FLOW.forEach((k) => { out[k] = txt(d[k]); });
  out.flow_mode = out.flow_mode === 'draft' ? 'draft' : 'published';
  return out;
}

/** ACTION_DATA de uma ação nova: igual ao formulário nativo vazio. */
export function dadosFlowNovos({ cta = 'Preencher formulário', timeout = '600', estado = '' } = {}) {
  return normalizarDadosFlow({ flow_cta: cta, timeout, callback_state: estado, fallback_state: estado });
}

/**
 * Ao abrir o bot, botão ou tempo limite gravados vazios mostram o padrão do
 * formulário, que o nativo grava no salvar seguinte (bot.php da PRD-2594:
 * só sobrescreve o campo pré-preenchido quando o valor salvo não é vazio).
 */
export function completarPadroesFlow(bot, { cta = 'Preencher formulário', timeout = '600' } = {}) {
  (bot?.BOT_ACTIONS || []).forEach((a) => {
    if (String(a.ACTION_TYPE) !== TIPO_FLOW) return;
    const d = a.ACTION_DATA || {};
    a.ACTION_DATA = { ...d, flow_cta: txt(d.flow_cta) === '' ? cta : d.flow_cta, timeout: txt(d.timeout) === '' ? timeout : d.timeout };
  });
}

/** Trocar a rota esvazia o Flow escolhido (nativo: flowClearSelection). */
export function limparSelecaoFlow(d) {
  return { ...d, flow_id: '', flow_name: '', flow_mode: 'published', flow_screen: '', flow_variables: '' };
}

/** Nome de variável como o nativo registra (sanitizeFlowVariableName). */
export function sanitizarNomeVariavelFlow(nome) {
  return txt(nome).replace(/[^A-Za-z0-9_]/g, '');
}

/** Nomes das variáveis de retorno de um CSV de flow_variables (já saneados, sem repetir). */
export function nomesVariaveisFlow(csv) {
  const vistos = new Set();
  txt(csv).split(',').forEach((n) => {
    const nome = sanitizarNomeVariavelFlow(n.trim());
    if (nome) vistos.add(nome);
  });
  return [...vistos];
}

/** Variáveis {$flow_<campo>} que as ações 23 do bot oferecem (nativo: prescanFlowVariables). */
export function variaveisFlowDoBot(bot) {
  const nomes = new Set();
  (bot?.BOT_ACTIONS || []).forEach((a) => {
    if (String(a.ACTION_TYPE) !== TIPO_FLOW) return;
    nomesVariaveisFlow(a.ACTION_DATA?.flow_variables).forEach((n) => nomes.add(n));
  });
  return [...nomes].map((n) => ({ value: `flow_${n}`, label: `Flow: ${n}` }));
}

/** Texto da linha "Variáveis de retorno do Flow" (nativo: flowShowVariables). */
export function textoVariaveisFlow(csv) {
  const nomes = txt(csv).split(',').map((n) => n.trim()).filter(Boolean);
  if (!nomes.length) return 'Nenhuma variável encontrada no Flow.';
  return nomes.map((n) => `{$flow_${n}}`).join(', ');
}

/** Tamanho que o nativo estima para o action_data (6 por caractere fora do ASCII). */
export function tamanhoEstimadoFlow(d) {
  const json = JSON.stringify(normalizarDadosFlow(d));
  let tamanho = 0;
  for (let i = 0; i < json.length; i++) tamanho += json.charCodeAt(i) > 127 ? 6 : 1;
  return tamanho;
}

/** Primeira trava do nativo que a ação não passa (texto para "…na ação X, <msg>"), ou null. */
export function problemaDoFlow(dados) {
  const d = normalizarDadosFlow(dados);
  if (!d.flow_entrance || !d.flow_id || !d.flow_screen || !d.flow_text.trim() || !d.flow_cta.trim()) return MSG.obrigatorios;
  if (!d.callback_state || !d.fallback_state) return MSG.estados;
  if (d.timeout !== '' && !/^\d{1,6}$/.test(d.timeout)) return MSG.timeout;
  if (tamanhoEstimadoFlow(d) >= LIMITE_TAMANHO_FLOW) return MSG.grande;
  return null;
}

// ---- chamadas ao ajax.php (mesmas do nativo) -------------------------------

const MSG_ERRO_CARGA = 'Não foi possível carregar os Flows desta rota.';
const MSG_SEM_CREDENCIAIS = 'A rota não tem as credenciais da Gupshup configuradas.';
export const MSG_ASSINATURA = 'Não foi possível confirmar a assinatura de respostas de Flow na Gupshup. Enquanto ela não for confirmada, as respostas podem não chegar. Salve o bot de novo para tentar outra vez.';

/** Mensagem de erro de getWhatsappFlows/getWhatsappFlowDetail (o código vem em message, com HTTP 400). */
export function mensagemErroFlow(codigo) {
  return codigo === 'flow_route_without_credentials' ? MSG_SEM_CREDENCIAIS : MSG_ERRO_CARGA;
}

/** Item da lista de Flows como o select nativo: rascunho marcado, status em maiúsculas. */
export function opcaoDoFlow(flow) {
  const status = txt(flow?.status).toUpperCase();
  const nome = txt(flow?.name);
  const rascunho = status === 'DRAFT';
  return { value: txt(flow?.id), nome, rascunho, label: `${nome || txt(flow?.id)}${rascunho ? ' (rascunho)' : ''}` };
}

async function postarAjax(campos) {
  const body = Object.entries(campos).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  let res;
  try {
    res = await fetch('ajax.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body,
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    return { ok: false, erro: MSG_ERRO_CARGA };
  }
  let json = null;
  try { json = await res.json(); } catch { /* fora de JSON */ }
  if (res.ok && json && json.status === 'success') return { ok: true, json };
  return { ok: false, erro: mensagemErroFlow(json?.message) };
}

/** Flows da rota: { ok, flows: [opcaoDoFlow], assinaturaFalhou } ou { ok: false, erro }. */
export async function buscarFlowsDaRota(entradaId) {
  const r = await postarAjax({ action: 'getWhatsappFlows', entrance_id: entradaId });
  if (!r.ok) return r;
  const flows = Array.isArray(r.json.flows) ? r.json.flows.map(opcaoDoFlow) : [];
  return { ok: true, flows, assinaturaFalhou: r.json.subscription === 'failed' };
}

/** Tela inicial e variáveis de retorno do Flow: { ok, tela, variaveis } ou { ok: false, erro }. */
export async function buscarDetalheDoFlow(entradaId, flowId) {
  const r = await postarAjax({ action: 'getWhatsappFlowDetail', entrance_id: entradaId, flow_id: flowId });
  if (!r.ok) return r;
  return { ok: true, tela: txt(r.json.screen), variaveis: txt(r.json.variables) };
}

// ---- memória da tela (sobrevive aos redesenhos da transição) ---------------

// Lista carregada por rota e a linha de status de cada ação, como as do
// formulário nativo. O status é preso ao objeto da ação (não ao ID, que é
// reaproveitado quando a última ação é excluída). As duas são zeradas quando
// outro bot é aberto; os redesenhos do mesmo bot as mantêm.
export const memoriaFlows = { listas: new Map(), status: new WeakMap() };
let botDaMemoria = null;

export function limparMemoriaFlows(bot = null) {
  if (bot && bot === botDaMemoria) return;
  botDaMemoria = bot;
  memoriaFlows.listas.clear();
  memoriaFlows.status = new WeakMap();
}
