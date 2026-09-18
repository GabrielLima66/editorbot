# Handoff Spec: Modal "Editar Bot"

## Overview

Modal de tela cheia (overlay) que substitui o modal nativo do ContactCenter para edição de bots. Mostra a configuração de topo do bot (identificação, timeout, integrações) e a lista de estados, onde cada estado contém uma ou mais transições — e cada transição agrupa suas condições (avaliadas em AND) e suas ações (executadas em sequência). É a tela mais usada da extensão, então prioriza densidade de informação sem perder clareza de hierarquia (bot → estado → transição → condição/ação).

Stack de implementação real: HTML + CSS (sem framework de componentes) dentro de Shadow DOM, JS puro (`bot-view-render.js`, `bot-view-interactions.js`). Os tokens abaixo assumem esse contexto (variáveis CSS + classes utilitárias simples, não Tailwind).

## Layout

- Modal `position: fixed`, `inset: 0`, painel centralizado `max-width: 1320px`, `width: 92vw`, `max-height: 92vh`.
- Estrutura vertical: **Header** (fixo) → **Body** (`flex: 1`, `overflow-y: auto`) → **Footer** (fixo).
- Body: card de configuração no topo, depois lista de estados.
- Dentro de um estado expandido: grid de 2 colunas (`grid-template-columns: 1fr 1fr; gap: 16px`) — Condições à esquerda, Ações à direita — repetida uma vez por transição.
- Sem breakpoint mobile: é uma ferramenta interna usada em desktop dentro do ContactCenter, não precisa responsividade abaixo de ~1200px.

## Design Tokens Usados

| Token | Valor | Uso |
|---|---|---|
| `--obd-bg` | `#15131C` | Fundo do modal |
| `--obd-panel` | `#1C1A24` | Card de configuração, cabeçalho de estado |
| `--obd-surface` | `#201E28` | Inputs, badges neutras, itens de condição/ação |
| `--obd-border` | `#2A2833` | Bordas padrão, divisórias |
| `--obd-border-field` | `#34313F` | Borda de inputs/selects |
| `--accent` | `#8377FF` | Botões primários, ícone "expandir/recolher", borda do estado ativo (`{{accent}}55` = 33% opacidade) |
| `--warn` | `#F0983D` | Badge de número de estado/transição, botão "duplicar" |
| `--danger` | `#E5484D` | Botão "excluir" (estado e transição) |
| `--danger-ghost-hover` | `#3A2226` bg / `#E39EA1` texto | Hover do excluir item-a-item (condição/ação) |
| `--success` | `#34D399` | Indicador "configuração válida" |
| `--text` | `#EBE9F3` | Texto principal |
| `--text-muted` | `#948FA6` | Labels, textos secundários |
| `--text-faint` | `#6E6A7E` | Hints, dicas |
| `font-heading` | Space Grotesk 600/700 | Títulos ("Editar Bot", eyebrows de seção) |
| `font-body` | IBM Plex Sans 400/500/600 | Todo o resto |
| `radius-card` | `12–14px` | Cards e blocos de estado |
| `radius-field` | `7–10px` | Inputs, badges, botões de ícone |
| `spacing-section` | `24–26px` | Entre config card e lista de estados |
| `spacing-item` | `8px` | Entre itens de condição/ação dentro de uma transição |

## Componentes

| Componente | Variante | Props/Conteúdo | Notas |
|---|---|---|---|
| Header do modal | — | Título "Editar Bot" + badge com nome do bot + botão fechar (X) | Badge é só leitura, pílula `#231F2E` |
| Config card | Bloco "Identificação" | Nome (input largo, `font-weight:600`), Número (110px), Status (pílula com dot verde) | Nome ocupa `flex:1`; Número e Status têm largura fixa |
| Config card | Bloco "Timeout" | Grid 3 colunas: Tempo p/ resposta, Ação de timeout (select), Tempo p/ entrega + hint abaixo | Eyebrow uppercase na cor `--accent` acima do grid |
| Config card | Bloco "Integrações" | Conta p/ transcrição de áudio (input, `max-width:340px`) | Último bloco, sem divisória depois |
| Divisória de seção | — | `height:1px; background:var(--obd-border)` | Separa os 3 blocos do config card |
| Linha "Transições" | — | Título + botão primário "+ Adicionar estado" | `justify-content: space-between` |
| Estado — colapsado | Default | Drag handle, badge numérico sólido (laranja), input de nome, [status ✓][duplicar][excluir][chevron ↓] | Badge = `.obd-badge-solid`; ações à direita com `margin-left:auto` |
| Estado — expandido | Ativo | Mesma linha do colapsado (chevron ↑, rotacionado, cor `--accent`) + corpo com borda `1px solid {{accent}}55` | É o único estado com destaque de borda |
| Linha de transição | — | Drag handle + badge sólido (laranja, 24px) + botão duplicar + botão excluir | Controla a transição inteira (todas as condições E ações dela juntas) — não é por condição/ação |
| Item — Condição | Default | Setas reordenar (▲▼) + campo variável + campo operador + textarea de valor + botão excluir (ghost, hover vermelho) | **Sem número próprio** — o número é da transição, não do item |
| Item — Ação | Default | Setas reordenar (▲▼) + campo tipo de ação + campos específicos da ação + botão excluir (ghost) | Mesma regra: sem número próprio |
| Botão "+ Condição" / "+ Ação" | Dashed | Largura total, borda tracejada, cor `--accent` | Um por coluna, por transição |
| Botão "+ Transição" | Dashed | Largura total, abaixo do último par Condições/Ações do estado | Adiciona uma nova transição ao estado |
| Footer do modal | — | Contador ("N estados · M transições") à esquerda, "Fechar" (ghost) + "Baixar JSON" (primário) à direita | Fixo, não rola com o body |

