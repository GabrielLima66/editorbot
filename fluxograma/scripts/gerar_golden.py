"""Gera os goldens de paridade (SPEC-exportar-fluxograma.md, Fase 1).

Roda o pipeline Python ORIGINAL do Fluxo BOT (importado via sys.path, sem
modificar aquele repositorio) e grava o JSON React Flow esperado para cada
fixture. O port TS (fluxograma/src/core) precisa produzir exatamente isso.

Uso (com o Python do venv do Fluxo BOT):
    "<Fluxo BOT>/.venv/Scripts/python.exe" fluxograma/scripts/gerar_golden.py
    ... gerar_golden.py --local <pasta com Backup JSON de bots reais>

Sinteticos -> tests/fixtures + tests/golden (commitados).
Reais (fixtures_reais do Fluxo BOT + --local) -> tests/golden_local (gitignored).
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
FLUXO_BOT = Path(os.environ.get("FLUXO_BOT", r"C:\Users\RCX\Desktop\Fluxo BOT"))
sys.path.insert(0, str(FLUXO_BOT))

from backend.core.filtro import MODO_CLIENTE, filtrar_grafo  # noqa: E402
from backend.core.grafo import NO_BOT_EXTERNO, NO_CALENDARIO, NO_FILA, construir_grafo  # noqa: E402
from backend.core.grafo_para_reactflow import grafo_para_reactflow  # noqa: E402
from backend.core.overrides import Overrides, aplicar_overrides_reactflow  # noqa: E402
from backend.core.parser import ParserError, carregar_bot  # noqa: E402


def _git(*args: str) -> str:
    return subprocess.run(["git", "-C", str(FLUXO_BOT), *args], capture_output=True, text=True, check=True).stdout.strip()


def origem() -> dict:
    sujo = _git("status", "--porcelain", "--", "backend/core", "frontend/src")
    return {"commit": _git("rev-parse", "--short", "HEAD"), "alteracoesLocais": bool(sujo)}


def _sha(caminho: Path) -> str:
    return hashlib.sha256(caminho.read_bytes()).hexdigest()


def pipeline(dados: dict) -> dict:
    bot = carregar_bot(copy.deepcopy(dados))
    grafo = filtrar_grafo(bot, construir_grafo(bot), MODO_CLIENTE)
    return grafo_para_reactflow(bot, grafo)


def nomes_de_teste(resultado: dict) -> dict:
    """Nome ficticio pra toda referencia de fila/bot externo/calendario do
    fixture. Quando o tipo tem 2+ referencias, a ultima fica sem nome pra
    cobrir o caso 'sem correspondencia no ambiente'; com 1 so, ela ganha
    nome (senao o ramo 'com nome' daquele tipo nunca seria exercitado)."""
    # Le do resultado FINAL (nao do Grafo): os nos de calendario so nascem
    # em grafo_para_reactflow (_inserir_nos_de_condicao).
    refs: dict[str, list[str]] = {"filas": [], "bots": [], "calendarios": []}
    chave_por_tipo = {NO_FILA: "filas", NO_BOT_EXTERNO: "bots", NO_CALENDARIO: "calendarios"}
    for no in resultado["nodes"]:
        chave = chave_por_tipo.get(no["data"]["tipo"])
        ref = no["data"]["referencia"]
        if chave and ref not in refs[chave]:
            refs[chave].append(ref)
    return {
        chave: {
            ref: f"[{ref}] Nome de teste {chave} {i + 1}"
            for i, ref in enumerate(lista[:-1] if len(lista) > 1 else lista)
        }
        for chave, lista in refs.items()
    }


def gravar(destino: Path, conteudo: dict) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(conteudo, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def gerar_para(fixture: Path, pasta_fixtures: Path, pasta_golden: Path, org: dict) -> None:
    copia = pasta_fixtures / fixture.name
    if fixture.resolve() != copia.resolve():
        copia.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(fixture, copia)
    dados = json.loads(copia.read_text(encoding="utf-8"))
    base = {"origem": org, "fixture": copia.name, "fixtureSha256": _sha(copia)}

    semNomes = pipeline(dados)
    gravar(pasta_golden / f"{fixture.stem}.json", {**base, "resultado": semNomes})

    nomes = nomes_de_teste(semNomes)
    comNomes = pipeline(dados)
    overrides = Overrides(bots_externos=dict(nomes["bots"]), calendarios=dict(nomes["calendarios"]))
    aplicar_overrides_reactflow(comNomes, overrides, dict(nomes["filas"]))
    gravar(pasta_golden / f"{fixture.stem}.nomes.json", {**base, "nomes": nomes, "resultado": comNomes})
    print(f"  {fixture.name}: {len(semNomes['nodes'])} nos, {len(semNomes['edges'])} arestas")


# Casos de erro: cada um e uma mutacao de um fixture valido que tem que
# gerar ParserError - o TS precisa gerar a MESMA mensagem.
def casos_de_erro(base: dict) -> list[tuple[str, object]]:
    def mut(fn):
        d = copy.deepcopy(base)
        fn(d)
        return d

    t0 = base["BOT_TRANSITIONS"][0]["ID"]
    return [
        ("raiz nao e objeto", [1, 2]),
        ("sem ID", mut(lambda d: d.pop("ID"))),
        ("sem NAME", mut(lambda d: d.pop("NAME"))),
        ("BOT_STATES vazio", mut(lambda d: d.__setitem__("BOT_STATES", []))),
        ("estado sem ALIAS", mut(lambda d: d["BOT_STATES"][0].pop("ALIAS"))),
        ("STATE_NUMBER duplicado", mut(lambda d: d["BOT_STATES"].append(copy.deepcopy(d["BOT_STATES"][0])))),
        ("transicao orfa", mut(lambda d: d["BOT_TRANSITIONS"][0].__setitem__("STATE", "99999"))),
        ("PRIORITY nao inteiro", mut(lambda d: d["BOT_TRANSITIONS"][0].__setitem__("PRIORITY", "alta"))),
        ("transicao duplicada", mut(lambda d: d["BOT_TRANSITIONS"].append(copy.deepcopy(d["BOT_TRANSITIONS"][0])))),
        ("condicao com TRANSITION_ID inexistente", mut(lambda d: d["BOT_CONDITIONS"][0].__setitem__("TRANSITION_ID", "99999"))),
        ("acao com TRANSITION_ID inexistente", mut(lambda d: d["BOT_ACTIONS"][0].__setitem__("TRANSITION_ID", "99999"))),
        ("acao com ID nao numerico", mut(lambda d: d["BOT_ACTIONS"].extend([
            {**copy.deepcopy(d["BOT_ACTIONS"][0]), "ID": "abc", "TRANSITION_ID": t0},
            {**copy.deepcopy(d["BOT_ACTIONS"][0]), "ID": "1", "TRANSITION_ID": t0},
        ]))),
        ("CONDITION_DATA via chave 3 invalida", mut(lambda d: d["BOT_CONDITIONS"][0].update({"CONDITION_DATA": "", "3": "{nao e json"}))),
        ("ACTION_DATA via chave 3 nao objeto", mut(lambda d: d["BOT_ACTIONS"][0].update({"ACTION_DATA": None, "3": "[1,2]"}))),
        ("ACTION_DATA de tipo errado", mut(lambda d: d["BOT_ACTIONS"][0].update({"ACTION_DATA": 42}))),
    ]


def gerar_erros(base_fixture: Path, destino: Path, org: dict) -> None:
    base = json.loads(base_fixture.read_text(encoding="utf-8"))
    casos = []
    for nome, entrada in casos_de_erro(base):
        try:
            montar_bot(entrada)
        except ParserError as e:
            casos.append({"caso": nome, "entrada": entrada, "mensagem": str(e)})
            continue
        raise SystemExit(f"caso de erro '{nome}' NAO gerou ParserError - revisar o gerador")
    gravar(destino, {"origem": org, "casos": casos})
    print(f"  erros.json: {len(casos)} casos")


def montar_bot(entrada):
    # carregar_bot trata qualquer nao-dict como caminho de arquivo; o port TS
    # recebe o objeto ja carregado, entao o equivalente dele e _montar_bot.
    from backend.core.parser import _montar_bot

    return _montar_bot(entrada)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="append", default=[], help="pasta com JSONs de bots reais (golden_local)")
    args = ap.parse_args()

    org = origem()
    print(f"Fluxo BOT {org['commit']}{' (COM ALTERACOES LOCAIS!)' if org['alteracoesLocais'] else ''}")

    testes = RAIZ / "tests"
    print("Sinteticos:")
    sinteticos = sorted((FLUXO_BOT / "backend/tests/fixtures").glob("*.json"))
    # fixtures_extra: escritos a mao neste repo pra exercitar as armadilhas
    # Python x JS da spec (a tabela "Pontos de fidelidade do port").
    sinteticos += sorted((testes / "fixtures_extra").glob("*.json"))
    for f in sinteticos:
        gerar_para(f, testes / "fixtures", testes / "golden", org)
    gerar_erros(testes / "fixtures" / "template-sdr-1nivel-original.json", testes / "golden" / "erros.json", org)

    reais = sorted((FLUXO_BOT / "backend/tests/fixtures_reais").glob("*.json"))
    for pasta in args.local:
        reais += sorted(Path(pasta).glob("*.json"))
    if reais:
        print("Reais (golden_local, fora do git):")
        for f in reais:
            try:
                gerar_para(f, testes / "golden_local" / "fixtures", testes / "golden_local", org)
            except ParserError as e:
                print(f"  {f.name}: IGNORADO (ParserError: {e})")


if __name__ == "__main__":
    main()
