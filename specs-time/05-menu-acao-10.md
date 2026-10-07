# 05 · Menu da ação 10 (botões, lista, WebChat e tratamento)

Status: **editar o menu e gerar o tratamento estão implementados** (referência: `js/menu-builder.js`, `js/menu-modal.js`, `js/menu-tratamento.js`). **"Manter em dia" (seção 7) ainda NÃO existe**: está nesta spec como evolução pedida (fase 3) e marcado como tal. Spec de nível **geral**.

> Convenção desta spec: o que não tem marca é comportamento atual do código. O que está sob o título **"Ainda não implementado"** é o que o time deve construir.

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

Menu vazio mostra o cartão **"Criar menu"** (abre o modal já em Botões). Menu em formato **não reconhecido** não usa o modal: continua num editor mais antigo, embutido na própria ação, que mostra "Formato não reconhecido — escolha um tipo acima pra começar do zero", o JSON gerado em modo somente leitura e três botões de tipo (Lista, Botões, WebChat). **Atenção:** nesse editor antigo, clicar num tipo converte **na hora** (não espera Salvar) e **sobrescreve** o conteúdo desconhecido. A garantia "nada é sobrescrito" vale só enquanto a pessoa não escolher um tipo. O time pode substituir esse caminho pelo modal com um aviso antes de converter.

---

## 3. Modal de edição

Janela com um **celular simulado** à direita (pré-visualização ao vivo) e o formulário à esquerda. Três tipos, com troca de tipo:

| Tipo | Campos |
|---|---|
| **WhatsApp Botões** | cabeçalho, corpo, rodapé, e **até 3 botões** (título + ID) |
| **WhatsApp Lista** | cabeçalho, corpo, rodapé, texto do botão da lista (padrão "Ver opções", gravado no Salvar se estiver vazio), e **até 10 linhas** (título, descrição, ID). O modal **não mostra seções**: as linhas aparecem numa lista única; seções que já existiam no JSON são preservadas sem aparecer, e linha nova entra na **última** seção |
| **WebChat** | uma lista de opções (texto + valor); **sem limite**; o texto da pergunta **não fica no menu**: no modal há um campo de mensagem que, ao salvar, edita a ação "Mensagem" imediatamente anterior ou cria uma (só se o texto não for vazio) |

No JSON, `interactive.type` diferente de `"button"` é tratado como lista. A pré-visualização (celular) mostra "Pré-visualização do WhatsApp" ou "do WebChat".

### 3.1 Limites do WhatsApp (contadores na tela)
cabeçalho 60 · corpo 1024 · rodapé 60 · título do botão 20 · ID do botão 256 · botão da lista 20 · título da linha 24 · descrição da linha 72 · ID da linha 200 caracteres. O valor das opções do WebChat também aceita no máximo 256. Os limites são aplicados com `maxlength` do campo (a digitação para no limite); o contador "n/1024" aparece no corpo.

### 3.2 IDs
`ID` (botão ou linha) e `valor` (WebChat) vazios são **gerados do texto**, trocando espaços por `_` ("Falar com atendente" → "Falar_com_atendente"). Preenchido, fica como está. O cliente recebe o **ID** no bot, não o título; por isso o texto pode mudar sem quebrar as condições.

### 3.3 Fidelidade: "Salvar edita o JSON original"
- Salvar **edita o JSON original** em vez de montar um novo: só textos e IDs mexidos mudam; campos opcionais (cabeçalho, rodapé, descrição) só são criados se já existiam ou foram preenchidos; qualquer outra chave do original é preservada; a indentação é a do original.
- **Salvar sem mudar nada não grava nada** (o texto fica byte a byte igual).
- Nunca apagar campos vazios que já existiam, nem inventar campos novos vazios.

### 3.4 Troca de tipo
Só vira mudança estrutural **ao salvar**:
- **Para WebChat:** o texto (cabeçalho, corpo e rodapé juntos) vira uma ação **"Mensagem"** (tipo 1) antes do menu, e o menu fica só com as opções. A ação "Mensagem" é criada com ID novo na posição certa (os IDs das ações da transição são renumerados em ordem).
- **De WebChat para WhatsApp:** o texto da ação "Mensagem" imediatamente anterior vira o **corpo** do menu e essa ação é **removida** (as demais ações da transição são renumeradas). O modal avisa disso antes de salvar. Se a ação anterior não for uma "Mensagem", nada é absorvido.
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

