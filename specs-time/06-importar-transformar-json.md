# 06 · Importar, criar e transformar bot em JSON (página avulsa)

Status: implementada (referência: `bot_transform.html`, `js/upload.js`, `js/transformations.js`, `js/transform-modal.js`, `js/bot-view-interactions.js` para as pendências). Spec de nível **geral**.

Pré-requisito: `00-contrato-de-entrada.md`.

---

## 1. Objetivo

Uma **página independente da Orpen** (`bot_transform.html`, aberta como página da extensão) onde a pessoa trabalha com um bot **em arquivo `.json`**, sem estar logada em nenhum ambiente:

1. **Importar** um JSON exportado de um bot.
2. **Criar um bot em branco** e montá-lo do zero.
3. **Editar** no mesmo editor visual da extensão (o editor roda "avulso", sem a Orpen por trás).
4. **Aplicar transformações** automáticas sobre o JSON (hoje, uma: portar menu WhatsApp → WebChat).
5. **Baixar** o resultado.

Nada é enviado para servidor nenhum: tudo acontece no navegador, em memória.

### Fora do escopo
- Salvar na Orpen (não existe sessão aqui). O download do arquivo é o fim do caminho.
- Importar o JSON de outro formato que não seja o exportado pela Orpen (ver 2.2).
- Histórico de versões, autosave, vários bots ao mesmo tempo.

---

## 2. Fluxo

### 2.1 Tela inicial
Uma área de **soltar arquivo** (clique ou arrastar) e um botão **"Criar bot em branco"**. Dois estados de tela: **sem bot** (só a área de soltar) e **com bot** (resumo + ações).

### 2.2 Importar
- Aceita apenas arquivos com nome terminando em `.json` (senão: alerta "Selecione um arquivo .json").
- Lê como texto e faz `JSON.parse`. Falha de sintaxe: alerta "Esse arquivo não é um JSON válido: <mensagem>"; nada muda na tela.
- **Não há validação de estrutura**: qualquer JSON válido é aceito como bot. Se faltar `BOT_STATES` etc., a tela mostra zeros e o editor se comporta como ele já se comporta com listas vazias (ver contrato, seção 2). *(Ponto de decisão: o time pode escolher validar `BOT_STATES/TRANSITIONS/CONDITIONS/ACTIONS` como listas e recusar com mensagem clara; o comportamento atual é permissivo.)*
- Guarda o nome do arquivo original (usado para nomear o download).
- Mostra o **resumo**: nome do bot (`NAME` ou "(sem nome)"), `ID` (ou "—"), quantidade de estados, quantidade de ações e o nome do arquivo.

### 2.3 Criar bot em branco
Nome de arquivo `novo_bot.json`. Cria exatamente este objeto (todos os valores escalares são a **string vazia**; `ID` e `NAME` ficam **propositalmente vazios** para obrigar a pessoa a definir o ID real antes de exportar e evitar colisão com outro bot no destino):
```js
{ ID:'', '0':'',  NAME:'', '1':'',  CONF_DELIVERY_TIME:'', '2':'',  CONF_DELIVERY_QUEUE:'', '3':'',
  TIME_ANSWER:'', '4':'',  TIMEOUT_DELAY:'', '5':'',  TIMEOUT_ACTION:'', '6':'',
  TIMEOUT_DESTINY:'', '7':'',  TIMEOUT_MESSAGE:'', '8':'',
  BOT_STATES:[], BOT_TRANSITIONS:[], BOT_CONDITIONS:[], BOT_ACTIONS:[] }
```
(O nome de cada espelho numérico está na tabela da seção 1 do contrato.) O bot em branco **não tem nenhum estado**: o primeiro "+ Estado" do editor cria o estado `0`. Depois mostra o resumo e **abre o editor** direto.

### 2.4 Editar
Botão que abre o editor visual sobre o bot carregado (o mesmo editor da extensão, sem as funções que dependem da Orpen: salvar na Orpen, listas de cadastros do ambiente). Edições alteram o objeto em memória (`state.botCarregado`).

