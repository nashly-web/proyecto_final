"""
odoo/reportland/cronograma_reportlab.py - Generador de PDF (Cronograma del proyecto) con ReportLab.

Genera un cronograma en formato horizontal (landscape) con:
- Fechas de inicio/fin
- Fases/tareas representadas como tabla/linea de tiempo
"""

from __future__ import annotations

import argparse
import datetime as _dt
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
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
    "row_alt": colors.Color(34 / 255, 211 / 255, 183 / 255, alpha=0.06),
}


@dataclass(frozen=True)
class Task:
    name: str
    start: _dt.date
    end: _dt.date
    owner: str

    @property
    def days(self) -> int:
        return max(1, (self.end - self.start).days + 1)


def _parse_date(s: str) -> _dt.date:
    return _dt.date.fromisoformat(s.strip())


def _fmt_date(d: _dt.date) -> str:
    return d.strftime("%d/%m/%Y")


def _logo_path() -> Path:
    return Path(__file__).resolve().parents[1] / "frontend" / "src" / "assets" / "logo.png"


def _styles():
    base = getSampleStyleSheet()
    base["Normal"].fontName = "Helvetica"
    base["Normal"].fontSize = 10.2
    base["Normal"].leading = 13.5
    base["Normal"].textColor = EMERGELENS["ink"]

    title = ParagraphStyle(
        "Title",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        textColor=colors.white,
        alignment=TA_LEFT,
    )
    subtitle = ParagraphStyle(
        "Subtitle",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        textColor=colors.Color(240 / 255, 244 / 255, 248 / 255, alpha=0.85),
        alignment=TA_LEFT,
    )
    h2 = ParagraphStyle(
        "H2",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=EMERGELENS["ink"],
        spaceAfter=6,
    )
    small = ParagraphStyle(
        "Small",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.Color(11 / 255, 22 / 255, 40 / 255, alpha=0.65),
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
    return {"normal": base["Normal"], "title": title, "subtitle": subtitle, "h2": h2, "small": small, "pill": pill}


def _header(project: str, version: str, date_text: str, s):
    logo = _logo_path()
    img = None
    if logo.exists():
        img = Image(str(logo), width=1.1 * cm, height=1.1 * cm)

    left = [
        Paragraph("CRONOGRAMA DE ACTIVIDADES", s["title"]),
        Paragraph(f"{project}", s["subtitle"]),
    ]

    meta = Table(
        [["Fecha", date_text], ["Version", version], ["Documento", "Plan de trabajo"]],
        colWidths=[2.3 * cm, 5.6 * cm],
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

    t = Table([[img if img else "", left, meta]], colWidths=[1.7 * cm, 16.0 * cm, 8.2 * cm], rowHeights=[2.0 * cm])
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


def _project_summary(tasks: List[Task], s) -> Table:
    start = min(t.start for t in tasks)
    end = max(t.end for t in tasks)
    total_days = (end - start).days + 1

    def pill(text: str, color: colors.Color) -> Paragraph:
        return Paragraph(f"<font color='white'>{text}</font>", ParagraphStyle("x", parent=s["pill"], backColor=color, borderPadding=(4, 8, 4, 8)))

    row = [
        Paragraph("<b>Inicio</b><br/>" + _fmt_date(start), s["normal"]),
        Paragraph("<b>Fin</b><br/>" + _fmt_date(end), s["normal"]),
        Paragraph("<b>Duracion total</b><br/>" + f"{total_days} dias", s["normal"]),
        pill("SOS", EMERGELENS["red"]),
        pill("Tiempo real", EMERGELENS["teal"]),
    ]
    t = Table([row], colWidths=[5.1 * cm, 5.1 * cm, 5.4 * cm, 2.6 * cm, 2.8 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.7, EMERGELENS["line"]),
                ("BACKGROUND", (0, 0), (-1, -1), colors.Color(0, 0, 0, alpha=0.02)),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("ALIGN", (3, 0), (-1, -1), "CENTER"),
            ]
        )
    )
    return t


