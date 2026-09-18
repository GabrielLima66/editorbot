# Motor de Bot (orangev3 / ContactCenter) — Especificação completa

> Fonte: código-fonte real, cruzado em dois lados — a tela de edição
> (`ContactCenter/bot.php`, modal `editBotModal`) e o motor que executa de fato
> (`ContactCenter/classes/Bot.class.php`, métodos `execute()`, `check_condition()`,
> `execute_action()`). Todo ID/rótulo abaixo foi conferido nos dois lados; onde os
> dois batem, marquei como confirmado. Não é uma leitura só da UI — é a interseção
> UI × runtime.

## 1. Hierarquia

```
Bot
 └── Estados (states)               — nós do fluxo, identificados por STATE_NUMBER
      └── Transições (transitions)  — avaliadas em ordem de PRIORITY (asc) dentro do estado
           ├── Condições (N)        — AND implícito: todas precisam ser verdadeiras
           └── Ações (N)            — executadas em sequência, na ordem em que foram criadas
```

### Algoritmo de execução (`Bot::execute()`)
Para cada conversa presa no bot:
1. Pega as transições do **estado atual** da conversa (`conversation['BOT_STATE']`), já ordenadas por `priority ASC`.
2. Percorre as transições em ordem; para cada uma, avalia todas as condições com **AND** (para no primeiro `false`).
3. A **primeira transição cujas condições todas passam** é a selecionada — as demais são ignoradas (não é "primeira que casar de cada tipo", é a primeira da lista inteira).
4. Executa todas as **ações** dessa transição, em sequência.
5. Se nenhuma transição do estado atual casar, nada acontece nesse ciclo (bot fica esperando a próxima mensagem/ciclo).

Uma condição com `condition_type = 0` é o "sempre verdadeiro" (usada como fallback/"else" no fim da lista de transições de um estado).

## 2. Bot (config de nível topo)

Tabela `ctc_bot`. Campos editados no formulário principal do modal:

| Campo (UI) | Coluna / uso |
|---|---|
| Número do Bot | `ID` (mesmo ID de `inb_agent` — bot "é" um agente especial) |
| Nome | `NAME` |
| Status | `STATUS` (1/0) |
| Tempo para Resposta (seg) | `TIME_ANSWER` |
| Ações de timeout | `TIMEOUT_ACTION` — vazio / `bot` (troca estado) / `queue` (transfere fila) / `close` (encerra) |
| Tempo para entrega (timeout) | `CONF_DELIVERY_TIME` / `TIMEOUT_DELAY` |
| Estado do bot (timeout→bot) | `TIMEOUT_DESTINY` |
| Fila para entrega (timeout→queue) | `CONF_DELIVERY_QUEUE` |
| Encerrar atendimento — status CRM (timeout→close) | `TIMEOUT_DESTINY` (nesse caso guarda o crm_status) |
| Mensagem ao encerrar (timeout→close) | `TIMEOUT_MESSAGE` |
| Conta p/ transcrição de áudio | `INTEGRATIONS` (JSON) → chave `audio_transcription_account` |

Criação (`Bot::create`) só grava `id, name, time_answer` e **valida que o número escolhido não colida com um `inb_agent` já existente**.

## 3. Estrutura de dados (tabelas Oracle)

- `ctc_bot` — 1 linha por bot
- `ctc_bot_state (bot_id, state_number, alias)` — 1 linha por estado
- `ctc_bot_transition (id, agent_id, state, priority)` — 1 linha por transição; `agent_id` = bot_id; `state` = state_number pai
- `ctc_bot_transition_condition (id, bot_id, transition_id, condition_type, condition_data)` — `condition_data` é **JSON serializado como string** (a coluna guarda texto, é `json_encode`/`json_decode` na aplicação)
- `ctc_bot_transition_action (id, bot_id, transition_id, action_type, action_data)` — mesma lógica, `action_data` é JSON string

**Save é full-replace**: `Bot::update()` deleta TODOS os states/transitions/conditions/actions do bot e reinsere tudo do payload recebido, dentro de uma transação (`commit`/`rollback`). Não há update incremental por linha — se sua tela vai portar esse comportamento, replique isso (evita ficar sincronizando diffs).

Payload esperado por `Bot::update($bot_id, $name, $status, $states, ...)`:
```php
$states = [
  [
    'state_number' => 0,
    'alias' => 'texto opcional',
    'transitions' => [
      [
        'priority' => 0,
        'conditions' => [
          ['type' => 1, 'data' => ['variable' => 'message', 'value' => '...']],
        ],
        'actions' => [
          ['type' => 1, 'data' => ['message_text' => '...']],
        ],
      ],
    ],
  ],
];
```
(`type == 0` em condition/action é descartado no save — é o placeholder "--" do select vazio.)

