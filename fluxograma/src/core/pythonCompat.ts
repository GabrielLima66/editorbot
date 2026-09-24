// Comportamentos do Python que o JS faz diferente sem dar erro (tabela
// "Pontos de fidelidade do port" em SPEC-exportar-fluxograma.md). Todo
// modulo do port usa estas funcoes em vez do equivalente "obvio" do JS.
import he from "he";

/** Caracteres para os quais str.isspace() do Python e True. Difere do
 * \s / trim() do JS: o Python inclui 0x1C-0x1F e 0x85; o JS inclui U+FEFF (BOM). */
const PY_WS = "\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
export const PY_WS_CLASSE = `[${PY_WS}]`;
const RE_STRIP = new RegExp(`^[${PY_WS}]+|[${PY_WS}]+$`, "gu");
const RE_LSTRIP = new RegExp(`^[${PY_WS}]+`, "u");

/** str.strip() sem argumento. */
export function strip(s: string): string {
  return s.replace(RE_STRIP, "");
}

/** str.lstrip() sem argumento. */
export function lstrip(s: string): string {
  return s.replace(RE_LSTRIP, "");
}

// Montada por string (e nao literal /.../): os separadores U+2028/U+2029
// sao terminadores de linha no codigo-fonte JS.
const RE_SPLITLINES = new RegExp("\\r\\n|[\\n\\r\\v\\f\\x1c\\x1d\\x1e\\x85\\u2028\\u2029]", "u");

/** str.splitlines(): quebra em CRLF, LF, CR, VT, FF, 0x1C-0x1E, 0x85,
 * U+2028 e U+2029, sem elemento vazio no final. */
export function splitlines(s: string): string[] {
  const partes = s.split(RE_SPLITLINES);
  if (partes[partes.length - 1] === "") partes.pop();
  return partes;
}

/** str.isdigit() restrito a digitos ASCII - STATE_NUMBER vem de coluna
 * inteira na Orpen, entao digito nao-ASCII nao ocorre (limitacao
 * documentada em ORIGEM.md). */
export function isdigit(s: string): boolean {
  return /^[0-9]+$/.test(s);
}

/** int(x) do Python, para string (espacos nas pontas, sinal, '_' entre
 * digitos) ou numero inteiro. Lanca erro onde o Python lancaria ValueError. */
export function pyInt(v: unknown): number {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const t = strip(v);
    if (/^[+-]?[0-9]+(_[0-9]+)*$/.test(t)) return Number(t.replace(/_/g, ""));
  }
  throw new Error(`invalid literal for int(): ${String(v)}`);
}

/** Truthiness do Python: None, False, 0, "", [] e {} sao falsos. */
export function pyTruthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

export function ehDict(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Igualdade == do Python para valores vindos de JSON (bool e subclasse de
 * int: True == 1; listas e dicts comparam por conteudo). */
export function pyEq(a: unknown, b: unknown): boolean {
  const numerico = (x: unknown) => typeof x === "number" || typeof x === "boolean";
  if (numerico(a) && numerico(b)) return Number(a) === Number(b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => pyEq(x, b[i]));
  if (ehDict(a) && ehDict(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && pyEq(a[k], b[k]));
  }
  return a === b || (a == null && b == null);
}

/** Nome do tipo como o Python mostra em type(x).__name__. */
export function pyTypeName(v: unknown): string {
  if (v === null || v === undefined) return "NoneType";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
  if (typeof v === "string") return "str";
  if (Array.isArray(v)) return "list";
  return "dict";
}

/** Interpolacao de f-string ({x}) para valores primitivos vindos de JSON. */
export function pyStr(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  return String(v);
}

/** html.unescape (entidades HTML5, inclusive as legadas sem ';'). */
export function htmlUnescape(s: string): string {
  return he.decode(s);
}

/** Comparacao de strings por code point (como o Python), nao por unidade
 * UTF-16 (como o < do JS). */
export function compararStr(a: string, b: string): number {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next();
    const y = ib.next();
    if (x.done || y.done) return x.done === y.done ? 0 : x.done ? -1 : 1;
    const cx = x.value.codePointAt(0)!;
    const cy = y.value.codePointAt(0)!;
    if (cx !== cy) return cx < cy ? -1 : 1;
  }
}
