// Port de Fluxo BOT backend/core/rotulos.py - so o que o pipeline do
// fluxograma usa (ver ORIGEM.md).
import { rotuloConditionType } from "./dicionarios";
import type { Grafo } from "./grafo";
import { getOuVazio, listaOuVazia } from "./mensagens";
import type { Acao, Bot, Condicao } from "./modelo";
import { ParserError, get, parseJsonAninhado } from "./parser";
import { PY_WS_CLASSE, ehDict, pyStr, pyTruthy, splitlines, strip } from "./pythonCompat";

export const FONTE_MENU_INTERATIVO = "menu_interativo";
export const FONTE_TEXTO_REGEX = "texto_regex";
export const FONTE_NAO_RESOLVIDO = "nao_resolvido";

// ^\*?(\d+)\*?\s*[-–—)\.]\s*(.+)$ do Python: \d e \s Unicode no Python;
// no JS viram \p{Nd} e a classe de espaco do Python (o \s do JS aceita
// U+FEFF (BOM) e nao aceita \x1c-\x1f/\x85).
const RE_LINHA_MENU = new RegExp(`^\\*?(\\p{Nd}+)\\*?${PY_WS_CLASSE}*[-–—)\\.]${PY_WS_CLASSE}*(.+)$`, "u");

export interface RotuloOpcao {
  condicaoId: unknown;
  valorBruto: string;
  rotulo: string;
  fonte: string;
  variacoes: number;
  conditionType: unknown;
}

/** Chaves do mapa sao o valor cru (id do botao pode vir numero no JSON e ai
 * nao casa com o value string da condicao - igual ao dict do Python). */
type MapaOpcoes = Map<unknown, unknown>;

function mapaDeMenuInterativo(acao: Acao): MapaOpcoes {
  const mapa: MapaOpcoes = new Map();
  const bruto = acao.actionData.message_option_text;
  if (typeof bruto !== "string" || strip(bruto) === "") return mapa;
  let obj: unknown;
  try {
    obj = parseJsonAninhado(bruto, `BOT_ACTIONS (id=${pyStr(acao.id)}): message_option_text`);
  } catch (e) {
    if (e instanceof ParserError) return mapa;
    throw e;
  }
  if (!ehDict(obj)) return mapa;
  const action = getOuVazio(obj.interactive, "action");
  for (const botao of listaOuVazia(getOuVazio(action, "buttons"))) {
    const reply = getOuVazio(botao, "reply");
    const id = getOuVazio(reply, "id");
    const titulo = getOuVazio(reply, "title");
    if (pyTruthy(id) && pyTruthy(titulo)) mapa.set(id, titulo);
  }
  for (const secao of listaOuVazia(getOuVazio(action, "sections"))) {
    for (const linha of listaOuVazia(getOuVazio(secao, "rows"))) {
      const id = getOuVazio(linha, "id");
      const titulo = getOuVazio(linha, "title");
      if (pyTruthy(id) && pyTruthy(titulo)) mapa.set(id, titulo);
    }
  }
  return mapa;
}

function mapaDeTextoPuro(acao: Acao): MapaOpcoes {
  const mapa: MapaOpcoes = new Map();
  const texto = acao.actionData.message_text;
  if (typeof texto !== "string") return mapa;
  for (const linha of splitlines(texto)) {
    const m = RE_LINHA_MENU.exec(strip(linha));
    if (m) mapa.set(m[1], strip(m[2]));
  }
  return mapa;
}

export function mapaOpcoesEstado(bot: Bot, grafo: Grafo, stateNumber: string): [MapaOpcoes, string] {
  const predecessores = grafo.predecessores(stateNumber);

  for (const aresta of predecessores) {
    const transicao = bot.transicaoPorId(aresta.transicaoId);
    if (transicao === undefined) continue;
    const acaoMenu = transicao.acoes.find((a) => a.actionType === "10");
    if (acaoMenu !== undefined) {
      const mapa = mapaDeMenuInterativo(acaoMenu);
      if (mapa.size > 0) return [mapa, FONTE_MENU_INTERATIVO];
    }
  }

  for (const aresta of predecessores) {
    const transicao = bot.transicaoPorId(aresta.transicaoId);
    if (transicao === undefined) continue;
    const acaoTexto = transicao.acoes.find((a) => a.actionType === "1");
    if (acaoTexto !== undefined) {
      const mapa = mapaDeTextoPuro(acaoTexto);
      if (mapa.size > 0) return [mapa, FONTE_TEXTO_REGEX];
    }
  }

  return [new Map(), FONTE_NAO_RESOLVIDO];
}