## 4. Condições — variável (`condition_data.variable`)

Lista fixa oferecida na tela (função `bot_variables` em `bot.php`) + dinâmicas (variáveis armazenadas pelo próprio bot via ação 13, variáveis de retorno de Automação via ação 22, Assistentes OpenAI configurados):

| Variável (nome exibido) | `value` interno | Comportamento no runtime |
|---|---|---|
| MENSAGEM | `message` | Avalia contra as mensagens recebidas do cliente (`checkMessages = true`) |
| AG. PREFERIDO | `pref_agent` | — |
| NOME AG. PREFERIDO | `name_pref_agent` | — |
| CONTATO | `contact` | Ver tabela de operadores "contact" abaixo |
| CALENDARIO (Verdadeiro) | `calendario` | `condition_type` = ID do calendário; true se dentro do período |
| CALENDARIO (Falso) | `calendario_falso` | mesmo calendário, mas nega o resultado |
| Contador de Erros | `error_count` | `condition_type`: 1=igual, 6=maior, 7=maior-igual, 8=menor, 9=menor-igual; `value` = número |
| CONTATO possui OptIn | `opt_in` | `condition_type`: 1=possui, 2=não possui |
| CONTATO possui UCI | `uci` | `condition_type`: 1=possui, 2=não possui |
| Teve atendimento em | `old_attendance` | `condition_type`: 1=dias, 2=horas, 3=minutos, 4=segundos; `value`=número |
| AGENTES NA FILA | `agent_on_queue` | `condition_type` = ID da fila; true se ≥1 agente logado/disponível nela |
| AGENTE LOGADO | `agent_online` | `condition_type` = ID do agente (ou variável); true se `system_status != 0` |
| DISPONÍVEL CHAT | `agent_available_on_chat` | `condition_type` = ID do agente; true se `chat_status == 1` |
| Status Último Atendimento | `status_last_att` | `condition_type` = ID do status CRM |
| Tipo de entrada | `entrance_type` | `condition_type`: 1=WhatsApp, 2=E-mail, 3=Facebook, 6=Webchat, 7=Instagram, 8=Telegram |
| REMETENTE | `sender` | `condition_type`: 1=Igual a, 2=Contém; `value`=texto (multi-linha = OR) |
| ENTRADA | `entrance` | `condition_type` = ID da entrance cadastrada |
| NÚMERO DO CONTATO | `contact_number` | `condition_type`=1 ("Começa com"); `value`=lista multi-linha de prefixos |
| Último agente que atendeu | `agent_last_att` | somente leitura/gravação em `extra_data`, não tem operador próprio |
| ASSUNTO DO EMAIL | `email_subject` | tipo texto genérico (ver tabela "text" abaixo) |
| [Automação] Mensagem/Status/Thread ID | `automate_message` / `automate_status` / `automate_thread_id` | só aparecem no seletor se o fluxo tiver ação 22 (Executar Automação) |
| Assistente OpenAI `<nome>` | id do assistant | usa `variable = assistant_analysis_status` ou `assistant_analysis_text` internamente |

### Operadores por tipo de dado

**`text`** (MENSAGEM, REMETENTE-fallback, ASSUNTO DO EMAIL, variáveis customizadas tipo texto) — `condition_type`:
| ID | Operador |
|---|---|
| 1 | Igual a |
| 2 | Contém |
| 3 | Diferente de (nega o 1) |
| 4 | Não contém (nega o 2) |
| 5 | É CPF |
| 6 | Maior que |
| 7 | Maior igual que |
| 8 | Menor que |
| 9 | Menor igual que |
| 10 | *(reservado — ver "É Vip" abaixo, reaproveitado)* |
| 11 | É número |
| 12 | É e-mail |
| 13 | É CNPJ |
| 14 | É CNPJ/CPF |
| 15 | É data |
| 16 | É menção de story |
| 17 | É resposta de story |
| 18 | *(reservado — "possui labels", ver "contact" abaixo)* |
| 19 | *(reservado — "tem CPF", ver "contact" abaixo)* |
| 20 | *(reservado — "tem CNPJ", ver "contact" abaixo)* |
| 21 | *(reservado — "não é Vip", ver "contact" abaixo)* |
| 22 | É anexo/arquivo |
| 23 | É áudio |
| 24 | É forma de contato (telefone ou e-mail já cadastrado em outro contato) |

> Os IDs 10/18/19/20/21 são do **mesmo switch `condition_type`** só que semanticamente usados quando `variable == 'contact'`. O switch em `check_condition()` é único (não é por variável+tipo), então tecnicamente qualquer variável tipo texto poderia "casar" com 10/18/19/20/21, mas a UI só oferece essas opções quando a variável é `contact` — não misture.

