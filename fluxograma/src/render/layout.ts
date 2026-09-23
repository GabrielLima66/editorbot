// Layout automatico via dagre (SPEC secao 2, passo 5: "Delegado a
// biblioteca JS, nao implementado em Python"). Largura E altura de cada no
// sao medidas a partir do conteudo REAL (canvas.measureText, fontes
// identicas as que tema.css usa) - um card agora tem ate 4 blocos
// empilhados (icone+kicker / titulo opcional / corpo / caixa de opcoes),
// entao a medicao segue a mesma pilha que NoEstado.tsx renderiza, bloco a
// bloco, em vez de tratar o no como um texto so.
import dagre from "dagre";
import type { Edge, Node } from "reactflow";
import type { EdgeData, NodeData } from "./types";
import { conteudoDoNo } from "./texto";
import { APARENCIA, APARENCIA_PADRAO } from "./tiposNo";

export const LARGURA_MINIMA = 170;
export const LARGURA_MAXIMA = 340;
const LARGURA_MINIMA_PILULA = 108;

// Paddings e gaps - espelham tema.css exatamente (restricao 02 do handoff:
// qualquer ajuste ali precisa ser replicado aqui, senao a caixa desalinha
// do conteudo real).
const PADDING_H = 11; // .no-fluxo
const PADDING_H_PILULA = 18; // .no-fluxo--pilula
const PADDING_V = 16; // .no-fluxo (8px * 2)
const PADDING_V_BARRA = 19; // .no-fluxo--retangulo-barra (8 + 11 do padding-bottom)
const PADDING_V_PILULA = 18; // .no-fluxo--pilula (9px * 2)
const GAP_BLOCOS = 6; // .no-fluxo { gap: 6px } entre kicker/titulo/corpo/opcoes
const ICONE_TAMANHO = 15;
const GAP_ICONE_KICKER = 6; // .no-fluxo__kicker-linha (bloco: icone ao lado do kicker)
const GAP_ICONE_KICKER_PILULA = 3; // .no-fluxo--pilula .no-fluxo__kicker-linha (empilhado)
const OPCOES_CAIXA_PADDING_H = 10;
const OPCOES_CAIXA_PADDING_V = 7;
const OPCOES_GAP = 3;
const RECUO_MARCADOR_OPCAO = 14; // .no-fluxo__opcoes li (bullet "›")

const ALTURA_MINIMA = 52;
const ALTURA_LINHA_KICKER = 15; // 11px / line-height 1.35
const ALTURA_LINHA_TITULO = 18; // 14px / line-height 1.3
const ALTURA_LINHA = 18; // corpo bloco: 13px / line-height 1.4
const ALTURA_LINHA_PILULA = 17; // corpo pilula: 12px / line-height 1.4
const ALTURA_LINHA_OPCAO = 18; // 12.5px / line-height 1.4

const FONTE_KICKER = "500 11px 'Inter', 'Segoe UI', system-ui, sans-serif";
const LETRA_ESPACADA_KICKER = 0.08 * 11; // letter-spacing: 0.08em em fonte 11px
const FONTE_TITULO = "600 14px 'Inter', 'Segoe UI', system-ui, sans-serif";
const FONTE_PRINCIPAL = "400 13px 'Inter', 'Segoe UI', system-ui, sans-serif";
const FONTE_PILULA = "400 12px 'Inter', 'Segoe UI', system-ui, sans-serif";
const FONTE_OPCAO = "400 12.5px 'Inter', 'Segoe UI', system-ui, sans-serif";

let canvasMedicao: HTMLCanvasElement | null = null;

function obterContexto(): CanvasRenderingContext2D | null {
  if (!canvasMedicao) canvasMedicao = document.createElement("canvas");
  return canvasMedicao.getContext("2d");
}

/** Largura natural (sem quebra) do texto, considerando quebras de linha
 * explicitas (\n) ja existentes no conteudo - mensagens com paragrafos
 * (ex: "CURSOS\n...\n\nVISITACAO\n...") tem cada trecho medido separado,
 * senao o \n vira so mais um espaco e a largura sai errada. `tracking`
 * soma px extra por caractere - canvas.measureText nao aplica
 * letter-spacing sozinho, so o kicker usa (ver LETRA_ESPACADA_KICKER). */
