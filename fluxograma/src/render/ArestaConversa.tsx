import { BaseEdge, getBezierPath, type EdgeProps } from "reactflow";
import type { EdgeData } from "./types";

// Back edge (volta pra um ancestral, tipo "99-voltar") sai tracejada e
// vermelha - o resto e a linha normal. Sem rotulo flutuante: condicao de
// opcao e "acao" viraram nos proprios (condicao/mensagem/terminal - ver
// grafo_para_reactflow.py), entao a aresta e sempre um conector puro. Isso
// resolve o problema que motivou a mudanca: EdgeLabelRenderer nao
// participa do layout do dagre, entao rotulos se acumulavam em cima das
// linhas em hubs com muitas saidas.

type Ponto = { x: number; y: number };

/** Curva suave passando POR todos os pontos (Catmull-Rom convertido pra
 * cubica de Bezier). Usada nas arestas que o dagre roteou desviando de
 * nos - uma bezier direta entre origem e destino ignoraria o desvio e
 * cortaria por cima deles. */
function caminhoSuave(pontos: Ponto[]): string {
  let d = `M ${pontos[0].x},${pontos[0].y}`;
  for (let i = 0; i < pontos.length - 1; i++) {
    const p0 = pontos[i - 1] ?? pontos[i];
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const p3 = pontos[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export default function ArestaConversa({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<EdgeData>) {
  const rota = data?.pontos;

  // Extremos do dagre ficam no centro do no; os handles reais e que sao a
  // borda direita da origem / esquerda do destino - troco as pontas pra
  // linha encostar no conector em vez de sumir por dentro do card.
  const caminho =
    rota && rota.length > 2
      ? caminhoSuave([{ x: sourceX, y: sourceY }, ...rota.slice(1, -1), { x: targetX, y: targetY }])
      : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })[0];

  const back = Boolean(data?.isBackEdge);

  return (
    <BaseEdge
      id={id}
      path={caminho}
      markerEnd={markerEnd}
      style={{
        // Mesmos literais de --cor-aresta/--cor-aresta-retorno em tema.css -
        // var() nao chega confiavel dentro do <marker> de seta que o React
        // Flow gera (App.tsx), entao os dois lados ficam com o valor
        // hardcoded em vez de depender da custom property. corEstadoOrigem
        // (tambem calculado em App.tsx, ver coresEstado.ts) segue o mesmo
        // motivo - so sobrevive a exportacao (html-to-image) como style
        // inline, nunca como classe CSS.
        stroke: back ? "oklch(64% 0.19 25)" : data?.corEstadoOrigem ?? "#75798c",
        strokeWidth: 1.6,
        strokeDasharray: back ? "6 4" : undefined,
      }}
    />
  );
}