**`contact`** (variável CONTATO) — `condition_type`:
| ID | Operador | Lógica real |
|---|---|---|
| 10 | É Vip | `contact.VIP == 1 AND contact.PREF_AGENT != null` |
| 21 | Não é Vip | `contact.VIP == 0 AND contact.PREF_AGENT == null` |
| 18 | Possui os labels | `value` = array de IDs de label; abre seletor de labels na UI |
| 19 | Tem CPF | ignora `value`, só checa se `contact.CPF` está preenchido |
| 20 | Tem CNPJ | ignora `value`, só checa se `contact.CNPJ` está preenchido |

**`sender`**: 1=Igual a, 2=Contém — compara com `conversation.SOURCE` (o número/identificador de quem enviou), `value` multi-linha = OR.

**`entrance` / `calendario` / `queue` (agent_on_queue) / `crm_status` (status_last_att) / `agent` (agent_online, agent_available_on_chat)**: nesses casos `condition_type` **não é um operador**, é o **ID do registro selecionado** (ID da entrance/calendário/fila/status/agente). O "operador" na UI é substituído por um select com a lista desses registros.

**`opt_in` / `uci`**: 1 = possui, 2 = não possui.

**`old_attendance`**: 1=Dias, 2=Horas, 3=Minutos, 4=Segundos (+ `value` numérico).

**`entrance_type`**: 1=WhatsApp, 2=E-mail, 3=Facebook, 6=Webchat, 7=Instagram, 8=Telegram.

**`contact_number`**: 1 = "Começa com" (só existe esse operador); `value` = lista multi-linha de prefixos telefônicos.

**`openai_assistant`** (`assistant_analysis_status` / `assistant_analysis_text`): `condition_data` = `{ assistant_id, type, value }`. `type`: se a variável escolhida é status → compara `success`/`error`; se é conteúdo → `1`=Igual a, `2`=Contém, `3`=Diferente de, `4`=Não contém.

Em todos os operadores de texto, `value` aceita múltiplas linhas — cada linha é tratada como alternativa (**OR**), e aceita variáveis `{$nome_da_variavel}` (interpoladas por `changeValuesVariables()` antes de comparar).

## 5. Ações (`action_type`) — confirmadas 1:1 contra `execute_action()`

| ID | Nome (UI) | Campos de `action_data` | O que faz |
|---|---|---|---|
| 1 | Mensagem | `message_text` | Envia mensagem de texto pro cliente (via `outbound_message_thread.php`) |
| 2 | Troca Estado | `destiny` | `UPDATE ctc_attendance SET bot_state = :destiny` |
| ~~3~~ | ~~Guardar~~ | — | **Desativado.** Comentado na UI e sem `case 3` no executor — não implementar |
| 4 | Transf. Agente | `destiny` | Transfere atendimento pro agente (`outbound_transfer_thread.php`, tipo 2) |
| 5 | Transf. Fila | `destiny` | Transfere pra fila (mesmo script, tipo 1) |
| 6 | Finalizar | `crm_status` | Encerra o atendimento com o status CRM informado |
| 7 | Executar Script | `script_name` (ID de `CTC_BOT_WS`) | Roda script PHP em `ContactCenter/wsBot/<arquivo>` (integração por cliente), injeta retorno JSON nas variáveis do bot prefixado por `<script_name>_<chave>` |
| 8 | Contador de Erros | `error_count` = `'add'` \| `'reset'` | Incrementa/zera contador de erros da conversa |
| 9 | CheckPoint | `check_point` (ID de ponto de bot) | Insere em `ctc_attendance_checkpoint` |
| 10 | Mensagem Options | `message_option_text` | Mensagem com botões/opções (mesmo pipe de envio da ação 1) |
| 11 | Mensagem Form | `message_option_form` | Mensagem tipo formulário |
| 12 | Enviar msg. à Entrance | `entrances` (ID da entrance) | Reencaminha a mensagem atual pra outra entrance (suporta WhatsApp e Facebook) |
| 13 | Armazenar variável | `bot_variables_text` (JSON string, aceita `{$var}`) | Faz merge no `extra_data` da conversa — é a fonte das "variáveis customizadas" que aparecem depois no seletor de condições |
| 14 | Substatus | `substatus` | Vincula substatus ao atendimento |
| 15 | Tags | `message_text` (usado como nome da tag) | Cria a tag se não existir e vincula ao atendimento |
| 16 | Atualizar contato | `update_contact_value` (enum abaixo) + `message_text` / `labels` / `contact_item_type` | Ver sub-tabela abaixo |
| 17 | Enviar anexo | `send_file` (ID em `SysFileStorage`) | Envia arquivo já cadastrado no sistema |
| 18 | OpenAI | `openai` (nome do método, sempre `call_assistant`), `openai_account`, `assistant_id`, `assistant_content`, `assistant_metadata`, `callback_state` | Chama assistente OpenAI configurado; resposta volta assíncrona pro `callback_state` |
| 19 | Adicionar nota ao atendimento | `protocol_note` | Insere linha de histórico tipo nota (status 10, `sender_type='bot'`) |
| 20 | Enviar mensagem de áudio | `message_content`, `callback_state`, `fallback_state`, `model_audio`, `model_openai`, `speed` | TTS via conta OpenAI configurada no bot (`INTEGRATIONS.audio_transcription_account`); marca atendimento como `processing` |
| 21 | Adicionar forma de contato | `contact_item_type` (`EMAIL`\|`PHONE`), `message_text` (valor) | Insere em `CTC_CONTACT_ITEM`; valida formato de telefone antes |
| 22 | Executar Automação | `url`, `payload` (JSON, aceita `{$var}`), `callback_state`, `fallback_state`, `timeout` (seg, 0/vazio = default 120s) | **Assíncrono**: dispara webhook externo e **pausa** o atendimento (`automate_pending=1`) até o callback (`automateCallback.php`) responder ou o timeout estourar (cai no `fallback_state`); gera nonce de segurança de uso único |

