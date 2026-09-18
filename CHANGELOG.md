# Histórico de Versões (Changelog)

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