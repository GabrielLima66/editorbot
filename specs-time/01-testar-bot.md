# 01 · Testar bot

Status: implementada na v0.8.19 (referência: `js/simulador.js`, `js/teste-bot.js`, `tests/editor/simulador.test.mjs`). Esta spec descreve o comportamento exigido, para o time reimplementar ou evoluir sem depender do código da Orpen.

Pré-requisito: `00-contrato-de-entrada.md`.

---

## 1. Objetivo

Permitir que quem edita um bot **converse com o rascunho dele dentro do editor**, sem salvar, sem criar atendimento real e sem acionar nada externo, vendo **por onde a conversa passa** e **por que cada decisão foi tomada**.

O valor está em prever o que a produção fará. Por isso a regra de ouro é a **fidelidade ao motor** (seção 5), inclusive nos defeitos conhecidos do motor, que o teste reproduz e avisa.

### Dentro do escopo

- Simulador do motor de bots (módulo puro).
- Janela de teste: lista de estados, conversa, detalhes e contexto.
- Começar de qualquer estado e parar ao chegar em outro.
- Modo minimizado e marcas do teste no editor.

### Fora do escopo

- Teste real pela API de WebChat (cria contatos e atendimentos reais).
- Executar scripts, chamar IA, tocar áudio ou chamar automações: esses retornos são simulados por botões.
- Reproduzir tempo real (atraso de digitação, intervalo de um segundo entre rodadas).
- Qualquer coisa que leia o banco: calendário, fila, agente, opt-in... vêm do **Contexto** informado pela pessoa.

### Princípios

1. **Nunca grava e nunca altera o bot.** O teste trabalha numa cópia (foto) tirada ao iniciar.
2. **Nunca assume em silêncio.** Quando falta um dado que o teste não tem, ele **pausa e pergunta**; jamais trata como falso.
3. **Reproduz o motor, mesmo errado**, e avisa quando o motor tem um defeito conhecido.
4. **Tudo é explicável**: cada decisão aparece na aba Detalhes com o motivo.

---

## 2. Visão geral do fluxo de uso

1. Pessoa clica no botão do robô no cabeçalho do editor. Abre a janela de teste com uma conversa nova no estado 0.
2. Digita como o cliente (ou toca num botão de menu). O teste mostra as respostas do bot em bolhas e marca na lista de estados onde a conversa está.
3. Se faltar um dado externo, o teste pergunta (Sim/Não ou uma escolha) e continua.
4. Pode minimizar para o canto e ver as marcas no próprio editor.
5. Pode reiniciar, começar de outro estado, definir um ponto de parada e informar variáveis iniciais.

---

# PARTE A · O simulador (módulo puro)

Arquivo: `js/simulador.js`. Sem DOM, sem `chrome.*`. Depende só de dicionários, do leitor de menu e dos cadastros do ambiente (contrato, seções 2, 5 e 6).

## A1. API pública

```js
criarSessao(bot, contexto?)           // -> sessao
enviarMensagem(sessao, texto, exibir?)// cliente fala; roda até parar
continuar(sessao)                     // refaz a rodada pausada por falta de dado
definirExterna(sessao, chave, valor)  // responde o dado pedido
responderCallback(sessao, {ok, status?, texto?}) // retorno de IA/áudio/automação
simularTimeout(sessao)                // aplica o timeout configurado no bot
continuarDaParada(sessao)             // segue depois de parar no ponto de parada
requisitosDeContexto(bot)             // o que o bot consulta de fora (aba Contexto)
variaveisUsadas(bot)                  // variáveis guardadas que o bot usa
nomeDoCadastro(variavel, id)          // '"Nome" (ID 227)' ou 'ID 227'
trocarVariaveis(sessao, texto, mensagens?) // substitui {$x}
escaparHtml(texto)                    // escape do SERVIDOR: troca & < > " (NÃO troca aspas simples); não confundir com escapeHtml da interface (contrato 00, seção 4)
LIMITE_RODADAS = 25
```

`contexto` (todos opcionais):

| Campo | Tipo | Efeito |
|---|---|---|
| `inicio` | string | Estado em que a conversa começa (padrão `"0"`). Se não existir, a sessão nasce `encerrada` com erro. |
| `parada` | string | Estado em que o teste para ao chegar (A11). |
| `variaveis` | `{nome: valor}` | Variáveis já guardadas (vazios descartados). |
| `erros` | número | Contador de erros inicial. |
| `externas` | `{chave: valor}` | Respostas a dados externos (A5). |
| `contato` | objeto | `nome` (padrão `"Cliente Teste"`), `remetente` (padrão `"5511999990000"`), `observacoes`, `uci`, `assuntoEmail`, `agentePref`, `nomeAgentePref`. |

## A2. A sessão

```js
sessao = {
  bot: { BOT_STATES, BOT_TRANSITIONS, BOT_CONDITIONS, BOT_ACTIONS,   // CÓPIA (clone profundo)
         TIMEOUT_ACTION, TIMEOUT_DESTINY, TIMEOUT_MESSAGE },
  estado: '0',              // estado atual
  status: 'ativa',          // 'ativa' | 'aguardando' | 'aguardando-contexto' | 'encerrada'
  motivoFim: null,          // 'parada' se encerrou no ponto de parada
  parada: null,             // estado de parada ou null
  erros: 0,                 // contador de erros do atendimento
  extra: {},                // variáveis do atendimento (extra_data)
  contexto: { variaveis, externas, contato },
  eventos: [],              // o que aparece na conversa (A12)
  rodadas: [],              // trace (A12)
  caminho: ['0'],           // estados percorridos, em ordem
  visitas: { '0': 1 },      // quantas vezes entrou em cada estado
  pausa: null,              // dados da pausa por callback
  pendentes: null,          // mensagens da rodada interrompida por falta de contexto
  requisitos: [],           // o dado pedido agora: [{chave, rotulo, tipo}]
  rodadaN: 0
}
```

### Foto do bot (obrigatório)

Ao criar a sessão, copiar as quatro tabelas por clone profundo e **descartar**:
- condições cujo tipo gravado seja 0 (função `tipoDaCondicao` do contrato: tipo vazio ou `0` → 0; as condições de assistente OpenAI são gravadas como 1 ou 2 e **não** são descartadas);
- ações de tipo 0.

Motivo: é assim que o bot fica depois de salvo; uma transição cuja única condição era tipo 0 passa a valer sempre.

## A3. Uma rodada

