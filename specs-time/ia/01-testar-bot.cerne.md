# Cerne · Testar bot (para IA)

Spec completa: `../01-testar-bot.md`. Código: `js/simulador.js` (puro), `js/teste-bot.js` (tela), `tests/editor/simulador.test.mjs`.

## Em uma frase

Uma **réplica fiel do motor da Orpen** que roda o **rascunho** do bot sobre uma **cópia**, e uma janela que mostra a conversa, por onde ela passou e **por que** cada decisão foi tomada.

## A ideia que explica todo o resto

O valor do teste é **prever a produção**. Então:
- Reproduz o motor **mesmo nos defeitos** (e avisa).
- **Nunca assume em silêncio**: dado que o teste não tem (calendário, fila, agente...) → **pausa e pergunta**. Nunca "falso" por padrão.
- **Nunca grava nada** e nunca muda o bot (trabalha numa cópia).

## O motor em 8 linhas

```
rodada(mensagens):
  transições do estado atual, por PRIORITY
  para cada uma: avalia condições por ID, AND, PARA na primeira falsa
  primeira que passa vence (só uma por rodada); sem vencedora: nada acontece
  executa TODAS as ações da vencedora, por ID
  troca de estado (ação 2) só vale na PRÓXIMA rodada

laço:
  lote = mensagens do cliente (só na 1ª rodada; depois vazio: a mensagem é consumida uma única vez)
  repete rodada enquanto status=='ativa' e alguma transição disparou (teto 25 + aviso)
```

Consequência não óbvia: transição **sem condição de mensagem** dispara sozinha, uma por rodada, mesmo sem o cliente falar. É assim na produção. O teto de 25 existe só para o teste não travar.

## Decisões de fidelidade que parecem bugs mas são a regra

| Comportamento | Por quê |
|---|---|
| "Diferente de" e "Não contém" nunca casam | defeito do motor (PHP 5.6); o teste avisa no trace |
| "Contém" não ignora maiúsculas de letra acentuada | `strtoupper` do PHP 5.6 só mexe em ASCII |
| Cliente digita `0` → "Igual a 0" **não** casa | o motor lê `message_text ?: watson_sentiment`; `"0"` é falso no PHP |
| Valor `a&b` não casa com mensagem `a&b` | a mensagem chega do banco escapada (`&amp;`) |
| "Contém" com linha vazia no valor não casa tudo | `strpos` com agulha vazia é falso no PHP 5.6 (só o valor **inteiro** vazio casa tudo) |
| `"1" == "01"` em "Igual a" | igualdade frouxa do PHP para strings numéricas; espaço no **fim** não é numérico |
| Condição tipo 0 some | o servidor não a grava; a foto do bot já a descarta |
| Clicar num botão do WhatsApp envia o **ID** | é o que o motor recebe como mensagem |

## Estados da sessão

`ativa` → roda. `aguardando` → ação 18/20/22, espera `responderCallback`. `aguardando-contexto` → falta dado, espera `definirExterna`+`continuar` (refaz a **mesma rodada** com as **mesmas mensagens**). `encerrada` → transferiu/finalizou/timeout, ou **parou** no ponto de parada (`motivoFim='parada'`, `continuarDaParada` segue).

## Dados externos (chaves de `contexto.externas`)

`calendario:<id>`, `agent_on_queue:<fila>`, `agent_online:<agente>`, `agent_available_on_chat:<agente>`, `status_last_att`, `opt_in`, `uci`, `entrance_type`, `entrance`, `sender`, `contact_number`, `condicao:<ID>` (operador não simulado, persiste), `condicao:<ID>:r<N>` (operador **por mensagem**: story/anexo/áudio/forma de contato; vale só a rodada N), `script:<ID>` (JSON de retorno). Valores `'sim'`/`'nao'` ou texto.

## Tela em 6 ideias

1. Modal criado por JS dentro do editor; **px**, não rem; tokens de cor.
2. Esquerda: estados com **aqui / ✓ / ×N**, ▶ (começar aqui) e ⚑ (parar ao chegar); clicar na linha leva ao editor.
3. Abas **Conversa** (bolhas, menus com chips, banners de pausa), **Detalhes** (trace por rodada), **Contexto** (cliente, ponto de partida, o que o bot consulta — **escolhas viram botões**).
4. Enviar só com texto não vazio (trim); Enter confirma campos de resposta.
5. **Minimizado**: mini-chat no canto, editor livre, **sem cobrir o Salvar**; marcas no editor (`sim-*`).
6. Fechar o editor fecha o teste; fechar o teste remove as marcas.

## Marcas no editor (classes, nunca mudam o bot)

`sim-visitado`, `sim-atual`, `sim-disparou`, `sim-falhou` (nos blocos de estado/transição); `sim-ok`, `sim-nao`, `sim-talvez` (nas condições). Só abrir/rolar o card quando o editor está à vista (minimizado) ou por pedido; **nunca reabrir o que a pessoa recolheu**. Reaplicar quando `#bv-estados` for recriado.

## Erros que já aconteceram (não repetir)

- Modal que não era injetado pela extensão (só funcionava na página avulsa) → criar por JS ou garantir injeção.
- Botão Timeout sem requisito deixava a tela quebrada → ao sair de `aguardando-contexto`, limpar `requisitos`.
- Mini-chat cobrindo o Salvar → margem inferior ~92 px.
- Ponto de partida vazando de um bot para outro → guardar o `ID` do bot e zerar ao mudar.
- Respostas "só desta rodada" reaproveitadas ao reiniciar → descartar chaves `:r<N>` no reinício.
- Testes com transição sem condição que não troca de estado → viram laço de 25; escrever fluxos realistas.

## Como validar rápido

`node --test tests/editor/simulador.test.mjs` (47 casos). Para a tela, montar o editor num Shadow DOM só com os três blocos que a extensão injeta, abrir o teste e conferir marcas, minimizado, Esc e o botão Salvar livre.
