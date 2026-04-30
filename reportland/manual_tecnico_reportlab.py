"""
odoo/reportland/manual_tecnico_reportlab.py - Generador de PDF (Manual Tecnico) con ReportLab.

Este script documenta el sistema desde el punto de vista tecnico:
- Arquitectura (frontend/backend/Odoo)
- Endpoints y configuracion
- Consideraciones de despliegue y operacion
"""

from __future__ import annotations

import argparse
import datetime as _dt
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


EMERGELENS = {
    "navy": colors.HexColor("#0b1628"),
    "navy_mid": colors.HexColor("#11203a"),
    "navy_light": colors.HexColor("#192e4f"),
    "red": colors.HexColor("#e8364e"),
    "teal": colors.HexColor("#22d3b7"),
    "muted": colors.HexColor("#7b8fa8"),
    "paper": colors.white,
    "ink": colors.HexColor("#0b1628"),
    "line": colors.Color(11 / 255, 22 / 255, 40 / 255, alpha=0.14),
    "line_soft": colors.Color(11 / 255, 22 / 255, 40 / 255, alpha=0.08),
}


def _root() -> Path:
    return Path(__file__).resolve().parents[1]


def _logo_path() -> Path:
    return _root() / "frontend" / "src" / "assets" / "logo.png"


def _styles():
    base = getSampleStyleSheet()
    base["Normal"].fontName = "Helvetica"
    base["Normal"].fontSize = 10.2
    base["Normal"].leading = 14
    base["Normal"].textColor = EMERGELENS["ink"]

    title = ParagraphStyle(
        "Title",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.white,
        alignment=TA_LEFT,
    )
    subtitle = ParagraphStyle(
        "Subtitle",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        textColor=colors.Color(240 / 255, 244 / 255, 248 / 255, alpha=0.86),
        alignment=TA_LEFT,
    )
    h1 = ParagraphStyle(
        "H1",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=EMERGELENS["ink"],
        spaceBefore=10,
        spaceAfter=6,
    )
    h2 = ParagraphStyle(
        "H2",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=EMERGELENS["ink"],
        spaceBefore=10,
        spaceAfter=5,
    )
    small = ParagraphStyle(
        "Small",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.Color(11 / 255, 22 / 255, 40 / 255, alpha=0.65),
    )
    code = ParagraphStyle(
        "Code",
        parent=base["Normal"],
        fontName="Courier",
        fontSize=9,
        leading=12,
        textColor=EMERGELENS["ink"],
        backColor=colors.Color(11 / 255, 22 / 255, 40 / 255, alpha=0.04),
        borderPadding=(6, 8, 6, 8),
    )
    return {"normal": base["Normal"], "title": title, "subtitle": subtitle, "h1": h1, "h2": h2, "small": small, "code": code}


def _header(doc_title: str, version: str, date_text: str, s):
    logo = _logo_path()
    img = None
    if logo.exists():
        img = Image(str(logo), width=1.1 * cm, height=1.1 * cm)

    left = [
        Paragraph(doc_title, s["title"]),
        Paragraph("SOS EmergeLens · Manual Tecnico", s["subtitle"]),
    ]

    meta = Table(
        [["Fecha", date_text], ["Version", version], ["Documento", "Manual Tecnico"]],
        colWidths=[2.2 * cm, 6.0 * cm],
    )
    meta.setStyle(
        TableStyle(
            [
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEADING", (0, 0), (-1, -1), 12),
                ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
            ]
        )
    )

    t = Table([[img if img else "", left, meta]], colWidths=[1.7 * cm, 10.9 * cm, 6.7 * cm], rowHeights=[2.0 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), EMERGELENS["navy_mid"]),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.Color(1, 1, 1, alpha=0.10)),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return t


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.Color(11 / 255, 22 / 255, 40 / 255, alpha=0.55))
    canvas.drawString(1.7 * cm, 1.2 * cm, "SOS EmergeLens")
    canvas.drawRightString(A4[0] - 1.7 * cm, 1.2 * cm, f"Pagina {doc.page}")
    canvas.restoreState()


def _bullet(text: str, s):
    return Paragraph(f"&bull; {text}", s["normal"])


