// Port de Fluxo BOT backend/core/filtro.py (ver ORIGEM.md). O fluxograma da
// extensao so usa o Modo Cliente (decisao P4 da spec).
import { Grafo, NO_ESTADO } from "./grafo";
import type { Bot, Transicao } from "./modelo";

const MARCADORES_TESTE = ["#TESTE", "#OK#"];
const OPERADORES_ERROR_COUNT_AUTOMATICO = new Set(["8", "9"]);

function temCondicaoDeErro(transicao: Transicao): boolean {
  return transicao.condicoes.some(
    (c) =>
      c.conditionData.variable === "error_count" &&
      !(typeof c.conditionType === "string" && OPERADORES_ERROR_COUNT_AUTOMATICO.has(c.conditionType)),
  );
}

function temAcaoDeContador(transicao: Transicao): boolean {
  return transicao.acoes.some((a) => a.actionType === "8");
}

function* textosDaTransicao(transicao: Transicao): Generator<string> {
  for (const c of transicao.condicoes) {
    if (typeof c.conditionData.value === "string") yield c.conditionData.value;
  }
  for (const a of transicao.acoes) {
    for (const valor of Object.values(a.actionData)) if (typeof valor === "string") yield valor;
  }
}

function temHookDeTeste(transicao: Transicao): boolean {
  for (const texto of textosDaTransicao(transicao)) {
    const maiusculo = texto.toUpperCase();
    if (MARCADORES_TESTE.some((m) => maiusculo.includes(m))) return true;
  }
  return false;
}

function deveEsconder(bot: Bot, transicaoId: unknown): boolean {
  const transicao = bot.transicaoPorId(transicaoId);
  if (transicao === undefined) return false;
  return temCondicaoDeErro(transicao) || temAcaoDeContador(transicao) || temHookDeTeste(transicao);
}

export function filtrarGrafoModoCliente(bot: Bot, grafo: Grafo): Grafo {
  const arestasVisiveis = grafo.arestas.filter((a) => !deveEsconder(bot, a.transicaoId));
  const comAresta = new Set<string>();
  for (const a of arestasVisiveis) {
    comAresta.add(a.origem);
    comAresta.add(a.destino);
  }
  const nosVisiveis = new Map([...grafo.nos].filter(([id, no]) => no.tipo === NO_ESTADO || comAresta.has(id)));
  return new Grafo(nosVisiveis, arestasVisiveis);
}
