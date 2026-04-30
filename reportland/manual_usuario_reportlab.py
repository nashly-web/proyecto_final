"""
odoo/reportland/manual_usuario_reportlab.py - Generador de PDF (Manual de Usuario) con ReportLab.

Este script genera un PDF a partir de componentes de ReportLab (Paragraph, Table, etc.).
Se usa para producir documentos imprimibles del proyecto sin depender del backend.
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
    "amber": colors.HexColor("#f5a623"),
    "muted": colors.HexColor("#7b8fa8"),
    "paper": colors.white,
    "ink": colors.HexColor("#0b1628"),
    "line": colors.Color(11 / 255, 22 / 255, 40 / 255, alpha=0.14),
    "line_soft": colors.Color(11 / 255, 22 / 255, 40 / 255, alpha=0.08),
}


def _root() -> Path:
    # Raiz del repo (para ubicar assets y mantener rutas relativas).
    return Path(__file__).resolve().parents[1]


def _logo_path() -> Path:
    # Reutiliza el logo del frontend para mantener identidad visual en PDFs.
    return _root() / "frontend" / "src" / "assets" / "logo.png"


def _styles():
    # Estilos reutilizables del documento (titulos, texto normal, codigo, etc.).
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
    pill = ParagraphStyle(
        "Pill",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        textColor=colors.white,
        alignment=TA_CENTER,
    )
    return {"normal": base["Normal"], "title": title, "subtitle": subtitle, "h1": h1, "h2": h2, "small": small, "code": code, "pill": pill}


def _header(doc_title: str, version: str, date_text: str, s):
    # Header visual (tipo portada):
    # - Logo + titulo a la izquierda
    # - Metadatos (fecha/version/documento) a la derecha
    logo = _logo_path()
    img = None
    if logo.exists():
        img = Image(str(logo), width=1.1 * cm, height=1.1 * cm)

    left = [
        Paragraph(doc_title, s["title"]),
        Paragraph("SOS EmergeLens · Manual de Usuario", s["subtitle"]),
    ]

    meta = Table(
        [["Fecha", date_text], ["Version", version], ["Documento", "Manual de Usuario"]],
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
        title="Manual de Usuario - SOS EmergeLens",
        author="SOS EmergeLens",
    )

    story = []
    story.append(_header("MANUAL DE USUARIO", version, date_text, s))
    story.append(Spacer(1, 0.6 * cm))

    story.append(Paragraph("Proposito", s["h1"]))
    story.append(
        Paragraph(
            "Este manual explica como usar SOS EmergeLens en el dia a dia: registro, configuracion, activar emergencias, "
            "llamada con LENS (operadora virtual), evidencias, contactos y funciones principales.",
            s["normal"],
        )
    )
    story.append(Spacer(1, 0.25 * cm))
    story.append(Paragraph("Publico objetivo", s["h2"]))
    story.append(_bullet("Usuarios finales (personas que activan SOS y gestionan su perfil).", s))
    story.append(_bullet("Operadores/soporte que necesitan guiar a un usuario por telefono.", s))
    story.append(Spacer(1, 0.25 * cm))

    story.append(Paragraph("Requisitos", s["h2"]))
    story.append(_bullet("Navegador moderno (Chrome/Edge recomendado).", s))
    story.append(_bullet("Permiso de microfono para la llamada simulada con LENS.", s))
    story.append(_bullet("Permiso de ubicacion (ideal) para compartir GPS en emergencia.", s))
    story.append(_bullet("Conexion a Internet.", s))

    story.append(PageBreak())

    story.append(_header("MANUAL DE USUARIO", version, date_text, s))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph("Diseno de la interfaz (UI)", s["h1"]))
    story.append(
        Paragraph(
            "La interfaz sigue un estilo moderno tipo 'app de emergencia': fondo oscuro (navy), tarjetas con transparencia, "
            "iconografia Remix Icon y acentos de color para estados criticos.",
            s["normal"],
        )
    )

    data = [
        ["Color", "Uso", "Valor"],
        ["Rojo", "Acciones SOS/alertas y botones primarios", "#e8364e"],
        ["Teal", "Estados activos/ok, ubicacion/tiempo real", "#22d3b7"],
        ["Navy", "Fondo principal", "#0b1628"],
        ["Navy mid", "Tarjetas/headers", "#11203a"],
        ["Muted", "Texto secundario", "#7b8fa8"],
    ]
    t = Table(data, colWidths=[3.2 * cm, 9.3 * cm, 4.2 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), EMERGELENS["navy_mid"]),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("BOX", (0, 0), (-1, -1), 0.7, EMERGELENS["line"]),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, EMERGELENS["line_soft"]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(Spacer(1, 0.3 * cm))
    story.append(t)
    story.append(Spacer(1, 0.25 * cm))
    story.append(_bullet("Modo claro: la app puede invertir variables para fondo claro (segun preferencias del sistema).", s))
    story.append(_bullet("Componentes clave: tarjetas, modales, toasts (mensajes), botones con bordes suaves.", s))

    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph("Mapa y ubicacion", s["h2"]))
    story.append(
        Paragraph(
            "En Emergencia Activa se muestra un mapa (Leaflet) con tu ubicacion en tiempo real. "
            "Si el navegador no esta en HTTPS o se niega permiso, la app mostrara un estado de ubicacion alternativo.",
            s["normal"],
        )
    )

    story.append(PageBreak())
    story.append(_header("MANUAL DE USUARIO", version, date_text, s))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph("Guia rapida (primer uso)", s["h1"]))
    story.append(_bullet("Entrar a la pantalla de Bienvenida.", s))
    story.append(_bullet("Crear cuenta (registro) o iniciar sesion.", s))
    story.append(_bullet("Completar onboarding/perfil (recomendado).", s))
    story.append(_bullet("Configurar PIN de 4 digitos (se usa para cancelar/colgar).", s))
    story.append(_bullet("Agregar contactos de emergencia.", s))
    story.append(_bullet("Probar llamada con LENS en un entorno seguro.", s))

    story.append(Spacer(1, 0.35 * cm))
    story.append(Paragraph("Registro", s["h2"]))
    story.append(_bullet("Datos: nombre, email, telefono, contrasena (minimo 8 caracteres), PIN (4 digitos).", s))
    story.append(_bullet("Opcional: consentimiento de ubicacion al registrarte (recomendado).", s))

    story.append(Spacer(1, 0.25 * cm))
    story.append(Paragraph("Inicio de sesion", s["h2"]))
    story.append(_bullet("Ingresa email + contrasena.", s))
    story.append(_bullet("La sesion se mantiene con cookies (no necesitas volver a entrar cada pagina).", s))

    story.append(Spacer(1, 0.35 * cm))
    story.append(Paragraph("Panel principal (Dashboard)", s["h1"]))
    story.append(
        Paragraph(
            "El Dashboard concentra accesos a: SOS, perfil medico, contactos, historial, donaciones, notificaciones, zonas seguras y mas. "
            "Desde aqui eliges el tipo de emergencia antes de activar.",
            s["normal"],
        )
    )
    story.append(_bullet("Tipos de emergencia: Medica, Seguridad, Incendio, Accidente.", s))
    story.append(_bullet("Accion principal: activar SOS y pasar a 'Emergencia Activa'.", s))

    story.append(PageBreak())
    story.append(_header("MANUAL DE USUARIO", version, date_text, s))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph("Emergencia Activa (SOS)", s["h1"]))
    story.append(
        Paragraph(
            "Al activar una emergencia, la app intenta capturar tu ubicacion en tiempo real y puede capturar una foto automatica (si hay permiso). "
            "Tambien puedes enviar evidencias (foto/audio) y abrir la llamada con LENS.",
            s["normal"],
        )
    )
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph("Lo que veras", s["h2"]))
    story.append(_bullet("Estado de emergencia (Activa / En seguimiento / Resuelta).", s))
    story.append(_bullet("Ubicacion (lat/lng) y mapa en tiempo real.", s))
    story.append(_bullet("Unidad asignada (si aplica): Ambulancia / Policia / Bomberos / Rescate.", s))
    story.append(_bullet("Boton para llamar a LENS y boton para cancelar con PIN.", s))
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph("Evidencias", s["h2"]))
    story.append(_bullet("Foto: automatica o manual (segun permisos).", s))
    story.append(_bullet("Audio: grabacion en webm desde el microfono.", s))
    story.append(_bullet("Envio de evidencia al backend para notificacion/registro.", s))

    story.append(Spacer(1, 0.35 * cm))
    story.append(Paragraph("Llamada con LENS (operadora virtual)", s["h1"]))
    story.append(
        Paragraph(
            "La llamada es un simulador: LENS habla con voz sintetizada y escucha tu voz con reconocimiento del navegador. "
            "Tu debes hablar, hacer una pausa corta al final, y LENS respondera basado en lo que dijiste.",
            s["normal"],
        )
    )
    story.append(_bullet("Si LENS hace una pregunta, responde solo esa pregunta (una idea por frase).", s))
    story.append(_bullet("Si el microfono no funciona, revisa permisos del navegador.", s))
    story.append(_bullet("Para colgar/cancelar, se solicita el PIN de 4 digitos.", s))

    story.append(Spacer(1, 0.35 * cm))
    story.append(Paragraph("Perfil medico y datos", s["h1"]))
    story.append(
        Paragraph(
            "En 'Mi Perfil' puedes completar datos personales y medicos para que LENS y el sistema tengan contexto en emergencias.",
            s["normal"],
        )
    )
    story.append(_bullet("Datos personales: nombre, telefono, direccion, edad, sexo, foto.", s))
    story.append(_bullet("Datos medicos: tipo de sangre, alergias, condiciones, problemas de salud.", s))
    story.append(_bullet("Instrucciones personalizadas (nota para el operador/LENS).", s))
    story.append(_bullet("ID EmergeLens (EL-XXXX): se puede usar para buscar contactos por ID.", s))

    story.append(Spacer(1, 0.35 * cm))
    story.append(Paragraph("Contactos de emergencia", s["h1"]))
    story.append(_bullet("Agregar contacto con nombre, telefono, relacion y (opcional) email.", s))
    story.append(_bullet("Marcar un contacto como Principal.", s))
    story.append(_bullet("Buscar un contacto por ID EmergeLens (si lo conoces).", s))

    story.append(Spacer(1, 0.35 * cm))
    story.append(Paragraph("Consejos para una llamada efectiva", s["h1"]))
    story.append(_bullet("Habla claro, frases cortas.", s))
    story.append(_bullet("Di primero: que te pasa y donde estas.", s))
    story.append(_bullet("Si hay peligro (fuego/agresor), busca un lugar mas seguro antes de hablar largo.", s))
    story.append(_bullet("Si tu estado cambia, dilo (por ejemplo: 'me mareo', 'me falta el aire').", s))

    story.append(Spacer(1, 0.35 * cm))
    story.append(Paragraph("Solucion de problemas", s["h1"]))
    story.append(_bullet("No escucha: habilita microfono en permisos del navegador y recarga la pagina.", s))
    story.append(_bullet("No hay ubicacion: requiere HTTPS o localhost; habilita ubicacion en permisos.", s))
    story.append(_bullet("No puedo cancelar: recuerda el PIN configurado al registrarte.", s))
    story.append(_bullet("Se repite una frase: vuelve a responder con informacion nueva; el sistema intenta variar preguntas.", s))

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)


def main():
    # CLI: define salida y version del PDF.
    ap = argparse.ArgumentParser(description="Genera el Manual de Usuario (PDF) de SOS EmergeLens.")
    ap.add_argument("--out", required=True, help="Ruta del PDF de salida.")
    ap.add_argument("--version", default="1.0", help="Version del documento (default: 1.0).")
    args = ap.parse_args()
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    build_pdf(out, version=str(args.version))


if __name__ == "__main__":
    main()
