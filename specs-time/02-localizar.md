# 02 · Localizar

Status: implementada (referência: `js/busca.js`, estilos `.bs-*` em `css/styles.css`, testes em `tests/editor/busca-calendario.test.mjs`). A fase 2 (substituir) **não** está implementada.

Pré-requisito: `00-contrato-de-entrada.md`.

---

## 1. Objetivo

Em bots grandes (há um com 72 estados e 249 transições) achar onde um texto aparece exige abrir estado por estado. O Localizar encontra o termo **em todo o bot de uma vez**, mostra onde está (estado, transição, campo) e **leva até o campo**, pronto para editar.

Serve, por exemplo, para trocar um horário, um telefone ou o nome da empresa; revisar uma mensagem; achar a condição que trata uma palavra; achar onde um calendário é usado.

### Dentro do escopo

- Painel de busca encaixado ao lado do editor.
- Busca em cinco tipos de conteúdo, em blocos separados.
- Navegação entre resultados, com destaque e foco no campo.
- Atualização ao vivo enquanto se edita.

### Fora do escopo (fase 1)

- Substituir e Substituir tudo (fase 2, seção 12).
- Buscar em destinos de transferência, URLs, payloads, JSON de formulário ou nomes de variáveis.
- Buscar valores de condição que não sejam texto (listas de labels, por exemplo).

### Princípios

1. **Nunca mistura o que o bot envia com o que o cliente digita:** a lista é dividida em blocos por tipo, cada um com cor e ícone.
2. **A busca lê o bot em memória, mas o que está na tela vale mais:** o editor só grava um campo no bot quando a pessoa sai dele; a busca precisa acompanhar a digitação.
3. **Não altera nada.** Só lê, destaca e foca.
4. **Ignora acentos e maiúsculas por padrão** ("horario" acha "Horário").

---

## 2. Os cinco tipos de resultado

Ordem fixa dos blocos e dos filtros: **Textos enviados, Condições, Calendários, Scripts, Estados**.

| Id | Rótulo | Ícone (Lucide) | Cor | Onde busca |
|---|---|---|---|---|
| `textos` | Textos enviados | `message-square` | primária (roxo) | `message_text` da ação 1 (rótulo "Mensagem"); `message_content` da ação 20 ("Mensagem de áudio"); `message_text` da ação 21 ("Forma de contato"); e os textos do menu da ação 10 (seção 3) |
| `condicoes` | Condições | `split` | `#0E9384` (verde-azulado) | `CONDITION_DATA.value` quando for **texto** (string) |
| `calendarios` | Calendários | `calendar-clock` | `#2563EB` (azul) | condições das variáveis `calendario` e `calendario_falso` |
| `scripts` | Scripts | `plug-zap` | `#DB2777` (rosa) | ação 7 "Executar Script" (`ACTION_DATA.script_name`); ver abaixo |
| `estados` | Estados | `circle-dot` | `#D97706` (laranja) | `ALIAS` (nome) de cada estado |

**Scripts:** o texto pesquisado é `"<nome> (ID <id>)"` (nome vindo de `opcoesScripts()`) ou `"ID <id>"` sem cadastro; `script_name` vazio não entra; o rótulo do resultado é "Executar Script"; alvo `{ tipo: 'script', id: <ID da ação> }`, elemento `[data-action-id=<ID>][data-campo="script_name"]`, chave `s:<ID da ação>:<n>`. Como o calendário, só leva e pisca: nunca é focado. Consequência: digitar "id" casa com todos os scripts. Teste: `tests/editor/busca-script.test.mjs`.

Os `<campo>` possíveis em `a:<ID da ação>:<campo>` são só as chaves de `ACTION_DATA` que guardam texto de ações comuns: `message_text` (ações 1 e 21) e `message_content` (ação 20); o mesmo `<campo>` é o valor do atributo `data-campo` do elemento na tela. **O menu (ação 10) é outro caso:** a chave é `m:<ID da ação>:<rótulo do campo>` (cabeçalho, corpo, rodapé, botão da lista, título ou descrição de cada item) e o elemento de destino é o resumo do menu (`.menu-resumo`), que **não** tem `data-campo`.

Dica (tooltip) de cada filtro: textos = "Mensagens e menus que o bot envia"; condições = "Valores que o cliente digita"; calendários = "Condições de calendário, pelo nome ou ID do calendário"; scripts = "Ação Executar Script, pelo nome ou ID do script de integração"; estados = "Nomes dos estados".

---

## 3. Fontes de texto (o que exatamente é lido)

### 3.1 Ações de texto

