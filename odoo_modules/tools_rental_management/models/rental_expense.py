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

    # Legacy Selection — kept (no longer required) for backward compat
    # so old expense records still display correctly. New records use
    # category_id (the Many2one to rental.expense.category below).
    category = fields.Selection([
        ('fuel', 'Fuel'),
        ('repair', 'Repair / Maintenance'),
        ('tools', 'Tools / Equipment'),
        ('transport', 'Transport'),
        ('office', 'Office'),
        ('food', 'Food / Travel'),
        ('rent', 'Rent / Utilities'),
        ('other', 'Other'),
    ], string='Category (legacy)', default='other', tracking=True)
    category_id = fields.Many2one(
        'rental.expense.category',
        string='Category', required=True, tracking=True,
        help='Pick a configurable expense category. Edit categories in '
             'Tools Rental → Configuration → Expense Categories.')

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

    # ── hr.expense parity fields (added so mobile form can mirror Odoo) ──
    manager_id = fields.Many2one(
        'res.users', string='Manager', tracking=True,
        help='Who is responsible for approving this expense '
             '(auto-validation if blank).')
    account_name = fields.Char(
        string='Account (text)', tracking=True,
        help='Fallback text field for mobile app if account.account is not available.')
    account_id = fields.Many2one(
        'account.account', string='Account', tracking=True,
        help='Accounting account this expense will post to.')
    tax_percent = fields.Float(
        string='Tax %', default=0.0, tracking=True,
        help='Tax percentage applied to this expense. Copied from the '
             'category when picked, but can be manually adjusted.')
    included_taxes = fields.Monetary(
        string='Included Taxes', currency_field='currency_id',
        compute='_compute_included_taxes', store=True,
        help='Computed tax amount = quantity × unit_price × tax_percent / 100.')

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

    @api.depends('quantity', 'unit_price', 'tax_percent')
    def _compute_included_taxes(self):
        for rec in self:
            total = (rec.quantity or 0) * (rec.unit_price or 0)
            rec.included_taxes = round(total * (rec.tax_percent or 0) / 100.0, 3)

    @api.onchange('category_id')
    def _onchange_category_id(self):
        """Auto-fill unit_price + tax_percent from the picked category."""
        for rec in self:
            cat = rec.category_id
            if not cat:
                continue
            # Suggest the category's default cost only if no price entered yet
            if not rec.unit_price and cat.cost:
                rec.unit_price = cat.cost
            # Always apply the category's tax percentage
            rec.tax_percent = cat.tax_percent or 0.0

    # ---------- Utility actions ----------
    def action_attach_receipt(self):
        """Open the form's Receipt tab. In practice the user scrolls down
        to the Receipt tab to upload the image — this button is a UX hint
        matching the standard hr.expense Attach Receipt button layout."""
        self.ensure_one()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Attach Receipt',
                'message': 'Scroll down to the "Receipt" tab to upload your receipt image.',
                'type': 'info',
                'sticky': False,
            },
        }

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

    def action_split_expense(self, num_parts=2):
        """Open the Split Expense wizard as a popup.

        When called from the Odoo web form button (no args), opens the wizard.
        When called from the mobile app with num_parts > 0, does a quick
        server-side split without the wizard (mobile has its own split modal).
        """
        self.ensure_one()
        if self.state != 'draft':
            raise UserError(_('Only draft expenses can be split.'))

        # If called with explicit num_parts from mobile RPC, split directly
        if self.env.context.get('mobile_split'):
            n = int(num_parts or 2)
            if n < 2 or n > 20:
                raise UserError(_('Number of parts must be between 2 and 20.'))
            new_unit = (self.unit_price or 0.0) / n
            for _i in range(n - 1):
                self.copy({
                    'unit_price': new_unit,
                    'name': (self.name or '') + ' (split)',
                    'state': 'draft',
                })
            self.unit_price = new_unit
            return True

        # Otherwise open the wizard popup (Odoo web button click)
        view = self.env.ref(
            'tools_rental_management.view_rental_expense_split_wizard_form',
            raise_if_not_found=False,
        )
        action = {
            'type': 'ir.actions.act_window',
            'name': _('Expense split'),
            'res_model': 'rental.expense.split.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {'default_expense_id': self.id},
        }
        if view:
            action['views'] = [(view.id, 'form')]
            action['view_id'] = view.id
        return action
