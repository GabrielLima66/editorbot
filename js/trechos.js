// ---------------------------------------------------------------------------
// Copiar partes de um bot e colar em outro (estados inteiros ou transições).
//
// Módulo puro: não toca em DOM nem em chrome.storage. extrairTrecho devolve um
// objeto serializável (vai pro chrome.storage.local) e colarTrecho mexe só no
// bot que recebe — em memória, nada é salvo na Orpen até o usuário salvar.
//
// Regras que não podem se perder:
//  - IDs e chaves espelhadas ("0","1",... iguais às nomeadas) guardados no
//    trecho NÃO são confiáveis: ao colar, tudo ganha ID novo (nextId) e as
//    chaves espelhadas são refeitas (withMirrors). O servidor refaz os IDs ao
//    salvar de qualquer jeito (updateBot).
//  - Número de estado dentro de uma ação (CAMPOS_ESTADO_POR_TIPO): o que
//    aponta para um estado que veio junto é remapeado; o que aponta para um
//    estado que NÃO veio ficaria apontando para outro estado do bot de
//    destino sem nenhum sinal, então é esvaziado e devolvido em `soltas`.
//  - Estados colados entram no FIM da numeração: nenhum estado existente
//    muda de número (o aviso de renumeração não dispara e o estado 0, que é a
//    entrada do bot, continua o mesmo).
// ---------------------------------------------------------------------------
import { CAMPOS_ESTADO_POR_TIPO, CAMPOS_PENDENCIA_POR_TIPO, VARIABLE_KIND } from './dictionaries.js';
import { withMirrors, nextId, remapStateNumbers } from './bot-view-interactions.js';
import { fotografarNumeros, mudancasDeNumero } from './renumeracao.js';

export const FORMATO_TRECHO = 'editorbot-trecho/1';

const clone = (x) => JSON.parse(JSON.stringify(x));

// Linha sem as chaves espelhadas numéricas ("0", "1", ...).
function semEspelhos(linha) {
  const out = {};
  Object.keys(linha).forEach((k) => { if (!/^\d+$/.test(k)) out[k] = clone(linha[k]); });
  return out;
}

const porNumero = (a, b) => parseInt(a, 10) - parseInt(b, 10);

/**
 * Copia estados inteiros (`{ estados: ['3','4'] }`) ou transições de UM estado
 * (`{ transicoes: ['12','15'] }`) do bot carregado. Não altera o bot.
 * `origem`: { host, botId, botNome } de quem chama (a página sabe, o módulo não).
 */
export function extrairTrecho(bot, selecao, origem = {}) {
  const estadosBot = bot.BOT_STATES || [];
  const transicoesBot = bot.BOT_TRANSITIONS || [];
  let estados = [];
  let transicoes = [];
  let tipo;
  let estadoOrigem = null;

  if (selecao.estados) {
    tipo = 'estados';
    const alvo = new Set(selecao.estados.map(String));
    estados = estadosBot.filter((s) => alvo.has(s.STATE_NUMBER));
    transicoes = transicoesBot.filter((t) => alvo.has(t.STATE));
  } else if (selecao.transicoes) {
    tipo = 'transicoes';
    const alvo = new Set(selecao.transicoes.map(String));
    transicoes = transicoesBot.filter((t) => alvo.has(t.ID));
    const estadosDasTransicoes = new Set(transicoes.map((t) => t.STATE));
    if (estadosDasTransicoes.size > 1) throw new Error('As transições copiadas precisam ser do mesmo estado.');
    estadoOrigem = transicoes[0]?.STATE ?? null;
  } else {
    throw new Error('Nada selecionado para copiar.');
  }
  if (!estados.length && !transicoes.length) throw new Error('Nada encontrado para copiar.');

  const ids = new Set(transicoes.map((t) => t.ID));
  return {
    formato: FORMATO_TRECHO,
    tipo,
    estadoOrigem,
    origem: { host: origem.host ?? '', botId: origem.botId ?? '', botNome: origem.botNome ?? '', quando: Date.now() },
    // Número e nome de TODOS os estados do bot de origem: ao colar no mesmo bot,
    // uma referência a estado que não foi copiado só vale se o estado ainda for o mesmo.
    indice: estadosBot.map((s) => ({ numero: String(s.STATE_NUMBER), alias: s.ALIAS || '', id: String(s.ID ?? '') })),
    linhas: {
      estados: estados.map(semEspelhos),
      transicoes: transicoes.map(semEspelhos),
      condicoes: (bot.BOT_CONDITIONS || []).filter((c) => ids.has(c.TRANSITION_ID)).map(semEspelhos),
      acoes: (bot.BOT_ACTIONS || []).filter((a) => ids.has(a.TRANSITION_ID)).map(semEspelhos),
    },
  };
}

