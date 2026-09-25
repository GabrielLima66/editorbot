# SPEC: Localizar no editor

Status: **Fase 1 implementada, aguardando teste do usuário** (25/09/2026). Fase 2 (substituir) pendente.

## Problema

Em bots grandes (o 50514 tem 72 estados e 249 transições) achar onde um texto aparece exige abrir estado por estado. Isso vale para:
- trocar um horário, um telefone ou o nome da empresa;
- revisar uma mensagem;
- achar a condição que trata uma palavra.

## Solução

Um painel **"Localizar"** encaixado à direita, fora do modal do editor. Ele abre com **Ctrl+F** ou com a lupa no cabeçalho, e fecha com Esc ou quando o editor fecha. Com ele aberto, o editor encolhe e vai para a esquerda, em vez de ficar por baixo do painel. Numa tela de 1366px, os dois cabem lado a lado.

### Modos exclusivos

Busca-se num modo por vez, para nunca misturar o que o bot envia com o que o cliente digita. Cada modo tem cor e ícone próprios:

| Modo | Onde busca | Cor |
|---|---|---|
| **Textos enviados** | Mensagem (1), mensagem de áudio (20), forma de contato (21) e menus (cabeçalho, corpo, rodapé, botões, opções e descrições, botão da lista; JSON cru se o formato não for reconhecido) | roxo |
| **Condições** | Valor das condições; o rótulo mostra variável e operador ("MENSAGEM Contém") | verde-azulado |
| **Estados** | Nome dos estados | laranja |

### Busca

- **Acentos e maiúsculas:** a busca ignora os dois ("horario" acha "Horário"). As opções **Aa** (diferenciar maiúsculas e minúsculas) e **palavra inteira** mudam isso.
- **Fonte dos dados:** `state.botCarregado`. O valor que está na tela tem prioridade, porque o editor só grava no bot quando você sai do campo. Assim a busca acompanha a digitação.
- **Um resultado por ocorrência:** a mesma mensagem com o termo duas vezes gera dois resultados.

### Navegação

- **Contador e setas:** "3 de 12", ▲/▼, Enter e Shift+Enter no campo, F3 e Shift+F3 em qualquer lugar do editor. Isso abre o estado se estiver fechado, rola até o campo e faz o campo piscar. **O foco continua na busca**, porque um Enter dentro do campo inseriria uma quebra de linha no texto do bot.
- **Clique num resultado:** vai até o campo, põe o foco nele e **seleciona o termo**, pronto para editar.
- **Resultado de menu:** leva ao cartão do menu. O lápis ao lado abre o modal do menu.
- **Lista:** agrupada por estado, com quantidade, caminho ("T2 · Mensagem") e trecho com o termo destacado.

### Ao vivo

A busca é refeita (debounce de 200 ms) quando:
- se digita em qualquer campo do editor;
- a lista de estados muda: excluir, duplicar, mover, salvar um menu, gerar tratamento ou reabrir o bot.

A posição atual é mantida no mesmo resultado, ou no seguinte se ele sumiu. A lupa do cabeçalho mostra a quantidade de resultados mesmo com o painel fechado.

## Fase 2: Substituir (pendente)

- **Substituir e Substituir tudo** no modo Textos enviados. Nos menus troca só textos, nunca IDs, pelo mesmo caminho que preserva o JSON (`atualizarMenuPreservando`).
- Tudo continua só no editor até o bot ser salvo.
- Nas condições, trocar valores pode quebrar os IDs de menu usados em estados CTRL. Por isso fica fora até ser decidido.

## Ideias para depois

- Buscas prontas: mensagens vazias, menus sem opção, links (`http`).
- Busca por variáveis `{$...}` ("onde uso `{$nome}`?").
