# 00 · Contrato de entrada (o que toda feature recebe)

Este documento descreve **o que o time recebe pronto** e pode assumir. Nenhuma feature precisa saber como o bot é aberto, editado ou salvo na Orpen: isso é feito por uma camada que já existe (a "caixa-preta"). As specs das features só descrevem o que se faz **com** o bot que já está carregado.

> Convenção de leitura: tudo que está em `código` é nome real usado no projeto. Todos os valores de ID e número vêm como **string** ("3", não 3).
>
> **Código de referência:** os nomes de arquivo citados (`js/...`, `tests/editor/...`, `fluxograma/...`) existem na pasta `codigo-de-referencia/` deste pacote, com a mesma estrutura do repositório. O time pode ler, copiar ou reaproveitar. Quando uma spec diz "ver o código", é lá.

---

## 1. O bot carregado

É um objeto JavaScript com a forma abaixo. Em tempo de execução ele vive em `state.botCarregado` (módulo `state.js`) e representa o **rascunho em edição**: pode ter alterações ainda não salvas.

```jsonc
{
  "ID": "50514",                 // ID do bot (vazio em bot novo)
  "NAME": "BOT SUPORTE",         // máx. 50 caracteres
  "TIMEOUT_ACTION": "",          // "" | "bot" | "queue" | "close"
  "TIMEOUT_DESTINY": "",         // bot: nº do estado; queue: nome da fila; close: ID do status CRM
  "TIMEOUT_MESSAGE": "",         // texto enviado antes de encerrar (só em "close")
  "BOT_STATES":      [ { "ID": "1", "STATE_NUMBER": "0", "ALIAS": "HOME" } ],
  "BOT_TRANSITIONS": [ { "ID": "10", "STATE": "0", "PRIORITY": "0" } ],
  "BOT_CONDITIONS":  [ { "ID": "20", "TRANSITION_ID": "10", "CONDITION_TYPE": "1",
                         "CONDITION_DATA": { "variable": "message", "value": "oi" } } ],
  "BOT_ACTIONS":     [ { "ID": "30", "TRANSITION_ID": "10", "ACTION_TYPE": "1",
                         "ACTION_DATA": { "message_text": "Olá!" } } ]
}
```

Cada linha traz também chaves numéricas espelhadas (`"0"`, `"1"`...) com os mesmos valores das chaves nomeadas. **Ignore-as ao ler. Ao criar linhas novas, use a função pronta `withMirrors` (seção 4).** A posição de cada chave nomeada é fixa por tabela:

| Tabela | `"0"` | `"1"` | `"2"` | `"3"` | `"4"` | `"5"` | `"6"` |
|---|---|---|---|---|---|---|---|
| estado | `ID` | `STATE_NUMBER` | `ALIAS` | | | | |
| transição | `ID` | `STATE` | `CONDITION` | `MESSAGE` | `TARGET_TYPE` | `TARGET` | `PRIORITY` |
| condição | `ID` | `TRANSITION_ID` | `CONDITION_TYPE` | | | | |
| ação | `ID` | `TRANSITION_ID` | `ACTION_TYPE` | | | | |
| bot (raiz) | `ID` | `NAME` | `CONF_DELIVERY_TIME` | `CONF_DELIVERY_QUEUE` | `TIME_ANSWER` | `TIMEOUT_DELAY` | `TIMEOUT_ACTION` |

No bot (raiz) continuam `"7"` = `TIMEOUT_DESTINY` e `"8"` = `TIMEOUT_MESSAGE`. `CONDITION_DATA` e `ACTION_DATA` não têm espelho numérico próprio: ficam como objeto nas chaves nomeadas. Uma linha só é válida para o servidor se as chaves numéricas e as nomeadas **dizem o mesmo**.

### Regras do modelo (valem para qualquer feature)

