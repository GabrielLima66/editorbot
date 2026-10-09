# 08 · Analisar bot

Status: implementada (referência: `js/analise-bot.js` (regras, módulo puro), `js/analise.js` (painel), estilos `.an-*` em `css/styles.css`, testes em `tests/editor/analise-bot.test.mjs`).

Pré-requisito: `00-contrato-de-entrada.md`. As regras do motor vêm de `01-testar-bot.md` e do `bot-engine-spec.md`.

---

## 1. Objetivo

O motor de bots **não avisa** quando algo está solto: um destino que não existe, uma opção de menu que ninguém trata ou uma transição que repete sem parar simplesmente fazem a conversa travar, ou o cliente receber a mesma mensagem a cada segundo. Em bots grandes (72 estados) isso só aparece em produção.

"Analisar bot" lê o bot aberto, **sem executar nada**, e lista os pontos soltos com a explicação do porquê e como resolver. Clicar num ponto leva ao estado, à transição ou à ação.

### Dentro do escopo

- Estados sem destino, sem saída ou inalcançáveis.
- Loops que reenviam mensagem sem esperar o cliente.
- Menus estruturados (ação 10: botões, lista, WebChat) cujas opções não têm tratamento, ou cuja condição espera um valor diferente do ID do menu.
- Condições que nunca casam e transições que nunca executam.

### Fora do escopo

- Menus em **texto simples** (ação 1 com "1 - Vendas"): não há como saber as opções sem adivinhar o texto.
- Condições que dependem de dados que a análise não tem (calendário, fila, agente, variáveis do cliente). Elas nunca viram "falso" em silêncio: o achado fica como **possível** ou **informativo**.
- Alterar o bot e bloquear o salvar. A análise só lê.
- Marcar os nós no fluxograma exportado (fase 2).

### Princípio

**Falso positivo custa mais que achado perdido.** Um aviso errado ensina o usuário a ignorar o painel. Por isso: tudo que depende de algo invisível vira `info`; só é `erro` o que o código do motor garante.

---

## 2. Como o motor decide (o que sustenta as regras)

- A conversa só muda de estado por "Troca Estado" (`destiny`) ou por retorno de IA/áudio/automação (`callback_state`; áudio e automação também `fallback_state`). A ação 18 **não lê** `fallback_state`.
- Em cada rodada vale a **primeira** transição do estado, por `PRIORITY` crescente, cujas condições passam (todas, em E). Transição **sem condições sempre dispara**. Sem empate definido entre prioridades iguais.
- **Nada casou = nada acontece.** Não existe fallback do motor. Só o timeout do bot resgata, e o relógio dele é renovado por qualquer mensagem, inclusive as que o próprio bot envia.
- "Esperar o cliente" é efeito de condição em `message`: sem mensagem nova ela é falsa. Uma transição sem condição de mensagem, que não pausa, não encerra nem transfere, dispara a cada rodada (cerca de 1 segundo).
- O cliente envia o **ID** da opção (`reply.id`, `rows[].id`), nunca o título. O motor escapa `& < > "` antes de comparar. "Igual a" é `==` frouxo do PHP e diferencia maiúsculas; "Contém" ignora maiúsculas só em ASCII. "Diferente de" e "Não contém" **nunca são verdadeiros**. A mensagem `"0"` vale como vazia.

---

## 3. Regras

Cada achado tem: regra, **severidade** (`erro`, `aviso`, `info`), **confiança** (`certa` ou `possivel`), estado, transição e ação (para navegar), título, detalhe e "como resolver".

### Estrutura

| Regra | Sev. | O que acusa |
|---|---|---|
| E00 | aviso | O bot não tem o estado 0. (Confiança *possível*: o valor inicial vem do banco e não foi confirmado.) |
| E01 | erro | "Troca Estado" sem destino, ou destino (`destiny`, `callback_state`, `fallback_state` de 20/22, timeout para bot) que não existe. |
| E02 | aviso | Estado alcançado que não tem nenhuma transição. É *possível* quando é o estado 0 (a entrada no 0 não está confirmada). |
| E03 | aviso | Trecho de onde nenhuma transferência ou encerramento é alcançável. Vira `info` se o timeout é fila ou encerrar. O timeout que volta para um estado conta como rota de fuga. Estado com destino dinâmico ou **script** não é acusado: eles podem sair por fora do que a análise vê. |
| E04 | info | Estado que nada alcança. Raízes: estado 0 e o destino do timeout. O texto lembra que failover, inatividade (fora do bot) e scripts podem apontar para ele. **Não é emitido** se nada além das raízes é alcançado (por exemplo, o estado 0 sem transições): aí a entrada pode não ser o 0 e a lista inteira seria palpite. |
| E05 | info | Destino com `{$variável}`: a análise não segue esse caminho. |

