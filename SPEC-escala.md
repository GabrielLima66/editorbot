# Spec: Tamanho da interface (`escala`)

## Objetivo

Deixar o usuário aumentar o editor inteiro (janela e fontes juntas) em passos, sem mexer em nada do que é gravado. Existe porque a Orpen carrega o Bootstrap 3.4.1 (`html { font-size: 10px }`) e o CSS do editor está em `rem`: lá o texto renderiza uns 38% menor que numa página com `rem` de 16 px.

## Comportamento

- Passos: **100 / 125 / 150 / 175%**. 100% é exatamente o tamanho de antes (o painel principal já nascia com `zoom: 1.15`).
- Controle no header, dentro do grupo do botão sol/lua: `A−  100%  A+`. Clicar no valor volta a 100%.
- **Persistência:** a escolha fica em `chrome.storage.local` (`editorbot:escala`) e em `localStorage` de reserva, no mesmo esquema do tema. Vale para todos os ambientes (cada cliente é um domínio) e sobrevive a recarregar a página e a reiniciar o navegador; sincroniza entre abas. Lida antes de o editor ser desenhado, então abre já no tamanho escolhido. `chrome.storage` vence; sem ele (extensão recarregada com a aba aberta), vale o `localStorage`; valor corrompido volta a 100%. A leitura e a gravação ficam em `js/escala.js` (`lerPreferencia`/`gravarPreferencia`) e são testadas com armazenamentos simulados.
- **Limite pela janela:** o passo efetivo é a preferência limitada ao que a janela comporta (painel com pelo menos 720 px de largura e 380 px de altura antes do zoom). A preferência não é apagada: ao aumentar a janela, o tamanho escolhido volta. O valor aparece em âmbar quando está limitado e `A+` fica desabilitado com a explicação no tooltip.
- Referência, em **viewport do navegador** (a tela menos barras de aba e endereço): 1920×950 chega a 175%; 1536×730 (1080p com Windows a 125%) e 1440×900 a 150%; 1366×650 a 125%; janelas menores que ~1100 px ficam em 100%.
- Com o Localizar ou a Análise aberto, o painel principal perde a largura do painel encaixado (372 px × escala + folga). Em 175% num 1920 o painel fica com ~575 px antes do zoom: as colunas ficam apertadas, mas usáveis. Não entra na conta do limite porque travaria o 175% em qualquer tela.
- Padrão: 100%.

## Como funciona

- `js/escala.js`: regras puras (passos, limite por janela, passo adjacente) e a escala atual, lida por quem posiciona coisas por coordenada. Sem imports, testado em `tests/editor/escala.test.mjs`.
- `js/orpen-bridge.js`: botões, persistência, `resize`; escreve `--ed-k` no estilo do host e o atributo `data-escala` (só quando ≠ 100%).
- `css/styles.css`:
  - `--ed-k` (escala), `--ed-zoom` (= 1,15 × `--ed-k`) e `--ed-inv` (= 1 / `--ed-k`) nos tokens.
  - Painel principal: `zoom: var(--ed-zoom)`, com largura, altura e margens divididas por `--ed-zoom` (mesma conta de antes). O teto de 1320 px cresce com a escala.
  - Janelas fora do painel (menu, tratamento, novidades, diálogos, copiar/colar, testar bot, pendências, busca/análise, dropdowns, toasts): `transform: scale(var(--ed-k))`, só sob `[data-escala]`. Em 100% nenhuma regra nova vale.
  - Diálogos centralizados escalam a partir do centro (continuam centralizados); pendências, busca/análise e toasts crescem a partir do canto em que estão encostados.
- `js/combobox.js` e `js/variaveis-texto.js`: largura/limites do dropdown em px visuais, divididos por `k` para a caixa, e `transform-origin` conforme abre para baixo ou para cima.

## Por que `transform` nos satélites e não `zoom`

O `.bv-panel` documenta um bug do Chromium: `zoom` combinado com `align-items: center` empurra o item para coordenadas negativas (header cortado). Os satélites são centralizados por flex, então usam `transform: scale`, que escala em volta do centro sem entrar nesse caminho. O painel principal segue com `zoom`, `flex-start` e margem fixa, como antes.

## Verificação (2026-10-14)

Rodado o `orpen-bridge.js` real numa página que simula a Orpen (`html` de 10px, `ajax.php`/`getBot`):

- 100%: capturas idênticas às da v0.8.25 fora do header (base, estado aberto, Editar menu, copiar/colar, testar bot inteiro e minimizado, variáveis, diálogo de fechar, pendências, toast): 0 pixel de diferença.
- 150%/175%: painel, menu, copiar/colar, testar bot (inteiro e minimizado, sem cobrir o rodapé), variáveis, diálogo, pendências, toast, dropdown e busca encaixada cabem na janela de 1920×1080 e sem sobreposição.
- 1366×768 com preferência de 175%: efetivo 150%, e a preferência volta ao aumentar a janela.
- Escolha sobrevive ao recarregar; sem erros no console.

## Fora do escopo

- Não muda `rem` para `px` (o 100% continua o de hoje).
- Não há atalho de teclado (Ctrl +/- é do zoom do navegador).
- Ainda não testado na `bot.php` real: falta o teste do usuário.