Uma rodada corresponde a um ciclo do motor (um segundo em produção). Entrada: `mensagens` (lista de textos do cliente nesta rodada; vazia nas rodadas automáticas).

1. `sessao.rodadaN += 1`.
2. Pegar as transições cujo `STATE` é o estado atual, ordenadas por `PRIORITY` (numérico, crescente; desempate pelo `ID`).
3. Para cada transição, em ordem:
   1. Para cada condição dela, por `ID` crescente: avaliar (A5). **Parar na primeira falsa** (AND).
   2. Registrar a tentativa no trace (A12) com o resultado de cada condição avaliada. Condições depois da primeira falsa **não são avaliadas nem registradas**.
   3. Se todas passaram (ou a transição não tem condições), ela é a **escolhida**; parar o laço.
4. Se não houver transição escolhida: **nada acontece**. As mensagens já foram consumidas (não voltam em rodadas seguintes).
5. Se houver: executar **todas** as ações da transição, por `ID` crescente (A9). Uma ação que encerra ou pausa **não interrompe as seguintes da mesma transição**.
6. Se o estado mudou nesta rodada: acrescentar ao `caminho`, incrementar `visitas`, e verificar o ponto de parada (A11).
7. Se o estado atual não existe no bot: gerar evento de erro "o bot está no estado N, que não existe" e nada mais acontece.

**Pausa por falta de dado:** se, ao avaliar uma condição, faltar um dado externo (A5), a rodada é **abortada sem efeito**: `rodadaN` volta ao valor anterior, `requisitos = [o dado pedido]`, a tentativa fica no trace com a condição marcada como "falta" (resultado `null`), e a sessão passa a `aguardando-contexto` guardando `pendentes = mensagens`. Ao receber a resposta, `continuar` refaz **a mesma rodada** com as mesmas mensagens.

## A4. O laço (`processar`)

```
lote = mensagens
repeticoes = 0
enquanto status == 'ativa':
    r = executarRodada(lote)
    se r pediu contexto: status = 'aguardando-contexto'; pendentes = lote; sair
    lote = []                      // mensagem do cliente é consumida uma única vez
    se nenhuma transição disparou: sair
    repeticoes += 1
    se repeticoes >= 25: evento de erro (texto abaixo); sair
```

Texto do aviso do teto: "Parei depois de 25 rodadas seguidas sem o cliente falar. Em produção isso se repete a cada segundo, sem fim: confira o estado N (uma transição sem condição de mensagem que não troca de estado, ou um ciclo de estados)."

**Por que o laço existe:** no motor, a troca de estado só vale na rodada seguinte, e a conversa continua sendo avaliada **mesmo sem mensagem nova**. Uma transição sem condição (ou só com condições que não dependem da mensagem) dispara sozinha, uma por rodada. Isso é comportamento real e o teste precisa reproduzi-lo; o teto de 25 só existe para o teste não travar.

## A5. Avaliação de condições

`avaliarCondicao(sessao, condicao, mensagens)` devolve `{resultado: boolean, avisos: string[]}` ou **lança "precisa de contexto"** com `{chave, rotulo, tipo}`.

Antes de tudo: `valor` = `CONDITION_DATA.value` como texto, passado por `trocarVariaveis` (A8). `tipo` = `CONDITION_TYPE` como texto.

### Variáveis e dados externos

| `variable` | Regra | Dado externo (chave em `contexto.externas`) |
|---|---|---|
| `message`, `contact` | Operador de texto sobre **cada mensagem do lote**: verdadeira se **alguma** mensagem casar (A6). | — |
| `error_count` | Compara `sessao.erros` com `Number(value)`: tipo 1 `==`, 6 `>`, 7 `>=`, 8 `<`, 9 `<=`; outro tipo = falso. **Efeito colateral:** grava `extra.error_count = String(erros)`. | — |
| `calendario` | Verdadeira se a resposta for `'sim'`. | `calendario:<CONDITION_TYPE>` = `'sim'`/`'nao'` |
| `calendario_falso` | Verdadeira se a resposta **não** for `'sim'`. | mesma chave de `calendario` |
| `agent_on_queue` | `'sim'`. | `agent_on_queue:<tipo>` |
| `agent_online` | `'sim'`. O agente é o `tipo` se for numérico ≠ 0; senão é o `valor`. | `agent_online:<agente>` |
| `agent_available_on_chat` | `'sim'`. | `agent_available_on_chat:<tipo>` |
| `status_last_att` | `String(resposta) === tipo`. | `status_last_att` (texto) |
| `opt_in`, `uci` | Tipo 1: verdadeira se `'sim'`; outro tipo: verdadeira se **não** `'sim'`. | `opt_in`, `uci` |
| `entrance_type` | `String(resposta) === tipo`. | `entrance_type` (texto: 1,2,3,6,7,8) |
| `entrance` | `String(resposta) === tipo`. | `entrance` (texto) |
| `sender` | Ver abaixo. | `sender` (texto) |
| `contact_number` | Verdadeira se o número começa com **alguma linha não vazia** de `value` (linhas separadas por `\r\n`, `\n` ou `\r`), usando o `value` **cru** (sem trocar variáveis). | `contact_number` (texto) |
| `assistant_analysis_status` | Falsa se `extra.assistant_id` ≠ `CONDITION_DATA.assistant_id`; senão `extra.assistant_analysis_status === value`. | — (vem do callback, A10) |
| `assistant_analysis_text` | Mesma checagem de `assistant_id`; depois operador de texto com tipo = `CONDITION_DATA.type` sobre `extra.assistant_analysis_text`. | — |
| `old_attendance`, `agent_last_att`, `pref_agent`, `name_pref_agent` | O teste não tem esse dado: pergunta **"é verdadeira?"** (`'sim'`/`'nao'`). | `condicao:<ID da condição>` |
| qualquer outra | Variável guardada: operador de texto sobre `extra[variable]` (vazio se não existir), como **uma** candidata. | — |

**`sender`:** usa o `value` cru com `trim`. Tipo 1 (igual): compara com `==` frouxo (A6) o valor inteiro e cada linha, **diferenciando maiúsculas**. Tipo 2 (contém): verdadeira se o valor for vazio, ou se contiver (maiúsculas ASCII ignoradas) o valor inteiro ou alguma **linha não vazia**. Qualquer outro tipo: falso.

### Falta de dado externo

Chave ausente, `null` ou `''` → lançar "precisa de contexto" com:
- `chave`: a da coluna acima;
- `rotulo`: pergunta legível, **com o nome do cadastro** (`nomeDoCadastro`), por exemplo `Calendário "Horário comercial" (ID 227): o momento do teste está dentro do período?`;
- `tipo`: `'bool'` (Sim/Não) ou `'texto'`.