| Regra | Detalhe |
|---|---|
| Estado de entrada | Toda conversa nova começa no estado de `STATE_NUMBER` `"0"`. |
| Número do estado | `STATE_NUMBER` é único no bot e é a **chave de ligação** (é o que `STATE` das transições e os destinos das ações guardam). Normalmente é contínuo (0, 1, 2...), mas existem bots com buracos e até com valores não numéricos (ex.: `"A1"`). |
| Ordem das transições | Dentro de um estado, valem de `PRIORITY` menor para maior. |
| Ordem de condições e ações | Dentro de uma transição, valem na ordem do `ID` crescente. Mover um item no editor **reatribui os IDs**; por isso o ID carrega a ordem. |
| Condição ou ação de tipo 0 | Não é gravada ao salvar. Uma transição sem nenhuma condição vale sempre. |
| IDs | Únicos por tabela. Para criar um novo: maior ID da tabela + 1 (`nextId`). O servidor refaz todos os IDs ao salvar. |
| Salvar | É total: o servidor apaga e regrava tudo. Não existe edição parcial. |

---

## 2. Condições

`CONDITION_DATA` = `{ variable, value, type?, assistant_id? }`. O significado de `CONDITION_TYPE` depende da `variable`.

**O campo `type` dentro de `CONDITION_DATA`:** o editor grava `type: '1'` ao criar condições de mensagem, e o gerador de tratamento do menu também o grava em `error_count`. **Quem decide a operação é o `CONDITION_TYPE` da condição** (tabela 2.2 e a coluna "`CONDITION_TYPE` significa" abaixo), não o `type`. A exceção é o assistente OpenAI (linha própria na tabela), em que o operador real fica em `type`. Regra prática: ao ler, não interprete `type` (exceto no assistente); ao criar uma condição, grave `type: '1'` como o editor faz.

### 2.1 Variáveis

| `variable` | Rótulo na tela | `CONDITION_TYPE` significa | `value` |
|---|---|---|---|
| `message` | MENSAGEM | operador de texto (tabela 2.2) | texto; várias linhas = alternativas |
| `contact` | CONTATO | operador de contato (tabela 2.2) | conforme operador (ex.: IDs de labels) |
| `error_count` | Contador de Erros | 1 igual, 6 maior, 7 maior-igual, 8 menor, 9 menor-igual | número |
| `calendario` / `calendario_falso` | CALENDARIO (Verdadeiro/Falso) | **ID do calendário** | — |
| `agent_on_queue` | AGENTES NA FILA | o **ID/nome da fila** (o ID da fila é o próprio nome, como em `opcoesFilas()`) | — |
| `agent_online` | AGENTE LOGADO | ID do agente (ou `{$variável}` em `value`) | — |
| `agent_available_on_chat` | DISPONÍVEL CHAT | ID do agente | — |
| `status_last_att` | Status Último Atendimento | ID do status CRM | — |
| `opt_in` / `uci` | CONTATO possui OptIn / UCI | 1 possui, 2 não possui | — |
| `old_attendance` | Teve atendimento em | 1 dias, 2 horas, 3 minutos, 4 segundos | número |
| `entrance_type` | Tipo de entrada | 1 WhatsApp, 2 E-mail, 3 Facebook, 6 Webchat, 7 Instagram, 8 Telegram | — |
| `entrance` | ENTRADA | ID da entrada | — |
| `sender` | REMETENTE | 1 igual a, 2 contém | texto; várias linhas = alternativas |
| `contact_number` | NÚMERO DO CONTATO | 1 começa com | prefixos, um por linha |
| `pref_agent`, `name_pref_agent`, `agent_last_att` | AG. PREFERIDO, NOME AG. PREFERIDO, Último agente que atendeu | — | — |
| `email_subject` | ASSUNTO DO EMAIL | operador de texto | texto |
| `automate_message` / `automate_status` / `automate_thread_id` | [Automação] ... | operador de texto | texto |
| `assistant_analysis_status` / `assistant_analysis_text` | Assistente OpenAI | (guarda `1` ou `2`; o operador real fica em `CONDITION_DATA.type`) | status `success`/`error`, ou texto |
| qualquer outro nome | variável guardada pelo próprio bot (ação 13) ou retorno de script (`<ID do script>_<campo>`) | operador de texto | texto |

