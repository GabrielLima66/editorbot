# 03 · Fluxograma (gerar a imagem do fluxo)

Status: implementada (referência: `js/fluxograma-export.js`, subprojeto `fluxograma/`, build em `vendor/fluxograma/`). Esta spec descreve o comportamento para o time poder manter, evoluir ou reimplementar sem o código Python do app desktop de onde o desenho foi portado.

Pré-requisito: `00-contrato-de-entrada.md`. A spec histórica, com decisões de projeto e resultados de testes, está em `SPEC-exportar-fluxograma.md` (na pasta `codigo-de-referencia/` do pacote). Em caso de conflito entre ela e esta spec, **vale esta**.

---

## 1. Objetivo

Gerar, a partir do bot aberto no editor, **uma imagem do fluxograma (PNG ou SVG)** que mostre como a conversa caminha: estados, mensagens, menus, condições, transferências e encerramentos. A imagem serve para documentar, apresentar e revisar um bot sem abrir estado por estado.

A imagem deve ser **idêntica à que o app desktop "Fluxo BOT" exporta** para o mesmo bot (no Modo Cliente). Essa fidelidade é um requisito de produto e é **provada por teste**, não por inspeção visual.

### Decisões de produto (fixas)

| # | Decisão |
|---|---|
| P1 | O fluxograma representa **sempre o bot como está salvo na plataforma**. Se houver alterações não salvas, o sistema pede para salvar antes e só gera depois do aceite. |
| P2 | Filas, bots externos e calendários aparecem com o **nome real** (vindo dos cadastros do ambiente), não com o número. |
| P3 | Formatos **PNG** (padrão) e **SVG**. |
| P4 | Só o **Modo Cliente** (visão de apresentação). Não existe seletor de modo. |

### Fora do escopo

Modo Técnico, PDF, painel de nomenclatura/renomeação manual, visualização interativa, painel de validação, geração a partir da página avulsa (`bot_transform.html`), e **marcar no fluxograma o caminho percorrido num teste** (decidido não fazer).

---

## 2. Experiência de uso

1. Rodapé do editor, à esquerda de "Backup JSON": um seletor **PNG | SVG** (dica: "Formato do fluxograma. SVG: melhor para abrir no navegador.") e o botão **Gerar fluxograma** (ícone `workflow`; dica: "Gerar o fluxograma deste bot (como está salvo na plataforma)").
2. Clique:
   - Se o bot **não tem estados**: toast "Este bot ainda não tem estados: não há fluxograma para gerar." (checado **antes** de tudo, inclusive antes do pedido de salvar).
   - Se há **alterações não salvas**: diálogo "Salvar antes de gerar?" — "Este bot tem alterações que ainda não foram salvas. Para gerar o fluxograma, elas serão salvas na plataforma primeiro." Botões **Cancelar** (foco inicial; Esc também cancela; nada é salvo nem gerado) e **Salvar e gerar** (salva pelo mesmo caminho do botão Salvar; se o salvamento falhar, para — o próprio salvar já mostrou o erro).
3. Durante a geração o botão fica desligado, com um spinner e o texto da etapa: "Montando o fluxograma…", "Organizando…", "Desenhando…", "Gerando a imagem…" (padrão "Gerando fluxograma…").
4. A geração roda **em segundo plano**: o editor continua utilizável (só uma breve travada durante a captura). Fechar o modal do editor, ou abrir outro bot, **não cancela** a geração, porque ela usa um *snapshot* do bot (`structuredClone` do bot em memória, feito **depois** do salvamento). Detalhe: depois de "Salvar e gerar", se o editor tiver **substituído** o objeto do bot em memória (recarregando-o do servidor), a geração é abandonada em silêncio; o snapshot é sempre do objeto que estava aberto antes de salvar.
5. Ao terminar: **download automático** e toast "Fluxograma pronto: <arquivo>". Sem os cadastros do ambiente (coletor falhou): "Fluxograma pronto: <arquivo> (sem os nomes de fila/bot/calendário: cadastros da Orpen não carregados)". Em erro: toast "Erro ao gerar o fluxograma: <motivo em português>".
6. Nome do arquivo: `fluxograma_<ID do bot>_<NOME do bot com caracteres fora de [a-zA-Z0-9_-] trocados por _>.<png|svg>` (`sem-id` / `sem-nome` quando ausentes).
7. **Uma geração por vez** (um segundo clique é ignorado enquanto há uma em andamento).

### Detecção de "alterações não salvas"

Guardar uma **linha de base**: o texto que o salvamento enviaria ao servidor (`serializeBracketNotation(toUpdateBotPayload(bot))`), gravado (a) logo depois de abrir o bot e (b) logo depois de um salvamento bem-sucedido. No clique, recalcular o mesmo texto para o bot atual: se for diferente, há alteração. Efeitos desejados: desfazer manualmente uma alteração (voltar ao valor original) **não** abre o diálogo; abrir o bot e gerar sem mexer em nada **nunca** abre o diálogo.

---

## 3. Visão geral do pipeline

```
bot (JSON)                         ← snapshot do bot salvo
  1. montarBot          valida e organiza (seção 4)
  2. construirGrafo     nós e arestas "de execução" + marca as arestas de retorno (seção 5)
  3. filtrarModoCliente remove o que é ruído (seção 6)
  4. grafoParaReactflow insere os nós de condição/calendário e monta dados (seção 7)
  5. aplicarNomesAmbiente   nomes reais (seção 9)
  6. layout             posição de cada nó (seção 11)
  7. desenho            nós e setas (seções 8 e 10)
  8. captura            imagem (seção 12)
```

