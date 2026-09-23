// Cada ParserError do Python tem que sair com a MESMA mensagem no TS -
// e ela que vai pro toast de erro da extensao.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ParserError, montarBot } from "../src/core/parser";
import { DIR_TESTES } from "./apoio";

const { casos } = JSON.parse(readFileSync(join(DIR_TESTES, "golden", "erros.json"), "utf-8")) as {
  casos: Array<{ caso: string; entrada: unknown; mensagem: string }>;
};

// Depois deste marcador vem o texto interno do decodificador de JSON, que
// e do Python num lado e do JSON.parse no outro (divergencia aceita, ver
// ORIGEM.md).
const MARCADOR_DETALHE_JSON = "nao e JSON valido: ";

describe("mensagens de ParserError identicas as do Python", () => {
  test("existem casos", () => expect(casos.length).toBeGreaterThan(0));

  for (const { caso, entrada, mensagem } of casos) {
    test(caso, () => {
      let erro: unknown;
      try {
        montarBot(entrada);
      } catch (e) {
        erro = e;
      }
      expect(erro).toBeInstanceOf(ParserError);
      const obtida = (erro as ParserError).message;
      const corte = mensagem.indexOf(MARCADOR_DETALHE_JSON);
      if (corte >= 0) {
        expect(obtida.slice(0, corte + MARCADOR_DETALHE_JSON.length)).toBe(mensagem.slice(0, corte + MARCADOR_DETALHE_JSON.length));
      } else {
        expect(obtida).toBe(mensagem);
      }
    });
  }
});