### Sub-ação 16 — Atualizar contato (`update_contact_value`)
| Valor | Efeito | Campo usado |
|---|---|---|
| `enable-opt-in` | `CTC_CONTACT.OPT_IN = 1` | — |
| `disable-opt-in` | `CTC_CONTACT.OPT_IN = 0` | — |
| `enable-opt-out` | `CTC_CONTACT.OPT_OUT = 1` | — |
| `disable-opt-out` | `CTC_CONTACT.OPT_OUT = 0` | — |
| `update-name` | `CTC_CONTACT.NAME` | `message_text` |
| `update-uci` | `CTC_CONTACT.UCI` (valida duplicidade) | `message_text` |
| `update-observations` | `CTC_CONTACT.OBSERVATIONS` | `message_text` |
| `update-pref-agent` | `CTC_CONTACT.PREF_AGENT` | `message_text` |
| `update-cpf` | `CTC_CONTACT.CPF` (valida formato + duplicidade) | `message_text` |
| `update-cnpj` | `CTC_CONTACT.CNPJ` (valida formato + duplicidade) | `message_text` |
| `add-labels` | insere em `ctc_contact_label` (ignora já existentes) | `labels` (array de IDs) |
| `add-contact-item` | insere em `CTC_CONTACT_ITEM`, tipo `phone`\|`email` (valida duplicidade/formato) | `message_text` + `contact_item_type` |

Todas as ações de update de contato **abortam silenciosamente (`return`) e logam `BOT_EXCEPTION`** se a validação falhar (CPF/CNPJ mal formado, UCI/CPF/CNPJ duplicado, telefone inválido) — não há um estado de erro explícito no fluxo pra esses casos, só log.

## 6. Bugs/particularidades do código-fonte (pra não replicar por engano)

- **`bot.php` linha ~3933**: existe um `<?php echo $arrayTranslate["js_createAction_select_store_tags"]; ?></option>` solto, fora de qualquer `<option>`, entre os values 20 e 21 do select de ações. É lixo de código (sobra de edição), não é uma opção funcional — os IDs reais continuam 20=Áudio IA e 21=Adicionar forma de contato.
- **Ação `3` ("Guardar")** existe comentada na tela mas não tem `case 3` no executor — trate como removida, não implemente.
- **Ação 22 (Automação) é a única assíncrona/com pausa** — todas as outras rodam e terminam no mesmo ciclo de execução do bot.
- **Save é destrutivo/full-replace** (apaga e reinsere states/transitions/conditions/actions inteiros a cada salvamento) — não há edição incremental no backend.
- Variáveis "automate_*" e assistentes OpenAI só aparecem no seletor de condição **condicionalmente**, dependendo de outras ações já existentes no fluxo (acoplamento tela↔dados que vale replicar se quiser paridade de UX).

---
**Conferência de proveniência**: toda a tabela de ações (1–22) foi lida linha a linha do `switch` em `execute_action()`; toda a tabela de condições foi lida linha a linha do `switch`/`elseif` em `check_condition()`. Não há inferência — é transcrição do código real, com os rótulos batidos contra `language/pt-br/contactcenter.xml`.
