# ---------------------------------------------------------------------------
# Atualiza a extensão "Orpen — Editor de Bot" a partir do GitHub.
#
# Formas de rodar:
#   - Atualizar.bat (dois cliques na pasta da extensão);
#   - botão "Atualizar agora" do editor, pelo link editorbot-atualizar://
#     (vem com -Auto: a janela fecha sozinha se der certo).
# Toda execução também (re)registra esse link no Windows, só para o usuário
# atual (HKCU, sem administrador), apontando para esta pasta. Para remover:
#   powershell -ExecutionPolicy Bypass -File atualizar.ps1 -RemoverAtalho
#
# Baixa a branch `release` (a última versão fechada), copia só os arquivos da
# extensão para esta pasta e pronto: a extensão percebe os arquivos novos e se
# recarrega sozinha (background.js).
# ---------------------------------------------------------------------------
param(
  [string]$Ramo = 'release',
  [switch]$Auto,
  [switch]$RemoverAtalho
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
$Repo = 'GabrielLima66/editorbot'
$Pasta = $PSScriptRoot
$ChaveLink = 'HKCU:\Software\Classes\editorbot-atualizar'

# Pastas inteiras (espelhadas) e arquivos da extensão. O manifest.json vai por
# último: se algo falhar no meio, a versão instalada continua a antiga.
$PastasExtensao = @('content', 'js', 'css', 'icons', 'vendor')
$ArquivosExtensao = @('bot_transform.html', 'background.js', 'CHANGELOG.md', 'DOCUMENTACAO_EXTENSAO.md', 'atualizar.ps1')

function Versao-De($manifest) {
  return (Get-Content $manifest -Raw -Encoding UTF8 | ConvertFrom-Json).version
}

# Link editorbot-atualizar:// -> este script com -Auto. Idempotente.
function Registrar-Link {
  $ps = Join-Path $PSHOME 'powershell.exe'
  $script = Join-Path $Pasta 'atualizar.ps1'
  New-Item -Path "$ChaveLink\shell\open\command" -Force | Out-Null
  Set-Item -Path $ChaveLink -Value 'URL:Atualizador do Editor de Bot'
  New-ItemProperty -Path $ChaveLink -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
  Set-Item -Path "$ChaveLink\shell\open\command" -Value "`"$ps`" -NoProfile -ExecutionPolicy Bypass -File `"$script`" -Auto"
}

function Atualizar {
  Write-Host ''
  Write-Host 'Orpen - Editor de Bot: atualização' -ForegroundColor Cyan
  Write-Host ''

  if (Test-Path (Join-Path $Pasta '.git')) {
    Write-Host 'Esta pasta é o repositório de desenvolvimento (tem .git).' -ForegroundColor Yellow
    Write-Host 'Aqui use "git pull" em vez do Atualizar.bat, para não sobrescrever trabalho local.'
    return 1
  }
  if (-not (Test-Path (Join-Path $Pasta 'manifest.json'))) {
    Write-Host 'Não encontrei o manifest.json nesta pasta. O Atualizar.bat precisa ficar na pasta da extensão.' -ForegroundColor Red
    return 1
  }

  try { Registrar-Link } catch { Write-Host "(Não consegui ativar o botão 'Atualizar agora': $($_.Exception.Message))" -ForegroundColor Yellow }

  $Instalada = Versao-De (Join-Path $Pasta 'manifest.json')
  Write-Host "Versão instalada: $Instalada"

  $Tmp = Join-Path $env:TEMP ('editorbot-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $Tmp | Out-Null
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Host 'Baixando a versão mais recente...'
    $Zip = Join-Path $Tmp 'editorbot.zip'
    try {
      Invoke-WebRequest -Uri "https://github.com/$Repo/archive/refs/heads/$Ramo.zip" -OutFile $Zip -UseBasicParsing
    }
    catch {
      if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) {
        throw 'Ainda não há versão publicada para atualização automática no GitHub. Tente de novo quando o aviso de versão nova aparecer no editor.'
      }
      throw "Sem acesso ao GitHub ($($_.Exception.Message)). Verifique a internet e tente de novo."
    }
    Expand-Archive -Path $Zip -DestinationPath $Tmp
    $Origem = (Get-ChildItem -Path $Tmp -Directory | Select-Object -First 1).FullName

    $Nova = Versao-De (Join-Path $Origem 'manifest.json')
    if ([version]$Nova -le [version]$Instalada) {
      Write-Host ''
      Write-Host "Você já está na versão mais recente ($Instalada)." -ForegroundColor Green
      return 0
    }

    Write-Host "Atualizando para a versão $Nova..."
    foreach ($d in $PastasExtensao) {
      $de = Join-Path $Origem $d
      if (-not (Test-Path $de)) { continue }
      robocopy $de (Join-Path $Pasta $d) /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -ge 8) { throw "Falha ao copiar a pasta $d (robocopy $LASTEXITCODE)" }
    }
    foreach ($f in $ArquivosExtensao) {
      $de = Join-Path $Origem $f
      if (Test-Path $de) { Copy-Item -Path $de -Destination $Pasta -Force }
    }
    Copy-Item -Path (Join-Path $Origem 'manifest.json') -Destination $Pasta -Force

    Write-Host ''
    Write-Host "Pronto: $Instalada -> $Nova" -ForegroundColor Green
    if ($Auto) { Write-Host 'O editor vai se atualizar sozinho em instantes.' }
    else { Write-Host 'Agora recarregue a página da Orpen (F5). A extensão se atualiza sozinha.' }
    return 0
  }
  catch {
    Write-Host ''
    Write-Host "Não foi possível atualizar: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Nada foi alterado na versão instalada se o erro ocorreu antes da cópia.'
    return 1
  }
  finally {
    Remove-Item -Path $Tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if ($RemoverAtalho) {
  Remove-Item -Path $ChaveLink -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host 'Botão "Atualizar agora" desativado (link editorbot-atualizar removido).'
  exit 0
}

$codigo = Atualizar
if ($Auto) {
  # Aberto pelo botão do editor: fecha sozinho se deu certo; com erro, espera.
  if ($codigo -eq 0) { Write-Host ''; Write-Host 'Esta janela fecha sozinha...'; Start-Sleep -Seconds 5 }
  else { Write-Host ''; Read-Host 'Pressione Enter para fechar' | Out-Null }
}
exit $codigo
