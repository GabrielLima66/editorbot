# 05 · Menu da ação 10 (botões, lista, WebChat e tratamento)

Status: implementada (referência: `js/menu-builder.js`, `js/menu-modal.js`, `js/menu-tratamento.js`). Spec de nível **geral**; a spec histórica do gerador de tratamento está em `SPEC-tratamento-menu.md`.

Pré-requisito: `00-contrato-de-entrada.md` (seção 5, formatos do JSON do menu).

---

## 1. Objetivo

Editar o menu da ação "Mensagem Options" (tipo 10) **sem mexer em JSON à mão**, mostrando como o cliente verá (um celular simulado), e **gerar o estado de tratamento** do menu (um estado de controle que decide o que fazer com cada opção, com limite de erros), que é a parte mais trabalhosa e repetitiva de montar um bot.

### Fora do escopo
- Preencher o que cada opção faz (decisão de negócio; fica para a pessoa, com ajuda das pendências).
- Gerar tratamento para menu em formato não reconhecido.
- Palavra-chave global ("Atendente").

---

## 2. Menu na lista de ações (resumo)

Na transição, a ação 10 aparece como um **cartão de resumo**: o tipo ("WhatsApp · Botões", "WhatsApp · Lista" ou "WebChat · Menu"), uma pré-visualização compacta e dois botões:
- **Editar menu**: abre o modal de edição.
- **Gerar tratamento**: abre o diálogo do gerador (seção 6). Desligado, com o motivo na dica, se o menu não tem opções, tem opção **sem ID** ("Abra Editar menu e salve para gerar os IDs") ou tem **IDs repetidos**.

Menu vazio mostra um botão para criar. Menu em formato **não reconhecido** continua no editor antigo (campo de JSON), para nada ser sobrescrito.

---

## 3. Modal de edição

Janela com um **celular simulado** à direita (pré-visualização ao vivo) e o formulário à esquerda. Três tipos, com troca de tipo:

| Tipo | Campos |
|---|---|
| **WhatsApp Botões** | cabeçalho, corpo, rodapé, e **até 3 botões** (título + ID) |
| **WhatsApp Lista** | cabeçalho, corpo, rodapé, texto do botão da lista (padrão "Ver opções"), e **até 10 linhas** em seções (título, descrição, ID) |
| **WebChat** | uma lista de opções (texto + valor); **sem limite**; o texto da pergunta **não fica no menu** |

### 3.1 Limites do WhatsApp (contadores na tela)
cabeçalho 60 · corpo 1024 · rodapé 60 · título do botão 20 · ID do botão 256 · botão da lista 20 · título da linha 24 · descrição da linha 72 · ID da linha 200 caracteres.

### 3.2 IDs
`ID` (botão ou linha) e `valor` (WebChat) vazios são **gerados do texto**, trocando espaços por `_` ("Falar com atendente" → "Falar_com_atendente"). Preenchido, fica como está. O cliente recebe o **ID** no bot, não o título; por isso o texto pode mudar sem quebrar as condições.

### 3.3 Fidelidade: "Salvar edita o JSON original"
- Salvar **edita o JSON original** em vez de montar um novo: só textos e IDs mexidos mudam; campos opcionais (cabeçalho, rodapé, descrição) só são criados se já existiam ou foram preenchidos; qualquer outra chave do original é preservada; a indentação é a do original.
- **Salvar sem mudar nada não grava nada** (o texto fica byte a byte igual).
- Nunca apagar campos vazios que já existiam, nem inventar campos novos vazios.

### 3.4 Troca de tipo
Só vira mudança estrutural **ao salvar**:
- **Para WebChat:** o texto (cabeçalho, corpo e rodapé juntos) vira uma ação **"Mensagem"** (tipo 1) antes do menu, e o menu fica só com as opções. A ação "Mensagem" é criada com ID novo na posição certa (os IDs das ações da transição são renumerados em ordem).
- **De WebChat para WhatsApp:** a "Mensagem" imediatamente anterior é **reincorporada** como texto do menu.
- Ao trocar para um tipo com limite menor, se houver mais itens que o permitido, um painel pergunta se pode **truncar** (e mostra o que será removido) ou voltar.
- Descrições se perdem ao ir para Botões (não existem nesse formato).

---

## 4. Variáveis no texto
O campo de texto aceita o botão direito (ou digitar `{$`) para inserir variável (ver o módulo de variáveis do editor).

---

## 5. Onde mais o menu aparece
- **Localizar** busca nos textos do menu (nunca nos IDs).
- **Testar bot** mostra o menu como bolha com botões clicáveis; tocar envia o **ID**.
- **Fluxograma** mostra as opções (títulos) dentro do cartão da mensagem.

---

## 6. Gerar tratamento (estado de controle)

### 6.1 O que gera
Para um menu com **N** opções, um estado novo (nome padrão `CTRL - <nome do estado de origem>`; se existir, ganha ` 2`, ` 3`…) com **N + 2 transições**:

