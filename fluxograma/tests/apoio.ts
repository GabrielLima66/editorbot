// Leitura dos goldens gerados por scripts/gerar_golden.py e conversao dos
// fixtures pro formato de state.botCarregado da extensao.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import he from "he";
import { TABLE_KEY_ORDER } from "../../js/dictionaries.js";

export const DIR_TESTES = dirname(fileURLToPath(import.meta.url));

export interface Golden {
  arquivo: string;
  origem: { commit: string; alteracoesLocais: boolean };
  fixture: string;
  fixtureSha256: string;
  nomes?: { filas: Record<string, string>; bots: Record<string, string>; calendarios: Record<string, string> };
  resultado: { nodes: unknown[]; edges: unknown[] };
  caminhoFixture: string;
}

export function commitDeOrigem(): string {
  const texto = readFileSync(join(DIR_TESTES, "..", "ORIGEM.md"), "utf-8");
  const m = /Commit espelhado: `([0-9a-f]+)`/.exec(texto);
  if (!m) throw new Error("ORIGEM.md sem a linha 'Commit espelhado'");
  return m[1];
}

function lerGoldens(pasta: string, pastaFixtures: string): Golden[] {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta)
    .filter((f) => f.endsWith(".json") && f !== "erros.json")
    .sort()
    .map((f) => {
      const g = JSON.parse(readFileSync(join(pasta, f), "utf-8"));
      return { ...g, arquivo: f, caminhoFixture: join(pastaFixtures, g.fixture) };
    });
}

export const GOLDENS = lerGoldens(join(DIR_TESTES, "golden"), join(DIR_TESTES, "fixtures"));
export const GOLDENS_LOCAIS = lerGoldens(join(DIR_TESTES, "golden_local"), join(DIR_TESTES, "golden_local", "fixtures"));

type NoGolden = { data: Record<string, unknown> };

/** Os goldens *.nomes.json sao saida PURA do desktop: o nome entra como
 * override manual (`overrideRotulo`). Na extensao o nome do ambiente e dado
 * real do no (decisao registrada na spec, D6): vai pro `rotulo` e o
 * calendario deixa de ser "nao resolvido". Esta e a unica diferenca
 * intencional em relacao ao desktop, e e exatamente isto que ela faz. */
export function nomesComoDadoReal<T extends { nodes: unknown[] }>(resultado: T): T {
  const copia = structuredClone(resultado);
  for (const no of copia.nodes as NoGolden[]) {
    const d = no.data;
    if (typeof d.overrideRotulo !== "string") continue;
    if (d.tipo === "fila" || d.tipo === "bot_externo") d.rotulo = d.overrideRotulo;
    else if (d.tipo === "calendario") {
      d.rotulo = d.overrideRotulo;
      d.naoResolvida = false;
    } else continue;
    delete d.overrideRotulo;
  }
  return copia;
}

export function lerFixture(caminho: string): { dados: unknown; sha256: string } {
  const bytes = readFileSync(caminho);
  return { dados: JSON.parse(bytes.toString("utf-8")), sha256: createHash("sha256").update(bytes).digest("hex") };
}

type Linha = Record<string, unknown>;

function comEspelhos(tipo: keyof typeof TABLE_KEY_ORDER, obj: Linha): Linha {
  TABLE_KEY_ORDER[tipo].forEach((chave: string, i: number) => {
    obj[String(i)] = obj[chave];
  });
  return obj;
}

/** *_DATA como o adapter recebe do getBot: sempre objeto (o PHP devolve o
 * texto ja decodificado e o adapter faz JSON.parse). */
function dadosComoObjeto(linha: Linha, chave: string): unknown {
  const v = linha[chave];
  if (typeof v === "object" && v !== null && !Array.isArray(v)) return v;
  const bruto = linha["3"];
  if (typeof bruto === "string" && bruto.trim()) {
    try {
      return JSON.parse(he.decode(bruto));
    } catch {
      return {};
    }
  }
  return {};
}

/** Mesma forma que js/orpen-adapter.js:fromGetBotResponse monta (valores
 * String(), *_DATA objeto, chaves-espelho numericas), mantendo a ordem do
 * fixture pra comparar contra o mesmo golden. */
export function paraFormaExtensao(bot: Linha): Linha {
  const lista = (k: string) => (bot[k] as Linha[] | undefined) ?? [];
  return {
    ID: bot.ID,
    NAME: bot.NAME,
    BOT_STATES: lista("BOT_STATES").map((s) =>
      comEspelhos("state", { ID: String(s.STATE_NUMBER), STATE_NUMBER: String(s.STATE_NUMBER), ALIAS: s.ALIAS ?? "" }),
    ),
    BOT_TRANSITIONS: lista("BOT_TRANSITIONS").map((t) =>
      comEspelhos("transition", {
        ID: String(t.ID),
        STATE: String(t.STATE),
        CONDITION: t.CONDITION ?? "",
        MESSAGE: t.MESSAGE ?? "",
        TARGET_TYPE: t.TARGET_TYPE ?? "",
        TARGET: t.TARGET ?? "",
        PRIORITY: String(t.PRIORITY ?? "0"),
      }),
    ),
    BOT_CONDITIONS: lista("BOT_CONDITIONS").map((c) =>
      comEspelhos("condition", {
        ID: String(c.ID),
        TRANSITION_ID: String(c.TRANSITION_ID),
        CONDITION_TYPE: String(c.CONDITION_TYPE ?? "0"),
        CONDITION_DATA: dadosComoObjeto(c, "CONDITION_DATA"),
      }),
    ),
    BOT_ACTIONS: lista("BOT_ACTIONS").map((a) =>
      comEspelhos("action", {
        ID: String(a.ID),
        TRANSITION_ID: String(a.TRANSITION_ID),
        ACTION_TYPE: String(a.ACTION_TYPE ?? "0"),
        ACTION_DATA: dadosComoObjeto(a, "ACTION_DATA"),
      }),
    ),
  };
}
