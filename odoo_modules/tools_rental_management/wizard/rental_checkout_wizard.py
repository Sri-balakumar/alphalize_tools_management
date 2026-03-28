from odoo import models, fields, api, _
from odoo.exceptions import UserError


class RentalCheckoutWizard(models.TransientModel):
    _name = 'rental.checkout.wizard'
    _description = 'Rental Check-Out Wizard'

    order_id = fields.Many2one(
        'rental.order', string='Rental Order', required=True)
    partner_id = fields.Many2one(
        'res.partner', string='Customer', readonly=True)
    checkout_date = fields.Datetime(
        string='Check-Out Date', default=fields.Datetime.now)
    line_ids = fields.One2many(
        'rental.checkout.wizard.line', 'wizard_id',
        string='Tools')

    # ID Proof – front (required) + back (optional)
    id_proof_front = fields.Binary(string='ID Proof - Front')
    id_proof_back = fields.Binary(string='ID Proof - Back')

    # Customer Signature
    customer_signature = fields.Binary(string='Customer Signature')

    # Advance Amount
    currency_id = fields.Many2one(
        'res.currency', default=lambda self: self.env.company.currency_id)
    advance_amount = fields.Monetary(
        string='Advance Amount', currency_field='currency_id',
        help='Advance amount collected from the customer at checkout.')
    payment_method = fields.Selection([
        ('cash', 'Cash'),
        ('card', 'Card'),
        ('bank', 'Bank'),
        ('credit', 'Credit'),
    ], string='Payment Method')
    cash_received = fields.Monetary(
        string='Cash Received', currency_field='currency_id')
    cash_balance = fields.Monetary(
        string='Balance to Return',
        compute='_compute_cash_balance',
        currency_field='currency_id')

    @api.depends('cash_received', 'advance_amount')
    def _compute_cash_balance(self):
        for wiz in self:
            if wiz.cash_received:
                wiz.cash_balance = wiz.cash_received - (wiz.advance_amount or 0.0)
            else:
                wiz.cash_balance = 0.0

    @api.onchange('order_id')
    def _onchange_order_id(self):
        if self.order_id:
            lines = []
            for ol in self.order_id.line_ids:
                lines.append((0, 0, {
                    'order_line_id': ol.id,
                    'tool_id': ol.tool_id.id,
                    'product_id': ol.product_id.id if ol.product_id else False,
                    'quantity': 1,
                    'unit_price': ol.unit_price,
                    'planned_duration': ol.planned_duration,
                    'rental_cost': ol.rental_cost,
                }))
            self.line_ids = lines

    def action_confirm_checkout(self):
        self.ensure_one()

        if not self.id_proof_front:
            raise UserError(_('ID Proof (Front Side) is mandatory. Please take a photo or attach a file.'))
        if not self.customer_signature:
            raise UserError(_('Customer signature is mandatory. Please sign before proceeding.'))

        # Save ID proof photos + signature + timestamp on the rental order
        order_vals = {
            'id_proof_front': self.id_proof_front,
            'customer_signature': self.customer_signature,
            'checkout_signature_date': fields.Datetime.now(),
        }
        if self.id_proof_back:
            order_vals['id_proof_back'] = self.id_proof_back

        # Save advance amount and payment method if entered
        if self.advance_amount > 0:
            order_vals['advance_amount'] = self.advance_amount
            if self.payment_method:
                order_vals['payment_method'] = self.payment_method
            if self.cash_received:
                order_vals['cash_received'] = self.cash_received

        self.order_id.write(order_vals)

        # Validate condition is set for all lines
        for wiz_line in self.line_ids:
            if not wiz_line.condition:
                raise UserError(
                    _('Please set the condition for all tools before check-out.'))

        # Save checkout condition and tool images to order lines
        for wiz_line in self.line_ids:
            if wiz_line.order_line_id:
                vals = {'checkout_condition': wiz_line.condition}
                if wiz_line.tool_image:
                    vals['checkout_tool_image'] = wiz_line.tool_image
                wiz_line.order_line_id.write(vals)

        # Call the existing checkout logic
        self.order_id.action_checkout()
        # Sync media popup records
        self.order_id._sync_media_records()

        # Log advance in timesheet if entered
        if self.advance_amount > 0:
            self.env['rental.timesheet'].create({
                'order_id': self.order_id.id,
                'action': 'note',
                'date': fields.Date.today(),
                'user_id': self.env.user.id,
                'notes': f'Advance of {self.order_id.currency_id.symbol or "$"} {self.advance_amount:.2f} collected from customer.',
            })

        return {'type': 'ir.actions.act_window_close'}


class RentalCheckoutWizardLine(models.TransientModel):
    _name = 'rental.checkout.wizard.line'
    _description = 'Check-Out Wizard Line'

    wizard_id = fields.Many2one(
        'rental.checkout.wizard', ondelete='cascade')
    order_line_id = fields.Many2one('rental.order.line', string='Order Line')
    tool_id = fields.Many2one('rental.tool', string='Tool', readonly=True)
    product_id = fields.Many2one('product.product', string='Product', readonly=True)
    tool_name = fields.Char(string='Tool Name', compute='_compute_tool_name', readonly=True)
    serial_number = fields.Char(
        related='tool_id.serial_number', string='Serial No.', readonly=True)
    quantity = fields.Float(string='Qty', readonly=True)
    currency_id = fields.Many2one(
        related='wizard_id.order_id.currency_id')
    unit_price = fields.Monetary(
        string='Price', currency_field='currency_id', readonly=True)
    planned_duration = fields.Float(string='Duration', readonly=True)
    rental_cost = fields.Monetary(
        string='Total', currency_field='currency_id', readonly=True)
    condition = fields.Selection([
        ('excellent', 'Excellent'),
        ('good', 'Good'),
        ('fair', 'Fair'),
        ('poor', 'Poor'),
        ('damaged', 'Damaged'),
    ], string='Condition', required=True, default='good')
    tool_image = fields.Binary(string='Tool Photo')

    @api.depends('product_id', 'tool_id')
    def _compute_tool_name(self):
        for line in self:
            if line.product_id:
                line.tool_name = line.product_id.name
            elif line.tool_id:
                line.tool_name = line.tool_id.name
            else:
                line.tool_name = ''
