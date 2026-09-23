# Spec: Exportar Fluxograma (PNG/SVG) (`exportar-fluxograma`)

## Objetivo

Adicionar ao rodapé do modal "Editar Bot" um botão que gera o **fluxograma do bot, idêntico ao que o app desktop Fluxo BOT exporta hoje** (`C:\Users\RCX\Desktop\Fluxo BOT`, menu Exportar → PNG/SVG), sempre no **Modo Cliente**.

Fluxo de uso:

1. O usuário abre um bot no editor (o JSON já foi carregado via `getBot`, em `state.botCarregado`).
2. Escolhe o formato (**PNG**, padrão, ou **SVG**) e clica em **"Gerar fluxograma"** no rodapé.
3. **Se o bot tiver alterações não salvas**, aparece uma confirmação avisando que elas serão salvas antes de gerar. Sem o aceite, nada acontece. Com o aceite, o bot é salvo pelo mesmo caminho do botão "Salvar". A geração só começa se o salvamento der certo.
4. O botão entra em estado "Gerando fluxograma…". A geração roda em segundo plano, e o usuário pode continuar usando o editor.
5. Quando termina, o arquivo é baixado automaticamente e aparece o toast "Fluxograma pronto: <arquivo>". Se falhar, aparece um toast de erro com o motivo.

Garantia que sai daí: **o fluxograma sempre representa o bot exatamente como está salvo na plataforma.**

Dois requisitos que não se negociam:

- **Fidelidade.** Mesmo grafo, mesmos nós, mesmos textos, mesmas cores e mesmo layout que o desktop produz para o mesmo bot. Isso precisa ser garantido por teste, não por inspeção visual.
- **Nada do que funciona hoje pode mudar.** O comportamento de abrir, editar, salvar, Backup JSON, Shift+clique, novo bot e pendências fica idêntico. As únicas alterações em código existente são aditivas e estão listadas em "Arquivos existentes que mudam".

## Decisões de produto (registradas em 2026-09-23)

| # | Decisão |
|---|---|
| P1 | O fluxograma **não** é gerado a partir de alterações não salvas. Se houver alteração pendente, o sistema avisa que ela será salva antes; com o aceite, salva e depois gera. |
| P2 | Tudo o que o fluxograma mostra como número/ID e que o ambiente Orpen consegue resolver aparece com o **nome real**: **filas**, **bots externos** e **calendários** (ver D6). |
| P3 | Exportar em **PNG e SVG**, com PNG como padrão. |
| P4 | Só **Modo Cliente**. Sem seletor de modo: o editor já mostra o detalhe técnico, e o fluxograma é a visão de apresentação. |

## Fora de escopo (v1)

- Modo Técnico no fluxograma (P4).
- PDF (o desktop monta capa e legenda com Python/Qt; seria outro projeto).
- Painel de Nomenclatura / overrides manuais por bot (o sidecar `.fluxobot.json` do desktop).
- Tela de pré-visualização interativa do fluxograma.
- Painel de Validação do desktop (`validacao.py`). Ele não afeta a imagem.
- Modo standalone (`bot_transform.html` aberto numa aba, via upload). A v1 atende só o modo extensão na tela da Orpen.
- Bot **novo ainda não salvo**: o botão fica desabilitado até o primeiro salvamento, porque salvar um bot novo recarrega a página e mataria a geração. Ver Fase 3.

---

## Como o desktop faz hoje (referência de fidelidade)

Versão de referência: **Fluxo BOT commit `7c9c976`**. Todo o port abaixo espelha esse commit.

```
JSON do bot
  → backend/core/parser.py              (Bot)
  → backend/core/grafo.py               (Grafo: nós/arestas + back edges)
  → backend/core/filtro.py              (Modo Cliente)
  → backend/core/grafo_para_reactflow.py (+ rotulos.py, mensagens.py, dicionarios.py)
  → backend/core/overrides.py           (aplicar_overrides_reactflow: nomes de fila, bot externo e calendário)
  → frontend (React Flow):
      App.tsx         cor da aresta por estado de origem (coresEstado.ts)
      layout.ts       dagre LR, tamanho de nó medido com canvas.measureText
      NoEstado.tsx / ArestaConversa.tsx / texto.ts / tiposNo.ts / icones.tsx / tema.css
      exportar.ts     html-to-image em `.react-flow__viewport`
                      fundo #f4f5f7, padding 6%, pixelRatio 2 (PNG) / 1 (SVG)
```

O Python só participa da exportação para abrir o "Salvar como" e gravar o arquivo (`backend/export/imagem.py`, `ui/janela.py:_exportar_png/_exportar_svg`). A captura em si já é 100% JS (`toPng`/`toSvg`). O que **não** existe em JS hoje é a transformação JSON → grafo React Flow, que mora nos módulos Python acima (~1.100 linhas relevantes).

### PNG × SVG: o que cada um entrega

| | PNG | SVG |
|---|---|---|
| Nitidez | Fixa (2× a resolução do desenho) | Vetorial: nítido em qualquer zoom |
| Bot muito grande | Acima de 16.384 px por dimensão, o `html-to-image` reduz a escala (texto pode ficar pequeno). O desktop tem o mesmo comportamento. | Sem limite de canvas; normalmente fica menor que o PNG |
| Texto | Imagem | Continua texto (dá para buscar com Ctrl+F no navegador) |
| Onde abre bem | Em qualquer lugar | Navegadores (Chrome, Edge, Firefox). **Word, PowerPoint, Illustrator e Inkscape podem abrir em branco ou quebrado**, porque o `toSvg` embute HTML via `<foreignObject>`. É a mesma limitação do SVG do desktop. |

Por isso o PNG é o padrão (é o que vai para documento e apresentação), e o SVG fica como opção para quem quer ver em detalhe no navegador. O seletor de formato mostra uma dica curta: "SVG: melhor para abrir no navegador".

---

## Decisões de arquitetura

### D1. Renderizar num `<iframe>` de página da extensão, não dentro do Shadow DOM

O fluxograma é montado e capturado num iframe oculto que aponta para `vendor/fluxograma/index.html` (página da própria extensão). O content script manda o bot para o iframe e recebe os bytes do arquivo de volta.

Por quê:
- **Isolamento total.** O React, o CSS do React Flow e o `tema.css` do Fluxo BOT ficam num documento próprio. Não encostam no Shadow DOM do editor, no Tailwind da extensão nem no Bootstrap da Orpen (`html { font-size: 10px }`).
- **Fontes.** `@font-face` declarado dentro de Shadow DOM não é aplicado pelo Chrome, e o `html-to-image` só embute fontes que acha em `document.styleSheets`. Num documento próprio, a Inter carrega e é embutida exatamente como no desktop.
- **Mesmo código de renderização do desktop.** Os componentes podem ser copiados quase sem alteração.

