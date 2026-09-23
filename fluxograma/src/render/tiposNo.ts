// Tabela de aparencia por tipo de no - fonte unica de verdade pro card
// (NoEstado.tsx), pro calculo de layout (layout.ts) e pro minimapa
// (Canvas.tsx). Valores vem do handoff de design ("Interface improvement
// request/design_handoff_fluxobot_nodes.md") - quatro papeis semanticos
// (percurso, escolha, fim de fluxo, defeito) mais os tres estados de
// interacao (foco/vizinho/apagado), que ficam em tema.css por serem
// independentes de tipo.
import type { ComponentType, SVGProps } from "react";
import {
  IconeBotExterno,
  IconeCalendario,
  IconeCondicao,
  IconeEncerrado,
  IconeFila,
  IconeFilaDinamica,
  IconeOrfao,
} from "./icones";

export type Forma = "retangulo" | "retangulo-barra" | "pilula";

export interface AparenciaTipo {
  /** Papel semantico (agrupa a legenda: Percurso / Escolha / Fim de fluxo / Defeito). */
  grupo: "percurso" | "escolha" | "fim-de-fluxo" | "defeito";
  rotuloLegenda: string;
  forma: Forma;
  fundo: string;
  borda: string;
  /** Cor do texto de destaque (kicker) e do icone, quando ha um. */
  acento: string;
  /** so nos tipos "fim de fluxo" - a faixa solida de 3px embaixo do card. */
  barra?: string;
  tracejado?: boolean;
  Icone?: ComponentType<SVGProps<SVGSVGElement>>;
}

export const TIPOS_PILULA = new Set(["condicao", "calendario"]);

export const APARENCIA: Record<string, AparenciaTipo> = {
  estado: {
    grupo: "percurso",
    rotuloLegenda: "Estado",
    forma: "retangulo",
    fundo: "#3f424d",
    borda: "#595d6c",
    acento: "#cfd3e5",
  },
  mensagem: {
    grupo: "percurso",
    rotuloLegenda: "Mensagem",
    forma: "retangulo",
    fundo: "#2b2741",
    borda: "#423a6a",
    acento: "#d2cefd",
  },
  condicao: {
    grupo: "escolha",
    rotuloLegenda: "Condição",
    forma: "pilula",
    fundo: "#2b2741",
    borda: "#968ae0",
    acento: "#d2cefd",
    Icone: IconeCondicao,
  },
  calendario: {
    grupo: "escolha",
    rotuloLegenda: "Calendário",
    forma: "pilula",
    fundo: "#2b2741",
    borda: "#5d5294",
    acento: "#d2cefd",
    Icone: IconeCalendario,
  },
  fila: {
    grupo: "fim-de-fluxo",
    rotuloLegenda: "Fila",
    forma: "retangulo-barra",
    fundo: "oklch(20% 0.025 165)",
    borda: "oklch(50% 0.07 165)",
    barra: "oklch(68% 0.11 165)",
    acento: "oklch(78% 0.09 165)",
    Icone: IconeFila,
  },
  bot_externo: {
    grupo: "fim-de-fluxo",
    rotuloLegenda: "Bot externo",
    forma: "retangulo-barra",
    fundo: "oklch(20% 0.025 165)",
    borda: "oklch(50% 0.07 165)",
    barra: "oklch(68% 0.11 165)",
    acento: "oklch(78% 0.09 165)",
    Icone: IconeBotExterno,
  },
  fila_dinamica: {
    grupo: "fim-de-fluxo",
    rotuloLegenda: "Fila dinâmica",
    forma: "retangulo-barra",
    fundo: "oklch(20% 0.025 165)",
    borda: "oklch(50% 0.07 165)",
    barra: "oklch(68% 0.11 165)",
    acento: "oklch(78% 0.09 165)",
    Icone: IconeFilaDinamica,
  },
  encerrado: {
    grupo: "fim-de-fluxo",
    rotuloLegenda: "Encerrado",
    forma: "retangulo-barra",
    fundo: "#292b31",
    borda: "#595d6c",
    barra: "oklch(55% 0.02 165)",
    acento: "#b2b6ca",
    Icone: IconeEncerrado,
  },
  orfao: {
    grupo: "defeito",
    rotuloLegenda: "Órfão",
    forma: "retangulo",
    fundo: "oklch(26% 0.05 25)",
    borda: "oklch(64% 0.19 25)",
    acento: "oklch(72% 0.17 25)",
    tracejado: true,
    Icone: IconeOrfao,
  },
};

/** Fallback pro minimapa/qualquer consumidor que so precise da cor de
 * fundo por tipo (Canvas.tsx). */
export const CORES: Record<string, string> = Object.fromEntries(
  Object.entries(APARENCIA).map(([tipo, a]) => [tipo, a.fundo]),
);

export const APARENCIA_PADRAO = APARENCIA.estado;
