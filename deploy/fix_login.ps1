# JORINOVA NEXUS - login recovery script
# ============================================================================
# Run this whenever login stops accepting your credentials. It (1) installs the
# critical auth dependencies (a missing bcrypt makes every login fail), and
# (2) resets the admin account: password, re-activates it, and disables 2FA.
#
#   powershell -ExecutionPolicy Bypass -File deploy\fix_login.ps1
#   powershell -ExecutionPolicy Bypass -File deploy\fix_login.ps1 -Username admin -Password 'Admin@2026'
#
# Then restart the backend if it is running, and log in.
param(
  [string]$Username = 'admin',
  [string]$Password = 'Admin@2026'
)
$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot          # project root (deploy\ is under it)
$backend = Join-Path $root 'backend'
$py      = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { $py = 'python' }

Write-Host '[1/2] Ensuring critical auth dependencies (bcrypt, jose, passlib, email-validator)...'
& $py -m pip install -q bcrypt "python-jose[cryptography]" passlib email-validator

Write-Host "[2/2] Resetting '$Username' (password + activate + disable 2FA)..."
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
    db.add(u)
else:
    u.hashed_password = hash_password(u_pass)
    u.is_active = True
    try: u.two_factor_enabled = False
    except Exception: pass
db.commit()
print('  OK ->', u.username, '| password reset | active=True | 2FA=off')
'@
& $py -c $code

Write-Host ''
Write-Host "Done. Log in with:  $Username  /  $Password"
Write-Host 'If login still fails, restart the backend (deploy\start_backend.ps1) so the reset is picked up.'