Alternativas rejeitadas:
- Renderizar no Shadow DOM do overlay: problema de fonte descrito acima, mais risco de vazamento de CSS nos dois sentidos.
- Reescrever a renderização em JS/SVG puro: perderia a fidelidade com o React Flow (curvas bezier, handles, marcadores de seta).
- Nova aba ou service worker: exige `background` e permissões novas no manifest. É mudança maior sem ganho.

### D2. Portar o pipeline Python para TypeScript, com teste de paridade contra o Python

A extensão não roda Python. O pipeline (`parser` → `grafo` → `filtro` → `grafo_para_reactflow`, com `rotulos`, `mensagens`, `dicionarios`, e os ramos `fila`/`bot_externo`/`calendario` de `aplicar_overrides_reactflow`) é reescrito em TS, **arquivo por arquivo, função por função**, com os mesmos nomes. A fidelidade é provada por **testes golden**: o Python original gera o JSON React Flow esperado para cada fixture, e o TS precisa produzir um resultado idêntico (deep-equal, incluindo a ordem de nós e arestas).

### D3. Copiar a camada de renderização do Fluxo BOT, sem reescrever

`layout.ts`, `NoEstado.tsx`, `ArestaConversa.tsx`, `texto.ts`, `tiposNo.ts`, `icones.tsx`, `coresEstado.ts`, `types.ts`, a parte de nós/arestas do `tema.css` e `exportar.ts` são copiados. A única adaptação é trocar a ponte Qt pela ponte com a extensão. As versões das dependências ficam **exatamente iguais** às do desktop (`reactflow 11.11.4`, `dagre 0.8.5`, `html-to-image 1.11.13`, `react 19.2.x`, `@fontsource/inter 5.x`).

Não entram: `App.tsx` (a barra do app), `Legenda.tsx`, `MiniMap`, `Controls`, `Background`, destaque de seleção. Nenhum deles aparece na imagem: a captura é só de `.react-flow__viewport`.

### D4. O build do renderizador é commitado em `vendor/fluxograma/`

Mesmo padrão de `vendor/tailwind.css`: quem instala a extensão continua só fazendo "Carregar sem compactação", sem precisar de npm. Só quem mexe no renderizador roda o build.

Atenção: **não usar `vite-plugin-singlefile`** aqui, ao contrário do desktop. A CSP padrão de página de extensão MV3 (`script-src 'self'`) bloqueia `<script>` inline. O build deve gerar `index.html` + `assets/*.js` externos, com `base: './'`. As fontes podem continuar inlinadas como data URI (`assetsInlineLimit` alto).

### D5. A fonte dos dados é sempre o bot salvo

- **Detecção de alteração pendente.** Uma "linha de base" é gravada em `state.baselineSalvo` em dois momentos: logo depois do `getBot` (em `abrirEditorOrpen`) e logo depois de um `updateBot` bem-sucedido (em `salvarBotNaOrpen`). A linha de base é `serializeBracketNotation(toUpdateBotPayload(bot))`, ou seja, **exatamente o que seria enviado ao servidor**. No clique em "Gerar fluxograma", o mesmo cálculo é feito sobre o bot atual: se a string for diferente da linha de base, há alteração não salva. Vantagens: não precisa de flag de "sujo" espalhada pelo editor, não dá falso positivo com campos internos (espelhos numéricos, `_isNewBot`) e reflete exatamente o que o "Salvar" gravaria.
- **Salvamento.** Reaproveita o `salvarBotNaOrpen` existente, **sem duplicar a lógica**. A única mudança nele é passar a *retornar* `true`/`false` (sucesso/falha) e atualizar a linha de base no sucesso. O listener atual do botão "Salvar" ignora o retorno, então o comportamento do "Salvar" continua idêntico.
- **Snapshot.** Com o bot salvo, ele é clonado (o `postMessage` já faz structured clone) e a geração roda sobre essa cópia. Edições feitas depois não afetam o fluxograma em andamento, e o pipeline nunca muta o estado do editor.

O shape de `state.botCarregado` (montado por `fromGetBotResponse` em `js/orpen-adapter.js`) é compatível com o que o parser do desktop espera: `BOT_STATES`/`BOT_TRANSITIONS`/`BOT_CONDITIONS`/`BOT_ACTIONS` achatados, com as chaves nomeadas presentes. As diferenças a tratar estão em "Diferenças de fonte de dados" abaixo.

### D6. Nomes reais vêm do ambiente Orpen, como dado real do nó

Os nomes vêm dos cadastros que o `content/page-env-collector.js` já coleta em `state.ambienteOrpen`, sem mudar o collector. Eles entram como **dado real do nó** (no próprio `rotulo`), com a mesma fórmula que o `grafo.py` do desktop usa para o texto padrão, só trocando o número pelo nome.

Isso **não** usa a Nomenclatura do desktop (override manual em `overrideRotulo`, via `aplicar_overrides_reactflow`). Motivos:
- Os nomes do ambiente são corretos por definição. Não são uma "renomeação" do usuário (decisão de 2026-09-23: "como temos as informações corretas, não precisamos mais alterar nome de filas").
- O caminho de override tem um **bug no desktop**: o nome personalizado de fila/bot externo é desenhado com os asteriscos crus (`*Transfere para a fila X*`). O `overrides.py` monta o texto com `*…*`, e o `texto.ts` só remove os asteriscos do texto padrão. Achado na comparação visual da Fase 2. Pelo caminho de dado real, o desenho remove os asteriscos normalmente.

| Nó | Referência no grafo | Fonte no ambiente | Texto no nó |
|---|---|---|---|
| `fila` | `destiny` da ação tipo 5 | `queues[]` → `{ id: q.NAME, name: '[NAME] BEE_NAME' }` | "Transfere para a fila [12] Suporte" (`rotulo` = `*Transfere para a fila {name}*`; o desenho tira os asteriscos, como no texto padrão) |
| `bot_externo` | `destiny` da ação tipo 4 | `bots[]` → `{ id, name: '[Bot] NOME' }` | "Transfere para o bot [ID] NOME". O prefixo `[Bot] ` que o collector acrescenta para os datalists é removido aqui, senão sairia "para o bot [Bot] …". |
| `calendario` | `CONDITION_TYPE` da condição `calendario`/`calendario_falso` (é o ID do calendário, ver `dicionarios.py`) | `calendars[]` → `{ id, name }` | "{Dentro do horário \| Fora do horário} — {name}", com `naoResolvida = false`: o nó sai como "CALENDÁRIO", sem a borda tracejada de "não resolvido". |