### 2.2 Operadores

| Tipo | Operador | Tipo | Operador |
|---|---|---|---|
| 0 | Sempre verdadeiro | 13 | É CNPJ |
| 1 | Igual a | 14 | É CNPJ/CPF |
| 2 | Contém | 15 | É data |
| 3 | Diferente de | 16 | É menção de story |
| 4 | Não contém | 17 | É resposta de story |
| 5 | É CPF | 18 | (contato) Possui os labels |
| 6 | Maior que | 19 | (contato) Tem CPF |
| 7 | Maior igual que | 20 | (contato) Tem CNPJ |
| 8 | Menor que | 21 | (contato) Não é Vip |
| 9 | Menor igual que | 22 | É anexo/arquivo |
| 10 | (contato) É Vip | 23 | É áudio |
| 11 | É número | 24 | É forma de contato |
| 12 | É e-mail | | |

---

## 3. Ações

`ACTION_DATA` por `ACTION_TYPE`:

| Tipo | Nome | Campos de `ACTION_DATA` | Efeito |
|---|---|---|---|
| 1 | Mensagem | `message_text` | Envia texto ao cliente. |
| 2 | Troca Estado | `destiny` (nº do estado ou `{$variável}`) | Vai para o estado. |
| 4 | Transf. Agente | `destiny` (ID do agente, ID de **bot** ou `{$variável}`; o select do editor tem os dois grupos, "Agentes" e "Bots") | Transfere e sai do bot. |
| 5 | Transf. Fila | `destiny` (nome da fila; o select do editor aceita também bots e agentes, e a tela de pendências chama o campo "Número da fila / bot / agente") | Transfere e sai do bot. |
| 6 | Finalizar | `crm_status` | Encerra o atendimento. |
| 7 | Executar Script | `script_name` (ID do script) | Roda um script do cliente; o retorno vira variáveis `<ID>_<campo>`. |
| 8 | Contador de Erros | `error_count`: `"add"` ou `"reset"` | Soma 1 ou zera o contador do atendimento. |
| 9 | CheckPoint | `check_point` | Registra um marco. |
| 10 | Mensagem Options | `message_option_text` (JSON do menu, seção 5) | Envia menu de botões, lista ou WebChat. |
| 11 | Mensagem Form | `message_option_form` (JSON) | Envia formulário. |
| 12 | Enviar msg. à Entrance | `entrances` | Reencaminha para outra entrada. |
| 13 | Armazenar variável | `bot_variables_text` (JSON; aceita `{$x}`) | Grava chaves/valores nas variáveis do atendimento. |
| 14 | Substatus | `substatus` | Vincula substatus. |
| 15 | Tags | `message_text` (nome da tag) | Cria e vincula a tag. |
| 16 | Atualizar contato | `update_contact_value` + `message_text` / `labels` / `contact_item_type` | Altera dados do contato. |
| 17 | Enviar anexo | `send_file` | Envia arquivo cadastrado. |
| 18 | OpenAI | `openai`, `openai_account`, `assistant_id`, `assistant_content`, `callback_state` | Chama assistente; **pausa** o bot até o retorno. |
| 19 | Nota ao atendimento | `protocol_note` | Registra nota. |
| 20 | Mensagem de áudio | `message_content`, `callback_state`, `fallback_state`, `model_audio`, `model_openai`, `speed` | Gera áudio; **pausa** até o retorno. |
| 21 | Forma de contato | `contact_item_type` (`EMAIL`/`PHONE`), `message_text` | Adiciona forma de contato. |
| 22 | Executar Automação | `url`, `payload`, `callback_state`, `fallback_state`, `timeout` | Chama webhook; **pausa** até o retorno. |

