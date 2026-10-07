# Cerne · Menu da ação 10 (para IA)

Spec completa: `../05-menu-acao-10.md`. Código: `js/menu-builder.js` (modelo/leitura/escrita), `js/menu-modal.js` (janela), `js/menu-tratamento.js` (gerador). Antes, leia `00-contrato.cerne.md`.

## Em uma frase

Edita o menu da ação 10 como formulário (com celular simulado) em três formatos — WhatsApp Botões, WhatsApp Lista, WebChat — **sem alterar o que a pessoa não mexeu**, e gera o estado de **tratamento** (N opções + limite + fallback).

## Invariantes

1. **Salvar edita o JSON original**, não monta outro: só textos/IDs tocados mudam; chaves desconhecidas e indentação ficam; campo opcional só nasce se já existia ou foi preenchido; **sem mudança = nenhum byte gravado**.
2. **O cliente envia o ID, não o título.** Condições do tratamento comparam o ID (WhatsApp) ou o valor (WebChat). ID vazio é gerado do texto com `_`.
3. **WebChat não tem texto no menu**: a pergunta é uma ação 1 antes do menu. Trocar de tipo é mudança estrutural **só ao salvar** (cria/absorve a ação 1 e renumera as ações da transição).
4. **Limites do WhatsApp**: 3 botões; 10 linhas; título do botão 20; título da linha 24; descrição 72; cabeçalho/rodapé 60; corpo 1024; botão da lista 20. Reduzir de tipo com itens demais pede confirmação de truncar.
5. **Formato não reconhecido continua no editor de JSON bruto** (nada é sobrescrito).
6. **Tratamento = N+2 transições**: N de opção (`message Igual a <id>`), depois **limite** (`message Contém ""` E `error_count >= limite`) **antes** do fallback (`message Contém ""`, contador +1, **reenviar o menu**). O limite antes do fallback é o que o faz disparar.
7. **Vínculo deduzido**, nunca gravado: destino da Troca Estado após o menu que tenha transição `message Igual a <id deste menu>`. Se existe, o botão vira "Atualizar tratamento": cria o que falta, **não apaga nada** (marca o que saiu), atualiza a cópia do menu no fallback.
8. Trocar o destino de uma Troca Estado existente **sempre pergunta**.

## Tabela de registros do tratamento

Condição opção `{CONDITION_TYPE:'1', data:{variable:'message', type:'1', value:id}}` · qualquer msg `{'2', …, value:''}` · limite `{'7', variable:'error_count', type:'1' (>=), value:n}` · ações: contador `{ACTION_TYPE:'8', error_count:'add'|'reset'}`, menu `{'10', message_option_text:<cópia>}`, troca `{'2', destiny}`.

## Armadilhas

- Re-serializar o menu do zero (perde chaves, muda indentação, grava sem ter mudado).
- Procurar/gerar ID a partir do título editado depois (IDs preenchidos nunca mudam sozinhos).
- Fallback só com Troca Estado de volta (não reenvia o menu).
- Duplicar nomes `CTRL - …` (acrescentar ` 2`, ` 3`).
- Esquecer de renumerar as ações da transição depois de inserir a Troca Estado ou a ação 1.
- Texto do menu sem `escapeHtml` no celular simulado.

## Validar

`node --test "tests/editor/*.test.mjs"` (menu-builder: idempotência, limites, troca de tipo; menu-tratamento: N+2, ordem, vínculo, atualizar). Em tela: abrir/salvar sem mexer (nada muda), gerar tratamento e comparar com um export real.
