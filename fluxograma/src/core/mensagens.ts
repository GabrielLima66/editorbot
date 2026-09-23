// Port de Fluxo BOT backend/core/mensagens.py - so o que o pipeline do
// fluxograma usa (ver ORIGEM.md).
import type { Acao, Estado } from "./modelo";
import { ParserError, parseJsonAninhado } from "./parser";
import { ehDict, lstrip, pyStr, pyTruthy, strip } from "./pythonCompat";

/** (x or {}).get(chave) com x vindo de JSON. */
export function getOuVazio(obj: unknown, chave: string): unknown {
  return pyTruthy(obj) && ehDict(obj) && Object.hasOwn(obj, chave) ? obj[chave] : null;
}

function parseSeguro(bruto: string, contexto: string): unknown {
  try {
    return parseJsonAninhado(bruto, contexto);
  } catch (e) {
    if (e instanceof ParserError) return undefined;
    throw e;
  }
}

function corpoDeJsonInterativo(bruto: string, contexto: string): string | null {
  const obj = parseSeguro(bruto, contexto);
  if (!ehDict(obj)) return null;
  const corpo = getOuVazio(getOuVazio(obj.interactive, "body"), "text");
  return typeof corpo === "string" && strip(corpo) !== "" ? corpo : null;
}

export function textoDeAcaoEnvio(acao: Acao): string | null {
  if (acao.actionType === "1") {
    const texto = acao.actionData.message_text;
    if (typeof texto !== "string" || strip(texto) === "") return null;
    if (lstrip(texto).startsWith("{")) {
      const corpo = corpoDeJsonInterativo(texto, `acao id=${pyStr(acao.id)} (message_text parece JSON)`);
      if (corpo) return corpo;
    }
    return texto;
  }
  if (acao.actionType === "10") {
    const bruto = acao.actionData.message_option_text;
    if (typeof bruto !== "string" || strip(bruto) === "") return null;
    return corpoDeJsonInterativo(bruto, `acao id=${pyStr(acao.id)}`);
  }
  return null;
}

/** Lista de (x or []) vinda de JSON. */
export function listaOuVazia(v: unknown): unknown[] {
  return pyTruthy(v) && Array.isArray(v) ? v : [];
}

export function opcoesDeAcaoMenu(acao: Acao): string[] {
  if (acao.actionType !== "10") return [];
  const bruto = acao.actionData.message_option_text;
  if (typeof bruto !== "string" || strip(bruto) === "") return [];
  const obj = parseSeguro(bruto, `acao id=${pyStr(acao.id)}`);
  if (!ehDict(obj)) return [];
  const action = getOuVazio(obj.interactive, "action");
  const titulos: string[] = [];
  for (const botao of listaOuVazia(getOuVazio(action, "buttons"))) {
    const titulo = getOuVazio(getOuVazio(botao, "reply"), "title");
    if (typeof titulo === "string" && strip(titulo) !== "") titulos.push(titulo);
  }
  for (const secao of listaOuVazia(getOuVazio(action, "sections"))) {
    for (const linha of listaOuVazia(getOuVazio(secao, "rows"))) {
      const titulo = getOuVazio(linha, "title");
      if (typeof titulo === "string" && strip(titulo) !== "") titulos.push(titulo);
    }
  }
  return titulos;
}

export function aguardaMensagem(estado: Estado): boolean {
  return estado.transicoes.some((t) => t.condicoes.some((c) => c.conditionData.variable === "message"));
}