Regras:
- Referência sem correspondência no ambiente fica como hoje (número, ou "não resolvido" no calendário), igual ao desktop sem nomenclatura preenchida.
- A comparação de ID é por string, sem espaços nas pontas (`String(id).trim()`), dos dois lados. O **nome** também passa por `trim()`: a Fase 0 encontrou cadastros com espaço sobrando no fim.
- Se `state.ambienteOrpen` não existir (o collector falhou), o fluxograma sai sem nomes e o toast de pronto avisa: "Fluxograma gerado sem os nomes do ambiente (cadastros da Orpen não carregados)".

O que **não** tem como ser resolvido (e por quê), para registro:
- **Fila dinâmica** (`{$variavel}`): o destino só existe em tempo de execução.
- **Encerrado**: é um nó único compartilhado por todas as transições que encerram (`grafo.py:_no_encerrado`). Mostrar o status de CRM de cada uma exigiria mudar a estrutura do grafo e quebraria a paridade.
- **Estados e opções de menu** já aparecem com o texto real (alias, mensagem, título do botão/lista) pelo próprio pipeline.
- **Valores observados** da fila dinâmica não aparecem na imagem (só no painel de detalhes do desktop).

A Fase 0 confirma, em bots reais, que as três referências batem com os IDs do ambiente.

---

## Estrutura de arquivos

```
fluxograma/                         # NOVO: subprojeto-fonte (só para quem desenvolve; precisa de npm)
├── package.json                    # versões idênticas às do Fluxo BOT (ver D3)
├── vite.config.ts                  # build → ../vendor/fluxograma/, base './', sem singlefile
├── tsconfig.json
├── ORIGEM.md                       # commit do Fluxo BOT espelhado + mapa arquivo Python → arquivo TS
├── src/
│   ├── core/                       # port do pipeline (D2)
│   │   ├── pythonCompat.ts         # strip/splitlines/isdigit/int()/unescape no comportamento do Python
│   │   ├── modelo.ts               # ← model.py
│   │   ├── parser.ts               # ← parser.py
│   │   ├── dicionarios.ts          # ← dicionarios.py
│   │   ├── mensagens.ts            # ← mensagens.py
│   │   ├── grafo.ts                # ← grafo.py
│   │   ├── rotulos.ts              # ← rotulos.py
│   │   ├── filtro.ts               # ← filtro.py (só o caminho do Modo Cliente é usado)
│   │   ├── grafoParaReactflow.ts   # ← grafo_para_reactflow.py
│   │   ├── nomesAmbiente.ts        # ← aplicar_overrides_reactflow (ramos fila/bot_externo/calendario) + montagem a partir de ambienteOrpen
│   │   └── pipeline.ts             # gerarGrafoReactFlow(bot, nomesAmbiente) → {nodes, edges, botNome}
│   ├── render/                     # cópia do frontend do Fluxo BOT (D3)
│   │   ├── layout.ts  NoEstado.tsx  ArestaConversa.tsx  texto.ts  tiposNo.ts
│   │   ├── icones.tsx  coresEstado.ts  types.ts  tema.css
│   │   └── exportar.ts             # capturarDiagrama(nodes, 'png'|'svg') sem a ponte Qt; devolve Blob
│   └── app/
│       ├── main.tsx
│       ├── Renderizador.tsx        # ReactFlow "headless": recebe grafo, avisa quando as arestas terminam de desenhar
│       └── ponteExtensao.ts        # handshake MessageChannel + protocolo (ver abaixo)
├── scripts/
│   └── gerar_golden.py             # roda o pipeline Python do Fluxo BOT (sys.path) e grava os goldens
└── tests/
    ├── paridade.test.ts            # vitest: TS vs golden, para cada fixture (Modo Cliente, com e sem nomes do ambiente)
    ├── pythonCompat.test.ts
    ├── fixtures/                   # sintéticos copiados de Fluxo BOT/backend/tests/fixtures (commitados)
    ├── golden/                     # goldens dos sintéticos (commitados)
    └── golden_local/               # bots reais + goldens (GITIGNORED, privacidade)

vendor/fluxograma/                  # NOVO: build commitado (index.html + assets/)
js/fluxograma-export.js             # NOVO: lado extensão (confirmação, iframe, protocolo, botão, download, toasts)
```

Arquivos existentes que mudam, **só por adição**:

| Arquivo | Mudança |
|---|---|
| `js/orpen-bridge.js` | (a) Insere no `.bv-footer`, à esquerda de "Backup JSON", o botão "Gerar fluxograma" + seletor PNG/SVG, e liga o listener em `ligarBotoesExtensao`, com `import()` dinâmico de `fluxograma-export.js` só no clique. (b) `abrirEditorOrpen`: grava `state.baselineSalvo` depois de `fromGetBotResponse`. (c) `salvarBotNaOrpen`: passa a `return true` no sucesso e `return false` em toda saída de falha (validação de ID/nome, erro HTTP, erro do servidor, exceção), e atualiza `state.baselineSalvo` no sucesso. Nenhuma outra linha muda; toasts, spinners, pendências e o reload de bot novo continuam como estão. (d) Exporta `salvarBotNaOrpen` para o `fluxograma-export.js` poder chamá-lo. |
| `js/state.js` | Campo novo `baselineSalvo: null`. |
| `css/styles.css` | Regras novas escopadas ao botão (estado "gerando", spinner, seletor) e ao diálogo de confirmação. Nenhuma regra existente é alterada. O diálogo **não usa `zoom` nem centralização por flex no eixo vertical** (evita o bug de header cortado já documentado no próprio `styles.css`). |
| `manifest.json` | Só o bump de `version`. `vendor/*` já cobre `vendor/fluxograma/index.html` (confirmado na Fase 0). |
| `.gitignore` | Acrescentar `fluxograma/node_modules/` e `fluxograma/tests/golden_local/`. |
| `CHANGELOG.md`, `DOCUMENTACAO_EXTENSAO.md` | Documentação da feature. |

Não mudam: `orpen-adapter.js`, `bot-view-render.js`, `bot-view-interactions.js`, `menu-builder.js`, `bot_transform.html`, `content/*`.

---

## Protocolo extensão ↔ iframe

1. `fluxograma-export.js` cria, uma única vez, o iframe `chrome.runtime.getURL('vendor/fluxograma/index.html') + '#n=<nonce>'`, anexado ao `document.body` (fora do overlay do editor, para continuar vivo se o modal for fechado no meio da geração), **dentro da área visível e invisível** (variante (b) da Fase 0: `position:fixed; left:0; top:0; width:1280px; height:800px; border:0; opacity:0; pointer-events:none; z-index:0`). Fora da tela não funciona: o Chrome congela o iframe (risco R1, confirmado).
2. No `load`, o content script cria um `MessageChannel` e envia `{tipo:'conectar', nonce}` com `targetOrigin = 'chrome-extension://<id>'`, transferindo a `port2`. O iframe só aceita a porta se o `nonce` bater com o do hash da URL. A partir daí tudo trafega pela porta privada. Nada passa por `window.postMessage` aberto, então scripts da página da Orpen não leem o arquivo gerado.
3. Mensagens:

| Direção | Mensagem |
|---|---|
| ext → iframe | `{tipo:'gerar', id, bot, formato:'png'\|'svg', nomesAmbiente: {filas, bots, calendarios}}` (cada um é um `{ [id]: nome }` já normalizado) |
| iframe → ext | `{tipo:'progresso', id, etapa:'grafo'\|'layout'\|'render'\|'captura'}` (opcional, para o texto do botão) |
| iframe → ext | `{tipo:'pronto', id, formato, arquivo: ArrayBuffer, largura, altura, nos, arestas}`, com o `arquivo` transferido (sem cópia) |
| iframe → ext | `{tipo:'erro', id, mensagem, detalhe?}`. `mensagem` já vem em português, para ir direto ao toast |

4. O download é feito **pelo content script**: `Blob` (`image/png` ou `image/svg+xml`) → `URL.createObjectURL` → `<a download>`. É o mesmo padrão já validado em `baixarBotJson` (`js/orpen-bridge.js:197`).
5. Nome do arquivo: `fluxograma_<ID>_<NOME-sanitizado>.png|.svg`, com a mesma sanitização do Backup JSON.
6. Só uma geração por vez. O botão fica desabilitado enquanto há uma em andamento.

---

## Pontos de fidelidade do port (checklist obrigatório da Fase 1)

Diferenças entre Python e JS que mudam o resultado sem dar erro nenhum. Cada item precisa de teste próprio em `pythonCompat.test.ts` ou estar coberto por um golden.

| # | Armadilha | Onde | Regra no TS |
|---|---|---|---|
| 1 | **Ordem de inserção.** `dict` Python preserva a ordem de inserção. Objeto JS com chave numérica (`"0"`, `"12"`) **reordena** as chaves em ordem crescente. A ordem de nós e arestas muda o layout do dagre. | `grafo.nos`, `bot.estados`, mapas de rótulo | Usar **sempre `Map`**, nunca objeto literal, para coleções indexadas por ID ou número de estado. |
| 2 | Ordem de visita da DFS / pilha | `_proximos_estados` (`pilha.pop()`, LIFO), `_marcar_back_edges` | Replicar `push`/`pop` literalmente. Não trocar por BFS nem por recursão "equivalente". |
| 3 | Ordenação de estados `(sn != "0", not sn.isdigit(), int(sn) \| sn)` | `_marcar_back_edges` | Comparador que reproduz a tupla e devolve `0` no empate (o sort do JS é estável, como o do Python). |
| 4 | `int(ac.id)` para ordenar as ações | `parser._montar_bot` | Aceitar o mesmo que `int()` do Python aceita (espaços nas pontas, zeros à esquerda). ID não numérico gera o mesmo erro do parser. |
| 5 | `html.unescape` (todas as entidades HTML5) | `_resolver_dados`, chave `"3"` | Usar a lib `he` (determinística no browser e no Node dos testes). Nada de truque com `<textarea>`. |
| 6 | `str.splitlines()` quebra em `\r\n \r \n \v \f \x1c \x1d \x1e \x85 \u2028 \u2029` | `_mapa_de_texto_puro` | `splitlines()` próprio em `pythonCompat.ts`. |
| 7 | `str.strip()` / `lstrip()` têm um conjunto de espaços diferente do `trim()` do JS | `mensagens`, `rotulos`, `grafo` | `strip()` próprio. `lstrip("$")` vira `replace(/^\$+/, '')`. |
| 8 | Regex `^\*?(\d+)\*?\s*[-–—)\.]\s*(.+)$`: `\d` do Python casa dígitos Unicode, o do JS não | `_RE_LINHA_MENU` | Flag `u` com `\p{Nd}`. |
| 9 | `str.isdigit()` | ordenação de estados | Equivalente em `pythonCompat.ts` (e manter coerente com o `RE_SO_DIGITOS` de `coresEstado.ts`, que já foi alinhado ao Python). |
| 10 | Truthiness: string vazia, lista vazia e `None` são falsos | `rotulo.rotulo`, `if texto`, `if mapa` | Checagens explícitas (`!== ''`, `.length > 0`, `!= null`), nunca truthiness genérica em `0`/`'0'`. |
| 11 | `valor not in lista` compara estruturalmente; o `includes` do JS compara por referência | `_valores_por_variavel` | Igualdade profunda para valores que não são primitivos. |
| 12 | `isinstance(x, str)` / `isinstance(x, dict)` | todos os módulos | `typeof x === 'string'` / "objeto simples, não array, não null". |
| 13 | f-string com chave literal `({{${var}}})` | `_no_fila_dinamica` | O texto final precisa ser `({$var})`. Golden cobre. |
| 14 | `.lower()` em rótulos com acento ("É CPF") | `texto_no_condicao` | `toLowerCase()` (sem `toLocaleLowerCase`). Golden cobre. |
| 15 | `setdefault` (o primeiro valor vence) | `estado_por_transicao` | `if (!mapa.has(k)) mapa.set(k, v)`. |
| 16 | IDs das arestas `e:{transicao}:{acao}:{origem}-{destino}` e dos nós `mensagem:<id>`, `fila:<n>`, etc. | serialização | Strings idênticas. Golden cobre. |

### Diferenças de fonte de dados (JSON exportado vs `state.botCarregado`)

| Situação | Desktop (arquivo exportado) | Extensão (`getBot` → adapter) | Tratamento |
|---|---|---|---|
| `CONDITION_DATA`/`ACTION_DATA` | objeto, **ou** string escapada na chave `"3"` | sempre objeto (`parseJsonSeguro`) | O parser TS suporta os dois caminhos, como o Python. |
| Chaves-espelho numéricas (`"0"`, `"1"`…) | presentes | presentes (`withMirrors`) | Ignoradas (só as chaves nomeadas são lidas). |
| `BOT_STATES[].ID` | ID da linha | igual ao `STATE_NUMBER` | Irrelevante para o grafo. |
| IDs de transição/ação depois de salvar | — | O `updateBot` faz DELETE + INSERT, então os IDs no servidor mudam, mas a ordem relativa é a mesma enviada | Irrelevante: o grafo só depende da ordem relativa das ações, e ela é preservada. |
| `ACTION_DATA` com JSON inválido | `ParserError` | `{}` silencioso (o adapter engole o erro) | Comportamento diferente, mas não controlado por esta feature. Documentar; não mexer no adapter. |
| Transição apontando para estado inexistente, ID duplicado, campo obrigatório ausente | `ParserError` (o app mostra erro) | idem | O TS gera o mesmo erro, com a mesma mensagem em português, e o toast mostra o erro. **Nunca exporta um grafo parcial.** |

---

## Fases

