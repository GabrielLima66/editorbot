// Apoio dos testes do editor (node --test tests/editor/).
// - Stub mínimo de DOM: os módulos de js/ importam uns aos outros e alguns
//   tocam em `document` ao carregar; nada aqui renderiza de verdade.
// - Bots de exemplo: os do git (fluxograma/tests/fixtures) e, se existirem
//   nesta máquina, os bots reais de fluxograma/tests/golden_local/fixtures
//   (fora do git).
// - `servidorOrpen(body)`: simula o que ajax.php (updateBot) + Bot::update +
//   Bot::getBot fazem com o POST, lido do código da Orpen (somente leitura):
//   parse_str do PHP, `type == 0 → continue`, json_encode do data,
//   htmlspecialchars_decode na leitura, '' do Oracle virando NULL.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.document ??= {
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  createElement: () => ({}),
};
globalThis.window ??= globalThis;

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const js = (arquivo) => import(new URL(`file:///${path.join(raiz, 'js', arquivo).replace(/\\/g, '/')}`).href);

export function botsDeExemplo() {
  const pastas = [
    path.join(raiz, 'fluxograma', 'tests', 'fixtures'),
    path.join(raiz, 'fluxograma', 'tests', 'golden_local', 'fixtures'),
  ];
  return pastas
    .filter((p) => fs.existsSync(p))
    .flatMap((p) => fs.readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => path.join(p, f)))
    .map((arquivo) => ({ nome: path.basename(arquivo), bot: JSON.parse(fs.readFileSync(arquivo, 'utf8')) }))
    .filter(({ bot }) => Array.isArray(bot.BOT_STATES));
}

// ---- simulação do servidor

function parseStr(body) {
  const out = {};
  for (const par of body.split('&')) {
    const [k, v = ''] = par.split('=');
    const chave = decodeURIComponent(k);
    const valor = decodeURIComponent(v);
    const m = chave.match(/^([^[]+)((\[[^\]]*\])*)$/);
    const partes = [m[1], ...(m[2].match(/\[[^\]]*\]/g) || []).map((s) => s.slice(1, -1))];
    let o = out;
    partes.forEach((p, i) => {
      if (i === partes.length - 1) o[p] = valor;
      else {
        if (typeof o[p] !== 'object' || o[p] === null) o[p] = {};
        o = o[p];
      }
    });
  }
  return out;
}

const ehLista = (o) => Object.keys(o).every((k, i) => k === String(i));
const lista = (o) => (o && typeof o === 'object' ? Object.values(o) : []);

function phpJsonEncode(v) {
  if (v && typeof v === 'object') {
    if (ehLista(v) && Object.keys(v).length) return '[' + Object.values(v).map(phpJsonEncode).join(',') + ']';
    return '{' + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ':' + phpJsonEncode(x)).join(',') + '}';
  }
  return JSON.stringify(v).replace(/\//g, '\\/');
}

const htmlspecialcharsDecode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const oracle = (v) => (v === '' ? null : v);
const tipoZero = (t) => t !== '' && Number(t) === 0;

/**
 * POST do updateBot → resposta do getBot depois de gravar.
 * `perder` (opcional) recebe o getBot montado e pode remover itens, simulando
 * INSERT que falhou no servidor.
 */
export function servidorOrpen(body, perder) {
  const r = parseStr(body);
  const acao = r.timeout_action;
  const destino = acao === 'bot' ? r.timeout_bot_state : acao === 'queue' ? r.timeout_queue : acao === 'close' ? r.timeout_close_status : '';
  let id = 1000;
  const states = [];
  const transitions = [];
  for (const s of lista(r.states)) {
    states.push({ STATE: s.state_number, ALIAS: s.alias ?? '' });
    for (const t of lista(s.transitions)) {
      const tid = String(++id);
      const tr = { ID: tid, STATE: s.state_number, PRIORITY: String(t.priority), conditions: [], actions: [] };
      for (const c of lista(t.conditions)) {
        if (tipoZero(c.type)) continue;
        tr.conditions.push({ ID: String(++id), TRANSITION_ID: tid, CONDITION_TYPE: oracle(c.type), CONDITION_DATA: htmlspecialcharsDecode(phpJsonEncode(c.data)) });
      }
      for (const a of lista(t.actions)) {
        if (tipoZero(a.type)) continue;
        tr.actions.push({ ID: String(++id), TRANSITION_ID: tid, ACTION_TYPE: oracle(a.type), ACTION_DATA: htmlspecialcharsDecode(phpJsonEncode(a.data)) });
      }
      transitions.push(tr);
    }
  }
  states.sort((a, b) => a.STATE - b.STATE);
  transitions.sort((a, b) => a.STATE - b.STATE || a.PRIORITY - b.PRIORITY);
  const getBot = {
    ID: r.number,
    NAME: r.name,
    STATUS: oracle(r.status),
    TIME_ANSWER: oracle(r.time_answer_edit),
    TIMEOUT_DELAY: oracle(r.conf_time),
    CONF_DELIVERY_TIME: oracle(r.conf_time),
    CONF_DELIVERY_QUEUE: oracle(r.conf_queue),
    TIMEOUT_ACTION: oracle(acao),
    TIMEOUT_DESTINY: oracle(destino),
    TIMEOUT_MESSAGE: oracle(r.timeout_close_message),
    INTEGRATIONS: { audio_transcription_account: oracle(r.audio_transcription_account) },
    openai_accounts: [],
    states,
    transitions,
  };
  if (perder) perder(getBot);
  return getBot;
}

// ---- bot sintético para testes
// transicoes: [estado, prioridade, [[variavel, tipo, valor, extraDoCONDITION_DATA]], [[tipoAcao, ACTION_DATA]]]
let seq = 100;
export function botSintetico({ estados = ['0'], transicoes = [], timeout = {} } = {}) {
  const b = { BOT_STATES: estados.map((n, i) => ({ ID: String(i + 1), STATE_NUMBER: String(n), ALIAS: `E${n}` })), BOT_TRANSITIONS: [], BOT_CONDITIONS: [], BOT_ACTIONS: [], ...timeout };
  transicoes.forEach(([estado, prioridade, condicoes = [], acoes = []]) => {
    const tid = String(++seq);
    b.BOT_TRANSITIONS.push({ ID: tid, STATE: String(estado), PRIORITY: String(prioridade) });
    condicoes.forEach((c) => b.BOT_CONDITIONS.push({ ID: String(++seq), TRANSITION_ID: tid, CONDITION_TYPE: String(c[1]), CONDITION_DATA: { variable: c[0], value: c[2] ?? '', ...(c[3] || {}) } }));
    acoes.forEach((x) => b.BOT_ACTIONS.push({ ID: String(++seq), TRANSITION_ID: tid, ACTION_TYPE: String(x[0]), ACTION_DATA: x[1] || {} }));
  });
  return b;
}
