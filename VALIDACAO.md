# Validação da extensão EDITOR_BOT

Roteiro do que precisa ser validado para a extensão ser segura, o que já foi validado e os débitos conhecidos. É o documento de trabalho: cada etapa validada é marcada aqui, com a evidência e a versão.

**Regra fixa:** o código da Orpen (`C:\Users\RCX\Desktop\Code\Orpen`) é só leitura. Toda correção fica na extensão; o que só se resolve na Orpen vai para os débitos do servidor (seção D1).

Legenda: ✅ validado · ⚠️ validado com ressalva · ⬜ pendente

Última atualização: 29/09/2026, v0.8.9 publicada (testada no navegador pelo usuário).

---

## Como validar cada versão

Antes de publicar (`git push origin main:release`):

1. **Validador** (agente `validador`): sintaxe de `js/*.js` e `content/bootstrap.js`, testes do editor (`node --test "tests/editor/*.test.mjs"`), testes do fluxograma (`fluxograma/`, `npx vitest run`), versão do `manifest.json` igual ao topo do `CHANGELOG.md`.
2. **Revisor** (agente `revisor`): revisão do diff da versão. Só entra o que tem cenário concreto.
3. **Testes do editor** (`tests/editor/`): ida e volta do salvamento com um servidor Orpen simulado a partir do código real, nos bots do git e, se estiverem na máquina, nos bots reais de `fluxograma/tests/golden_local/fixtures/`; renumeração com as funções reais do editor; travas do Salvar.
4. **Teste manual no navegador** (↻ na extensão, F5 na `bot.php`), com o roteiro da seção 10.
5. CHANGELOG, `manifest.json` e `.project/log.md` atualizados; branch → merge `--no-ff` na `main` → push `main` e `main:release`.

---

## 1. Salvamento no servidor (contrato com a Orpen)

| # | Item | Status | Evidência |
|---|---|---|---|
| 1.1 | O `updateBot` com `actionForm=edit` sobrescreve o bot existente | ✅ | `ajax.php:2900-2940` |
| 1.2 | `Bot::update` grava pela metade e responde `success` quando um INSERT falha | ✅ confirmado | `Bot.class.php:199-264` e `Database.class.php:159-221` (`queryWithVariables` não lança erro). Contornado na extensão pelo item 1.3; a causa está em D1.1 |
| 1.3 | Depois de salvar, a extensão relê o bot (`getBot`) e compara com o que enviou | ✅ v0.8.6 | `conferirGravacao` em `js/orpen-bridge.js`. Ida e volta com 7 bots reais sem falso alarme; ação perdida detectada |
| 1.4 | Falha de rede, erro HTTP ou resposta fora de JSON passam pela conferência | ✅ v0.8.6 | Teste manual com a rede em Offline no DevTools |
| 1.5 | Condição ou ação com tipo 0 é ignorada pelo servidor e isso é avisado ao salvar | ✅ v0.8.6 | `Bot.class.php:227, 240` |
| 1.6 | O servidor não altera o texto recebido (não há escape global no POST) | ✅ | `classes/Security.inc.php` |
| 1.7 | O Oracle não expõe ao motor um bot pela metade durante o salvamento (sem commit, vale a versão anterior) | ✅ | `OCI_NO_AUTO_COMMIT` em `Database.class.php:198`; `commit` só no fim do `update` |
| 1.8 | Limite `max_input_vars` do PHP | ⚠️ risco aberto | O bot grande das fixtures envia 2.255 campos, e o padrão do PHP é 1.000. Não está no repositório da Orpen. A conferência detecta o corte, mas não evita o estrago (D1.2) |
| 1.9 | Bot excluído por outra pessoa enquanto estava aberto | ⚠️ risco aberto | O `updateBot` cria um bot novo com esse número em vez de dar erro (`ajax.php:2908-2909`, D1.3) |

## 2. Status de salvamento e fechamento do editor

