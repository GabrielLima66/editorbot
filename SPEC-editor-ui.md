# Spec: Módulo Editor UI (`editor-ui`)

## Objective
Renderizar a interface visual moderna do Editor de Bot dentro do Shadow DOM: um modal de tela cheia com hierarquia clara (Bot → Estado → Transição → Condição/Ação), priorizando densidade de informação sem perder legibilidade. É a tela mais usada da extensão.

## Tech Stack
- HTML + CSS puro (sem framework de componentes), dentro de Shadow DOM
- JavaScript puro (`bot-view-render.js` para renderização, `bot-view-interactions.js` para eventos)
- Ícones Lucide (`vendor/lucide.umd.js`), injetados manualmente dentro do Shadow DOM
- Fontes: Space Grotesk (headings) / IBM Plex Sans (corpo)

## Commands
- Recarregar extensão: `chrome://extensions` → recarregar
- Visual check: abrir `bot_transform.html` isoladamente para testes de layout fora do fluxo da extensão

## Project Structure
```
js/
├── bot-view-render.js         # Monta o DOM do modal a partir do state.botCarregado
├── bot-view-interactions.js   # Listeners de clique, drag, expand/collapse
├── dom-root.js                # Cria/gerencia o Shadow DOM root
└── menu-builder.js            # Monta datalists/selects de busca (agentes, filas, scripts)
css/                            # Estilos do editor (tokens + utilitárias)
bot_transform.html              # Shell HTML do editor
```

## Code Style
Tokens de design centralizados em variáveis CSS; classes utilitárias simples (não Tailwind neste contexto).
```css
:root {
  --obd-bg: #15131C;
  --obd-panel: #1C1A24;
  --obd-surface: #201E28;
  --obd-border: #2A2833;
  --accent: #8377FF;
  --warn: #F0983D;
  --danger: #E5484D;
  --success: #34D399;
  --text: #EBE9F3;
  --text-muted: #948FA6;
}
```

## Testing Strategy
- Checagem visual manual comparando com os tokens do handoff (`handoff-editar-bot.md`).
- Verificar que nenhuma regra CSS da Orpen (Bootstrap/Metronic) vaza para dentro do Shadow DOM, e vice-versa.
- Testar em resolução desktop padrão (>=1200px) — sem necessidade de breakpoints mobile.

## Boundaries
- Always: Seguir a hierarquia visual bot → estado → transição → condição/ação definida no handoff.
- Ask first: Alterar a paleta de cores/tokens definidos em `handoff-editar-bot.md`.
- Never: Vazar estilos do editor para fora do Shadow DOM ou vice-versa.

## Success Criteria
- [ ] O modal renderiza corretamente Header, Body (rolável) e Footer (fixo) sem cortes de layout (considerando o `zoom: 1.15` da Orpen).
- [ ] Cada estado expandido exibe condições e ações lado a lado em duas colunas.
- [ ] Ícones Lucide aparecem corretamente dentro do Shadow DOM.
- [ ] Nenhum vazamento de CSS em ambas as direções (Orpen ↔ Editor).

## Open Questions
- Nenhuma questão aberta no momento.
