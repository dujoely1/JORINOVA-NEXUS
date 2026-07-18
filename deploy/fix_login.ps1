# JORINOVA NEXUS - login recovery script
# ============================================================================
# Run this whenever login stops accepting your credentials. It makes login work
# again and STAY working:
#   1) installs the critical auth deps (a missing bcrypt makes every login 500),
#   2) forces pure password login (FORCE_2FA=false) so the super_admin 2FA gate
#      can never trap you on the "set up two-factor" screen,
#   3) resets the admin account: password + re-activate + disable 2FA + unlock,
#   4) CLEARS every trusted-device session so a revoked/stale device can no
#      longer reject your saved token ("remove the sessions that make it fail").
#
#   powershell -ExecutionPolicy Bypass -File deploy\fix_login.ps1
#   powershell -ExecutionPolicy Bypass -File deploy\fix_login.ps1 -Username admin -Password 'Admin@2026'
#
# Then restart the backend (deploy\start_backend.ps1) and log in.
param(
  [string]$Username = 'admin',
  [string]$Password = 'Admin@2026'
)
$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot          # project root (deploy\ is under it)
$backend = Join-Path $root 'backend'
$py      = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { $py = 'python' }

Write-Host '[1/4] Ensuring critical auth dependencies (bcrypt, jose, passlib, email-validator)...'
& $py -m pip install -q bcrypt "python-jose[cryptography]" passlib email-validator

Write-Host '[2/4] Forcing pure password login (FORCE_2FA=false in backend\.env)...'
# The super_admin role has a mandatory-2FA-enrolment gate: without this flag the
# app redirects admins to /security/two-factor and they never reach the app.
$envFile = Join-Path $backend '.env'
if (-not (Test-Path $envFile)) { New-Item -ItemType File -Path $envFile | Out-Null }
$lines = @(Get-Content $envFile -ErrorAction SilentlyContinue)
if ($lines -match '^\s*FORCE_2FA\s*=') {
  $lines = $lines | ForEach-Object { if ($_ -match '^\s*FORCE_2FA\s*=') { 'FORCE_2FA=false' } else { $_ } }
} else {
  $lines += 'FORCE_2FA=false'
}
Set-Content -Path $envFile -Value $lines -Encoding utf8

Write-Host "[3/4] Resetting '$Username' (password + activate + disable 2FA + unlock)..."
Write-Host '[4/4] Clearing ALL trusted-device sessions (stale/revoked devices)...'
$env:FIX_USER    = $Username
$env:FIX_PASS    = $Password
$env:FIX_BACKEND = $backend

$code = @'
import os, sys
sys.path.insert(0, os.environ['FIX_BACKEND'])
os.chdir(os.environ['FIX_BACKEND'])
from core.database import SessionLocal
from core.security import hash_password
from models.user import User
u_name = os.environ['FIX_USER']; u_pass = os.environ['FIX_PASS']
db = SessionLocal()
u = db.query(User).filter(User.username == u_name).first()
if u is None:
    print('  user not found - creating a fresh super_admin')
    u = User(username=u_name, hashed_password=hash_password(u_pass), role='super_admin', is_active=True)
    for attr, val in (('first_name', 'System'), ('last_name', 'Administrator'), ('email', 'admin@jorinova.local')):
        try: setattr(u, attr, val)
        except Exception: pass
    db.add(u); db.flush()
else:
    u.hashed_password = hash_password(u_pass)
    u.is_active = True
    for attr, val in (('two_factor_enabled', False), ('totp_secret', None), ('login_attempts', 0)):
        try: setattr(u, attr, val)
        except Exception: pass

# Clear trusted-device sessions so no stale/revoked "did" can reject a saved token.
cleared = 0
try:
    from models.trusted_device import TrustedDevice
    cleared = db.query(TrustedDevice).delete()
except Exception as e:
    print('  (trusted_devices skip:', e, ')')
db.commit()
print('  OK ->', u.username, '| password reset | active=True | 2FA=off | devices cleared:', cleared)
'@
& $py -c $code

Write-Host ''
Write-Host "Done. Log in with:  $Username  /  $Password"
Write-Host 'Restart the backend (deploy\start_backend.ps1) so FORCE_2FA + the reset are picked up.'
