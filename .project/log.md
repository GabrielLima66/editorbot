# Log de Execução — EDITOR_BOT

Iniciado em: 17/09/2026, 17:18:57

## 📌 Resumo Executivo do Estado Atual (Atualizado a Cada Marco)
> **Atenção Agentes:** Para economizar contexto, leiam apenas este bloco inicial (linhas 1-30) ao retomar o projeto.
- **Fase Atual:** Tema claro entregue na **v0.5.0** (24/09/2026), junto com ajustes de UX no editor
- **Última Tarefa Concluída:** Tema claro alternável (sol/lua, padrão escuro), cores em tokens (escuro idêntico por captura), barra da transição, nome do estado como título editável, número da transição distinto do estado. CHANGELOG, DOCUMENTACAO (seção 6) e zip
- **Próxima Tarefa em Aberto:** Nenhuma pendência técnica. O push é feito pelo usuário (o modo automático do Claude Code bloqueia push)

---

## Legenda

| Ícone | Tipo | Descrição |
|:---:|---|---|
| 🔵 | DECISÃO | Decisão técnica ou de negócio tomada |
| 🟢 | PROGRESSO | Avanço em tarefa ou etapa |
| 🔴 | PROBLEMA | Impedimento ou bug identificado |
| 🟡 | SUPOSIÇÃO | Hipótese adotada (ASM-xxx) |
| 🏁 | MARCO | Entrega ou milestone atingido |
| 📝 | NOTA | Observação geral |

---

<!-- LOG_ENTRIES -->
### 24/09/2026 — 🏁 MARCO

v0.5.0: tema claro "sem flashbang" alternável (padrão escuro) + ajustes de UX no editor pedidos durante o teste. Tudo testado pelo usuário na bot.php real: funcional.

---
### 24/09/2026 — 🏁 MARCO

Exportar fluxograma entregue na v0.4.0. O teste manual da Fase 3 (débito de 23/09) foi feito pelo usuário na bot.php: gerar PNG/SVG, salvar antes de gerar (Cancelar/Esc/Salvar e gerar), desfazer sem aviso, bot novo desabilitado, bot externo com nome e regressão rápida. Bot salvo sem estados passou a mostrar mensagem clara.

---
### 23/09/2026 — 🟡 SUPOSIÇÃO (débito)

Teste manual da Fase 3 na bot.php real adiado a pedido do usuário (fora do PC). O código está completo e coberto por testes automatizados, mas nada da integração com o editor (botão, diálogo, salvar antes, download) foi exercitado na Orpen ainda. O branch `feat/exportar-fluxograma` fica fora do main até esse teste.

---
### 23/09/2026 — 🏁 MARCO

Fase 2 concluída: o renderizador da extensão gera PNG e SVG pixel a pixel idênticos aos do desktop (22 casos, incluindo 5 bots reais), verificado automaticamente contra o build real do Fluxo BOT num Chrome real.

---
### 23/09/2026 — 🔵 DECISÃO

Nomes de fila/bot externo/calendário vindos do ambiente entram como dado real do nó, não como override manual ("como temos as informações corretas, não precisamos mais alterar nome de filas"). Evita também um bug do desktop, em que o override desenha fila e bot externo com os asteriscos crus.

---
### 23/09/2026 — 🏁 MARCO

Fase 1 da exportação de fluxograma concluída: pipeline Python do Fluxo BOT portado para TS com paridade provada por goldens (103 testes; teste de mutação confirma que divergências sutis de strip/splitlines são pegas).

---
### 23/09/2026 — 📝 NOTA

A ordem das transições muda o layout. O `getBot` da Orpen ordena (estado, prioridade, ID); o `exportBotJSON` nativo não tem ORDER BY. Comparação com o desktop deve usar o "Backup JSON" da extensão dos dois lados, não o export nativo.

---
### 23/09/2026 — 🏁 MARCO

Fase 0 da exportação de fluxograma concluída. Todas as premissas técnicas validadas na bot.php real, incluindo a correspondência de fila, bot externo e calendário com os cadastros do ambiente. Detalhes na SPEC-exportar-fluxograma.md, seção "Resultado da Fase 0".

---
### 23/09/2026 — 🔵 DECISÃO

Iframe do renderizador fica na tela, invisível (variante b: `opacity:0; pointer-events:none`). Fora da tela o Chrome congela o iframe (`fps: 0`) e o fluxograma nunca desenha.

---
### 23/09/2026 — 🔴 PROBLEMA (resolvido)

A fonte Inter não estava carregada quando o `layout.ts` media os cards: `document.fonts.ready` resolve na hora se nenhum texto usou a fonte ainda. Corrigido com `document.fonts.load()` explícito antes do layout (item incorporado à Fase 2 da spec).

---
### 23/09/2026 — 📝 NOTA

Bot sintético de 245 nós / 289 arestas: PNG em ~10 s (14 MB, altura limitada a 16.384 px, igual ao desktop); SVG em ~6 s (15,6 MB, dos quais ~14,5 MB são estilos inline do html-to-image, também igual ao desktop).

---
### 17/09/2026, 17:27:56 — 🏁 MARCO

SPEC-state-engine aprovado com ajustes. Fase 1 finalizada para todos os módulos do Capability Map!

---
### 17/09/2026, 17:27:10 — 🔵 DECISÃO

Ajuste no state-engine: a ordenação suporta tanto setas (▲▼) quanto drag-and-drop

---
### 17/09/2026, 17:25:20 — 🔵 DECISÃO

SPEC-editor-ui aprovado. Iniciando especificação de state-engine

---
### 17/09/2026, 17:24:12 — 🔵 DECISÃO

SPEC-orpen-adapter aprovado. Iniciando especificação de editor-ui

---
### 17/09/2026, 17:23:05 — 🔵 DECISÃO

SPEC-interceptor aprovado. Iniciando especificação de orpen-adapter

---
### 17/09/2026, 17:21:15 — 🏁 MARCO

Capability Map aprovado: interceptor, orpen-adapter, editor-ui, state-engine (build order definido)

---
