# Cerne · Fluxograma (para IA)

Spec completa: `../03-fluxograma.md`. Código: `fluxograma/` (pipeline e desenho, em TypeScript), `js/fluxograma-export.js` (lado da extensão), build em `vendor/fluxograma/`. Antes, leia `00-contrato.cerne.md`.

## Em uma frase

Gera uma **imagem (PNG/SVG) do fluxo do bot salvo**, idêntica à que o app desktop "Fluxo BOT" exporta no Modo Cliente. É um **port**: a fidelidade é o requisito número 1 e é provada por teste, não por olho.

## O que explica o desenho

1. **Fidelidade acima de tudo.** Não "melhore" regras do grafo, textos, cores ou layout: qualquer diferença quebra o teste de paridade com o desktop. Se algo parecer errado, trate como paridade e registre; não corrija sozinho.
2. **Sempre o bot salvo.** Se há alteração não salva, pede para salvar antes. A geração usa um `structuredClone` do bot; nunca muta o do editor.
3. **O desenho roda num iframe da extensão**, isolado do editor e da Orpen (CSS, fonte base de 10px, CSP). O iframe fica **dentro da tela e transparente**; fora da tela o Chrome o congela.
4. **A ordem faz parte do contrato**: nós e setas na ordem de criação, porque o layout (dagre) depende dela.

## Pipeline

```
bot → montarBot (valida; ações por ID numérico)
    → construirGrafo (nós/arestas por ação; back edges por DFS)
    → filtrarModoCliente (esconde transições de erro/contador/teste)
    → grafoParaReactflow (nós de condição/calendário no 1º salto; dados do nó)
    → aplicarNomesAmbiente (fila/bot/calendário com nome real)
    → layout dagre LR (medido com canvas) → desenho → captura (PNG/SVG)
```

Passos 1–5 puros (Node); 6–8 precisam de navegador.

## Regras do grafo que mais importam

- Por transição, percorrer as ações em ordem: **1/10/11** criam `mensagem:<ID da ação>`; **2** vai a estado (ou `fila_dinamica` se tem `{$`, ou `orfao` se o estado não existe); **5** → `fila:<n>`; **4** → `bot_externo:<n>`; **6** (sem transferência na transição) → nó único `encerrado`. As demais ações **não geram nó**.
- `fila`, `bot_externo`, `fila_dinamica`, `encerrado`, `orfao` são **compartilhados**; `mensagem` é um por ação.
- **Back edge** = a última seta que chega num estado **cinza** durante a DFS; DFS só sobre estados, pilha LIFO, partida ordenada `("0" primeiro, dígitos, resto)`.
- **Modo Cliente** esconde a transição com `error_count` (tipo ≠ 8, 9), com ação 8, ou com `#TESTE`/`#OK#` em algum texto.
- **Condição vira nó** no primeiro salto (seta que sai de estado): "de opção" (`message` igual/contém) tem prioridade sobre calendário. O texto vem do **mapa de opções do estado** (menu interativo `id→título` das transições que chegam; senão lista numerada `1 - Texto`; senão valor cru "não resolvido"). Várias condições de opção: **vale a última**.
- Rótulo: `Mensagem: <operador em minúsculas> "<opção>"`, com `(+N variação/variações)`.
- Nome real do ambiente entra como **dado do nó** (não como override): `[ID] nome` para bot, `nome` para fila e calendário; referência sem nome fica como está.

## Texto do cartão

Kicker em maiúsculas (`ESTADO`, `AGUARDANDO` com o alias como título, `MENSAGEM`/`MENU`, `CONDIÇÃO`, `CALENDÁRIO`, `FILA`, `BOT EXTERNO`, `FILA DINÂMICA`, `ENCERRADO`, `ÓRFÃO · ERRO`), asteriscos do rótulo removidos, mensagem truncada em 200 (corta no fim de frase se estiver depois de 40%). `*Mensagem interativa*` fica **com** asteriscos (paridade).

## Imagem

Fundo `#f4f5f7`, margem 6%, PNG ×2 / SVG ×1, `getViewportForBounds(…, 0.05, 4, 0.06)`. PNG acima de 16.384 px reduz a escala (igual ao desktop). SVG não abre em Word/PowerPoint (`foreignObject`): PNG é o padrão.

## Protocolo (extensão ↔ iframe)

`MessageChannel` entregue com **nonce** (no hash da URL do iframe); depois tudo pela porta privada. Pedido `{tipo:'gerar', id, bot, formato, ambiente}` → `progresso` (grafo, layout, render, captura) → `pronto` (ArrayBuffer transferido) ou `erro` (mensagem em português). Timeouts: 15 s conexão, 120 s geração, 30 s desenho. Uma geração por vez.

## Armadilhas Python × JS (cada uma tem teste)

Objeto JS com chave numérica **reordena** (use `Map`); DFS é pilha LIFO; comparador de estados é uma tupla; `int()`, `strip()`, `splitlines()`, `html.unescape` e `\d`/`\s` do Python diferem do JS; truthiness de `""`/`[]`; `setdefault` (o primeiro vence).

## Erros já vistos

- Iframe fora da tela → desenho não termina. Mantê-lo dentro da tela e invisível.
- Medir fonte antes de ela carregar → cartões com largura errada. `document.fonts.load` de cada fonte medida.
- Nome personalizado do desktop mostra asteriscos crus → não usar o caminho de override.
- Script inline no build → bloqueado pela CSP de extensão. Sem `singlefile`.
- Apresentar erro técnico do parser para bot sem estados → checar "sem estados" antes de tudo.

## Validar

`cd fluxograma && npx vitest run` (paridade com goldens, ordem estrita). Visual: `npm run paridade:visual` contra o build do desktop. Em tela: gerar PNG e SVG na página da Orpen e conferir diálogo de salvar, toast, download e que o editor continua utilizável.
