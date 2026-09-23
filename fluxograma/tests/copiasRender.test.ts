// src/render/ e copia byte a byte de Fluxo BOT/frontend/src no commit de
// ORIGEM.md (decisao D3 da spec: a camada de desenho nao e reescrita). Se
// alguem editar a copia, ou o commit de origem mudar sem re-copiar, isto
// acusa. Pula quando o repositorio do Fluxo BOT nao existe na maquina.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DIR_TESTES, commitDeOrigem } from "./apoio";

const FLUXO_BOT = process.env.FLUXO_BOT ?? "C:/Users/RCX/Desktop/Fluxo BOT";
const DIR_RENDER = join(DIR_TESTES, "..", "src", "render");
const COMMIT = commitDeOrigem();

describe.skipIf(!existsSync(join(FLUXO_BOT, ".git")))("src/render identico ao Fluxo BOT", () => {
  for (const arquivo of readdirSync(DIR_RENDER).sort()) {
    test(arquivo, () => {
      const original = execFileSync("git", ["-C", FLUXO_BOT, "show", `${COMMIT}:frontend/src/${arquivo}`]);
      expect(readFileSync(join(DIR_RENDER, arquivo)).equals(original)).toBe(true);
    });
  }
});
