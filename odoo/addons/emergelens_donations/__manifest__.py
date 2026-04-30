{
    "name": "EmergeLens Donations",
    "version": "17.0.1.0.0",
    "summary": "Solicitudes de donacion con fotos y aportes",
    "author": "EmergeLens",
    "category": "Emergency",
    "license": "LGPL-3",
    "depends": ["base", "emergelens"],
    "data": [
        "security/donation_security.xml",
        "security/ir.model.access.csv",
        "data/sequence.xml",
        "views/donation_views.xml",
    ],
    "installable": True,
    "auto_install": False,
    "application": True,
}