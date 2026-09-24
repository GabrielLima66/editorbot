export interface NodeData {
  tipo: string;
  rotulo: string;
  referencia: string;
  mensagem?: string | null;
  aguardaResposta?: boolean;
  valoresObservados?: string[];
  /** So em NO_MENSAGEM cuja acao e tipo 10 (menu de botao/lista) - titulos
   * das opcoes, na ordem em que aparecem (ver mensagens.py:
   * opcoes_de_acao_menu). Mostrado como lista dentro do card, abaixo do
   * corpo, pra "aguarda mensagem do cliente" nao ser a unica pista de que
   * ali existe um menu. */
  opcoesMenu?: string[];
  /** Override de nomenclatura (SPEC secao 3) - quando presente, ganha de
   * mensagem/aguardaResposta/rotulo, sempre. */
  overrideRotulo?: string;
  /** Em tipo "condicao": true quando a opcao de menu nao foi resolvida por
   * menu interativo/regex (so o value bruto da condicao mesmo). Em tipo
   * "calendario": sempre true na criacao - a plataforma nao exporta o
   * significado do numero, so o override do usuario resolve (SPEC secao
   * 5). Controla o estilo "nao resolvido" (borda tracejada). */
  naoResolvida?: boolean;
  /** So em tipo "calendario": "calendario" ou "calendario_falso" - campo
   * informativo, resolvido inteiramente no backend (overrides.py monta o
   * texto final "Dentro/Fora do horário — <descrição>"), nenhum
   * componente do frontend precisa ler isso hoje. */
  variavelCalendario?: string;
}

export interface EdgeData {
  isBackEdge: boolean;
  transicaoId: string;
  acaoId: string;
  /** Numero do estado (NO_ESTADO) dono da transicao que gerou esta aresta -
   * mesmo em back edge (o back edge tem uma origem de verdade tambem; quem
   * decide ignorar isso e pintar de vermelho mesmo assim e o frontend, ver
   * App.tsx/coresEstado.ts). Sempre vem do backend, nunca vazio a menos que
   * a transicao nao tenha gerado nenhuma aresta (caso defensivo). */
  estadoOrigemId: string;
  /** Pontos de rota calculados pelo dagre (layout.ts) pras arestas que
   * pulam mais de uma coluna - sem eles a aresta vira uma reta que passa
   * por cima dos nos do meio do caminho. So preenchido no layout, nunca
   * vem do backend. */
  pontos?: Array<{ x: number; y: number }>;
  /** Cor resolvida (oklch) pro estado de origem desta aresta - computado
   * no front (App.tsx: mapaCoresEstado), nunca vem do backend; undefined
   * em back edge (fica sempre vermelha) ou quando o estado nao tem cor
   * atribuida. Mesmo padrao de `pontos`: campo preenchido depois que o
   * dado cru chega. */
  corEstadoOrigem?: string;
}

export interface GrafoReactFlow {
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: NodeData }>;
  edges: Array<{ id: string; source: string; target: string; data: EdgeData }>;
  botNome?: string;
}
