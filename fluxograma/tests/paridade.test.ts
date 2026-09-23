// Paridade com o Fluxo BOT: para cada golden (gerado pelo pipeline Python
// original), o port TS precisa produzir o MESMO JSON React Flow, inclusive a
// ordem de nodes e edges (o layout do dagre depende dela).
import { describe, expect, test } from "vitest";
import { gerarGrafoReactFlow } from "../src/core/pipeline";
import { GOLDENS, GOLDENS_LOCAIS, commitDeOrigem, lerFixture, paraFormaExtensao, type Golden } from "./apoio";

const COMMIT = commitDeOrigem();

function conferir(golden: Golden) {
  const { dados, sha256 } = lerFixture(golden.caminhoFixture);

  test("golden gerado do commit declarado em ORIGEM.md, sem alteracoes locais", () => {
    expect(golden.origem.commit).toBe(COMMIT);
    expect(golden.origem.alteracoesLocais).toBe(false);
  });

  test("fixture nao mudou desde que o golden foi gerado", () => {
    expect(sha256).toBe(golden.fixtureSha256);
  });

  test("JSON exportado -> mesmo resultado do Python", () => {
    const { nodes, edges } = gerarGrafoReactFlow(dados, golden.nomes);
    expect({ nodes, edges }).toStrictEqual(golden.resultado);
  });

  test("formato state.botCarregado da extensao -> mesmo resultado do Python", () => {
    const { nodes, edges } = gerarGrafoReactFlow(paraFormaExtensao(dados as Record<string, unknown>), golden.nomes);
    expect({ nodes, edges }).toStrictEqual(golden.resultado);
  });
}

describe("goldens commitados (sinteticos)", () => {
  test("existem goldens", () => expect(GOLDENS.length).toBeGreaterThan(0));
  for (const g of GOLDENS) describe(g.arquivo, () => conferir(g));
});

describe.skipIf(GOLDENS_LOCAIS.length === 0)("goldens locais (bots reais, fora do git)", () => {
  for (const g of GOLDENS_LOCAIS) describe(g.arquivo, () => conferir(g));
});