**Campos que guardam número de estado** (qualquer feature que renumere, copie ou valide estados precisa tratar exatamente estes): ação 2 → `destiny`; ações 18, 20 e 22 → `callback_state` e `fallback_state`; e, no nível do bot, `TIMEOUT_DESTINY` quando `TIMEOUT_ACTION` é `"bot"`. Em `STATE` das transições também.

**Campos que guardam cadastro do ambiente** (valem só dentro da instalação de origem): ação 4 `destiny`; 5 `destiny`; 6 `crm_status`; 7 `script_name`; 9 `check_point`; 12 `entrances`; 14 `substatus`; 15 `message_text`; 17 `send_file`; 18 `openai_account` e `assistant_id`; 22 `url`; 16 com `labels`; e em condições, as variáveis da tabela 2.1 cujo `CONDITION_TYPE` é um ID de cadastro, o valor de labels (tipo 18) e `assistant_id`.

---

## 4. Funções prontas que as features podem chamar

Não reimplemente: estão em `js/`, têm testes e são o que mantém o formato igual ao da Orpen. Abaixo, assinatura, retorno e se **mutam** o argumento. (O código completo está em `codigo-de-referencia/js/`.)

### Dados do bot

| Função (arquivo) | Entrada → saída | Detalhe |
|---|---|---|
| `nextId(lista)` (`bot-view-interactions.js`) | lista de linhas (ex.: `bot.BOT_ACTIONS`) → string | `String(maior ID inteiro da lista + 1)`; lista vazia ou ausente → `"1"`. Não muta. |
| `withMirrors(tipo, linha)` (idem) | `'state'`\|`'transition'`\|`'condition'`\|`'action'`, objeto → o **mesmo** objeto | **Muta** `linha`: para cada chave nomeada da tabela da seção 1, copia o valor para a chave numérica correspondente. |
| `remapStateNumbers(bot, mapa)` (idem) | bot, `Map<antigo, novo>` (strings) → nada | **Muta** `bot`. Reescreve `STATE_NUMBER` dos estados, `STATE` das transições, os campos de estado das ações (seção 3), e `TIMEOUT_DESTINY` **somente quando** `TIMEOUT_ACTION === 'bot'`. Mapa vazio = não faz nada. Atualiza também os espelhos dessas chaves. |
| `tipoDaCondicao(condicao)` (`orpen-adapter.js`) | condição → número | Tipo que será gravado: `1` para `assistant_analysis_status`, `2` para `assistant_analysis_text`; senão `Number(CONDITION_TYPE)` (se não for numérico devolve o valor cru, ou `0` se vazio). Tipo `0` = a condição **não é gravada** pelo servidor. |
| `parseMenuModel(textoJson)` (`menu-builder.js`) | string → modelo | `{kind:'whatsapp_button', header, body, footer, buttons:[{id,title}]}`, ou `{kind:'whatsapp_list', header, body, footer, button, sections:[{title, rows:[{id,title,description}]}]}`, ou `{kind:'webchat', options:[{text,value}]}`, ou `{kind:'unknown', raw}`. Textos ausentes viram `''`. `interactive.type` diferente de `button` é lista. Não muta. |
| `extrairItensMenu(modelo)` (idem) | modelo → `[{title, id, description}]` | Lista achatada de botões, linhas ou opções, na ordem. `unknown` → `[]`. |
| `buildMenuJson(modelo)` (idem) | modelo → string | JSON do menu a partir do modelo (para menus **novos**; editar um existente é feito por `menu-modal.js`, que preserva o original). |
| `listarPendencias(bot)` (`bot-view-interactions.js`) | bot → lista | Formato na seção 9.3. |

### Tela