### 2.5 Baixar (bot editado)
- Gera `JSON.stringify(bot, null, 2)` como arquivo `application/json` com o nome `<nome original sem .json>_editado.json`.
- **Antes de baixar**, calcula as **pendências** (campos que apontam para algo que não existe / ficou vazio, a mesma lista usada ao colar e ao salvar no editor). Baixa **mesmo assim**; depois mostra a janela de pendências se houver alguma. As pendências **avisam, não bloqueiam**.

### 2.6 Trocar de arquivo
Zera o bot em memória, limpa o campo de arquivo, esconde resumo e resultado, volta para a tela inicial. **Sem confirmação** (qualquer edição não baixada se perde).

---

## 3. Transformações

### 3.1 Janela de escolha
Botão abre uma janela com: **busca** (por título e descrição curta, sem diferenciar maiúscula/minúscula), **lista** de transformações (ícone, título, descrição curta, marca de selecionada), **detalhe** (descrição longa da selecionada) e botões **Cancelar** / **Aplicar transformação**. "Aplicar" fica desligado até haver uma selecionada. Sem resultado na busca: "Nenhum resultado pra "<termo>"" (com `escapeHtml`). Fecha com o X, o Cancelar ou clicando no fundo.

Ao aplicar: spinner e texto "Aplicando…" por ~300 ms (só feedback visual), roda a transformação, mostra o **log** e fecha a janela.

### 3.2 Contrato de uma transformação
Cada item do catálogo tem `{ id, icone, titulo, descricaoCurta, descricaoLonga, fn }`.
`fn(botOriginal)` **não altera o original**: faz um clone profundo e devolve `{ data, log }`, onde `data` é o bot transformado e `log` é uma **lista de frases** descrevendo o que mudou. Se nada for encontrado para converter, `log` traz uma única frase dizendo isso e `data` é igual ao original. Adicionar uma transformação = adicionar um item ao catálogo.

### 3.3 Resultado
O log aparece numa seção "Resultado" (uma linha por item, com "•"). Existe um botão **Baixar JSON convertido** que baixa o **bot transformado** como `<nome original>_convertido.json`. **O resultado é separado do bot em edição**: aplicar uma transformação **não** altera o que está no editor, e editar depois **não** altera o convertido. *(Ponto de decisão: o time pode preferir que o resultado substitua o bot em edição; hoje são dois objetos distintos, o que permite comparar.)*

### 3.4 Transformação existente: "Portar menu WhatsApp → WebChat"

**Entrada:** ações tipo 10 cujo `message_option_text` é um JSON no **formato antigo do WhatsApp** (`{"interactive": {...}}`). Menus já em outro formato, ou que não são JSON, são ignorados.

**Para cada transição** (as ações são agrupadas por `TRANSITION_ID` e ordenadas por ID numérico), procurar a **primeira** ação tipo 10 com `interactive`. Se não há, as ações seguem como estão. Se há:

1. **Texto da pergunta** = `interactive.body.text` (vazio se não existir).
2. **Opções**:
   - `interactive.type = "button"`: um item por botão: `{ text: reply.title, value: reply.id }`.
   - `interactive.type = "list"`: um item por linha de cada seção, em ordem: `{ text: row.title, value: row.id }`.
   - Outros tipos: lista vazia.
3. **Nova ação "Mensagem"** (tipo 1) com `message_text` = texto da pergunta, inserida **imediatamente antes** do menu, na mesma transição. A ação nasce com o formato completo dos registros (chave nomeada + espelho numérico `'0'`, `'1'`, `'2'`).
4. **O menu** passa a ser `{"message_type":"menu","menu_type":"list","options":[...]}`, gravado em `message_option_text` com indentação de 2 espaços, **substituindo** `ACTION_DATA` inteiro da ação (a chave `message_option_text` é a única que sobra).
5. **Renumerar os IDs** de todas as ações da transição na nova ordem (mensagem nova, menu, demais), em sequência a partir de **(maior ID de ação existente no bot) + 1**, que continua subindo a cada ação (de todas as transições convertidas); o espelho `'0'` acompanha `ID`. A ação "Mensagem" nova também consome um número dessa sequência. Os IDs são strings.

