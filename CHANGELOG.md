# Histórico de Versões (Changelog)

## [0.8.4] - 2026-09-25
* **Tema escolhido não se perde mais**: a escolha claro/escuro ficava guardada separada em cada ambiente (cada cliente é um domínio) e podia ser apagada pela própria Orpen. Agora ela fica guardada na extensão: vale para todos os ambientes e continua valendo depois de login/logout. Quem já tinha escolhido o claro mantém a escolha. Trocar o tema numa aba muda também nas outras abertas.

## [0.8.3] - 2026-09-25
* **Novidades sempre à mão**: a versão no rodapé do editor virou o botão **"v0.8.3 · Novidades"**. Ele abre o histórico de todas as versões dentro do próprio editor, com a versão instalada marcada. O histórico vem da própria instalação, então funciona sem internet. O link "GitHub" na janela mostra o histórico da versão publicada.
* **"Atualizar agora" pulsando**: o botão do aviso de versão nova pulsa para chamar atenção. Ele para quando o mouse passa por cima, e fica parado para quem tem "reduzir movimento" ligado no sistema.

## [0.8.2] - 2026-09-25
* **Aviso de versão nova mais rápido**: o editor guardava por 1 hora a última versão lida do GitHub, então quem abria o editor pouco antes de uma publicação ficava até 1 hora sem ver o aviso. Agora, sem versão nova a avisar, ele consulta de novo a cada 5 minutos. Com versão nova a avisar, o aviso continua valendo por 1 hora.

## [0.8.1] - 2026-09-25
* **Botão "Atualizar agora"** no aviso de versão nova: com um clique, abre o atualizador no Windows. Na primeira vez, o Chrome pede confirmação; marque "sempre permitir". O editor espera os arquivos novos chegarem e se recarrega sozinho, sem precisar de F5. Se houver alteração não salva, ele pede para salvar e clicar em "Concluir" antes.
* O botão funciona depois de rodar o `Atualizar.bat` uma vez: é ele que ativa o link no Windows, só para o seu usuário e sem precisar de administrador.
* O `Atualizar.bat` agora explica quando ainda não há versão publicada, em vez de mostrar "404".

## [0.8.0] - 2026-09-25
* **Atualização em dois cliques**: quando sair uma versão nova, o rodapé do editor mostra "Versão X disponível: rode o Atualizar.bat", com link para as novidades. O `Atualizar.bat`, na pasta da extensão, baixa a versão nova do GitHub e troca só os arquivos da extensão. Depois é só recarregar a página da Orpen (F5): a extensão percebe os arquivos novos e se recarrega sozinha, sem passar por `chrome://extensions`. Sem internet, nada muda e nenhum aviso aparece.
* Esta é a última versão a instalar pelo zip. A partir dela, as atualizações vêm pelo `Atualizar.bat`. Detalhes na seção 9 da `DOCUMENTACAO_EXTENSAO.md`.

## [0.7.0] - 2026-09-25
* **Gerar tratamento do menu**: novo botão no cartão de cada menu (Botões, Lista e WebChat) que cria o estado de controle `CTRL - <origem>` no padrão dos bots de produção. São geradas uma transição por opção (`MENSAGEM Igual a <ID>`, vazia para completar), o limite de erros (padrão 2) com a ação escolhida (mensagem + fila, finalizar, trocar de estado ou em branco) e o fallback que soma um erro e reenvia o menu (cópia do JSON; no WebChat, também a Mensagem anterior). A origem ganha "Troca Estado" para o estado novo logo depois do menu; se já houver uma, o editor avisa antes de trocar o destino. Detalhes em `SPEC-tratamento-menu.md`.
* **Localizar no editor**: Ctrl+F ou a lupa no cabeçalho abrem um painel à direita, e o editor encolhe para dar espaço. Tem três modos separados, cada um com sua cor: textos enviados (mensagens e menus), condições (o que o cliente digita) e nomes de estados. A busca ignora acentos e maiúsculas, com opções para diferenciar maiúsculas e buscar palavra inteira. Enter/F3 e as setas navegam entre os resultados, abrindo o estado e destacando o campo. Clicar num resultado seleciona o termo dentro do campo. Os resultados se atualizam enquanto você edita, e a lupa mostra a quantidade encontrada. Detalhes em `SPEC-busca-editor.md`.