Os passos 1 a 5 são **puros** (sem navegador) e testáveis em Node. Os passos 6 a 8 precisam de navegador (canvas para medir texto, DOM para desenhar).

---

## 4. Montar e validar o bot (passo 1)

Entrada: o objeto do bot (contrato, seção 1).

- Exigir `ID` e `NAME` no topo; `BOT_STATES` precisa ser uma lista **não vazia**.
- **Estados:** cada um exige `STATE_NUMBER`, `ID` e `ALIAS`; `STATE_NUMBER` único (duplicado → erro). A ordem dos estados é a ordem da lista.
- **Transições:** exigem `ID` (único) e `STATE` (precisa existir em `BOT_STATES`; senão erro de "transição órfã"); `PRIORITY` precisa ser inteiro (padrão `"0"`). Cada transição é anexada ao seu estado **na ordem em que aparece na lista** (a `PRIORITY` não reordena aqui).
- **Condições:** exigem `ID`, `TRANSITION_ID` (existente), `CONDITION_TYPE`; `CONDITION_DATA` pode vir como objeto **ou** como texto JSON (inclusive escapado em HTML, na chave numérica `"3"`); vazio vira `{}`.
- **Ações:** idem (`ACTION_TYPE`, `ACTION_DATA`). **As ações de cada transição são ordenadas por `ID` numérico crescente** (ordem de execução); `ID` não numérico é erro.
- **Erros:** qualquer violação lança um **erro de estrutura com mensagem em português**, mostrado ao usuário como "O bot tem um problema de estrutura: <mensagem>". **Nunca** se gera um fluxograma parcial.
- Chaves numéricas espelhadas (`"0"`, `"1"`...) são ignoradas (exceto `"3"`, usada só como alternativa de `*_DATA`).

---

## 5. Construir o grafo (passo 2)

### 5.1 Tipos de nó

| Tipo | Id do nó | Rótulo padrão (texto do nó) | Significado |
|---|---|---|---|
| `estado` | o `STATE_NUMBER` em texto | o `ALIAS` | um estado do bot |
| `mensagem` | `mensagem:<ID da ação>` | texto enviado (seção 5.3) ou `*Mensagem interativa*` | uma mensagem ou menu enviado |
| `condicao` | `condicao:<ID da transição>` | `Mensagem: <operador> "<opção>"` (seção 7) | a escolha do cliente que leva a uma transição |
| `calendario` | `calendario:<ID da transição>` | `<Dentro do horário\|Fora do horário> (calendário <id>)` | condição de calendário de uma transição |
| `fila` | `fila:<destino>` | `*Transfere para a fila <destino>*` | transferência para fila |
| `bot_externo` | `bot_externo:<destino>` | `*Transfere para o bot <destino>*` | transferência para agente/bot |
| `fila_dinamica` | `fila_dinamica:<variável>` | `*Transfere para fila dinâmica ({$<variável>})*` | destino em `{$variável}` (só se sabe em execução) |
| `encerrado` | `encerrado` (um único, compartilhado) | `*Encerra o atendimento*` | fim do atendimento |
| `orfao` | `orfao:<destino>` | `*Erro: estado inexistente (<destino>)*` | Troca Estado para um estado que não existe |

Os asteriscos no rótulo marcam "isso é ação do sistema, não fala do bot"; o desenho os remove (seção 8).

### 5.2 Percurso de uma transição

Para cada estado (na ordem da lista) e para cada transição dele (na ordem anexada), partir do nó do estado (`noAtual`) e percorrer as **ações já ordenadas**:

| Ação | O que faz no grafo |
|---|---|
| **1, 10 ou 11** (mensagem, menu, formulário) | Criar o nó `mensagem:<ID da ação>`; criar seta `noAtual → mensagem`; `noAtual = mensagem`. |
| **2** (Troca Estado) | Destino = `destiny`. Se for texto não vazio contendo `{$` → nó `fila_dinamica` (a variável é o primeiro nome dentro de `{$...}`, letras/números/`_`). Senão, se o destino for **igual a um `STATE_NUMBER`** (comparação do valor cru) → o nó do estado. Senão → nó `orfao`. Criar seta `noAtual → destino`; `noAtual = destino`; marcar "houve transferência". |
| **5** (Transf. Fila) | Destino `{$...}` → `fila_dinamica`; senão nó `fila:<destiny>`. Seta; `noAtual = destino`; "houve transferência". |
| **4** (Transf. Agente) | Destino `{$...}` → `fila_dinamica`; senão nó `bot_externo:<destiny>`. Seta; `noAtual = destino`; "houve transferência". *Observação:* na Orpen a ação 4 transfere para um **agente ou bot** (o select tem os dois grupos), mas o app desktop de origem a trata sempre como transferência para bot; por **paridade**, o fluxograma faz o mesmo, e o nome real vem da lista de bots (se o ID for de agente, fica sem nome). |
| **6** (Finalizar) | Não cria nó agora (ver depois do laço). |
| qualquer outra | Ignorada (não gera nó nem seta). |

Depois do laço: se **não** houve transferência e a transição tem alguma ação 6 → usar o nó único `encerrado` e criar seta `noAtual → encerrado` (com `acaoId` vazio).

