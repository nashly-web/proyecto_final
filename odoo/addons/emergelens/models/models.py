from odoo import models, fields


class EmergelensProfile(models.Model):
    _name = 'x.emergelens.profile'
    _description = 'Perfil medico del usuario'

    x_name                = fields.Char(string='Nombre')
    x_user_id             = fields.Many2one('res.users', string='Usuario')
    x_age                 = fields.Char(string='Edad')
    x_sex                 = fields.Char(string='Sexo')
    x_address             = fields.Char(string='Direccion')
    x_phone               = fields.Char(string='Telefono')
    x_blood               = fields.Char(string='Tipo de sangre')
    x_allergies           = fields.Text(string='Alergias')
    x_conditions          = fields.Text(string='Condiciones')
    x_health_issues       = fields.Text(string='Problemas de salud')
    x_ec1_name            = fields.Char(string='Contacto 1 Nombre')
    x_ec1_phone           = fields.Char(string='Contacto 1 Telefono')
    x_ec1_email           = fields.Char(string='Contacto 1 Email')
    x_ec1_rel             = fields.Char(string='Contacto 1 Relacion')
    x_ec2_name            = fields.Char(string='Contacto 2 Nombre')
    x_ec2_phone           = fields.Char(string='Contacto 2 Telefono')
    x_ec2_email           = fields.Char(string='Contacto 2 Email')
    x_ec2_rel             = fields.Char(string='Contacto 2 Relacion')
    x_custom_instructions = fields.Text(string='Instrucciones LENS')
    x_photo               = fields.Text(string='Foto base64')
    x_emergelens_id       = fields.Char(string='ID EmergeLens')


class EmergelensChat(models.Model):
    _name = 'x.emergelens.chat'
    _description = 'Conversaciones LENS'

    x_title   = fields.Char(string='Titulo')
    x_status  = fields.Selection([
        ('active',   'Activo'),
        ('archived', 'Archivado'),
        ('trashed',  'Papelera'),
    ], string='Estado', default='active')
    x_user_id = fields.Many2one('res.users', string='Usuario')


class EmergelensMessage(models.Model):
    _name = 'x.emergelens.message'
    _description = 'Mensajes LENS'

    x_chat_id   = fields.Many2one('x.emergelens.chat', string='Chat')
    x_role      = fields.Char(string='Rol')
    x_content   = fields.Text(string='Contenido')
    x_audio_url = fields.Char(string='Audio URL')


class EmergelensEmergency(models.Model):
    _name = 'x.emergelens.emergency'
    _description = 'Incidentes de emergencia'

    x_user_id        = fields.Many2one('res.users', string='Usuario')
    x_name           = fields.Char(string='Nombre del usuario')
    x_email          = fields.Char(string='Email del usuario')
    x_type           = fields.Char(string='Tipo de emergencia')
    x_status         = fields.Selection([
        ('active',      'Activo'),
        ('monitoring',  'En seguimiento'),
        ('resolved',    'Resuelto'),
        ('false_alarm', 'Falso positivo'),
        ('cancelled',   'Cancelado'),
    ], string='Estado', default='active')
    x_lat            = fields.Float(string='Latitud',  digits=(10, 7))
    x_lng            = fields.Float(string='Longitud', digits=(10, 7))
    x_address        = fields.Char(string='Direccion')
    x_ts             = fields.Float(string='Timestamp (unix)')
    x_started_at     = fields.Float(string='Inicio (unix)')
    x_ended_at       = fields.Float(string='Fin (unix)')
    x_battery        = fields.Float(string='Bateria %')
    x_charging       = fields.Boolean(string='Cargando')
    x_photo_evidence = fields.Text(string='Foto evidencia base64')
    x_audio_evidence = fields.Text(string='Audio evidencia base64')
    x_notes          = fields.Text(string='Notas')
    x_unit           = fields.Char(string='Unidad asignada')


class EmergelensNotification(models.Model):
    _name = 'x.emergelens.notification'
    _description = 'Notificaciones del sistema'

    x_user_id    = fields.Many2one('res.users', string='Usuario')
    x_target_uid = fields.Many2one('res.users', string='Usuario destino')
    x_name       = fields.Char(string='Titulo')
    x_ts         = fields.Float(string='Timestamp (unix)')
    x_title      = fields.Char(string='Titulo (legacy)')
    x_message    = fields.Text(string='Mensaje')
    x_type       = fields.Char(string='Tipo')
    x_read       = fields.Boolean(string='Leido', default=False)
    x_timestamp  = fields.Datetime(string='Fecha y hora')
    x_for_admin  = fields.Boolean(string='Para admin', default=False)
    x_alert_id   = fields.Integer(string='ID de alerta relacionada')
    x_lat        = fields.Float(string='Lat alerta')
    x_lng        = fields.Float(string='Lng alerta')