Respostas valem para **o resto da sessão**, exceto as de chave com sufixo `:r<N>` (A6, operadores por mensagem), que valem só para a rodada N.

## A6. Operadores de texto (`CONDITION_TYPE` das variáveis de texto)

Entrada: lista de **candidatas** (textos) e `valor`. Verdadeira se **alguma** candidata satisfaz o operador. `linhas` = `valor` dividido em `\n`.

### Preparo das candidatas (apenas para `message` e `contact`)

1. Cada mensagem vira candidata **escapada como HTML**: `&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`, `"`→`&quot;` (aspas simples **não**). É assim que o motor lê a mensagem do banco. Consequência real: mensagem `a&b` **não** é igual ao valor `a&b`.
2. Mensagem vazia **ou exatamente `"0"`** vira candidata **vazia** (`''`). No motor, a mensagem `"0"` é "falsa" e cai num campo vazio. Consequência real: "Igual a 0" **não casa** com o cliente digitando `0`.

Para as outras variáveis, a candidata é o valor guardado, sem escape.

### Efeito colateral comum

Nos operadores 1 e 2, para **cada candidata examinada**, gravar `extra.message = trim(removerTags(decodificarHtml(candidata)))`. Definições (no código: `decodificarHtml` e `tirarTags` em `js/simulador.js`): `decodificarHtml` troca, **nesta ordem**, `&lt;`→`<`, `&gt;`→`>`, `&quot;`→`"`, `&#39;` e `&#039;`→`'`, e por último `&amp;`→`&`; `removerTags` apaga tudo que casa com `<[^>]*>` (menor-que, qualquer coisa que não seja `>`, maior-que).

### Tabela

| Tipo | Nome | Regra exata |
|---|---|---|
| 0 | Sempre | Verdadeira. |
| 1 | Igual a | `igualPHP(c, valor)` **ou** `igualPHP(c, linha)` para alguma linha. Diferencia maiúsculas e acentos, sem `trim`. |
| 2 | Contém | Se `valor === ''`: verdadeira. Senão: `MAIUSCULA_ASCII(c)` contém `MAIUSCULA_ASCII(valor)`, **ou** contém `MAIUSCULA_ASCII(linha)` para alguma linha **não vazia**. |
| 3, 4 | Diferente de / Não contém | **Sempre falsos.** Adicionar o aviso: *No motor, "Diferente de" e "Não contém" nunca são verdadeiros. Esta condição nunca casa em produção.* |
| 5 | É CPF | Validação de CPF (A7) sobre a candidata decodificada sem tags. Se válido: `extra.cpf` = só dígitos. |
| 6 / 7 / 8 / 9 | Maior / Maior-igual / Menor / Menor-igual | Para alguma linha: `inteiro(c) > / >= / < / <= inteiro(linha)`. `inteiro` = `parseInt` base 10 do texto sem espaços das pontas, ou 0 se não for número (linha vazia vale 0). |
| 11 | É número | Candidata numérica (A7). Se sim, `extra.number = c`. |
| 12 | É e-mail | Regex de e-mail (A7) sobre a candidata decodificada sem tags. Se sim, `extra.email` = esse texto. |
| 13 | É CNPJ | Validação de CNPJ (A7). Se sim, `extra.cnpj` = só letras e dígitos. |
| 14 | É CNPJ/CPF | CPF ou CNPJ válido. Se sim, `extra.cpf_cnpj` = só letras e dígitos. |
| 15 | É data | Formato `dd/mm/aaaa` e data existente. Se sim, `extra.date = c`. |
| 16, 17, 22, 23, 24 | Story, anexo, áudio, forma de contato | **Por mensagem.** Sem mensagem no lote: falsa. Com mensagem: o teste não sabe — perguntar "é verdadeira?" com chave `condicao:<ID>:r<rodadaN>` (vale só nesta rodada). |
| 10, 18, 19, 20, 21 | Vip, labels, tem CPF, tem CNPJ, não é Vip (variável `contact`) | **Do contato.** Perguntar "é verdadeira?" com chave `condicao:<ID>` (persiste na sessão). |

### `igualPHP(a, b)` — igualdade frouxa do PHP 5.6

- Se `a` e `b` forem ambos **numéricos**, comparar como números (`"1" == "01"`, `"1.0" == "1"`).
- Senão, comparar como texto idêntico.
- **Numérico** = `^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$` (espaço no começo vale, **no fim não**).

### `MAIUSCULA_ASCII(s)`

Só `a–z` viram `A–Z`. Letras acentuadas **não mudam**. Consequência real: "olá" não contém "OLÁ".

## A7. Validadores

- **CPF:** só dígitos; 11 dígitos; rejeitar `00000000000`, `11111111111`… `99999999999` e `12345678909`; conferir os dois dígitos verificadores (módulo 11, pesos 10→2 e 11→2).
- **CNPJ:** manter só `[0-9a-zA-Z]`, em maiúsculas; 14 caracteres; cada caractere vale `código − 48` (então letras valem ≥ 17); pesos do 1º dígito `5,4,3,2,9,8,7,6,5,4,3,2`, do 2º `6,5,4,3,2,9,8,7,6,5,4,3,2`; resto de módulo 11 (`< 2` → 0, senão `11 − resto`); os dois últimos caracteres precisam ser **dígitos** e iguais aos calculados. **Não** rejeita dígitos repetidos (`00.000.000/0000-00` é válido).
- **E-mail:** `^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-zA-Z]{2,6}(?:\.[a-zA-Z]{2})?)$`.
- **Data:** `dd/mm/aaaa`, e o `Date` construído precisa ter exatamente o mesmo dia, mês e ano (rejeita 31/02).

## A8. Variáveis `{$nome}`

Regex `\{\$[a-zA-Z_0-9]*\}`; o nome é comparado em minúsculas.

