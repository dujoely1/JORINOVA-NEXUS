"""
JORINOVA NEXUS ALIS-X — Email service (SMTP, stdlib only)
=========================================================
Thin, dependency-free wrapper over ``smtplib``. Reads the same SMTP settings
already used elsewhere (auth password-reset): EMAIL_HOST / EMAIL_PORT /
EMAIL_HOST_USER / EMAIL_HOST_PASSWORD.

Best-effort by design: if SMTP isn't configured it returns ``{'status':'skipped'}``
instead of raising, so callers (e.g. first-run setup) never fail because email
isn't set up yet.
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

log = logging.getLogger('email_service')


def is_configured() -> bool:
    return bool(os.environ.get('EMAIL_HOST') and os.environ.get('EMAIL_HOST_USER'))


def send_email(to: str, subject: str, body: str, html: str | None = None) -> dict:
    """Send a single email. Returns {'status': 'sent'|'skipped'|'failed', ...}."""
    if not to:
        return {'status': 'failed', 'error': 'no recipient'}

    host = os.environ.get('EMAIL_HOST', '')
    user = os.environ.get('EMAIL_HOST_USER', '')
    pwd  = os.environ.get('EMAIL_HOST_PASSWORD', '')
    port = int(os.environ.get('EMAIL_PORT', '587') or 587)
    sender = os.environ.get('EMAIL_FROM', user) or user

    if not host or not user:
        log.warning('Email not configured — skipping send to %s (subject=%r)', to, subject)
        return {'status': 'skipped', 'note': 'SMTP not configured'}

    try:
        msg = MIMEMultipart('alternative')
        msg['From']    = f'JORINOVA NEXUS ALIS-X <{sender}>'
        msg['To']      = to
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        if html:
            msg.attach(MIMEText(html, 'html', 'utf-8'))
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls()
            s.login(user, pwd)
            s.sendmail(sender, [to], msg.as_string())
        log.info('Email sent to %s (subject=%r)', to, subject)
        return {'status': 'sent'}
    except Exception as e:                                       # pragma: no cover
        log.error('Email send failed to %s: %s', to, e)
        return {'status': 'failed', 'error': str(e)}


def send_install_summary_email(
    to: str,
    hospital_name: str,
    lab_code: str,
    admin_name: str,
    staff: int,
    analysers: int,
    devices: int,
    security_on: bool,
    login_url: str,
    credentials: list[dict] | None = None,
) -> dict:
    """Compose + send the post-install summary to the administrator.

    ``credentials`` (optional) is a list of {full_name, username, role,
    temp_password} so the admin has a durable record to distribute. It goes only
    to the authorised administrator who just ran the installer.
    """
    sec = 'Post-Quantum active (Kyber768 + Dilithium3)' if security_on else 'Standard encryption'
    lines = [
        f'Hello {admin_name or "Administrator"},',
        '',
        f'JORINOVA NEXUS ALIS-X has been installed for {hospital_name}.',
        '',
        f'  Lab code     : {lab_code or "—"}',
        f'  Staff        : {staff}',
        f'  Analysers    : {analysers}',
        f'  Cold-chain / devices : {devices}',
        f'  Security     : {sec}',
        f'  Languages    : English, Français, Kinyarwanda',
        f'  Sign in      : {login_url}',
        '',
    ]
    rows_html = ''
    if credentials:
        lines.append('Staff login credentials (ask each user to change their password on first login):')
        lines.append('')
        for c in credentials:
            lines.append(f"  • {c.get('full_name','')} — user: {c.get('username','')} | "
                         f"pass: {c.get('temp_password','')} | role: {c.get('role','')}")
            rows_html += (
                f"<tr><td style='padding:4px 8px;border:1px solid #ddd'>{c.get('full_name','')}</td>"
                f"<td style='padding:4px 8px;border:1px solid #ddd'><code>{c.get('username','')}</code></td>"
                f"<td style='padding:4px 8px;border:1px solid #ddd'><code>{c.get('temp_password','')}</code></td>"
                f"<td style='padding:4px 8px;border:1px solid #ddd'>{c.get('role','')}</td></tr>"
            )
        lines.append('')
    lines.append('Smart data. Safer health.')
    lines.append('— JORINOVA NEXUS ALIS-X')
    body = '\n'.join(lines)

    creds_table = (
        f"<h4>Staff login credentials</h4><p style='color:#555'>Ask each user to change their "
        f"password on first login.</p><table style='border-collapse:collapse;font-size:13px'>"
        f"<tr style='background:#0066CC;color:#fff'>"
        f"<th style='padding:4px 8px'>Name</th><th style='padding:4px 8px'>Username</th>"
        f"<th style='padding:4px 8px'>Temp password</th><th style='padding:4px 8px'>Role</th></tr>"
        f"{rows_html}</table>" if credentials else ''
    )
    html = f"""
<div style="font-family:Arial,sans-serif;color:#1a1a1a">
  <h2 style="color:#0066CC;margin-bottom:4px">Installation complete</h2>
  <p style="color:#A6800F;font-style:italic;margin-top:0">Smart data. Safer health.</p>
  <p>Hello {admin_name or 'Administrator'}, JORINOVA NEXUS ALIS-X has been installed for
     <strong>{hospital_name}</strong>.</p>
  <table style="border-collapse:collapse;font-size:14px">
    <tr><td style="padding:3px 10px;color:#555">Lab code</td><td style="padding:3px 10px"><strong>{lab_code or '—'}</strong></td></tr>
    <tr><td style="padding:3px 10px;color:#555">Staff</td><td style="padding:3px 10px">{staff}</td></tr>
    <tr><td style="padding:3px 10px;color:#555">Analysers</td><td style="padding:3px 10px">{analysers}</td></tr>
    <tr><td style="padding:3px 10px;color:#555">Cold-chain / devices</td><td style="padding:3px 10px">{devices}</td></tr>
    <tr><td style="padding:3px 10px;color:#555">Security</td><td style="padding:3px 10px">{sec}</td></tr>
    <tr><td style="padding:3px 10px;color:#555">Languages</td><td style="padding:3px 10px">English, Français, Kinyarwanda</td></tr>
    <tr><td style="padding:3px 10px;color:#555">Sign in</td><td style="padding:3px 10px"><a href="{login_url}">{login_url}</a></td></tr>
  </table>
  {creds_table}
  <p style="margin-top:16px;color:#888">— JORINOVA NEXUS ALIS-X</p>
</div>""".strip()

    subject = f'ALIS-X installation complete — {hospital_name}'
    return send_email(to, subject, body, html)
