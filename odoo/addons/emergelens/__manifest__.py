{
    'name': 'SOS EmergeLens',
    'version': '17.0.1.0.0',
    'summary': 'Modulo de emergencias EmergeLens',
    'author': 'EmergeLens',
    'category': 'Emergency',
    'license': 'LGPL-3',
    'depends': ['base'],
    'data': [
        'security/ir.model.access.csv',
        'data/admin_user.xml',
        'views/views.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': True,
}