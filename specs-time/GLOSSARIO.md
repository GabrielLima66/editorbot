# Glossário

Termos que aparecem nas specs. Ordem alfabética dentro de cada grupo.

## Produto e sistema

| Termo | Significado |
|---|---|
| **Orpen** | Empresa/plataforma de atendimento cujo sistema a extensão estende. |
| **ContactCenter / `bot.php`** | Tela da Orpen onde se cadastram e editam bots. É a página sobre a qual a extensão roda. |
| **Motor (de bots)** | Programa do **servidor** da Orpen que executa o bot em cada conversa. O simulador (spec 01) reproduz as regras dele. |
| **Cadastros do ambiente** | Listas que existem em cada instalação da Orpen: filas, agentes, bots, calendários, status CRM, scripts, entradas, contas OpenAI. Mudam de cliente para cliente, por isso não podem ser copiadas entre ambientes. |
| **Ambiente / host** | Uma instalação (um cliente). Identificada pelo endereço (host) da página. |
| **Entrada (entrance)** | Canal de entrada de mensagens (um número de WhatsApp, um e-mail, etc.). |
| **WebChat** | Chat do site. O menu dele é de outro formato que o do WhatsApp. |
| **Tratamento (CTRL)** | Estado de controle que o editor gera para um menu: decide o que fazer com cada opção, conta erros e reenvia o menu (spec 05). |
| **Pendência** | Campo de cadastro que ficou vazio e a pessoa precisa preencher (ex.: a fila de uma transferência). Avisa, não bloqueia. |
| **Modo avulso / standalone** | A página `bot_transform.html` aberta fora da Orpen. Não tem cadastros do ambiente nem servidor. |
| **Caixa-preta** | A camada que abre, edita, salva e interpreta o bot. Já existe e não está nestas specs. |

## O bot

| Termo | Significado |
|---|---|
| **Estado** | Uma "etapa" do bot. Tem número (`STATE_NUMBER`) e nome (`ALIAS`). O estado `0` é onde toda conversa nova começa. |
| **Transição** | "Se acontecer X, faça Y" dentro de um estado. Tem prioridade (`PRIORITY`): vale a primeira cujas condições forem todas verdadeiras. |
| **Condição** | Teste de uma transição (a mensagem contém…, o contador de erros é ≥…, está dentro do calendário…). Todas de uma transição precisam ser verdadeiras (E). |
| **Ação** | O que a transição faz (enviar mensagem, trocar de estado, transferir, finalizar…). Rodam na ordem do ID. |
| **Espelhos** | Chaves numéricas (`"0"`, `"1"`…) repetidas em cada linha do bot, exigidas pelo formato da Orpen. Criadas por `withMirrors`. |
| **`nextId`** | Função que dá o próximo ID livre de uma tabela (maior + 1). |
| **Callback / fallback** | Estado para onde o bot volta depois de uma ação que "pausa" (OpenAI, áudio, automação): callback se deu certo, fallback se deu erro. |
| **Timeout** | Configuração do bot para o que fazer quando o cliente fica sem responder (ir para um estado, transferir, encerrar). |
| **Contador de erros** | Número que o bot soma quando não entende a resposta; usado para limitar tentativas. |
| **`{$variável}`** | Marcador substituído em tempo de execução pelo valor de uma variável do atendimento. |
| **Renumerar** | Mudar o número de estados e atualizar tudo que aponta para eles (`remapStateNumbers`). |
| **Failover / inatividade** | Configurações do ContactCenter (fora do bot) que também guardam números de estado e **não** são atualizadas ao renumerar. |

## Técnico

| Termo | Significado |
|---|---|
| **MV3 (Manifest V3)** | Versão atual do formato de extensões do Chrome. |
| **Content script** | Código da extensão que roda dentro da página da Orpen. |
| **Service worker** | Código da extensão que roda em segundo plano (`background.js`); só ele pode recarregar a extensão. |
| **Shadow DOM** | Isolamento de HTML/CSS: o editor fica dentro dele para a Orpen não interferir. Por isso se busca elementos com `getRootNode()`. |
| **Token (de cor)** | Variável CSS (`--accent`, `--text`…) que muda de valor entre tema claro e escuro. |
| **`escapeHtml`** | Função que neutraliza `< > & " '` em texto antes de colocá-lo em HTML. Obrigatória para texto vindo de fora. |
| **Pilha de Esc (`empilharEsc`)** | Mecanismo para a tecla Esc fechar só a janela mais recente. |
| **Módulo puro** | Código sem DOM, que roda em Node e é testável sem navegador. |
| **Snapshot** | Cópia congelada do bot tirada no início de uma operação longa (fluxograma). |
| **Golden (teste)** | Saída de referência gravada, usada para provar que a implementação nova produz o mesmo resultado. |
| **Paridade** | Fazer igual a outro sistema (o app desktop "Fluxo BOT" no fluxograma; o modal nativo da Orpen no editor). |

