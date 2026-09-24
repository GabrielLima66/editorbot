// Icones de tipo de no (design_handoff_fluxobot_nodes.md, secao "Icones").
// So os tipos "escolha" (pilula) e "fim de fluxo"/defeito levam icone - o
// mockup deliberadamente deixa estado/mensagem sem icone (sao os dois tipos
// mais repetidos no diagrama; icone ali vira ruido). SVG inline em vez de
// fonte de icone: sem rede em runtime (restricao 01), e um <svg> pesa bem
// menos que uma fonte de icone so pra sete glifos.
import type { SVGProps } from "react";

const basePropsIcone: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/** condicao - bifurcacao: duas pontas convergindo num talo, como um
 * diapasao. Representa "o caminho se divide aqui". */
export function IconeCondicao(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...basePropsIcone} {...props}>
      <path d="M7 3v5a5 5 0 0 0 5 5 5 5 0 0 0 5-5V3" />
      <path d="M12 13v8" />
    </svg>
  );
}

/** calendario - folha de calendario com os dois "prendedores" no topo. */
export function IconeCalendario(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...basePropsIcone} {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

/** fila - headset de atendimento. */
export function IconeFila(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...basePropsIcone} {...props}>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="2.3" y="13" width="4.2" height="6.2" rx="1.6" />
      <rect x="17.5" y="13" width="4.2" height="6.2" rx="1.6" />
    </svg>
  );
}

/** bot_externo - cabeca de robo: antena, moldura, dois olhos, "orelhas". */
export function IconeBotExterno(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...basePropsIcone} {...props}>
      <path d="M12 2v3" />
      <circle cx="12" cy="1.6" r="0.9" fill="currentColor" stroke="none" />
      <rect x="5" y="6" width="14" height="12" rx="2.4" />
      <circle cx="9.4" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <path d="M2 11.5v3" />
      <path d="M22 11.5v3" />
    </svg>
  );
}

/** fila_dinamica - duas linhas cruzando (shuffle/redirecionamento). */
export function IconeFilaDinamica(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...basePropsIcone} {...props}>
      <path d="M4 17h3.4a2.2 2.2 0 0 0 1.9-1.1L13 10" />
      <path d="M4 7h3.4a2.2 2.2 0 0 1 1.9 1.1L11 11.3" />
      <path d="M14 7h6" />
      <path d="M17.2 4l2.8 3-2.8 3" />
      <path d="M14 17h6" />
      <path d="M17.2 14l2.8 3-2.8 3" />
    </svg>
  );
}

/** encerrado - simbolo de power padrao (circulo aberto + traco). */
export function IconeEncerrado(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...basePropsIcone} {...props}>
      <path d="M12 3v7" />
      <path d="M6.3 6.8a8 8 0 1 0 11.4 0" />
    </svg>
  );
}

/** orfao - triangulo de alerta com exclamacao. */
export function IconeOrfao(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...basePropsIcone} {...props}>
      <path d="M12 4 2.3 20h19.4L12 4z" />
      <path d="M12 10.2v4.8" />
      <circle cx="12" cy="17.6" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** botao "Legenda" na barra superior - painel lateral. */
export function IconePainelLateral(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...basePropsIcone} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </svg>
  );
}