function larguraNatural(ctx: CanvasRenderingContext2D, fonte: string, texto: string, tracking = 0): number {
  ctx.font = fonte;
  return texto
    .split("\n")
    .reduce((maior, linha) => Math.max(maior, ctx.measureText(linha).width + tracking * linha.length), 0);
}

/** Numero de linhas que o texto ocupa dentro de `larguraUtil`, respeitando
 * quebras de linha explicitas (\n) alem da quebra automatica por palavra. */
function medirLinhas(ctx: CanvasRenderingContext2D, fonte: string, texto: string, larguraUtil: number, tracking = 0): number {
  if (!texto) return 1;
  ctx.font = fonte;

  let linhas = 0;
  for (const paragrafo of texto.split("\n")) {
    const palavras = paragrafo.split(/\s+/).filter(Boolean);
    if (palavras.length === 0) {
      linhas += 1;
      continue;
    }
    let linhasDoParagrafo = 1;
    let larguraAtual = 0;
    for (const palavra of palavras) {
      const larguraPalavra = ctx.measureText(palavra + " ").width + tracking * palavra.length;
      if (larguraAtual > 0 && larguraAtual + larguraPalavra > larguraUtil) {
        linhasDoParagrafo += 1;
        larguraAtual = larguraPalavra;
      } else {
        larguraAtual += larguraPalavra;
      }
    }
    linhas += linhasDoParagrafo;
  }
  return Math.max(1, linhas);
}

