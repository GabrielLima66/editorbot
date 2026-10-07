# Cerne · Copiar e colar estados (para IA)

Spec completa: `../04-copiar-colar.md`. Código: `js/trechos.js` (lógica pura, testável em Node), `js/area-copia.js` (storage), `js/copiar-colar.js` (janela). Antes, leia `00-contrato.cerne.md`.

## Em uma frase

Copia estados (ou transições soltas) de um bot e os cola em **outro** (outra aba, outro cliente), escolhendo depois de qual estado entram, **sem quebrar a numeração** e deixando claro o que ficou em branco. Só mexe no bot em memória.

## Invariantes

1. **Tudo que entra ganha ID novo** (`nextId`) e espelhos refeitos (`withMirrors`). IDs e espelhos do trecho não valem nada.
2. **Abrir espaço antes de inserir.** Colar "depois de N" desloca `+k` todo estado **numérico** maior que N e reescreve **todas** as referências (`remapStateNumbers`); só depois numera os colados `N+1..N+k` e os insere logo depois do N no array. O estado 0 nunca muda; estado não numérico nunca é deslocado.
3. **Ensaiar numa cópia** (`simularColagem`) e só aplicar se passar: números únicos, transições e ligações novas apontando para estado existente, `TIMEOUT_DESTINY` válido, estado 0 intacto, continuidade preservada, array em ordem. Usar **as mesmas opções** no ensaio e na aplicação.
4. **Ligação para estado fora do trecho:** mesmo bot **e** mesmo estado (número + nome + ID de linha) → mantém; senão → esvazia e vira pendência. `{$variável}` sempre mantida.
5. **Outro ambiente** (host diferente) → esvaziar campos de cadastro (fila, agente, calendário, status, entrada, labels, assistant). Mesmo ambiente → não esvaziar nada.
6. **Condição/ação coladas na ordem do ID de origem** (o motor lê por ID).
7. O Salvar bloqueia condição de cadastro sem cadastro (o servidor a descartaria e a transição passaria a valer sempre).

## Trecho (`editorbot-trecho/1`)

`{formato, tipo:'estados'|'transicoes', estadoOrigem, origem:{host,botId,botNome,quando}, indice:[{numero,alias,id}], linhas:{estados,transicoes,condicoes,acoes}}`. Cópia profunda, sem espelhos. `indice` = todos os estados do bot de origem (decide o caso "mesmo bot").

Transições soltas: todas do **mesmo estado**; entram no fim do estado de destino; ligação ao estado de origem passa a apontar para o de destino.

## Armadilhas

- Guardar em `chrome.storage.sync` (limite 8 KB) ou `localStorage` (um por domínio). É `storage.local`.
- Chamada a `chrome.*` sem `try/catch` (contexto invalidado após atualizar a extensão).
- Janela não incluída na lista de blocos injetados: funciona avulsa, **morta na Orpen**.
- Remapear duas vezes os estados colados (aplicar o mapa só neles; o deslocamento só nos antigos).
- Contar os colados como "renumerados" no aviso do Salvar (só os que já existiam).
- `rem` na janela (usar px).
- Esquecer que no modo avulso (sem Orpen) tudo precisa funcionar igual.

## Validar

`node --test "tests/editor/*.test.mjs"` (casos de `trechos` e montagem: no fim, no meio, não numérico, mesmo bot × outro, outro ambiente, ordem, transições, JSON ida e volta). Em tela: copiar numa aba, colar em outra, conferir prévia, pontinho, Esc e que o bot só muda ao Salvar.