| `ACTION_TYPE` | Campo | Rótulo do resultado |
|---|---|---|
| 1 | `message_text` | Mensagem |
| 20 | `message_content` | Mensagem de áudio |
| 21 | `message_text` | Forma de contato |

### 3.2 Menu (ação 10)

Ler `message_option_text` com `parseMenuModel` (contrato, seção 5) e buscar nestes campos. O rótulo do resultado é `Menu › <rótulo do campo>`:

| Formato | Campos e rótulos |
|---|---|
| WhatsApp botões | cabeçalho (`cabeçalho`), corpo (`mensagem`), rodapé (`rodapé`), título de cada botão (`botão 1`, `botão 2`...) |
| WhatsApp lista | cabeçalho, corpo, rodapé, texto do botão da lista (`botão da lista`), e para cada linha, em ordem corrida **entre seções** (1, 2, 3...): título (`opção N`) e descrição (`opção N (descrição)`) |
| WebChat | texto de cada opção (`opção 1`, `opção 2`...) |
| Não reconhecido | o JSON cru inteiro (`JSON`), para nada ficar fora da busca |

**Nunca** buscar os `id` dos botões ou das linhas. Campos vazios são ignorados. Um menu **não** passa pelo campo de texto da ação (é tratado só pelo caminho do menu).

### 3.3 Condições

Só entram condições cujo `CONDITION_DATA.value` seja **string**. O rótulo é `<rótulo da variável> <operador>`, por exemplo "MENSAGEM Contém", usando os dicionários do contrato (`VARIABLE_LABELS` e `TEXT_OPERATORS`; se não houver rótulo, usa o nome da variável; se não houver operador, fica só a variável). Se a condição for de calendário, ela vai para o tipo **Calendários** e **não** é pesquisada como texto.

### 3.4 Calendários

Para uma condição com `variable` igual a `calendario` ou `calendario_falso`:

- Se `CONDITION_TYPE` for vazio ou `0`, **não entra**.
- O texto pesquisado é `"<nome> (ID <id>)"` quando o ambiente tem o calendário (nome vindo de `opcoesCalendarios()`), ou `"ID <id>"` caso contrário.
- O rótulo do resultado é o da variável ("CALENDARIO (Verdadeiro)" ou "CALENDARIO (Falso)").
- Consequência a conhecer: digitar "id" casa com **todas** as condições de calendário, e "id 1" casa com os IDs 1, 12, 13...

### 3.5 Estados

O `ALIAS` de cada estado. Rótulo: "Nome do estado".

---

## 4. Valor na tela x valor no bot

O editor só grava no bot quando o campo perde o foco. Para a busca acompanhar a digitação, **antes de buscar** ler o valor **atual dos campos na tela** e usá-lo no lugar do valor do bot, quando existir:

| Chave | Elemento lido |
|---|---|
| `a:<ID da ação>:<campo>` | `#bv-estados [data-action="mudar-campo-acao"][data-campo]` (usa `data-action-id` e `data-campo`) |
| `c:<ID da condição>` | `#bv-estados [data-action="mudar-condicao-valor"]` (usa `data-condition-id`) |
| `e:<número do estado>` | `#bv-estados .estado-alias[data-state]` |

Menus e calendários **não** têm valor "na tela": usam o do bot (menus só mudam pelo modal, que grava ao salvar).

---

## 5. Algoritmo de correspondência

Entrada: `texto` (do campo), `termo` (digitado, com `trim`), opções `diferenciarMaiusculas` e `palavraInteira` (ambas falsas por padrão).

### 5.1 Normalização com mapa de posições

Normalizar o texto **caractere por caractere**, guardando de onde veio cada caractere resultante (para devolver a posição no texto **original**, que é onde a seleção acontece):

1. Para cada caractere do original: decompor (NFD) e remover as marcas de acento (`U+0300–U+036F`).
2. Se `diferenciarMaiusculas` for falso, converter para minúsculas.
3. Acrescentar o resultado ao texto normalizado e registrar, para cada caractere acrescentado, o índice do caractere original. Registrar ao final o comprimento do original.

O `termo` passa pela mesma normalização (só o texto normalizado importa).

### 5.2 Procura

Procurar todas as ocorrências do termo normalizado no texto normalizado, **sem sobreposição** (a próxima busca começa depois do fim da anterior; avanço mínimo de 1). Para cada ocorrência `[i, fim)`:

- Se `palavraInteira`: aceitar só se o caractere antes de `i` e o depois de `fim` **não** forem letra, número ou `_` (classe `[\p{L}\p{N}_]`, Unicode). Início e fim do texto contam como limite.
- Devolver `{inicio: origem[i], fim: origem[fim-1] + 1}` (posições no texto original).

