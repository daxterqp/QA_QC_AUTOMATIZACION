# ============================================================================
#  backup-local.ps1  —  Copia de respaldo a TU PC (última línea de defensa)
# ============================================================================
#  Baja a tu PC: (1) las copias de la base que ya están en S3 (backups/db/),
#  y (2) opcionalmente las fotos/planos/ortofotos del bucket.
#
#  REQUISITOS (una sola vez):
#    1. Instalar AWS CLI:  https://aws.amazon.com/cli/
#    2. Configurar tus credenciales:  abrir PowerShell y correr:  aws configure
#       - AWS Access Key ID:     (tu Access Key nueva)
#       - AWS Secret Access Key: (tu Secret)
#       - Default region name:   us-east-2
#       - Default output format: (dejar en blanco)
#
#  USO: clic derecho sobre este archivo -> "Ejecutar con PowerShell"
#       (o en una terminal:  powershell -ExecutionPolicy Bypass -File scripts\backup-local.ps1)
# ============================================================================

$ErrorActionPreference = "Stop"

# --- Configuración ---------------------------------------------------------
$Bucket   = "flow-qc-proyecto"
$DestRoot = "D:\Backups\flow-qaqc"     # cambiá la carpeta si querés
$SyncFiles = $false                    # poné $true si también querés bajar TODAS las fotos/planos
# ---------------------------------------------------------------------------

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  Write-Host "AWS CLI no esta instalado. Instalalo desde https://aws.amazon.com/cli/ y corre 'aws configure'." -ForegroundColor Red
  exit 1
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dbDir = Join-Path $DestRoot "db"
New-Item -ItemType Directory -Force -Path $dbDir | Out-Null

Write-Host "==> Bajando copias de la base (backups/db/) a $dbDir ..." -ForegroundColor Cyan
aws s3 sync "s3://$Bucket/backups/db/" $dbDir

if ($SyncFiles) {
  $s3Dir = Join-Path $DestRoot "s3"
  New-Item -ItemType Directory -Force -Path $s3Dir | Out-Null
  Write-Host "==> Sincronizando archivos del bucket (fotos/planos) a $s3Dir ..." -ForegroundColor Cyan
  Write-Host "    (esto puede tardar/pesar; corre solo lo nuevo en cada ejecucion)" -ForegroundColor DarkGray
  aws s3 sync "s3://$Bucket/" $s3Dir --exclude "backups/*"
}

Write-Host ""
Write-Host "Listo. Respaldo local actualizado en: $DestRoot   ($stamp)" -ForegroundColor Green
Write-Host "La base mas reciente esta en: $dbDir" -ForegroundColor Green
