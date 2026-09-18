# Capability Map: Extensão Editor de Bot (EDITOR_BOT)

| Module ID | Responsabilidade | Depende de |
|---|---|---|
| `interceptor` | Content Script (Manifest V3), Escape Hatch (Shift+Click), injeção do Shadow DOM | — |
| `orpen-adapter` | Comunicação com o servidor (`getBot`, serialização bracket-notation, `updateBot`) | — |
| `editor-ui` | Layout do modal (Header, Config, Lista de Estados, Footer), design tokens, ícones Lucide | `interceptor` |
| `state-engine` | Manipulação das transições, condições, ações (UX de reordenar, auto-completar com Enter) | `editor-ui`, `orpen-adapter` |

**Build Order:** `interceptor` → `orpen-adapter` → `editor-ui` → `state-engine`
