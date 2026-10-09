# Comece aqui

Este pacote descreve as **features** da extensão "Orpen — Editor de Bot" para o time implementar (ou reimplementar) cada uma. Leia esta página primeiro: ela diz o que é o produto, em que ordem ler e o que você NÃO precisa saber.

## 1. O que é o produto (em 5 linhas)

A Orpen tem um sistema de **bots de atendimento** (WhatsApp, WebChat etc.) cadastrados em uma tela chamada ContactCenter (`bot.php`). Editar um bot nessa tela é trabalhoso. A extensão (Chrome, Manifest V3) **substitui o modal de edição** por um editor próprio, mais claro, e acrescenta ferramentas que a Orpen não tem: **testar o bot**, **localizar**, **gerar fluxograma**, **copiar e colar estados entre bots**, editor de **menus** e importação de **JSON**. Tudo roda no navegador da pessoa. A extensão só altera o bot quando a pessoa clica em **Salvar**.

## 2. O que você NÃO precisa saber (a "caixa-preta")

Existe uma camada já pronta que **abre o bot, deixa editar, salva na Orpen e interpreta o que o servidor devolve**. Ela não está especificada aqui. As features recebem o bot já carregado em memória (um objeto JavaScript, descrito em `00-contrato-de-entrada.md`) e funções prontas para mexer nele. Se uma spec disser "o editor faz isso", é essa camada.

## 3. Ordem de leitura

1. **Esta página** e o `GLOSSARIO.md` (5 minutos).
2. **`00-contrato-de-entrada.md`** (obrigatório, todas as specs partem dele): o formato do bot, as tabelas de condições e ações, as funções prontas com assinatura, e como uma feature se liga ao editor.
3. A spec da feature que você vai fazer (tabela abaixo).
4. Para entender rápido a ideia central antes da spec completa: o resumo em `ia/` com o mesmo número.

| # | Feature | Nível de detalhe | Situação no código |
|---|---|---|---|
| 01 | Testar bot (simula o motor de bots e mostra uma conversa) | **Detalhada**, regra por regra | Implementada |
| 02 | Localizar (busca em todo o bot) | **Detalhada** | Implementada |
| 03 | Fluxograma (imagem PNG/SVG do fluxo) | **Detalhada**, com layout e cores | Implementada |
| 04 | Copiar e colar estados entre bots | Geral | Implementada |
| 05 | Menu da ação 10 (botões, lista, WebChat) e gerar tratamento | Geral | Menu e "Gerar tratamento" implementados; **"manter em dia" (seção 7) NÃO existe** |
| 06 | Importar, criar e transformar JSON (página avulsa) | Geral | Implementada |
| 07 | Aviso de versão nova, atualização e "Novidades" | Geral | Implementada |
| 08 | Analisar bot (destinos, loops e menus sem tratamento) | **Detalhada**, com catálogo de regras | Implementada |

As **detalhadas** (01, 02, 03) fogem do padrão do sistema, então estão escritas com tabelas, números exatos e casos de teste. As **gerais** descrevem comportamento e limites; o time detalha a interface a partir delas.

## 4. Como cada spec está organizada

As specs 01 a 07 terminam do mesmo jeito: **critérios de aceitação** (casos que viram teste) e **riscos / pontos em aberto** (coisas que o código atual faz de um jeito discutível ou que ainda não existem). Leia os riscos antes de implementar: eles dizem onde NÃO copiar o comportamento atual às cegas.

## 5. O código de referência

A pasta `codigo-de-referencia/` tem o código atual **com a mesma estrutura do repositório** (`js/`, `tests/editor/`, `css/`, `fluxograma/`, `content/`...). Os nomes de arquivo citados nas specs (`js/trechos.js`, `tests/editor/simulador.test.mjs`...) são caminhos dentro dela. Use para:
- **tirar dúvida** do que uma spec não diz (o código é a verdade do que existe hoje);
- **reaproveitar** as funções puras (simulador, busca, trechos, pipeline do fluxograma);
- **rodar os testes**: `node --test "tests/editor/*.test.mjs"` (sem instalar nada; testado com Node 24, qualquer versão que tenha `node --test` e ES modules deve servir). Na cópia do pacote rodam **140 testes, todos passando**; no repositório original rodam 152, porque 12 usam exports de bots reais de clientes (`fluxograma/tests/golden_local/`, que não vai no pacote). No fluxograma: `cd fluxograma && npm install && npx vitest run`.

Se spec e código divergirem: o **código** é a verdade do que existe hoje; a **spec** é a verdade do que se quer, e os trechos de "Riscos / pontos em aberto" e "Ainda não implementado" dizem onde elas diferem de propósito. Nos demais casos, trate a divergência como erro da spec e avise quem mantém o pacote.

### Arquivos de apoio em `codigo-de-referencia/` que são **históricos**

`SPEC-*.md` (busca, editor-ui, state-engine, adapter, interceptor, tema, tratamento-de-menu, exportar-fluxograma), `bot-engine-spec.md` e `DOCUMENTACAO_EXTENSAO.md` são anteriores a estas specs. Servem de contexto e de histórico de decisões, mas **podem estar desatualizados**; quando divergirem destas specs, valem estas (ex.: o `SPEC-tratamento-menu.md` diz que trocar o destino "pede confirmação", e hoje o código só avisa; vale a spec 05, seção 6.4).

Para carregar a extensão no Chrome e ver tudo funcionando: `chrome://extensions` → modo desenvolvedor → "Carregar sem compactação" → escolher a pasta `codigo-de-referencia/` (ela tem `manifest.json`, `icons/` e `vendor/`).

## 6. Regras que valem para tudo (resumo; o detalhe está no contrato, seção 8)

- Elementos do editor se buscam com `getRootNode()`, nunca com `document` (o editor roda em Shadow DOM).
- Tamanhos de janelas e painéis em **px**, não `rem` (a página da Orpen muda a fonte base para 10 px).
- Cores só por **tokens** (`var(--accent)`...), para funcionar nos temas claro e escuro.
- Todo texto que vem do bot ou da pessoa passa por **`escapeHtml`** antes de entrar em `innerHTML`.
- Features que não editam **só leem** o bot. Quem altera em memória: o editor, Copiar/colar, Menu, Gerar tratamento e a página avulsa (detalhe no contrato, seção 8.5).
- **Nada grava na Orpen** exceto o botão Salvar.
- Lógica em módulos **puros** (sem DOM, testáveis em Node); a tela é uma camada fina por cima.

## 7. O que a Orpen faz de diferente (leia uma vez)

- O bot é **salvo por inteiro**: o servidor apaga e regrava tudo, e refaz os IDs. Não existe edição parcial.
- A **ordem** de condições e ações dentro de uma transição é a ordem do **ID**. Mover um item reatribui IDs.
- Cada linha do bot tem chaves numéricas **espelhadas** (`"0"`, `"1"`…). Ao criar linhas novas, use `withMirrors`.
- O **motor** (o programa do servidor que executa o bot) tem manias que o simulador (spec 01) imita de propósito: igualdade frouxa, "0" como mensagem vazia, texto da mensagem escapado, etc. Não "conserte" isso no simulador.

## 8. Dúvidas e lacunas

Achou algo que a spec não responde? Anote em uma lista e mande para quem mantém o pacote. Os pontos em aberto já conhecidos estão nas seções "Riscos" de cada spec.
