# Documentação do Editor de Bot (Extensão Orpen V3)

Este documento descreve a transformação do `EDITOR_BOT` original (que funcionava de forma *standalone* via upload/download de JSON) em uma **extensão de navegador Manifest V3**, injetada diretamente na tela da Orpen (`ContactCenter/bot.php`), bem como as melhorias e correções feitas em sua interface.

## 1. Arquitetura da Extensão (Manifest V3)

Para permitir a integração nativa sem modificar o código-fonte da Orpen, a pasta `EDITOR_BOT` foi estruturada para ser carregada diretamente como uma extensão ("Load unpacked") no Chrome ou Edge.

*   **Ponto de Injeção**: O *content script* `content/bootstrap.js` é injetado via `manifest.json` na URL da Orpen (`*://*/rcx/ContactCenter/bot.php*`).
*   **Shadow DOM**: Toda a interface do editor é injetada dentro de um Shadow DOM fechado (`mode: 'open'`, para depuração). Isso garante isolamento total do CSS (Bootstrap/Metronic legado da Orpen não vaza para dentro, e o Tailwind da extensão não vaza para fora).
*   **Interceptação de Clique**: O clique no botão nativo "Editar" é interceptado (via *event capture*). O handler bloqueia o modal antigo e exibe a interface nova. Caso o usuário queira acessar a tela antiga, basta usar `Shift+Clique`.
*   **Comunicação (Adapter)**: A extensão não usa o endpoint de exportação de arquivo, para evitar side-effects. Ela consulta os dados do bot através do endpoint `getBot` (que a tela antiga já usava) e os adapta (`js/orpen-adapter.js`) para o formato que o editor visual consome (`state.botCarregado`). Na hora de salvar, o *adapter* reconstrói o formato via form-urlencoded bracket-notation e submete ao endpoint nativo de update (`updateBot`).

## 2. Melhorias na Interface e UX

Várias melhorias visuais e funcionais foram feitas em resposta aos problemas do editor antigo e às demandas de uso:

*   **Ajuste de Escala (Zoom) e Rolagem**: A tela estava pequena demais devido ao isolamento e diferenças no Tailwind. Foi aplicado um cálculo de viewport e `zoom: 1.15` para tornar fontes e ícones perfeitamente legíveis. Além disso, quando o editor abre, a rolagem (scroll) do fundo (a tela da Orpen) é travada para evitar que o overlay se perca.
*   **Correção do Header cortado / espaçamento vertical assimétrico**: Na página `bot.php` da Orpen, um Bootstrap 3.4.1 vendorizado redefine `html { font-size: 10px }`, o que fazia qualquer margem em `rem` do modal encolher ~62% ali dentro (e não no ambiente de teste isolado). Combinado a um bug do Chromium (`align-items: center` + `zoom` empurra o item pra fora da viewport), o cabeçalho "Editar Bot - #ID" ficava cortado/escondido desde a abertura. Corrigido trocando `align-items: center` por `align-items: flex-start` no overlay e definindo `margin-top`/`margin-bottom` simétricos em `.bv-panel` com `calc(4vh / 1.15)` (unidades `vh`, que não dependem do `font-size` do host) — o modal agora sempre abre com o header visível e a mesma folga em cima e embaixo.
*   **Rodapé Fixo (Footer)**: O rodapé foi ajustado para manter os botões de ação ("Salvar e Fechar", "Cancelar") alinhados corretamente à direita e mais legíveis.
*   **Ocultação do Campo ID do Bot**: Como o número/ID do bot nunca deve ser alterado manualmente, o *input* que permitia sua edição foi removido visualmente da interface de configurações (para o usuário ele aparece fixo no topo da janela como `Editar Bot - #ID`), embora seus dados continuem compondo o pacote de salvamento no background.

## 3. Melhorias nas Opções e Autocomplete

Muitos dropdowns de condições que antes exibiam apenas IDs ou exigiam digitação manual agora possuem buscas inteligentes baseadas no ambiente Orpen atual.

