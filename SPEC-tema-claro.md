# Spec: Tema Claro (`tema-claro`)

## Objetivo

Oferecer um **tema claro** para toda a interface da extensão, alternável pelo usuário, **sem "flashbang"**: nada de tela branca estourando o olho ao abrir o editor ou ao trocar de tema. O tema escuro atual continua existindo e **fica pixel a pixel igual ao de hoje**.

Mesma linha do projeto do fluxograma: primeiro reorganizar sem mudar nada, provado por teste; depois o tema novo, com prévia antes de aplicar.

## O que "sem flashbang" significa aqui (critérios verificáveis)

1. **Nenhuma superfície grande em branco puro.** O fundo do painel fica em cinza-lavanda claro (luminosidade ~92%) e os cartões um degrau acima (~96%). Só áreas pequenas (campos de texto) chegam perto do branco, e mesmo assim não em `#FFFFFF`.
2. **Contraste confortável, não máximo.** Texto principal em quase-preto arroxeado (não `#000`), com contraste de ~12–13:1 no fundo, em vez dos 21:1 do preto no branco. O texto secundário continua ≥ 4,5:1 (nível AA).
3. **Mesmo matiz do tema escuro.** A família de cor (lavanda, com acento roxo `#8377FF`) é a mesma. O claro é o "mesmo produto de dia", não outra identidade.
4. **O fundo da Orpen continua escurecido.** O véu que escurece a página por trás do editor fica igual nos dois temas, então o painel claro não aparece "aceso" no meio de uma página clara.
5. **Troca suave.** Alternar o tema faz uma transição curta de cor (~150 ms), em vez de um corte instantâneo.
6. **Sombras suaves.** No claro, a profundidade vem de bordas e sombras leves, não de contraste duro.

## Escopo

**Entra (tudo o que a extensão desenha dentro do Shadow DOM na `bot.php`):**
- modal "Editar Bot": header, config do bot, estados, transições, condições/ações, menu builder, alertas de exclusão, rodapé e botão do fluxograma;
- modal de pendências;
- diálogo "Salvar antes de gerar?";
- toasts.

**Fica fora:**
- **A imagem exportada do fluxograma.** Continua idêntica ao desktop Fluxo BOT (cartões escuros sobre fundo cinza-claro), que é a regra de paridade da v0.4.0.
- A página standalone (`bot_transform.html` aberta numa aba, upload/transformação).
- O modal nativo da Orpen (Shift+clique).

## Diagnóstico (2026-09-24)

- **Todo o visual do editor mora no `css/styles.css`**: 113 cores fixas (hex/rgba) cumprindo ~35 papéis, mais 16 tokens já existentes (`--obd-bg`, `--text`, `--accent`…).
- As classes de cor arbitrária do Tailwind no HTML/JS (`text-[#8b899b]`, `bg-[#faf9fc]`…) **não estão compiladas** no `vendor/tailwind.css` e não têm efeito no editor. As claras são herança da página standalone.
- No markup do editor, as únicas cores vindas do Tailwind são `bg-primary`/`text-white` nos botões (servem nos dois temas) e o selo "Carregando…" (`bg-amber-500/20 text-amber-300`), que precisa de ajuste no claro.
- Não há estilo inline com cor no JS.
- Controles nativos: `select` usa `color-scheme: dark` fixo, e precisa virar `light` no tema claro, senão o dropdown abre escuro.

## Decisões de arquitetura

### D1. Tokens semânticos, com o tema escuro valendo exatamente o de hoje

Todas as cores do `styles.css` viram **variáveis CSS com nome de papel** (ex.: `--item-bg`, `--item-borda`, `--alerta-bloqueio-bg`, `--toast-bg`), definidas em `:host, :root`. Os valores padrão são **exatamente as cores atuais**, então o tema escuro não muda um pixel. O tema claro só redefine os valores em:

```css
:host([data-tema="claro"]), :root[data-tema="claro"] { --obd-bg: …; --texto: …; … }
```

Como toasts e diálogo também moram no shadow root, um atributo no host (`#orpen-editor-bot-host`) tema tudo de uma vez.

### D2. Regressão do tema escuro provada por captura de tela

