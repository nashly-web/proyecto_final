from odoo import models, fields, api


class EmergelensDonationRequest(models.Model):
    _name        = 'x.emergelens.donation.request'
    _description = 'Solicitudes de donacion'
    # Sin _inherit de mail para evitar campos obligatorios ocultos

    x_reference        = fields.Char(string='Referencia', readonly=True, copy=False)
    x_name             = fields.Char(string='Titulo')
    x_user_id          = fields.Many2one('res.users', string='Solicitante')
    x_description      = fields.Text(string='Descripcion')
    x_goal_amount      = fields.Float(string='Meta')
    x_total_received   = fields.Float(string='Total recibido',
                                      compute='_compute_totals', store=True)
    x_remaining_amount = fields.Float(string='Falta',
                                      compute='_compute_totals', store=True)
    x_donors_count     = fields.Integer(string='Donantes',
                                        compute='_compute_totals', store=True)
    x_donations_count  = fields.Integer(string='Donaciones',
                                        compute='_compute_totals', store=True)
    x_helped_by_me     = fields.Boolean(string='He donado',
                                        compute='_compute_helped_by_me')
    x_last_donated_at  = fields.Datetime(string='Ultima donacion')
    x_created_at       = fields.Datetime(string='Fecha de creacion',
                                         default=fields.Datetime.now)
    x_state            = fields.Selection([
        ('open',      'Abierta'),
        ('done',      'Completada'),
        ('cancelled', 'Cancelada'),
    ], string='Estado', default='open')

    x_image_ids    = fields.One2many('x.emergelens.donation.request.image',
                                     'x_request_id', string='Fotos')
    x_donation_ids = fields.One2many('x.emergelens.donation',
                                     'x_request_id', string='Donaciones')

    @api.model
    def create(self, vals):
        if not vals.get('x_reference'):
            try:
                seq = self.env['ir.sequence'].next_by_code(
                    'x.emergelens.donation.request')
                vals['x_reference'] = seq or ('DON-%s' % fields.Datetime.now().strftime('%Y%m%d%H%M%S'))
            except Exception:
                import time
                vals['x_reference'] = 'DON-%d' % int(time.time())
        return super().create(vals)

    @api.depends('x_donation_ids', 'x_donation_ids.x_amount',
                 'x_donation_ids.x_state')
    def _compute_totals(self):
        for rec in self:
            confirmed = rec.x_donation_ids.filtered(
                lambda d: d.x_state == 'confirmed')
            rec.x_total_received   = sum(confirmed.mapped('x_amount'))
            rec.x_remaining_amount = max(
                0, (rec.x_goal_amount or 0) - rec.x_total_received)
            rec.x_donors_count     = len(
                confirmed.mapped('x_donor_user_id'))
            rec.x_donations_count  = len(confirmed)

    def _compute_helped_by_me(self):
        me = self.env.user
        for rec in self:
            rec.x_helped_by_me = bool(
                rec.x_donation_ids.filtered(
                    lambda d: d.x_donor_user_id == me
                    and d.x_state == 'confirmed'))

    def action_mark_done(self):
        self.write({'x_state': 'done'})

    def action_cancel(self):
        self.write({'x_state': 'cancelled'})

    def action_reopen(self):
        self.write({'x_state': 'open'})


class EmergelensDonationRequestImage(models.Model):
    _name        = 'x.emergelens.donation.request.image'
    _description = 'Imagenes de solicitud de donacion'

    x_request_id = fields.Many2one('x.emergelens.donation.request',
                                   string='Solicitud', ondelete='cascade')
    x_name       = fields.Char(string='Descripcion')
    x_image      = fields.Text(string='Imagen base64')


class EmergelensDonation(models.Model):
    _name        = 'x.emergelens.donation'
    _description = 'Donaciones'

    x_request_id    = fields.Many2one('x.emergelens.donation.request',
                                      string='Solicitud', ondelete='cascade')
    x_donor_user_id = fields.Many2one('res.users', string='Donante')
    x_amount        = fields.Float(string='Monto')
    x_note          = fields.Text(string='Mensaje')
    x_date          = fields.Datetime(string='Fecha',
                                      default=fields.Datetime.now)
    x_state         = fields.Selection([
        ('confirmed',  'Confirmada'),
        ('cancelled',  'Cancelada'),
    ], string='Estado', default='confirmed')
    x_name          = fields.Char(string='Nombre',
                                  compute='_compute_name', store=True)

    @api.depends('x_request_id', 'x_donor_user_id')
    def _compute_name(self):
        for rec in self:
            req   = rec.x_request_id.x_name   or 'Donacion'
            donor = rec.x_donor_user_id.name   or 'Anonimo'
            rec.x_name = f"{donor} - {req}"

    def action_cancel(self):
        self.write({'x_state': 'cancelled'})