| # | Item | Status | Evidência |
|---|---|---|---|
| 2.1 | Criação de bot pela extensão removida: bot novo só pelo modal nativo | ✅ v0.8.5 | `content/bootstrap.js` não intercepta mais o "Adicionar" |
| 2.2 | Um salvamento que termina depois de trocar de bot não afeta o bot aberto | ✅ v0.8.5 | `salvarBotNaOrpen` confere `state.botCarregado !== bot` |
| 2.3 | X, clique fora e Esc perguntam antes de fechar quando há alteração não salva | ✅ v0.8.6 | `confirmarFechar`; teste manual ok |
| 2.4 | "Descartar" não pode ser gravado depois ao abrir outro bot | ✅ v0.8.6 | O bot anterior sai da memória no início do carregamento |
| 2.5 | Edição feita durante "Salvar e fechar" não se perde | ✅ v0.8.6 | Continua aberto e avisa |
| 2.6 | Dois "Editar" seguidos: vale o último | ✅ v0.8.6 | `carregamentoAtual` |
| 2.7 | Fluxo de atualização ("Atualizar agora" → "Concluir") respeita alteração não salva | ✅ | Usa `temAlteracoesNaoSalvas` (revisão v0.8.6) |

## 3. Janelas e Esc

| # | Item | Status | Evidência |
|---|---|---|---|
| 3.1 | Esc fecha só a janela de cima, esteja o foco onde estiver | ✅ v0.8.6 | Pilha `empilharEsc` em `js/dom-root.js`; simulação e teste manual |
| 3.2 | Todo caminho de fechar tira o handler da pilha (menu, tratamento, fluxograma, Novidades, pendências, busca) | ✅ v0.8.6 | Revisão |
| 3.3 | Novidades: duplo clique não abre duas janelas | ✅ v0.8.5 | |
| 3.4 | Pendências abertas pelo "Salvar e fechar" mantêm o editor aberto | ✅ v0.8.6 | |
| 3.6 | Listas de busca separadas por tópicos | ✅ v0.8.9 | Cabeçalhos por grupo na lista (`data-grupo`); o filtro também procura pelo nome do grupo. Variável da condição (Mensagem, Contato, Atendimento, Agentes e filas, Calendário, Automação, Variáveis do bot, Scripts, Assistentes OpenAI), tipo de ação (Mensagens, Fluxo do bot, Encaminhamento, Contato e atendimento, Integrações), Transf. Agente (Agentes, Bots), entradas (por tipo), Armazenar variável (Mensagem, Variáveis do ambiente, Usadas/Gravadas neste bot) |
| 3.5 | Campos de busca com lista própria no lugar do popup nativo do `<datalist>` (escuro e fora do tema) | ✅ v0.8.9 | `js/combobox.js`: variável e operador da condição, tipo de ação, estado de destino, campos buscáveis, cadastros do ambiente e nomes/valores de variáveis. Abre ao focar com todas as opções, filtra ao digitar (sem diferenciar acento e maiúscula), setas e Enter escolhem, Esc/Tab/clique fora fecham. Não muda o que cada campo aceita: escolher só preenche e dispara `change`/`input` como antes. Em campo de texto livre, Enter sem nada digitado não troca o texto pela primeira opção |

## 4. Motor da Orpen e renumeração de estados

| # | Item | Status | Evidência |
|---|---|---|---|
| 4.1 | O motor relê o bot a cada ciclo (cache de 60 s): edições valem para quem está no meio do fluxo | ✅ confirmado | `Bot.class.php:24, 75, 2416` |
| 4.2 | O atendimento guarda só o número do estado | ✅ confirmado | `ctc_attendance.bot_state`, `Chat.class.php:2474` |
| 4.3 | Aviso ao salvar com estados renumerados ou excluídos | ✅ v0.8.7 | `confirmarRenumeracao`; teste com as funções reais do editor |
| 4.4 | Aviso destacado quando a entrada do bot (estado 0) muda | ✅ v0.8.8 | O estado 0 como entrada foi confirmado pelo usuário; não foi achado no código |
| 4.5 | Referências de fora do bot a número de estado (failover de entrada) | ⚠️ só avisado | `Chat.class.php:3977-3982`. A extensão não enxerga essas configurações |
| 4.6 | Outras referências externas a estado (outros bots, scripts, entradas) | ⬜ | Levantar com o `pesquisador-orpen` |

## 5. Travas do "Salvar" nativo

