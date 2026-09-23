// Paleta de cores por ESTADO DE ORIGEM da aresta (nao por tipo de no - ver
// tiposNo.ts pra isso). Indice fixo (nao formula de matiz calculada) pra
// bater byte-a-byte com o espelho em Python (backend/export/pdf.py:
// CORES_LEGENDA_ESTADOS) - a legenda do PDF descreve cores que ja foram
// desenhadas pelo front no SVG capturado, entao os dois lados tem que
// concordar sem depender de arredondamento de ponto flutuante bater igual
// nas duas linguagens. Mesmo padrao ja aceito hoje pro vermelho de back
// edge (duplicado literal em ArestaConversa.tsx + App.tsx).
//
// Matizes evitam ~[0,50) (reservado: vermelho de erro/back edge, hue 25) e
// ~[140,190) (reservado: teal de fim-de-fluxo, hue 165) - L/C fixos (so o
// matiz varia) pra nenhuma cor "pesar" mais que outra na legenda.
export const PALETA_CORES_ESTADO: string[] = [
  "oklch(70% 0.13 55)",
  "oklch(70% 0.13 80)",
  "oklch(70% 0.13 105)",
  "oklch(70% 0.13 125)",
  "oklch(70% 0.13 200)",
  "oklch(70% 0.13 220)",
  "oklch(70% 0.13 240)",
  "oklch(70% 0.13 260)",
  "oklch(70% 0.13 280)",
  "oklch(70% 0.13 300)",
  "oklch(70% 0.13 320)",
  "oklch(70% 0.13 340)",
];

// So digito (equivalente a str.isdigit() do Python) - NAO Number.isFinite,
// que aceita "1e5"/"0x2"/" 3"/"+5" como numero valido e faria esse lado
// discordar de pdf.py (legenda_cores_por_estado) sobre a ordem exata pra
// qualquer STATE_NUMBER que nao seja digito puro (o schema do bot nao
// garante isso - so exige presenca/unicidade, ver model.py/parser.py).
const RE_SO_DIGITOS = /^\d+$/;

/** Ordena numericamente quando os dois lados sao digito puro, senao por
 * string - mesmo criterio (mesma forma "numero primeiro, resto depois,
 * desempate pelo proprio valor nunca uma constante") do sort em pdf.py
 * (legenda_cores_por_estado), pra o indice modulo bater igual dos dois
 * lados mesmo com estado de id nao-numerico. */
function ordenarEstados(ids: Iterable<string>): string[] {
  return [...new Set(ids)].filter(Boolean).sort((a, b) => {
    const da = RE_SO_DIGITOS.test(a);
    const db = RE_SO_DIGITOS.test(b);
    if (da && db) return Number(a) - Number(b);
    if (da !== db) return da ? -1 : 1;
    return a.localeCompare(b);
  });
}

/** So recebe os estadoOrigemId de arestas NAO back edge (ver App.tsx) - um
 * estado cujas unicas saidas sao back edges nunca aparece colorido no
 * diagrama, entao nao precisa (nem deve) consumir um indice da paleta. */
export function corPorEstado(idsEstadosComArestaForward: Iterable<string>): Map<string, string> {
  const ordenados = ordenarEstados(idsEstadosComArestaForward);
  return new Map(ordenados.map((id, i) => [id, PALETA_CORES_ESTADO[i % PALETA_CORES_ESTADO.length]]));
}
