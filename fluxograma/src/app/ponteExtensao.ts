// Protocolo extensao <-> iframe (SPEC-exportar-fluxograma.md, "Protocolo").
// So aceita a porta de um MessageChannel entregue pela janela-mae com o
// nonce que veio no hash da URL; tudo depois trafega pela porta privada,
// entao scripts da pagina da Orpen nao leem o arquivo gerado.
import type { Formato } from "./exportar";
import type { AmbienteOrpen, NomesAmbiente } from "../core/nomesAmbiente";

export interface PedidoGerar {
  tipo: "gerar";
  id: number;
  bot: unknown;
  formato: Formato;
  /** Cadastros crus de state.ambienteOrpen (a extensao manda isto; os
   * nomes sao montados aqui, por montarNomesAmbiente, que tem teste). */
  ambiente?: AmbienteOrpen | null;
  /** Nomes ja montados - usado pelo harness de paridade (goldens). */
  nomesAmbiente?: NomesAmbiente | null;
}

export type Etapa = "grafo" | "layout" | "render" | "captura";

export type Resposta =
  | { tipo: "conectado" }
  | { tipo: "progresso"; id: number; etapa: Etapa }
  | { tipo: "pronto"; id: number; formato: Formato; arquivo: ArrayBuffer; nos: number; arestas: number; semNomes: boolean }
  | { tipo: "erro"; id: number; mensagem: string; detalhe?: string };

export function aguardarConexao(onPedido: (pedido: PedidoGerar, responder: (r: Resposta, transferir?: Transferable[]) => void) => void) {
  const nonce = new URLSearchParams(location.hash.slice(1)).get("n");
  let porta: MessagePort | null = null;

  window.addEventListener("message", (e) => {
    if (porta || e.source !== window.parent) return;
    const d = e.data;
    if (!d || d.tipo !== "conectar" || !nonce || d.nonce !== nonce || !e.ports[0]) return;
    const p = e.ports[0];
    porta = p;
    const responder = (r: Resposta, transferir: Transferable[] = []) => p.postMessage(r, transferir);
    p.onmessage = (ev) => {
      if (ev.data?.tipo === "gerar") onPedido(ev.data as PedidoGerar, responder);
    };
    responder({ tipo: "conectado" });
  });
}
