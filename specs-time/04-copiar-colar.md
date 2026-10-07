# 04 · Copiar e colar estados entre bots

Status: implementada (referência: `js/trechos.js` (puro), `js/area-copia.js`, `js/copiar-colar.js`, testes em `tests/editor/trechos.test.mjs` e `montagem.test.mjs`). Spec de nível **geral**: descreve o comportamento e as regras que não podem ser quebradas; o time detalha a interface a partir dela.

Pré-requisito: `00-contrato-de-entrada.md`.

---

## 1. Objetivo

Reaproveitar **partes de um bot em outro**: copiar um ou vários estados (com suas transições, condições e ações) do bot aberto e colá-los, em outra aba ou outro domínio de cliente, no bot que está aberto lá, escolhendo **depois de qual estado** entram, sem quebrar a numeração do que já existe.

Colar **só altera o bot em memória**. Nada vai para a Orpen até a pessoa clicar em Salvar.

### Dentro do escopo
- Copiar estados (um ou vários) e colar com escolha da posição.
- Copiar transições soltas de um estado e colar em outro estado (do mesmo bot ou de outro).
- Pré-visualizar o efeito, validar, e listar as pendências que sobram.

### Fora do escopo
- Copiar uma ação ou uma condição isolada.
- Histórico de cópias (guarda **uma** só; copiar de novo troca a anterior).
- Mover entre navegadores ou máquinas (a área de cópia vive no perfil do Chrome).

---

## 2. Onde guardar

`chrome.storage.local` da extensão, chave `editorbot_area_copia`. É da extensão (vale para todos os domínios de cliente), ao contrário do `localStorage`, que é um por domínio. **Não usar** `chrome.storage.sync` (limite de 8 KB por item, pequeno para estados com menu).

- Toda chamada a `chrome.*` em `try/catch`: quando a extensão é atualizada, abas já abertas ficam com o contexto invalidado e qualquer chamada lança. Nesse caso, avisar "Não foi possível guardar a cópia. Se a extensão foi atualizada, recarregue a página e tente de novo."
- Ao mudar o conteúdo, as **outras abas** são avisadas (`storage.onChanged`) e atualizam o indicador.

---

## 3. O trecho copiado

```jsonc
{
  "formato": "editorbot-trecho/1",
  "tipo": "estados",                // ou "transicoes"
  "estadoOrigem": null,             // só em "transicoes": o estado de onde saíram
  "origem": { "host": "cliente-a.exemplo.com", "botId": "50514", "botNome": "BOT X", "quando": 1760000000000 },
  "indice": [ { "numero": "0", "alias": "HOME", "id": "1" } ],   // TODOS os estados do bot de origem
  "linhas": { "estados": [], "transicoes": [], "condicoes": [], "acoes": [] }
}
```

- As linhas são **cópias profundas** sem as chaves numéricas espelhadas. **IDs e espelhos guardados não são confiáveis**: ao colar, tudo ganha ID novo (`nextId`) e os espelhos são refeitos (`withMirrors`).
- `indice` serve para decidir, ao colar **no mesmo bot**, se uma ligação para um estado que não foi copiado ainda é válida (seção 5.4).
- Um trecho só é válido se `formato` e `tipo` baterem e `linhas.transicoes`/`linhas.estados` forem listas. *Lacuna conhecida:* o código **não** exige que `linhas.condicoes` e `linhas.acoes` sejam listas, e um trecho sem elas passa na validação e quebra ao colar. Recomendado: validar as quatro listas.
- **Copiar transições** exige que todas sejam do **mesmo estado**.

---

## 4. Experiência de uso

### 4.1 Botão e janela

Um botão **"Copiar / colar"** na barra "Transições" (ao lado de "Adicionar") abre uma janela com duas abas. Um **pontinho laranja** no botão e na aba "Colar" avisa que há algo copiado esperando. A janela abre direto na aba **Colar** se houver estados copiados; senão, na **Copiar**.

A janela é o bloco de HTML estático `#copiar-overlay` (em `bot_transform.html`), preenchido por `js/copiar-colar.js`. Ele **precisa estar na lista de blocos que a extensão injeta** (`js/orpen-bridge.js`, ver contrato 00 seção 9.4); um bloco fora da lista funciona na página avulsa e fica morto na Orpen. Tamanhos em **px**. Clicar no fundo da janela também a fecha.

