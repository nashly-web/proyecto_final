"""
backend/mailer.py - SMTP email sender used for invoices/notifications.

Configured via environment variables:
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
  SMTP_SSL=1 (optional), SMTP_STARTTLS=1 (optional)
  MAIL_FROM (optional, defaults to SMTP_USER)
  MAIL_FROM_NAME (optional)
"""

from __future__ import annotations

import os
import smtplib
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders
from typing import Iterable, Sequence


def _env_bool(name: str, default: bool = False) -> bool:
    val = (os.getenv(name, "") or "").strip().lower()
    if not val:
        return default
    return val in ("1", "true", "yes", "y", "on")


def _normalize_recipients(to_emails: str | Sequence[str]) -> list[str]:
    if isinstance(to_emails, str):
        parts = [p.strip() for p in to_emails.replace(";", ",").split(",")]
        return [p for p in parts if p]
    res: list[str] = []
    for x in to_emails:
        if not x:
            continue
        x = str(x).strip()
        if not x:
            continue
        res.append(x)
    return res


def send_email(
    *,
    to_emails: str | Sequence[str],
    subject: str,
    html: str,
    attachments: Iterable[dict] | None = None,
) -> None:
    host = (os.getenv("SMTP_HOST") or "").strip()
    port = int(os.getenv("SMTP_PORT") or "465")
    user = (os.getenv("SMTP_USER") or "").strip()
    password = os.getenv("SMTP_PASS")

    if not host or not user or not password:
        raise RuntimeError("SMTP no configurado (SMTP_HOST/SMTP_USER/SMTP_PASS)")

    use_ssl = _env_bool("SMTP_SSL", default=(port == 465))
    use_starttls = _env_bool("SMTP_STARTTLS", default=(not use_ssl))

    from_email = (os.getenv("MAIL_FROM") or user).strip()
    from_name = (os.getenv("MAIL_FROM_NAME") or "EmergeLens").strip()

    rcpts = _normalize_recipients(to_emails)
    if not rcpts:
        raise ValueError("Destinatarios vacios")

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    msg["To"] = ", ".join(rcpts)

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(html, "html", "utf-8"))
    msg.attach(alt)

    if attachments:
        for att in attachments:
            if not att:
                continue
            data = att.get("data")
            filename = att.get("filename") or "attachment"
            mimetype = (att.get("mimetype") or "application/octet-stream").strip()
            if data is None:
                continue
            if isinstance(data, str):
                data = data.encode("utf-8")
            if not isinstance(data, (bytes, bytearray)):
                raise TypeError("Attachment data debe ser bytes")

            if "/" in mimetype:
                main, sub = mimetype.split("/", 1)
            else:
                main, sub = "application", "octet-stream"
            part = MIMEBase(main, sub)
            part.set_payload(bytes(data))
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=str(filename))
            msg.attach(part)

    if use_ssl:
        with smtplib.SMTP_SSL(host, port) as server:
            server.login(user, password)
            server.sendmail(from_email, rcpts, msg.as_string())
        return

    with smtplib.SMTP(host, port) as server:
        if use_starttls:
            server.starttls()
        server.login(user, password)
        server.sendmail(from_email, rcpts, msg.as_string())


def send_html_email(*, to_email: str, subject: str, html: str) -> None:
    send_email(to_emails=to_email, subject=subject, html=html, attachments=None)