### Loops

| Regra | Sev. | O que acusa |
|---|---|---|
| L01 | erro / aviso / info | Transição sem condição de mensagem, que não pausa nem encerra e fica no mesmo estado. **Erro** (certa) só se não tem nenhuma condição, **envia mensagem**, nada de prioridade melhor pode disparar antes e não tem script. **Aviso** (possível) se não envia, se depende de contexto externo ou se tem **script** (a ação 7 pode trocar o estado por conta própria). **Info** se não tem ações (transição inacabada), se soma ao contador de erros e depende dele (limite de tentativas), ou se altera a variável de que depende. A frase sobre o timeout só aparece quando há reenvio. |
| L02 | erro / aviso | Ciclo de estados só por transições automáticas (A → B → A). Mostra o caminho. **Erro** se todo elo não tem condições e nada antes dele pode disparar. |

### Menus (ação 10 estruturada)

O tratamento de um menu fica no estado **onde o bot espera a resposta**: o destino da última "Troca Estado" da transição do menu, ou o próprio estado se não há troca. Se esse estado tem transição automática, a análise a segue (se for certa) ou **não opina** (se for condicional: ela pode sair sem ouvir o cliente). Menu seguido de transferência, encerramento ou pausa não espera resposta e não é analisado.

| Regra | Sev. | O que acusa |
|---|---|---|
| M01 | aviso | Opções do menu sem nenhuma transição que as trate (Igual a / Contém, com a semântica do motor). Lista as opções, diz se a resposta cai numa transição genérica que não sai do estado e **o que o estado espera** (para achar o ID trocado). Uma transição genérica que **segue em frente** (troca de estado, transfere) repassa qualquer resposta e não conta como falta. Valor com `{$variável}` ou operador que depende do conteúdo (É número...) torna a opção indecidível: sem achado. |
| M02 | erro / info | Condição que espera outra grafia de uma opção: a **posição** (`1` em vez de `opt_vendas`), o **título** (`Vendas` em vez de `vendas`) ou o ID com outra caixa, acento ou pontuação. O texto diz que **tocar** na opção não dispara a transição (se o cliente digitar o valor à mão, dispara). **Não acusa** quando a opção já tem tratador (na mesma condição, em outra linha do valor, ou em outra transição): `2` e `comercial` juntos num "Igual a" é um apelido para quem digita. Valor sem relação com o menu (`voltar`, `atendente`) também **não gera achado**. |
| M03 | erro | Transição que casa qualquer mensagem e tem prioridade melhor que a transição que trata a opção: o tratamento nunca executa. |
| M04 | aviso / info | Problema nas opções: sem opções, ID vazio, ID repetido, ID `"0"`, ID com `& < > "`, ID maior que o limite (botão 256, linha 200), mais de 3 botões ou 10 linhas. Formato não reconhecido é `info`, e isso inclui mensagem interativa que não é lista nem botões (`cta_url`, produto etc.). |

### Transições

| Regra | Sev. | O que acusa |
|---|---|---|
| T01 | erro | Condição em mensagem (ou variável guardada) com "Diferente de" / "Não contém": nunca é verdadeira. |
| T02 | aviso | Transição sem condições antes de outras: as seguintes nunca executam. |
| T03 | info | Prioridade repetida no mesmo estado (o motor não define a ordem). |

Condição e ação de tipo 0 não são gravadas pelo servidor: a análise as ignora, como o simulador.

---

## 4. O painel

- Botão de escudo no cabeçalho do editor, entre "Testar" e "Localizar". O selo mostra erros + avisos; vermelho se há erro, amarelo se só há aviso.
- Painel à direita, no mesmo encaixe do Localizar (o editor encolhe para a esquerda). **Abrir um fecha o outro.** Esc fecha só o painel.
- Três filtros com contagem: Erros, Avisos, Informativos. Clicar filtra; clicar de novo mostra tudo. Os informativos começam **recolhidos**.
- Esc fecha só o painel, e não o faz enquanto o modal de teste está aberto por cima.
- Cada achado mostra o código da regra, o estado, o título e, se a confiança é *possível*, a etiqueta "possível". Clicar abre o detalhe e o "Como resolver" e **leva** ao item: abre o estado, rola até a ação (ou a transição, ou o nome do estado) e a destaca. Clicar de novo recolhe o detalhe.
- Atualiza sozinho enquanto se edita (cerca de 400 ms depois de digitar ou de qualquer mudança no editor, inclusive no timeout do cabeçalho). Se o filtro ativo zera (o último erro foi corrigido), o painel volta a mostrar tudo.
- Sem achados: "Nenhum ponto solto encontrado", com o lembrete de que a análise não vê calendário, fila nem dados do cliente.
- Se a análise falhar, o painel diz isso e o erro vai para o console. O editor nunca quebra por causa dela.