### 4.2 Aba "Copiar deste bot"
- À esquerda, a lista de estados: número, nome, quantidade de transições, com **caixa de marcar**; **busca** por número ou nome (sem acento nem maiúscula); "Selecionar os filtrados" e "Limpar seleção". Os marcados persistem enquanto a busca muda.
- À direita, o resumo do que será copiado: estados, quantidade de transições, condições e ações, e **quais estados fora da seleção são apontados** pelos copiados (ligações de Troca Estado, retorno de IA/áudio/automação). Avisa que em outro bot elas ficam em branco e neste mesmo bot continuam valendo.
- Botão **Copiar** (desligado com 0 marcados) que vira **Copiar N estados** com N ≥ 1. Ao copiar: fecha, mostra toast e acende o indicador.

### 4.3 Aba "Colar neste bot"
- Sem nada copiado: mensagem explicando como copiar. Com **transições** copiadas: avisa que são transições soltas e que se colam dentro de um estado ("Colar transições").
- Com **estados** copiados: à esquerda, a lista **"No fim da lista"** (marcada, "nenhum estado é renumerado") e uma opção **"depois de N"** para cada estado do bot de destino (busca igual à da outra aba; estados com número **não numérico** ficam desativados). À direita, a **prévia** (seção 6).
- Botão **Colar** (desligado se a validação falhar). Um link **Esquecer** limpa a área de cópia.
- Depois de colar: janela fecha, o editor refaz a lista, o primeiro estado colado abre e rola até o topo com destaque, toast "N estados colados; M estados mudaram de número. Ainda não salvo." (com 1 estado diz "Estado colado"; a parte "mudaram de número" só aparece se M > 0), e se sobrarem pendências abre a lista (seção 7).

### 4.4 Transições soltas
- Um ícone **copiar** na barra de cada transição.
- Um botão **"Colar transições"** em cada estado, ao lado de "+ Transição", visível **só** quando o que está copiado são transições. As transições entram **no fim** do estado.

---

## 5. Regras de colagem de estados (`colarTrecho`)

### 5.0 Interface das funções (módulo puro `js/trechos.js`, sem DOM)

```js
extrairTrecho(bot, { estados: ['3','4'] } | { transicoes: ['12','15'] }, { host, botId, botNome }) → trecho
   // não altera o bot; lança Error se nada selecionado ou se as transições forem de estados diferentes
trechoValido(trecho) → boolean
colarTrecho(bot, trecho, { estadoDestino, depoisDe = null, mesmoBot = false, esvaziarAmbiente = false }) → resultado
   // MUTA bot; lança Error('Trecho inválido.') / 'Estado de referência não existe neste bot.' / 'Estado de destino não existe neste bot.'
simularColagem(bot, trecho, mesmasOpcoes) → { ok, erros: string[], resultado, mudancas }
   // trabalha numa cópia; não altera o bot
```
- `estadoDestino`: obrigatório para trechos de transições (número do estado que as recebe).
- `depoisDe`: número (string) do estado depois do qual os colados entram; sem ele entram no fim.
- `mesmoBot`: **quem chama** calcula (seção 5.4); o padrão é `false`, e nesse caso toda referência a estado não copiado é esvaziada.
- `esvaziarAmbiente`: `true` quando o host de origem difere do atual (seção 5.5).
- `resultado` = `{ estadosNovos: ['5','6'], transicoesNovas: [ids], soltas: [{transitionId, actionId, campo, valorOriginal}], ambiente: [{transitionId, itemId, tipoItem, campo}], deslocados: [{de, para}] }`.
- `mudancas` = estados que **já existiam** e mudaram de número, no formato usado pelo aviso de renumeração do Salvar.

### 5.0.1 Numeração dos estados colados
Os estados do trecho são ordenados pelo número original (numérico crescente) e recebem números **numéricos** consecutivos (`N+1…` ou o maior existente + 1…). Isso vale também para o estado `0` e para números não numéricos do trecho (`"A1"`): no bot de destino todos ganham número numérico novo; o estado `0` do destino **nunca** é afetado. Colar um estado que era o `0` de outro bot não substitui nem muda o `0` do destino.

