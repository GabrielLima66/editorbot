// Port de Fluxo BOT backend/core/grafo.py (ver ORIGEM.md).
// Ordem de insercao em `nos` (Map) e em `arestas` e parte do contrato: o
// layout do dagre depende dela.
import type { Acao, Bot, Transicao } from "./modelo";
import { opcoesDeAcaoMenu, textoDeAcaoEnvio } from "./mensagens";
import { ParserError, get, parseJsonAninhado } from "./parser";
import { compararStr, ehDict, isdigit, pyEq, pyInt, pyStr, strip } from "./pythonCompat";

export const NO_ESTADO = "estado";
export const NO_MENSAGEM = "mensagem";
export const NO_CONDICAO = "condicao";
export const NO_CALENDARIO = "calendario";
export const NO_FILA = "fila";
export const NO_BOT_EXTERNO = "bot_externo";
export const NO_ENCERRADO = "encerrado";
export const NO_FILA_DINAMICA = "fila_dinamica";
export const NO_ORFAO = "orfao";

const ACOES_DE_MENSAGEM = new Set(["1", "10", "11"]);
// \w do Python (str) = alfanumerico Unicode + "_"; o \w do JS e so ASCII.
const RE_INTERPOLADO = /\{\$([\p{L}\p{N}_]+)\}/u;

export interface No {
  id: string;
  tipo: string;
  rotulo: string;
  referencia: unknown;
  valoresObservados: unknown[];
  naoResolvida: boolean;
  opcoesMenu: string[];
  variavelCalendario: string;
}

export interface Aresta {
  origem: string;
  destino: string;
  transicaoId: unknown;
  acaoId: unknown;
  backEdge: boolean;
}

export class Grafo {
  constructor(
    public nos: Map<string, No> = new Map(),
    public arestas: Aresta[] = [],
  ) {}

  sucessores(noId: string): Aresta[] {
    return this.arestas.filter((a) => a.origem === noId);
  }

  predecessores(noId: string): Aresta[] {
    return this.arestas.filter((a) => a.destino === noId);
  }
}

export function novoNo(campos: Pick<No, "id" | "tipo" | "rotulo"> & Partial<No>): No {
  return { referencia: "", valoresObservados: [], naoResolvida: false, opcoesMenu: [], variavelCalendario: "", ...campos };
}

/** Chave de no: no Python o dict aceita o valor cru (STATE_NUMBER). Aqui o
 * id do no e sempre string (os ids compostos ja sao f-strings); o
 * STATE_NUMBER bruto e convertido com pyStr. */
export const idDoEstado = (stateNumber: unknown): string => pyStr(stateNumber);

function eInterpolado(destiny: unknown): boolean {
  return typeof destiny === "string" && destiny !== "" && destiny.includes("{$");
}

function nomeVariavel(destiny: string): string {
  const m = RE_INTERPOLADO.exec(destiny);
  return m ? m[1] : destiny;
}

function valoresPorVariavel(bot: Bot): Map<string, unknown[]> {
  const valores = new Map<string, unknown[]>();
  for (const estado of bot.estados.values()) {
    for (const transicao of estado.transicoes) {
      for (const acao of transicao.acoes) {
        if (acao.actionType !== "13") continue;
        const bruto = acao.actionData.bot_variables_text;
        if (typeof bruto !== "string" || strip(bruto) === "") continue;
        let obj: unknown;
        try {
          obj = parseJsonAninhado(bruto, `BOT_ACTIONS (id=${pyStr(acao.id)}): bot_variables_text`);
        } catch (e) {
          if (e instanceof ParserError) continue;
          throw e;
        }
        if (!ehDict(obj)) continue;
        for (const [chave, valor] of Object.entries(obj)) {
          const nome = chave.replace(/^\$+/u, "");
          if (!valores.has(nome)) valores.set(nome, []);
          const lista = valores.get(nome)!;
          if (!lista.some((v) => pyEq(v, valor))) lista.push(valor);
        }
      }
    }
  }
  return valores;
}

class ConstrutorGrafo {
  grafo = new Grafo();
  private valoresPorVariavel: Map<string, unknown[]>;
  /** Mesmo papel de `destiny in self.bot.estados`: casa pelo valor cru. */
  private estadosPorValor: Map<unknown, string>;