Nós `fila`, `bot_externo`, `fila_dinamica`, `encerrado`, `orfao` são **compartilhados** (obter-ou-criar pelo id): várias transições para a mesma fila apontam para o mesmo nó. Já `mensagem` é um nó por **ação**.

A seta guarda: `origem`, `destino`, `transicaoId`, `acaoId`, `backEdge` (falso por ora).

### 5.3 Texto de uma mensagem

- **Ação 1:** `message_text`. Se estiver vazio (só espaços) → sem texto. Se o texto (sem espaços à esquerda) começar com `{`, tentar ler como JSON de menu e usar `interactive.body.text` quando existir e não for vazio; senão, o próprio texto.
- **Ação 10:** `interactive.body.text` do JSON de `message_option_text`, se existir e não for vazio; senão sem texto.
- **Ação 11:** sem texto.
- Sem texto → rótulo `*Mensagem interativa*`.
- **Opções do menu (ação 10):** títulos dos botões (`action.buttons[].reply.title`) seguidos dos títulos das linhas (`action.sections[].rows[].title`), ignorando vazios. Aparecem dentro do cartão da mensagem.

### 5.4 Setas de retorno (back edges)

Servem para desenhar em vermelho tracejado as setas que **voltam** para um estado ancestral (ex.: "99 – voltar ao menu"). Algoritmo (DFS só sobre estados):

1. `proximosEstados(estado)`: partir do estado; usar uma **pilha** (LIFO, `pop`); para cada seta de saída do nó atual: se o destino é um **estado**, registrar o par `(destino, essa seta)`; senão, se o nó intermediário ainda não foi visitado nesta chamada, marcar visitado e empilhar. Devolver a lista de pares na ordem em que foram encontrados.
2. DFS com três cores (branco, cinza, preto). Para cada `(destino, seta)` de `proximosEstados`: se o destino está **cinza** (em andamento) → marcar `seta.backEdge = true`; se está **branco** → recorrer; preto → nada.
3. A ordem de partida dos estados é a ordenação: o estado `"0"` primeiro; depois os de dígitos puros em ordem numérica; depois os demais em ordem de texto. (Chave: `(n != "0", não é só dígitos, número ou texto)`.)

Só a **última seta** que chega ao estado (a que atravessa para o estado) é marcada, não o caminho inteiro.

---

## 6. Filtro "Modo Cliente" (passo 3)

Remove as setas de **transições** que são ruído para quem lê o fluxo. Uma transição é escondida se **qualquer** das condições abaixo for verdadeira:

1. Tem uma condição `error_count` cujo tipo **não** seja `8` nem `9` (as de "menor que"/"menor ou igual" são mantidas: marcam a saída normal).
2. Tem uma ação 8 (contador de erros).
3. Algum texto dela contém `#TESTE` ou `#OK#` (sem diferenciar maiúsculas): considera o `value` de cada condição e **todo valor de texto** de cada ação.

Depois: manter todos os **nós de estado** e só os outros nós que ainda tenham alguma seta visível (como origem ou destino). Nós sem seta somem.

---

## 7. Condições e calendários viram nós (passo 4)

### 7.1 O mapa de opções de um estado

Para cada estado, descobrir como traduzir o valor que o cliente digita (ex.: `suporte`, `1`) para o texto que ele **viu**:

1. Olhar as **setas que chegam** no estado (as transições que levam até ele). Para cada transição dessas, na ordem: procurar a **primeira ação 10 (menu)**; ler o JSON e montar um mapa `id → título` dos botões e das linhas de lista (só entram os pares com `id` e `title` preenchidos). O primeiro mapa **não vazio** vence (fonte "menu interativo").
2. Se nenhum menu servir: repetir com a **primeira ação 1 (texto)** de cada transição que chega: dividir o texto em linhas e casar cada linha com `^\*?(\d+)\*?\s*[-–—)\.]\s*(.+)$` (dígito, opcional asteriscos, um separador `-`, `–`, `—`, `)` ou `.`, e o texto). O mapa é `dígitos → texto`. O primeiro não vazio vence (fonte "texto"). (Aqui `\d` e `\s` valem para Unicode.)
3. Senão: mapa vazio (fonte "não resolvido").

### 7.2 Rótulo de uma condição de opção

Uma condição é "de opção" se: `variable = message`, tipo `1` (igual) ou `2` (contém), e `value` não vazio.

- `valores` = `value` dividido por `\n`, sem vazios. Sem valores → rótulo vazio, "não resolvido".
- Usar o **primeiro** valor. `rótulo = mapa[primeiro]` se existir e não for vazio (fonte do mapa); senão o próprio valor (não resolvido).
- `variações` = quantidade de valores − 1.
- **Texto de exibição:** `rótulo`, e se `variações > 0`: `rótulo (+N variação)` (N=1) ou `rótulo (+N variações)`.

Para uma transição com várias condições de opção, **vale a última**.

### 7.3 Inserir os nós intermediários

Para cada seta cujo **origem é um estado** (o "primeiro salto" da transição):

- Se a transição tem rótulo de opção **não vazio**: criar (ou reaproveitar) o nó `condicao:<ID da transição>` com o texto
  `Mensagem: <operador> "<texto de exibição>"`, onde `<operador>` é o rótulo do tipo da condição **em minúsculas** (dicionário: 1 "Igual a", 2 "Contém"), por exemplo `Mensagem: igual a "Suporte"`. Marcar como **não resolvido** se a fonte for "não resolvido".
