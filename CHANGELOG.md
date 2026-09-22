# Histórico de Versões (Changelog)

## [0.3.4] - 2026-09-22
* **Corrigido "círculo branco" no badge de ID/nome do header**: o badge `#ID — nome` ao lado de "Editar Bot" usava classes Tailwind de valor arbitrário (`bg-[#231F2E]`, `border-[var(--obd-border)]`, `px-2.5` etc.) montadas via `innerHTML` em runtime (`orpen-bridge.js`) — como o `vendor/tailwind.css` é um build estático que só gera classes vistas em build-time, nenhuma dessas existia no CSS final. Sobrava só um contorno fino em `currentColor` (quase branco) sem fundo/padding. Substituído por uma classe própria (`.bv-badge-header-id` em `css/styles.css`, sempre carregada) com o estilo pretendido.

## [0.3.3] - 2026-09-22
* **Painel Usando Mais a Tela em Bots Grandes**: A folga de segurança embaixo do painel (v0.3.2) tinha ficado grande demais depois de dobrada — sobrava muito espaço vazio abaixo do rodapé em telas normais, obrigando bots com muitas transições a rolar internamente cedo demais. A defesa contra o header cortado é o `margin-top` em si (mantido em 6vh); o `max-height` não precisava da mesma folga, então voltou a ocupar quase todo o espaço restante (`margin-bottom` 6vh → 3vh, `max-height` 72vh → 91vh). O painel agora cresce pra baixo até quase a borda da tela antes de rolar por dentro.

## [0.3.2] - 2026-09-22
* **Mais Folga contra Corte do Header em Zoom Baixo**: O ajuste geométrico da v0.3.0 (margens fixas em vh) deixava de proteger o header do modal em zooms de navegador abaixo de 80% — o header nativo da Orpen voltava a aparecer sobreposto ao painel. Dobrada a folga de segurança (8vh → 16vh: margem subiu de 3vh para 6vh em cima/embaixo, `max-height` do painel caiu de 86vh para 72vh) pra cobrir zooms mais extremos.

## [0.3.1] - 2026-09-18
* **Criação de Bot do Zero**: Interceptação do botão nativo "Adicionar" (`#addBotModal`), abrindo diretamente o editor moderno no modo de criação.
* **Segurança e Validação na Criação**: Validação de obrigatoriedade de ID e Nome com foco automático no campo faltante e uso da ação `actionForm: duplicate` para evitar sobrescrita acidental de bots preexistentes. O campo de ID torna-se visível e editável exclusivamente na criação de novos bots, permanecendo protegido e oculto durante a edição.
* **Atualização Automática da Listagem**: Recarregamento automático da tela do Orpen após salvar com sucesso um bot recém-criado.

## [0.3.0] - 2026-09-17
* **Ajuste Geométrico Simétrico**: Corrigido o bug que cortava o título do bot na parte superior devido ao comportamento do Flexbox+Zoom no Chromium, ajustando também os tamanhos em unidades CSS que reagem à fonte raiz (os rems se tornavam minúsculos na tela do Orpen). Agora, as margens usam apenas frações do monitor (vh) equilibradas entre o topo e a base (`4vh` para cada).
* **Versionamento Visível**: A versão atual do `manifest.json` passa a ser renderizada dinamicamente no rodapé (footer) do modal da extensão para facilitar o debug entre usuários e o suporte.

## [0.2.0] - *Releases Anteriores*
* **Pesquisas com "Enter" Autocompletável**: Funcionalidade em dropdowns de datalist que preenchem a melhor seleção detectada.
* **Mapeamento de Calendários Reais**: Mapeia o dicionário de variáveis global do banco de dados do cliente conectando referências brutas ao Lucide.
* **Proteção "Sempre Verdadeiro"**: Tratamento no PHP e Interface adaptada para só ofertar a condição zero (`0` / else) nas transições em que a variável original permite (ocultada para variáveis estruturais que causam falha).

## [0.1.0] - *Lançamento Base MV3*
* Empacotamento do Editor Standalone da Orpen num formato nativo Manifest V3 compatível com Chrome/Edge.
* Isolamento Shadow DOM completo com interceptação nativa do clique (`editBot()`) e preservação do ambiente nativo original sob `Shift + Click`.