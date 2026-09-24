// Comportamento das funcoes de compatibilidade = comportamento do Python.
// Valores esperados conferidos no Python 3.14 do venv do Fluxo BOT.
// Caracteres invisiveis montados com String.fromCharCode: um U+2028
// literal no codigo-fonte e terminador de linha em JS.
import { describe, expect, test } from "vitest";
import {
  compararStr,
  htmlUnescape,
  isdigit,
  lstrip,
  pyEq,
  pyInt,
  pyStr,
  pyTruthy,
  pyTypeName,
  splitlines,
  strip,
} from "../src/core/pythonCompat";

const c = (n: number) => String.fromCharCode(n);
const BOM = c(0xfeff);
const LS = c(0x2028);
const NEL = c(0x85);

describe("strip / lstrip (str.strip do Python)", () => {
  test("remove espacos comuns e NBSP, como o trim", () => {
    expect(strip(" \t\n a b \r\n")).toBe("a b");
    expect(strip(`${c(0xa0)}x${c(0xa0)}`)).toBe("x");
  });
  test("NAO remove BOM (o trim do JS remove)", () => {
    expect(strip(BOM)).toBe(BOM);
    expect(BOM.trim()).toBe("");
  });
  test("remove 0x1C-0x1F e 0x85 (o trim do JS nao remove)", () => {
    expect(strip(`${c(0x1c)}${c(0x1f)}x${NEL}`)).toBe("x");
  });
  test("lstrip so do inicio", () => {
    expect(lstrip("  {x} ")).toBe("{x} ");
  });
});

describe("splitlines", () => {
  test("mesmos separadores do Python", () => {
    expect(splitlines(`a\r\nb\rc\nd${LS}e${NEL}f${c(0x1c)}g${c(0x0b)}h${c(0x0c)}i`)).toEqual(
      ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
    );
  });
  test("sem elemento vazio no fim; vazio vira lista vazia", () => {
    expect(splitlines("a\n")).toEqual(["a"]);
    expect(splitlines("a\n\n")).toEqual(["a", ""]);
    expect(splitlines("")).toEqual([]);
  });
  test("0x1F nao e separador de linha (so de espaco)", () => {
    expect(splitlines(`a${c(0x1f)}b`)).toEqual([`a${c(0x1f)}b`]);
  });
});

describe("pyInt (int() do Python)", () => {
  test("aceita espacos, sinal, zeros a esquerda e '_' entre digitos", () => {
    expect(pyInt(" 007 ")).toBe(7);
    expect(pyInt("-3")).toBe(-3);
    expect(pyInt("1_000")).toBe(1000);
    expect(pyInt(42)).toBe(42);
  });
  test("rejeita o que o Python rejeita", () => {
    for (const v of ["", "abc", "1.5", "1__0", "_1", "0x10", "1e3", null]) expect(() => pyInt(v)).toThrow();
  });
});

test("isdigit (ASCII)", () => {
  expect(isdigit("10")).toBe(true);
  expect(isdigit("")).toBe(false);
  expect(isdigit("A1")).toBe(false);
  expect(isdigit("-1")).toBe(false);
});

test("pyTruthy", () => {
  for (const v of [null, undefined, false, 0, "", [], {}]) expect(pyTruthy(v)).toBe(false);
  for (const v of [true, 1, "0", " ", [0], { a: 0 }]) expect(pyTruthy(v)).toBe(true);
});

test("pyEq (== do Python)", () => {
  expect(pyEq(true, 1)).toBe(true);
  expect(pyEq(1, 1.0)).toBe(true);
  expect(pyEq("7203", 7203)).toBe(false);
  expect(pyEq([1, { a: "x" }], [1, { a: "x" }])).toBe(true);
  expect(pyEq({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  expect(pyEq(null, null)).toBe(true);
});

test("pyTypeName / pyStr", () => {
  expect([null, true, 1, 1.5, "s", [], {}].map(pyTypeName)).toEqual(["NoneType", "bool", "int", "float", "str", "list", "dict"]);
  expect([null, true, false, 5, "x"].map(pyStr)).toEqual(["None", "True", "False", "5", "x"]);
});

test("htmlUnescape (html.unescape)", () => {
  expect(htmlUnescape("&quot;a&quot; &amp; &eacute; &#39;x&#x27;")).toBe(`"a" & é 'x'`);
  // entidades legadas sem ';' tambem sao decodificadas pelo Python
  expect(htmlUnescape("a &amp b")).toBe("a & b");
});

test("compararStr compara por code point, nao por unidade UTF-16", () => {
  const astral = String.fromCodePoint(0x1f600);
  const bmpAlto = c(0xffff);
  // Python: '￿' < '\U0001F600' e True; o < do JS da o contrario
  expect(compararStr(bmpAlto, astral)).toBe(-1);
  expect(bmpAlto < astral).toBe(false);
  expect(compararStr("A1", "B2")).toBe(-1);
  expect(compararStr("a", "a")).toBe(0);
  expect(compararStr("a", "ab")).toBe(-1);
});