- Senão, se a transição tem uma condição `calendario` ou `calendario_falso` (a **primeira** encontrada; `CONDITION_TYPE` é o ID do calendário): criar o nó `calendario:<ID da transição>` com `<Dentro do horário|Fora do horário> (calendário <id>)`, sempre **não resolvido** (até receber o nome, seção 9).
- Se criou um intermediário, **substituir** a seta `A → B` por duas: `A → intermediário` (com `acaoId` vazio) e `intermediário → B` (com o `acaoId` original). As duas herdam `transicaoId` e `backEdge` da original.
- Setas sem intermediário seguem iguais.

A condição de opção tem **prioridade** sobre o calendário.

### 7.4 Dados de cada nó e das setas

Cada nó leva `{tipo, rotulo, referencia}` e, conforme o tipo: `estado` → `aguardaResposta` (verdadeiro se **alguma** transição do estado tem condição com `variable = message`; calculado sobre o bot **completo**, antes de o Modo Cliente esconder transições); `mensagem` → `mensagem` (= rótulo) e `opcoesMenu`; `condicao` → `naoResolvida`; `calendario` → `naoResolvida`, `variavelCalendario`; `fila_dinamica` → `valoresObservados` (valores vistos nas ações 13; não aparecem na imagem). A posição inicial é `(0,0)` (o layout define depois).

Cada seta tem id `e:<transicaoId>:<acaoId>:<origem>-<destino>` e dados `{isBackEdge, transicaoId, acaoId, estadoOrigemId}`, onde `estadoOrigemId` é o **estado a que a transição pertence** (a origem da primeira seta da transição que sai de um estado, calculada **antes** de inserir os intermediários).

**Ordem:** `nodes` e `edges` mantêm a ordem de criação descrita acima. **A ordem faz parte do contrato**, porque o layout depende dela.

---

## 8. O que o cartão mostra (texto de cada nó)

Cada cartão tem: **linha de cabeçalho** (ícone + "kicker" em maiúsculas), um **título** opcional, o **corpo** e, nos menus, uma **caixa de opções**. Quatro papéis visuais (ver seção 10).

| Tipo | Kicker | Título | Corpo | Opções |
|---|---|---|---|---|
| `estado` (aguarda mensagem) | `AGUARDANDO` | o `ALIAS` | "Aguarda mensagem do cliente" | — |
| `estado` (demais) | `ESTADO` | — | o `ALIAS` | — |
| `mensagem` | `MENU` se há opções, senão `MENSAGEM` | — | texto da mensagem, truncado (abaixo) | títulos do menu, uma por linha com marcador `›` |
| `condicao` | `CONDIÇÃO`, ou `CONDIÇÃO · NÃO RESOLVIDA` | — | o rótulo | — |
| `calendario` | `CALENDÁRIO`, ou `CALENDÁRIO · NÃO RESOLVIDO` | — | o rótulo | — |
| `fila` | `FILA` | — | rótulo sem asteriscos | — |
| `bot_externo` | `BOT EXTERNO` | — | rótulo sem asteriscos | — |
| `fila_dinamica` | `FILA DINÂMICA` | — | rótulo sem asteriscos | — |
| `encerrado` | `ENCERRADO` | — | rótulo sem asteriscos | — |
| `orfao` | `ÓRFÃO · ERRO` | — | rótulo sem asteriscos | — |

- **Sem asteriscos:** se o rótulo é `*texto*` (começa e termina com `*`), mostrar só `texto`.
- **Truncar a mensagem a 200 caracteres:** remover espaços das pontas; se couber, mostrar inteira; senão, olhar os primeiros 200 caracteres, achar os finais de frase (`.`, `!` ou `?` seguidos de espaço ou fim); se o último está **depois de 40%** do limite, cortar nele; senão cortar nos 200 e tirar espaços do fim; acrescentar `…`.
- O texto da mensagem preserva as quebras de linha; **quebra por palavra** quando passa da largura.
- A mensagem `*Mensagem interativa*` (ação 11, ou menu sem corpo) aparece **com os asteriscos** (mantido por paridade com o desktop).

---

## 9. Nomes reais do ambiente (passo 5)

Entrada: os cadastros que o coletor da página já entrega (contrato, seção 6): filas, bots e calendários. Montar três dicionários `{id → texto}`:

| Dicionário | Chave | Texto |
|---|---|---|
| filas | ID da fila (o **nome** da fila) | o nome que o coletor já entrega no formato `[NOME] DESCRIÇÃO` |
| bots | ID do bot | `[<ID>] <nome sem o prefixo "[Bot] ">` |
| calendários | ID do calendário | o nome |

IDs e nomes passam por `trim`; itens sem ID, com ID `None` ou sem nome são ignorados. Depois, para cada nó:

- `bot_externo` com nome → rótulo `*Transfere para o bot <texto>*`.
- `fila` com nome → rótulo `*Transfere para a fila <texto>*`.
- `calendario` com nome → rótulo `<Dentro do horário|Fora do horário> — <nome>` e **não resolvido = falso** (some o aviso do cartão).
- Referência sem correspondência no ambiente: **fica como está** (número / "calendário não resolvido").
- Comparação sempre por texto, sem espaços nas pontas, dos dois lados.
- **Ambiente ausente:** gerar sem nomes e avisar no toast final.

