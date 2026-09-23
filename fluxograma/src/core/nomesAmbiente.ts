// Nomes reais de fila / bot externo / calendario (D6 da spec), vindos de
// state.ambienteOrpen. Diferente da Nomenclatura do desktop (override manual
// em `overrideRotulo`, que o desenho mostra com os *asteriscos* crus - bug do
// Fluxo BOT), aqui o nome e DADO REAL do no: entra no proprio `rotulo`, com a
// mesma formula que grafo.py ja usa pro texto padrao ("*Transfere para a fila
// {numero}*", cujos asteriscos o texto.ts remove), so trocando o numero pelo
// nome. Calendario com nome deixa de ser "nao resolvido".
import { CALENDARIO_ROTULOS } from "./dicionarios";
import type { GrafoReactFlow } from "./grafoParaReactflow";
import { pyStr, pyTruthy, strip } from "./pythonCompat";

/** Cada mapa: referencia (ja sem espacos) -> nome final a exibir. */
export interface NomesAmbiente {
  filas: Record<string, string>;
  bots: Record<string, string>;
  calendarios: Record<string, string>;
}

interface ItemCadastro {
  id?: unknown;
  name?: unknown;
}

/** Formato de state.ambienteOrpen (content/page-env-collector.js). */
export interface AmbienteOrpen {
  queues?: ItemCadastro[];
  bots?: ItemCadastro[];
  calendars?: ItemCadastro[];
}

// O collector prefixa o nome do bot com "[Bot] " pros datalists do editor.
const RE_PREFIXO_BOT = /^\[Bot\][\s]*/u;

function indexar(itens: ItemCadastro[] | undefined, formatar: (id: string, nome: string) => string): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const item of itens ?? []) {
    const id = strip(pyStr(item?.id ?? ""));
    const nome = strip(pyStr(item?.name ?? ""));
    if (id === "" || id === "None" || nome === "") continue;
    mapa[id] = formatar(id, nome);
  }
  return mapa;
}

export function montarNomesAmbiente(ambiente: AmbienteOrpen | null | undefined): NomesAmbiente | null {
  if (!ambiente) return null;
  return {
    // o collector ja entrega a fila como "[NAME] BEE_NAME"
    filas: indexar(ambiente.queues, (_id, nome) => nome),
    bots: indexar(ambiente.bots, (id, nome) => `[${id}] ${strip(nome.replace(RE_PREFIXO_BOT, ""))}`),
    calendarios: indexar(ambiente.calendars, (_id, nome) => nome),
  };
}

function buscar(mapa: Record<string, string>, referencia: unknown): string | undefined {
  const chave = strip(pyStr(referencia));
  return Object.hasOwn(mapa, chave) ? mapa[chave] : undefined;
}

/** Muta e devolve `dados`. Referencia sem nome no ambiente fica como esta. */
export function aplicarNomesAmbiente(dados: GrafoReactFlow, nomes: NomesAmbiente): GrafoReactFlow {
  for (const no of dados.nodes) {
    const info = no.data;
    if (info.tipo === "bot_externo") {
      const nome = buscar(nomes.bots, info.referencia);
      if (pyTruthy(nome)) info.rotulo = `*Transfere para o bot ${nome}*`;
    } else if (info.tipo === "fila") {
      const nome = buscar(nomes.filas, info.referencia);
      if (pyTruthy(nome)) info.rotulo = `*Transfere para a fila ${nome}*`;
    } else if (info.tipo === "calendario") {
      const nome = buscar(nomes.calendarios, info.referencia);
      if (pyTruthy(nome)) {
        info.rotulo = `${CALENDARIO_ROTULOS[info.variavelCalendario as string]} — ${nome}`;
        info.naoResolvida = false;
      }
    }
  }
  return dados;
}
