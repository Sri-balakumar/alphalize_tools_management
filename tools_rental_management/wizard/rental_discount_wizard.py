from odoo import models, fields, api, _
from odoo.exceptions import UserError


class RentalDiscountWizard(models.TransientModel):
    _name = 'rental.discount.wizard'
    _description = 'Rental Discount Authorization Wizard'

    order_id = fields.Many2one(
        'rental.order', string='Rental Order', required=True)
    currency_id = fields.Many2one(
        'res.currency', default=lambda self: self.env.company.currency_id)

    # Page tracking (1 = authorization, 2 = discount entry)
    page = fields.Selection([
        ('1', 'Authorization'),
        ('2', 'Discount Entry'),
    ], string='Page', default='1')

    # Page 1 — Authorization fields
    authorized_name = fields.Char(string='Authorized Person Name')
    authorized_signature = fields.Binary(string='Authorized Signature')
    authorized_photo = fields.Binary(string='Authorized Photo')

    # Page 2 — Discount mode (visible only when multiple products)
    discount_mode = fields.Selection([
        ('total', 'Total Product Discount'),
        ('separate', 'Separate Product Discount'),
    ], string='Discount Mode', default='separate')

    line_count = fields.Integer(
        string='Line Count', compute='_compute_line_count')

    # Total discount fields (used when discount_mode == 'total')
    total_discount_type = fields.Selection([
        ('percentage', 'Percentage'),
        ('fixed', 'Fixed Amount'),
    ], string='Discount Type', default='percentage')
    total_discount_value = fields.Float(string='Discount Value')

    # Page 2 — Discount lines
    line_ids = fields.One2many(
        'rental.discount.wizard.line', 'wizard_id',
        string='Discount Lines')
    total_discount = fields.Monetary(
        string='Total Discount',
        compute='_compute_total_discount',
        currency_field='currency_id')

    @api.depends('line_ids')
    def _compute_line_count(self):
        for wiz in self:
            wiz.line_count = len(wiz.line_ids)

    @api.depends('line_ids.discount_amount')
    def _compute_total_discount(self):
        for wiz in self:
            wiz.total_discount = sum(wiz.line_ids.mapped('discount_amount'))

    @api.onchange('discount_mode')
    def _onchange_discount_mode(self):
        """Reset discount values when switching modes."""
        if self.discount_mode == 'total':
            # Reset individual line discounts
            for line in self.line_ids:
                line.discount_type = 'percentage'
                line.discount_value = 0.0
            self.total_discount_type = 'percentage'
            self.total_discount_value = 0.0
        else:
            # Reset total discount fields
            self.total_discount_type = 'percentage'
            self.total_discount_value = 0.0
            for line in self.line_ids:
                line.discount_type = 'percentage'
                line.discount_value = 0.0

    @api.onchange('total_discount_type', 'total_discount_value')
    def _onchange_total_discount(self):
        """When total discount fields change, distribute to all lines."""
        if self.discount_mode != 'total':
            return
        if self.total_discount_type == 'percentage':
            # Validate percentage range
            if self.total_discount_value < 0:
                self.total_discount_value = 0
            elif self.total_discount_value > 100:
                self.total_discount_value = 100
            # Apply same percentage to all lines
            for line in self.line_ids:
                line.discount_type = 'percentage'
                line.discount_value = self.total_discount_value
        elif self.total_discount_type == 'fixed':
            # Validate fixed amount
            grand_total = sum(
                (l.rental_cost or 0.0) + (l.late_fee or 0.0) + (l.damage_charge or 0.0)
                for l in self.line_ids
            )
            if self.total_discount_value < 0:
                self.total_discount_value = 0
            elif grand_total and self.total_discount_value > grand_total:
                self.total_discount_value = grand_total
            # Distribute fixed amount proportionally across lines
            for line in self.line_ids:
                line_base = (
                    (line.rental_cost or 0.0)
                    + (line.late_fee or 0.0)
                    + (line.damage_charge or 0.0)
                )
                if grand_total > 0:
                    proportion = line_base / grand_total
                    line.discount_type = 'fixed'
                    line.discount_value = round(
                        self.total_discount_value * proportion, 2)
                else:
                    line.discount_type = 'fixed'
                    line.discount_value = 0.0

    def action_next(self):
        """Validate page 1 and switch to page 2."""
        self.ensure_one()
        if not self.authorized_name:
            raise UserError(
                _('Authorized person name is mandatory.'))
        if not self.authorized_signature:
            raise UserError(
                _('Authorized person signature is mandatory.'))
        if not self.authorized_photo:
            raise UserError(
                _('Authorized person photo is mandatory. '
                  'Please use the camera to take a photo.'))
        self.page = '2'
        return {
            'type': 'ir.actions.act_window',
            'name': _('Apply Discount'),
            'res_model': 'rental.discount.wizard',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }

    def action_back(self):
        """Go back to page 1."""
        self.ensure_one()
        self.page = '1'
        return {
            'type': 'ir.actions.act_window',
            'name': _('Apply Discount'),
            'res_model': 'rental.discount.wizard',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }

    def action_apply_discount(self):
        """Apply discount values to order lines and close."""
        self.ensure_one()

        # If total mode, ensure lines are updated before applying
        if self.discount_mode == 'total' and self.line_count > 1:
            self._apply_total_discount_to_lines()

        total_discount = 0.0
        for wiz_line in self.line_ids:
            ol = wiz_line.order_line_id
            if ol:
                ol.write({
                    'discount_type': wiz_line.discount_type,
                    'discount_value': wiz_line.discount_value,
                })
                total_discount += wiz_line.discount_amount

        # Write total discount and authorization info to order
        self.order_id.write({
            'discount_amount': total_discount,
            'discount_authorized_by': self.authorized_name,
            'discount_auth_signature': self.authorized_signature,
            'discount_auth_photo': self.authorized_photo,
            'discount_applied_date': fields.Datetime.now(),
        })

        # Log in timesheet
        self.env['rental.timesheet'].create({
            'order_id': self.order_id.id,
            'action': 'discount',
            'date': fields.Date.today(),
            'user_id': self.env.user.id,
            'notes': (f'Discount of $ {total_discount:.2f} applied. '
                      f'Authorized by: {self.authorized_name}.'),
        })

        # Sync media popup records
        self.order_id._sync_media_records()

        return {'type': 'ir.actions.act_window_close'}

    def _apply_total_discount_to_lines(self):
        """Distribute total discount values to individual lines."""
        if self.total_discount_type == 'percentage':
            for line in self.line_ids:
                line.write({
                    'discount_type': 'percentage',
                    'discount_value': self.total_discount_value,
                })
        elif self.total_discount_type == 'fixed':
            grand_total = sum(
                (l.rental_cost or 0.0) + (l.late_fee or 0.0) + (l.damage_charge or 0.0)
                for l in self.line_ids
            )
            for line in self.line_ids:
                line_base = (
                    (line.rental_cost or 0.0)
                    + (line.late_fee or 0.0)
                    + (line.damage_charge or 0.0)
                )
                if grand_total > 0:
                    proportion = line_base / grand_total
                    line.write({
                        'discount_type': 'fixed',
                        'discount_value': round(
                            self.total_discount_value * proportion, 2),
                    })
                else:
                    line.write({
                        'discount_type': 'fixed',
                        'discount_value': 0.0,
                    })