function clamp(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/** Largura + altura do no, medindo cada bloco que NoEstado.tsx realmente
 * renderiza (icone+kicker / titulo opcional / corpo / caixa de opcoes),
 * empilhados com o mesmo gap de tema.css - sem isso a caixa desalinha do
 * conteudo (corta texto ou sobra espaco vazio). */
export function calcularDimensoes(data: NodeData): { largura: number; altura: number } {
  const aparencia = APARENCIA[data.tipo] ?? APARENCIA_PADRAO;
  const ehPilula = aparencia.forma === "pilula";
  const temIcone = Boolean(aparencia.Icone);
  const { kicker, titulo, corpo, opcoes } = conteudoDoNo(data);

  const paddingH = ehPilula ? PADDING_H_PILULA : PADDING_H;
  const minima = ehPilula ? LARGURA_MINIMA_PILULA : LARGURA_MINIMA;
  const fonteCorpo = ehPilula ? FONTE_PILULA : FONTE_PRINCIPAL;
  const alturaLinhaCorpo = ehPilula ? ALTURA_LINHA_PILULA : ALTURA_LINHA;

  const ctx = obterContexto();
  if (!ctx) return { largura: minima, altura: ALTURA_MINIMA };

  // --- largura: maior conteudo entre kicker(+icone se em linha), titulo,
  // corpo e a maior opcao (dentro da caixa recuada).
  let larguraConteudo = larguraNatural(ctx, FONTE_KICKER, kicker, LETRA_ESPACADA_KICKER);
  if (temIcone && !ehPilula) larguraConteudo += ICONE_TAMANHO + GAP_ICONE_KICKER;
  if (titulo) larguraConteudo = Math.max(larguraConteudo, larguraNatural(ctx, FONTE_TITULO, titulo));
  larguraConteudo = Math.max(larguraConteudo, larguraNatural(ctx, fonteCorpo, corpo));
  for (const opcao of opcoes) {
    const larguraOpcao = larguraNatural(ctx, FONTE_OPCAO, opcao) + RECUO_MARCADOR_OPCAO + OPCOES_CAIXA_PADDING_H * 2;
    larguraConteudo = Math.max(larguraConteudo, larguraOpcao);
  }

  const largura = clamp(Math.ceil(larguraConteudo) + paddingH * 2, minima, LARGURA_MAXIMA);
  const larguraUtil = largura - paddingH * 2;

  // --- altura: soma cada bloco presente, com o gap de tema.css entre eles.
  const larguraKickerTexto = temIcone && !ehPilula ? larguraUtil - ICONE_TAMANHO - GAP_ICONE_KICKER : larguraUtil;
  const linhasKicker = medirLinhas(ctx, FONTE_KICKER, kicker, larguraKickerTexto, LETRA_ESPACADA_KICKER);
  let alturaBlocoKicker = linhasKicker * ALTURA_LINHA_KICKER;
  if (temIcone) {
    alturaBlocoKicker = ehPilula
      ? ICONE_TAMANHO + GAP_ICONE_KICKER_PILULA + alturaBlocoKicker
      : Math.max(ICONE_TAMANHO, alturaBlocoKicker);
  }

  const blocos = [alturaBlocoKicker];
  if (titulo) blocos.push(medirLinhas(ctx, FONTE_TITULO, titulo, larguraUtil) * ALTURA_LINHA_TITULO);
  blocos.push(medirLinhas(ctx, fonteCorpo, corpo, larguraUtil) * alturaLinhaCorpo);
  if (opcoes.length > 0) {
    const larguraOpcoesUtil = larguraUtil - OPCOES_CAIXA_PADDING_H * 2 - RECUO_MARCADOR_OPCAO;
    const linhasOpcoes = opcoes.reduce((soma, opcao) => soma + medirLinhas(ctx, FONTE_OPCAO, opcao, larguraOpcoesUtil), 0);
    blocos.push(OPCOES_CAIXA_PADDING_V * 2 + linhasOpcoes * ALTURA_LINHA_OPCAO + (opcoes.length - 1) * OPCOES_GAP);
  }

  const alturaConteudo = blocos.reduce((soma, altura) => soma + altura, 0) + (blocos.length - 1) * GAP_BLOCOS;
  const paddingV = ehPilula ? PADDING_V_PILULA : aparencia.forma === "retangulo-barra" ? PADDING_V_BARRA : PADDING_V;

  return { largura, altura: Math.max(ALTURA_MINIMA, alturaConteudo + paddingV) };
}

/** Calcula posicao (dagre, rankdir LR) pra cada no - a largura/altura usada
 * no calculo e a que REALMENTE vai aparecer, pra nao dessincronizar do que
 * o componente de no renderiza.
 *
 * Devolve tambem as arestas com `data.pontos`: o dagre insere nos-fantasma
 * pra rotear aresta que pula mais de uma coluna, e esses pontos eram
 * jogados fora - a aresta virava uma reta direta que passava por cima dos
 * nos do meio do caminho. ArestaConversa.tsx usa os pontos quando existem. */
export function calcularLayout(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): { nodes: Node<NodeData>[]; edges: Edge<EdgeData>[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 130 });
  g.setDefaultEdgeLabel(() => ({}));

  const dimensoes = new Map<string, { largura: number; altura: number }>();
  for (const node of nodes) {
    const dim = calcularDimensoes(node.data);
    dimensoes.set(node.id, dim);
    g.setNode(node.id, { width: dim.largura, height: dim.altura });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const nodesPosicionados = nodes.map((node) => {
    const posicao = g.node(node.id);
    const dim = dimensoes.get(node.id) ?? { largura: LARGURA_MINIMA, altura: ALTURA_MINIMA };
    return {
      ...node,
      position: { x: posicao.x - dim.largura / 2, y: posicao.y - dim.altura / 2 },
      style: { ...node.style, width: dim.largura, height: dim.altura },
      // width/height explicitos (nao so no style) evitam que o React Flow
      // dependa do ResizeObserver pra saber o tamanho do no antes de
      // desenhar as arestas - sem isso a aresta so aparece depois da
      // primeira medicao assincrona, o que pode nunca disparar em certos
      // ambientes headless.
      width: dim.largura,
      height: dim.altura,
    };
  });

  const edgesRoteadas = edges.map((edge) => {
    const pontos = g.edge(edge.source, edge.target)?.points;
    // So vale a pena rotear quando o dagre realmente desviou (>2 pontos);
    // com 2 pontos a curva bezier direta do React Flow ja e melhor, porque
    // encaixa exatamente nos handles.
    if (!pontos || pontos.length <= 2) return edge;
    return { ...edge, data: { ...(edge.data as EdgeData), pontos: pontos.map((p) => ({ x: p.x, y: p.y })) } };
  });

  return { nodes: nodesPosicionados, edges: edgesRoteadas };
}