export function trechoValido(trecho) {
  return !!trecho && trecho.formato === FORMATO_TRECHO && (trecho.tipo === 'estados' || trecho.tipo === 'transicoes')
    && !!trecho.linhas && Array.isArray(trecho.linhas.transicoes) && Array.isArray(trecho.linhas.estados);
}

const vazio = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
const ehVariavel = (v) => typeof v === 'string' && /^\{\$[^}]+\}$/.test(v.trim());

// Esvazia o que só existe no ambiente de origem (fila, agente, anexo, conta
// OpenAI...). Mesma lista que alimenta a tela de pendências (listarPendencias):
// os campos esvaziados aparecem lá sozinhos.
function esvaziarAmbienteAcao(a, relatorio, transitionId) {
  const d = a.ACTION_DATA;
  if (!d) return;
  const campos = [...(CAMPOS_PENDENCIA_POR_TIPO[a.ACTION_TYPE] || [])];
  campos.forEach(([campo]) => {
    // {$variável} (a ação 4 aceita) não é ID de cadastro: vale em qualquer ambiente.
    if (!vazio(d[campo]) && !ehVariavel(d[campo])) { d[campo] = ''; relatorio.push({ transitionId, itemId: a.ID, tipoItem: 'Ação', campo }); }
  });
  if (a.ACTION_TYPE === '16' && Array.isArray(d.labels) && d.labels.length) {
    d.labels = [];
    relatorio.push({ transitionId, itemId: a.ID, tipoItem: 'Ação', campo: 'labels' });
  }
}

function esvaziarAmbienteCondicao(c, relatorio, transitionId) {
  const d = c.CONDITION_DATA || {};
  const tipoDaVariavel = VARIABLE_KIND[d.variable] || '';
  // Nas variáveis de cadastro (fila, agente, entrada, calendário, status CRM) o
  // ID fica em CONDITION_TYPE, no lugar do operador.
  if (tipoDaVariavel.startsWith('ref_') && !vazio(c.CONDITION_TYPE)) {
    c.CONDITION_TYPE = '';
    relatorio.push({ transitionId, itemId: c.ID, tipoItem: 'Condição', campo: 'cadastro' });
  }
  if (String(c.CONDITION_TYPE) === '18' && d.assistant_id === undefined && !vazio(d.value)) {
    d.value = [];
    relatorio.push({ transitionId, itemId: c.ID, tipoItem: 'Condição', campo: 'labels' });
  }
  if (d.assistant_id !== undefined && !vazio(d.assistant_id)) {
    d.assistant_id = '';
    relatorio.push({ transitionId, itemId: c.ID, tipoItem: 'Condição', campo: 'assistant_id' });
  }
}

// O estado `valor` do bot de origem ainda existe, com o mesmo nome, neste bot
// (que é o mesmo da origem)? `deslocamento` leva em conta o que já subiu de número.
function estadoContinuaIgual(bot, trecho, valor, deslocamento) {
  const origem = (trecho.indice || []).find((e) => e.numero === String(valor));
  if (!origem) return false;
  const numeroAgora = deslocamento.get(String(valor)) ?? String(valor);
  const atual = bot.BOT_STATES.find((s) => s.STATE_NUMBER === numeroAgora);
  // O ID da linha não muda ao arrastar/renumerar: pega o caso de dois estados com o mesmo nome ("Novo Estado").
  return !!atual && (atual.ALIAS || '') === origem.alias && (!origem.id || String(atual.ID) === origem.id);
}

/**
 * Cola o trecho no bot (mutando-o). Opções:
 *  - estadoDestino: obrigatório para trechos de transições (STATE que as recebe);
 *  - depoisDe: número do estado depois do qual os estados colados entram (os de
 *    número maior sobem); sem ele entram no fim e ninguém é renumerado;
 *  - mesmoBot: o trecho veio deste mesmo bot (referências a estados não copiados
 *    que continuam iguais são mantidas em vez de esvaziadas);
 *  - esvaziarAmbiente: true quando o bot de destino é de outro domínio.
 * Devolve { estadosNovos, transicoesNovas, soltas, ambiente }.
 *  - soltas: referências a estado que não veio junto (esvaziadas);
 *  - ambiente: campos de cadastro esvaziados (só com esvaziarAmbiente).
 */