## 6. Gerar tratamento (estado de controle) — implementado

### 6.1 O que gera
Para um menu com **N** opções (na ordem em que aparecem no menu), um estado novo com **N + 2 transições**.

**Estado.** Criado pelo mesmo caminho do botão "+ Estado" do editor: `STATE_NUMBER` = (maior número numérico existente) + 1, ID novo (`nextId`). Nome (`ALIAS`) = o que a pessoa digitou no diálogo; o sugerido é `CTRL - <ALIAS do estado de origem>` (ou `CTRL - Estado <n>` se a origem não tem nome). Se já existe estado com esse nome (sem diferenciar maiúscula), ganha ` 2`, ` 3`… O estado entra **no fim** do array de estados.

**Transições** (criadas pelo mesmo caminho do "+ Transição": `PRIORITY` = maior do estado + 1, começando em 0):

| Prioridade | Condições | Ações |
|---|---|---|
| 0 … N−1 | `MENSAGEM` **Igual a** `<ID da opção>` | nenhuma (a pessoa completa depois) |
| N (limite) | `MENSAGEM` **Contém** `""` **E** `Contador de erros` **≥** `<limite>` | as da seção 6.3 |
| N+1 (fallback) | `MENSAGEM` **Contém** `""` | (1) Contador de erros **incrementar**; (2) **só no WebChat e se a mensagem anterior ao menu tem texto**: ação "Mensagem" com esse texto; (3) cópia do menu (ação 10) |

Regras:
- A condição compara o **ID** (WhatsApp) ou o **valor** (WebChat) da opção, **nunca o texto**.
- O **limite vem antes do fallback**: senão o fallback captura tudo e o limite nunca dispara.
- O fallback **reenvia o menu** com uma cópia do `message_option_text` original, byte a byte (uma Troca Estado de volta não reenviaria nada até a próxima mensagem do cliente).
- O contador **só é incrementado** no fallback. O gerador **não usa** a opção "Zerar" do contador; as transições das opções não zeram nada (decisão a rever pelo time se o contador precisar voltar a zero depois de um acerto).
- **Ligação com a origem (última etapa):** se a transição do menu já tem uma "Troca Estado" **depois** do menu, o destino dela passa a ser o estado novo. Se não tem, uma "Troca Estado" para o estado novo é inserida **logo depois do menu**, e as ações dessa transição são renumeradas em sequência (a ordem de execução vem do ID).

Formato dos registros (idêntico ao que a Orpen grava; sempre pelos mesmos caminhos do editor, `nextId`/`withMirrors`):
```js
{ CONDITION_TYPE:'1', CONDITION_DATA:{ variable:'message',     type:'1', value:'<id>' } }   // opção (Igual a)
{ CONDITION_TYPE:'2', CONDITION_DATA:{ variable:'message',     type:'1', value:''     } }   // qualquer mensagem (Contém "")
{ CONDITION_TYPE:'7', CONDITION_DATA:{ variable:'error_count', type:'1', value:'<n>'  } }   // contador >= n
{ ACTION_TYPE:'1',  ACTION_DATA:{ message_text:'<texto>' } }
{ ACTION_TYPE:'2',  ACTION_DATA:{ destiny:'<STATE_NUMBER>' } }
{ ACTION_TYPE:'5',  ACTION_DATA:{ destiny:'<fila>' } }
{ ACTION_TYPE:'6',  ACTION_DATA:{ crm_status:'<status>' } }
{ ACTION_TYPE:'8',  ACTION_DATA:{ error_count:'add' } }          // 'reset' = Zerar (não usado aqui)
{ ACTION_TYPE:'10', ACTION_DATA:{ message_option_text:'<cópia do JSON do menu>' } }
```
Sobre o campo `type:'1'` dentro de `CONDITION_DATA`: o gerador o grava em **todas** as condições acima, e é o que o editor grava para essas variáveis. Quem decide a operação (Igual a, Contém, ≥) é o **`CONDITION_TYPE`** da condição (ver a tabela de variáveis e operadores no contrato, seção 2); não confundir os dois campos.