Não resolvem: fila dinâmica (`{$variável}`, só existe em execução) e o nó `encerrado` (é um só, compartilhado).

> Esses nomes entram como **dado real do nó**, e não como "renomeação manual" do usuário. O desenho remove os asteriscos normalmente. (O app desktop tem um caminho de renomeação manual que mostra os asteriscos crus: é um defeito dele que a extensão deliberadamente **não** herda.)

---

## 10. Aparência (cores, formas e setas)

### 10.1 Cartões

Cartão arredondado (8 px), borda de 1 px, sombra leve, texto claro. Fonte **Inter** (embutida no pacote).

| Tipo | Papel | Forma | Fundo | Borda | Cor do kicker/ícone | Extras |
|---|---|---|---|---|---|---|
| `estado` | percurso | retângulo | `#3f424d` | `#595d6c` | `#cfd3e5` | — |
| `mensagem` | percurso | retângulo | `#2b2741` | `#423a6a` | `#d2cefd` | — |
| `condicao` | escolha | pílula | `#2b2741` | `#968ae0` | `#d2cefd` | ícone de condição |
| `calendario` | escolha | pílula | `#2b2741` | `#5d5294` | `#d2cefd` | ícone de calendário |
| `fila` | fim de fluxo | retângulo com barra | `oklch(20% 0.025 165)` | `oklch(50% 0.07 165)` | `oklch(78% 0.09 165)` | faixa sólida de 3 px embaixo `oklch(68% 0.11 165)` |
| `bot_externo` | fim de fluxo | retângulo com barra | (igual à fila) | (igual) | (igual) | faixa (igual) |
| `fila_dinamica` | fim de fluxo | retângulo com barra | (igual à fila) | (igual) | (igual) | faixa (igual) |
| `encerrado` | fim de fluxo | retângulo com barra | `#292b31` | `#595d6c` | `#b2b6ca` | faixa `oklch(55% 0.02 165)` |
| `orfao` | defeito | retângulo | `oklch(26% 0.05 25)` | `oklch(64% 0.19 25)` | `oklch(72% 0.17 25)` | borda **tracejada** |

- **Pílula** (condição e calendário): cantos totalmente arredondados, ícone e kicker centralizados e empilhados, corpo centralizado, menos espaço vertical.
- **Não resolvido** (condição ou calendário sem nome/tradução): o kicker troca para a cor de "não resolvido" e ganha o sufixo (seção 8).
- Texto do corpo e título `#f5f5f5`; opções em caixa levemente clareada, com marcador `›` na cor `#d2cefd`.

### 10.2 Setas

- Traço de **1,6 px**; seta fechada de 16 × 16 na ponta.
- **Cor pela transição de origem:** cada **estado** que tem pelo menos uma seta "normal" (não de retorno) recebe uma cor da paleta de 12 tons `oklch(70% 0.13 H)` com `H` = 55, 80, 105, 125, 200, 220, 240, 260, 280, 300, 320, 340. Os estados são ordenados (dígitos puros em ordem numérica antes dos demais, que vão em ordem de texto) e recebem as cores **por índice, voltando ao início** depois de 12. Todas as setas da transição (inclusive as que saem de mensagens e condições) usam a cor do **estado onde a transição está**. Estados cujas únicas saídas são de retorno **não consomem cor**.
- **Seta de retorno:** vermelha `oklch(64% 0.19 25)` e **tracejada** (`6 4`), com ponta da mesma cor.
- Cor padrão (sem estado conhecido): `#75798c`.
- **Forma:** curva suave de Bézier entre os conectores (saída à direita do nó de origem, entrada à esquerda do destino). Quando o layout desviou a seta de nós intermediários (mais de 2 pontos), desenhar uma **curva suave passando por todos os pontos** do desvio, trocando os extremos pelos conectores reais.

---

## 11. Layout

Biblioteca **dagre**, direção da esquerda para a direita: `rankdir: LR`, `nodesep: 36`, `ranksep: 130`. Cada nó entra com a largura e a altura **medidas pelo conteúdo real**.

### 11.1 Medir um cartão (largura × altura)

Medir com `canvas.measureText`, nas mesmas fontes do CSS do cartão. Antes de qualquer medição, **carregar as fontes** (`document.fonts.load` para cada uma): só esperar `document.fonts.ready` não basta, porque ele resolve na hora se nenhum texto usou a fonte ainda, e os cartões seriam medidos com a fonte de reserva.

Fontes medidas: kicker `500 11px Inter` (com espaçamento de 0,08 em); título `600 14px`; corpo `400 13px` (pílula `400 12px`); opção `400 12.5px`.

| Constante | Valor |
|---|---|
| Largura mínima / máxima | 170 / 340 px (pílula: mínima 108) |
| Altura mínima | 52 px |
| Padding horizontal | 11 px (pílula 18) |
| Padding vertical | 16 px (retângulo com barra 19; pílula 18) |
| Espaço entre blocos | 6 px |
| Ícone | 15 px, espaço de 6 px do kicker (pílula: 3 px, empilhado) |
| Altura de linha | kicker 15, título 18, corpo 18 (pílula 17), opção 18 |
| Caixa de opções | padding 10 × 7, espaço 3 entre opções, recuo do marcador 14 |

