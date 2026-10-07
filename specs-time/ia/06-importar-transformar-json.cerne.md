# Cerne · Importar, criar e transformar JSON (para IA)

Spec completa: `../06-importar-transformar-json.md`. Código: `bot_transform.html`, `js/upload.js`, `js/transformations.js`, `js/transform-modal.js`. Antes, leia `00-contrato.cerne.md`.

## Em uma frase

Página **sem Orpen**: carrega um `.json` de bot (ou cria um em branco), deixa editar no editor visual, aplica transformações automáticas e **baixa** o arquivo. Nada vai para servidor.

## Invariantes

1. **Tudo em memória**; o fim do caminho é o download. Não existe "salvar na Orpen" aqui.
2. **Bot em branco** nasce com `ID` e `NAME` **vazios de propósito** (a pessoa tem de definir o ID real; evita colisão no destino), espelhos numéricos `'0'..'8'` e as quatro listas vazias.
3. **Pendências avisam depois do download, não bloqueiam.**
4. **Transformação é pura**: `fn(bot) → {data, log}` sobre um clone; o original não muda. O resultado convertido é um objeto **separado** do bot em edição.
5. Catálogo extensível: um item `{id, icone, titulo, descricaoCurta, descricaoLonga, fn}`; a lista e a busca vêm do catálogo.
6. Importação é permissiva: só exige extensão `.json` e JSON válido. Estrutura não é validada (risco conhecido).

## Transformação "menu WhatsApp → WebChat"

Por transição (ações ordenadas por ID): primeira ação 10 com `{"interactive":…}` → (a) cria ação 1 com `body.text` **antes** do menu; (b) opções: botões → `{text:reply.title, value:reply.id}`; lista → todas as linhas de todas as seções, em ordem; (c) menu vira `{"message_type":"menu","menu_type":"list","options":[…]}` (indentado, 2 espaços), substituindo `ACTION_DATA` inteiro; (d) renumera os IDs das ações da transição: o contador começa no maior ID do bot e é incrementado antes de cada uso; a ação 1 nova consome o primeiro número (maior+1) e a transição é renumerada com os seguintes, então o primeiro ID gravado é **maior+2** (há um buraco). Um menu por transição. Log: `Transição <id>: "<50 chars>…" (<n> opções)`.

## Armadilhas

- `Math.max(...[])` → `-Infinity`/`NaN` com `BOT_ACTIONS` vazio.
- Chaves numéricas de objeto JS reordenam as transições (ordem final = ID crescente da transição).
- Log inserido como HTML sem escape (o texto vem do bot).
- Esquecer o espelho `'0'` ao mudar `ID`.
- Descartar o resultado da transformação ao fechar a janela (ele fica em `botTransformado`).
- Perder edição ao trocar de arquivo (sem aviso hoje). A troca não zera `botTransformado` na memória, só esconde o resultado.
- A página **não tem ponto de entrada** na interface da extensão (abre-se por `chrome-extension://<id>/bot_transform.html`); o botão "Backup JSON" é do editor, o "Baixar JSON convertido" é da página.

## Validar

Testar a transformação como função pura (clone, 3 botões, lista com 2 seções, JSON quebrado ignorado, duas transições, IDs únicos e espelhados). Em tela: soltar um export real, converter, baixar os dois arquivos e importar o convertido no editor.