### Fase 0: Spike de riscos técnicos (0,5 a 1 dia)

Protótipo descartável que prova as premissas arriscadas antes de investir no port. Nada vai para `main`.

- [ ] Um iframe de página da extensão (`vendor/.../index.html`) carrega dentro da `bot.php` real, sem ser bloqueado pela CSP da Orpen (`frame-src`/`default-src`).
- [ ] O handshake via `MessageChannel` entre content script e iframe funciona, com a checagem de nonce.
- [ ] Com o iframe **fora da área visível**, o React Flow termina de desenhar as arestas (depende de `ResizeObserver`/`requestAnimationFrame`, que o Chrome pode estrangular em iframe cross-origin fora da tela; ver R1). Testar três variantes e registrar qual funciona: (a) `left:-100000px`; (b) dentro da tela com `opacity:0; pointer-events:none; z-index` abaixo do overlay; (c) dentro de um mini card visível "Gerando…".
- [ ] O `html-to-image` captura com a fonte Inter embutida, em PNG e em SVG (conferir que o texto não caiu para Segoe UI).
- [ ] Bot grande (o "OP 1 - CONSULTA - 2026", 72 estados / 249 transições) gera PNG e SVG válidos (não `data:,`), com o tempo registrado.
- [ ] O padrão `vendor/*` em `web_accessible_resources` cobre `vendor/fluxograma/assets/*`.
- [ ] Em bots reais, as três referências do D6 batem com o ambiente: `destiny` da ação tipo 5 com `queues[].id`, `destiny` da ação tipo 4 com `bots[].id`, e `CONDITION_TYPE` de `calendario`/`calendario_falso` com `calendars[].id`. Se alguma não bater (ex.: o calendário usar outro identificador), registrar o mapeamento correto antes da Fase 1.

**Saída:** nota curta em `.project/log.md` com a variante de iframe escolhida e os tempos medidos. Se a CSP bloquear o iframe, voltar a esta spec antes de seguir (plano B: renderizar no Shadow DOM, registrando a Inter via `FontFace` em `document.fonts` e passando `fontEmbedCSS` ao `html-to-image`).

#### Resultado da Fase 0 (2026-09-23, `bot.php` real, branch `spike/fluxograma-fase0`)

Teste com um bot sintético de 245 nós / 289 arestas (porte do "OP 1 - CONSULTA - 2026").

| Item | Resultado |
|---|---|
| Iframe de extensão × CSP da Orpen | ✅ Carrega. R2 descartado; o plano B não é necessário. |
| Handshake `MessageChannel` + nonce | ✅ Funciona. |
| Variante (a) fora da tela | ❌ `fps: 0`: o Chrome congela o iframe e os nós nunca são medidos. R1 confirmado para essa variante. **Descartada.** |
| Variante (b) na tela, `opacity:0` | ✅ 61 fps, arestas desenhadas em ~0,25 s. **Escolhida.** Estilo: `position:fixed; left:0; top:0; width:1280px; height:800px; border:0; opacity:0; pointer-events:none; z-index:0`, anexado ao `document.body`. |
| Variante (c) mini card visível | ✅ Também funciona. Fica como alternativa se a (b) der problema. |
| Fonte Inter | ⚠️ Na primeira rodada, `document.fonts.ready` resolvia antes de a Inter ser baixada (nenhum texto a usava ainda), então o `layout.ts` media os cards com a fonte de fallback. **Corrigido com `document.fonts.load()` explícito** (ver Fase 2, item 4). Depois da correção: `interCarregada: true`, `@font-face` Inter 400/500 embutido no SVG, e a largura do PNG passou de 15.785 para 14.594 px (medição coerente com o desenho). |
| Bot grande, PNG | ✅ 10,4 s no total (captura 7,8 s), 14,2 MB, 14.594 × 16.384 px (altura reduzida pelo limite de 16.384 px do `html-to-image`, igual ao desktop). |
| Bot grande, SVG | ✅ 6,3 s no total (captura 2,0 s), 15,6 MB. Abre no Chrome e no Edge. ~14,5 MB do arquivo são estilos inline que o `html-to-image` copia elemento por elemento; o desktop faz igual, então fica por paridade (otimização possível no futuro). |
| `eval`/`new Function` no bundle (R7) | ✅ Nenhum. O build sai sem script inline e roda na CSP de página de extensão. |
| `vendor/*` em `web_accessible_resources` | ✅ Cobre subpastas: o iframe `vendor/fluxograma-spike/index.html` carregou sem mudar o manifest. Os `assets/` são carregados pela própria página da extensão, então não precisam estar listados. |
| D6: fila | ✅ `destiny` da ação tipo 5 = `queues[].id` (ex.: 7101 → "[7101] Suporte"). |
| D6: calendário | ✅ `CONDITION_TYPE` = `calendars[].id` (227, 234, 182 resolvidos). |
| D6: bot externo | ✅ `destiny` da ação tipo 4 = `bots[].id` (ex.: 1208262 → "[IMPORT] BOT SUPORTE FIN OUVIDORIA", exibido como "[1208262] [IMPORT] BOT SUPORTE FIN OUVIDORIA"). Destino dinâmico (`{$pref_agent}`) vira fila dinâmica, sem nome, como no desktop. |
| Volume real do ambiente | 61 filas, 178 bots, 23 calendários. Um único bot de produção chegou a ter 9 filas, 1 bot externo e 2 calendários, todos resolvidos. |
| Nomes com espaço no fim | ⚠️ Encontrado nos cadastros (ex.: `"[-50] QA - Teste Valor Negativo "`). Os **nomes** também passam por `trim()` (ver D6). |

### Fase 1: Port do pipeline + paridade golden (2 a 3 dias)

É a fase mais importante. A fidelidade é garantida aqui.

1. Criar o subprojeto `fluxograma/` (`package.json`, vitest, tsconfig) e o `ORIGEM.md` com o commit `7c9c976`.
2. `scripts/gerar_golden.py`: importa o `backend.core` do Fluxo BOT via `sys.path` (**sem modificar aquele repositório**). Para cada fixture, roda `carregar_bot → construir_grafo → filtrar_grafo(MODO_CLIENTE) → grafo_para_reactflow` e grava dois goldens:
   - `golden/<fixture>.json`: sem overrides;
   - `golden/<fixture>.nomes.json`: `aplicar_overrides_reactflow` com `Overrides(bots_externos=…, calendarios=…)` e um `dicionario_filas`, todos de teste e gerados pelo próprio script a partir das referências do fixture. Cada fixture também deixa **uma referência de cada tipo sem nome**, para cobrir o caso "sem correspondência".
   O cabeçalho do golden guarda o commit do Fluxo BOT e o hash do fixture.