def build_pdf(out_path: Path, version: str = "1.0"):
    s = _styles()
    date_text = _dt.date.today().strftime("%d/%m/%Y")

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=1.7 * cm,
        rightMargin=1.7 * cm,
        topMargin=1.7 * cm,
        bottomMargin=1.7 * cm,
        title="Manual Tecnico - SOS EmergeLens",
        author="SOS EmergeLens",
    )

    story = []
    story.append(_header("MANUAL TECNICO", version, date_text, s))
    story.append(Spacer(1, 0.6 * cm))

    story.append(Paragraph("Resumen", s["h1"]))
    story.append(
        Paragraph(
            "Este manual describe la arquitectura, componentes y operacion tecnica de SOS EmergeLens: "
            "frontend React/Vite, backend Flask, integracion con Odoo, voz (SpeechRecognition/TTS), IA (Groq) y reportes (ReportLab).",
            s["normal"],
        )
    )

    story.append(Spacer(1, 0.25 * cm))
    story.append(Paragraph("Stack tecnologico", s["h2"]))
    story.append(_bullet("Frontend: React (Vite), CSS custom, Leaflet para mapas.", s))
    story.append(_bullet("Backend: Python + Flask, sesiones por cookies, CORS con credenciales.", s))
    story.append(_bullet("ERP/DB: Odoo 17 sobre Postgres 15 (modelos x.emergelens.*).", s))
    story.append(_bullet("IA: Groq Chat Completions (LLM) y Whisper para transcripcion de audio.", s))
    story.append(_bullet("Reportes: ReportLab (generadores en reportland/).", s))

    story.append(PageBreak())
    story.append(_header("MANUAL TECNICO", version, date_text, s))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph("Arquitectura (alto nivel)", s["h1"]))
    story.append(
        Paragraph(
            "La aplicacion corre en 4 servicios principales (docker-compose): db (Postgres), odoo, backend y frontend. "
            "El frontend consume el backend via /api. El backend usa JSON-RPC/HTTP para leer/escribir en Odoo.",
            s["normal"],
        )
    )
    arch = Table(
        [
            ["Frontend (5173)", "->", "Backend Flask (5000)", "->", "Odoo (8069)", "->", "Postgres (5432)"],
        ],
        colWidths=[3.8 * cm, 0.8 * cm, 4.2 * cm, 0.8 * cm, 3.2 * cm, 3.0 * cm],
    )
    arch.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.7, EMERGELENS["line"]),
                ("BACKGROUND", (0, 0), (-1, -1), colors.Color(0, 0, 0, alpha=0.02)),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(Spacer(1, 0.3 * cm))
    story.append(arch)

    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph("Estructura del repositorio", s["h1"]))
    story.append(Paragraph("<b>frontend/</b> UI React (pages/, components/, hooks/, lib/).", s["normal"]))
    story.append(Paragraph("<b>backend/</b> API Flask (routes/, scheduler.py, security.py, validation.py).", s["normal"]))
    story.append(Paragraph("<b>odoo/</b> Addons custom (modelos y vistas en Odoo).", s["normal"]))
    story.append(Paragraph("<b>reportland/</b> Generadores de PDF/HTML (ReportLab).", s["normal"]))

    story.append(PageBreak())
    story.append(_header("MANUAL TECNICO", version, date_text, s))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph("Flujo de sesion y seguridad", s["h1"]))
    story.append(_bullet("El backend configura cookies de sesion HttpOnly y SameSite (configurable por env).", s))
    story.append(_bullet("CORS soporta credenciales; origins se controla con CORS_ORIGINS.", s))
    story.append(_bullet("Auditoria: before/after_request registra acciones criticas (perfil, contactos, evidencia, status).", s))

    story.append(Spacer(1, 0.35 * cm))
    story.append(Paragraph("API (resumen)", s["h1"]))
    api_rows = [
        ["Grupo", "Ejemplos de endpoints"],
        ["Auth", "/api/auth/login, /api/auth/register, /api/auth/me"],
        ["Perfil", "/api/profile/, /api/profile/instructions, /api/profile/by-emergelens-id/<id>"],
        ["Contactos", "/api/contacts/ (CRUD)"],
        ["Emergencia", "/api/emergency/email, /api/emergency/my-alert, /api/emergency/evidence, /api/emergency/stop"],
        ["Chat IA", "/api/chat/... (conversaciones, mensajes, audio)"],
        ["Llamada LENS", "/api/lens/message"],
        ["Geofence", "/api/geofence/..."],
        ["Donaciones", "/api/donations/..."],
        ["Reportes", "/api/reports/..."],
    ]
    t = Table(api_rows, colWidths=[3.3 * cm, 13.4 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), EMERGELENS["navy_mid"]),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("BOX", (0, 0), (-1, -1), 0.7, EMERGELENS["line"]),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, EMERGELENS["line_soft"]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(t)

    story.append(Spacer(1, 0.35 * cm))
    story.append(Paragraph("Voz (CallSimulator)", s["h1"]))
    story.append(
        Paragraph(
            "La llamada usa Web Speech API del navegador: SpeechSynthesis (TTS) para hablar y SpeechRecognition "
            "para capturar voz. Para evitar cortes o loops, se usa reconocimiento continuo y 'commit por silencio'.",
            s["normal"],
        )
    )
    story.append(_bullet("Frontend: frontend/src/pages/CallSimulator.jsx.", s))
    story.append(_bullet("Backend: /api/lens/message en backend/routes/lens_call.py.", s))

    story.append(Spacer(1, 0.35 * cm))
    story.append(Paragraph("IA (Groq) y anti-repeticion", s["h1"]))
    story.append(
        Paragraph(
            "El backend arma un system prompt con reglas estrictas (max 2 oraciones, una pregunta) y "
            "pasa historial corto. Adicionalmente aplica filtros server-side para bloquear frases repetidas "
            "o preguntas ya hechas y reemplaza por un fallback contextual.",
            s["normal"],
        )
    )
    story.append(_bullet("Archivo: backend/routes/lens_call.py.", s))

    story.append(PageBreak())
    story.append(_header("MANUAL TECNICO", version, date_text, s))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph("Despliegue local (Docker Compose)", s["h1"]))
    story.append(Paragraph("Comandos tipicos:", s["h2"]))
    story.append(Paragraph("docker compose up --build", s["code"]))
    story.append(Spacer(1, 0.15 * cm))
    story.append(Paragraph("Puertos:", s["h2"]))
    story.append(_bullet("Frontend: http://localhost:5173", s))
    story.append(_bullet("Backend: http://localhost:5000/api/health", s))
    story.append(_bullet("Odoo: http://localhost:8069", s))

    story.append(Spacer(1, 0.35 * cm))
    story.append(Paragraph("Variables de entorno (principales)", s["h1"]))
    story.append(_bullet("SECRET_KEY, SESSION_DAYS, SESSION_COOKIE_SECURE, SESSION_SAMESITE", s))
    story.append(_bullet("CORS_ORIGINS", s))
    story.append(_bullet("ODOO_URL, ODOO_DB, ADMIN_ODOO_EMAIL, ADMIN_ODOO_PASS", s))
    story.append(_bullet("GROQ_API_KEY, GROQ_MODEL", s))

    story.append(Spacer(1, 0.35 * cm))
    story.append(Paragraph("Reportes PDF (ReportLand)", s["h1"]))
    story.append(
        Paragraph(
            "Los documentos imprimibles se generan por codigo en reportland/. "
            "Ejemplo: cronograma_reportlab.py genera cronograma_proyecto.pdf.",
            s["normal"],
        )
    )
    story.append(_bullet("Generar este manual: python reportland/manual_tecnico_reportlab.py --out reportland/manual_tecnico.pdf", s))
    story.append(_bullet("Generar manual de usuario: python reportland/manual_usuario_reportlab.py --out reportland/manual_usuario.pdf", s))

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)


def main():
    # CLI: define salida y version del PDF tecnico.
    ap = argparse.ArgumentParser(description="Genera el Manual Tecnico (PDF) de SOS EmergeLens.")
    ap.add_argument("--out", required=True, help="Ruta del PDF de salida.")
    ap.add_argument("--version", default="1.0", help="Version del documento (default: 1.0).")
    args = ap.parse_args()
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    build_pdf(out, version=str(args.version))


if __name__ == "__main__":
    main()