class EmergelensMed(models.Model):
    _name = 'x.emergelens.med'
    _description = 'Medicamentos del usuario'

    x_user_id   = fields.Many2one('res.users', string='Usuario')
    x_name      = fields.Char(string='Medicamento')
    x_dose      = fields.Char(string='Dosis')
    x_freq      = fields.Char(string='Frecuencia')
    x_frequency = fields.Char(string='Frecuencia (legacy)')
    x_times     = fields.Char(string='Horarios JSON')
    x_time      = fields.Char(string='Hora')
    x_active    = fields.Boolean(string='Activo', default=True)
    x_notes     = fields.Text(string='Notas')


class EmergelensOperatorChat(models.Model):
    _name = 'x.emergelens.operator.chat'
    _description = 'Chat operador-usuario'

    x_user_id     = fields.Many2one('res.users', string='Usuario')
    x_sender_role = fields.Selection([
        ('user',  'Usuario'),
        ('admin', 'Admin'),
    ], string='Rol del emisor')
    x_content   = fields.Text(string='Contenido')
    x_timestamp = fields.Datetime(string='Fecha y hora')
    x_read      = fields.Boolean(string='Leido', default=False)


class EmergelensScheduledMsg(models.Model):
    _name = 'x.emergelens.scheduled.msg'
    _description = 'Mensajes automaticos programados'

    x_content         = fields.Text(string='Contenido')
    x_send_time       = fields.Char(string='Hora de envio')
    x_active          = fields.Boolean(string='Activo', default=True)
    x_ai_generated    = fields.Boolean(string='Generado por IA', default=False)
    x_target_user_ids = fields.Char(string='Usuarios destino JSON')
    x_last_sent       = fields.Datetime(string='Ultimo envio')


class EmergelensAudit(models.Model):
    _name = 'x.emergelens.audit'
    _description = 'Registro de auditoria'

    x_user_id   = fields.Many2one('res.users', string='Usuario')
    x_action    = fields.Char(string='Accion')
    x_role      = fields.Selection([
        ('user',  'Usuario'),
        ('admin', 'Admin'),
    ], string='Rol')
    x_detail    = fields.Text(string='Detalle')
    x_timestamp = fields.Datetime(string='Fecha y hora')
    x_ip        = fields.Char(string='IP')


# ── RF16: Geofencing ──────────────────────────────────────────────────────────

class EmergelensGeofence(models.Model):
    _name = 'x.emergelens.geofence'
    _description = 'Zonas seguras y peligrosas (geofencing)'

    x_name       = fields.Char(string='Nombre de la zona', required=True)
    x_user_id    = fields.Many2one('res.users', string='Usuario', required=True)
    x_lat        = fields.Float(string='Latitud',  digits=(10, 7))
    x_lng        = fields.Float(string='Longitud', digits=(10, 7))
    x_radius     = fields.Integer(string='Radio en metros', default=250)
    x_type       = fields.Selection([
        ('safe',   'Zona segura'),
        ('danger', 'Zona peligrosa'),
    ], string='Tipo', default='safe', required=True)
    x_active     = fields.Boolean(string='Activa', default=True)
    x_created_by = fields.Selection([
        ('user',  'Usuario'),
        ('admin', 'Admin'),
    ], string='Creada por', default='user')


class EmergelensGeofenceEvent(models.Model):
    _name = 'x.emergelens.geofence.event'
    _description = 'Eventos de violacion de zona geofencing'

    x_user_id    = fields.Many2one('res.users', string='Usuario', required=True)
    x_zone_id    = fields.Many2one('x.emergelens.geofence', string='Zona', ondelete='set null')
    x_zone_name  = fields.Char(string='Nombre de la zona')
    x_zone_type  = fields.Selection([
        ('safe',   'Zona segura'),
        ('danger', 'Zona peligrosa'),
    ], string='Tipo de zona')
    x_event_type = fields.Selection([
        ('exit',  'Salio de zona'),
        ('enter', 'Entro a zona'),
    ], string='Tipo de evento')
    x_lat        = fields.Float(string='Latitud al momento del evento',  digits=(10, 7))
    x_lng        = fields.Float(string='Longitud al momento del evento', digits=(10, 7))
    x_timestamp  = fields.Datetime(string='Fecha y hora del evento') 

    