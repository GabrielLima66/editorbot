# Para o Claude (ou outro assistente de código): como usar esta pasta

Esta pasta `ia/` tem, para cada feature, um **resumo do cerne**: a ideia central, as regras que não podem ser quebradas, os algoritmos em pseudocódigo e os erros que mais acontecem. Ela **não substitui** a spec completa (arquivo de mesmo número na pasta acima) nem o código.

## Ordem de leitura (sempre esta)

1. `../COMECE-AQUI.md` e `../GLOSSARIO.md` (contexto e vocabulário).
2. `00-contrato.cerne.md` (todas as features dependem dele).
3. O resumo da feature em que você vai trabalhar.
4. A **seção de riscos** da spec completa da feature (diz onde o comportamento atual é discutível).
5. O código de referência em `../codigo-de-referencia/` (mesmos caminhos das specs). Em dúvida, leia o código antes de supor.

## Regras de trabalho

- **Não invente comportamento.** Se a spec e o código não dizem, pergunte ou registre como lacuna; não escolha em silêncio.
- **Siga as convenções do contrato** (seção 8 da spec 00): `getRootNode()` em vez de `document`; px em janelas; tokens de cor; `escapeHtml` em todo texto externo; features só leem o bot.
- **Reaproveite as funções prontas** (`nextId`, `withMirrors`, `remapStateNumbers`, `tipoDaCondicao`, `parseMenuModel`...) em vez de reescrevê-las. Assinaturas na seção 4 da spec 00.
- **Lógica em módulo puro + teste em Node primeiro**; depois a tela.
- **Não corrija o simulador do motor "para ficar certo"**: as manias (igualdade frouxa, "0" vira vazio, aspas simples sem escape, "Diferente de" sempre falso) são fiéis ao servidor de propósito.
- **Fluxograma = paridade.** Qualquer "melhoria" de regra, texto, cor ou layout quebra os testes golden.
- **O que está marcado "ainda não implementado"** (spec 05, seção 7) não existe: não afirme que existe e não o use.
- **Nada grava na Orpen** exceto o Salvar do editor.

## Modelo de pedido (copie e preencha)

> Leia `COMECE-AQUI.md`, `GLOSSARIO.md`, `ia/00-contrato.cerne.md`, `ia/0X-<feature>.cerne.md` e a seção de riscos de `0X-<feature>.md`. Depois leia os arquivos de código citados. Quero [objetivo]. Antes de escrever código, me diga em 5 linhas o que entendeu, o que está em aberto e o plano; escreva os testes puros primeiro.

## O que cada resumo traz

| Arquivo | Conteúdo |
|---|---|
| `00-contrato.cerne.md` | Formato do bot, regras do modelo, funções prontas, convenções. |
| `01-testar-bot.cerne.md` | Rodada, laço, condições, pausas, contexto, tela. |
| `02-localizar.cerne.md` | Tipos de resultado, normalização com mapa de posição, navegação. |
| `03-fluxograma.cerne.md` | Pipeline, regras do grafo, imagem, protocolo com o iframe. |
| `04-copiar-colar.cerne.md` | Trecho, regras de colagem, validação por ensaio. |
| `05-menu-acao-10.cerne.md` | Edição fiel do menu, gerador de tratamento (e o que NÃO existe). |
| `06-importar-transformar-json.cerne.md` | Página avulsa, bot em branco, transformação. |
| `07-atualizacao-novidades.cerne.md` | Aviso de versão, atualizador, Novidades. |