Exemplo, menu de botões com `Vendas` e `Suporte` (IDs `Vendas` e `Suporte`), limite 2, ação "fila 3", origem = estado 4 (maior número existente = 6):

| Estado 7 `CTRL - <origem>` | |
|---|---|
| Transição prioridade 0 | cond. `message Igual a "Vendas"` · sem ações |
| Transição prioridade 1 | cond. `message Igual a "Suporte"` · sem ações |
| Transição prioridade 2 (limite) | cond. `message Contém ""` + `error_count ≥ 2` · ações: 1 (mensagem padrão) → 5 (`destiny:'3'`) |
| Transição prioridade 3 (fallback) | cond. `message Contém ""` · ações: 8 (`add`) → 10 (cópia do menu) |

E, na transição original do estado 4, depois da ação 10 do menu, entra a ação 2 com `destiny:'7'`.

### 6.2 Diálogo "Gerar tratamento do menu"
- **Nome do estado** (até 80 caracteres), **Limite de erros** (número, padrão **2**; mínimo 1 garantido pelo código, máximo 20 só no campo), e o grupo **"Ao atingir o limite"** com a lista de ações da seção 6.3 e uma caixa de **mensagem** (some quando a ação é "Deixar em branco").
- Uma **prévia** das transições: uma linha por opção ("`<id>` texto → você completa"), "Erros ≥ n → <ação>" e "Qualquer outra resposta → erros +1, reenvia o menu" (no WebChat com texto, "reenvia mensagem e menu").
- Botões Cancelar e **Gerar**. Esc cancela.
- Ao gerar: cria tudo, fecha, o editor refaz a lista, o **estado novo abre expandido** e um aviso diz: `Estado "<nome>" criado com <N+2> transições. Complete o que cada opção faz e salve o bot.`

### 6.3 Ações de limite
| Opção do diálogo | O que cria na transição do limite |
|---|---|
| **Mensagem + transferir para fila** (padrão) | ação 1 (mensagem) + ação 5 com a fila escolhida |
| **Mensagem + finalizar o atendimento** | ação 1 (mensagem) + ação 6 com o status CRM escolhido |
| **Mensagem + trocar de estado** | ação 1 (mensagem) + ação 2 com o estado escolhido |
| **Deixar em branco (completo depois)** | nenhuma ação |

- A ação 1 só é criada se o texto da mensagem não estiver vazio.
- Mensagens padrão (trocam junto com a opção enquanto a pessoa não editar o texto):
  - fila: "Não consegui identificar a opção escolhida. Vou te transferir para um de nossos atendentes."
  - finalizar: "Não consegui identificar a opção escolhida. Seu atendimento será encerrado."
  - estado: "Não consegui identificar a opção escolhida."
- Fila, status ou estado "Escolher depois" criam a ação com o campo vazio; ela aparece nas pendências do editor. Com cadastros do ambiente disponíveis a escolha é uma lista; sem eles (modo avulso) é um campo de texto.

### 6.4 Quando a transição já tem uma Troca Estado depois do menu
O diálogo mostra um aviso fixo ("Esta transição já leva para `<n> · <nome>`. Ao gerar, o destino passa a ser o estado novo.") e o botão passa a se chamar **"Gerar e trocar destino"**. Não há segunda confirmação: clicar nele é a confirmação.

### 6.5 Rodar duas vezes
Gerar de novo cria **outro** estado (o nome ganha ` 2`) e troca de novo o destino. Não existe detecção de tratamento já criado.

---

## 7. Ainda não implementado: manter o tratamento em dia (fase 3)

> Pedido de produto, ainda sem código. O time pode implementar; **nada desta seção existe hoje**.

Objetivo: depois de gerar o tratamento, editar o menu (acrescentar ou tirar opções) não deve deixar o estado de controle desatualizado em silêncio.