**Largura** = maior conteúdo entre kicker (+ ícone se em linha), título, corpo (cada parágrafo medido em separado) e cada opção (+ recuo e padding), limitada entre mínima e máxima. **Altura** = soma dos blocos presentes (cada texto quebrado por palavra dentro da largura útil) + espaços + padding vertical, no mínimo 52.

> Se o CSS do cartão mudar (padding, gap, fonte), **estas constantes precisam mudar junto**; senão a caixa desalinha do conteúdo.

### 11.2 Posição

Posição do nó = centro calculado pelo dagre menos metade da largura e da altura. Gravar também `width`/`height` no nó (assim o desenho não depende de uma medição assíncrona).

---

## 12. Captura da imagem

Capturar só o conteúdo desenhado (a camada `.react-flow__viewport`), **sem** barra, minimapa ou controles.

| Parâmetro | Valor |
|---|---|
| Fundo | `#f4f5f7` |
| Margem | 6% (largura e altura da área = limites dos nós × 1,06) |
| Zoom/posição | `getViewportForBounds(limites, largura, altura, 0.05, 4, 0.06)` |
| Escala (PNG) | `pixelRatio = 2` |
| Escala (SVG) | `pixelRatio = 1` |

- **PNG:** via `toBlob` (evita converter para base64 num bot grande). Acima de **16.384 px** por dimensão a biblioteca reduz a escala sozinha; é o mesmo comportamento do desktop e é aceito. Se o resultado vier vazio: erro "Fluxograma grande demais para PNG. Tente gerar em SVG".
- **SVG:** via `toSvg`, convertido em `Blob` `image/svg+xml`. **Limitação conhecida:** o SVG embute HTML num `foreignObject`; abre bem em navegadores, mas pode abrir em branco ou quebrado em Word, PowerPoint, Illustrator e Inkscape. Por isso o PNG é o padrão.
- **Condição de "pronto" antes de capturar:** layout calculado; React Flow com os nós inicializados; o número de setas desenhadas (`.react-flow__edge`) igual ao total; dois `requestAnimationFrame`. **Tempo máximo de 30 s**, com o erro "O fluxograma não terminou de desenhar a tempo (N de M setas)."
- Diagrama sem nós: erro "Diagrama vazio."

---

## 13. Como roda dentro da extensão

### 13.1 Onde o desenho é feito

Num **iframe oculto** que carrega uma página da própria extensão (`vendor/fluxograma/index.html`), por três motivos: isolar o React e o CSS do React Flow do editor e da página da Orpen (que redefine a fonte base); permitir que a fonte Inter carregue e seja embutida na imagem; e reaproveitar o código de desenho do desktop quase sem alteração.

- O iframe é criado **uma vez** (no primeiro clique), anexado ao `document.body` (fora do overlay, para sobreviver ao fechamento do modal) com o estilo: `position:fixed; left:0; top:0; width:1280px; height:800px; border:0; opacity:0; pointer-events:none; z-index:0`. **Precisa ficar dentro da área visível**: fora da tela o Chrome congela o iframe e o desenho nunca termina.
- O código que gera o fluxograma só é carregado **no primeiro clique** (importação dinâmica); quem nunca usa não paga nada.

### 13.2 Protocolo extensão ↔ iframe

1. **Conexão:** no `load` do iframe, a extensão cria um `MessageChannel` e envia `{tipo:'conectar', nonce}` para a janela do iframe, **transferindo a porta**. O `nonce` é gerado com `crypto.getRandomValues` (não `randomUUID`, que só existe em `https`) e vai também no hash da URL do iframe (`#n=<nonce>`); o iframe só aceita a porta se o nonce bater e a mensagem vier da janela-mãe. Tempo máximo de conexão: 15 s. Depois disso, **tudo trafega pela porta privada** (scripts da página da Orpen não leem o arquivo gerado).
2. **Pedido (ext → iframe):** `{tipo:'gerar', id, bot, formato:'png'|'svg', ambiente}`; `ambiente` é `{queues, bots, calendars}` (cadastros crus) ou `null`. `id` cresce a cada pedido.
3. **Respostas (iframe → ext):**
   - `{tipo:'conectado'}`
   - `{tipo:'progresso', id, etapa:'grafo'|'layout'|'render'|'captura'}`
   - `{tipo:'pronto', id, formato, arquivo: ArrayBuffer (transferido), nos, arestas, semNomes}`
   - `{tipo:'erro', id, mensagem, detalhe?}` (`mensagem` em português, vai direto ao toast)
4. Tempo máximo de uma geração: **120 s** ("o fluxograma demorou demais para ser gerado.").
5. O iframe atende **um pedido por vez**: se chegar outro, responde "Já existe um fluxograma sendo gerado. Aguarde terminar."
6. **Download pela extensão:** `Blob` (`image/png` ou `image/svg+xml`) → URL temporária → `<a download>` → liberar a URL após 1 s.

### 13.3 Snapshot

Com o bot salvo, tirar uma **cópia profunda** (`structuredClone`) e gerar sobre ela. Edições posteriores não afetam a geração; o pipeline **nunca muta** o bot do editor.

### 13.4 Distribuição

O desenho (React + React Flow + dagre + html-to-image + Inter) é compilado para `vendor/fluxograma/` (`index.html` + `assets/*.js` externos, com `base: './'`) e **vai commitado**: quem instala a extensão não precisa de Node. **Não usar `vite-plugin-singlefile`**: a política de segurança de páginas de extensão (`script-src 'self'`) bloqueia scripts inline. Nenhuma dependência pode usar `eval` ou `new Function`. As versões do React Flow, dagre e html-to-image são **fixas** (iguais às do app desktop) para o resultado bater.

