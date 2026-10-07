# Cerne · Localizar (para IA)

Spec completa: `../02-localizar.md`. Código: `js/busca.js`, estilos `.bs-*`. Antes, leia `00-contrato.cerne.md`.

## Em uma frase

Busca em **todo o bot de uma vez**, em quatro tipos separados (Textos enviados, Condições, Calendários, Estados), e **leva até o campo** com o termo selecionado. Só lê; nunca altera o bot.

## O que explica o desenho

1. **Separar por tipo** evita misturar o que o bot **envia** com o que o cliente **digita**. Cada tipo tem cor, ícone e filtro com contador.
2. **O valor na tela vale mais que o do bot**: o editor só grava o campo ao perder o foco. A busca lê antes os campos visíveis (`a:<ação>:<campo>`, `c:<condição>`, `e:<estado>`).
3. **A posição retornada é no texto original.** A normalização (sem acento, sem maiúscula) mantém um mapa caractere a caractere para o destaque e a seleção caírem no lugar certo.
4. **Navegar não tira o foco da busca** (um Enter dentro de um campo de mensagem inseriria quebra de linha). Só o **clique** no resultado foca o campo.

## Correspondência (em pseudocódigo)

```
norm(texto): para cada char → NFD, tira marcas, minúscula (se !Aa); guarda origem[i]
achar(texto, termo): sem sobreposição; palavraInteira = vizinhos não são [\p{L}\p{N}_]
resultado: {inicio: origem[i], fim: origem[fim-1]+1}   // posições do ORIGINAL
```

Uma ocorrência = um resultado. Termo vazio → nada.

## O que é lido (e o que não é)

- Ações: 1 `message_text`, 20 `message_content`, 21 `message_text`; ação 10 só pelo `parseMenuModel` (cabeçalho, corpo, rodapé, **títulos**, descrições, botão da lista, texto das opções WebChat, JSON cru se desconhecido). **Nunca** os `id` do menu.
- Condições: só `value` **string**. Listas (labels) ficam de fora.
- Calendário: condição `calendario`/`calendario_falso`, texto `"nome (ID n)"` ou `"ID n"`; **não** passa pela busca de texto de condições.
- Estados: `ALIAS`.
- **Fora:** destinos, URLs, payloads, formulário JSON, nomes de variáveis.

## Navegar até o alvo

1. Abrir o estado (nunca fechar).
2. Achar o elemento (`mudar-campo-acao`, `.menu-resumo`, `mudar-condicao-valor`, `.condicao-operador`, `.estado-alias`).
3. Rolar centralizado, piscar (`bs-alvo`, 1,6 s).
4. Só em **clique** e fora de calendário: focar e selecionar `[inicio, fim)`. **Calendário nunca recebe foco** (abriria a lista).

## Ao vivo

`input`/`change` em `#bv-estados` + `MutationObserver(childList)` → refaz com atraso de 200 ms, **mantendo a posição** pela `chave` do resultado (`a:`, `c:`, `k:`, `m:`, `e:` + índice da ocorrência). O contador também aparece na lupa com o painel fechado.

## Layout e atalhos

Painel fixo à direita (372 px); o editor ganha `busca-aberta` e **encolhe para a esquerda**. Ctrl/Cmd+F (sem Alt) abre, F3/Shift+F3 navegam, Esc fecha pela pilha de Esc. Com o **teste** em tamanho normal o Ctrl+F é ignorado; minimizado, funciona. Fechar o editor fecha o painel.

## Armadilhas

- Procurar elementos com `document` em vez de `getRootNode()`.
- Esquecer que `#bv-estados` é recriado: guardar referência a elemento não sobrevive.
- Montar a lista sem `escapeHtml` (nomes de estado e textos vêm do bot).
- Usar `rem` no painel (está fora do editor com zoom).
- Tratar `value` não string (arrays) como texto.
- Focar o campo de calendário.

## Validar

`node --test tests/editor/busca-calendario.test.mjs` cobre o texto de calendário. Para o resto, montar o editor num Shadow DOM e conferir: seleção exata do termo, ordem dos blocos, ao vivo ao duplicar um estado, Ctrl+F e Esc.
