# Spec: Módulo Orpen Adapter (`orpen-adapter`)

## Objective
Fornecer a camada de comunicação e tradução de dados entre a interface moderna do Editor e o backend legado em PHP da plataforma Orpen (via `ajax.php`).
Ele deve:
1. Carregar bots via `action=getBot` de forma limpa (sem efeitos colaterais como geração de arquivos em disco).
2. Converter a árvore aninhada do backend em uma estrutura achatada/normalizada para a interface (`fromGetBotResponse`).
3. Converter o estado da interface em um payload compatível com a ação `action=updateBot` (`toUpdateBotPayload`).
4. Serializar objetos e arrays aninhados em `application/x-www-form-urlencoded` no padrão **Bracket-Notation** sem depender do jQuery (`serializeBracketNotation`).

## Tech Stack
- JavaScript ES6 Modules (Vanilla)
- Fetch API / XMLHttpRequest
- Algoritmo recursivo de serialização para form-urlencoded

## Commands
- Teste de serialização: `node -e "import('./js/orpen-adapter.js').then(...)"` (ou teste via Vitest caso configurado)
- Teste pontual no DevTools do navegador: `serializeBracketNotation({ a: [{ b: 1 }] })`

## Project Structure
```
js/
├── orpen-adapter.js  # Funções puras de transformação de dados e serialização
├── orpen-bridge.js   # Dispara requisições fetch/ajax reais usando o adapter
└── state.js          # Mantém o objeto state.botCarregado
```

## Code Style
Funções puras e imutáveis sempre que possível, com documentação clara dos campos recebidos/enviados.
```javascript
export function serializeBracketNotation(payload) {
  const partes = [];
  function andar(valor, prefixo) {
    if (valor === null || valor === undefined) return;
    if (typeof valor === 'object') {
      for (const [k, v] of Object.entries(valor)) {
        andar(v, prefixo ? `${prefixo}[${k}]` : k);
      }
      return;
    }
    partes.push(`${encodeURIComponent(prefixo)}=${encodeURIComponent(valor)}`);
  }
  andar(payload, '');
  return partes.join('&');
}
```

## Testing Strategy
- Testes de Serialização: Garantir que arrays e objetos complexos correspondam exatamente ao que o PHP `$_POST` espera.
- Mapeamento Bidirecional: Validar que `toUpdateBotPayload(fromGetBotResponse(json))` preserva a integridade de estados, transições, condições e ações.

## Boundaries
- Always: Usar exclusivamente `action=getBot` para leitura.
- Ask first: Alterar nomes de colunas ou chaves de payload enviadas ao PHP da Orpen.
- Never: Usar `action=exportBotJSON` ou `action=importBotJSON` em rotinas de salvamento direto.

## Success Criteria
- [ ] O adapter converte o payload aninhado do backend sem perda de condições ou ações.
- [ ] O `serializeBracketNotation` formata objetos aninhados exatamente igual ao `jQuery.param()`.
- [ ] O backend responde com sucesso (código 200 e confirmação) após o salvamento via `ajax.php`.

## Open Questions
- Nenhuma questão aberta no momento.