| Prioridade | Condições | Ações |
|---|---|---|
| 0 … N−1 | `MENSAGEM` **Igual a** `<ID da opção>` (tipo 1) | nenhuma (a pessoa completa) |
| N | `MENSAGEM` **Contém** `""` (tipo 2) **E** `Contador de Erros` **Maior-igual** `<limite>` (tipo 7) | ação de limite (6.3) |
| N+1 | `MENSAGEM` **Contém** `""` | Contador de Erros **incrementar** + **cópia do menu** (reenvia o menu) |

Regras:
- A condição compara o **ID** (WhatsApp) ou o **valor** (WebChat) da opção, **nunca o texto**.
- O **limite vem antes do fallback**: senão o fallback captura tudo e o limite nunca dispara.
- O fallback **reenvia o menu** com uma cópia do JSON da ação original (uma Troca Estado de volta não reenviaria nada até a próxima mensagem do cliente). No WebChat, a cópia leva também a ação "Mensagem" que vem antes do menu.
- Na transição do menu, depois da ação 10, entra uma **Troca Estado** para o estado de controle (as ações da transição são renumeradas em ordem).

Formato dos registros (idêntico aos que a Orpen grava):
```js
{ CONDITION_TYPE:'1', CONDITION_DATA:{ variable:'message', type:'1', value:'<id>' } }   // opção
{ CONDITION_TYPE:'2', CONDITION_DATA:{ variable:'message', type:'1', value:'' } }       // qualquer mensagem
{ CONDITION_TYPE:'7', CONDITION_DATA:{ variable:'error_count', type:'1', value:'<limite>' } }
{ ACTION_TYPE:'8',  ACTION_DATA:{ error_count:'add' | 'reset' } }
{ ACTION_TYPE:'10', ACTION_DATA:{ message_option_text:'<cópia do JSON>' } }
{ ACTION_TYPE:'2',  ACTION_DATA:{ destiny:'<STATE_NUMBER>' } }
```
Tudo é criado pelos mesmos caminhos do editor (`nextId`, `withMirrors`).

### 6.2 Diálogo
Campos: **Nome do estado**; **Limite de erros** (padrão 2); **Ao estourar o limite**; mensagem. Mostra uma **prévia** das N+2 transições. Ao confirmar, tudo é criado de uma vez; o estado novo abre e rola até ele; toast lembra de salvar.

### 6.3 Ações de limite
| Escolha | Efeito |
|---|---|
| **Mensagem + Transferir para fila** (padrão) | mensagem editável + ação 5 com a fila escolhida |
| **Finalizar atendimento** | ação 6 com o status CRM escolhido |
| **Trocar para o estado…** | ação 2 |
| **Deixar em branco** | transição sem ações |

A mensagem padrão acompanha a ação escolhida enquanto não for editada. Fila ou status não escolhidos criam a ação com o campo vazio e ela aparece nas pendências.

### 6.4 Se a transição já tem Troca Estado depois do menu
- Se leva a um estado que **já tem tratamento deste menu** (vínculo deduzido), o botão vira **"Atualizar tratamento"**.
- Se leva a **outro estado**, o diálogo avisa e **pede confirmação** para trocar o destino. Nunca troca sem perguntar.

### 6.5 Vínculo deduzido (nada novo é gravado)
O estado de tratamento de um menu é o **destino da Troca Estado** logo depois do menu, desde que esse estado tenha ao menos uma transição `MENSAGEM Igual a <ID>` com um ID deste menu. Funciona também em bots antigos montados à mão.

### 6.6 Manter em dia
- **Atualizar tratamento:** cria as transições das opções novas (antes do limite); **não apaga nada**: opção que saiu do menu ganha a marca "opção não existe mais no menu" e a pessoa decide; atualiza a cópia do menu no fallback.
- **Salvar no modal do menu**, se houver tratamento vinculado: atualizar também a cópia do fallback; toast "Menu atualizado também em CTRL - …".

---

## 7. Critérios de aceitação

1. Abrir e salvar um menu sem alterar nada **não muda um byte** do JSON.
2. Editar só o corpo preserva chaves desconhecidas, a indentação e os campos vazios que já existiam.
3. IDs vazios são gerados do texto; os preenchidos são mantidos.
4. Limites: Botões aceita 3, Lista 10; contadores mostram os limites de 3.1; ao reduzir de tipo com itens demais, o painel de truncamento mostra o que sai.
5. Trocar para WebChat cria a ação "Mensagem" antes do menu com o texto do cabeçalho, corpo e rodapé; trocar de volta a reincorpora.
6. O gerador cria N + 2 transições nas prioridades certas, condições pelo **ID** (ou valor no WebChat), limite antes do fallback, fallback com cópia do JSON do menu; o resultado bate registro a registro com o export de referência.
7. O botão "Gerar tratamento" fica desligado, com o motivo, para menu sem opções, sem ID ou com ID repetido.
8. Já existindo tratamento vinculado: o botão vira "Atualizar"; opção nova ganha transição; opção removida **não** é apagada e ganha a marca.
9. Troca Estado existente para outro estado pede confirmação.
10. **[UI]** O celular simulado reflete cabeçalho, corpo, rodapé, botões e lista; WebChat mostra as opções.
11. **[UI]** Menu em formato desconhecido continua no editor antigo, sem perda.
