from odoo import models, fields, api


class RentalExpenseCategory(models.Model):
    """Configurable expense category — admin can add/edit from Odoo web.

    Mirrors the standard Odoo hr.expense product approach but without the
    full product.product / accounting overhead. Each category carries a
    default Cost (suggested unit price) and Tax % which the expense form
    auto-fills when the category is picked.
    """
    _name = 'rental.expense.category'
    _description = 'Rental Expense Category'
    _order = 'name'

    name = fields.Char(string='Name', required=True)
    code = fields.Char(string='Reference',
        help='Short code shown in brackets, e.g. COMM, FUEL, FOOD.')
    cost = fields.Monetary(
        string='Cost', currency_field='currency_id',
        help='Default unit price suggested when this category is picked '
             'on a new expense.')
    tax_percent = fields.Float(
        string='Tax %', default=0.0,
        help='Default included tax percentage applied to the total '
             '(e.g. 5 for 5%).')
    guideline = fields.Text(
        string='Guideline / Note',
        help='Free text shown to users to clarify when to use this category.')
    image = fields.Binary(string='Image', attachment=True)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        'res.company', string='Company',
        default=lambda self: self.env.company)
    currency_id = fields.Many2one(
        'res.currency', string='Currency',
        default=lambda self: self.env.company.currency_id)

    @api.depends('name', 'code')
    def _compute_display_name(self):
        for rec in self:
            if rec.code:
                rec.display_name = '[' + rec.code + '] ' + (rec.name or '')
            else:
                rec.display_name = rec.name or ''
