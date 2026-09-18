# Spec: Módulo State Engine (`state-engine`)

## Objective
Fornecer a lógica de negócio e manipulação de estado do fluxo de conversação do bot na interface. Isso engloba reordenação de estados, transições, condições e ações (via drag-and-drop e/ou setas), gestão de campos dependentes (autocompletar inteligente via `<datalist>`), e consistência entre as regras de execução do servidor e a representação visual (ordem de prioridade e lógica AND implícita).

## Tech Stack
- JavaScript Puro (ECMAScript)
- Manipulação de arrays complexos / mutabilidade controlada
- HTML5 Drag and Drop API

## Commands
- Teste lógico de autocompletar: Digitar em um input `[list]` e apertar Enter
- Reordenar componentes: Arrastar um estado ou transição pela alça de drag

## Project Structure
```
js/
├── state.js                   # Repositório central (`state.botCarregado`) e getters/setters
├── bot-view-interactions.js   # Interações de ordenação (Drag and Drop, setas) e CRUD
├── menu-builder.js            # Injeção e gestão dos Datalists e auto-completar inteligente
└── transformations.js         # Mutadores e formatadores (ex: remapStateNumbers)
```

## Code Style
Separação clara entre a mutação do objeto `state` e a re-renderização.
```javascript
// Exemplo conceitual de busca inteligente com Enter
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const list = document.getElementById(input.getAttribute('list'));
    const options = Array.from(list.options);
    const term = input.value.toLowerCase();
    
    // Prefix search ou substring
    const match = options.find(o => o.value.toLowerCase().startsWith(term)) 
               || options.find(o => o.value.toLowerCase().includes(term));
    
    if (match) {
      input.value = match.value;
      input.dataset.value = match.dataset.value; // Salva o ID real
    }
  }
});
```

## Testing Strategy
- Testes de Reordenação (D&D): Mover Estado A para antes do Estado C e verificar se o array em `state.botCarregado` reflete a nova ordem perfeitamente (índices 0, 1, 2, etc).
- Busca por Prefixos: Digitar fragmentos na seleção de filas e validar que o Enter "pesca" a fila correta e preserva o `data-value`.
- Lógica de Execução: Validar visualmente se uma condição `condition_type = 0` (Sempre verdadeiro) consegue se manter logicamente íntegra como fallback (última transição de um estado).

## Boundaries
- Always: Priorizar a lógica do bot legado (`priority ASC`, AND implícito nas condições).
- Ask first: Alterar nomes das chaves (`STATE`, `ID`, `condition_type`, etc.) do payload gerado.
- Never: Deixar o DOM desincronizado em relação ao `state.botCarregado`.

## Success Criteria
- [ ] Drag-and-drop funciona perfeitamente para reordenar a estrutura e atualiza o estado interno (JSON) adequadamente.
- [ ] Pressionar Enter num input com `datalist` autocompleta e seleciona o ID correto sem falhas.
- [ ] Inclusão e deleção de transições/condições/ações atualizam o objeto central e re-renderizam a UI sem vazamento de memória ou eventos duplicados.

## Open Questions
- Nenhuma questão aberta no momento.