| # | Item | Status | Evidência |
|---|---|---|---|
| 5.1 | Nome com até 50 caracteres | ✅ v0.8.7 | `bot.php:4955` |
| 5.2 | JSON válido em Menu (10), Formulário (11), Variáveis (13) e no payload da Automação (22) | ✅ v0.8.7 | `bot.php:2372-2402, 2472`; bots reais e templates passam. O fixture sintético `cobertura-port.json` é bloqueado com razão: o Formulário dele tem `form_id` e não `message_option_form`, o único campo que o motor lê (`Bot.class.php:1372`) |
| 5.3 | I.A. no fluxo exige conta de transcrição de áudio | ⚠️ v0.8.7 | `bot.php:2500-2534`. Coberto por teste unitário (`tests/editor/validacao-salvar.test.mjs`), mas nenhum bot real das fixtures tem ação de I.A. |

## 6. Formato dos dados gravados (paridade com o nativo e o motor)

| # | Item | Status | Evidência |
|---|---|---|---|
| 6.1 | Campos de cada tipo de ação batem com `execute_action` | ✅ | `defaultActionData` × `bot.php:2350-2481` × `Bot.class.php:1233+` |
| 6.2 | "Atualizar contato → adicionar forma de contato" grava `phone`/`email` em minúsculas | ✅ | `Bot.class.php:1535` |
| 6.3 | Ação 21 aceita maiúsculas e minúsculas | ✅ | `strtoupper` em `Bot.class.php:1714` |
| 6.4 | Velocidade vazia da ação de áudio (20) vira 1, como no nativo | ✅ v0.8.9 | `dadosDaAcao` em `js/orpen-adapter.js` |
| 6.5 | `type` extra dentro do `data` da condição não atrapalha | ✅ | Só é lido em `assistant_analysis_text` (`Bot.class.php:622`) |
| 6.6 | Condições de I.A. (`assistant_analysis_*`) no formato do nativo | ✅ v0.8.9 | **Corrigido.** O editor gravava o operador na raiz (`CONDITION_TYPE = 'success'` ou `1`–`4`); o nativo usa raiz 1 (status) ou 2 (conteúdo) e o operador no `data` (`bot.php:2317-2337, 3691-3740`). O motor lê o `data` (`Bot.class.php:609-629`), então funcionava, mas abrir no nativo deixava o seletor em branco e um Salvar por lá descartava a condição (tipo 0). Agora a raiz é 1/2, e o payload corrige também o que já estava salvo. `tests/editor/condicoes-ia.test.mjs` |
| 6.6b | Condição e ação de I.A. com a mesma interface do nativo, sem digitar ID | ✅ v0.8.9 | **Corrigido.** Antes o editor não deixava escolher o assistente (condição criada no editor nunca era verdadeira, `Bot.class.php:612-615`). Agora, como no nativo: os assistentes vêm das contas OpenAI do `getBot` (`SETTINGS.assistants`, a mesma fonte de `bot.php:2792, 3485-3501`). **Condição:** a variável lista "[Conta] Assistente: Nome"; o operador é "Status da análise" (Sucesso/Falha) ou "Conteúdo da análise" (Igual a/Contém/Diferente de/Não contém + texto). **Ação OpenAI:** Conta (só as que têm assistentes, `bot.php:4426`) e depois o Assistente dela; trocar a conta esvazia o assistente (`bot.php:4439-4441`) |
| 6.6c | Trocar condição de I.A. para variável comum limpa os campos do assistente | ✅ v0.8.9 | **Corrigido.** O `assistant_id` ficava no `data` e a tela continuava tratando como condição de I.A. |
| 6.7 | Listas vazias: a extensão manda `""`, o nativo omite a chave | ✅ | Mesmo resultado no motor: condição 18 com `!empty` → falso (`Bot.class.php:1013`); `add-labels` com `foreach` sobre vazio não faz nada (`Bot.class.php:1516-1517`) |
| 6.7b | Condição "Possui os labels" (18) editada vira texto | ✅ v0.8.9 | **Corrigido.** Ao editar, o valor era gravado como texto `"12, 15"`; o motor faz `foreach` (`Bot.class.php:1015`) e a condição ficava sempre falsa. Agora é lista de IDs, e o payload corrige o que já estava salvo |
| 6.7c | Labels escolhidas pelo nome, como no nativo | ✅ v0.8.9 | O motor grava e compara IDs (`Bot.class.php:1015, 1518`), mas a pessoa escolhe pelo nome. O coletor busca a lista na API REST da Orpen (`/labels/listall`, com recuo para `/labels?limit=500`), como o select do nativo (`bot.php:1106-1174`). Na condição "Possui os labels" e na ação "Adicionar labels", o campo funciona como o select2 múltiplo do nativo: mostra as escolhidas com ×; clicar abre a lista das que faltam com busca; escolher adiciona e fecha; Esc ou clique fora fecham. A primeira versão usava `datalist` e não mostrava a lista (testado no navegador: não aparecia nada), por isso foi trocada. Label que não existe mais aparece como "ID N (não encontrada)". Sem a lista, volta o campo de IDs. `tests/editor/labels.test.mjs` |
| 6.8 | Ações 12 (entrances), 15 (tags) e 17 (anexo): formato do valor | ✅ | 12 → `entrances` (seletor de entradas); 15 → `message_text` com o nome da tag (`Bot.class.php:1415-1428`); 17 → `send_file` com o ID do arquivo no armazenamento da Orpen (`Bot.class.php:1562-1568`). Rótulos da tela coerentes |
| 6.8b | Nenhum campo pede ID quando o ambiente tem a lista | ✅ v0.8.9 | Varredura dos campos da tela. Único que pedia ID mesmo na Orpen: **"Enviar anexo" (17)**, agora com a lista de anexos do bot como no nativo (`${BASE_URL_API}/bot/bot-attachment`, rótulo "imagem/vídeo/áudio - Título", `bot.php:4348-4386`). Os demais "(ID)" só aparecem sem a lista do ambiente (modo avulso ou API fora): filas, agentes, bots, status, substatus, entradas, scripts, checkpoints, calendários, contas, labels, assistentes e anexos são listas na página da Orpen |
| 6.8c | Ação "Enviar mensagem de áudio" (20) com as opções do nativo | ✅ v0.8.9 | **Corrigido.** Faltavam voz, idioma, ouvir e modelo. Agora igual a `bot.php:4521-4583`: voz (alloy, echo, fable, nova, onyx, shimmer) agrupada por idioma (Português/Inglês/Espanhol) com botão ▶ que toca `/rcx/ContactCenter/sounds/open_ai/<pt\|us\|es>/<voz>.mp3`; modelo TTS-1/TTS-1-HD; velocidade numérica 0,25 a 4. Como no nativo, só a voz é gravada (o idioma escolhe o exemplo) e o que ninguém mexeu sai com o padrão do seletor: `alloy`, `tts-1`, velocidade 1 |
| 6.8d | Listas fixas das demais ações iguais ao nativo | ✅ | Comparado `bot.php:3946-4520` com o editor: Contador de erros (somar/zerar), Atualizar contato (12 opções), tipo de forma de contato, métodos OpenAI. Status, scripts, checkpoints, entradas e substatus vêm do ambiente |
| 6.10 | Variável da condição: lista e seleção iguais às do nativo | ✅ v0.8.9 | **Corrigido.** A lista mostrava variáveis do ambiente, mas a escolha só aceitava as fixas do motor: qualquer outra voltava ao valor anterior. Agora a escolha é conferida pela própria lista, que segue `bot.php:3065-3364`: fixas com os nomes do nativo, variáveis do bot (`getBotVars`), variáveis de script só com a ação "Executar Script" daquele script, as da Automação só com "Executar Automação", e os assistentes. Como `getBotVars`/`getBotWs` chegam por ajax, a coleta é refeita a cada clique em "Editar" (`__ORPEN_REQ_ENV_DATA__`). Variável que ficou escondida continua aparecendo pelo nome. `tests/editor/variaveis-condicao.test.mjs` |
| 6.9 | Transições com a mesma prioridade num estado | ⚠️ baixo | O editor nunca cria repetição: duplicar, mover, adicionar e excluir renumeram 0..N-1. Nenhum dos 12 bots de exemplo tem repetição. Se um bot já chegar assim, a ordem fica indefinida no Oracle e a conferência pode dar falso alarme (D2.10) |