3. Portar, nesta ordem, cada um com seus testes: `pythonCompat` → `modelo` → `parser` → `dicionarios` → `mensagens` → `grafo` → `rotulos` → `filtro` → `grafoParaReactflow` → `nomesAmbiente` → `pipeline`. `nomesAmbiente` também tem testes próprios para a **montagem** dos dicionários a partir de `state.ambienteOrpen` (remoção do prefixo `[Bot] `, formato `[ID] NOME`, `trim` dos IDs, ambiente ausente).
4. `paridade.test.ts`: para cada fixture e cada golden, `expect(ts).toStrictEqual(golden)`, **com a ordem de `nodes` e `edges` incluída**.
5. Uma segunda passada de paridade com a **forma da extensão**: cada fixture é convertido para o shape de `state.botCarregado` (espelhos numéricos, `*_DATA` como objeto, `BOT_STATES.ID = STATE_NUMBER`), e o resultado precisa bater com os mesmos goldens.
6. Testes de erro: cada `ParserError` do Python tem um equivalente TS com a mesma mensagem.

Fixtures:
- Commitados: os 5 sintéticos de `Fluxo BOT/backend/tests/fixtures/`.
- Locais (gitignored): os 2 de `fixtures_reais/` e **pelo menos 3 bots reais baixados pelo "Backup JSON" da própria extensão**, incluindo o de 72 estados e o "RCX - PRODUÇÃO 15/01". O `gerar_golden.py` roda neles do mesmo jeito, porque o parser do desktop aceita o formato do Backup JSON.

**Aceite:**
- [x] 100% dos goldens batem (sintéticos + locais, com e sem nomes do ambiente, nas duas formas de entrada).
- [x] Todos os 16 itens da tabela de armadilhas com teste ou cobertura por golden identificada (ver abaixo).
- [x] `npm test` roda sem depender de navegador (Node + vitest).
- [x] Goldens locais com **pelo menos 3 bots reais do "Backup JSON"** da extensão: "OP 1 - CONSULTA - 2026" (238 nós / 390 arestas, 21 back edges, 6 calendários, fila e bot externo), "RCX - PRODUÇÃO 15/01" e "Teste" (bot externo), além dos 2 de `fixtures_reais` do Fluxo BOT. **127 testes passando.**

#### Resultado da Fase 1 (2026-09-23, branch `feat/exportar-fluxograma`)

- Port em `fluxograma/src/core/`, mapa arquivo a arquivo em `fluxograma/ORIGEM.md`. **103 testes passando**, `tsc --noEmit` limpo.
- Goldens: 5 sintéticos do Fluxo BOT + `cobertura-port.json` (escrito à mão para exercitar as armadilhas) + 2 bots reais locais, cada um sem e com nomes do ambiente, nas duas formas de entrada; mais 15 casos de erro com a mensagem idêntica à do Python.
- **Teste de mutação**: trocar o `splitlines` do Python por `split("\n")`, ou o `strip` do Python pelo `trim()` do JS, faz a paridade falhar. Os goldens pegam divergências sutis.
- Divergências aceitas (só com dado que a Orpen não produz) listadas em `ORIGEM.md`.
- **Achado: ordem de entrada.** O `getBot` (usado pela extensão) ordena estados por número, transições por estado + prioridade, e condições/ações por ID. O `exportBotJSON` nativo da Orpen **não tem `ORDER BY`**. Como o dagre depende da ordem, o mesmo bot pode ter layout um pouco diferente no desktop se ele abrir o export nativo. Não é erro do port: a comparação da Fase 4 usa o "Backup JSON" da extensão dos dois lados.

Cobertura de cada armadilha:

| # | Coberto por |
|---|---|
| 1 Ordem de inserção | Todos os goldens (comparação estrita da ordem de `nodes`/`edges`); `cobertura-port` tem estados `"10"`/`"A1"`/`"B2"` que um objeto JS reordenaria |
| 2 DFS / pilha | Back edges nos goldens (`cobertura-port`, bot real `eav_parque_lage`) |
| 3 Ordenação de estados | `cobertura-port` (`"0"`, dígitos, `"A1"`, `"B2"`, `"10"`) + `compararStr` em `pythonCompat.test.ts` |
| 4 `int()` | `pythonCompat.test.ts` + `erros.json` (ID não numérico) + ações fora de ordem no `cobertura-port` |
| 5 `html.unescape` | Chave `"3"` escapada no `cobertura-port` + `pythonCompat.test.ts` |
| 6 `splitlines` | Menu com U+2028 no `cobertura-port` + `pythonCompat.test.ts` + mutação |
| 7 `strip` | Mensagem só com BOM no `cobertura-port` + `pythonCompat.test.ts` + mutação |
| 8 Regex com `\d` Unicode | Opção `٣` (dígito arábico) no `cobertura-port` |
| 9 `isdigit` | `pythonCompat.test.ts` |
| 10 Truthiness | `pythonCompat.test.ts` + goldens (opção sem valor, fallback) |
| 11 `==` estrutural | `7203` repetido na fila dinâmica do `cobertura-port` + `pythonCompat.test.ts` |
| 12 `isinstance` | Goldens (dados mistos string/número) |
| 13 f-string `{$var}` | Fila dinâmica no `cobertura-port` |
| 14 `.lower()` com acento | Goldens ("contém") |
| 15 `setdefault` | Transição que passa por dois estados (`A1` → `B2` → `3`) no `cobertura-port` |
| 16 IDs de nós/arestas | Todos os goldens |

### Fase 2: Renderizador em iframe + captura PNG/SVG (1 a 1,5 dia)

1. Copiar a camada de render (D3) para `fluxograma/src/render/` **byte a byte** (sem cabeçalho). O teste `copiasRender.test.ts` compara cada cópia com o arquivo original no commit de `ORIGEM.md`, e o `.gitattributes` desliga a conversão de fim de linha nessa pasta.
2. `exportar.ts`: mantém `capturarDiagrama(nodes, formato)` **com os mesmos parâmetros do desktop**: padding 0,06, fundo `#f4f5f7`, `pixelRatio` 2 para PNG e 1 para SVG, `getViewportForBounds(bounds, l, a, 0.05, 4, 0.06)`. Troca a ponte Qt por um retorno de `Blob`. Para PNG, usa `toBlob` em vez de `toPng` para não passar por base64 num bot grande (o pixel resultante é o mesmo). Para SVG, usa `toSvg` e converte o data URL em `Blob` `image/svg+xml`.
3. `Renderizador.tsx`: ReactFlow sem `Controls`/`MiniMap`/`Background`/seleção. Monta as arestas com cor por estado exatamente como o `App.tsx` do desktop (`corPorEstado`, `MarkerType.ArrowClosed` 16×16, vermelho `oklch(64% 0.19 25)` nas back edges).
4. Condição de pronto antes de capturar: **antes do layout**, `await document.fonts.load()` para cada fonte que o `layout.ts` mede (`500 11px`, `600 14px`, `400 13px`, `400 12px` e `400 12.5px Inter`). `document.fonts.ready` sozinho não basta: ele resolve na hora se nenhum texto usou a fonte ainda (achado da Fase 0). Depois: layout calculado → `useNodesInitialized()` verdadeiro → número de `.react-flow__edge` renderizados igual a `edges.length` → dois `requestAnimationFrame`. Timeout de 30 s, que gera o erro "Não foi possível desenhar o fluxograma a tempo".
5. Canvas grande (só PNG): o `html-to-image 1.11.13` já reduz a escala automaticamente acima de 16.384 px por dimensão, e o desktop herda o mesmo comportamento. Manter (é paridade). Se mesmo assim o resultado vier vazio, devolver o erro "Fluxograma grande demais para PNG. Tente gerar em SVG".
6. `ponteExtensao.ts`: o protocolo descrito acima.
7. Build: `npm run build` → `vendor/fluxograma/` (`index.html` + `assets/`), sem script inline. Conferir que a página abre sem erro de CSP no console da extensão.

