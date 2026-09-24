// Captura do diagrama inteiro: mesmos parametros de Fluxo BOT
// frontend/src/exportar.ts (capturarDiagrama) - padding 6%, fundo #f4f5f7,
// pixelRatio 2 no PNG e 1 no SVG. So troca a ponte Qt por um Blob devolvido
// direto (PNG via toBlob em vez de toPng: mesmo canvas, sem passar por
// base64 num bot grande).
import { toBlob, toSvg } from "html-to-image";
import { getNodesBounds, getViewportForBounds, type Node } from "reactflow";

const PADDING_FRACAO = 0.06;
const COR_FUNDO = "#f4f5f7";

export type Formato = "png" | "svg";

export class ErroCaptura extends Error {}

export async function capturarDiagrama(nodes: Node[], formato: Formato): Promise<Blob> {
  const viewportEl = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewportEl || nodes.length === 0) throw new ErroCaptura("Diagrama vazio.");

  const bounds = getNodesBounds(nodes);
  const largura = Math.ceil(bounds.width * (1 + PADDING_FRACAO));
  const altura = Math.ceil(bounds.height * (1 + PADDING_FRACAO));
  const viewport = getViewportForBounds(bounds, largura, altura, 0.05, 4, PADDING_FRACAO);

  const opcoes = {
    backgroundColor: COR_FUNDO,
    width: largura,
    height: altura,
    pixelRatio: formato === "png" ? 2 : 1,
    style: {
      width: `${largura}px`,
      height: `${altura}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  };

  if (formato === "png") {
    const blob = await toBlob(viewportEl, opcoes);
    if (!blob || blob.size === 0) {
      throw new ErroCaptura("Fluxograma grande demais para PNG. Tente gerar em SVG.");
    }
    return blob;
  }
  const dataUrl = await toSvg(viewportEl, opcoes);
  const svg = decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
  return new Blob([svg], { type: "image/svg+xml" });
}