## 7. Segurança

| # | Item | Status | Evidência |
|---|---|---|---|
| 7.1 | Nome e ID do bot escapados no título do editor | ✅ v0.8.9 | `escapeHtml` em `abrirEditorOrpen` |
| 7.2 | Todo HTML montado com dados do bot ou da página usa `escapeHtml` | ✅ v0.8.9 | Auditoria dos 69 `innerHTML`/`insertAdjacentHTML` de `js/`: dados do bot e do ambiente passam por `escapeHtml`/`optionsHtml`; o resto é número, constante ou seletor CSS. Corrigido o termo da busca em `transform-modal.js` (modo avulso, texto digitado pela própria pessoa) |
| 7.3 | `content/page-env-collector.js` (MAIN world): o que coleta e como entrega | ✅ | Lê listas que já estão na página (filas, agentes, bots, status, entradas, contas de I.A.) e grava JSON num `<script type="application/json">`. Desde a v0.8.9 também busca as labels na API REST da própria Orpen com o token da sessão (`userToken`, `const` global da página), do mesmo jeito que o modal nativo. **O token não sai do contexto da página**: só a lista `{ id, name }` vai para o DOM. A página consegue alterar esse JSON, e por isso os nomes vão sempre escapados (7.2) |
| 7.4 | Link `editorbot-atualizar://` e `atualizar.ps1`: só rodam o atualizador da pasta, baixando do GitHub do projeto | ✅ | O comando registrado não repassa nada da URL (sem `%1`), então um site só consegue disparar o atualizador fixo, e o Chrome pede confirmação por site. O download é só de `github.com/GabrielLima66/editorbot` (branch `release`) por HTTPS; o script recusa a pasta com `.git` e copia o `manifest.json` por último. Risco de cadeia de suprimentos em D2.8 |
| 7.5 | `background.js`: mensagens aceitas e recarga automática | ✅ | Só recebe mensagens da própria extensão (sem `externally_connectable`); a única ação é recarregar quando o disco tem versão maior |
| 7.7 | Recursos expostos a qualquer site (`web_accessible_resources` com `<all_urls>`) | ⚠️ | Qualquer site detecta que a extensão está instalada. Baixa gravidade (D2.9) |
| 7.6 | Tema salvo em `chrome.storage.local` (v0.8.4) | ✅ | Revisão do merge 853d410 |

