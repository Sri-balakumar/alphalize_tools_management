from odoo import models, fields, api, _
from odoo.exceptions import UserError


class RentalExpense(models.Model):
    """Standalone expense record for the rental business.

    Mirrors the core fields/states of hr.expense without depending on it,
    so users get a familiar Odoo-style expense flow scoped to this module.
    """
    _name = 'rental.expense'
    _description = 'Rental Expense'
    _order = 'date desc, id desc'
    _inherit = ['mail.thread', 'mail.activity.mixin']

    name = fields.Char(
        string='Description', required=True, tracking=True,
        help='Short description of what was bought / paid for.')
    date = fields.Date(
        string='Expense Date', default=fields.Date.context_today,
        required=True, tracking=True)
    user_id = fields.Many2one(
        'res.users', string='Spent By',
        default=lambda self: self.env.user,
        required=True, tracking=True)
    company_id = fields.Many2one(
        'res.company', string='Company',
        default=lambda self: self.env.company, required=True)
    currency_id = fields.Many2one(
        'res.currency', string='Currency',
        default=lambda self: self.env.company.currency_id, required=True)

    category = fields.Selection([
        ('fuel', 'Fuel'),
        ('repair', 'Repair / Maintenance'),
        ('tools', 'Tools / Equipment'),
        ('transport', 'Transport'),
        ('office', 'Office'),
        ('food', 'Food / Travel'),
        ('rent', 'Rent / Utilities'),
        ('other', 'Other'),
    ], string='Category', required=True, default='other', tracking=True)

    quantity = fields.Float(string='Quantity', default=1.0, required=True)
    unit_price = fields.Monetary(
        string='Unit Price', required=True, currency_field='currency_id',
        tracking=True)
    total_amount = fields.Monetary(
        string='Total Amount', compute='_compute_total_amount',
        store=True, currency_field='currency_id', tracking=True)

    payment_mode = fields.Selection([
        ('own_account', 'Employee (to reimburse)'),
        ('company_account', 'Company'),
    ], string='Paid By', default='own_account', required=True, tracking=True)
    payment_method = fields.Selection([
        ('cash', 'Cash'),
        ('card', 'Card'),
        ('bank', 'Bank'),
        ('credit', 'Credit'),
    ], string='Payment Method', default='cash', tracking=True)

    rental_order_id = fields.Many2one(
        'rental.order', string='Linked Rental Order',
        ondelete='set null', tracking=True,
        help='Optional — link this expense to a specific rental order.')
    notes = fields.Text(string='Notes')
    receipt_image = fields.Binary(string='Receipt', attachment=True)
    receipt_filename = fields.Char(string='Receipt Filename')

    state = fields.Selection([
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('done', 'Paid'),
        ('refused', 'Refused'),
    ], string='Status', default='draft', required=True, tracking=True, copy=False)

    @api.depends('quantity', 'unit_price')
    def _compute_total_amount(self):
        for rec in self:
            rec.total_amount = (rec.quantity or 0.0) * (rec.unit_price or 0.0)

    # ---------- State machine actions ----------
    def action_submit(self):
        for rec in self:
            if rec.state != 'draft':
                raise UserError(_('Only draft expenses can be submitted.'))
            if rec.total_amount <= 0:
                raise UserError(_('Cannot submit an expense with zero amount.'))
            rec.state = 'submitted'

    def action_approve(self):
        for rec in self:
            if rec.state != 'submitted':
                raise UserError(_('Only submitted expenses can be approved.'))
            rec.state = 'approved'

    def action_mark_paid(self):
        for rec in self:
            if rec.state != 'approved':
                raise UserError(_('Only approved expenses can be marked as paid.'))
            rec.state = 'done'

    def action_refuse(self):
        for rec in self:
            if rec.state in ('done',):
                raise UserError(_('Cannot refuse an already paid expense.'))
            rec.state = 'refused'

    def action_reset_to_draft(self):
        for rec in self:
            if rec.state == 'done':
                raise UserError(_('Cannot reset a paid expense to draft.'))
            rec.state = 'draft'
