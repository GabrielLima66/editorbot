// Nomes reais de fila / bot externo / calendario (D6 da spec). A aplicacao
// e o port dos ramos fila/bot_externo/calendario de
// aplicar_overrides_reactflow (Fluxo BOT backend/core/overrides.py); a
// montagem a partir de state.ambienteOrpen e especifica da extensao.
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

/** Muta e devolve `dados`, como aplicar_overrides_reactflow. */
export function aplicarNomesAmbiente(dados: GrafoReactFlow, nomes: NomesAmbiente): GrafoReactFlow {
  for (const no of dados.nodes) {
    const info = no.data;
    let texto: string | null = null;
    if (info.tipo === "bot_externo") {
      const nome = buscar(nomes.bots, info.referencia);
      texto = pyTruthy(nome) ? `*Transfere para o bot ${nome}*` : null;
    } else if (info.tipo === "fila") {
      const nome = buscar(nomes.filas, info.referencia);
      texto = pyTruthy(nome) ? `*Transfere para a fila ${nome}*` : null;
    } else if (info.tipo === "calendario") {
      const nome = buscar(nomes.calendarios, info.referencia);
      texto = pyTruthy(nome) ? `${CALENDARIO_ROTULOS[info.variavelCalendario as string]} — ${nome}` : null;
    }
    if (texto) info.overrideRotulo = texto;
  }
  return dados;
}