## 8. Fluxograma

| # | Item | Status | Evidência |
|---|---|---|---|
| 8.1 | Testes automatizados | ✅ | 135 passam, 9 pulados (29/09/2026) |
| 8.2 | Gera a partir do bot salvo; pede para salvar antes | ✅ | SPEC-exportar-fluxograma.md; teste manual da v0.4.0 |

## 9. Modo avulso (`bot_transform.html`)

| # | Item | Status | Evidência |
|---|---|---|---|
| 9.1 | Continua funcionando sem a guarda de fechamento e sem salvar na Orpen | ⬜ | Abrir, criar bot vazio, carregar JSON, exportar |

## 10. Roteiro de teste manual (a cada versão)

1. Abrir um bot pelo "Editar"; o rodapé mostra a versão nova.
2. Editar um texto e salvar: "Conferindo…" e depois "Bot salvo com sucesso".
3. Rede em Offline no DevTools e salvar: aviso de que não foi possível confirmar; voltar para Online e salvar de novo.
4. Editar e fechar pelo X, pelo clique fora e pelo Esc: a pergunta aparece nos três. Sem edição, fecha direto.
5. Abrir a janela de menu, clicar no texto dela e apertar Esc: fecha só a janela de menu.
6. Arrastar um estado e salvar: aviso de renumeração. Arrastar para o topo: faixa de entrada alterada.
7. "Adicionar" da Orpen abre o formulário nativo.
8. I.A. (num bot de ambiente com conta OpenAI que tenha assistentes): **condição** — na variável, escolher "[Conta] Assistente: Nome"; operador "Status da análise" → Falha; salvar e reabrir **no modal nativo** (Shift+clique em "Editar"): mesmo assistente, Status da análise, Falha. Trocar para "Conteúdo da análise" → Contém + texto, salvar e conferir no nativo. **Ação OpenAI** — escolher Conta e depois Assistente pela lista; trocar a conta esvazia o assistente; salvar e conferir no nativo. Uma condição/ação de I.A. já existente deve abrir com o assistente preenchido pelo nome.
9. Labels: na condição "Possui os labels" e na ação "Atualizar contato → Adicionar labels", as labels aparecem pelo nome; adicionar pela busca, remover pelo ×, salvar, reabrir e conferir. Reabrir no modal nativo (Shift+clique) e conferir que mostra as mesmas labels. No console da página deve aparecer a contagem de cadastros sem aviso de falha nas labels.
9b. Ação "Enviar anexo": o campo "Arquivo" lista os anexos do bot pelo nome ("imagem - Título"); escolher, salvar e conferir no nativo. No console: `[EDITOR_BOT] Anexos do bot carregados: N`.
10. Ação "Enviar mensagem de áudio": voz agrupada por idioma, ▶ toca o exemplo (trocar de idioma muda o exemplo), modelo TTS-1/TTS-1-HD, velocidade numérica. Ação nova vem com alloy, TTS-1 e 1. Salvar e conferir no nativo.
11. Campos de busca: clicar na variável de uma condição, no operador, no tipo de ação, num estado de destino e numa fila. Em todos abre a lista clara abaixo do campo (nunca o popup escuro do navegador); digitar filtra; setas + Enter escolhem; Esc fecha só a lista (o editor continua aberto). No construtor de variáveis, digitar um nome novo e apertar Enter mantém o nome digitado.