class RentalDiscountWizardLine(models.TransientModel):
    _name = 'rental.discount.wizard.line'
    _description = 'Discount Wizard Line'

    wizard_id = fields.Many2one(
        'rental.discount.wizard', ondelete='cascade')
    order_line_id = fields.Many2one(
        'rental.order.line', string='Order Line')
    tool_id = fields.Many2one(
        'rental.tool', string='Tool', readonly=True)
    serial_number = fields.Char(
        string='Serial No.', readonly=True)
    currency_id = fields.Many2one(
        related='wizard_id.currency_id')

    # Readonly cost fields (pre-filled from order line)
    rental_cost = fields.Monetary(
        string='Rental Cost', currency_field='currency_id',
        readonly=True)
    late_fee = fields.Monetary(
        string='Late Fee', currency_field='currency_id',
        readonly=True)
    damage_charge = fields.Monetary(
        string='Damage Charge', currency_field='currency_id',
        readonly=True)
    line_total_before = fields.Monetary(
        string='Total Before Discount',
        compute='_compute_amounts',
        currency_field='currency_id')

    # Discount input fields
    discount_type = fields.Selection([
        ('percentage', 'Percentage'),
        ('fixed', 'Fixed Amount'),
    ], string='Discount Type', default='percentage')
    discount_value = fields.Float(string='Discount Value')

    # Computed output fields
    discount_amount = fields.Monetary(
        string='Discount Amount',
        compute='_compute_amounts',
        currency_field='currency_id')
    final_amount = fields.Monetary(
        string='Final Amount',
        compute='_compute_amounts',
        currency_field='currency_id')

    @api.depends('rental_cost', 'late_fee', 'damage_charge',
                 'discount_type', 'discount_value')
    def _compute_amounts(self):
        for line in self:
            base = ((line.rental_cost or 0.0)
                    + (line.late_fee or 0.0)
                    + (line.damage_charge or 0.0))
            line.line_total_before = base
            if line.discount_type == 'percentage' and line.discount_value:
                line.discount_amount = base * (line.discount_value / 100.0)
            elif line.discount_type == 'fixed' and line.discount_value:
                line.discount_amount = min(line.discount_value, base)
            else:
                line.discount_amount = 0.0
            line.final_amount = base - line.discount_amount

    @api.onchange('discount_value', 'discount_type')
    def _onchange_discount_value(self):
        """Validate discount value."""
        if self.discount_type == 'percentage' and self.discount_value:
            if self.discount_value < 0 or self.discount_value > 100:
                self.discount_value = min(max(self.discount_value, 0), 100)
                return {'warning': {
                    'title': _('Invalid Percentage'),
                    'message': _('Percentage must be between 0 and 100.'),
                }}
        if self.discount_type == 'fixed' and self.discount_value:
            base = ((self.rental_cost or 0.0)
                    + (self.late_fee or 0.0)
                    + (self.damage_charge or 0.0))
            if self.discount_value < 0:
                self.discount_value = 0
            elif self.discount_value > base:
                self.discount_value = base
                return {'warning': {
                    'title': _('Discount Too Large'),
                    'message': _(
                        'Fixed discount cannot exceed the line total.'),
                }}