| Função (arquivo) | Para quê |
|---|---|
| `escapeHtml(texto)` (`utils.js`) | Escapa `& < > " '` (aspas simples viram `&#39;`). **Obrigatório** em todo texto vindo do bot ou do usuário que entre em `innerHTML`. `null`/`undefined` → `''`. (Atenção: o simulador do motor tem uma função própria, `escaparHtml`, que **não** escapa aspas simples porque imita o servidor; não confundir.) |
| `getRootNode()` (`dom-root.js`) | Raiz do DOM da extensão (o `ShadowRoot`); na página avulsa é o `document`. **Toda busca de elemento usa isto**, nunca `document`. |
| `$(seletor)` (`utils.js`) | Atalho: `getRootNode().querySelector(seletor)`. |
| `empilharEsc(fn)` (`dom-root.js`) | Registra tratamento da tecla Esc numa **pilha**. Quem registrou por último trata primeiro; se `fn(evento)` devolver `false`, o Esc passa para o de baixo; qualquer outro retorno consome a tecla. Devolve a função que remove o tratamento (chame ao fechar a janela). |
| `criarIcones()` (`dom-root.js`) | Desenha os ícones Lucide (`<i data-lucide="nome">`) dentro da raiz ativa. Chame depois de inserir HTML novo. |
| `mostrarToast(texto)` (`utils.js`) | Aviso transitório (~3,2 s) no canto da tela; o texto entra via `textContent`. |
| `marcarCamposSemAutopreenchimento(elemento)` (`dom-root.js`) | Marca campos de uma janela nova para os gerenciadores de senha não oferecerem preenchimento. Chame em toda janela com `input`/`textarea`. |

## 5. JSON do menu (ação 10)

Três formatos reconhecidos; qualquer outro vira "formato não reconhecido".

```jsonc
// WhatsApp botões
{ "interactive": { "type": "button", "header": {"text": ""}, "body": {"text": ""}, "footer": {"text": ""},
  "action": { "buttons": [ { "type": "reply", "reply": { "id": "suporte", "title": "Suporte" } } ] } } }

// WhatsApp lista
{ "interactive": { "type": "list", "header": {"text": ""}, "body": {"text": ""}, "footer": {"text": ""},
  "action": { "button": "Ver opções", "sections": [ { "title": "", "rows": [ { "id": "l1", "title": "Linha 1", "description": "" } ] } ] } } }

// WebChat
{ "message_type": "menu", "menu_type": "list", "options": [ { "text": "Vendas", "value": "vendas" } ] }
```

O menu WebChat **não tem texto da pergunta**: o texto é uma ação "Mensagem" (tipo 1) logo antes do menu. Se um JSON antigo trouxer outras chaves (ex.: `text`), elas são preservadas ao editar, mas o editor não as usa.

Quando o cliente toca num botão ou numa linha do WhatsApp, o bot recebe como mensagem **o `id` do item** (não o título). Para o WebChat não está confirmado se chega o `value` ou o `text`: as features tratam isso como uma opção configurável.

---

## 6. Cadastros do ambiente

Listas de `{ value, label }` (ID e nome) lidas da página da Orpen. **Fora da Orpen (modo avulso) todas vêm vazias**: a feature deve funcionar mostrando só o ID.

| Função | Conteúdo |
|---|---|
| `opcoesCalendarios()` | calendários |
| `opcoesFilas()` | filas (o ID é o nome da fila) |
| `opcoesAgentes()` | agentes |
| `opcoesBots()` | bots (destino de transferência) |
| `opcoesCrmStatus()` | status CRM |
| `opcoesSubStatus()` | substatus |
| `opcoesEntradasCondicao()` | entradas (para condições) |
| `opcoesScripts()` | scripts |
| `opcoesCheckpoints()` | checkpoints |
| `opcoesOpenAiContas()` | contas OpenAI (com seus assistentes) |
| `opcoesLabels()` | labels |
| `opcoesAnexos()` | anexos |

Regra de exibição usada em todo o produto: **mostrar o nome, com o ID entre parênteses** — `"Horário comercial" (ID 227)`; sem nome conhecido, só `ID 227`.

---

## 7. O que a camada do editor oferece como ponto de integração