**Aceite:**
- [x] Abrindo `vendor/fluxograma/index.html` com um fixture injetado por um harness de teste, PNG e SVG são gerados sem erro de CSP.
- [x] Para os 5 sintéticos, PNG e SVG da extensão comparados lado a lado com os do desktop (mesmo JSON, **desktop sem sidecar e com `dicionario_filas.json` vazio**) mostram os mesmos nós, textos, cores, setas e posições. Diferenças só de anti-aliasing entre as versões de Chromium são aceitáveis; qualquer diferença de posição, quebra de linha ou texto não é.
- [x] O SVG gerado abre corretamente em Chrome e Edge (validado na Fase 0 com o mesmo `toSvg`).

#### Resultado da Fase 2 (2026-09-23, branch `feat/exportar-fluxograma`)

- Renderizador em `fluxograma/src/app/` (`main.tsx`, `Renderizador.tsx`, `exportar.ts`, `ponteExtensao.ts`); build em `vendor/fluxograma/`, sem script inline e sem `eval`/`new Function`.
- **Paridade visual automatizada** (`npm run paridade:visual`, e `PARIDADE_FORMATO=svg npm run paridade:visual`). Num Chrome real (154), o script abre o **build real do desktop** (`Fluxo BOT/frontend/dist/index.html`) com o grafo gerado pelo Python e chama a captura do próprio desktop. Do outro lado, pede ao nosso iframe o arquivo do bot **bruto**, pelo mesmo handshake que a extensão vai usar. Depois compara pixel a pixel (o SVG é comparado já desenhado pelo Chrome, porque o texto do arquivo carrega estilos de contexto da página, como tamanho do container e idioma, que não mudam o desenho).
- **Resultado: 22 de 22 casos idênticos, 0 pixel diferente, em PNG e em SVG.** São os 6 sintéticos e os 5 bots reais, cada um com e sem nomes do ambiente, inclusive o "OP 1 - CONSULTA - 2026" (PNG de 16.384 × 5.845 px).
- `src/render/` é cópia byte a byte do Fluxo BOT, verificada por teste (136 testes no total).
- Achado: o bug dos asteriscos no nome personalizado do desktop (ver D6). A extensão aplica os nomes do ambiente como dado real do nó, então não herda o bug. A paridade dos casos com nomes compara com a saída do desktop convertida por `nomesComoDadoReal` (`tests/apoio.ts`), e essa é a única diferença intencional.
- Para a Fase 3: gerar o nonce com `crypto.getRandomValues`, e não `crypto.randomUUID`, que só existe em página `https` (caso alguma instalação da Orpen rode em `http`).

### Fase 3: Integração na extensão (1,5 a 2 dias)

1. **Linha de base e salvamento** (as mudanças em `orpen-bridge.js`/`state.js` descritas na tabela de arquivos). Teste manual antes de seguir: o botão "Salvar" continua se comportando exatamente igual (toasts, spinner, pendências, reload de bot novo).
2. **Botão no rodapé** (inserido por `orpen-bridge.js`, à esquerda de "Backup JSON"), mesmo visual dos botões do rodapé:
   - seletor compacto **PNG | SVG** (padrão PNG) + botão com ícone Lucide `workflow` e o texto **"Gerar fluxograma"**;
   - **bot novo não salvo** (`_isNewBot`): botão desabilitado com a dica "Salve o bot pela primeira vez para gerar o fluxograma". Motivo: salvar um bot novo recarrega a página (`orpen-bridge.js`, `setTimeout(reload, 1500)`) e mataria a geração;
   - gerando: desabilitado, com spinner e "Gerando fluxograma…" (opcionalmente a etapa, vinda de `progresso`);
   - pronto: download automático + toast "Fluxograma pronto: <arquivo>", e o botão volta ao repouso;
   - erro: toast com a mensagem do iframe, e o botão volta ao repouso.
3. **Fluxo do clique** (`fluxograma-export.js`):
   ```
   clique
    → há geração em andamento? ignora
    → atual = serializeBracketNotation(toUpdateBotPayload(bot))
    → atual !== state.baselineSalvo ?
         → diálogo: "Este bot tem alterações não salvas. Para gerar o fluxograma,
                     elas serão salvas na plataforma primeiro."
                    [Cancelar]  [Salvar e gerar]
         → Cancelar: encerra, nada é salvo nem gerado
         → Salvar e gerar: ok = await salvarBotNaOrpen()
                           → !ok: encerra (o próprio salvar já mostrou o toast de erro)
    → snapshot do bot → nomesAmbiente de state.ambienteOrpen (filas, bots, calendários)
    → iframe 'gerar' → 'pronto' → download + toast | 'erro' → toast
   ```
   O diálogo é um elemento novo dentro do Shadow DOM (não usa `window.confirm`, para manter o visual do editor), com foco inicial em "Cancelar" e Esc para cancelar. Se o salvamento abrir o modal de pendências, a geração segue normalmente por trás.
4. Fechar o modal no meio da geração **não** cancela nada: o download e o toast acontecem mesmo assim (o `#mb-toast-container` já fica fora do overlay, ver `css/styles.css`). Abrir outro bot durante uma geração também não interfere, porque a geração usa o snapshot.
5. Nenhuma chamada nova à Orpen além do `updateBot` do salvamento confirmado pelo usuário.