Termo vazio ou texto vazio → nenhuma ocorrência.

### 5.3 Um resultado por ocorrência

A mesma mensagem com o termo duas vezes gera **dois** resultados.

---

## 6. O resultado

```js
{
  modo,                // 'textos' | 'condicoes' | 'calendarios' | 'estados'
  estadoNumero, estadoAlias,
  transicaoId, prioridade,      // ausentes nos resultados de nome de estado
  alvo: { tipo, id, campo? },   // tipo: 'acao' | 'menu' | 'condicao' | 'calendario' | 'estado'
  rotulo,                       // texto do caminho (ex.: "Mensagem", "Menu › botão 2")
  texto,                        // o texto completo onde achou
  inicio, fim,                  // posição da ocorrência em `texto`
  chave                         // identidade estável (abaixo)
}
```

Chaves (usadas para manter a posição ao refazer a busca):
`e:<estado>:<n>` (estado), `c:<ID>:<n>` (condição), `k:<ID>:<n>` (calendário), `m:<ID da ação>:<rótulo do campo>:<n>` (menu), `a:<ID da ação>:<campo>:<n>` (texto de ação); `<n>` = ordem da ocorrência dentro do mesmo campo.

### Ordem

1. Blocos pela ordem fixa dos tipos.
2. Dentro do bloco: por **estado** (número crescente); dentro do estado, por transição (`PRIORITY`), e dentro dela por `ID` crescente.
3. Para o tipo Estados, o resultado do nome do estado vem antes dos demais itens do mesmo estado (nesse bloco só existem nomes).

---

## 7. O painel

### 7.1 Abrir e fechar

- **Abrir:** Ctrl+F (ou Cmd+F) **sem Alt**, quando o editor está visível, com `preventDefault` (para a busca do navegador não abrir); ou o botão de lupa no cabeçalho. Ao abrir: marcar o botão como pressionado, copiar o termo anterior para o campo, **refazer a busca**, focar e **selecionar** o texto do campo.
- **Fechar:** botão X do painel, **Esc** (pilha de Esc: só trata se o painel está aberto e o editor visível; senão devolve `false`) ou **fechar o editor** (o painel fecha junto, e não reabre sozinho no próximo bot).
- A lupa do cabeçalho alterna: fechado → abre; aberto → fecha.
- Com a **janela de Testar bot em tamanho normal aberta**, o Ctrl+F é ignorado (o painel ficaria por baixo do véu). Com o teste **minimizado**, funciona.

### 7.2 Layout

- Painel fixo à **direita** (16 px da borda), do topo (6 vh) até 3 vh do fim, 372 px de largura, canto arredondado, sombra, `z-index` baixo (2) para ficar sob os diálogos.
- Com o painel aberto, o editor ganha a classe `busca-aberta` e **encolhe para a esquerda** (largura `(96vw − 404px)` e margem direita de 404 px, ambas divididas pelo zoom do editor), em vez de ficar por baixo. Numa tela de 1366 px os dois cabem lado a lado.
- Tudo em **px** (o painel está fora do editor com zoom).

### 7.3 Conteúdo (de cima para baixo)

1. **Topo:** ícone de lupa, título "Localizar", botão X (dica "Fechar (Esc)").
2. **Campo de busca** (`type="search"`, sem corretor ortográfico, sem autopreenchimento) e dois botões de opção: **Aa** (diferenciar maiúsculas e minúsculas) e **palavra inteira** (ícone `whole-word`). Ambos alternam `aria-pressed` e refazem a busca.
3. **Filtros:** cinco botões (um por tipo) com o rótulo e a **quantidade** de resultados daquele tipo (vazia se não há termo). Clicar num filtro deixa só aquele tipo; clicar de novo volta a todos. O filtro marcado pinta o painel na cor do tipo. Quebra de linha permitida (os cinco podem ocupar duas linhas).
4. **Navegação:** contador à esquerda, setas ▲ ▼ à direita.
5. **Lista de resultados** (rolável).
6. **Rodapé:** "Clique num resultado para editar o texto direto no campo."

### 7.4 A lista