---

## 14. Fidelidade e manutenção

- O pipeline (passos 1 a 5) e a camada de desenho (passos 6 a 8) são **portados** do app Fluxo BOT (commit `7c9c976`). A camada de desenho (`src/render/`) é **cópia fiel** (byte a byte, protegida por teste).
- **Teste de paridade (golden):** o pipeline original gera, para cada bot de exemplo, o grafo esperado; o port precisa produzir **exatamente o mesmo**, incluindo a **ordem** de nós e setas. Existe também uma comparação **visual pixel a pixel** contra o desktop (PNG e SVG).
- Se o Fluxo BOT mudar: re-portar o que mudou, regenerar os goldens, rodar os testes e reconstruir `vendor/fluxograma/`, atualizando o commit de referência em `fluxograma/ORIGEM.md`.
- **Armadilhas Python × JavaScript** que mudam o resultado sem dar erro (cada uma tem teste): (1) a ordem de inserção de um `dict` Python é preservada, mas um objeto JS com chave numérica **reordena** — usar sempre `Map` para coleções indexadas por ID ou número de estado; (2) a DFS usa pilha LIFO, não substituir por BFS nem recursão "equivalente"; (3) o comparador de estados reproduz a tupla `(n != "0", não é só dígito, número|texto)`; (4) `int()` do Python aceita espaços e zeros à esquerda; (5) `html.unescape` do Python decodifica todas as entidades HTML5; (6) `str.splitlines()` quebra em mais separadores que `split("\n")`; (7) `strip()` do Python tem um conjunto de espaços diferente do `trim()` do JS; (8) `\d`/`\s` do Python são Unicode, os do JS não; (9) a "veracidade" de `""`, `[]` e `None` é falsa em Python; (10) `setdefault`: o primeiro valor vence.

---

## 15. Exemplo completo (para validar o entendimento)

Bot com dois estados:

- Estado `0` "HOME", transição `10` (sem condições), ações (por ID): `30` Mensagem "Olá!" · `31` Menu (corpo "Escolha", botões `suporte`→"Suporte" e `financeiro`→"Financeiro") · `32` Troca Estado `1`.
- Estado `1` "MENU", transição `11` com condição `message` Igual a `suporte`, ações: `33` Mensagem "Certo" · `34` Transf. Fila `SUPORTE`.
- Estado `1`, transição `12` com condição `message` Igual a `financeiro`, ação `35` Transf. Fila `FINANCEIRO`.

**Nós (ordem):** `0`, `1`, `mensagem:30`, `mensagem:31`, `mensagem:33`, `fila:SUPORTE`, `fila:FINANCEIRO`, `condicao:11`, `condicao:12`.

**Setas (ordem):**

| Id | Origem → Destino | Estado de origem | Retorno? |
|---|---|---|---|
| `e:10:30:0-mensagem:30` | `0` → `mensagem:30` | 0 | não |
| `e:10:31:mensagem:30-mensagem:31` | `mensagem:30` → `mensagem:31` | 0 | não |
| `e:10:32:mensagem:31-1` | `mensagem:31` → `1` | 0 | não |
| `e:11::1-condicao:11` | `1` → `condicao:11` | 1 | não |
| `e:11:33:condicao:11-mensagem:33` | `condicao:11` → `mensagem:33` | 1 | não |
| `e:11:34:mensagem:33-fila:SUPORTE` | `mensagem:33` → `fila:SUPORTE` | 1 | não |
| `e:12::1-condicao:12` | `1` → `condicao:12` | 1 | não |
| `e:12:35:condicao:12-fila:FINANCEIRO` | `condicao:12` → `fila:FINANCEIRO` | 1 | não |

**Textos:**
- `0` → kicker `ESTADO`, corpo `HOME` (não aguarda mensagem).
- `1` → kicker `AGUARDANDO`, título `MENU`, corpo "Aguarda mensagem do cliente" (tem condição de mensagem).
- `mensagem:30` → `MENSAGEM` / "Olá!". `mensagem:31` → `MENU` / "Escolha", opções `Suporte`, `Financeiro`.
- `condicao:11` → `CONDIÇÃO` / `Mensagem: igual a "Suporte"`. `condicao:12` → `Mensagem: igual a "Financeiro"` (os valores `suporte` e `financeiro` foram traduzidos pelo menu que chega no estado 1).
- `fila:SUPORTE` → `FILA` / "Transfere para a fila SUPORTE" (com o nome real, se o ambiente tiver: "…fila [SUPORTE] Atendimento").

**Cores das setas:** estados `0` e `1` têm setas normais, então recebem as duas primeiras cores da paleta: as três setas da transição `10` usam `oklch(70% 0.13 55)`; as cinco da `11` e da `12` usam `oklch(70% 0.13 80)`. Não há setas de retorno.

---

## 16. Critérios de aceitação

Testáveis em Node (passos 1 a 5) salvo os **[UI]**.

