# SPEC: Gerar tratamento do menu (estado CTRL)

Status: **Fases 1 e 2 implementadas, aguardando teste do usuário** (24/09/2026). Fase 3 pendente.

## Problema

Criar um bot do zero é lento principalmente por causa dos menus. Configurar o menu já ficou fácil com o modal (v0.6.0). Mas depois é preciso montar à mão um estado de controle com uma transição por opção, o tratamento de opção inválida e o limite de erros. É repetitivo e fácil de errar: se esquecer o limite, o cliente fica preso num loop infinito de "opção inválida".

## Objetivo

Um botão no menu gera esse estado de controle pronto, no mesmo formato que os bots de produção já usam. Nada muda no formato gravado: são estados, transições, condições e ações comuns, iguais às criadas à mão.

## Padrão gerado

Referência: export `20260924_042755_teste.json`, montado à mão pelo usuário, e os estados CTRL dos bots reais (`CTRL_MINIMENU` do Parque Lage, `CTRL COLETA SEXO` do 50514).

Estado de origem (ex.: HOME), na transição do menu:

```
[Mensagem Options: menu]  →  [Troca Estado → CTRL - HOME]
```

Estado `CTRL - HOME`, para um menu com N opções:

| Prior. | Condições | Ações |
|---|---|---|
| 0..N-1 | MENSAGEM **Igual a** `<ID da opção>` | nenhuma (o usuário completa) |
| N | MENSAGEM **Contém** `""` **E** Contador de Erros **Maior-igual** `2` | Ação de limite (ver abaixo) |
| N+1 | MENSAGEM **Contém** `""` | Contador de Erros: Incrementar + **cópia do menu** |

- A condição compara o **ID** (WhatsApp) ou o **valor** (WebChat) da opção, nunca o texto. O texto pode mudar, o ID não.
- A T N+1 reenvia o menu com uma **cópia do JSON** da ação original. Uma "Troca Estado" de volta não reenviaria nada até a próxima mensagem do cliente. No WebChat, a cópia leva também a ação "Mensagem" que vem antes do menu.
- A ordem importa: o limite (N) vem antes do fallback (N+1). Senão o fallback captura tudo e o limite nunca dispara.

### Formato exato dos registros (copiado do export da Orpen)

```js
// opção
{ CONDITION_TYPE: '1', CONDITION_DATA: { variable: 'message', type: '1', value: '<id>' } }
// "qualquer mensagem"
{ CONDITION_TYPE: '2', CONDITION_DATA: { variable: 'message', type: '1', value: '' } }
// limite de erros
{ CONDITION_TYPE: '7', CONDITION_DATA: { variable: 'error_count', type: '1', value: '2' } }
// ações
{ ACTION_TYPE: '8',  ACTION_DATA: { error_count: 'add' | 'reset' } }
{ ACTION_TYPE: '10', ACTION_DATA: { message_option_text: '<cópia do JSON>' } }
{ ACTION_TYPE: '2',  ACTION_DATA: { destiny: '<STATE_NUMBER>' } }
```

Tudo é criado pelos mesmos caminhos do editor (`nextId`, `withMirrors`, renumeração por ID como em `dividirMensagemDoMenu`).

## Fluxo na tela

1. No cartão de resumo do menu entra o botão **"Gerar tratamento"**. Ele fica desabilitado, com o motivo no tooltip, se o menu não tiver opções ou tiver IDs repetidos.
2. Ao clicar, abre um diálogo curto:
   - **Nome do estado**: padrão `CTRL - <nome da origem>`. Se o nome já existir, ganha ` 2`, ` 3`...
   - **Limite de erros**: padrão `2`.
   - **Ao estourar o limite**:
     - *Mensagem + Transferir para fila* (padrão: é o que 4 de 5 bots reais fazem). Escolhe a fila e edita a mensagem.
     - *Finalizar atendimento*.
     - *Trocar para o estado...*
     - *Deixar em branco*: a transição fica sem ações, para completar depois.
   - A mensagem padrão acompanha a ação escolhida enquanto não for editada. Fila ou status CRM não escolhidos criam a ação com o campo vazio, e ela aparece nas pendências. As transições das opções ficam vazias, como no padrão manual. A tela de pendências não ganhou regra de "transição sem ação", porque passaria a travar o salvamento de bots existentes.
   - Prévia das N+2 transições que serão criadas.
3. Ao confirmar, tudo é criado de uma vez. O estado novo aparece aberto e com scroll até ele, e o toast lembra de salvar o bot.

### Se a transição do menu já tiver "Troca Estado"

- Se apontar para um estado **que já tem tratamento deste menu** (ver "Vínculo"), o botão vira **"Atualizar tratamento"**.
- Se apontar para **outro estado**, o diálogo avisa ("Esta transição já leva para X") e pede confirmação para trocar o destino. Não troca sem perguntar.
- Se não houver, a "Troca Estado" é inserida logo depois do menu. As ações da transição de origem são renumeradas, como em `dividirMensagemDoMenu`.

## Vínculo menu ↔ tratamento

Nada novo é gravado. O vínculo é **deduzido**: é o destino da "Troca Estado" que vem depois do menu, desde que esse estado tenha ao menos uma transição `MENSAGEM Igual a <ID>` com um ID deste menu. Por isso funciona também em bots antigos montados à mão, como o `CTRL_MINIMENU`.

## Manter em dia (Fase 3)

- **"Atualizar tratamento"**:
  - cria as transições das opções novas antes do limite;
  - **não apaga nada**: transição de opção que saiu do menu ganha a marca "opção não existe mais no menu", e o usuário decide;
  - atualiza a cópia do menu no fallback.
- **Salvar no modal do menu**: se houver tratamento vinculado, a cópia do fallback é atualizada junto. O toast avisa: "Menu atualizado também em CTRL - HOME".

## Fora do escopo

- Preencher o que cada opção faz. Isso é decisão de negócio e fica para o usuário, com ajuda das pendências.
- Gerar tratamento para menus em formato não reconhecido (builder antigo).
- Palavra-chave global tipo "Atendente" (padrão do 50514). Pode virar opção depois.

## Fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 1 | Botão + diálogo + geração (opções, limite com "deixar em branco", fallback com cópia do menu), nos 3 tipos de menu | O estado gerado a partir do menu do export de teste bate registro a registro com o que o usuário montou à mão (mais a cópia do menu e o limite) |
| 2 | Ações de limite (fila, finalizar, trocar estado) + conflito com "Troca Estado" existente | Testado nos bots reais sem alterar nada fora do estado novo e da transição de origem |
| 3 | Vínculo deduzido, "Atualizar tratamento" e sincronização da cópia ao salvar o menu | Detecta o `CTRL_MINIMENU` do Parque Lage como vinculado; opção nova e removida tratadas |

Validação em todas as fases:
- teste Node do gerador com os fixtures reais;
- fluxo no Chrome (standalone, Playwright);
- exportar o fluxograma com o estado gerado;
- teste do usuário na Orpen.

## Pontos a confirmar no teste real

- Com a condição pelo ID, a resposta ao botão ou à lista dispara a transição certa. É o que o Parque Lage faz em produção.
- A "Troca Estado" logo após o menu e o reenvio pelo fallback funcionam como esperado.
