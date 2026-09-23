// Montagem dos nomes a partir de state.ambienteOrpen (formato do
// content/page-env-collector.js). A aplicacao em si e coberta pelos goldens
// *.nomes.json (paridade com aplicar_overrides_reactflow do Python).
import { describe, expect, test } from "vitest";
import { aplicarNomesAmbiente, montarNomesAmbiente } from "../src/core/nomesAmbiente";
import { gerarGrafoReactFlow } from "../src/core/pipeline";

const AMBIENTE = {
  queues: [
    { id: "7101", name: "[7101] Suporte" },
    { id: "-50", name: "[-50] QA - Teste Valor Negativo " },
    { id: " 7102 ", name: "[7102] Comercial" },
    { id: "", name: "sem id" },
    { id: "9", name: "   " },
  ],
  bots: [
    { id: "1208262", name: "[Bot] [IMPORT] BOT SUPORTE FIN OUVIDORIA" },
    { id: 55, name: "[Bot] Numerico" },
  ],
  calendars: [{ id: "227", name: "Equipe-suporte-feriado" }],
};

describe("montarNomesAmbiente", () => {
  const nomes = montarNomesAmbiente(AMBIENTE)!;

  test("fila: usa o nome do collector (ja vem como [N] Nome), com trim", () => {
    expect(nomes.filas["7101"]).toBe("[7101] Suporte");
    expect(nomes.filas["-50"]).toBe("[-50] QA - Teste Valor Negativo");
    expect(nomes.filas["7102"]).toBe("[7102] Comercial");
  });

  test("ignora id vazio e nome vazio", () => {
    // mapa so de busca: a ordem das chaves nao importa (e o JS poe chave
    // com cara de inteiro na frente)
    expect(Object.keys(nomes.filas).sort()).toEqual(["-50", "7101", "7102"]);
  });

  test("bot: [ID] NOME, sem o prefixo [Bot] do collector", () => {
    expect(nomes.bots["1208262"]).toBe("[1208262] [IMPORT] BOT SUPORTE FIN OUVIDORIA");
    expect(nomes.bots["55"]).toBe("[55] Numerico");
  });

  test("calendario", () => {
    expect(nomes.calendarios["227"]).toBe("Equipe-suporte-feriado");
  });

  test("ambiente ausente -> null (fluxograma sai sem nomes)", () => {
    expect(montarNomesAmbiente(null)).toBeNull();
    expect(montarNomesAmbiente(undefined)).toBeNull();
  });
});

test("de ponta a ponta: fila, bot externo e calendario com o nome do ambiente", () => {
  const bot = {
    ID: "1",
    NAME: "t",
    BOT_STATES: [{ ID: "0", STATE_NUMBER: "0", ALIAS: "HOME" }],
    BOT_TRANSITIONS: [
      { ID: "1", STATE: "0", PRIORITY: "1" },
      { ID: "2", STATE: "0", PRIORITY: "2" },
      { ID: "3", STATE: "0", PRIORITY: "3" },
    ],
    BOT_CONDITIONS: [{ ID: "1", TRANSITION_ID: "3", CONDITION_TYPE: "227", CONDITION_DATA: { variable: "calendario" } }],
    BOT_ACTIONS: [
      { ID: "1", TRANSITION_ID: "1", ACTION_TYPE: "5", ACTION_DATA: { destiny: "7101" } },
      { ID: "2", TRANSITION_ID: "2", ACTION_TYPE: "4", ACTION_DATA: { destiny: "1208262" } },
      { ID: "3", TRANSITION_ID: "3", ACTION_TYPE: "5", ACTION_DATA: { destiny: "999" } },
    ],
  };
  const { nodes } = gerarGrafoReactFlow(bot, montarNomesAmbiente(AMBIENTE));
  const porId = Object.fromEntries(nodes.map((n) => [n.id, n.data.overrideRotulo]));
  expect(porId["fila:7101"]).toBe("*Transfere para a fila [7101] Suporte*");
  expect(porId["bot_externo:1208262"]).toBe("*Transfere para o bot [1208262] [IMPORT] BOT SUPORTE FIN OUVIDORIA*");
  expect(porId["calendario:3"]).toBe("Dentro do horário — Equipe-suporte-feriado");
  expect(porId["fila:999"]).toBeUndefined();
});

test("aplicarNomesAmbiente nao mexe em tipos que nao sao fila/bot/calendario", () => {
  const dados = {
    nodes: [{ id: "0", type: "estado", position: { x: 0, y: 0 }, data: { tipo: "estado", rotulo: "X", referencia: "7101" } }],
    edges: [],
  };
  aplicarNomesAmbiente(dados, montarNomesAmbiente(AMBIENTE)!);
  expect(dados.nodes[0].data).toEqual({ tipo: "estado", rotulo: "X", referencia: "7101" });
});
