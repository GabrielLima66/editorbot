# Specs das features (pacote para o time)

Estas specs descrevem **o que cada feature faz**, com precisão suficiente para o time implementar sem depender do código da Orpen. O que mexe direto com a Orpen (abrir, editar, salvar e interpretar o bot) **não está aqui**: é uma camada que já existe e que as features só consomem (ver o contrato).

## Como ler

1. Comece por `00-contrato-de-entrada.md`: o formato do bot, as tabelas de condições e ações, as funções prontas e as convenções obrigatórias. Todas as specs partem dele.
2. Leia a spec da feature. As marcadas **(detalhada)** são as que fogem do padrão do sistema e foram escritas com regras exatas, tabelas e casos de aceitação. As **(geral)** descrevem o comportamento e os limites; o time detalha a partir delas.
3. Cada spec termina com **critérios de aceitação** (casos que viram testes) e **riscos em aberto**.

## Índice

| # | Arquivo | Feature | Nível | Situação |
|---|---|---|---|---|
| 00 | `00-contrato-de-entrada.md` | Contrato de entrada (bot, cadastros, funções prontas, convenções) | — | pronta |
| 01 | `01-testar-bot.md` | Testar bot (simulador do motor + tela) | **detalhada** | pronta |
| 02 | `02-localizar.md` | Localizar (busca no editor) | **detalhada** | pronta |
| 03 | `03-fluxograma.md` | Gerar fluxograma (imagem do fluxo) | **detalhada** | pronta |
| 04 | `04-copiar-colar.md` | Copiar e colar estados entre bots | geral | pronta |
| 05 | `05-menu-acao-10.md` | Menu da ação 10 (botões, lista, WebChat, tratamento) | geral | pronta |
| 06 | `06-importar-transformar-json.md` | Importar e transformar JSON (página avulsa) | geral | pronta |
| 07 | `07-atualizacao-novidades.md` | Aviso de versão nova e "Novidades" | geral | pronta |

## Versão para IA

A pasta `ia/` tem, para as mesmas features, um resumo do **cerne**: a ideia central, as regras que não podem ser violadas, os algoritmos em pseudocódigo e os erros que mais acontecem. Serve para um assistente de código (como o Claude) entender a feature antes de abrir o código. Não substitui estas specs.

## Código de referência

A implementação atual de cada feature está em `js/` (nomes citados em cada spec) e os testes em `tests/editor/`. Rode `node --test "tests/editor/*.test.mjs"` para ver o comportamento esperado funcionando.