export function colarTrecho(bot, trecho, { estadoDestino, esvaziarAmbiente = false, depoisDe = null, mesmoBot = false } = {}) {
  if (!trechoValido(trecho)) throw new Error('Trecho inválido.');
  const { linhas } = trecho;
  bot.BOT_STATES = bot.BOT_STATES || [];
  bot.BOT_TRANSITIONS = bot.BOT_TRANSITIONS || [];
  bot.BOT_CONDITIONS = bot.BOT_CONDITIONS || [];
  bot.BOT_ACTIONS = bot.BOT_ACTIONS || [];

  // Mapa número de estado do trecho -> número no bot de destino.
  const mapa = new Map();
  // Estados do bot de destino que mudam de número (só ao colar no meio da lista).
  const deslocamento = new Map();
  const estadosNovos = [];
  if (trecho.tipo === 'estados') {
    const ordenados = [...linhas.estados].sort((a, b) => porNumero(a.STATE_NUMBER, b.STATE_NUMBER));
    const k = ordenados.length;
    let proximo;
    let posicao = bot.BOT_STATES.length; // onde entram no array
    if (depoisDe === null || depoisDe === undefined || depoisDe === '') {
      proximo = bot.BOT_STATES.reduce((m, s) => Math.max(m, parseInt(s.STATE_NUMBER, 10) || 0), -1) + 1;
    } else {
      const n = parseInt(depoisDe, 10);
      const indiceBase = bot.BOT_STATES.findIndex((s) => s.STATE_NUMBER === String(depoisDe));
      if (!Number.isInteger(n) || String(n) !== String(depoisDe) || indiceBase === -1) throw new Error('Estado de referência não existe neste bot.');
      // Primeiro abre espaço: tudo que é maior que N sobe k casas (e tudo que
      // aponta pra esses estados, inclusive o timeout, é reescrito). Só depois
      // entram os estados colados, com mapa próprio aplicado só neles.
      bot.BOT_STATES.forEach((s) => {
        const num = parseInt(s.STATE_NUMBER, 10);
        if (String(num) === s.STATE_NUMBER && num > n) deslocamento.set(s.STATE_NUMBER, String(num + k));
      });
      remapStateNumbers(bot, deslocamento);
      proximo = n + 1;
      posicao = indiceBase + 1;
    }
    ordenados.forEach((s) => {
      const novoNumero = String(proximo++);
      mapa.set(s.STATE_NUMBER, novoNumero);
      bot.BOT_STATES.splice(posicao++, 0, withMirrors('state', { ...clone(s), ID: nextId(bot.BOT_STATES), STATE_NUMBER: novoNumero }));
      estadosNovos.push(novoNumero);
    });
  } else {
    const destino = String(estadoDestino ?? '');
    if (!bot.BOT_STATES.some((s) => s.STATE_NUMBER === destino)) throw new Error('Estado de destino não existe neste bot.');
    // Referência ao estado de onde a transição saiu = "este mesmo estado".
    if (trecho.estadoOrigem !== null && trecho.estadoOrigem !== undefined) mapa.set(String(trecho.estadoOrigem), destino);
  }

  const soltas = [];
  const ambiente = [];
  const transicoesNovas = [];
  const novoDaTransicao = new Map();

  // Transições de cada estado entram na ordem original de PRIORITY.
  [...linhas.transicoes].sort((a, b) => porNumero(a.PRIORITY, b.PRIORITY)).forEach((t) => {
    const novoId = nextId(bot.BOT_TRANSITIONS);
    const estado = trecho.tipo === 'estados' ? mapa.get(t.STATE) : String(estadoDestino);
    let prioridade = t.PRIORITY;
    if (trecho.tipo === 'transicoes') {
      prioridade = String(bot.BOT_TRANSITIONS.filter((x) => x.STATE === estado)
        .reduce((m, x) => Math.max(m, parseInt(x.PRIORITY, 10) || 0), -1) + 1);
    }
    bot.BOT_TRANSITIONS.push(withMirrors('transition', { ...clone(t), ID: novoId, STATE: estado, PRIORITY: prioridade }));
    novoDaTransicao.set(t.ID, novoId);
    transicoesNovas.push(novoId);
  });

  // A Orpen lê condições e ações por ORDER BY id (= ordem de inserção): cola na ordem de ID da origem.
  const porId = (a, b) => parseInt(a.ID, 10) - parseInt(b.ID, 10);

  [...linhas.condicoes].sort(porId).forEach((c) => {
    const nova = withMirrors('condition', { ...clone(c), ID: nextId(bot.BOT_CONDITIONS), TRANSITION_ID: novoDaTransicao.get(c.TRANSITION_ID) });
    if (esvaziarAmbiente) esvaziarAmbienteCondicao(nova, ambiente, nova.TRANSITION_ID);
    withMirrors('condition', nova);
    bot.BOT_CONDITIONS.push(nova);
  });

  [...linhas.acoes].sort(porId).forEach((a) => {
    const nova = withMirrors('action', { ...clone(a), ID: nextId(bot.BOT_ACTIONS), TRANSITION_ID: novoDaTransicao.get(a.TRANSITION_ID) });
    (CAMPOS_ESTADO_POR_TIPO[nova.ACTION_TYPE] || []).forEach((campo) => {
      const valor = nova.ACTION_DATA?.[campo];
      // {$variável} é resolvida pelo motor em tempo de execução (Bot.class.php:1250): vale em qualquer bot.
      if (vazio(valor) || ehVariavel(valor)) return;
      if (mapa.has(valor)) { nova.ACTION_DATA[campo] = mapa.get(valor); return; }
      // Mesmo bot e o estado continua sendo o mesmo (mesmo nome): a referência vale
      // (acompanhando o deslocamento, se houve). Em outro bot, apontaria pra outro estado.
      if (mesmoBot && estadoContinuaIgual(bot, trecho, valor, deslocamento)) { nova.ACTION_DATA[campo] = deslocamento.get(valor) ?? valor; return; }
      nova.ACTION_DATA[campo] = '';
      soltas.push({ transitionId: nova.TRANSITION_ID, actionId: nova.ID, campo, valorOriginal: valor });
    });
    if (esvaziarAmbiente) esvaziarAmbienteAcao(nova, ambiente, nova.TRANSITION_ID);
    bot.BOT_ACTIONS.push(nova);
  });

  return { estadosNovos, transicoesNovas, soltas, ambiente, deslocados: [...deslocamento].map(([de, para]) => ({ de, para })) };
}

