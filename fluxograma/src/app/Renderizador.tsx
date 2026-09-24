// ReactFlow "headless": desenha o grafo com os MESMOS componentes e a mesma
// montagem de arestas do App.tsx do Fluxo BOT (cor por estado de origem,
// seta ArrowClosed 16x16, back edge sempre vermelha) e avisa quando tudo
// esta desenhado. Sem Controls/MiniMap/Background/selecao: nada disso entra
// na captura, que e so de .react-flow__viewport.
import { useEffect, useMemo, useRef } from "react";
import ReactFlow, { MarkerType, useNodesInitialized, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import "../render/tema.css";
import NoEstado from "../render/NoEstado";
import ArestaConversa from "../render/ArestaConversa";
import { corPorEstado } from "../render/coresEstado";
import { calcularLayout } from "../render/layout";
import type { EdgeData, GrafoReactFlow, NodeData } from "../render/types";

const nodeTypes = {
  estado: NoEstado,
  mensagem: NoEstado,
  condicao: NoEstado,
  calendario: NoEstado,
  fila: NoEstado,
  bot_externo: NoEstado,
  encerrado: NoEstado,
  fila_dinamica: NoEstado,
  orfao: NoEstado,
};
const edgeTypes = { conversa: ArestaConversa };

export const TIMEOUT_DESENHO_MS = 30_000;

// Copia de App.tsx (mapaCoresEstado + montagem das arestas antes do layout).
function montar(grafo: GrafoReactFlow) {
  const origens = grafo.edges.filter((e) => !e.data.isBackEdge).map((e) => e.data.estadoOrigemId);
  const mapaCores = corPorEstado(origens);
  return calcularLayout(
    grafo.nodes as Node<NodeData>[],
    grafo.edges.map((e) => {
      const cor = e.data.isBackEdge ? undefined : mapaCores.get(e.data.estadoOrigemId);
      return {
        ...e,
        type: "conversa",
        data: { ...e.data, corEstadoOrigem: cor },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: e.data.isBackEdge ? "oklch(64% 0.19 25)" : cor ?? "#75798c",
        },
      };
    }) as Edge<EdgeData>[],
  );
}

interface Props {
  grafo: GrafoReactFlow;
  onPronto: (nodes: Node<NodeData>[]) => void;
  onErro: (mensagem: string) => void;
}

export default function Renderizador({ grafo, onPronto, onErro }: Props) {
  const { nodes, edges } = useMemo(() => montar(grafo), [grafo]);
  const inicializado = useNodesInitialized();
  const finalizado = useRef(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (finalizado.current) return;
      finalizado.current = true;
      const desenhadas = document.querySelectorAll(".react-flow__edge").length;
      onErro(`O fluxograma não terminou de desenhar a tempo (${desenhadas} de ${edges.length} setas).`);
    }, TIMEOUT_DESENHO_MS);
    return () => clearTimeout(timeout);
  }, [onErro, edges.length]);

  useEffect(() => {
    if (!inicializado) return;
    let cancelado = false;
    const esperarArestas = () => {
      if (cancelado || finalizado.current) return;
      if (document.querySelectorAll(".react-flow__edge").length < edges.length) {
        setTimeout(esperarArestas, 50);
        return;
      }
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (cancelado || finalizado.current) return;
          finalizado.current = true;
          onPronto(nodes);
        }),
      );
    };
    esperarArestas();
    return () => {
      cancelado = true;
    };
  }, [inicializado, edges.length, nodes, onPronto]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      minZoom={0.02}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
    />
  );
}