export function rotularCondicao(condicao: Condicao, mapa: MapaOpcoes, fonteMapa: string): RotuloOpcao {
  const valor = get(condicao.conditionData, "value", "");
  const valores = typeof valor === "string" ? valor.split("\n").filter((v) => v !== "") : [];
  if (valores.length === 0) {
    return {
      condicaoId: condicao.id,
      valorBruto: "",
      rotulo: "",
      fonte: FONTE_NAO_RESOLVIDO,
      variacoes: 0,
      conditionType: condicao.conditionType,
    };
  }
  const primeiro = valores[0];
  const rotulo = mapa.get(primeiro);
  const resolvido = pyTruthy(rotulo);
  return {
    condicaoId: condicao.id,
    valorBruto: primeiro,
    rotulo: resolvido ? (rotulo as string) : primeiro,
    fonte: resolvido ? fonteMapa : FONTE_NAO_RESOLVIDO,
    variacoes: valores.length - 1,
    conditionType: condicao.conditionType,
  };
}

export function ehCondicaoDeOpcao(condicao: Condicao): boolean {
  const dados = condicao.conditionData;
  return (
    dados.variable === "message" &&
    (condicao.conditionType === "1" || condicao.conditionType === "2") &&
    pyTruthy(get(dados, "value"))
  );
}

function extrairRotulosEstado(bot: Bot, grafo: Grafo, stateNumber: unknown, idNo: string): Map<unknown, RotuloOpcao> {
  const resultado = new Map<unknown, RotuloOpcao>();
  const estado = bot.estadoPorNumero(stateNumber);
  if (estado === undefined) return resultado;
  const [mapa, fonte] = mapaOpcoesEstado(bot, grafo, idNo);
  for (const transicao of estado.transicoes) {
    for (const condicao of transicao.condicoes) {
      if (ehCondicaoDeOpcao(condicao)) resultado.set(condicao.id, rotularCondicao(condicao, mapa, fonte));
    }
  }
  return resultado;
}

export function rotulosPorTransicao(bot: Bot, grafo: Grafo): Map<unknown, RotuloOpcao> {
  const resultado = new Map<unknown, RotuloOpcao>();
  for (const estado of bot.estados.values()) {
    const rotulosEstado = extrairRotulosEstado(bot, grafo, estado.stateNumber, pyStr(estado.stateNumber));
    for (const transicao of estado.transicoes) {
      for (const condicao of transicao.condicoes) {
        const rotulo = rotulosEstado.get(condicao.id);
        if (rotulo !== undefined) resultado.set(transicao.id, rotulo);
      }
    }
  }
  return resultado;
}

export function textoExibicao(rotulo: RotuloOpcao): string {
  if (rotulo.variacoes <= 0) return rotulo.rotulo;
  const palavra = rotulo.variacoes === 1 ? "variação" : "variações";
  return `${rotulo.rotulo} (+${rotulo.variacoes} ${palavra})`;
}

const VARIAVEIS_CALENDARIO = new Set(["calendario", "calendario_falso"]);

export function calendarioPorTransicao(bot: Bot): Map<unknown, [string, unknown]> {
  const resultado = new Map<unknown, [string, unknown]>();
  for (const estado of bot.estados.values()) {
    for (const transicao of estado.transicoes) {
      for (const condicao of transicao.condicoes) {
        const variavel = condicao.conditionData.variable;
        if (typeof variavel === "string" && VARIAVEIS_CALENDARIO.has(variavel)) {
          resultado.set(transicao.id, [variavel, condicao.conditionType]);
          break;
        }
      }
    }
  }
  return resultado;
}

export function textoNoCondicao(rotulo: RotuloOpcao): string {
  const operador = rotuloConditionType(rotulo.conditionType).toLowerCase();
  return `Mensagem: ${operador} "${textoExibicao(rotulo)}"`;
}