  constructor(private bot: Bot) {
    this.valoresPorVariavel = valoresPorVariavel(bot);
    this.estadosPorValor = new Map([...bot.estados.keys()].map((k) => [k, idDoEstado(k)]));
  }

  construir(): Grafo {
    for (const [numero, estado] of this.bot.estados) {
      const id = idDoEstado(numero);
      this.grafo.nos.set(id, novoNo({ id, tipo: NO_ESTADO, rotulo: pyStr(estado.alias), referencia: numero }));
    }
    for (const estado of this.bot.estados.values()) {
      for (const transicao of estado.transicoes) this.processarTransicao(idDoEstado(estado.stateNumber), transicao);
    }
    marcarBackEdges(this.grafo);
    return this.grafo;
  }

  private processarTransicao(origem: string, transicao: Transicao): void {
    let noAtual = origem;
    let houveTransferencia = false;
    for (const acao of transicao.acoes) {
      const tipo = acao.actionType;
      if (typeof tipo === "string" && ACOES_DE_MENSAGEM.has(tipo)) {
        const noMsg = this.noMensagem(acao);
        this.addAresta(noAtual, noMsg.id, transicao.id, acao.id);
        noAtual = noMsg.id;
      } else if (tipo === "2") {
        noAtual = this.arestaParaEstado(noAtual, transicao.id, acao.id, get(acao.actionData, "destiny", ""));
        houveTransferencia = true;
      } else if (tipo === "5") {
        noAtual = this.arestaParaFila(noAtual, transicao.id, acao.id, get(acao.actionData, "destiny", ""));
        houveTransferencia = true;
      } else if (tipo === "4") {
        noAtual = this.arestaParaBotExterno(noAtual, transicao.id, acao.id, get(acao.actionData, "destiny", ""));
        houveTransferencia = true;
      }
    }
    if (!houveTransferencia && transicao.acoes.some((a) => a.actionType === "6")) {
      const no = this.noEncerrado();
      this.addAresta(noAtual, no.id, transicao.id, "");
    }
  }

  private noMensagem(acao: Acao): No {
    const id = `${NO_MENSAGEM}:${pyStr(acao.id)}`;
    const texto = textoDeAcaoEnvio(acao);
    const no = novoNo({
      id,
      tipo: NO_MENSAGEM,
      rotulo: texto || "*Mensagem interativa*",
      referencia: acao.id,
      opcoesMenu: opcoesDeAcaoMenu(acao),
    });
    this.grafo.nos.set(id, no);
    return no;
  }

  private obterOuCriar(id: string, criar: () => No): No {
    let no = this.grafo.nos.get(id);
    if (!no) {
      no = criar();
      this.grafo.nos.set(id, no);
    }
    return no;
  }

  private noFilaDinamica(destiny: string): No {
    const variavel = nomeVariavel(destiny);
    const id = `${NO_FILA_DINAMICA}:${variavel}`;
    return this.obterOuCriar(id, () =>
      novoNo({
        id,
        tipo: NO_FILA_DINAMICA,
        rotulo: `*Transfere para fila dinâmica ({$${variavel}})*`,
        referencia: variavel,
        valoresObservados: [...(this.valoresPorVariavel.get(variavel) ?? [])],
      }),
    );
  }

  private noFila(numero: unknown): No {
    const id = `${NO_FILA}:${pyStr(numero)}`;
    return this.obterOuCriar(id, () =>
      novoNo({ id, tipo: NO_FILA, rotulo: `*Transfere para a fila ${pyStr(numero)}*`, referencia: numero }),
    );
  }

  private noBotExterno(numero: unknown): No {
    const id = `${NO_BOT_EXTERNO}:${pyStr(numero)}`;
    return this.obterOuCriar(id, () =>
      novoNo({ id, tipo: NO_BOT_EXTERNO, rotulo: `*Transfere para o bot ${pyStr(numero)}*`, referencia: numero }),
    );
  }

  private noEncerrado(): No {
    return this.obterOuCriar(NO_ENCERRADO, () =>
      novoNo({ id: NO_ENCERRADO, tipo: NO_ENCERRADO, rotulo: "*Encerra o atendimento*" }),
    );
  }

  private noOrfao(destiny: unknown): No {
    const id = `${NO_ORFAO}:${pyStr(destiny)}`;
    return this.obterOuCriar(id, () =>
      novoNo({ id, tipo: NO_ORFAO, rotulo: `*Erro: estado inexistente (${pyStr(destiny)})*`, referencia: destiny }),
    );
  }