As features que desenham sobre o editor (Testar bot, Localizar, Copiar/colar) dependem destes pontos do DOM e **não podem mudar de nome** sem aviso:

| Elemento | Significado |
|---|---|
| `#bot-view-overlay` | Raiz do editor (um `<div>` fixo em tela cheia). Ganha a classe `hidden` quando o editor fecha. |
| `.bv-header` | Cabeçalho; features inserem seus botões antes do `#btn-fechar-bot-view`. |
| `#bv-estados` | Contêiner da lista de estados. É **recriado por inteiro** a cada alteração estrutural (duplicar, mover, excluir, salvar). Features que marcam elementos precisam remarcar depois disso (observar `childList`). |
| `.estado-wrap[data-estado-numero]` | Cartão de um estado. Filhos: `.estado-header`, `.estado-body` (classe `hidden` quando fechado), `.estado-chevron`, `.estado-resumo`. Aberto = `.estado-expandido` no wrap e sem `hidden` no body. |
| `.estado-row[data-transition-id]` | Bloco de uma transição dentro do estado. |
| `.condicao-item` / `.acao-item` | Cartões de condição e de ação; contêm campos com `data-condition-id` / `data-action-id`. |
| `.bs-alvo` (classe) | Pisca 1,6 s; use para chamar atenção a um elemento. |

---

Os seletores e atributos `data-*` que a busca usa para levar a pessoa até um campo (`mudar-campo-acao`, `mudar-condicao-valor`, `.estado-alias`, `.menu-resumo`, `editar-menu`, `.condicao-operador`...) estão listados na tabela da seção 8.1 de `02-localizar.md`.

## 8. Convenções obrigatórias de implementação

1. **Sem acesso a `document`**: use `getRootNode()`; o editor roda dentro de um Shadow DOM. *Exceções conhecidas:* o iframe do fluxograma é anexado ao `document.body` da página (precisa estar fora do Shadow DOM para o Chrome pintá-lo) e a pilha de Esc escuta o `document`.
2. **Tamanhos em `px`** em qualquer janela ou painel que não esteja dentro do editor: a página da Orpen redefine a fonte base para 10px, e `rem` ficaria ~38% menor.
3. **Cores só por tokens** (`var(--accent)`, `var(--text)`, `var(--success)`, `var(--danger)`, `var(--warn)`, `var(--obd-bg)`, `var(--obd-surface)`, `var(--obd-border)`...). Isso garante tema claro e escuro. Os valores dos tokens para os dois temas estão no começo de `css/styles.css`. *Exceção:* a imagem do fluxograma e as cores por tipo de resultado da busca têm valores fixos definidos nas respectivas specs (a imagem exportada não muda com o tema).
4. **Todo texto vindo de fora** passa por `escapeHtml` antes de entrar em `innerHTML`, inclusive em atributos `data-*`.
5. **Features que não editam só leem o bot.** Quem **altera** o bot em memória: o **editor** (todas as edições), **Copiar/colar** (cola estados), o **Menu** (cria e remove ações "Mensagem" ao trocar de tipo), o **Gerar tratamento** (cria estado, transições, condições e ações) e a página avulsa (spec 06, que edita e transforma o JSON). Todas por funções próprias e **sem gravar sozinhas**. Testar bot, Localizar, Fluxograma e Atualização/Novidades **só leem**. Salvar na Orpen é sempre o botão Salvar do editor.
6. **Nada grava na Orpen** exceto o botão Salvar do editor.
7. **Módulos puros primeiro**: a lógica de cada feature vive num módulo sem DOM (testável em Node); a tela é uma camada fina por cima.

---

## 9. Como uma feature se liga ao editor (API de integração)

O editor é uma camada pronta; cada feature só precisa de **um ponto de entrada** e de alguns utilitários.