## Estados e Interações

| Elemento | Estado | Comportamento |
|---|---|---|
| Linha de estado | Hover | Nenhum destaque de fundo especificado — os botões de ícone (`.obd-icon-btn`) já reagem individualmente no hover |
| Botão de ícone ghost (`.obd-icon-btn`) | Hover | `background: #2A2833; color: #EBE9F3` |
| Botão de ícone ghost — variante perigo | Hover | `background: #3A2226; color: #E39EA1` |
| Botão duplicar (sólido, laranja) | Default / Hover | `#F0983D` → `#D9822E` no hover |
| Botão excluir (sólido, vermelho) | Default / Hover | `#E5484D` → `#CC3B40` no hover |
| Seta de reordenar | Hover | `background: #2A2833 → #34313F; color: #EBE9F3` |
| Botão "+ Condição/Ação/Transição" (dashed) | Hover | `background: #201E28`, borda continua tracejada |
| Chevron do estado | Clique | Alterna colapsado ↔ expandido; rotaciona 180° e muda de `#948FA6` (colapsado) para `--accent` (expandido) |
| Input "Nome" do estado | Focus | Não especificado no mock — recomendo anel de foco na cor `--accent`, 2px, consistente com os demais campos do produto |
| Botão "Baixar JSON" | Loading | Não coberto neste mock; no fluxo real (`bot_transform.html`) o padrão do produto é trocar o rótulo por um spinner inline — replicar o mesmo padrão aqui |

## Responsividade

Não é um requisito real (uso interno em desktop, dentro de uma página que já tem largura mínima). Não especificar breakpoints é intencional aqui — se algum dia rodar em tela menor, a primeira medida de emergência é deixar o grid de 2 colunas (Condições/Ações) virar 1 coluna abaixo de ~900px.

## Casos de Borda

- **Estado sem transições**: mostrar um estado vazio no lugar da lista, com CTA "+ Transição" centralizado (mesma lógica do "+ Adicionar estado", só que dentro do estado).
- **Transição sem condições**: tecnicamente inválida no motor (uma transição sem condição nunca é avaliada como "sempre verdadeira" a menos que use `condition_type = 0`) — vale um aviso inline discreto, não um erro bloqueante, já que o usuário pode estar no meio da edição.
- **Nome de estado muito longo**: o input tem `max-width` fixo (260–280px); truncar com `text-overflow: ellipsis` quando não estiver em foco, mostrar completo ao focar.
- **Textarea de valor de condição multi-linha**: o motor trata cada linha como alternativa (OR) — manter o campo como `textarea` (não `input`) é funcional, não só estético.
- **Excluir estado referenciado por "Troca Estado" de outra transição**: o produto real já trata isso com um painel de bloqueio/confirmação (`estado-alert-blocked` / `estado-alert-confirm` no CSS original) — reaproveitar esse padrão, não deixar excluir silenciosamente.
- **Muitas transições em um estado**: a lista rola dentro do body do modal; nada trava a altura do estado expandido.

## Animação / Motion

| Elemento | Gatilho | Animação | Duração | Easing |
|---|---|---|---|---|
| Chevron do estado | Expandir/recolher | Rotação 180° | ~150ms | ease |
| Corpo do estado | Expandir/recolher | Não especificado no mock — recomendo altura animada (`grid-template-rows` trick ou `max-height`) para não ser um corte seco | ~180ms | ease-out |
| Botões (todos) | Hover | Transição de cor de fundo/texto | ~120ms | ease |

## Notas de Acessibilidade

- Todo botão ícone-apenas precisa de `aria-label` (duplicar, excluir, expandir, mover para cima/baixo, configuração válida) — o mock usa `title`, que ajuda no hover mas não substitui `aria-label` para leitor de tela.
- Ordem de foco dentro de uma transição: setas de reordenar → campos → botão excluir, coluna Condições inteira antes de Ações (ou agrupar por transição, não por coluna, se isso for mais natural para quem navega por teclado).
- O badge numérico da transição é decorativo/identificador visual — não deve ser focável nem anunciado como botão.
- Contraste: `--text-muted` (`#948FA6`) sobre `--obd-panel` (`#1C1A24`) passa em 4.5:1; `--text-faint` (`#6E6A7E`) é mais justo — usar só para hints curtos, nunca para texto que carregue informação essencial.
- Botão "Excluir" (vermelho sólido) já tem contraste suficiente com texto branco; manter o ícone branco puro, não cinza.
