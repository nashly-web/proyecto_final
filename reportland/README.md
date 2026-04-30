# ReportLand

Reportes y documentos imprimibles del proyecto (generados por código).

## Acta de proyecto (ReportLab)

- Generador: `reportland/acta_proyecto_reportlab.py`
- PDF: `reportland/acta_proyecto.pdf`

Generar/actualizar:

`python reportland/acta_proyecto_reportlab.py --out reportland/acta_proyecto.pdf`

Con datos personalizados:

`python reportland/acta_proyecto_reportlab.py --leader "Tu nombre" --sponsor "Cliente" --team "Equipo" --city "Santo Domingo" --out reportland/acta_proyecto.pdf`

## Cronograma de actividades (ReportLab)

- Generador: `reportland/cronograma_reportlab.py`
- PDF: `reportland/cronograma_proyecto.pdf`

Generar/actualizar:

`python reportland/cronograma_reportlab.py --start 2026-02-05 --end 2026-04-26 --out reportland/cronograma_proyecto.pdf`

## Analisis y diseno del sistema (ReportLab)

- Generador: `reportland/analisis_diseno_reportlab.py`
- PDF: `reportland/analisis_diseno_sistema.pdf`

Generar/actualizar:

`python reportland/analisis_diseno_reportlab.py --author "Tu nombre" --out reportland/analisis_diseno_sistema.pdf`

## Analisis y diseno del sistema (HTML)

- Archivo: `reportland/analisis_diseno_sistema.html`
- Abre en navegador y usa **Imprimir / PDF** si quieres exportar.

## Manual de usuario (ReportLab)

- Generador: `reportland/manual_usuario_reportlab.py`
- PDF: `reportland/manual_usuario.pdf`

Generar/actualizar:

`python reportland/manual_usuario_reportlab.py --out reportland/manual_usuario.pdf`

## Manual tecnico (ReportLab)

- Generador: `reportland/manual_tecnico_reportlab.py`
- PDF: `reportland/manual_tecnico.pdf`

Generar/actualizar:

`python reportland/manual_tecnico_reportlab.py --out reportland/manual_tecnico.pdf`