Um script (Playwright + Chrome, mesmo padrão da paridade do fluxograma) abre o editor na página standalone com um bot de teste, expande estados, abre o menu builder e os alertas, e tira capturas. **Antes e depois da troca por tokens, as capturas do tema escuro precisam ser idênticas pixel a pixel.** O mesmo script gera as capturas do tema claro para a prévia.

### D3. Alternância e persistência

- Botão com ícone **sol/lua** no header do editor, à esquerda do "fechar".
- A escolha fica salva no `localStorage` da página (`editorbot:tema`). Não precisa de permissão nova no manifest.
- Padrão e opção "seguir o sistema": ver Questões em aberto.

## Paleta proposta (ponto de partida; ajustada na Fase 1 com prévia visual)

| Papel | Escuro (hoje) | Claro (proposta) |
|---|---|---|
| Fundo do painel / header / rodapé | `#15131C` | `#ECEAF2` |
| Cartão (config, estado) | `#1C1A24` | `#F4F3F8` |
| Campo de texto | `#201E28` | `#FAF9FC` |
| Borda | `#2A2833` | `#DAD7E3` |
| Borda de campo | `#34313F` | `#C9C5D6` |
| Texto principal | `#EBE9F3` | `#25222F` |
| Texto secundário | `#948FA6` | `#5F5A72` |
| Texto apagado (dicas) | `#6E6A7E` | `#767188` |
| Acento / primário | `#8377FF` | `#6D5EF5` (mais escuro, pra manter contraste com texto branco nos botões) |
| Item de condição/ação | `#232229` / borda `#34333E` | `#EFEDF4` / borda `#D6D2E0` |
| Alerta de bloqueio | `#2A1D1F` / texto `#F2B8B8` | `#FBEDEE` / texto `#9B2C31` |
| Alerta de confirmação | `#241D14` / texto `#F2D6A8` | `#FCF3E6` / texto `#8A5A12` |
| Toast | `#232229` | `#F4F3F8` com borda `#D6D2E0` |
| Véu sobre a Orpen | `rgba(15,14,30,.45)` | igual |

## Fases

### Fase 0: Tokens sem mudança visual (0,5–1 dia) ✅
1. Script de captura do editor (`scripts/capturasTema.mjs`, reaproveitando o Playwright do `fluxograma/`), com as telas: bot carregado, estado expandido com condições e ações, menu builder aberto, alerta de exclusão, modal de pendências, diálogo e toast.
2. Capturas de referência do tema escuro **antes** de mexer no CSS.
3. Troca das 113 cores fixas por tokens semânticos.
4. **Aceite:** capturas do escuro idênticas às de referência (0 pixel de diferença).

> **Resultado (2026-09-24, `c9ec447`):** 5 capturas do escuro com 0 pixel de diferença depois da troca por tokens. O Chrome roda com `--disable-gpu`: com GPU, a rasterização variava 1 unidade de cor em cantos arredondados entre duas execuções idênticas. Sobraram cores literais só nas classes da página standalone (`.dot-*`, `.skeleton`), fora do escopo.

### Fase 1: Paleta clara + prévia (0,5 dia) ✅
1. Valores do tema claro para todos os tokens, com `color-scheme: light` e a barra de rolagem.
2. Capturas lado a lado (escuro × claro) das mesmas telas.
3. **Aceite:** você aprova a prévia (ajustes de tom antes de seguir).

> **Status:** paleta aplicada em `:host([data-tema="claro"])` (valores da tabela acima, mais os tokens de papel). Prévias lado a lado em `fluxograma/tests/tema_out/previa-*.png` (fora do git; gere de novo com `node scripts/capturasTema.mjs --tema claro`). Achado na prévia: o ✓ decorativo do header do estado vinha só do `text-white` do Tailwind e sumia no claro. Virou o token `--check-decorativo` (branco no escuro, sem mudança).

### Fase 2: Alternância (0,5 dia) ✅
1. Botão sol/lua no header, `data-tema` no host, persistência no `localStorage`, transição de ~150 ms.
2. Selo "Carregando…" e demais detalhes do markup.
3. **Aceite:** alternar não fecha nem recarrega o editor e a escolha sobrevive a um F5; o escuro continua idêntico (captura).

