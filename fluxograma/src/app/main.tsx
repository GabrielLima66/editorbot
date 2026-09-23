// Pagina do iframe renderizador: recebe o bot, roda o pipeline (port do
// Fluxo BOT), desenha com os componentes do desktop, captura e devolve o
// arquivo. Uma geracao por vez.
import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "reactflow";
import { montarNomesAmbiente } from "../core/nomesAmbiente";
import { ParserError } from "../core/parser";
import { gerarGrafoReactFlow } from "../core/pipeline";
import type { GrafoReactFlow } from "../render/types";
import Renderizador from "./Renderizador";
import { capturarDiagrama, ErroCaptura } from "./exportar";
import { aguardarConexao, type PedidoGerar, type Resposta } from "./ponteExtensao";

// Mesmas fontes que layout.ts mede com canvas.measureText. document.fonts.ready
// sozinho nao basta: ele resolve na hora se nenhum texto usou a Inter ainda,
// e ai os cards seriam medidos com a fonte de fallback (achado da Fase 0).
const FONTES_MEDIDAS = ["500 11px Inter", "600 14px Inter", "400 13px Inter", "400 12px Inter", "400 12.5px Inter"];

const root = createRoot(document.getElementById("root")!);
let ocupado = false;

async function gerar(pedido: PedidoGerar, responder: (r: Resposta, transferir?: Transferable[]) => void) {
  const { id, formato } = pedido;
  const falhar = (mensagem: string, detalhe?: string) => {
    root.render(null);
    ocupado = false;
    responder({ tipo: "erro", id, mensagem, detalhe });
  };

  if (ocupado) {
    responder({ tipo: "erro", id, mensagem: "Já existe um fluxograma sendo gerado. Aguarde terminar." });
    return;
  }
  ocupado = true;

  const nomes = pedido.nomesAmbiente ?? montarNomesAmbiente(pedido.ambiente);
  let grafo: GrafoReactFlow;
  try {
    responder({ tipo: "progresso", id, etapa: "grafo" });
    grafo = gerarGrafoReactFlow(pedido.bot, nomes) as unknown as GrafoReactFlow;
  } catch (e) {
    if (e instanceof ParserError) return falhar(`O bot tem um problema de estrutura: ${e.message}`);
    return falhar("Não foi possível montar o fluxograma.", String(e));
  }

  responder({ tipo: "progresso", id, etapa: "layout" });
  await Promise.all(FONTES_MEDIDAS.map((f) => document.fonts.load(f)));

  responder({ tipo: "progresso", id, etapa: "render" });
  root.render(
    <ReactFlowProvider key={id}>
      <Renderizador
        grafo={grafo}
        onErro={(mensagem) => falhar(mensagem)}
        onPronto={async (nodes) => {
          try {
            responder({ tipo: "progresso", id, etapa: "captura" });
            const blob = await capturarDiagrama(nodes, formato);
            const arquivo = await blob.arrayBuffer();
            root.render(null);
            ocupado = false;
            responder(
              {
                tipo: "pronto",
                id,
                formato,
                arquivo,
                nos: grafo.nodes.length,
                arestas: grafo.edges.length,
                semNomes: nomes === null,
              },
              [arquivo],
            );
          } catch (e) {
            if (e instanceof ErroCaptura) falhar(e.message);
            else falhar("Não foi possível gerar a imagem do fluxograma.", String(e));
          }
        }}
      />
    </ReactFlowProvider>,
  );
}

aguardarConexao((pedido, responder) => {
  void gerar(pedido, responder);
});