### 5.1 Onde entram
- **No fim:** os estados colados recebem os números seguintes ao **maior número numérico** existente. Ninguém é renumerado.
- **Depois do estado N** (N precisa existir e ser numérico): todo estado **numérico maior que N sobe `k` casas** (`k` = quantos estados serão colados) e **todas as referências a eles** são reescritas (`remapStateNumbers`: `STATE`, `destiny`, `callback_state`, `fallback_state`, `TIMEOUT_DESTINY`). **Só depois** os colados entram, numerados `N+1 … N+k` (na ordem dos números originais), e são inseridos no array logo depois do estado N. O estado `0` nunca muda de número. Estados não numéricos (`"A1"`) não são deslocados.
- **Ordem importante:** primeiro abrir espaço, depois inserir; o mapa dos colados é aplicado **só neles** (para não remapear duas vezes).

### 5.2 O que é copiado para cada estado
Estado, transições (mesma `PRIORITY` e ordem), condições e ações, tudo com IDs novos. Condições e ações são coladas **na ordem de ID da origem** (o motor lê por ID).

### 5.3 Ligações com estados (campos que guardam número de estado)
Para cada uma na ação colada:
- vazia ou `{$variável}` → fica como está;
- aponta para um estado **que também foi copiado** → vai para o novo número dele;
- aponta para um estado **que não foi copiado**:
  - **neste mesmo bot** e o estado continua sendo o mesmo (mesmo número, **mesmo nome e mesmo ID de linha** do trecho) → mantém (acompanhando o deslocamento);
  - em outro bot, ou se mudou → **vira vazia** e entra na lista de "soltas" (aponta para outro estado sem aviso, se mantiver).

### 5.4 "Mesmo bot"
Mesmo `host` e mesmo `botId` não vazio entre a origem do trecho e o bot aberto.

### 5.5 Outro ambiente
Quando o `host` da origem difere do atual, **esvaziar** os campos que guardam cadastro (contrato, seção 3, e a lista usada na tela de pendências): ações 4, 5, 6, 7, 9, 12, 14, 15, 17, 18, 22 (campos listados no contrato) e labels da ação 16; em condições, o `CONDITION_TYPE` das variáveis de cadastro (fila, agente, calendário, status CRM, entrada), a lista de labels (tipo 18) e `assistant_id`. **Preservar `{$variável}`.** Cada campo esvaziado vira uma pendência. No mesmo ambiente nada é esvaziado.

### 5.6 Colar transições
Entram no fim do estado de destino (`PRIORITY` = maior + 1, em sequência). Uma ligação para o **estado de origem** das transições passa a apontar para o **estado de destino** ("este mesmo estado"); as demais seguem as regras de 5.3 e 5.5.

---

## 6. Validação e prévia (`simularColagem`)

Antes de colar, **ensaiar a colagem numa cópia do bot** e só aplicar no bot de verdade se o ensaio passar (e usando exatamente as mesmas opções). O ensaio verifica, **só o que é novo**:
- números de estado continuam únicos;
- toda transição aponta para um estado existente;
- nenhuma ligação nova aponta para estado inexistente (variáveis `{$x}` são aceitas);
- o timeout (`TIMEOUT_DESTINY`) continua apontando para um estado existente, **verificado só quando `TIMEOUT_ACTION` é `"bot"`** (nos outros modos esse campo guarda fila ou status, e a renumeração também só o reescreve nesse modo);
- o estado **0 não muda** (continua o mesmo estado);
- se a numeração era contínua (0, 1, 2…), continua contínua;
- os estados continuam em ordem crescente no array.

A prévia mostra: os números com que os estados entram; **quais estados existentes mudam de número** (lista "de → para", até 10 e "e mais N") com o aviso de que ao salvar aparece o aviso de renumeração e de que o failover de entradas e a inatividade (configurações do ContactCenter) guardam número de estado e **não são atualizados**; quantas ligações ficam em branco e quantos campos de cadastro serão esvaziados. Em caso de falha: bloco de erro com os motivos e o botão Colar desligado.

> O aviso de renumeração do Salvar enxerga **só os estados que já existiam e mudaram de número**; os colados não contam como "renumerados".

---

## 7. Pendências depois de colar

Reaproveitar a tela de pendências do editor com textos próprios: título "Para conferir depois de colar" e a explicação de que os campos ficaram em branco por apontarem para algo que não existe aqui. Cada linha: `Estado [n] nome → Transição nº p → Ação/Condição nº i (tipo): configurar <campo>`. Para condições o "tipo" é sempre a palavra "Condição". Para ligações de estado o rótulo depende do campo: "Estado de destino" (ação 2), "Estado de retorno (callback)" e "Estado de falha (fallback)" (ações 18, 20, 22), seguido de "(era o estado N no bot de origem, que não foi copiado)". Para cadastros: o rótulo do campo (`CAMPOS_PENDENCIA_POR_TIPO`).