Só **um menu por transição** é convertido (o primeiro). Ações de transições sem menu antigo não são tocadas (mantêm os IDs); as das transições convertidas **trocam de ID**. O array final de ações sai **agrupado por transição, em ordem crescente do ID da transição** (ver risco "Ordem final das ações").

**Log:** uma linha por transição convertida: `Transição <id>: "<primeiros 50 caracteres do texto>…" (<n> opções)` (as reticências só quando o texto tem 50 ou mais caracteres). Nenhuma conversão: "Nenhum menu no formato antigo do WhatsApp foi encontrado — nada para converter."

---

## 4. Critérios de aceitação

1. Arquivo que não termina em `.json` é recusado com alerta; JSON inválido é recusado com a mensagem de erro e a tela não muda.
2. Importar mostra nome, ID, nº de estados, nº de ações e o nome do arquivo; campos ausentes aparecem como "(sem nome)" e "—".
3. "Criar bot em branco" gera o objeto da seção 2.3 (com `ID`/`NAME` vazios e os espelhos), mostra o resumo e abre o editor.
4. Baixar o bot editado usa o nome `<original>_editado.json`, indentação de 2 espaços, e mostra as pendências **depois** de baixar, sem impedir o download.
5. Trocar de arquivo volta à tela inicial sem sobras (nem resumo, nem resultado).
6. A busca da janela de transformações filtra por título e descrição curta; "Aplicar" só habilita com uma selecionada; Cancelar, X e clique no fundo fecham sem aplicar.
7. A transformação **não altera o bot original** (comparar o objeto antes e depois).
8. Menu de botões com 3 opções: vira ação "Mensagem" + menu WebChat com 3 `options` (`text`=título, `value`=id), na ordem; menu em lista com 2 seções: opções das seções em sequência.
9. Os IDs das ações da transição convertida ficam sequenciais, únicos no bot, e o espelho `'0'` bate com `ID`.
10. Menu no formato antigo malformado (JSON quebrado) é ignorado sem erro; o log diz que nada foi convertido.
11. Duas transições com menu antigo geram duas linhas de log e ambas são convertidas.
12. Baixar o convertido usa `<original>_convertido.json` e contém o bot transformado, **não** o que está em edição.
13. **[UI]** Todo texto vindo do JSON (nome do bot, termos de busca) é inserido com `escapeHtml`/`textContent`.

---

## 5. Riscos e pontos em aberto

| Item | Situação |
|---|---|
| Sem validação de estrutura | Hoje qualquer JSON válido vira "bot". Uma lista ausente pode quebrar a transformação (`data.BOT_ACTIONS.forEach`) com erro não tratado. Recomendado: validar na importação e recusar com mensagem. |
| `Math.max` de lista vazia | A transformação calcula o maior ID de ação com `Math.max(...)`; com `BOT_ACTIONS` vazio isso dá `-Infinity` e novos IDs `NaN`. Tratar lista vazia (nada a converter). Reimplementar com maior = 0 quando não houver ações. |
| Ordem final das ações | A transformação reagrupa **todas** as ações por transição (ordem crescente do ID da transição, porque as chaves são numéricas) e dentro de cada uma por ID; não reproduz a ordem física original do array. O motor lê por transição e ID, então não afeta o funcionamento, mas o arquivo muda de ordem mesmo sem menu a converter. |
| IDs renumerados | Os IDs das ações das transições convertidas mudam. Não há nada que referencie ID de **ação** em outro lugar do bot, então é seguro; vale manter assim. |
| Log com HTML | O log é inserido como HTML sem escape; o texto citado vem do bot (primeiros 50 caracteres). Usar `escapeHtml`/`textContent`. |
| Perda de edição | Trocar de arquivo ou fechar a aba perde edições não baixadas, sem aviso. |
| Dois objetos | Bot em edição e bot convertido são independentes (seção 3.3). Decisão de produto em aberto. |