def _schedule_table(tasks: List[Task], s) -> Table:
    header = ["#", "Actividad", "Inicio", "Fin", "Duracion (dias)", "Responsable"]
    rows: List[List[object]] = [header]

    for i, t in enumerate(tasks, 1):
        rows.append(
            [
                str(i),
                Paragraph(f"<b>{t.name}</b>", s["normal"]),
                _fmt_date(t.start),
                _fmt_date(t.end),
                str(t.days),
                t.owner,
            ]
        )

    table = Table(
        rows,
        colWidths=[0.9 * cm, 12.8 * cm, 3.0 * cm, 3.0 * cm, 3.3 * cm, 6.5 * cm],
        repeatRows=1,
    )
    style_cmds: List[Tuple] = [
        ("BOX", (0, 0), (-1, -1), 0.8, EMERGELENS["line"]),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, EMERGELENS["line_soft"]),
        ("BACKGROUND", (0, 0), (-1, 0), EMERGELENS["navy_light"]),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9.6),
        ("LEADING", (0, 0), (-1, 0), 12),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 1), (4, -1), "CENTER"),
    ]

    for r in range(1, len(rows)):
        if r % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, r), (-1, r), EMERGELENS["row_alt"]))

    # Accent the first column like an index badge
    style_cmds += [
        ("BACKGROUND", (0, 1), (0, -1), colors.Color(232 / 255, 54 / 255, 78 / 255, alpha=0.08)),
        ("TEXTCOLOR", (0, 1), (0, -1), EMERGELENS["ink"]),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
    ]

    table.setStyle(TableStyle(style_cmds))
    return table


@dataclass(frozen=True)
class TaskTemplate:
    name: str
    min_days: int
    owner: str
    weight: int = 1  # Used to distribute extra days when an end date is provided.


def _allocate_days(*, total_days: int, templates: List[TaskTemplate]) -> List[int]:
    mins = [max(1, int(t.min_days)) for t in templates]
    base = sum(mins)
    if base > total_days:
        raise ValueError(f"Min days ({base}) exceed total range ({total_days}). Reduce tasks or extend dates.")

    days = mins[:]
    extra = total_days - base

    order = sorted(range(len(templates)), key=lambda i: (templates[i].weight, templates[i].min_days), reverse=True)
    if not order:
        return []

    i = 0
    while extra > 0:
        days[order[i % len(order)]] += 1
        extra -= 1
        i += 1

    return days


def _templates_emergelens() -> List[TaskTemplate]:
    # Base plan: many activities; durations are adjusted to fit the requested end date.
    return [
        TaskTemplate("Kickoff + acta + definicion de alcance", 1, "PM / Lider", weight=1),
        TaskTemplate("Benchmark + analisis de necesidades del usuario", 2, "PM + Equipo", weight=1),
        TaskTemplate("Plan de trabajo (WBS) + roadmap + criterios de exito", 2, "PM", weight=1),
        TaskTemplate("Levantamiento de requisitos (RF/RNF) + historias de usuario", 4, "PM + Equipo", weight=2),
        TaskTemplate("Arquitectura (frontend/backend/odoo) + decisiones tecnicas", 3, "Arquitecto / Backend", weight=2),
        TaskTemplate("Diseno UI/UX (SOS, Emergencia Activa, Dashboard)", 4, "Frontend / UX", weight=3),
        TaskTemplate("Setup del proyecto (env, configs, estructura, calidad)", 2, "Equipo", weight=1),
        TaskTemplate("Autenticacion + sesiones + seguridad basica", 3, "Backend", weight=2),
        TaskTemplate("Perfil + contactos de emergencia (CRUD + validaciones)", 3, "Frontend + Backend", weight=2),
        TaskTemplate("Flujo SOS (tipos, registro, estados, cancelacion PIN)", 4, "Frontend + Backend", weight=3),
        TaskTemplate("Ubicacion en vivo + bateria + polling", 3, "Frontend + Backend", weight=2),
        TaskTemplate("Evidencia: foto automatica + audio opcional + reenvio", 3, "Frontend + Backend", weight=2),
        TaskTemplate("Correos: plantilla + SMTP + pruebas de entrega", 2, "Backend", weight=1),
        TaskTemplate("Integracion Odoo: alertas/perfiles/evidencia", 4, "Backend / Integraciones", weight=3),
        TaskTemplate("LENS call: voz + transcripcion + turn-taking + prompts", 4, "Frontend + Backend", weight=3),
        TaskTemplate("Panel Admin: alertas + unidad asignada + estados", 4, "Frontend + Backend", weight=3),
        TaskTemplate("Auditoria + historial + reportes", 3, "Backend", weight=2),
        TaskTemplate("SafeZone / Geofence", 3, "Frontend + Backend", weight=2),
        TaskTemplate("Clima alertas + recordatorios de medicamentos", 2, "Frontend + Backend", weight=1),
        TaskTemplate("QA: pruebas funcionales + permisos + regresion", 5, "QA", weight=4),
        TaskTemplate("Hardening: manejo de errores + logs + performance percibido", 3, "Backend", weight=2),
        TaskTemplate("UAT + demo + ajustes finales", 2, "PM + Equipo", weight=1),
        TaskTemplate("Documentacion final + entrega", 2, "PM + Equipo", weight=1),
    ]


