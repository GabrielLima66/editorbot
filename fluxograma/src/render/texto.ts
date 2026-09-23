// Truncamento de mensagem (SPEC secao 2, passo 5): ate N caracteres,
// cortando em fim de frase quando possivel, com "..." indicando corte.
// Espelha a logica que existia no lado Python antes da mudanca de
// arquitetura - agora mora aqui porque e o componente de no React quem
// decide o texto exibido, nao o layout.
import type { NodeData } from "./types";

export const LIMITE_PADRAO = 200;
export const TEXTO_AGUARDA_MENSAGEM = "Aguarda mensagem do cliente";

const PROPORCAO_MINIMA_DE_CORTE = 0.4;
const RE_FIM_DE_FRASE = /[.!?](?=\s|$)/g;

export function truncarMensagem(texto: string, limite: number = LIMITE_PADRAO): string {
  const t = texto.trim();
  if (t.length <= limite) return t;

  const janela = t.slice(0, limite);
  const cortes: number[] = [];
  let m: RegExpExecArray | null;
  RE_FIM_DE_FRASE.lastIndex = 0;
  while ((m = RE_FIM_DE_FRASE.exec(janela)) !== null) {
    cortes.push(m.index + 1);
  }
  const ultimoCorte = cortes[cortes.length - 1];
  if (ultimoCorte !== undefined && ultimoCorte > limite * PROPORCAO_MINIMA_DE_CORTE) {
    return t.slice(0, ultimoCorte).trimEnd() + "…";
  }
  return janela.trimEnd() + "…";
}

// Rotulo de "acao do sistema" (transferir, encerrar, aguardar, mensagem
// interativa sem texto) vem do backend cercado por *asteriscos* - convencao
// de ORIGEM marcando "isso nao e fala literal do bot". No sistema visual
// novo quem sinaliza isso e o kicker + icone do card (ver conteudoDoNo),
// entao aqui so precisa sumir com os asteriscos - nunca aparecer crus na
// tela.
const RE_ENFASE = /^\*([\s\S]+)\*$/;
function semAsterisco(rotulo: string): string {
  const m = RE_ENFASE.exec(rotulo);
  return m ? m[1] : rotulo;
}

const KICKERS_FIXOS: Record<string, string> = {
  fila: "FILA",
  bot_externo: "BOT EXTERNO",
  fila_dinamica: "FILA DINÂMICA",
  encerrado: "ENCERRADO",
  orfao: "ÓRFÃO · ERRO",
};

export interface ConteudoNo {
  /** Legenda pequena versalete no topo do card - papel/status do no, nunca
   * editavel (estrutural, nao dado do bot). */
  kicker: string;
  /** So preenchido no tipo "estado" quando aguarda resposta: mostra o ALIAS
   * como titulo em negrito ACIMA do texto "Aguarda mensagem do cliente" -
   * sem isso perde-se qual estado especifico esta esperando. */
  titulo: string | null;
  corpo: string;
  opcoes: string[];
}

/** Conteudo final do card, em ordem de prioridade dentro de cada tipo:
 * override de nomenclatura (SPEC secao 3, sempre ganha o CORPO, nunca o
 * kicker - kicker e estrutural) -> mensagem truncada (so NO_MENSAGEM) ->
 * ALIAS/rotulo padrao. Substitui o antigo textoDoNo: agora o card tem ate
 * tres blocos de texto (kicker/titulo/corpo), nao um so. */
export function conteudoDoNo(data: NodeData, limite: number = LIMITE_PADRAO): ConteudoNo {
  const opcoes = data.opcoesMenu ?? [];

  if (data.tipo === "estado") {
    if (data.overrideRotulo) return { kicker: "ESTADO", titulo: null, corpo: data.overrideRotulo, opcoes: [] };
    if (data.aguardaResposta) {
      return { kicker: "AGUARDANDO", titulo: data.rotulo, corpo: TEXTO_AGUARDA_MENSAGEM, opcoes: [] };
    }
    return { kicker: "ESTADO", titulo: null, corpo: data.rotulo, opcoes: [] };
  }

  if (data.tipo === "mensagem") {
    const corpo = data.overrideRotulo ?? (data.mensagem ? truncarMensagem(data.mensagem, limite) : semAsterisco(data.rotulo));
    return { kicker: opcoes.length > 0 ? "MENU" : "MENSAGEM", titulo: null, corpo, opcoes };
  }

  if (data.tipo === "condicao" || data.tipo === "calendario") {
    const base = data.tipo === "condicao" ? "CONDIÇÃO" : "CALENDÁRIO";
    const naoResolvido = data.naoResolvida && !data.overrideRotulo;
    const sufixo = data.tipo === "condicao" ? "NÃO RESOLVIDA" : "NÃO RESOLVIDO";
    return {
      kicker: naoResolvido ? `${base} · ${sufixo}` : base,
      titulo: null,
      corpo: data.overrideRotulo ?? data.rotulo,
      opcoes: [],
    };
  }

  // fila / bot_externo / fila_dinamica / encerrado / orfao - rotulo padrao
  // sempre vem cercado de asterisco do backend (ver dicionarios.py).
  return {
    kicker: KICKERS_FIXOS[data.tipo] ?? data.tipo.toUpperCase(),
    titulo: null,
    corpo: data.overrideRotulo ?? semAsterisco(data.rotulo),
    opcoes: [],
  };
}