| Nome | Valor |
|---|---|
| `name_pref_agent`, `pref_agent` | `contato.nomeAgentePref` / `contato.agentePref` (vazio se ausente) |
| `sys_conversation`, `sys_attendance`, `sys_protocol`, `sys_agent` | `1001`, `2001`, `3001`, `0` (valores de teste fixos) |
| `sender`, `source`, `contact_number` | `contato.remetente` |
| `contact`, `contact_name` | `contato.nome` |
| `contact_first_name` | primeira palavra do nome |
| `contact_last_name` | resto do nome; se for uma palavra só, ela mesma |
| `contact_observations`, `email_subject`, `uci` | campos de `contato` (vazio se ausente) |
| `old_attendance` | `extra.agent_last_att` |
| `entrance_type`, `entrance` | `externas.entrance_type` / `externas.entrance` |
| `message_escaped` | **última mensagem do lote atual**, sem tags e sem espaços das pontas, escapada para JSON (aspas e barras com `\`, sem as aspas externas). Em rodada automática (lote vazio) vale **vazio**. |
| qualquer outro | `extra[nome]`, ou vazio |

## A9. Ações

Ordem: por `ID`. Cada ação registra no trace uma linha `{id, tipo, nome, efeito}` (texto humano).

| Tipo | Efeito no teste |
|---|---|
| 1 Mensagem | Evento do bot (texto), `message_text` com variáveis trocadas. |
| 10 Mensagem Options | Evento do bot (menu): `parseMenuModel` do JSON (variáveis trocadas antes) e `extrairItensMenu`. |
| 11 Mensagem Form | Evento de texto `[formulário enviado]`. |
| 2 Troca Estado | `estado = trim(trocarVariaveis(destiny))`. Vale na **próxima rodada**. Se o estado não existe: evento de erro "…aponta para o estado "N", que não existe: o bot fica parado." Mesmo assim `estado` **passa a valer N** (o número inexistente); na próxima mensagem a rodada registra o evento de erro "O bot está no estado N, que não existe. Nada acontece." (e repete a cada mensagem). |
| 4, 5 Transferir | Evento de sistema ("Transferido para o agente/fila X. Fim do bot nesta conversa."); `status = 'encerrada'`. As ações seguintes **da mesma transição ainda rodam**. |
| 6 Finalizar | Evento de sistema; `status = 'encerrada'`. |
| 7 Script | Se `externas['script:<ID>']` tiver JSON: gravar cada chave em `extra['<ID>_<chave>']` (valores como texto). Se não tiver: aviso "não foi executado… Informe o retorno em Contexto". JSON inválido: aviso. |
| 8 Contador de erros | `"add"`: `erros += 1`; `"reset"`: `erros = 0`. |
| 13 Armazenar variável | `JSON.parse(trocarVariaveis(bot_variables_text))`; cada chave em `extra` (objetos viram texto JSON). JSON inválido: aviso e **nada** é gravado. |
| 17 Enviar anexo | Evento de arquivo ("Arquivo (ID n)"). |
| 18, 20, 22 | Pausa (A10). A 20 também envia o evento de áudio com `message_content`. |
| 9, 12, 14, 15, 16, 19, 21 | Apenas registradas ("Registrado (sem efeito no teste)"). |
| outras | Aviso "não é reproduzida pelo simulador". |

## A10. Pausas e retomadas

| Situação | Status | Como retoma |
|---|---|---|
| Ações 18/20/22 | `aguardando`; `sessao.pausa = {acaoId, tipo, nome, callback, fallback, assistente}` | `responderCallback` |
| Falta dado externo | `aguardando-contexto` | `definirExterna` + `continuar` |
| Parada atingida | `encerrada`, `motivoFim = 'parada'` | `continuarDaParada` |
| Transferência/finalização/timeout de saída | `encerrada` | só reiniciar |

Em `aguardando` ou `aguardando-contexto`, `enviarMensagem` **não** processa: gera aviso pedindo para responder antes.

**`responderCallback({ok, status, texto})`** (só em `aguardando`):
- Tipo 18: gravar `extra.assistant_id = pausa.assistente`, `extra.assistant_analysis_status = status || (ok ? 'success' : 'error')`, `extra.assistant_analysis_text = texto`.
- Tipo 22: `extra.automate_status = ok ? 'success' : 'error'`, `extra.automate_message = texto`.
- Destino: `ok` → `callback_state`; falha → `fallback_state` (ou o `callback_state` se não houver fallback). Evento de sistema "Callback com sucesso/falha: vai para o estado N" (ou "sem estado de destino configurado").
- Atualizar `estado`, `caminho`, `visitas`; verificar parada; `status = 'ativa'`; rodar o laço com lote vazio.

**`simularTimeout`** (ignora se `encerrada`): conforme `TIMEOUT_ACTION` do bot:
- `queue`: evento de sistema, `encerrada`.
- `close`: se há `TIMEOUT_MESSAGE`, evento de texto do bot; evento de sistema; `encerrada`.
- `bot`: `estado = TIMEOUT_DESTINY`; limpar pausas (`aguardando` e `aguardando-contexto` voltam a `ativa`, zerando `pausa`, `requisitos`, `pendentes`); atualizar caminho e visitas; verificar parada; laço com lote vazio.
- vazio: aviso "não tem ação de timeout configurada".

## A11. Começar no meio e parar

- `inicio`: o `estado` e o primeiro item de `caminho`/`visitas` são ele. O estado inicial **não** dispara a parada.
- `parada`: depois de qualquer troca de estado (rodada, callback, timeout), se `estado === parada` e a sessão não estiver já `encerrada`: `status = 'encerrada'`, `motivoFim = 'parada'`, evento "Chegou ao estado N, o ponto de parada do teste. O bot ainda não rodou nele." As ações restantes da transição que chegou lá **já rodaram**.
- `continuarDaParada`: `parada = null`; se `sessao.pausa` existir (a mesma transição pausou o bot), volta a `aguardando` e **não** processa; senão `ativa` e roda o laço com lote vazio.

## A12. Dados para a tela

### `eventos` (a conversa)

| `tipo` | Campos |
|---|---|
| `cliente` | `texto` (o que o motor recebeu), `exibir` (o que o cliente vê; difere do `texto` quando tocou num botão) |
| `bot` com `subtipo: 'texto'` | `texto` |
| `bot` com `subtipo: 'menu'` | `modelo` (resultado de `parseMenuModel`), `itens` (`[{id, title, description}]`) |
| `bot` com `subtipo: 'arquivo'` ou `'audio'` | `texto` |
| `sistema` | `texto`, `nivel`: `'info'`, `'aviso'` ou `'erro'` |

### `rodadas` (o trace)

```js
{ n, estado, mensagens: [textos], estadoDepois, disparada: ID|null, avisos: [textos únicos],
  tentativas: [ { transicaoId, prioridade, aprovada: bool,
                  condicoes: [ { id, descricao, resultado: true|false|null, motivo, avisos? } ] } ],
  acoes: [ { id, tipo, nome, efeito } ] }
```

`resultado: null` = faltou dado (motivo "Falta: <pergunta>"). `motivo` é `"verdadeira"` ou `"falsa"` nos demais.

### `descricao` de uma condição

`<rótulo da variável> <operador> "<valor>"`:
- rótulo: dicionário de variáveis (contrato 2.1) ou o próprio nome;
- operador: para `error_count`, o dicionário de contagem; para texto/contato, o dicionário de operadores (`sempre` se tipo 0, `tipo N` se desconhecido); para variáveis de cadastro, `nomeDoCadastro(variavel, tipo)`;
- valor: o `value` com quebras de linha trocadas por ` / `; omitido se vazio.

### `requisitosDeContexto(bot)`

Lista (sem repetir `chave`) de `{chave, rotulo, tipo}` com tudo que o bot consulta de fora: uma entrada por calendário, fila e agente usados; `opt_in`, `uci`, `status_last_att`, `entrance_type`, `entrance`, `sender`, `contact_number`; `condicao:<ID>` para operadores de contato não simulados e para `old_attendance`, `agent_last_att`, `pref_agent`, `name_pref_agent`; `script:<ID>` (tipo `json`) para cada script usado. Operadores **por mensagem** (16, 17, 22, 23, 24) **não** entram (são perguntados por rodada).

### `variaveisUsadas(bot)`

Nomes ordenados de: `{$x}` encontrados em qualquer texto de ação e no `value` de condições, mais variáveis de condição que não sejam do motor nem `assistant_analysis_*` (as `automate_*` entram). Excluir os nomes do motor: `name_pref_agent`, `pref_agent`, `sys_*`, `sender`, `source`, `contact_number`, `contact`, `contact_name`, `contact_first_name`, `contact_last_name`, `contact_observations`, `email_subject`, `uci`, `old_attendance`, `entrance_type`, `entrance`, `message_escaped`, `message`, `error_count`.

## A13. Limitações que o teste declara

Não reproduz: atraso de digitação; tempo real; retorno real de script, IA e automação; dados do banco; anexos e áudio recebidos do cliente; labels do contato; VIP; e `agent_on_queue` como contagem. Isto precisa estar visível para quem usa (aba Contexto, textos de pausa).

---

# PARTE B · A tela

Arquivo de referência: `js/teste-bot.js`. A janela é criada **por JavaScript** dentro de `#bot-view-overlay` (não faz parte do HTML estático).

## B1. Abertura e fechamento

- **Botão** com ícone `bot-message-square`, título "Testar o bot (simula uma conversa, sem salvar)", inserido no cabeçalho do editor **antes** do botão de busca (ou antes do de fechar). Ordem final no cabeçalho: tema, **testar**, buscar, fechar (as margens automáticas dos vizinhos precisam ser zeradas para não abrir espaço).
- **Abrir:** cria a janela na primeira vez; sempre começa uma sessão nova no tamanho normal, na aba Conversa, com o foco no campo de texto. Se o ponto de partida guardado for de **outro bot** (comparar `ID` do bot), zerar tudo (estado `0`, sem parada, sem variáveis, erros 0); se o estado de início ou de parada guardado não existir mais, voltar ao padrão.
- **Fechar** (X, Esc, clique no fundo, ou fechar o editor): esconde a janela, desliga o modo minimizado e **remove todas as marcas do editor**. Fechar o editor (classe `hidden` em `#bot-view-overlay`) fecha o teste junto.
- **Clique no fundo** só fecha se o clique **começou** no fundo (selecionar texto e soltar fora não fecha).
- **Esc:** com a janela normal, fecha o teste. **Minimizado, devolve `false`** (o Esc é do editor).

## B2. Janela normal (layout)

Largura máx. 1120 px, altura `min(740px, 92vh)`, centralizada, com véu escuro. Tudo em **px**.

- **Topo:** título "Testar bot"; aviso "O bot mudou depois do início do teste: reinicie para valer" (visível só quando o bot mudou, B10); botões **Reiniciar**, **Timeout**, **Ver no editor**, **Ampliar** (só no minimizado) e **X**.
- **Coluna esquerda (270 px): "Estados"** (B6).
- **Coluna direita:**
  1. Faixa **Caminho**: chips com os números do `caminho` ligados por setas; o último destacado; mais de 14 → `…` + últimos 13.
  2. Abas **Conversa | Detalhes | Contexto**.
  3. Conteúdo da aba.
- Abaixo de 760 px de largura: uma coluna e a lista de estados some.

## B3. Aba Conversa

- **Bolhas:** cliente à direita (cor primária), bot à esquerda (superfície), sistema centralizado e pequeno (`aviso` com cores de alerta, `erro` com cores de bloqueio). Quebras de linha do texto do bot viram `<br>`. Arquivo mostra `📎 `, áudio `🔊 ` antes do texto.
- **Cliente que tocou num botão:** a bolha mostra o título, e abaixo, em letra pequena, "enviou o ID `<id>`". Se `exibir === texto`, sem a anotação.
- **Menu:** bolha do bot com cabeçalho (negrito), corpo, rodapé (pequeno, cinza) e, para lista do WhatsApp, o texto do botão da lista; abaixo, **um chip clicável por item**, com a descrição em letra menor se houver. Tocar no chip envia o item como mensagem do cliente: **o `id`** (ou o título se o id for vazio). Menu de formato desconhecido: bolha "Menu em formato não reconhecido". Menus antigos continuam clicáveis.
- **WebChat:** o que o chip envia é configurável na aba Contexto (B5): `value` (padrão) ou o texto da opção.
- **Rolagem:** descer ao fim a cada atualização, exceto se a pessoa tiver rolado para cima (considerar "no fim" a até 30 px do final).
- **Campo de texto + botão Enviar:**
  - Enviar fica **desligado** quando o campo está vazio ou só com espaços (atualizar a cada tecla).
  - Enter envia (campo de uma linha, dentro de um formulário).
  - O texto enviado tem os espaços das pontas removidos; **mensagem vazia nunca é enviada** (como no WhatsApp).
  - O campo e o botão ficam desabilitados quando `status !== 'ativa'`.
  - Depois de enviar, o foco volta ao campo.
- **Faixa de estado (banner) acima do campo**, conforme o status:

| Status | Banner |
|---|---|
| `aguardando` (18/20/22) | "**<nome da ação>**: o bot espera o retorno." Para 18 e 22, um campo de texto ("Resposta da IA + Enter (sucesso)" / "Mensagem devolvida + Enter (sucesso)"): **Enter com texto** responde callback com sucesso e esse texto; Enter vazio não faz nada. Botões **Callback: sucesso** / **Callback: falha** (usam o texto digitado, se houver). |
| `aguardando-contexto` | "**Falta um dado para continuar:** <pergunta>". Se o dado tiver escolhas predefinidas (B5.4): **um botão por opção**; senão um campo de texto (Enter ou botão **Continuar** — este começa desligado e só liga com texto). |
| `encerrada` por parada | "**Parou no estado N**, o ponto de parada do teste. O bot ainda não rodou nele." Botões **Continuar daqui** e **Reiniciar**. |
| `encerrada` (outros) | "**Conversa encerrada.** O bot não responde mais nesta conversa." Botão **Reiniciar**. |

Qualquer resposta ao banner redesenha a tela e zera a "rodada escolhida" (B9).

## B4. Aba Detalhes

Mostra o trace **da rodada mais nova para a mais antiga**. Sem rodadas: "Nada avaliado ainda. Envie uma mensagem na aba Conversa."

Cada rodada é um cartão:
- Título: `Rodada N · estado E` (e ` → D` se mudou de estado) + botão pequeno **Ver no editor**.
- Linha: `Cliente: “msg1”, “msg2”` ou "Sem mensagem nova do cliente (rodada automática)".
- Uma caixa por transição tentada: cabeçalho `Transição <prioridade>` + **disparou** (negrito) ou *não casou* (cinza) + botão **Ver no editor** da transição. Caixa da que disparou com borda verde. Dentro, uma linha por condição: ícone `✓` verde, `✗` vermelho ou `?` laranja, a `descricao` e o `motivo` em letra menor. Sem condições: "✓ sem condições (sempre)".
- Estado sem transições: "Este estado não tem transições."
- Lista de ações executadas: `<nome>: <efeito>`.
- Um quadro de aviso por texto de `avisos` da rodada.

## B5. Aba Contexto

Quatro blocos, nesta ordem:

**B5.1 Cliente:** campos de texto "Nome ({$contact}, {$contact_first_name})" e "Número ou e-mail ({$sender})"; alteram `contexto.contato` ao sair do campo.

**B5.2 Menu do WebChat:** dois botões de escolha — "O value da opção (ID)" (padrão) e "O texto da opção" — com a nota: *Não confirmado no código da Orpen. Confira num WebChat real e escolha como ele se comporta. No WhatsApp o bot sempre recebe o ID do botão.* Mudar redesenha a conversa (os chips passam a enviar o outro valor).

**B5.3 Ponto de partida** (vale quando a conversa é **reiniciada**):
- Texto de ajuda sobre ▶ e ⚑.
- Campo numérico **Contador de erros** (inteiro ≥ 0; valor inválido vira 0).
- Um campo por variável de `variaveisUsadas(bot)`: rótulo `Variável {$nome}`; vazio remove a variável.
- Botão **Aplicar e reiniciar**: reinicia **e troca para a aba Conversa**.

**B5.4 O que este bot consulta:** um item por entrada de `requisitosDeContexto(bot)`:
- **Escolhas predefinidas viram botões** (grupo de botões; o escolhido fica destacado; **clicar de novo no escolhido desmarca**, voltando a "perguntar quando precisar"):
  - tipo `bool` → **Sim / Não**;
  - `entrance_type` → WhatsApp, E-mail, Facebook, Webchat, Instagram, Telegram (valores 1, 2, 3, 6, 7, 8);
  - `status_last_att` → lista de `opcoesCrmStatus()`, **se houver**;
  - `entrance` → lista de `opcoesEntradasCondicao()`, **se houver**.
- Sem lista (ambiente ausente) ou texto livre (`sender`, `contact_number`): campo de texto, gravado ao sair do campo.
- Tipo `json` (retorno de script): área de texto de 3 linhas.
- Vazio: "Este bot não consulta nada fora dele."
- A aba **não é redesenhada enquanto há foco dentro dela** (para não perder o que a pessoa digita).

## B6. Lista de estados (coluna esquerda)

Um item por estado, ordenado por número (um número de estado não numérico conta como 0 na ordenação). Cada item: número (selo laranja), nome (com reticências), e à direita:

| Elemento | Quando aparece |
|---|---|
| Selo **aqui** | Estado atual com sessão `ativa`. Trocas: **espera** (`aguardando`), **parou** (parada), **fim** (encerrada). |
| `✓` verde, ou `×N` se N>1 | Estado já visitado e que não é o atual. |
| Etiqueta **início** | Estado de início, se ≠ 0. |
| Etiqueta **parada** | Só enquanto a parada daquela sessão está valendo (some após **Continuar daqui**). |
| Botões **▶** e **⚑** | Ao passar o mouse ou receber foco do teclado; ficam sempre visíveis quando ativos. |

Aparência: não visitado = apagado; visitado = destacado; atual = contorno e fundo da cor de destaque. O item atual rola para ficar visível (apenas dentro da lista).

- **▶ "Começar o teste neste estado"**: define o estado de início e **reinicia**.
- **⚑ "Parar o teste ao chegar neste estado"**: marca/desmarca a parada (só uma) e **reinicia**. Depois de "Continuar daqui" a etiqueta *parada* some e a conversa segue sem parar nesta sessão; o ⚑ da lista continua marcado e vale de novo a cada reinício.
- Depois de ▶ ou ⚑ o foco do teclado volta ao mesmo botão (a lista é refeita).
- **Clicar na linha** (fora dos botões): "Ver no editor" (B9).

## B7. Modo minimizado

Botão **Ver no editor** (topo) → modo minimizado; botão **Ampliar** volta.

- O véu some e o overlay **deixa passar cliques**; só o painel os recebe.
- O painel vira um mini-chat de 400 px de largura e até `min(480px, 70vh)` de altura, **no canto inferior direito, acima do rodapé do editor** (deixar ~92 px livres embaixo para não cobrir Salvar/Baixar).
- Mostrados: topo (título, aviso de bot alterado, Reiniciar, Ampliar, X), faixa Caminho, **Conversa** (bolhas, banner, campo). **Escondidos:** lista de estados, abas, Timeout, "Ver no editor".
- Aparece **sempre** a conversa, mesmo que a aba ativa fosse outra.
- Com o **Localizar aberto** (classe `busca-aberta` no editor), o mini-chat passa para o canto **esquerdo**.
- O **Ctrl+F** é bloqueado com a janela normal aberta e **liberado** minimizada.

## B8. Marcas no editor

Só existem com o teste aberto (normal ou minimizado) e são **classes CSS** sobre o DOM do editor; **nunca** alteram o bot. Calculadas por `marcarNoEditor`:

1. Limpar todas as classes `sim-*` dentro de `#bv-estados`.
2. `sim-visitado` em cada `.estado-wrap` cujo número está em `visitas`.
3. `sim-atual` no estado atual. Visual: contorno de destaque e o texto "· teste: aqui" acrescentado ao resumo ("3 transições · teste: aqui").
4. Da **rodada mostrada** (a última, ou a escolhida em "Ver no editor"): para cada transição tentada, `sim-disparou` (marca lateral verde) se aprovada, `sim-falhou` (marca lateral cinza) senão; para cada condição avaliada, no `.condicao-item` que contém `[data-condition-id=<id>]`: `sim-ok` (verde), `sim-nao` (vermelho) ou `sim-talvez` (laranja) para `resultado` `true`, `false` ou `null`.
5. Abrir o card do estado atual (remover `hidden` do `.estado-body`, adicionar `estado-expandido`, `rotate-180` no chevron) e rolar até ele (`scrollIntoView`, topo, suave) **somente quando** (a) a pessoa pediu (botões "Ver no editor"), ou (b) o teste está **minimizado** e o estado atual **mudou** desde a última vez. **Nunca** abrir cards com a janela normal, nem reabrir um card que a pessoa recolheu.

**Reaplicar:** observar `childList` de `#bv-estados` (com atraso de 120 ms): quando o editor refaz a lista, as marcas são recalculadas. Esse observer só age com o teste aberto; as marcas não podem modificar a estrutura (só classes), para não gerar laço.

Seletores com números de estado ou IDs devem usar `CSS.escape`.

## B9. "Ver no editor"

Pontos de entrada: botão **Ver no editor** do topo; botão em cada **rodada** e em cada **transição** (aba Detalhes); clique na **linha de um estado**.

Efeito: minimiza; define a "rodada mostrada" (a da rodada/transição clicada; `null` = a última); recalcula as marcas; abre o card do estado; rola até a transição (centralizada) ou até o estado (topo); pisca o elemento (`bs-alvo`, 1,6 s). A "rodada mostrada" volta a ser a última quando: o cliente envia mensagem, responde-se um banner, ocorre callback, timeout, "continuar da parada" ou reinício.

## B10. Reiniciar, aviso de bot alterado e ciclo de vida

- **Reiniciar:** nova sessão com o ponto de partida atual. **Mantém:** respostas de contexto e dados do cliente; **descarta** respostas por rodada (chaves terminadas em `:r<N>`). Troca para a aba Conversa. A mensagem inicial resume o ponto de partida: "Conversa nova no estado 0 (HOME)." ou "Teste começando no meio do fluxo, no estado N (NOME).", mais "Com N variável(is) já guardada(s).", "Contador de erros em N.", "O teste para ao chegar no estado P." e "Escreva como o cliente."
- **Aviso "O bot mudou…":** guardar uma assinatura (JSON dos quatro arrays + `TIMEOUT_ACTION/DESTINY/MESSAGE`) ao iniciar; comparar a cada redesenho **e** a cada `input`/`change` no editor. Visível também minimizado, em tamanho reduzido. O teste continua rodando na foto antiga: é só um aviso.
- **Timeout:** botão do topo; aplica `simularTimeout`.

## B11. Resumo: o que a tela habilita em cada status

| Status | Campo/Enviar | Banner | Botões extras |
|---|---|---|---|
| `ativa` | ligado (se há texto) | — | Timeout |
| `aguardando` | desligado | Callback | Timeout |
| `aguardando-contexto` | desligado | Pergunta | Timeout (descarta a pergunta) |
| `encerrada` (parada) | desligado | Continuar daqui / Reiniciar | — |
| `encerrada` (fim) | desligado | Reiniciar | — |

---

# PARTE C · Critérios de aceitação

Cada item deve virar um teste automatizado do simulador (Node, sem DOM), salvo os marcados **[UI]**. Os testes de referência estão em `tests/editor/simulador.test.mjs` (a numeração destes critérios não coincide com os nomes dos testes; procure pelo assunto).

## C1. Rodada e laço
1. Duas transições no estado com a mesma condição: dispara a de **menor `PRIORITY`**, uma só.
2. Duas condições (AND): se a segunda é falsa, a transição não dispara e o trace mostra a 1ª `true` e a 2ª `false`; uma terceira, se existisse, não aparece.
3. Nenhuma transição casa: nada é enviado; **a mesma mensagem não é reavaliada** depois que o estado mudar.
4. Estado 0 com `message = oi` → troca para 1; estado 1 sem condições → mensagem e troca para 2; estado 2 com condição de mensagem: a conversa **para no 2** e o caminho é `0,1,2`, com 3 rodadas no trace.
5. Estado 1 tem `message = oi` e o cliente já disse "oi" no estado 0: o estado 1 **não** dispara sozinho (o lote foi consumido).
6. Transição sem condição que não troca de estado: o laço para em **25** rodadas e gera o aviso de erro.

## C2. Operadores de texto
7. Igual a com valor `Sim\nclaro\n7`: `sim` não casa; `claro` casa; `007` casa (igualdade numérica); `Sim` casa.
8. Contém `horario` casa em "qual o HORARIO?"; Contém `OLÁ` **não** casa em "olá"; valor vazio casa com qualquer texto.
9. Contém `oi\n` (linha vazia no fim): "xyz" **não** casa; "oi gente" casa. Idem `oi\n\ntchau`.
10. Diferente de e Não contém: **nunca** casam e o trace traz o aviso.
11. Mensagem `a&b` contra Igual a `a&b`: **não** casa.
12. Mensagem `0` contra Igual a `0`: **não** casa; contra Contém `0`: não casa, mas `10` casa; contra É número: não casa; `5` casa.
13. Igual a com valor `1 ` (espaço no fim): mensagem `1` **não** casa; mensagem `1 ` casa.
14. CPF: `123.456.789-09` **não** passa; `529.982.247-25` passa.
15. CNPJ: `00.000.000/0000-00` passa; `12.345.678/0001-95` passa; `12.345.678/0001-96` não.
16. Remetente: Igual a diferencia maiúsculas e faz `trim` do valor; Contém ignora maiúsculas ASCII; tipo 5 é falso; `{$x}` no valor **não** é trocado.

## C3. Variáveis e ações
17. `{$contact_first_name}` com nome "Maria Silva" → "Maria"; `{$message_escaped}` com `a"b` → `a\"b`.
18. `{$message_escaped}` em rodada automática (sem mensagem) → vazio.
19. Ação 13 grava; condição sobre a variável gravada usa os mesmos operadores; JSON inválido não grava nada e avisa.
20. Ação 8: duas somas e depois `error_count = 2` verdadeira; `{$error_count}` no texto mostra "2" depois que a condição de `error_count` foi avaliada.
21. Ação 2 para estado inexistente: evento de erro; o bot fica parado.
22. Ações 4/5/6 encerram a sessão, mas as ações seguintes da mesma transição ainda rodam.
23. Menu de botões: o evento traz os itens com `id` e `title`; tocar envia o **id**. Idem lista do WhatsApp (`l1`, `l2`) e WebChat (`value`).

## C4. Contexto e pausas
24. Condição `calendario` sem resposta: sessão em `aguardando-contexto`, **nada enviado**, pergunta com o **nome** do calendário se houver cadastro (senão "Calendário ID 227"). Responder `sim` e `continuar` dispara a transição; `nao` cai na seguinte.
25. Condição de tipo 0 (`error_count` com tipo 0, ou `calendario` com tipo vazio) é **descartada** na foto: a transição vale sempre e **não pergunta**.
26. Operador por mensagem (É áudio): sem mensagem no lote é falso sem perguntar; com mensagem pergunta, e a resposta vale **só nessa rodada** (a mensagem seguinte pergunta de novo, com outra chave `:rN`).
27. Operador de contato (É Vip) pergunta uma vez e a resposta persiste.
28. Ação 18: `aguardando`; `enviarMensagem` nesse estado só gera aviso; `responderCallback({ok:true})` vai para o `callback_state` e a transição de lá, se existir, roda (condição de `assistant_analysis_status` = `success` fica verdadeira).
29. Timeout `bot` com a sessão em `aguardando-contexto`: sessão volta a `ativa`, `requisitos` vazios, estado trocado (a tela não pode ficar sem requisito).
30. Timeout `queue` e `close` encerram; `close` com mensagem a envia.

## C5. Começar no meio e parar
31. `inicio: '2'`: mensagem do estado 0 não casa; a do estado 2 casa; `caminho` começa em `['2']`. Início inexistente → `encerrada` com erro.
32. `variaveis` e `erros` iniciais alimentam condições e textos desde a primeira mensagem; sem eles, a condição não casa.
33. `parada: '2'`: ao chegar no 2 a sessão fica `encerrada` com `motivoFim 'parada'`, as ações da transição que chegou lá rodaram, e novas mensagens não fazem nada.
34. `continuarDaParada`: a parada some e a conversa segue do estado de parada. Se a mesma transição pausou o bot (ação 18), volta a `aguardando` com o callback pendente.
35. A parada vale também por callback e por timeout. `inicio === parada` **não** para antes de rodar.
36. `variaveisUsadas` devolve `{$x}` dos textos e variáveis de condição não-motor, incluindo `automate_status`, sem os nomes do motor.

## C6. Integridade
37. O bot original **nunca** muda (comparar JSON antes e depois de uma conversa completa).
38. Rodar `criarSessao` e uma conversa de 5 mensagens em **cada** um dos bots de exemplo (`fluxograma/tests/fixtures/*.json`), respondendo pedidos de contexto automaticamente: sem exceção, e os únicos eventos de erro permitidos são os de "não existe" ou "a cada segundo".
39. A ordem de execução das ações no teste é a mesma do payload salvo, inclusive depois de mover uma ação.

## C7. Tela [UI]
40. **[UI]** Enviar desligado com campo vazio ou só com espaços; Enter com espaços não envia; texto é enviado sem as pontas.
41. **[UI]** Enter no campo de resposta da IA responde callback com sucesso; Enter vazio não.
42. **[UI]** Escolhas Sim/Não e opções de entrada aparecem como botões; clicar de novo no escolhido desmarca.
43. **[UI]** ▶ reinicia no estado; ⚑ marca/desmarca a parada; o foco volta ao botão; "Continuar daqui" faz a etiqueta "parada" sumir.
44. **[UI]** Minimizado: o botão Salvar do editor continua clicável (o painel termina acima dele); Esc não fecha o teste; fechar o editor fecha o teste e remove as marcas.
45. **[UI]** Marcas: depois de "oi" e "suporte" num bot de exemplo, o estado atual tem `sim-atual`, os visitados `sim-visitado`, e as condições da última rodada ganham `sim-ok`/`sim-nao`; um re-render do editor reaplica as marcas **sem reabrir** um card recolhido.
46. **[UI]** Com o Localizar aberto, o mini-chat passa para a esquerda; Ctrl+F funciona minimizado e é bloqueado com a janela normal.
47. **[UI]** Em modo avulso (sem ambiente), nenhuma tela quebra: os nomes viram `ID n`.
48. **[UI]** Nenhum texto do bot, do cliente ou do ambiente entra em `innerHTML` sem `escapeHtml`, inclusive em `data-*` (testar um nome de estado com `"<img onerror=...>`).

---

# PARTE D · Riscos e decisões em aberto

| Item | Situação |
|---|---|
| WebChat: `value` ou texto ao clicar numa opção | Não confirmado. Configurável. Quando for confirmado, remover a opção e fixar o comportamento. |
| `strtoupper` com acentos | Reproduz o PHP 5.6 (só ASCII). Se a Orpen subir de versão de PHP, **revisar** A6 (Contém) e `MAIUSCULA_ASCII`. |
| Diferente de / Não contém sempre falsos | Defeito do motor, hoje reproduzido. **Se a Orpen corrigir**, mudar A6 (3 e 4) para a semântica correta. |
| `message_text ?: watson_sentiment` | A mensagem `0` e a vazia viram candidata vazia. Se a Orpen mudar a leitura, revisar A6. |
| Operadores não simulados (VIP, labels, story, anexo, áudio, forma de contato) | Perguntam "é verdadeira?". Simulá-los de verdade exige eventos de anexo/áudio no chat (evolução). |
| Marcas depois de reordenar estados | As marcas usam o número do estado e os IDs da foto; renumerar estados com o teste minimizado desalinha as marcas até reiniciar. O aviso "O bot mudou" cobre isso. |
| Salvar com o teste aberto | O servidor refaz os IDs; as marcas de transição e condição somem até a próxima mensagem. |
| Fluxograma com o caminho do teste | **Decisão: não fazer.** |