---

## 5. Critérios de aceitação

1. Bot com "Troca Estado" para o estado 99 inexistente → E01 (erro), no cartão da ação. Corrigir o destino faz o achado sumir sem recarregar.
2. Estado 0 sem transições → E02 (possível) e **nenhum** E04 (a entrada pode não ser o 0). Com o estado 0 saindo para outros estados, o que ninguém alcança vira E04 (info).
3. Transição sem condições que envia mensagem e fica no estado → L01 (erro, certa). Com condição em `message`, não acusa. Com `error_count < N` e ação "Contador de erros: somar" → info. Sem ações → info. Com script → aviso possível.
4. Estados 0 e 1 se chamando por transições sem condição → L02 com o caminho `0 → 1 → 0`. Se uma das transições espera `message`, não acusa.
5. Menu com IDs `vendas` e `suporte` e só uma transição `message Igual a vendas` → M01 listando `suporte` e dizendo o que o estado espera.
6. Menu com IDs `opt_1`, `opt_2` e condições `message Igual a 1` e `2` → M02 (erro) para cada uma, sugerindo o ID certo; o menu continua com M01.
7. Condição `message Igual a Vendas` com opção de título `Vendas` e ID `vendas` → M02 apontando que difere só na caixa. Condição `Igual a` com as linhas `2` e `comercial` e opção de ID `2` e título `Comercial` → **sem** achado (apelido).
8. Transição `message Contém ""` de prioridade 1 e as de opção nas prioridades 2 e 3 → M03 (erro) em cada uma, e **sem** M01 duplicado.
9. Estado cuja transição genérica troca para outro estado → as opções do menu **não** são acusadas.
10. Menu que leva a um estado roteador com transição condicional (calendário) → sem achado de menu.
11. Condição `message Diferente de x` → T01. Transição sem condições antes de outras → T02.
12. O bot analisado não é alterado. Os bots reais de exemplo rodam sem erro, e todo achado aponta para estado, transição e ação que existem.
13. [UI] Abrir o painel fecha o Localizar, e o contrário. Esc fecha só o painel. Clicar no achado destaca o item por cerca de 1,6 s. Tema claro e escuro legíveis.

---

## 6. Riscos em aberto

- **Estado inicial.** Presume-se que a conversa nova começa no estado 0, mas o valor vem do banco (`ctc_attendance.bot_state`, sem valor no INSERT) e não foi confirmado; o failover de entrada também grava outro estado direto. Por isso E00 e o E02 do estado 0 são *possíveis*.
- **Scripts mudam o estado.** Há scripts (`wsBot/wsGuarida*.php`) que fazem `UPDATE bot_state` por conta própria. Transição com ação 7 conta como destino que a análise não vê.
- **WebChat: `value` ou `text`?** Não se sabe qual dos dois o visitante envia (o código do widget não está no repositório da Orpen). A análise compara o `value`, como o "Gerar tratamento", e M02 aceita o título como causa provável.
- **Prioridades iguais.** O motor ordena só por `priority`; o desempate é indefinido (T03). A análise desempata pelo ID, como o simulador.
- **Estados alcançados por fora.** Failover de entrada e inatividade do cliente/agente apontam para estados do bot e não aparecem no JSON: por isso E04 é informativo.
- **Menus em texto simples** não são analisados (fase 2, por heurística).
- **Navegação duplicada.** "Ir até o estado" existe em quatro módulos (busca, teste, copiar, análise). Vale extrair um helper único numa versão futura.

## 7. Fase 2 (ideias)

- Menu em texto simples, por heurística ("1 -", "digite 1").
- Marcar os nós com problema no fluxograma exportado (exige mudar `fluxograma/` e refazer `vendor/fluxograma`).
- Aviso opcional ao salvar quando houver erro.
- "Contém 1" que também casa o ID `10`.
- "Menu sem limite de tentativas" (reenvia o menu sem contador de erros).
