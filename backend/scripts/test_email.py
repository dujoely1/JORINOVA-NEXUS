"""
Test the SMTP (password-reset email) configuration directly.

Reads EMAIL_* from backend/.env and sends ONE real test email, then prints a
clear PASS/FAIL. Use this to confirm your Gmail App Password works WITHOUT going
through the whole forgot-password flow.

    cd backend
    python scripts/test_email.py
    # (optional) send to a different address:
    python scripts/test_email.py someone@example.com
"""
import os
import sys
import smtplib

# UTF-8 console so PASS/FAIL output never crashes on a Windows cp1252 terminal.
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass
from email.mime.text import MIMEText
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import core.config  # noqa: F401  — triggers load_dotenv(backend/.env)


def main() -> None:
    host = os.environ.get('EMAIL_HOST', '')
    port = int(os.environ.get('EMAIL_PORT', '587') or 587)
    user = os.environ.get('EMAIL_HOST_USER', '')
    pwd  = os.environ.get('EMAIL_HOST_PASSWORD', '')
    to   = sys.argv[1] if len(sys.argv) > 1 else (user or 'dujoely1@gmail.com')

    print(f'EMAIL_HOST          = {host or "(empty)"}')
    print(f'EMAIL_PORT          = {port}')
    print(f'EMAIL_HOST_USER     = {user or "(empty)"}')
    print(f'EMAIL_HOST_PASSWORD = {"set (" + str(len(pwd)) + " chars)" if pwd else "(empty)"}')
    print(f'Sending test to     = {to}')
    print('-' * 50)

    if not host or not user or not pwd:
        print('FAIL: EMAIL_HOST / EMAIL_HOST_USER / EMAIL_HOST_PASSWORD must all be set in backend/.env')
        sys.exit(1)

    msg = MIMEText('JORINOVA NEXUS — SMTP test. If you received this, password-reset emails work. ✅')
    msg['Subject'] = 'JORINOVA NEXUS — SMTP test'
    msg['From']    = f'JORINOVA NEXUS <{user}>'
    msg['To']      = to

    try:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls()
            s.login(user, pwd)
            s.sendmail(user, [to], msg.as_string())
        print(f'PASS ✅  Test email sent to {to}. Check the inbox (and Spam).')
    except smtplib.SMTPAuthenticationError as e:
        print('FAIL ❌  Login rejected by Gmail.')
        print('   → Use a 16-char Gmail APP PASSWORD (not your normal password),')
        print('     with spaces removed, and make sure 2-Step Verification is ON.')
        print(f'   detail: {e}')
        sys.exit(1)
    except Exception as e:
        print(f'FAIL ❌  {type(e).__name__}: {e}')
        sys.exit(1)


if __name__ == '__main__':
    main()