### 9.1 Ponto de entrada
As features de tela do cabeçalho expõem uma função `initX()` (`initBusca`, `initTesteBot`, `initCopiarColar`), chamada **uma vez** quando o editor é montado. *Exceções:* o **fluxograma** não tem `initX`: o seletor PNG/SVG e o botão são inseridos no rodapé (ao lado de "Backup JSON") por `js/orpen-bridge.js`, e o módulo só é carregado no primeiro clique; **Menu**, **Novidades** e **Atualização** são acionados por botões que já existem no editor (cartão da ação 10, botão da versão no rodapé). Para as que têm `initX`: Ela:
1. insere seu(s) botão(ões) em `.bv-header` (os existentes são inseridos antes do `#btn-fechar-bot-view`; o de busca antes do botão de fechar, o de teste antes do botão de busca);
2. cria sua janela ou painel sob demanda (nunca no HTML estático do editor, ver seção 9.4);
3. registra seus ouvintes (teclado, `input`/`change` em `#bv-estados`, `MutationObserver`).

O editor abre sobre o bot por `abrirBotView(bot)` e fecha por `fecharBotView()`; ao fechar, toda feature deve fechar sua janela, soltar ouvintes e **parar timers**.

### 9.2 Estado compartilhado (`state`, em `js/state.js`)
| Campo | Conteúdo |
|---|---|
| `state.botCarregado` | o bot em edição (seção 1). Quem altera é o editor; features **leem** (exceção: Copiar/colar). |
| `state.ambienteOrpen` | cadastros lidos da Orpen (alimenta as funções `opcoes*()` da seção 6); `null` no modo avulso. |
| `state.baselineSalvo` | payload do bot como está salvo no servidor; se o payload atual for diferente, há **alteração não salva**. |
| `state.nomeArquivoOriginal`, `state.botTransformado` | só da página avulsa (spec 06). |

### 9.3 Pendências (campos a revisar)
`listarPendencias(bot)` devolve a lista de campos de cadastro **vazios** que a pessoa precisa preencher; `abrirPendenciasModal(lista, textos?)` mostra a janela (`textos = {titulo, dica}` opcional). Cada item:
```js
{ estadoNumero:'4', estadoAlias:'HOME', transicaoPrioridade:'1',
  tipoItem:'Ação' | 'Condição', posicao: 2,        // posição (1, 2...) dentro da transição
  tipoLabel:'Transf. Fila', campoLabel:'Número da fila / bot / agente' }
```
Quais campos contam como pendência está em `CAMPOS_PENDENCIA_POR_TIPO` (`js/dictionaries.js`): ações 4, 5, 6, 7, 9, 12, 14, 15, 17, 18 (conta e assistente), 22, mais `assistant_id` vazio em condições. Estados de destino **não** entram (resolvem-se dentro do bot). As pendências **avisam, não bloqueiam** (o único bloqueio do Salvar sobre isso está na spec 04, seção 7).

### 9.4 Janelas (modais) da extensão
O HTML do editor é entregue em **blocos** extraídos de `bot_transform.html` pelo script de entrada (`content/bootstrap.js`; a extração e a lista de blocos estão em `js/orpen-bridge.js`): hoje `#bot-view-overlay`, `#pendencias-overlay` e `#copiar-overlay`. Uma janela que existe como HTML estático em `bot_transform.html` **precisa estar nessa lista**, senão funciona na página avulsa e fica inexistente dentro da Orpen (foi o bug do botão Copiar/colar morto). Janelas criadas por JavaScript na hora de abrir (Menu, Gerar tratamento, Novidades, confirmação do fluxograma) **não** precisam estar na lista.

### 9.5 Salvar e alteração não salva
Salvar é do editor (botão Salvar). Features que precisam saber receberão **funções** de quem as chama, por exemplo `gerarFluxograma({ formato, salvar, temAlteracoesNaoSalvas, atualizarBotao })`: `salvar()` devolve uma promessa de `true/false` e já mostra o próprio erro; `temAlteracoesNaoSalvas()` devolve booleano. A confirmação "Salvar antes de gerar?" é uma janela da própria feature (`confirmarSalvar()` em `fluxograma-export.js`).
