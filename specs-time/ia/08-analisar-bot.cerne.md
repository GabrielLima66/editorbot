# Cerne · Analisar bot (para IA)

Spec completa: `../08-analisar-bot.md`. Código: `js/analise-bot.js` (regras, puro), `js/analise.js` (painel), estilos `.an-*`. Antes, leia `00-contrato.cerne.md` e `01-testar-bot.cerne.md`.

## Em uma frase

Lê o bot aberto **sem executar nada** e lista pontos soltos (destino inexistente, estado sem saída, loop sem esperar o cliente, opção de menu sem tratamento, condição com ID diferente do menu). Só lê; nunca altera o bot nem bloqueia o salvar.

## O que explica o desenho

1. **Falso positivo custa mais que achado perdido.** Tudo que depende do que a análise não vê (calendário, fila, `{$variável}`, entrada, failover) vira `info` ou `confianca: 'possivel'`. Só é `erro` o que o código do motor garante.
2. **A semântica de comparação é a do simulador**, não uma reescrita: `phpIgual`, `maiusculaAscii` e `escaparHtml` vêm de `simulador.js`. Se o motor muda, muda lá.
3. **Menu não guarda o vínculo opção↔condição.** Deduz-se cruzando o ID do menu com as condições `message` do estado onde o bot **espera a resposta**.
4. **Estado de espera ≠ destino do menu.** Transição automática (sem condição de mensagem) roda antes de ouvir o cliente: segue-se a certa; a condicional faz a análise **não opinar**.
5. **Uma transição genérica que sai do estado repassa a resposta** ("aceita qualquer coisa e trata adiante"): não é "sem tratamento". Só a genérica que **fica** no estado é o "não entendi".

## Regras (resumo)

```
E00 sem estado 0 (possível)   E01 destino inexistente/vazio   E02 estado sem transições
E03 sem saída (sumidouro)     E04 inalcançável (info)         E05 destino {$var} (info)
L01 transição que repete      L02 ciclo A→B→A sem esperar
M01 opção sem tratamento      M02 condição ≠ ID (posição/título/grafia)
M03 genérica engole opção     M04 IDs ruins (vazio, repetido, "0", HTML, limite)
T01 Diferente de/Não contém   T02 transição sombreada         T03 prioridade repetida
```

## Algoritmos

```
indexar: ignora condição/ação de tipo 0 (o servidor não grava); transições por estado em PRIORITY, empate por ID
autodisparavel(t) = nenhuma condição em variável `message`
destino(t)        = ÚLTIMA ação 2 da transição (a última troca vale); sem ação 2 = fica
arestas           = destiny (2) + callback_state/fallback_state (18/20/22), EXCETO fallback_state da 18
alcançáveis       = BFS de {estado 0, TIMEOUT_DESTINY se TIMEOUT_ACTION='bot'}
sem saída (E03)   = componente (Tarjan) sem aresta para fora, sem ação 4/5/6, sem destino dinâmico;
                    timeout='bot' vira aresta de todo estado para o destino

L01: autodisparavel && !terminal && !pausa && (sem ação 2 || ação 2 para si)
     erro/certa só se SEM condições e envia (1,10,11,17,20); error_count+ação 8 'add' ou variável+ação 13/7 → info
L02: Tarjan no subgrafo de arestas automáticas (ação 2 de transição autodisparável, sem terminal/pausa)

M*:  espera = estadoDeEspera(destino do menu)   // segue automática certa; condicional/terminal/pausa → null (não opina)
     para cada opção, varre as transições do estado em ordem:
        r = resultadoPara(t, id)  // true/false/null por condição `message` (ops 1,2; 3/4 = false; outros = null)
        genérica certa (sem outras condições) → para; específica → tratada
     genérica certa ANTES de uma específica que casa → M03 (não M01)
     sem tratador, sem incerteza → M01; genérica que sai do estado → tratada (repasse)
     M02: valor que não casa nenhum ID mas é a posição, o título ou a grafia normalizada de uma opção
          (normalizar = NFD sem marcas, minúscula, só [a-z0-9]); valor sem relação NÃO gera achado
```

## O que é lido (e o que não é)

- Lê `BOT_STATES`, `BOT_TRANSITIONS`, `BOT_CONDITIONS`, `BOT_ACTIONS`, `TIMEOUT_ACTION` e `TIMEOUT_DESTINY`. Não lê o DOM nem o ambiente.
- Menus: só o JSON da ação 10 (`parseMenuModel`, `extrairItensMenu`). Texto simples não é analisado.

## Painel

- Botão `#btn-bv-analisar` (classe `bv-btn-busca bv-btn-analisar`) antes de `#btn-bv-buscar`; painel `#an-painel` reaproveita `.bs-painel`/`.bs-topo`/`.bs-lista`.
- Mesmo encaixe do Localizar: abrir um fecha o outro pelo evento `editor:painel-aberto` no `document` (`detail: 'busca' | 'analise'`). Classe do editor: `analise-aberta` (como `busca-aberta`).
- Navegar: ação → `.acao-item` de `[data-action-id]`; senão `.estado-row[data-transition-id]`; senão `.estado-alias[data-state]`. Abre `.estado-body` antes e aplica `bs-alvo` por 1,6 s.
- Reanalisa com debounce de 400 ms em `input`, `change` e `MutationObserver` de `#bv-estados`. Falha da análise é capturada: painel avisa, console recebe o erro.

## Armadilhas

- **Script (ação 7) pode mover a conversa** (`UPDATE bot_state` direto, padrão Guarida): a transição com script conta como destino dinâmico (silencia E03, rebaixa L01 para aviso possível).
- **Estado 0 sem saída ≠ bot inteiro solto**: a entrada pode não ser o 0, então E04 não é emitido e o E02 do 0 é possível.
- L01 só fala em reenvio/timeout quando a transição **envia**; sem ações é `info` ("transição inacabada").
- M02 diz que **tocar** na opção não dispara a transição; digitar o valor à mão dispara. Mas **não acusa** quando a opção já tem tratador: "2\ncomercial" no mesmo Igual a é apelido para quem digita.
- `parseMenuModel` chama de lista todo `interactive` que não é botão: `cta_url`, produto etc. viram `unknown` em `modeloDoMenu`.
- `T03`/desempate: o simulador usa o ID; o motor não define. Não afirme ordem entre prioridades iguais.
- `fallback_state` da ação 18 é ignorado pelo motor: não gere aresta nem E01 a partir dele.
- Não trate `message Contém ""` como "transição certa" para menus: ela só é genérica; é a **posição** (prioridade) que a torna M03 ou o "não entendi".
- Não reporte "valor sem relação com o menu" em M02: aparece em quase todo bot real (`atendente`, `voltar`) e afoga o painel.
- E04 é `info` de propósito: failover e inatividade apontam para estados sem aparecer no JSON.

## Validar

`node --test "tests/editor/analise-bot.test.mjs"` (um caso positivo e um negativo por regra, mais "bots reais de exemplo rodam e todo achado aponta para algo que existe"). Antes de mudar uma regra, rode a varredura nos bots de `fluxograma/tests/golden_local/fixtures` e leia cada achado: o risco é falso positivo.
