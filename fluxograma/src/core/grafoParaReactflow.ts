// Port de Fluxo BOT backend/core/grafo_para_reactflow.py (ver ORIGEM.md).
import { rotuloCalendario } from "./dicionarios";
import {
  Grafo,
  NO_CALENDARIO,
  NO_CONDICAO,
  NO_ESTADO,
  NO_FILA_DINAMICA,
  NO_MENSAGEM,
  estadoPorTransicao,
  novoNo,
  type Aresta,
  type No,
} from "./grafo";
import { aguardaMensagem } from "./mensagens";
import type { Bot } from "./modelo";
import { pyStr, pyTruthy } from "./pythonCompat";
import {
  FONTE_NAO_RESOLVIDO,
  calendarioPorTransicao,
  rotulosPorTransicao,
  textoNoCondicao,
  type RotuloOpcao,
} from "./rotulos";

export interface NodeData {
  tipo: string;
  rotulo: string;
  referencia: unknown;
  aguardaResposta?: boolean;
  mensagem?: string;
  opcoesMenu?: string[];
  naoResolvida?: boolean;
  variavelCalendario?: string;
  valoresObservados?: unknown[];
  overrideRotulo?: string;
}

export interface NoReactFlow {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
}

export interface ArestaReactFlow {
  id: string;
  source: string;
  target: string;
  data: { isBackEdge: boolean; transicaoId: unknown; acaoId: unknown; estadoOrigemId: string };
}

export interface GrafoReactFlow {
  nodes: NoReactFlow[];
  edges: ArestaReactFlow[];
}

function noDeCondicao(transicaoId: unknown, rotulo: RotuloOpcao): No {
  return novoNo({
    id: `${NO_CONDICAO}:${pyStr(transicaoId)}`,
    tipo: NO_CONDICAO,
    rotulo: textoNoCondicao(rotulo),
    referencia: transicaoId,
    naoResolvida: rotulo.fonte === FONTE_NAO_RESOLVIDO,
  });
}

function noDeCalendario(transicaoId: unknown, variavel: string, conditionType: unknown): No {
  return novoNo({
    id: `${NO_CALENDARIO}:${pyStr(transicaoId)}`,
    tipo: NO_CALENDARIO,
    rotulo: rotuloCalendario(variavel, conditionType),
    referencia: conditionType,
    naoResolvida: true,
    variavelCalendario: variavel,
  });
}

function inserirNosDeCondicao(
  grafo: Grafo,
  rotulos: Map<unknown, RotuloOpcao>,
  calendarios: Map<unknown, [string, unknown]>,
): Grafo {
  const nos = new Map(grafo.nos);
  const arestas: Aresta[] = [];
  for (const aresta of grafo.arestas) {
    const noOrigem = nos.get(aresta.origem);
    const primeiroHop = noOrigem !== undefined && noOrigem.tipo === NO_ESTADO;

    let intermediario: No | null = null;
    if (primeiroHop) {
      const rotulo = rotulos.get(aresta.transicaoId);
      if (rotulo !== undefined && pyTruthy(rotulo.rotulo)) {
        intermediario = noDeCondicao(aresta.transicaoId, rotulo);
      } else {
        const calendario = calendarios.get(aresta.transicaoId);
        if (calendario !== undefined) intermediario = noDeCalendario(aresta.transicaoId, calendario[0], calendario[1]);
      }
    }

    if (intermediario !== null) {
      if (!nos.has(intermediario.id)) nos.set(intermediario.id, intermediario);
      arestas.push({
        origem: aresta.origem,
        destino: intermediario.id,
        transicaoId: aresta.transicaoId,
        acaoId: "",
        backEdge: aresta.backEdge,
      });
      arestas.push({
        origem: intermediario.id,
        destino: aresta.destino,
        transicaoId: aresta.transicaoId,
        acaoId: aresta.acaoId,
        backEdge: aresta.backEdge,
      });
    } else {
      arestas.push(aresta);
    }
  }
  return new Grafo(nos, arestas);
}

function dadosDoNo(bot: Bot, no: No): NodeData {
  const dados: NodeData = { tipo: no.tipo, rotulo: no.rotulo, referencia: no.referencia };
  if (no.tipo === NO_ESTADO) {
    const estado = bot.estadoPorNumero(no.referencia);
    dados.aguardaResposta = estado !== undefined ? aguardaMensagem(estado) : false;
  }
  if (no.tipo === NO_MENSAGEM) {
    dados.mensagem = no.rotulo;
    if (no.opcoesMenu.length > 0) dados.opcoesMenu = [...no.opcoesMenu];
  }
  if (no.tipo === NO_CONDICAO) dados.naoResolvida = no.naoResolvida;
  if (no.tipo === NO_CALENDARIO) {
    dados.naoResolvida = no.naoResolvida;
    dados.variavelCalendario = no.variavelCalendario;
  }
  if (no.tipo === NO_FILA_DINAMICA) dados.valoresObservados = [...no.valoresObservados];
  return dados;
}

export function grafoParaReactflow(bot: Bot, grafo: Grafo): GrafoReactFlow {
  const rotulos = rotulosPorTransicao(bot, grafo);
  const calendarios = calendarioPorTransicao(bot);
  const estadosOrigem = estadoPorTransicao(grafo);
  const final = inserirNosDeCondicao(grafo, rotulos, calendarios);
  return {
    nodes: [...final.nos.values()].map((no) => ({
      id: no.id,
      type: no.tipo,
      position: { x: 0, y: 0 },
      data: dadosDoNo(bot, no),
    })),
    edges: final.arestas.map((a) => ({
      id: `e:${pyStr(a.transicaoId)}:${pyStr(a.acaoId)}:${a.origem}-${a.destino}`,
      source: a.origem,
      target: a.destino,
      data: {
        isBackEdge: a.backEdge,
        transicaoId: a.transicaoId,
        acaoId: a.acaoId,
        estadoOrigemId: estadosOrigem.get(a.transicaoId) ?? "",
      },
    })),
  };
}
