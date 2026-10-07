# Cerne · contrato do bot (para IA)

Leia isto antes de qualquer feature. Fonte completa: `../00-contrato-de-entrada.md`.

## O que é um bot aqui

Quatro listas ligadas por chave, mais alguns campos de topo:

```
BOT_STATES      {ID, STATE_NUMBER, ALIAS}
BOT_TRANSITIONS {ID, STATE → STATE_NUMBER, PRIORITY}
BOT_CONDITIONS  {ID, TRANSITION_ID, CONDITION_TYPE, CONDITION_DATA{variable, value, type?, assistant_id?}}
BOT_ACTIONS     {ID, TRANSITION_ID, ACTION_TYPE, ACTION_DATA{...}}
topo: ID, NAME, TIMEOUT_ACTION/DESTINY/MESSAGE
```

Tudo é **string**. Cada linha tem chaves numéricas espelhadas ("0","1"...): ignore ao ler, recrie com `withMirrors` ao criar.

## Invariantes (violar qualquer uma quebra a feature)

1. **`STATE_NUMBER` é a chave de ligação**, não o `ID`. Quem aponta para um estado guarda o número (`STATE`, `destiny` da ação 2, `callback_state`/`fallback_state` das 18/20/22, `TIMEOUT_DESTINY` se `TIMEOUT_ACTION='bot'`). Mexeu no número de um estado → atualize **todas** essas referências (`remapStateNumbers`).
2. **A ordem é o ID.** Condições e ações de uma transição valem por `ID` crescente; mover um item reatribui IDs. Transições do estado valem por `PRIORITY`.
3. **Tipo 0 não existe depois de salvar.** Condição ou ação de tipo 0 é descartada; transição sem condição = sempre verdadeira.
4. **Estado 0 é a entrada.** Nunca renumerar nem apagar sem avisar.
5. **O ID de cadastro vale só na instalação de origem.** Fila, agente, calendário, anexo, conta OpenAI, label... Copiar para outro ambiente = esvaziar.
6. **`{$variável}` não é cadastro** nem número de estado: preservar em qualquer lugar.
7. **Só o Salvar do editor grava no servidor.** Em memória, quem **altera** o bot: o editor, Copiar/colar, o Menu (cria/remove ações "Mensagem" ao trocar de tipo), o Gerar tratamento (cria estado, transições, condições e ações) e a página avulsa (spec 06). Testar bot, Localizar, Fluxograma e Atualização **só leem**.

## Armadilhas recorrentes

- Esquecer que o `#bv-estados` é **recriado inteiro** a cada alteração estrutural: classes e listeners colocados em elementos dele somem. Use delegação ou observe `childList`.
- Usar `document` em vez de `getRootNode()` (o editor vive num Shadow DOM).
- Usar `rem` em janela fora do editor (a página da Orpen redefine a raiz para 10px). Use `px`.
- Pôr texto do bot/cliente em `innerHTML` sem `escapeHtml`, inclusive em `data-*`.
- Criar ID com `Math.random`/contador próprio. Use `nextId`.
- Tratar `STATE_NUMBER` como número: pode ter buracos e valores como `"A1"`.

## Funções que já existem (não reescrever)

`nextId`, `withMirrors`, `remapStateNumbers`, `tipoDaCondicao`, `escapeHtml`, `parseMenuModel`, `extrairItensMenu`, `empilharEsc`, `getRootNode`, `criarIcones`, cadastros `opcoes*()` (listas `{value,label}`, vazias fora da Orpen).

Exibição de cadastro: `"Nome" (ID n)`; sem nome, `ID n`.
