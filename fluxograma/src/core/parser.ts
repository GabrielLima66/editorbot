// Port de Fluxo BOT backend/core/parser.py (ver ORIGEM.md). Mensagens de
// erro identicas as do Python (testadas contra tests/golden/erros.json).
import { Bot, type Acao, type Condicao, type Dados, type Transicao } from "./modelo";
import { ehDict, htmlUnescape, pyInt, pyStr, pyTypeName, strip } from "./pythonCompat";

export class ParserError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ParserError";
  }
}

/** parse_json_aninhado: segundo parse de campos que sao string JSON. */
export function parseJsonAninhado(texto: string, contexto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch (e) {
    throw new ParserError(`${contexto}: JSON aninhado invalido: ${(e as Error).message}`);
  }
}

function campo(obj: Dados, nome: string, contexto: string): unknown {
  if (!Object.hasOwn(obj, nome)) throw new ParserError(`${contexto}: campo obrigatorio '${nome}' ausente`);
  return obj[nome];
}

/** obj.get(chave, padrao) do Python. */
export function get(obj: Dados, chave: string, padrao: unknown = null): unknown {
  return Object.hasOwn(obj, chave) ? obj[chave] : padrao;
}

function resolverDados(obj: Dados, chaveNomeada: string, contexto: string): Dados {
  const valor = get(obj, chaveNomeada);
  if (ehDict(valor)) return valor;
  if (valor === null || valor === "") {
    const bruto = get(obj, "3");
    if (typeof bruto === "string" && strip(bruto) !== "") {
      let parseado: unknown;
      try {
        parseado = JSON.parse(htmlUnescape(bruto));
      } catch (e) {
        throw new ParserError(
          `${contexto}: '${chaveNomeada}' (via chave numerica '3', apos desescapar ` +
            `entidades HTML) nao e JSON valido: ${(e as Error).message}`,
        );
      }
      if (!ehDict(parseado)) {
        throw new ParserError(
          `${contexto}: '${chaveNomeada}' (via chave numerica '3') parseou pra ` +
            `${pyTypeName(parseado)}, esperava objeto`,
        );
      }
      return parseado;
    }
    return {};
  }
  throw new ParserError(
    `${contexto}: '${chaveNomeada}' nao e objeto nem string JSON (tipo: ${pyTypeName(valor)})`,
  );
}

function lista(data: Dados, chave: string): Dados[] {
  const v = get(data, chave, []);
  return Array.isArray(v) ? (v as Dados[]) : [];
}

/** _montar_bot: recebe o objeto ja carregado (JSON exportado ou
 * state.botCarregado da extensao). */
export function montarBot(data: unknown): Bot {
  if (!ehDict(data)) {
    throw new ParserError(`raiz do JSON precisa ser um objeto, veio ${pyTypeName(data)}`);
  }

  const bot = new Bot(campo(data, "ID", "cabecalho do bot"), campo(data, "NAME", "cabecalho do bot"));

  const botStates = get(data, "BOT_STATES");
  if (!Array.isArray(botStates) || botStates.length === 0) throw new ParserError("BOT_STATES ausente ou vazio");

  for (const s of botStates as Dados[]) {
    const stateNumber = campo(s, "STATE_NUMBER", `BOT_STATES (id=${pyStr(get(s, "ID", "?"))})`);
    const estado = {
      id: campo(s, "ID", "BOT_STATES"),
      stateNumber,
      alias: campo(s, "ALIAS", `BOT_STATES (state_number=${pyStr(stateNumber)})`),
      transicoes: [] as Transicao[],
    };
    if (bot.estados.has(stateNumber)) {
      throw new ParserError(`BOT_STATES: STATE_NUMBER '${pyStr(stateNumber)}' duplicado`);
    }
    bot.estados.set(stateNumber, estado);
  }

  const transicoesPorId = new Map<unknown, Transicao>();
  for (const t of lista(data, "BOT_TRANSITIONS")) {
    const contexto = `BOT_TRANSITIONS (id=${pyStr(get(t, "ID", "?"))})`;
    const transicaoId = campo(t, "ID", contexto);
    const state = campo(t, "STATE", contexto);
    const estado = bot.estados.get(state);
    if (estado === undefined) {
      throw new ParserError(`${contexto}: STATE '${pyStr(state)}' nao existe em BOT_STATES (transicao orfa)`);
    }
    const prioridadeBruta = get(t, "PRIORITY", "0");
    let prioridade: number;
    try {
      prioridade = pyInt(prioridadeBruta);
    } catch {
      throw new ParserError(`${contexto}: PRIORITY '${pyStr(prioridadeBruta)}' nao e um inteiro`);
    }
    const transicao: Transicao = { id: transicaoId, state, priority: prioridade, condicoes: [], acoes: [] };
    if (transicoesPorId.has(transicaoId)) {
      throw new ParserError(`BOT_TRANSITIONS: ID '${pyStr(transicaoId)}' duplicado`);
    }
    transicoesPorId.set(transicaoId, transicao);
    estado.transicoes.push(transicao);
  }

  for (const c of lista(data, "BOT_CONDITIONS")) {
    const contexto = `BOT_CONDITIONS (id=${pyStr(get(c, "ID", "?"))})`;
    const transitionId = campo(c, "TRANSITION_ID", contexto);
    const transicao = transicoesPorId.get(transitionId);
    if (transicao === undefined) {
      throw new ParserError(`${contexto}: TRANSITION_ID '${pyStr(transitionId)}' nao existe em BOT_TRANSITIONS`);
    }
    const condicao: Condicao = {
      id: campo(c, "ID", contexto),
      transitionId,
      conditionType: campo(c, "CONDITION_TYPE", contexto),
      conditionData: resolverDados(c, "CONDITION_DATA", contexto),
    };
    transicao.condicoes.push(condicao);
  }

  const acoesPorTransicao = new Map<unknown, Acao[]>();
  for (const a of lista(data, "BOT_ACTIONS")) {
    const contexto = `BOT_ACTIONS (id=${pyStr(get(a, "ID", "?"))})`;
    const transitionId = campo(a, "TRANSITION_ID", contexto);
    if (!transicoesPorId.has(transitionId)) {
      throw new ParserError(`${contexto}: TRANSITION_ID '${pyStr(transitionId)}' nao existe em BOT_TRANSITIONS`);
    }
    const acao: Acao = {
      id: campo(a, "ID", contexto),
      transitionId,
      actionType: campo(a, "ACTION_TYPE", contexto),
      actionData: resolverDados(a, "ACTION_DATA", contexto),
    };
    if (!acoesPorTransicao.has(transitionId)) acoesPorTransicao.set(transitionId, []);
    acoesPorTransicao.get(transitionId)!.push(acao);
  }

  for (const [transitionId, acoes] of acoesPorTransicao) {
    let chaves: number[];
    try {
      chaves = acoes.map((ac) => pyInt(ac.id));
    } catch {
      throw new ParserError(
        `BOT_ACTIONS (transition_id=${pyStr(transitionId)}): ID de acao nao numerico, ` +
          `nao foi possivel ordenar por ordem de execucao`,
      );
    }
    // sort estavel por chave, como list.sort(key=...) do Python
    const ordenadas = acoes.map((acao, i) => ({ acao, chave: chaves[i] })).sort((x, y) => x.chave - y.chave);
    transicoesPorId.get(transitionId)!.acoes = ordenadas.map((o) => o.acao);
  }

  return bot;
}