  private arestaParaEstado(origem: string, transicaoId: unknown, acaoId: unknown, destiny: unknown): string {
    let no: No;
    if (eInterpolado(destiny)) no = this.noFilaDinamica(destiny as string);
    else if (this.estadosPorValor.has(destiny)) no = this.grafo.nos.get(this.estadosPorValor.get(destiny)!)!;
    else no = this.noOrfao(destiny);
    this.addAresta(origem, no.id, transicaoId, acaoId);
    return no.id;
  }

  private arestaParaFila(origem: string, transicaoId: unknown, acaoId: unknown, destiny: unknown): string {
    const no = eInterpolado(destiny) ? this.noFilaDinamica(destiny as string) : this.noFila(destiny);
    this.addAresta(origem, no.id, transicaoId, acaoId);
    return no.id;
  }

  private arestaParaBotExterno(origem: string, transicaoId: unknown, acaoId: unknown, destiny: unknown): string {
    const no = eInterpolado(destiny) ? this.noFilaDinamica(destiny as string) : this.noBotExterno(destiny);
    this.addAresta(origem, no.id, transicaoId, acaoId);
    return no.id;
  }

  private addAresta(origem: string, destino: string, transicaoId: unknown, acaoId: unknown): void {
    this.grafo.arestas.push({ origem, destino, transicaoId, acaoId, backEdge: false });
  }
}

function proximosEstados(grafo: Grafo, origemEstado: string): Array<[string, Aresta]> {
  const resultado: Array<[string, Aresta]> = [];
  const visitados = new Set([origemEstado]);
  const pilha = [origemEstado];
  while (pilha.length > 0) {
    const atual = pilha.pop()!;
    for (const aresta of grafo.sucessores(atual)) {
      const noDestino = grafo.nos.get(aresta.destino);
      if (noDestino === undefined) continue;
      if (noDestino.tipo === NO_ESTADO) resultado.push([aresta.destino, aresta]);
      else if (!visitados.has(aresta.destino)) {
        visitados.add(aresta.destino);
        pilha.push(aresta.destino);
      }
    }
  }
  return resultado;
}

/** Chave de ordenacao (sn != "0", not sn.isdigit(), int(sn) | sn), com
 * comparacao de tupla do Python. */
function compararEstados(a: string, b: string): number {
  const ka: [boolean, boolean, number | string] = [a !== "0", !isdigit(a), isdigit(a) ? pyInt(a) : a];
  const kb: [boolean, boolean, number | string] = [b !== "0", !isdigit(b), isdigit(b) ? pyInt(b) : b];
  if (ka[0] !== kb[0]) return ka[0] ? 1 : -1;
  if (ka[1] !== kb[1]) return ka[1] ? 1 : -1;
  if (typeof ka[2] === "number" && typeof kb[2] === "number") return ka[2] - kb[2];
  return compararStr(String(ka[2]), String(kb[2]));
}

function marcarBackEdges(grafo: Grafo): void {
  const BRANCO = 0;
  const CINZA = 1;
  const PRETO = 2;
  const cor = new Map<string, number>();
  for (const [id, no] of grafo.nos) if (no.tipo === NO_ESTADO) cor.set(id, BRANCO);

  const dfs = (atual: string): void => {
    cor.set(atual, CINZA);
    for (const [destino, aresta] of proximosEstados(grafo, atual)) {
      if (cor.get(destino) === CINZA) aresta.backEdge = true;
      else if (cor.get(destino) === BRANCO) dfs(destino);
    }
    cor.set(atual, PRETO);
  };

  const ordem = [...cor.keys()].sort(compararEstados);
  for (const estado of ordem) if (cor.get(estado) === BRANCO) dfs(estado);
}

export function estadoPorTransicao(grafo: Grafo): Map<unknown, string> {
  const resultado = new Map<unknown, string>();
  for (const aresta of grafo.arestas) {
    const noOrigem = grafo.nos.get(aresta.origem);
    if (noOrigem !== undefined && noOrigem.tipo === NO_ESTADO && !resultado.has(aresta.transicaoId)) {
      resultado.set(aresta.transicaoId, aresta.origem);
    }
  }
  return resultado;
}

export function construirGrafo(bot: Bot): Grafo {
  return new ConstrutorGrafo(bot).construir();
}