const numerica = (n) => String(parseInt(n, 10)) === String(n);

/** Problemas de consistência dos estados (números repetidos, referências soltas, timeout). */
export function problemasDeEstados(bot) {
  const out = [];
  const vistos = new Set();
  (bot.BOT_STATES || []).forEach((s) => {
    const n = String(s.STATE_NUMBER);
    if (vistos.has(n)) out.push(`Número de estado repetido: ${n}.`);
    vistos.add(n);
  });
  (bot.BOT_TRANSITIONS || []).forEach((t) => {
    if (!vistos.has(String(t.STATE))) out.push(`Transição ${t.ID} está no estado ${t.STATE}, que não existe.`);
  });
  (bot.BOT_ACTIONS || []).forEach((a) => {
    (CAMPOS_ESTADO_POR_TIPO[a.ACTION_TYPE] || []).forEach((campo) => {
      const v = a.ACTION_DATA?.[campo];
      if (!vazio(v) && !ehVariavel(v) && !vistos.has(String(v))) out.push(`Ação ${a.ID} aponta para o estado ${v}, que não existe.`);
    });
  });
  if (bot.TIMEOUT_ACTION === 'bot' && !vazio(bot.TIMEOUT_DESTINY) && !vistos.has(String(bot.TIMEOUT_DESTINY))) {
    out.push(`O timeout aponta para o estado ${bot.TIMEOUT_DESTINY}, que não existe.`);
  }
  return out;
}

const contiguo = (bot) => {
  const nums = (bot.BOT_STATES || []).map((s) => s.STATE_NUMBER);
  return nums.length > 0 && nums.every(numerica) && nums.map(Number).sort((a, b) => a - b).every((n, i) => n === i);
};

/**
 * Ensaia a colagem numa cópia do bot e diz se é seguro: números únicos, nenhuma
 * referência nova solta, estado 0 (entrada) intacto, numeração sem buracos (se
 * não tinha) e estados em ordem. `bot` não é alterado.
 * Devolve { ok, erros, resultado, mudancas } — `mudancas` no formato de
 * mudancasDeNumero (só os estados que já existiam e mudaram de número).
 */
export function simularColagem(bot, trecho, opcoes = {}) {
  const copia = clone(bot);
  const problemasAntes = new Set(problemasDeEstados(copia));
  const foto = fotografarNumeros(copia);
  const entradaAntes = (copia.BOT_STATES || []).find((s) => String(s.STATE_NUMBER) === '0');
  const eraContiguo = contiguo(copia);
  let resultado;
  try {
    resultado = colarTrecho(copia, trecho, opcoes);
  } catch (e) {
    return { ok: false, erros: [e.message], resultado: null, mudancas: null };
  }
  const erros = problemasDeEstados(copia).filter((p) => !problemasAntes.has(p));
  const entradaDepois = (copia.BOT_STATES || []).find((s) => String(s.STATE_NUMBER) === '0');
  if (entradaAntes && entradaAntes !== entradaDepois) erros.push('O estado 0, onde toda conversa nova começa, mudaria.');
  if (eraContiguo && !contiguo(copia)) erros.push('A numeração dos estados deixaria de ser seguida, sem buracos.');
  const ordem = (copia.BOT_STATES || []).map((s) => parseInt(s.STATE_NUMBER, 10)).filter((n) => !Number.isNaN(n));
  if (ordem.some((n, i) => i > 0 && n < ordem[i - 1])) erros.push('Os estados ficariam fora de ordem.');
  return { ok: erros.length === 0, erros, resultado, mudancas: mudancasDeNumero(copia, foto) };
}