### 7.1 Vínculo deduzido (nada novo é gravado no bot)
O estado de tratamento de um menu é o **destino da Troca Estado** logo depois do menu, desde que esse estado tenha ao menos uma transição `MENSAGEM Igual a <ID>` com um ID deste menu. Funciona também em bots antigos montados à mão.

### 7.2 Comportamento desejado
- Havendo vínculo, o botão da ação vira **"Atualizar tratamento"**.
- **Atualizar** cria as transições das opções novas, **antes** do limite (as de limite e fallback sobem uma prioridade cada); **não apaga nada**: a opção que saiu do menu ganha uma sinalização para a pessoa decidir (a forma da sinalização é decisão do time, por exemplo uma pendência listada no editor); e atualiza a cópia do menu no fallback.
- Ao **salvar o modal do menu**, se houver vínculo, atualizar também a cópia do fallback e avisar ("Menu atualizado também em `<estado>`").
- A troca do destino de uma Troca Estado existente deve pedir confirmação explícita (hoje só há o aviso da seção 6.4).

---

## 8. Critérios de aceitação

Itens 1 a 11 descrevem o que o código **já faz**; **nenhum** dos módulos de menu tem teste automatizado em `tests/editor/` hoje, então estes casos precisam virar testes novos (as funções `parseMenuModel`, `opcoesDoMenu`, `problemaParaGerar`, `analisarMenu` e `gerarTratamento` são puras e testáveis em Node). Itens 12 a 14 são da fase 3 (seção 7).

1. Abrir e salvar um menu sem alterar nada **não muda um byte** do JSON.
2. Editar só o corpo preserva chaves desconhecidas, a indentação do original (0 = minificado; menu novo ou de tipo trocado usa a do original ou 4 espaços) e os campos vazios que já existiam.
3. IDs vazios são gerados do texto (espaço → `_`); os preenchidos são mantidos.
4. Limites: Botões aceita 3, Lista 10; a digitação para nos limites da seção 3.1; ao reduzir de tipo com itens demais, o painel de truncamento lista o que sai e pede confirmação.
5. Trocar para WebChat cria a ação "Mensagem" antes do menu com o texto de cabeçalho, corpo e rodapé (só se não vazio); trocar de volta absorve o texto no corpo e **remove** essa ação.
6. O gerador cria N + 2 transições nas prioridades certas, condições pelo **ID** (ou valor, no WebChat), limite antes do fallback, fallback com cópia byte a byte do menu; para o exemplo da seção 6.1 o resultado tem exatamente os registros da tabela.
7. O botão "Gerar tratamento" fica desligado, com o motivo na dica, para menu sem opções, com opção sem ID ou com IDs repetidos.
8. Com Troca Estado já existente depois do menu, o destino dela é trocado e o botão do diálogo é "Gerar e trocar destino"; sem ela, a ação é inserida logo depois do menu e as ações da transição são renumeradas em sequência.
9. Gerar duas vezes cria dois estados (`CTRL - X` e `CTRL - X 2`).
10. **[UI]** O celular simulado reflete cabeçalho, corpo, rodapé, botões e lista; WebChat mostra as opções.
11. **[UI]** Menu em formato desconhecido aparece no editor antigo (JSON somente leitura + botões de tipo).
12. *(fase 3)* Com tratamento vinculado, o botão vira "Atualizar tratamento".
13. *(fase 3)* Opção nova ganha transição antes do limite; opção removida **não** é apagada e fica sinalizada.
14. *(fase 3)* Salvar o modal atualiza a cópia do menu no fallback.

## 9. Riscos e pontos em aberto

| Item | Situação |
|---|---|
| Editor antigo sobrescreve | Em menu de formato desconhecido, escolher um tipo converte na hora e perde o conteúdo (seção 2). |
| Sem testes | Nenhum teste automatizado cobre menu e tratamento. |
| Contador nunca zera | O gerador só incrementa o contador; quem precisar zerar depois de uma opção válida deve acrescentar a ação "Zerar" à mão. |
| Gerar repetido | Não detecta tratamento existente (seção 6.5). |
| Seções da lista | O modal esconde as seções; um menu com várias seções fica como uma lista única na tela, mas o JSON preserva a estrutura. |
