# Cerne · Atualização e Novidades (para IA)

Spec completa: `../07-atualizacao-novidades.md`. Código: `js/atualizacao.js`, `js/novidades.js`, `background.js`, `atualizar.ps1`, `Atualizar.bat`. Antes, leia `00-contrato.cerne.md`.

## Em uma frase

A extensão é instalada de uma pasta (sem loja). Este módulo **avisa** quando a branch `release` do GitHub tem versão maior, **dispara** o atualizador do Windows, **observa** a pasta até a versão nova chegar e então **recarrega** — nunca no meio de uma edição não salva. E mostra o histórico (CHANGELOG da própria instalação).

## Três programas, um fluxo

```
página (atualizacao.js)  --link editorbot-atualizar://-->  atualizar.ps1 (Windows)
        |                                                     baixa release.zip, copia arquivos
        | sendMessage 'editorbot:verificar-disco' (a cada 2 s)         |
        v                                                              v
service worker (background.js): disco > carregada?  <---- manifest.json (copiado por último)
        | recarregar:true -> chrome.runtime.reload()  (só o worker pode)
        v
página recarrega (1,2 s depois)
```

## Invariantes

1. **Fonte da verdade da "versão publicada" = `manifest.json` da branch `release`.** A branch só avança com versão fechada.
2. **Falha de consulta = silêncio.** Sem internet, 404, JSON sem `version`: nenhum aviso, nenhum erro visível.
3. **Cache em `localStorage` com `try/catch`**: 1 h se há versão nova, 5 min se não há.
4. **Nunca recarregar com alteração não salva.** Chegou a versão, mas há edição → "Salve o bot e clique em Concluir"; Concluir não faz nada até salvar.
5. **Versão carregada ≠ versão no disco.** O Chrome só passa a rodar a nova com `runtime.reload()`; por isso o worker compara `getManifest().version` com o `manifest.json` lido do disco. `recarregar:false` só consulta.
6. **`manifest.json` é copiado por último** pelo atualizador: falha no meio mantém a versão antiga.
7. **O atualizador recusa pasta com `.git`** (repo de desenvolvimento) e pasta sem `manifest.json`.
8. **Novidades lê o CHANGELOG da instalação**, não da internet. Todo texto passa por `escapeHtml` antes de virar `<code>`/`<strong>`.
9. `compararVersoes` existe em **dois** lugares (página e worker): manter idênticas. Partes ausentes/não numéricas valem 0 (`parseInt`). O `atualizar.ps1` usa `[version]` do PowerShell (outra regra: `1.0` ≠ `1.0.0`, mínimo 2 partes); com versões `X.Y.Z` as três dão o mesmo resultado, então mantenha sempre três números.
10. Onde está a integração: botão `#bv-versao` ("vX · Novidades") e a chamada `avisarSeHouverNovaVersao(...)` em `js/orpen-bridge.js` (~linhas 157-177); a verificação do disco a cada carga da página está em `content/bootstrap.js` (~linha 37), enviada **sem** `recarregar:false` de propósito.

## Tempos

Poll 2 s · dica do `Atualizar.bat` aos 20 s · desiste aos 3 min (volta ao aviso) · recarga da página 1,2 s depois de concluir · `reload()` do worker 200 ms depois de responder.

## CHANGELOG (formato lido)

`## [X.Y.Z] - AAAA-MM-DD`; itens `* …` ou `- …`; linha solta depois de um item continua o item; texto antes da primeira versão é ignorado; só `` `código` `` e `**negrito**`.

## Armadilhas

- Adicionar pasta/arquivo novo à extensão e esquecer `PastasExtensao`/`ArquivosExtensao` do `atualizar.ps1` (a atualização sai incompleta).
- Mudar repositório/ramo em um lugar só (`atualizacao.js` **e** `atualizar.ps1`).
- `manifest.json` e primeira versão do CHANGELOG divergentes.
- Chamar `chrome.runtime.*` sem tratar contexto invalidado.
- Link `editorbot-atualizar://` só existe depois de rodar o `Atualizar.bat` uma vez (daí a dica dos 20 s).
- Funciona só no Windows.

## Validar

Testes puros de `compararVersoes` e `lerChangelog`. Em tela: simular versão maior (cache/`manifest` da `release`), clicar, ver "Atualizando…", dica aos 20 s, e o caminho com edição não salva (não recarrega). Atualizador: rodar em pasta sem `.git` e conferir "já na versão mais recente" e a cópia do `manifest.json` por último.