---

## Débitos

### D1. No servidor da Orpen (só a Orpen resolve; a extensão detecta ou avisa)

| # | Débito | Efeito | O que a extensão faz |
|---|---|---|---|
| D1.1 | `Bot::update` não interrompe nem desfaz quando um INSERT falha | Bot gravado pela metade, com `success` | Conferência depois de salvar (1.3) |
| D1.2 | `max_input_vars` possivelmente no padrão (1.000) | O POST é cortado em silêncio e o bot perde o que passou do limite | A conferência detecta; falta confirmar a configuração do servidor |
| D1.3 | `updateBot` cria um bot quando o número não existe | Bot excluído "ressuscita" ao salvar | Nada |
| D1.4 | `getBot` aplica `htmlspecialchars_decode` em `CONDITION_DATA`/`ACTION_DATA` | Texto com `&amp;` digitado de propósito volta como `&` | A conferência avisaria |
| D1.6 | **Bug do nativo:** a opção "Atualizar CPF" do "Atualizar contato" grava `' update-cpf'` (com espaço, `bot.php:4228`), e o motor só reconhece `'update-cpf'` (`Bot.class.php:1475`) | Ação "Atualizar CPF" criada pelo modal nativo **nunca atualiza o CPF** | O editor grava `'update-cpf'` (funciona). Ações antigas com espaço continuam como estão; corrigir ao salvar fica a critério (faria o seletor do nativo aparecer em branco) |
| D1.5 | O atendimento guarda o número do estado, e há referências externas (failover) | Renumerar desvia atendimentos em andamento | Aviso ao salvar (4.3, 4.4) |

### D2. Na extensão

| # | Débito | Por que importa |
|---|---|---|
| ~~D2.1~~ | ✅ Resolvido (v0.8.9, local): `tests/editor/` com 73 testes (`node --test`). A lógica testada saiu do `orpen-bridge.js` para módulos puros: `js/validacao-salvar.js`, `js/renumeracao.js` e `payloadEsperadoNoServidor` em `js/orpen-adapter.js` | |
| D2.2 | Parcial: salvamento, renumeração e travas têm teste; interface (janelas, Esc, guarda de fechamento) e edição de condições/ações não têm | Regressões nessas partes só aparecem no teste manual |
| D2.3 | Código morto da criação de bot: `initBotNumeroEdit`, `#bv-numero-wrap`, mensagem `duplicated` | Confunde quem lê; o campo de ID nunca aparece mais |
| D2.4 | `SPEC-exportar-fluxograma.md` ainda cita `_isNewBot` | Documentação desatualizada |
| D2.5 | Durante o carregamento de um bot, `state.botCarregado` fica `null` e a tela anterior continua visível | Mexer na tela nesse intervalo pode dar erro no console (sem perda de dados) |
| D2.6 | Trava de I.A. sem teste com bot real (5.3) | Pode bloquear ou deixar passar algo inesperado |
| D2.7 | `.claude/agents/` e `VALIDACAO.md` ainda não commitados | Os agentes e o roteiro só existem nesta máquina |
| D2.8 | O atualizador confia só no HTTPS do GitHub: não há assinatura nem hash da versão | Quem controlar a conta `GabrielLima66` ou a branch `release` controla o código de todos os usuários. Mitigação: autenticação em dois fatores na conta e proteção da branch `release` |
| D2.10 | Bot que já chega com prioridades repetidas num estado | Ordem de execução indefinida no motor e possível falso alarme na conferência. Opção: renumerar em sequência no payload só quando houver repetição |
| D2.9 | `web_accessible_resources` aberto para `<all_urls>` | Permite detectar a extensão. Testar `"use_dynamic_url": true` com cuidado: o carregamento via `chrome.runtime.getURL` não pode quebrar |