def build_tasks(*, start: _dt.date, end: _dt.date, templates: List[TaskTemplate]) -> List[Task]:
    total_days = (end - start).days + 1
    if total_days < 1:
        raise ValueError("End date must be >= start date.")

    durations = _allocate_days(total_days=total_days, templates=templates)
    cursor = start
    tasks: List[Task] = []
    for t, d in zip(templates, durations):
        task_end = cursor + _dt.timedelta(days=d - 1)
        tasks.append(Task(name=t.name, start=cursor, end=task_end, owner=t.owner))
        cursor = task_end + _dt.timedelta(days=1)

    # Safety: ensure exact coverage
    if tasks and tasks[-1].end != end:
        # Force end alignment by adjusting the last task (should be rare).
        last = tasks[-1]
        tasks[-1] = Task(name=last.name, start=last.start, end=end, owner=last.owner)

    return tasks


def build_pdf(*, project: str, version: str, date_text: str, tasks: List[Task], output: Path) -> None:
    s = _styles()
    doc = SimpleDocTemplate(
        str(output),
        pagesize=landscape(A4),
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        topMargin=1.0 * cm,
        bottomMargin=1.0 * cm,
        title=f"Cronograma - {project}",
        author="SOS EmergeLens",
    )

    story = []
    story.append(_header(project, version, date_text, s))
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph("Tabla de actividades", s["h2"]))
    story.append(_project_summary(tasks, s))
    story.append(Spacer(1, 0.35 * cm))
    story.append(_schedule_table(tasks, s))
    story.append(Spacer(1, 0.35 * cm))
    story.append(
        Paragraph(
            "Sugerencia: ajusta fechas y responsables segun disponibilidad. "
            "Este cronograma es una base editable para tu proyecto.",
            s["small"],
        )
    )

    def _on_page(canvas, doc_):
        canvas.saveState()
        canvas.setStrokeColor(EMERGELENS["line"])
        canvas.setLineWidth(0.6)
        canvas.line(doc_.leftMargin, 0.9 * cm, doc_.pagesize[0] - doc_.rightMargin, 0.9 * cm)
        canvas.setFont("Helvetica", 8.5)
        canvas.setFillColor(colors.Color(0, 0, 0, alpha=0.55))
        canvas.drawString(doc_.leftMargin, 0.55 * cm, f"SOS EmergeLens · Cronograma")
        canvas.drawRightString(doc_.pagesize[0] - doc_.rightMargin, 0.55 * cm, f"Pagina {doc_.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)


def parse_args():
    p = argparse.ArgumentParser(description="Genera un cronograma (PDF) con ReportLab para SOS EmergeLens.")
    p.add_argument("--project", default="SOS EmergeLens", help="Nombre del proyecto.")
    p.add_argument("--version", default="v1.0 (borrador)", help="Version del documento.")
    p.add_argument("--date", default=_dt.date.today().strftime("%d/%m/%Y"), help="Fecha dd/mm/aaaa.")
    p.add_argument("--start", default=_dt.date.today().isoformat(), help="Fecha inicio (YYYY-MM-DD).")
    p.add_argument("--end", default=None, help="Fecha fin (YYYY-MM-DD). Si se omite, usa un plan corto de 30 dias.")
    p.add_argument("--out", default=str(Path(__file__).with_name("cronograma_proyecto.pdf")), help="Ruta de salida del PDF.")
    return p.parse_args()


def main() -> None:
    # Punto de entrada del script:
    # - parsea args
    # - construye tareas por plantilla
    # - genera el PDF final en la ruta indicada

    a = parse_args()
    start = _parse_date(a.start)

    templates = _templates_emergelens()
    min_total = sum(t.min_days for t in templates)

    end = _parse_date(a.end) if a.end else (start + _dt.timedelta(days=min_total - 1))

    tasks = build_tasks(start=start, end=end, templates=templates)

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    build_pdf(
        project=a.project,
        version=a.version,
        date_text=a.date,
        tasks=tasks,
        output=out
    )

    print(f"OK: PDF generado en {out}")


if __name__ == "__main__":
    main()