- **Sem termo:** com filtro, "<dica do tipo>. Digite para buscar."; sem filtro, "Digite para buscar em textos enviados, condições, calendários, scripts e nomes de estados."
- **Termo sem resultado:** se há filtro e os **outros** têm resultados: "Nenhum resultado em <tipo>. Os outros filtros têm resultados."; senão "Nenhum resultado."
- **Sem filtro (todos):** um **bloco por tipo** que tenha resultado: título com ícone, nome e quantidade, na cor do tipo.
- **Dentro do bloco:** um grupo por estado, com cabeçalho `<número> <nome do estado ou "Sem nome"> <quantidade no bloco>`.
- **Cada resultado:** linha com `T<prioridade> · <rótulo>` (resultados de nome de estado **não** têm o `T…`) e o **trecho**: até 34 caracteres antes e depois da ocorrência, espaços colapsados, reticências quando cortado, o termo dentro de `<mark>`. **Tudo escapado** (`escapeHtml`) antes de montar o HTML.
- **Menu:** além da linha clicável, um botão de **lápis** (dica "Abrir no editor de menu") que abre o modal do menu daquela ação (`abrirModalMenu(transicaoId, ação)`) depois de navegar até o resultado.
- O item **atual** fica realçado e é mantido visível dentro da lista.

---

## 8. Navegação

- **Contador:** "N de M" (ou "– de M" enquanto nenhum foi escolhido); "Nenhum resultado" se há termo e zero resultados; vazio sem termo. As setas ficam desligadas se M = 0.
- **Próximo/anterior** (circular): ▼/▲, **Enter** / **Shift+Enter** dentro do campo de busca, **F3** / **Shift+F3** em qualquer lugar (com o painel aberto). Essa navegação **não tira o foco do campo de busca** (um Enter dentro do campo de uma mensagem inseriria uma quebra de linha no texto do bot).
- **Primeiro "próximo" sem posição:** vai ao primeiro resultado; o "anterior" sem posição vai ao último.
- **Clicar num resultado:** navega e **põe o foco no campo**, **selecionando exatamente o termo** (posições da seção 5), pronto para editar.

### 8.1 Como "ir até" um resultado

1. Se o alvo não for um nome de estado, **abrir o estado** (se o corpo estiver fechado: remover `hidden` do `.estado-body`, `estado-expandido` no cartão, `rotate-180` no chevron). Nunca fechar nada.
2. Encontrar o elemento do alvo:

| `alvo.tipo` | Elemento |
|---|---|
| `acao` | `[data-action="mudar-campo-acao"][data-action-id=<ID>][data-campo=<campo>]` |
| `menu` | o `.menu-resumo` que contém `[data-action="editar-menu"][data-action-id=<ID>]` |
| `condicao` | `[data-action="mudar-condicao-valor"][data-condition-id=<ID>]` |
| `calendario` | `.condicao-operador[data-condition-id=<ID>]` (o campo que mostra o calendário) |
| `estado` | `.estado-alias[data-state=<número>]` |

3. Rolar até o elemento (centralizado, suave) e **piscar** (classe `bs-alvo` por 1,6 s, reiniciando a animação se já estiver ativa).
4. Só se for um clique ("selecionar") **e** o alvo não for `calendario` **e** o elemento aceitar seleção: focar sem rolar e selecionar `[inicio, fim)`. **Calendário nunca é focado** (focar abriria a lista de calendários).

Seletores com valores variáveis devem escapar aspas.

---

## 9. Ao vivo

A busca é **refeita** (atraso de 200 ms, só enquanto o painel está aberto **ou** há um termo) quando:
- qualquer campo do editor recebe digitação ou mudança (`input`/`change` em `#bv-estados`);
- `#bv-estados` é recriado (observar `childList` com subárvore): excluir, duplicar, mover, salvar um menu, gerar tratamento, reabrir o bot.

Ao refazer: **manter a posição** no mesmo resultado (mesma `chave`); se ele sumiu, ir para o índice anterior limitado ao novo total; se não havia posição, continuar sem posição.

**Contador na lupa:** o botão de lupa mostra, no canto, a quantidade de resultados do filtro atual **mesmo com o painel fechado**, se houver termo.

---

## 10. Integração com o editor

Dependências que **não podem mudar** sem aviso: os seletores da seção 8.1 e da seção 4; `#bv-estados`; `#bot-view-overlay` e a classe `hidden`; `.bv-header` e `#btn-fechar-bot-view`; a classe `bs-alvo`; `abrirModalMenu`. O painel é criado por JavaScript dentro de `#bot-view-overlay` (não é HTML estático) e **uma única vez**.

---

## 11. Critérios de aceitação

Itens de 1 a 14 são testáveis em Node, **mas hoje não há teste para eles**: no código, `normalizar`, `ocorrencias` e `coletar` (em `js/busca.js`) são funções internas, não exportadas, e `coletar` lê o DOM (`valoresNaTela`). Só `textoDeCalendario` é exportada e testada. A implementação nova deve **separar a coleta e a correspondência em funções puras exportadas** (a coleta recebendo o bot e um mapa de valores da tela) para esses itens virarem testes; os de tela são **[UI]**.

