# Origem do port

Este subprojeto reproduz em TypeScript o fluxograma do app desktop **Fluxo BOT**
(`C:\Users\RCX\Desktop\Fluxo BOT`). A fidelidade é provada por testes golden: o
pipeline Python original gera a saída esperada e o TS precisa produzi-la
idêntica. Ver `SPEC-exportar-fluxograma.md` na raiz do EDITOR_BOT.

Commit espelhado: `7c9c976`

O teste de paridade falha se os goldens tiverem sido gerados a partir de outro
commit. Quando o Fluxo BOT mudar: re-portar o que mudou, rodar `npm run golden`,
`npm test` e atualizar o commit acima.

## Mapa arquivo Python → TS

| Fluxo BOT (`backend/core/`) | Aqui (`src/core/`) | Observação |
|---|---|---|
| `model.py` | `modelo.ts` | |
| `parser.py` | `parser.ts` | Entrada: objeto já carregado (`_montar_bot`), não caminho de arquivo. |
| `dicionarios.py` | `dicionarios.ts` | Só o que o fluxograma usa. |
| `mensagens.py` | `mensagens.ts` | Só o que o fluxograma usa. |
| `grafo.py` | `grafo.ts` | |
| `rotulos.py` | `rotulos.ts` | Só o que o fluxograma usa. |
| `filtro.py` | `filtro.ts` | Só o Modo Cliente (decisão P4). |
| `grafo_para_reactflow.py` | `grafoParaReactflow.ts` | |
| `overrides.py` (`aplicar_overrides_reactflow`) | `nomesAmbiente.ts` | Só os ramos fila/bot_externo/calendário, alimentados por `state.ambienteOrpen`. |
| `ui/janela.py` (`_atualizar`) | `pipeline.ts` | Sequência parser → grafo → filtro → React Flow → nomes. |
| — | `pythonCompat.ts` | Comportamentos do Python que o JS faz diferente (strip, splitlines, int, ==, truthiness, unescape…). |

## Divergências conhecidas e aceitas

Todas só acontecem com dado que a Orpen não produz; nenhuma aparece nos goldens.

- **IDs e `STATE_NUMBER` não-string** viram string nos ids dos nós (`pyStr`). Na
  Orpen e no adapter da extensão eles já são sempre string.
- **Dígito não-ASCII em `STATE_NUMBER`** (ex.: `٣`) é tratado como não numérico
  na ordenação da DFS; o Python ordenaria como número. `STATE_NUMBER` é coluna
  inteira na Orpen. (No texto de menu, dígitos Unicode são suportados, como no
  Python.)
- **Mensagem de erro de JSON inválido na chave `"3"`**: o prefixo é idêntico
  (`… nao e JSON valido:`), mas o detalhe depois dele vem do `JSON.parse` do JS,
  não do `json` do Python.
- **`NaN`/`Infinity` em JSON aninhado**: o Python aceita, o `JSON.parse` não (o
  campo é tratado como JSON inválido, igual a qualquer outro erro de parse).
- **Dado de tipo inválido que faria o Python quebrar** (ex.: `interactive` como
  string, `destiny` numérico numa checagem de `{$`): o TS trata como ausente em
  vez de lançar exceção.

## Ordem de entrada

A ordem de `BOT_STATES`/`BOT_TRANSITIONS`/`BOT_CONDITIONS` muda o layout (o dagre
depende da ordem de inserção). O `getBot` que a extensão usa ordena estados por
número, transições por estado + prioridade, e condições/ações por ID. O
`exportBotJSON` nativo da Orpen **não tem `ORDER BY`**. Por isso, na comparação
com o desktop, use sempre o "Backup JSON" da extensão como entrada dos dois
lados, e não o export nativo da Orpen.