**Aceite:**
- [ ] Bot sem alterações: gera direto, sem diálogo.
- [ ] Bot com alteração: o diálogo aparece; "Cancelar" não salva nem gera; "Salvar e gerar" salva (o bot reaberto mostra a alteração gravada) e depois gera.
- [ ] Salvamento com erro (ex.: nome vazio, conflito de número): o erro aparece como hoje e nada é gerado.
- [ ] Desfazer manualmente uma alteração (voltar ao valor original) faz o diálogo **não** aparecer, porque a comparação é por conteúdo.
- [ ] Bot novo: botão desabilitado com a dica.
- [ ] Geração em segundo plano: dá para rolar e editar o bot enquanto gera.
- [ ] PNG e SVG baixados com o nome correto.
- [ ] Bot com transferência para outro bot (ação tipo 4): o bot externo aparece como "[ID] NOME", sem o prefixo "[Bot]".
- [ ] Filas, bots externos e calendários com nome real no fluxograma; referência inexistente no ambiente aparece como hoje (número / calendário "não resolvido").
- [ ] Bot com erro estrutural (transição órfã) mostra toast de erro e não baixa nada.
- [ ] Checklist de regressão (abaixo) 100% ok.

### Fase 4: Aceite final e release (0,5 a 1 dia)

- [ ] Rodar os goldens de novo, contra o commit atual do Fluxo BOT.
- [ ] Comparação lado a lado desktop × extensão para os 3+ bots reais, em PNG e SVG. No desktop, preencher a Nomenclatura (filas, bots externos, calendários) com os mesmos nomes que a extensão tira do ambiente: o resultado tem que bater, incluindo os nomes.
- [ ] Checklist de regressão completo na `bot.php` real.
- [ ] Bump de versão no `manifest.json`, `CHANGELOG.md`, seção nova em `DOCUMENTACAO_EXTENSAO.md` (inclui como reconstruir `vendor/fluxograma/`).
- [ ] Gerar o zip de distribuição e conferir que `vendor/fluxograma/` está dentro.

**Estimativa total:** 6 a 9 dias de trabalho focado.

| Fase | Estimativa |
|---|---|
| 0: Spike | 0,5 a 1 d |
| 1: Port + paridade (inclui os nomes do ambiente) | 2,5 a 3,5 d |
| 2: Renderizador + PNG/SVG | 1 a 1,5 d |
| 3: Integração (salvar antes, botão, download) | 1,5 a 2 d |
| 4: Aceite e release | 0,5 a 1 d |

---

## Checklist de regressão (tudo o que já funciona)

Rodar na `bot.php` real, com a extensão recarregada, antes de fechar as Fases 3 e 4:

- [ ] Clique em "Editar" abre o overlay; **Shift+clique** abre o modal nativo.
- [ ] "Adicionar" abre o editor em modo criação; salvar um bot novo continua recarregando a página.
- [ ] Editar nome/status/timeout/integrações, adicionar/duplicar/excluir/reordenar estado e transição, condições/ações, menu builder.
- [ ] "Salvar" grava via `updateBot`, com os mesmos toasts, spinner e modal de pendências de antes, e o bot reabre com as alterações.
- [ ] "Backup JSON" baixa o arquivo com o mesmo nome e conteúdo de antes.
- [ ] Modal de pendências.
- [ ] Esc fecha o overlay; toasts aparecem.
- [ ] Layout do modal (header, rolagem, rodapé) igual ao de antes, a 100% de zoom do navegador, e o rodapé comporta o botão novo sem quebrar linha em telas ≥ 1280 px.
- [ ] Nenhum erro novo no console da página nem no da extensão.
- [ ] Com o fluxograma **nunca acionado**, nenhum recurso de `vendor/fluxograma/` é carregado (conferir na aba Network): a feature tem custo zero para quem não usa.

---

## Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | O Chrome estrangula iframe cross-origin fora da tela: `requestAnimationFrame`/`ResizeObserver` não disparam, e as arestas nunca desenham. | **Confirmado na Fase 0** para iframe fora da tela. Mitigado com a variante (b), na tela e invisível. A condição de pronto mantém o timeout com erro claro. |
| R2 | A CSP da `bot.php` bloqueia o iframe de extensão. | **Descartado na Fase 0**: o iframe carrega. |
| R3 | O port diverge do Python em algum detalhe (ordem, Unicode, truthiness). | Tabela de armadilhas + goldens com ordem estrita + bots reais nos goldens locais. |
| R4 | O Fluxo BOT evolui e o port fica desatualizado (duas implementações). | `ORIGEM.md` com o commit; o golden guarda o commit; regra de manutenção abaixo. |
| R5 | A medição de texto (`measureText`) difere entre o Chromium do Qt e o Chrome e desloca levemente o layout. | Inter embutida nos dois lados; a comparação visual da Fase 2 aceita só diferença de anti-aliasing. Se aparecer deslocamento, investigar antes de liberar. |
| R6 | Bot muito grande: memória e tempo de captura; PNG reduzido pelo limite de canvas. | Medido na Fase 0; `toBlob` + `ArrayBuffer` transferível; a geração não bloqueia o editor; o SVG existe como alternativa sem limite. |
| R7 | Alguma dependência usar `eval`/`new Function` (bloqueado na CSP de página de extensão). | **Descartado na Fase 0**: o bundle não usa nenhum dos dois. Conferir de novo no build da Fase 2 se alguma dependência mudar. |
| R8 | A linha de base acusa alteração que não existe (falso positivo), porque algum campo do payload não é determinístico. | Por construção, `toUpdateBotPayload` + `serializeBracketNotation` são puros e ordenados. Teste na Fase 3: abrir um bot e clicar em gerar sem mexer em nada não pode abrir o diálogo. |
| R9 | Mudar o `salvarBotNaOrpen` altera o "Salvar". | A mudança é só acrescentar `return true/false` e atualizar a linha de base; o listener existente ignora o retorno. Coberto pelo checklist de regressão. |
| R10 | O SVG abre em branco em Word/PowerPoint/Illustrator (`foreignObject`). | Limitação conhecida, igual à do desktop. Dica no seletor ("SVG: melhor para abrir no navegador") e PNG como padrão. |
| R11 | O ID usado no bot não é o mesmo ID do cadastro do ambiente (principalmente em calendário e bot externo), e o nome aplicado sai errado. | Validação obrigatória na Fase 0, com bots reais; na dúvida, a referência fica sem nome em vez de receber um nome errado. |

## Manutenção / sincronia com o Fluxo BOT

- Qualquer mudança em `Fluxo BOT/backend/core/*` (parser, grafo, filtro, grafo_para_reactflow, rotulos, mensagens, dicionarios, overrides) ou em `frontend/src/{layout,NoEstado,ArestaConversa,texto,tiposNo,icones,coresEstado,exportar}.*` ou `tema.css` exige: re-portar, rodar `gerar_golden.py`, `npm test`, `npm run build` e atualizar o commit em `ORIGEM.md`.
- O teste de paridade falha se o commit gravado nos goldens for diferente do declarado em `ORIGEM.md`. Isso força a revisão em vez de deixar a divergência passar em silêncio.

## Questões em aberto

Nenhuma. Todas as decisões de produto estão registradas em P1 a P4.