> **Status:** botão sol/lua (`#btn-bv-tema`) inserido por `orpen-bridge.js` antes do "fechar". O `data-tema` é aplicado no host **antes** de desenhar (sem piscar o escuro). Escolha salva em `localStorage['editorbot:tema']`. Transição de cor só durante a troca (classe `tema-trocando` por 250 ms). Escuro continua idêntico nas capturas; nenhuma linha removida do `orpen-bridge.js`. O botão só existe na extensão, então a alternância em si é validada no teste da Fase 3.

### Fase 3: Teste na Orpen e release (0,5 dia) ✅ v0.5.0
1. Seu teste na `bot.php` (roteiro curto, nos dois temas).
2. Versão 0.5.0, CHANGELOG, documentação e zip.

> **Resultado (2026-09-24):** o usuário validou na `bot.php` o tema claro e o botão sol/lua (captura do editor claro na Orpen). Os ajustes de UX pedidos durante o teste (barra da transição, nome do estado, numeração) foram verificados em navegador automatizado na página standalone (abrir/fechar pelo header, lápis foca sem alternar, renomear com Enter, reordenar pelo número), mas **não foram testados na Orpen antes da release**, por decisão do usuário ("pode subir"). Release: v0.5.0, zip `Desktop\EDITOR_BOT-v0.5.0.zip`.

## Ajustes de UX pedidos durante o teste (2026-09-24)

- **Barra da transição.** Alça de arrastar, prioridade, duplicar e excluir saíram do canto da coluna de Condições (onde pareciam pertencer à primeira condição) para uma barra no topo de cada transição, no mesmo padrão do header do estado: alça, número e um resumo ("1 condição · 2 ações") à esquerda; duplicar e excluir à direita. A coluna de condições ganhou a largura toda. A estrutura de que o JS depende foi mantida: wrapper `.estado-row`, `data-action` dos botões e o painel de exclusão como filho direto da linha. Toda mudança dentro da transição redesenha a linha (`rerenderTransicao`), então o resumo nunca fica desatualizado. Token novo: `--transicao-barra-bg`.
- **Estado fechado maior.** Header do estado com `padding: 1rem 1.25rem` e `min-height: 4rem` (antes `0.75rem 1rem`), e nome em `1rem` (antes `0.9375rem`).
- **Nome do estado.** Antes era um input transparente, com `flex-1`, que ocupava quase todo o header. Como clique em input não abre nem fecha o estado, isso tirava a área de clique do header. Agora:
  - em repouso é um título (semibold), com um lápis apagado indicando que dá pra editar e o resumo "N transições" ao lado;
  - no hover acende um fundo sutil e o lápis;
  - no foco vira campo (fundo, borda e anel de foco);
  - a largura acompanha o texto (`field-sizing: content`, mínimo 6rem, máximo `min(28rem, 55%)`), e um espaçador flexível deixa o resto do header livre pra abrir/fechar;
  - o lápis é um botão (`data-action="focar-nome-estado"`) que foca e seleciona o nome sem alternar o estado.

  Verificado no navegador: clique no espaço vazio abre/fecha, o lápis foca sem alternar e renomear com Enter mantém o estado como estava. O nome passou a ocupar ~160 px de um header de ~1260 px.
- **Número da transição diferente do número do estado.** Os dois usavam o mesmo selo laranja sólido e se confundiam. O estado mantém o selo laranja. A transição passa a ter o rótulo "TRANSIÇÃO" e o número com contorno roxo e fundo suave (`.transicao-numero-badge`, tokens de acento, nos dois temas). O valor continua sendo a PRIORITY real (começa em 0), e o campo continua sendo o de reordenar: verificado que digitar outra posição + Enter reordena e renumera.
- As capturas de referência do escuro foram regeneradas com esse visual novo (mudança intencional).

## Questões em aberto

- **Q1. Tema padrão:** **decidido: escuro** (a recomendação; o usuário liberou a release com ela). para quem nunca escolheu, abre no **escuro** (como hoje) ou **segue o tema do sistema** (Windows claro → editor claro)? *Recomendação: escuro por padrão. Ninguém é surpreendido após a atualização, e quem quiser liga o claro uma vez.*
- ~~**Q2. Opção "seguir o sistema"**~~ **Decidido (2026-09-24):** só os dois temas, alternáveis pelo usuário ("deve ser possível alterar entre os dois").
