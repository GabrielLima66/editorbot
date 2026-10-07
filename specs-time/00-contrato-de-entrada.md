# 00 · Contrato de entrada (o que toda feature recebe)

Este documento descreve **o que o time recebe pronto** e pode assumir. Nenhuma feature precisa saber como o bot é aberto, editado ou salvo na Orpen: isso é feito por uma camada que já existe (a "caixa-preta"). As specs das features só descrevem o que se faz **com** o bot que já está carregado.

> Convenção de leitura: tudo que está em `código` é nome real usado no projeto. Todos os valores de ID e número vêm como **string** ("3", não 3).

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

Cada linha traz também chaves numéricas espelhadas (`"0"`, `"1"`...) com os mesmos valores das chaves nomeadas. **Ignore-as ao ler. Ao criar linhas novas, use a função pronta `withMirrors` (seção 4).**

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

### 2.1 Variáveis

| `variable` | Rótulo na tela | `CONDITION_TYPE` significa | `value` |
|---|---|---|---|
| `message` | MENSAGEM | operador de texto (tabela 2.2) | texto; várias linhas = alternativas |
| `contact` | CONTATO | operador de contato (tabela 2.2) | conforme operador (ex.: IDs de labels) |
| `error_count` | Contador de Erros | 1 igual, 6 maior, 7 maior-igual, 8 menor, 9 menor-igual | número |
| `calendario` / `calendario_falso` | CALENDARIO (Verdadeiro/Falso) | **ID do calendário** | — |
| `agent_on_queue` | AGENTES NA FILA | nome/ID da fila | — |
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
| 4 | Transf. Agente | `destiny` (ID do agente ou `{$variável}`) | Transfere e sai do bot. |
| 5 | Transf. Fila | `destiny` (nome da fila) | Transfere e sai do bot. |
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

Não reimplemente. Estão em `js/` e têm testes.

| Função | Para quê |
|---|---|
| `nextId(lista)` | Próximo ID (maior + 1) de uma das quatro tabelas. |
| `withMirrors(tipo, linha)` | Refaz as chaves numéricas espelhadas; `tipo` = `'state'`, `'transition'`, `'condition'` ou `'action'`. |
| `remapStateNumbers(bot, mapa)` | Renumera estados e todas as referências (`STATE`, `destiny`, `callback_state`, `fallback_state`, `TIMEOUT_DESTINY`) de acordo com um `Map` antigo → novo. |
| `tipoDaCondicao(condicao)` | Tipo que será gravado (usado para saber se uma condição será descartada). |
| `escapeHtml(texto)` | **Obrigatório** em todo texto vindo do bot ou do usuário que entre em `innerHTML`. |
| `parseMenuModel(json)` / `extrairItensMenu(modelo)` | Lê o JSON de menu da ação 10 (seção 5). |
| `empilharEsc(fn)` | Registra tratamento da tecla Esc em pilha (quem abriu por último trata primeiro; devolver `false` passa para o de baixo). |
| `getRootNode()` | Raiz do DOM da extensão (Shadow DOM). **Toda busca de elemento usa isto**, nunca `document`. |
| `criarIcones()` | Desenha os ícones Lucide (`<i data-lucide="nome">`). |

---

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
{ "message_type": "menu", "menu_type": "list", "text": "Escolha", "options": [ { "text": "Vendas", "value": "vendas" } ] }
```

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

## 8. Convenções obrigatórias de implementação

1. **Sem acesso a `document`**: use `getRootNode()`; o editor roda dentro de um Shadow DOM.
2. **Tamanhos em `px`** em qualquer janela ou painel que não esteja dentro do editor: a página da Orpen redefine a fonte base para 10px, e `rem` ficaria ~38% menor.
3. **Cores só por tokens** (`var(--accent)`, `var(--text)`, `var(--success)`, `var(--danger)`, `var(--warn)`, `var(--obd-bg)`, `var(--obd-surface)`, `var(--obd-border)`...). Isso garante tema claro e escuro.
4. **Todo texto vindo de fora** passa por `escapeHtml` antes de entrar em `innerHTML`, inclusive em atributos `data-*`.
5. **Features só leem o bot**. Quem altera o bot é o editor (mutations de `bot-view-interactions.js`). Exceção: Copiar/colar, que altera o bot **em memória** por funções puras próprias e nunca grava sozinha.
6. **Nada grava na Orpen** exceto o botão Salvar do editor.
7. **Módulos puros primeiro**: a lógica de cada feature vive num módulo sem DOM (testável em Node); a tela é uma camada fina por cima.