*   **Captura do Ambiente Orpen**: O `content/bootstrap.js` agora também captura configurações disponíveis globalmente no JS da Orpen (variáveis, filas, agentes, calendários, etc.) usando `page-env-collector.js`, repassando-as para o Shadow DOM.
*   **Busca com Seleção Rápida (Enter)**: Em campos com `<datalist>`, ao pesquisar uma palavra e pressionar `Enter`, o editor automaticamente seleciona o registro exato correspondente (se o usuário digitar "estado" e der enter, ele pega a primeira ocorrência).
*   **Dicionário de Referências (`js/dictionaries.js`)**: O tipo genérico `ref` foi desmembrado em tipos específicos (`ref_calendario`, `ref_fila`, `ref_agente`, etc.). Isso permitiu popular os *datalists* corretos. Por exemplo, a condição "CALENDARIO" agora exibe o nome real do calendário disponível no sistema, em vez de exigir que o usuário digite seu ID bruto.

## 4. Correção: Condição "Sempre Verdadeiro"

Na interface anterior, a opção **"Sempre verdadeiro (else)"** aparecia disponível para todos os tipos de condição (enviando `condition_type: 0`). 

**O Problema**: Uma investigação aprofundada na engine PHP (`Bot.class.php`) revelou que isso só funciona para variáveis genéricas (como `message`). Variáveis especializadas (como `calendario`, `entrance_type`, `agent_on_queue`, etc.) são processadas *antes* no PHP e retornam prematuramente falha ao receber `0` como ID.
**A Solução**: A função de construção do dropdown (`buildOperatorOptions` no arquivo `js/bot-view-render.js`) foi adaptada. Foi criada uma constante `KINDS_COM_SEMPRE_VERDADEIRO` contendo estritamente os tipos de variáveis que suportam `case 0` com sucesso (texto livre, contato, contadores, opt-in, etc.). Nas demais variáveis em que causava quebra ou comportamento não suportado, a opção "Sempre verdadeiro" foi ocultada para evitar a criação de fluxos quebrados pelos administradores.

## 5. Exportar Fluxograma (PNG/SVG) — v0.4.0

O botão **"Gerar fluxograma"** no rodapé do editor gera o mesmo fluxograma que o app desktop **Fluxo BOT** exporta (Modo Cliente), com os nomes reais de fila, bot externo e calendário vindos dos cadastros da Orpen. Especificação completa, decisões e resultados de cada fase: `SPEC-exportar-fluxograma.md`.

**Como funciona:**
*   **Sempre o bot salvo.** Antes de gerar, o editor compara o que o botão "Salvar" enviaria com a versão salva (`state.baselineSalvo`). Se houver diferença, pergunta se pode salvar e usa o próprio `salvarBotNaOrpen`.
*   **Iframe invisível.** A geração roda numa página da própria extensão (`vendor/fluxograma/index.html`), num iframe **na tela com `opacity:0`**. Fora da tela, o Chrome congela o iframe e o desenho nunca termina. A conversa usa um `MessageChannel` entregue com nonce, então a página da Orpen não lê o arquivo gerado.
*   **Código:** `js/fluxograma-export.js` (lado extensão, carregado só no primeiro clique) e o subprojeto `fluxograma/` (lógica portada do Fluxo BOT + renderizador), cujo build é **commitado** em `vendor/fluxograma/`. Quem só instala a extensão não precisa de npm.

**Para quem desenvolve** (a partir de `fluxograma/`, com Node 24):
*   `npm install`, depois `npm test`: paridade com o Fluxo BOT (goldens gerados pelo Python original) e demais testes.
*   `npm run build`: tipagem + build do renderizador em `vendor/fluxograma/`. **Rode sempre depois de mexer em `fluxograma/src`**, senão a extensão continua com o build antigo.
*   `npm run golden -- --local <pasta com Backup JSON de bots reais>`: regenera os goldens com o Python do Fluxo BOT. Os bots reais ficam em `tests/golden_local/`, fora do git.
*   `npm run paridade:visual` (e `PARIDADE_FORMATO=svg npm run paridade:visual`): compara, pixel a pixel e num Chrome real, o fluxograma da extensão com o do build real do desktop.
*   `fluxograma/ORIGEM.md`: commit do Fluxo BOT espelhado (`7c9c976`) e o que fazer quando o desktop mudar.

