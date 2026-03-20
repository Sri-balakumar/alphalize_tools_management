from odoo import models, fields


class RentalTimesheet(models.Model):
    _name = 'rental.timesheet'
    _description = 'Rental Timesheet / Activity Log'
    _order = 'date desc'

    order_id = fields.Many2one(
        'rental.order', string='Rental Order',
        ondelete='cascade', required=True)
    date = fields.Date(
        string='Date', required=True,
        default=fields.Date.today)
    action = fields.Selection([
        ('checkout', 'Check-Out'),
        ('checkin', 'Check-In'),
        ('extend', 'Extension'),
        ('payment', 'Payment Received'),
        ('damage', 'Damage Reported'),
        ('discount', 'Discount Applied'),
        ('note', 'Note'),
    ], string='Action', required=True)
    user_id = fields.Many2one(
        'res.users', string='Done By',
        default=lambda self: self.env.user)
    partner_id = fields.Many2one(
        related='order_id.partner_id', string='Customer', store=True)
    notes = fields.Text(string='Details')
    duration_days = fields.Float(string='Duration (Days)')
    cost_impact = fields.Monetary(string='Cost Impact')
    currency_id = fields.Many2one(
        related='order_id.currency_id')