## [0.6.0] - 2026-09-24
* **Menu em modal com celular simulado**: a ação de menu mostra um resumo (tipo, mensagem e opções) e o botão **"Editar menu"**, que abre um modal com um celular onde se edita o menu como o cliente vai ver. Cobre **WhatsApp Botões**, **WhatsApp Lista** e **WebChat**, com abas pra trocar de tipo. Ação de menu vazia mostra **"Criar menu"**.
* **ID/valor gerado do texto**: o ID do botão/opção (e o valor no WebChat) pode ser editado; se ficar vazio, é gerado do texto com espaços trocados por `_` ("Falar com atendente" → `Falar_com_atendente`). O modal avisa sobre IDs repetidos, opções sem texto e mensagem vazia.
* **Lista sem seções na tela**: a lista é só uma sequência de opções (até 10). O botão que abre a lista vem com **"Ver opções"** por padrão, editável.
* **WebChat com campo de texto**: o modal tem o campo da mensagem, que por baixo é a ação "Mensagem" antes do menu (é assim que o WebChat funciona): se ela já existe é editada, se não existe é criada. Trocar de WebChat para WhatsApp reincorpora esse texto ao menu.
* **Troca de tipo segura**: se o tipo novo aceita menos opções (ex.: lista de 9 → botões), o modal lista o que será descartado e pede confirmação.
* **Fidelidade do JSON**: salvar altera só o que foi editado; cabeçalho/rodapé vazios, títulos de seção e chaves extras que já existiam são preservados, e salvar sem mexer não grava nada. Verificado em 38 menus reais. Corrige a tela antiga de lista, que apagava cabeçalho/rodapé vazios e não gravava as edições no bot.
* **"Armazenar variável" repaginado**: linhas `variável ← valor` com autocomplete de variáveis da Orpen, campos de retorno de scripts e variáveis já usadas no bot. O formato gravado não muda; valores que não são texto abrem no modo JSON.
* **Rolagem ao arrastar**: arrastando um estado ou uma transição perto do topo/fim da área, a tela rola sozinha.

## [0.5.0] - 2026-09-24
* **Tema Claro**: Novo botão **sol/lua** no header do editor alterna entre o tema escuro e um tema claro pensado para não ofuscar: fundo cinza-lavanda (nada de branco puro nas áreas grandes), texto quase-preto, mesmo matiz roxo do escuro, página da Orpen continua escurecida por trás e a troca tem transição suave. A escolha fica salva no navegador e o editor já abre no tema escolhido, sem piscar. O padrão continua sendo o escuro. Vale para o editor, o modal de pendências, o aviso "Salvar antes de gerar?" e os toasts; a imagem exportada do fluxograma não muda (paridade com o desktop).
* **Cores organizadas em tokens**: as 113 cores fixas do `styles.css` viraram variáveis por papel. O tema escuro ficou idêntico pixel a pixel (verificado por capturas automatizadas).
* **Barra da transição**: alça de arrastar, prioridade, duplicar e excluir saíram do canto da coluna de Condições para uma barra no topo de cada transição, com resumo ("1 condição · 2 ações"). A coluna de condições ganhou a largura toda.
* **Número da transição distinto do estado**: o estado mantém o selo laranja; a transição mostra "TRANSIÇÃO" com o número em contorno roxo, pra não confundir as duas numerações.
* **Nome do estado**: vira um título com lápis (editar) e o resumo "N transições"; ocupa só o tamanho do texto, então o resto do header voltou a abrir e fechar o estado. Estados fechados ficaram um pouco mais altos.

## [0.4.0] - 2026-09-24
* **Exportar Fluxograma (PNG/SVG)**: Novo botão **"Gerar fluxograma"** no rodapé do editor, com seletor PNG (padrão) / SVG. Gera o mesmo fluxograma que o app desktop **Fluxo BOT** exporta (Modo Cliente), sem sair da tela da Orpen: a lógica do Fluxo BOT foi portada para TypeScript e a camada de desenho é a mesma do desktop. A fidelidade é garantida por testes: o resultado bate com o do Python original em todos os bots de teste e em 6 bots reais, e as imagens saem idênticas, pixel a pixel, às do desktop (24 casos, PNG e SVG). Detalhes em `SPEC-exportar-fluxograma.md`.
* **Nomes reais no fluxograma**: filas, bots externos e calendários aparecem com o nome cadastrado na Orpen (ex.: "Transfere para a fila [7101] Suporte"), e não só com o número. Calendário com nome sai como resolvido.
* **Sempre o bot salvo**: se houver alteração não salva, o editor avisa ("Salvar antes de gerar?") e, com o aceite, salva pelo mesmo caminho do botão "Salvar" antes de gerar. Desfazer uma alteração (voltar ao valor original) não conta como alteração.
* **Geração em segundo plano**: o editor continua usável enquanto o fluxograma é gerado; o arquivo é baixado automaticamente e um aviso informa quando está pronto (ou o motivo, se falhar). Fechar o modal não cancela a geração.
* Bot novo ainda não salvo fica com o botão desabilitado; bot salvo sem estados mostra "Este bot ainda não tem estados".
* O botão "Salvar" continua se comportando exatamente igual (passou apenas a informar internamente se o salvamento deu certo).

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