## 6. Tema Claro — v0.5.0

O botão **sol/lua** no header do editor alterna entre os temas escuro (padrão) e claro. Especificação e decisões: `SPEC-tema-claro.md`.

**Como funciona:**
*   Todas as cores do editor são **tokens** (variáveis CSS de papel) em `css/styles.css`, definidos em `:host, :root` com os valores do tema escuro. O tema claro só redefine os valores em `:host([data-tema="claro"])`. **Cor nova no editor deve sempre usar um token**, nunca um valor fixo, senão ela fica igual nos dois temas.
*   O atributo `data-tema="claro"` vai no host do Shadow DOM (`#orpen-editor-bot-host`), aplicado por `orpen-bridge.js` **antes** de desenhar. Por isso editor, pendências, diálogo e toasts mudam juntos e não há flash.
*   A escolha fica em `localStorage['editorbot:tema']` na página da Orpen, sem permissão nova no manifest.

**Para quem desenvolve** (a partir de `fluxograma/`): `node scripts/capturasTema.mjs --tema escuro --saida ref` tira capturas de referência do editor (página standalone, Chrome real). Depois de uma mudança, `node scripts/capturasTema.mjs --tema escuro --comparar ref` diz se algo mudou pixel a pixel; `--tema claro` gera a prévia do claro. Saída em `tests/tema_out/`, fora do git.

## 7. Menu em Modal e "Armazenar variável" — v0.6.0

**Menu (ação 10)** — `js/menu-modal.js`: a ação mostra um resumo e o botão "Editar menu", que abre o modal com celular simulado (WhatsApp Botões, WhatsApp Lista e WebChat). Conteúdo que não é reconhecido como nenhum desses continua no builder antigo (`js/menu-builder.js`), pra nada ser sobrescrito.
*   **Fidelidade**: o Salvar edita o JSON original (`atualizarMenuPreservando`) em vez de montar um novo: só o que foi editado muda, campos opcionais só são criados se já existiam ou foram preenchidos, chaves extras e a indentação original ficam. Sem mudança, nada é gravado.
*   **ID/valor vazio** vira o texto com espaços trocados por `_`. Botão da lista vazio grava "Ver opções".
*   **WebChat**: o JSON do menu não tem texto; o campo de texto do modal é a ação "Mensagem" imediatamente anterior (editada no lugar, ou criada com `dividirMensagemDoMenu`). Voltar pra WhatsApp usa `absorverMensagemAnterior`.
*   `ACTION_DATA` é editado no próprio objeto: as chaves espelho numéricas (`withMirrors`) apontam pra ele.

**Armazenar variável (ação 13)** — `js/variaveis-builder.js`: linhas `variável ← valor` sobre o mesmo `bot_variables_text`, com autocomplete (variáveis da Orpen, retornos de scripts em `window.bot_variables` e variáveis usadas no bot). Só abre no modo visual quando todos os valores são texto; números, listas, JSON inválido ou chaves repetidas abrem no modo JSON.

**Arrastar**: `initEstadoReorderDnD` rola o `.bv-body` quando o mouse chega a 90px do topo/fim durante o arrasto.

## 8. Como Distribuir e Instalar a Extensão

Todo esse sistema roda 100% no navegador (client-side), com assets (Tailwind CSS, Lucide icons, renderizador do fluxograma) servidos localmente.
Para distribuir:
1. Envie o arquivo `EDITOR_BOT-v<versão>.zip`. Ele leva só o que a extensão usa: `manifest.json`, `bot_transform.html`, `content/`, `js/`, `css/`, `icons/`, `vendor/` (inclusive `vendor/fluxograma/`), `CHANGELOG.md` e esta documentação. O subprojeto `fluxograma/` (fonte, com `node_modules`) não vai.
2. O usuário deve extrair o ZIP em uma pasta do PC.
3. Acessar `chrome://extensions/` no Chrome/Edge.
4. Habilitar **Modo do Desenvolvedor** (Developer mode).
5. Clicar em **Carregar sem compactação** (Load unpacked) e selecionar a pasta extraída.
6. A partir daí, acessar a tela de Bot no Orpen e clicar em "Editar" normalmente.