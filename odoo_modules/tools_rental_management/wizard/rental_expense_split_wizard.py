from odoo import models, fields, api, _
from odoo.exceptions import UserError


class RentalExpenseSplitWizard(models.TransientModel):
    """Wizard to split a single rental expense into multiple parts.

    Opens as a popup when the user clicks "Split Expense" on a draft expense.
    Pre-fills 2 equal lines from the original expense; the user can add/remove
    lines, adjust amounts, then confirm to create the individual expenses.
    """
    _name = 'rental.expense.split.wizard'
    _description = 'Split Expense Wizard'

    expense_id = fields.Many2one(
        'rental.expense', string='Original Expense',
        required=True, ondelete='cascade')
    original_amount = fields.Monetary(
        string='Original Amount',
        related='expense_id.total_amount', readonly=True,
        currency_field='currency_id')
    currency_id = fields.Many2one(
        'res.currency',
        default=lambda self: self.env.company.currency_id)
    line_ids = fields.One2many(
        'rental.expense.split.wizard.line', 'wizard_id',
        string='Split Lines')
    total_amount = fields.Monetary(
        string='Total Amount',
        compute='_compute_totals', currency_field='currency_id')
    total_tax = fields.Monetary(
        string='Taxes',
        compute='_compute_totals', currency_field='currency_id')
    amounts_match = fields.Boolean(
        compute='_compute_totals')

    @api.depends('line_ids.total_amount', 'line_ids.tax_amount',
                 'expense_id.total_amount')
    def _compute_totals(self):
        for wiz in self:
            wiz.total_amount = sum(wiz.line_ids.mapped('total_amount'))
            wiz.total_tax = sum(wiz.line_ids.mapped('tax_amount'))
            orig = wiz.expense_id.total_amount or 0
            wiz.amounts_match = abs(wiz.total_amount - orig) < 0.01

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        expense_id = self.env.context.get('default_expense_id')
        if expense_id:
            expense = self.env['rental.expense'].browse(expense_id)
            # Pre-fill 2 equal split lines
            half = round((expense.unit_price or 0) / 2, 3)
            lines = []
            for _i in range(2):
                lines.append((0, 0, {
                    'name': expense.name or '',
                    'category_id': expense.category_id.id if expense.category_id else False,
                    'user_id': expense.user_id.id if expense.user_id else False,
                    'tax_percent': expense.category_id.tax_percent if expense.category_id else 0,
                    'unit_price': half,
                    'quantity': expense.quantity or 1,
                }))
            res['line_ids'] = lines
        return res

    def action_split(self):
        """Create one new expense per line (except the first, which updates
        the original) and return to the expense list."""
        self.ensure_one()
        if not self.line_ids:
            raise UserError(_('Please add at least one split line.'))
        expense = self.expense_id
        if expense.state != 'draft':
            raise UserError(_('Only draft expenses can be split.'))

        first = True
        for line in self.line_ids:
            vals = {
                'name': line.name or expense.name,
                'date': expense.date,
                'category_id': line.category_id.id if line.category_id else False,
                'user_id': line.user_id.id if line.user_id else expense.user_id.id,
                'quantity': line.quantity,
                'unit_price': line.unit_price,
                'tax_percent': line.tax_percent,
                'payment_mode': expense.payment_mode,
                'payment_method': expense.payment_method,
                'rental_order_id': expense.rental_order_id.id if expense.rental_order_id else False,
                'notes': expense.notes,
                'manager_id': expense.manager_id.id if expense.manager_id else False,
                'account_id': expense.account_id.id if expense.account_id else False,
                'receipt_image': expense.receipt_image,
                'receipt_filename': expense.receipt_filename,
                'state': 'draft',
            }
            if first:
                # Update the original expense
                expense.write(vals)
                first = False
            else:
                # Create new expense
                expense.copy(vals)

        return {'type': 'ir.actions.act_window_close'}


class RentalExpenseSplitWizardLine(models.TransientModel):
    _name = 'rental.expense.split.wizard.line'
    _description = 'Split Expense Line'

    wizard_id = fields.Many2one(
        'rental.expense.split.wizard', ondelete='cascade')
    name = fields.Char(string='Description')
    category_id = fields.Many2one(
        'rental.expense.category', string='Product')
    user_id = fields.Many2one('res.users', string='Employee')
    tax_percent = fields.Float(string='Tax')
    quantity = fields.Float(string='Quantity', default=1)
    unit_price = fields.Monetary(
        string='Unit Price', currency_field='currency_id')
    currency_id = fields.Many2one(
        related='wizard_id.currency_id')
    total_amount = fields.Monetary(
        string='Total In Currency',
        compute='_compute_amounts', store=True,
        currency_field='currency_id')
    tax_amount = fields.Monetary(
        string='Tax Amount In Currency',
        compute='_compute_amounts', store=True,
        currency_field='currency_id')

    @api.depends('quantity', 'unit_price', 'tax_percent')
    def _compute_amounts(self):
        for line in self:
            subtotal = (line.quantity or 0) * (line.unit_price or 0)
            line.tax_amount = round(subtotal * (line.tax_percent or 0) / 100, 3)
            line.total_amount = subtotal