**Estrutura e grafo**
1. O exemplo da seção 15 produz exatamente os nós e as setas listados, **na mesma ordem**.
2. Bot sem `BOT_STATES`, estado duplicado, transição para estado inexistente, condição/ação para transição inexistente, `PRIORITY` não inteira, ID de ação não numérico: cada caso devolve **o erro de estrutura com a mensagem esperada** e **nunca** um grafo parcial.
3. `CONDITION_DATA` como texto JSON (inclusive via chave `"3"` com entidades HTML) é lido igual ao objeto.
4. Troca de estado para `{$var}` cria `fila_dinamica`; para um estado inexistente cria `orfao`; a mesma fila usada por duas transições gera **um** nó.
5. Duas transições que encerram (ação 6, sem transferência) apontam para o **mesmo** nó `encerrado`; uma transição com transferência **e** ação 6 não cria `encerrado`.
6. Ações do mesmo tipo fora de ordem de `ID` são percorridas em ordem numérica.
7. Back edges: um ciclo `0 → 1 → 2 → 1` marca a seta que volta para o `1`; o estado `"10"` vem depois do `"9"` na ordem de partida e `"A1"` depois dos numéricos (um objeto JS comum reordenaria; usar `Map`).

**Filtro**
8. Transição com `error_count` tipo `1` some; com tipo `8` ou `9` fica; com ação 8 some; com `#teste` ou `#ok#` (qualquer caixa) em condição ou ação some.
9. Nó sem nenhuma seta visível some, **exceto estados**.

**Condições**
10. Menu interativo no estado anterior traduz `id → título`; sem menu, a lista numerada `1 - Financeiro` traduz `1 → Financeiro`; sem nenhum dos dois, mostra o valor cru e "não resolvido".
11. Condição com valor de várias linhas mostra o primeiro e `(+N variação/variações)`.
12. Transição com condição de opção **e** de calendário usa a de opção.
13. A seta que atravessa o intermediário mantém `transicaoId` e `backEdge` nas duas metades.

**Nomes**
14. Fila, bot (sem o prefixo `[Bot] `) e calendário com nome mostram o nome; sem correspondência, o número; IDs com espaços nas pontas casam; ambiente ausente gera sem nomes e o toast avisa.

**Aparência e imagem**
15. **[UI]** Cada tipo de nó tem as cores, a forma e o kicker da seção 10 e 8; "aguarda mensagem" mostra título e corpo corretos.
16. **[UI]** Mensagem de 250 caracteres com frase terminando depois de 40% é cortada no fim da frase com `…`; sem fim de frase útil, corta nos 200.
17. **[UI]** Setas: cor por estado de origem na ordem da paleta; retorno vermelho tracejado; estado só com retorno não consome cor.
18. **[UI]** Bot grande (centenas de nós) gera PNG e SVG não vazios (PNG com a escala reduzida acima de 16.384 px) e sem travar o editor.
19. **[UI]** O SVG abre no Chrome e no Edge, com o texto na fonte Inter.
20. **[UI]** Paridade visual: para os bots de exemplo, o PNG e o SVG gerados batem **pixel a pixel** com o export do desktop para o mesmo JSON (aceitando só diferença de suavização).

**Integração**
21. **[UI]** Sem alterações não salvas: gera direto, sem diálogo.
22. **[UI]** Com alterações: o diálogo aparece; Cancelar e Esc não salvam nem geram; "Salvar e gerar" salva e depois gera; salvamento com erro mostra o erro e **não** gera.
23. **[UI]** Desfazer manualmente uma alteração não abre o diálogo.
24. **[UI]** Bot sem estados mostra a mensagem própria **antes** de qualquer pedido de salvar.
25. **[UI]** Dá para editar o bot enquanto gera; fechar o modal ou abrir outro bot não cancela nem altera o resultado.
26. **[UI]** Segundo clique durante a geração é ignorado; o botão volta ao normal ao fim, com sucesso ou erro.
27. **[UI]** Arquivo baixado com o nome certo; toast "Fluxograma pronto: …" (com o aviso se faltarem os nomes).
28. **[UI]** Com o fluxograma nunca acionado, nada de `vendor/fluxograma/` é carregado (conferir na aba Rede).
29. **[UI]** Nenhum texto do bot entra em HTML do editor sem escape (o desenho é feito no iframe isolado; os toasts e o nome do arquivo passam por sanitização).

---

## 17. Riscos e pontos em aberto

| Item | Situação |
|---|---|
| **Bot novo ainda não salvo** | A spec histórica previa **desabilitar** o botão (salvar um bot novo recarrega a página e mataria a geração). **O código atual não faz isso**: o botão só é desligado durante a geração. Decidir: implementar o bloqueio com a dica "Salve o bot pela primeira vez para gerar o fluxograma", ou aceitar o comportamento atual. |
| Chrome congelar o iframe fora da tela | Mitigado mantendo o iframe visível e transparente. Se o Chrome mudar o comportamento, repetir o teste de "fps" do iframe. |
| Defasagem em relação ao Fluxo BOT | Controlada pelo commit em `ORIGEM.md` e pelo teste de paridade, que falha se divergirem. |
| SVG em Word/PowerPoint | Limitação conhecida (`foreignObject`). PNG é o padrão. |
| Medição de texto diferente entre navegadores | A fonte é embutida; qualquer deslocamento de layout deve ser investigado antes de publicar. |
| Bots muito grandes | Tempo e memória; a geração é assíncrona e não bloqueia o editor; o SVG não tem o limite de canvas. |
| Ordem de entrada | O `getBot` entrega estados, transições e itens ordenados; o export nativo da Orpen **não** garante ordem. O mesmo bot pode ter layout um pouco diferente se o desktop abrir o export nativo. |
