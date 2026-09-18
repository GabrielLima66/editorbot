# Spec: Módulo Interceptor (`interceptor`)

## Objective
Prover uma forma segura, isolada e sem efeitos colaterais de interceptar cliques na ação "Editar" do sistema legado do ContactCenter (Orpen) para injetar o novo Editor de Bots como um overlay dentro de um Shadow DOM fechado.
Inclui o recurso de Escape Hatch: ao segurar `Shift` e clicar em "Editar", a interceptação é ignorada e o modal nativo original é acionado.

## Tech Stack
- Manifest V3 (Chrome Extension)
- JavaScript Vanilla (Isolated World + Main World)
- Shadow DOM API (`attachShadow({ mode: 'open' })`)

## Commands
- Recarregar extensão: `chrome://extensions` → botão recarregar na extensão
- Testes manuais: Abrir `ContactCenter/bot.php` e clicar no botão "Editar"

## Project Structure
```
content/
├── page-env-collector.js  # Roda no "MAIN" world, extrai variáveis globais e sessões
└── bootstrap.js           # Roda no "ISOLATED" world, intercepta cliques e cria o Shadow DOM
manifest.json              # Configura permissões e content_scripts
```

## Code Style
Código simples, defensivo com checagem de existência no DOM.
```javascript
document.addEventListener('click', (event) => {
  const btn = event.target.closest('.btn-editar-bot');
  if (!btn) return;
  if (event.shiftKey) {
    return; // Permite abrir o legado (Escape Hatch)
  }
  event.preventDefault();
  event.stopPropagation();
  abrirEditorModerno(btn.dataset.botId);
}, true);
```

## Testing Strategy
- Teste manual de clique comum: Deve abrir o editor moderno via Shadow DOM.
- Teste manual com Shift: Segurar Shift e clicar em Editar deve abrir o modal nativo legado.
- Inspeção de Estilos: Verificar se as regras CSS de fora vazam para dentro do Shadow DOM.

## Boundaries
- Always: Respeitar a tecla Shift para garantir redundância e segurança operacional.
- Ask first: Alterar padrões de URLs em `matches` do `manifest.json`.
- Never: Poluir o objeto `window` principal do sistema com variáveis globais do editor.

## Success Criteria
- [ ] O clique no botão "Editar" abre a nova interface sem quebrar o layout da página da Orpen.
- [ ] Shift+Clique ignora o editor novo e deixa a ação nativa ocorrer.
- [ ] O CSS do editor fica 100% confinado ao Shadow DOM.

## Open Questions
- Nenhuma questão aberta no momento.