**Correspondência**
1. "horario" encontra "Horário de atendimento" e devolve posições do texto **original** (selecionando "Horário").
2. "Olá" encontra "OLÁ"; com **Aa** ligado, não encontra.
3. Palavra inteira: "oi" **não** encontra em "foi" nem "boi"; encontra em "oi, tudo bem" e em "diga oi.".
4. "aa" em "aaaa": 2 ocorrências (sem sobreposição).
5. A mensagem "ola ola" gera dois resultados com chaves `...:0` e `...:1`.
6. Texto com caracteres que se decompõem (acentos combinados) mantém a posição original correta.

**Fontes**
7. Mensagem (1), áudio (20) e forma de contato (21) entram em Textos enviados com os rótulos certos.
8. Menu de botões: encontra no corpo e no título do botão; **não** encontra no `id` do botão.
9. Menu de lista: linhas numeradas em sequência entre seções; descrição tem rótulo próprio.
10. Menu em formato não reconhecido: encontra no JSON cru.
11. Condição com `value` string entra em Condições com rótulo "MENSAGEM Contém"; com `value` em lista (labels) **não** entra.
12. Calendário com cadastro do ambiente: "comercial" encontra "Horário comercial (ID 227)"; "227" também; sem cadastro, só "ID 227". Calendário com tipo vazio ou 0: não entra. Condição de calendário **não** aparece em Condições.
13. Nome de estado entra em Estados com rótulo "Nome do estado" e sem `T…`.
14. **Valor na tela:** com o campo de uma mensagem editado na tela e ainda não gravado, a busca usa o texto novo.

**Ordem e navegação**
15. **[UI]** Os blocos aparecem na ordem Textos, Condições, Calendários, Estados; dentro deles, estados em ordem numérica e itens por transição e ID.
16. **[UI]** Enter e Shift+Enter navegam, F3 e Shift+F3 também; o foco **continua** no campo de busca.
17. **[UI]** Clicar num resultado abre o estado fechado, rola, pisca e **seleciona exatamente o termo** no campo.
18. **[UI]** Clicar num calendário rola e pisca, **sem** focar nem abrir a lista.
19. **[UI]** Clicar no lápis de um resultado de menu abre o modal do menu daquela ação.
20. **[UI]** O contador mostra "3 de 12"; o último "próximo" volta ao primeiro; "anterior" sem posição vai ao último.

**Ao vivo**
21. **[UI]** Digitar num campo do editor com o painel aberto atualiza os resultados em ~200 ms e mantém a posição.
22. **[UI]** Duplicar um estado (o editor recria a lista) atualiza os resultados.
23. **[UI]** A lupa mostra a quantidade com o painel fechado e há termo.

**Painel e atalhos**
24. **[UI]** Ctrl+F abre o painel (e **não** a busca do navegador); Esc fecha só o painel; fechar o editor fecha o painel e ele não reabre sozinho no próximo bot.
25. **[UI]** Com o painel aberto o editor encolhe para a esquerda sem ficar por baixo.
26. **[UI]** Com a janela de teste em tamanho normal, Ctrl+F não abre o painel; com o teste minimizado, abre.
27. **[UI]** Filtro: clicar mostra só o tipo e pinta o painel na cor do tipo; clicar de novo volta ao total; as quantidades por filtro estão certas.
28. **[UI]** Nenhum trecho, nome de estado ou rótulo entra em `innerHTML` sem `escapeHtml` (testar um estado chamado `<img src=x onerror=alert(1)>`).
29. **[UI]** Modo avulso (sem ambiente): a busca funciona e calendários aparecem como `ID n`.

---

## 12. Fase 2 (não implementada): Substituir

- **Substituir** (um resultado) e **Substituir tudo**, **só** no filtro Textos enviados.
- Em menus: trocar **somente textos**, nunca `id`, pelo caminho que preserva o JSON do menu (`atualizarMenuPreservando`).
- Tudo continua em memória até o Salvar.
- Em **condições**, trocar valores pode quebrar os IDs de menu usados em estados que dependem deles; por isso fica **fora** até haver decisão.
- Ao substituir, a busca deve manter a posição e refazer ao vivo.

## 13. Ideias futuras

- Buscas prontas: mensagens vazias, menus sem opção, links (`http`).
- "Onde uso `{$nome}`?": busca por variável.
- Incluir destinos, URLs, payloads e nomes de variáveis.