## Testar bot (spec 01)

| Termo | Significado |
|---|---|
| **Sessão** | Estado de uma conversa simulada (estado atual, mensagens, contador de erros, variáveis…). |
| **Rodada** | Um ciclo do motor: avalia transições do estado atual e roda as ações da primeira que valer. |
| **Rodada automática** | Rodada extra quando a transição trocou de estado e o novo estado pode agir sem mensagem do cliente (limite 25). |
| **Contexto** | Dados externos que o simulador não pode inventar (horário do calendário, resposta de OpenAI, retorno de script). A pessoa informa; o simulador pausa até lá. |
| **Ponto de partida (▶)** | Estado em que o teste começa. |
| **Parada (⚑)** | Estado em que o teste para ao chegar. |
| **Requisito de contexto** | Cada dado que o bot consulta de fora e que a aba Contexto pede. |

## Localizar (spec 02)

| Termo | Significado |
|---|---|
| **Chave do resultado** | Identificador estável de um resultado (`a:`, `c:`, `k:`, `m:`, `e:` + dados) para manter a posição quando a lista é refeita. |
| **Mapa de origem** | Tabela que liga cada posição do texto normalizado (sem acento/maiúscula) à do texto original. |

## Fluxograma (spec 03)

| Termo | Significado |
|---|---|
| **Modo Cliente** | Versão do fluxograma sem as transições internas de erro/teste, própria para mostrar ao cliente final. |
| **Fluxo BOT** | App desktop (Python) de onde o fluxograma foi portado; é a referência de aparência e regras. |
| **Back edge** | Seta que volta para um estado já "em andamento" (laço), desenhada diferente. |
| **dagre / React Flow** | Bibliotecas de layout automático e de desenho de nós e setas. |
| **Nonce / MessageChannel** | Mecanismo de segurança e de mensagens entre a extensão e o iframe que desenha o fluxograma. |

## Copiar e colar (spec 04)

| Termo | Significado |
|---|---|
| **Trecho** | O que é copiado: um objeto com os estados (ou transições) escolhidos, com suas condições e ações, e o `índice` de todos os estados do bot de origem. |
| **Área de cópia** | Onde o trecho fica guardado: `chrome.storage.local` da extensão (uma só cópia por vez, vale para todos os domínios). |
| **Ensaio (`simularColagem`)** | Colar numa **cópia** do bot só para verificar se algo quebraria; o bot de verdade só muda se o ensaio passar. |
| **Soltas** | Ligações para estados que não foram copiados e que, por isso, ficaram em branco. |
| **ID de linha** | O `ID` da linha do estado na tabela (diferente do `STATE_NUMBER`, que é o número que as ligações usam). |
| **Mesmo bot** | Origem e destino com o mesmo `host` (endereço com porta) e o mesmo `ID` de bot. Nesse caso ligações para estados não copiados podem ser mantidas. |
| **Variáveis de cadastro** | Variáveis de condição cujo valor é um ID de cadastro do ambiente (fila, agente, calendário, status CRM, entrada...); lista na tabela 2.1 do contrato. |

## Menu e atualização (specs 05 e 07)

| Termo | Significado |
|---|---|
| **Fallback** | Dois usos: (1) estado de **erro** das ações 18, 20 e 22 (`fallback_state`); (2) no tratamento de menu, a transição de "qualquer outra resposta", que conta o erro e reenvia o menu. O contexto diz qual. |
| **`release`** | Ramo do GitHub que só recebe versões fechadas; é dele que o aviso de versão nova e o atualizador leem. |
| **Protocolo registrado (`editorbot-atualizar://`)** | Endereço especial que o Windows aprende a abrir com o `atualizar.ps1` (registrado em `HKCU`, só para o usuário atual). |
| **`robocopy`** | Comando do Windows que o atualizador usa para espelhar pastas. |
| **Chave nomeada** | Campo de uma linha com nome (`ID`, `STATE_NUMBER`...), em oposição à chave numérica espelhada (`"0"`, `"1"`...). |
