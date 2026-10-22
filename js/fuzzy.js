// ---------------------------------------------------------------------------
// Busca tolerante das listas de sugestões (combobox.js). Cada opção cai em uma
// de três faixas para o texto digitado:
//   1. contém o texto inteiro ("cobr" acha "Cobrança");
//   2. contém todas as palavras digitadas, em qualquer ordem ("sup cob" acha
//      "SUPORTE - Cobrança N2");
//   3. parecida: só com 3+ caracteres digitados; cada palavra casa por letras em
//      sequência a partir do começo de uma palavra do texto ("trnsf" acha
//      "Transferir") ou com 1 erro de digitação ("trasnferir"; palavras de 5+
//      letras).
// As faixas 1 e 2 são os resultados de sempre; a 3 só complementa. Sem acento e
// sem diferenciar maiúscula, como o resto da busca do editor.
// ---------------------------------------------------------------------------

export const FAIXA_EXATA = 1;
export const FAIXA_PALAVRAS = 2;
export const FAIXA_PARECIDA = 3;

const MINIMO_PARECIDA = 3;
// Em palavra de 4 letras um erro é 25% dela ("fila" ~ "fina"): só tolera erro
// de digitação a partir de 5.
const MINIMO_ERRO = 5;

export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const palavrasDe = (norm) => norm.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// Distância de edição com troca de letras vizinhas contando como 1 erro.
function distancia(a, b) {
  const n = a.length;
  const m = b.length;
  const d = Array.from({ length: n + 1 }, (_, i) => [i, ...new Array(m).fill(0)]);
  for (let j = 1; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[n][m];
}

// Letras de `q` em sequência dentro de `w`, começando na primeira letra de `w`.
// Devolve os "buracos" no meio (0 = colado), ou -1 se não casa.
function buracos(q, w) {
  if (w[0] !== q[0]) return -1;
  let pos = 0;
  for (let k = 1; k < q.length; k++) {
    pos = w.indexOf(q[k], pos + 1);
    if (pos < 0) return -1;
  }
  return pos + 1 - q.length;
}

// Menor custo de `q` contra as palavras do texto, ou null se nenhuma serve.
function custoDaPalavra(q, palavrasTexto) {
  let melhor = null;
  const tenta = (c) => { if (c !== null && (melhor === null || c < melhor)) melhor = c; };
  for (const w of palavrasTexto) {
    if (q.length < MINIMO_PARECIDA) {
      if (w.startsWith(q)) tenta(0);
      continue;
    }
    // Letras de uma abreviação ficam perto umas das outras: "trnsf" tem 1
    // buraco em "transferir"; "fila" teria 4 em "fidelização".
    const b = buracos(q, w);
    if (b >= 0 && b <= Math.floor(q.length / 2)) tenta(b);
    if (q.length >= MINIMO_ERRO) {
      // Só vale calcular a distância quando os tamanhos já permitem 1 erro.
      const inteira = Math.abs(q.length - w.length) <= 1 ? distancia(q, w) : 2;
      const inicio = w.length >= q.length - 1 ? distancia(q, w.slice(0, q.length)) : 2;
      const erros = Math.min(inteira, inicio);
      if (erros <= 1) tenta(erros === 0 ? 0 : 2);
    }
  }
  return melhor;
}

/**
 * Em que faixa `texto` cai para a `consulta`, e quão boa é (menos pontos =
 * melhor, só vale dentro da faixa 3). null: não casa.
 */
export function classificar(texto, consulta) {
  const alvo = normalizar(consulta).trim();
  if (!alvo) return { faixa: FAIXA_EXATA, pontos: 0 };
  const norm = normalizar(texto);
  if (norm.includes(alvo)) return { faixa: FAIXA_EXATA, pontos: 0 };
  const palavrasConsulta = palavrasDe(alvo);
  // Palavra de uma letra sozinha casaria com quase qualquer texto ("x y"): não
  // conta para a faixa de palavras.
  const palavrasLongas = palavrasConsulta.filter((p) => p.length > 1);
  if (palavrasConsulta.length > 1 && palavrasLongas.length && palavrasLongas.every((p) => norm.includes(p))) return { faixa: FAIXA_PALAVRAS, pontos: 0 };
  if (alvo.length < MINIMO_PARECIDA || !palavrasConsulta.length) return null;
  // Número digitado (ID, posição) só vale exato: as letras em sequência
  // achariam "123" dentro de "1203".
  if (palavrasConsulta.some((p) => /^\p{N}+$/u.test(p))) return null;
  const palavrasTexto = palavrasDe(norm);
  let pontos = 0;
  for (const q of palavrasConsulta) {
    const c = custoDaPalavra(q, palavrasTexto);
    if (c === null) return null;
    pontos += c;
  }
  return { faixa: FAIXA_PARECIDA, pontos };
}