**O Salvar bloqueia** uma condição de cadastro (fila, agente, calendário, status CRM, entrada) **sem o cadastro escolhido**: o servidor a descartaria (tipo 0) e a transição passaria a valer sempre. A mensagem diz em qual estado e transição.

---

## 8. Critérios de aceitação (casos testáveis em Node)

1. Colar no fim: os colados recebem os números seguintes ao maior; **nada existente muda** (estados, transições, ações idênticos antes e depois).
2. Colar depois do 1 em um bot 0..5 com 2 estados: colados `2` e `3`; antigos `2..5` viram `4..7` com o mesmo ID e nome; as ligações e o `TIMEOUT_DESTINY` dos antigos acompanham.
3. Depois do último estado equivale a colar no fim.
4. `depoisDe` inexistente ou não numérico é recusado; estados `"A1"`/`"B2"` não são deslocados nem quebram.
5. IDs únicos em cada tabela; espelhos refeitos só nas linhas coladas; `PRIORITY` e ordem preservadas por estado; nenhuma condição ou ação órfã.
6. Ligação para estado copiado é remapeada; para não copiado, em outro bot, vira vazia e aparece em "soltas"; no mesmo bot e com o estado igual, é mantida e acompanha o deslocamento; se o nome (ou o ID de linha) mudou desde a cópia, esvazia.
7. `{$variável}` em campo de estado é mantida em qualquer caso.
8. Outro domínio: campos de cadastro esvaziados nas ações e condições citadas; `{$variável}` preservada; no mesmo domínio, nada esvaziado.
9. Ordem de condições e ações coladas segue a do ID de origem, mesmo com o trecho embaralhado.
10. Colar transições: entram no fim, em sequência; ligação ao estado de origem vira o estado de destino; transições de estados diferentes não podem ser copiadas juntas.
11. O ensaio não altera o bot; reporta como renumerados **só** os estados que já existiam; recusa quando o estado de referência não existe.
12. O Salvar recusa condição de cadastro sem cadastro e aceita com cadastro; condições de texto com tipo 0 continuam válidas.
13. O trecho passa por JSON (ida e volta pelo storage) sem perder nada.
14. **[UI]** O botão abre a janela dentro da extensão (Shadow DOM só com os blocos injetados), com os dois blocos de lista funcionando; Esc fecha; o pontinho acende com algo copiado e outra aba é avisada.
15. **[UI]** Busca na lista (sem acento), "selecionar filtrados", e a marcação persiste ao filtrar.
16. **[UI]** Colar no meio mostra a prévia dos estados que mudam de número, bloqueia o botão quando o ensaio falha, e depois de colar o editor abre o primeiro estado novo.
17. **[UI]** Sem o ambiente da Orpen (modo avulso) a janela abre. Atenção: a área de cópia usa `chrome.storage.local`; se a página não tiver acesso a `chrome.storage` (página avulsa aberta fora da extensão), **copiar mostra "Não foi possível guardar a cópia"** e não há o que colar. Colar só funciona avulso se o storage existir.

## 9. Riscos e pontos em aberto

| Item | Situação |
|---|---|
| Limites do banco | `ACTION_DATA` aceita 4000 caracteres e `CONDITION_DATA` 1024. Um INSERT que passe disso falha e a Orpen pode responder "success" assim mesmo. Colar não aumenta o risco, mas vale conferir bots muito grandes depois de salvar. |
| Scripts | O ID do script vai embutido em textos como `{$7_campo}` e em nomes de variáveis; em outro ambiente isso **não** é esvaziado (está no meio do texto). Limitação conhecida. |
| Transição colada em outro estado | Uma Troca Estado que apontava para o estado de origem passa a apontar para o de destino (decisão de projeto, com teste). Revisar se o uso real pedir o contrário. |
| Renumeração e atendimentos em andamento | Quem está num número que mudou passa a seguir outro estado, e failover de entradas e inatividade não são atualizados. O aviso do Salvar e a prévia deixam isso claro; a escolha padrão ("No fim") evita o problema. |
| Desempenho | A aba Copiar recalcula o resumo (extrai o trecho) a cada clique numa caixa de marcar; em bots muito grandes pode pesar. |
| "Mesmo bot" | Calculado só na tela (host e `botId` iguais e não vazio), não nas funções puras. Quem usar `colarTrecho` direto precisa passar `mesmoBot`. |
