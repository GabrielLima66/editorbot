// Port de Fluxo BOT backend/core/model.py (ver ORIGEM.md).
// Valores de ID ficam com o tipo que vieram no JSON (unknown), igual ao
// Python: um TRANSITION_ID numerico nao casa com um ID string, e os mapas
// sao Map (preserva ordem de insercao e distingue 5 de "5", como dict).

export type Dados = Record<string, unknown>;

export interface Condicao {
  id: unknown;
  transitionId: unknown;
  conditionType: unknown;
  conditionData: Dados;
}

export interface Acao {
  id: unknown;
  transitionId: unknown;
  actionType: unknown;
  actionData: Dados;
}

export interface Transicao {
  id: unknown;
  state: unknown;
  priority: number;
  condicoes: Condicao[];
  acoes: Acao[];
}

export interface Estado {
  id: unknown;
  stateNumber: unknown;
  alias: unknown;
  transicoes: Transicao[];
}

export class Bot {
  estados = new Map<unknown, Estado>();
  private indiceTransicoes: Map<unknown, Transicao> | null = null;

  constructor(
    public id: unknown,
    public name: unknown,
  ) {}

  estadoPorNumero(stateNumber: unknown): Estado | undefined {
    return this.estados.get(stateNumber);
  }

  /** Mesmo resultado da busca linear do Python (IDs de transicao sao unicos
   * - o parser rejeita duplicado), indexado na primeira chamada. */
  transicaoPorId(transicaoId: unknown): Transicao | undefined {
    if (!this.indiceTransicoes) {
      this.indiceTransicoes = new Map();
      for (const estado of this.estados.values()) {
        for (const t of estado.transicoes) {
          if (!this.indiceTransicoes.has(t.id)) this.indiceTransicoes.set(t.id, t);
        }
      }
    }
    return this.indiceTransicoes.get(transicaoId);
  }
}
