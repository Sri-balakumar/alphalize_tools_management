from odoo import models, fields, api, _
from odoo.exceptions import UserError


def _format_duration(days):
    """Format days into human-readable string (e.g., '1 Week and 1 Day')."""
    if days <= 0:
        return "0 Days"
    weeks = int(days) // 7
    remaining = int(days) % 7
    parts = []
    if weeks:
        parts.append(f"{weeks} {'Week' if weeks == 1 else 'Weeks'}")
    if remaining:
        parts.append(f"{remaining} {'Day' if remaining == 1 else 'Days'}")
    return ' and '.join(parts) if parts else "0 Days"


class RentalCheckinWizard(models.TransientModel):
    _name = 'rental.checkin.wizard'
    _description = 'Rental Check-In Wizard'

    order_id = fields.Many2one(
        'rental.order', string='Rental Order', required=True)
    partner_id = fields.Many2one(
        'res.partner', string='Customer', readonly=True)
    checkout_date = fields.Datetime(
        string='Check-Out Date', compute='_compute_checkout_date')
    checkin_date = fields.Datetime(
        string='Check-In Date', default=fields.Datetime.now)
    total_days = fields.Integer(
        string='Total Days', compute='_compute_total_days')
    total_days_display = fields.Char(
        string='Duration', compute='_compute_total_days')
    line_ids = fields.One2many(
        'rental.checkin.wizard.line', 'wizard_id',
        string='Tools')
    currency_id = fields.Many2one(
        'res.currency', default=lambda self: self.env.company.currency_id)
    total_damage_charge = fields.Monetary(
        string='Total Damage Charges',
        compute='_compute_total_damage_charge', currency_field='currency_id')
    total_late_fee = fields.Monetary(
        string='Total Late Fees',
        compute='_compute_total_late_fee', currency_field='currency_id')
    total_discount = fields.Monetary(
        string='Total Discount',
        compute='_compute_total_discount', currency_field='currency_id')
    return_advance = fields.Boolean(
        string='Return Advance?', default=True)
    advance_amount = fields.Monetary(
        string='Advance Collected',
        compute='_compute_advance_amount',
        currency_field='currency_id')
    total_bill = fields.Monetary(
        string='Total Bill',
        compute='_compute_total_bill',
        currency_field='currency_id')
    balance_due = fields.Monetary(
        string='Balance Due from Customer',
        compute='_compute_balance_due',
        currency_field='currency_id')
    is_late = fields.Boolean(
        string='Late Return', compute='_compute_total_days')
    is_partial = fields.Boolean(
        string='Partial Return', compute='_compute_is_partial')
    original_line_count = fields.Integer(
        string='Original Line Count',
        help='Number of lines when wizard was created, used to detect removed lines.')
    # Customer signature at check-in
    checkin_customer_signature = fields.Binary(
        string='Customer Signature')
    # Authority signature
    customer_name = fields.Char(string='Signer Name')
    customer_signature = fields.Binary(string='Authority Signature')

    @api.depends('order_id.date_checkout')
    def _compute_checkout_date(self):
        for wiz in self:
            wiz.checkout_date = wiz.order_id.date_checkout

    @api.depends('checkout_date', 'checkin_date')
    def _compute_total_days(self):
        for wiz in self:
            if wiz.checkout_date and wiz.checkin_date:
                delta = (wiz.checkin_date - wiz.checkout_date).days
                wiz.total_days = max(delta, 1)
                planned = wiz.order_id.rental_duration or 0
                if planned and wiz.total_days > planned:
                    extra = wiz.total_days - int(planned)
                    wiz.is_late = True
                    wiz.total_days_display = (
                        f"{_format_duration(int(planned))} + "
                        f"{_format_duration(extra)} Extra"
                    )
                else:
                    wiz.is_late = False
                    wiz.total_days_display = _format_duration(wiz.total_days)
            else:
                wiz.total_days = 0
                wiz.total_days_display = ''
                wiz.is_late = False

    @api.depends('line_ids.damage_charge')
    def _compute_total_damage_charge(self):
        for wiz in self:
            wiz.total_damage_charge = sum(wiz.line_ids.mapped('damage_charge'))

    @api.depends('line_ids.late_fee')
    def _compute_total_late_fee(self):
        for wiz in self:
            wiz.total_late_fee = sum(wiz.line_ids.mapped('late_fee'))

    @api.depends('line_ids.discount_line_amount')
    def _compute_total_discount(self):
        for wiz in self:
            wiz.total_discount = sum(
                wiz.line_ids.mapped('discount_line_amount'))

    @api.depends('order_id.advance_amount')
    def _compute_advance_amount(self):
        for wiz in self:
            wiz.advance_amount = wiz.order_id.advance_amount or 0.0

    @api.depends('order_id.subtotal', 'total_late_fee', 'total_damage_charge',
                 'total_discount')
    def _compute_total_bill(self):
        for wiz in self:
            wiz.total_bill = (
                (wiz.order_id.subtotal or 0.0)
                + (wiz.total_late_fee or 0.0)
                + (wiz.total_damage_charge or 0.0)
                - (wiz.total_discount or 0.0)
            )

    @api.depends('total_bill', 'advance_amount', 'return_advance')
    def _compute_balance_due(self):
        for wiz in self:
            if wiz.advance_amount and not wiz.return_advance:
                wiz.balance_due = max(wiz.total_bill - wiz.advance_amount, 0.0)
            else:
                wiz.balance_due = 0.0

    @api.onchange('return_advance')
    def _onchange_return_advance(self):
        """Force recompute balance_due when toggling the checkbox."""
        if self.advance_amount and not self.return_advance:
            self.balance_due = max(self.total_bill - self.advance_amount, 0.0)
        else:
            self.balance_due = 0.0

    @api.depends('line_ids')
    def _compute_is_partial(self):
        for wiz in self:
            if not wiz.line_ids:
                wiz.is_partial = False
                continue
            # Partial if any line was removed from the wizard
            # (user chose not to return some tools)
            if wiz.original_line_count and len(wiz.line_ids) < wiz.original_line_count:
                wiz.is_partial = True
                continue
            wiz.is_partial = False

    @api.onchange('checkin_date')
    def _onchange_checkin_date(self):
        for line in self.line_ids:
            # Ensure planned_days has a value (fallback to order duration)
            if not line.planned_days and self.order_id.rental_duration:
                line.planned_days = self.order_id.rental_duration
            line._compute_late_fields()

    def _collect_damage_info(self, lines=None):
        """Collect damage notes and charges from wizard lines."""
        if lines is None:
            lines = self.line_ids
        damage_notes_list = []
        total_damage = 0.0
        for wiz_line in lines:
            if wiz_line.damage_note:
                damage_notes_list.append(
                    f"{wiz_line.tool_id.name}: {wiz_line.damage_note}")
            total_damage += wiz_line.damage_charge or 0.0
        damage_notes = (
            '\n'.join(damage_notes_list) if damage_notes_list else False
        )
        return damage_notes, total_damage

    def _update_returned_qty(self, lines=None):
        """Update returned_qty, late fees, and extra_days on each order line."""
        if lines is None:
            lines = self.line_ids
        for wiz_line in lines:
            if wiz_line.return_qty > 0:
                ol = wiz_line.order_line_id
                ol.returned_qty = (ol.returned_qty or 0) + wiz_line.return_qty
                # Accumulate late fee from wizard (only for items returned late)
                if wiz_line.late_fee > 0:
                    ol.late_fee_amount = (ol.late_fee_amount or 0) + wiz_line.late_fee
                # Save extra_days from wizard to order line
                if wiz_line.extra_days > 0:
                    ol.extra_days = wiz_line.extra_days
                # Update tool state
                tool = wiz_line.tool_id
                if tool.state == 'rented' and tool.available_qty > 0:
                    tool.state = 'available'

    def action_save_partial(self):
        """Save partial return — order stays checked_out."""
        self.ensure_one()
        # Validate return qty
        for wiz_line in self.line_ids:
            if wiz_line.return_qty < 0:
                raise UserError(_('Return quantity cannot be negative.'))
            if wiz_line.return_qty > wiz_line.pending_qty:
                raise UserError(
                    _('Cannot return more than pending qty for "%s".')
                    % wiz_line.tool_id.name)

        # Determine if lines were deleted from the wizard
        lines_removed = (
            self.original_line_count
            and len(self.line_ids) < self.original_line_count
        )

        if lines_removed:
            # Lines deleted: process all remaining lines, then close
            lines_to_process = self.line_ids
        else:
            # Only qty reduced: process only lines where user reduced return_qty
            lines_to_process = self.line_ids.filtered(
                lambda l: l.return_qty > 0 and l.return_qty < l.pending_qty
            )

        # Save checkin conditions for processed lines
        self._save_checkin_conditions(lines_to_process)

        # Update returned quantities for selected lines only
        self._update_returned_qty(lines_to_process)

        # Handle damage for selected lines only
        damage_notes, total_damage = self._collect_damage_info(lines_to_process)
        if total_damage:
            self.order_id.damage_charges = (
                (self.order_id.damage_charges or 0) + total_damage
            )

        # Timesheet entry
        returned_items = ', '.join(
            f"{l.tool_id.name} x{int(l.return_qty)}"
            for l in lines_to_process if l.return_qty > 0
        )
        if returned_items:
            notes = f'Partial return: {returned_items}'
            if damage_notes:
                notes += f' | Damage: {damage_notes}'
            self.env['rental.timesheet'].create({
                'order_id': self.order_id.id,
                'action': 'note',
                'date': fields.Date.today(),
                'user_id': self.env.user.id,
                'notes': notes,
            })

        # Save signatures + timestamps if provided
        sig_vals = {}
        now = fields.Datetime.now()
        if self.checkin_customer_signature:
            sig_vals['checkin_customer_signature'] = self.checkin_customer_signature
            sig_vals['checkin_customer_signature_date'] = now
        if self.customer_signature:
            sig_vals['checkin_signature'] = self.customer_signature
            sig_vals['checkin_signature_date'] = now
            sig_vals['checkin_signer_name'] = self.customer_name or ''
        if sig_vals:
            self.order_id.write(sig_vals)

        if lines_removed:
            return {'type': 'ir.actions.act_window_close'}

        # Reopen wizard with updated quantities
        return self.order_id.action_checkin_wizard()

    def _save_checkin_conditions(self, lines=None):
        """Save checkin condition and damage note from wizard lines to order lines."""
        if lines is None:
            lines = self.line_ids
        for wiz_line in lines:
            if wiz_line.order_line_id and wiz_line.condition:
                wiz_line.order_line_id.checkin_condition = wiz_line.condition
            if wiz_line.order_line_id and wiz_line.damage_note:
                wiz_line.order_line_id.damage_note = wiz_line.damage_note
            if wiz_line.order_line_id and wiz_line.damage_charge:
                wiz_line.order_line_id.damage_charge = wiz_line.damage_charge
            if wiz_line.order_line_id and wiz_line.tool_image:
                wiz_line.order_line_id.checkin_tool_image = wiz_line.tool_image

    def action_confirm_checkin(self):
        """Full check-in — all tools returned, order moves to checked_in."""
        self.ensure_one()

        # Validate customer signature
        if not self.checkin_customer_signature:
            raise UserError(
                _('Customer signature is mandatory. Please have the customer sign before confirming check-in.'))
        # Validate authority signature
        if not self.customer_signature:
            raise UserError(
                _('Authority signature is mandatory. Please sign before confirming check-in.'))
        if not self.customer_name:
            raise UserError(
                _('Signer name is mandatory. Please enter the name before confirming check-in.'))

        # Validate condition is set
        for wiz_line in self.line_ids:
            if not wiz_line.condition:
                raise UserError(
                    _('Please set the condition for all tools before check-in.'))

        # Save checkin conditions to order lines
        self._save_checkin_conditions()

        # Update returned quantities
        self._update_returned_qty()

        # Collect damage info
        damage_notes, total_damage = self._collect_damage_info()

        # Perform full check-in (changes state to checked_in)
        self.order_id.action_checkin(
            damage_notes=damage_notes,
            damage_charge=total_damage,
        )

        # Save customer + authority signatures with timestamps
        now = fields.Datetime.now()
        self.order_id.write({
            'checkin_customer_signature': self.checkin_customer_signature,
            'checkin_customer_signature_date': now,
            'checkin_signature': self.customer_signature,
            'checkin_signature_date': now,
            'checkin_signer_name': self.customer_name,
        })

        # Handle advance
        if self.return_advance and self.order_id.advance_amount:
            self.order_id.action_return_advance()

        # Sync media popup records
        self.order_id._sync_media_records()

        return {'type': 'ir.actions.act_window_close'}


class RentalCheckinWizardLine(models.TransientModel):
    _name = 'rental.checkin.wizard.line'
    _description = 'Check-In Wizard Line'

    wizard_id = fields.Many2one(
        'rental.checkin.wizard', ondelete='cascade')
    order_line_id = fields.Many2one('rental.order.line', string='Order Line')
    tool_id = fields.Many2one('rental.tool', string='Tool', readonly=True)
    product_id = fields.Many2one('product.product', string='Product', readonly=True)
    tool_name = fields.Char(string='Tool Name', compute='_compute_tool_name', readonly=True)
    serial_number = fields.Char(
        related='tool_id.serial_number', string='Serial No.', readonly=True)
    quantity = fields.Float(string='Checked Out', readonly=True)
    returned_so_far = fields.Float(string='Already Returned', readonly=True)
    pending_qty = fields.Float(string='Pending', readonly=True)
    return_qty = fields.Float(string='Returning Now')

    @api.depends('product_id', 'tool_id')
    def _compute_tool_name(self):
        for line in self:
            if line.product_id:
                line.tool_name = line.product_id.name
            elif line.tool_id:
                line.tool_name = line.tool_id.name
            else:
                line.tool_name = ''

    @api.onchange('return_qty')
    def _onchange_return_qty(self):
        if self.return_qty < 0:
            self.return_qty = 0
            return {'warning': {
                'title': _('Invalid Quantity'),
                'message': _('Return quantity cannot be negative.'),
            }}
        if self.return_qty > self.pending_qty:
            self.return_qty = self.pending_qty
            return {'warning': {
                'title': _('Invalid Quantity'),
                'message': _('Cannot return more than pending quantity (%.0f).') % self.pending_qty,
            }}

    condition = fields.Selection([
        ('excellent', 'Excellent'),
        ('good', 'Good'),
        ('fair', 'Fair'),
        ('poor', 'Poor'),
        ('damaged', 'Damaged'),
    ], string='Condition', required=True, default='good')
    damage_note = fields.Char(string='Damage Note')
    currency_id = fields.Many2one(
        related='wizard_id.currency_id')
    damage_charge = fields.Monetary(
        string='Damage Charge', currency_field='currency_id')
    tool_image = fields.Binary(string='Tool Photo')

    # Discount fields (readonly, pre-filled from order line)
    discount_display = fields.Char(
        string='Discount', readonly=True,
        help='Shows discount type and value applied.')
    discount_line_amount = fields.Monetary(
        string='Disc. Amount', currency_field='currency_id',
        readonly=True)

    # Duration fields (original period type from rental line)
    period_type = fields.Selection([
        ('day', 'Day'), ('week', 'Week'), ('month', 'Month'),
    ], string='Period Type', readonly=True, default='day')
    planned_duration = fields.Float(string='Planned Duration', readonly=True, default=1)

    # Late fee fields
    planned_days = fields.Float(string='Planned Days', readonly=True)
    late_fee_per_day = fields.Monetary(
        string='Late Fee/Day', currency_field='currency_id', readonly=True)
    extra_days = fields.Integer(
        string='Extra Days', compute='_compute_late_fields')
    duration_display = fields.Char(
        string='Duration', compute='_compute_late_fields')
    late_fee = fields.Monetary(
        string='Late Fee', compute='_compute_late_fields',
        currency_field='currency_id')

    @api.depends('wizard_id.checkout_date', 'wizard_id.checkin_date',
                 'planned_days', 'late_fee_per_day', 'return_qty',
                 'period_type', 'planned_duration')
    def _compute_late_fields(self):
        period_labels = {'day': 'Day', 'week': 'Week', 'month': 'Month'}
        period_labels_plural = {'day': 'Days', 'week': 'Weeks', 'month': 'Months'}
        for line in self:
            checkout = line.wizard_id.checkout_date
            checkin = line.wizard_id.checkin_date
            # Fallback: use order's rental_duration when planned_days is 0
            planned = int(
                line.planned_days
                or line.wizard_id.order_id.rental_duration
                or 0
            )

            # Format planned duration using original period type
            dur = int(line.planned_duration or 1)
            ptype = line.period_type or 'day'
            label = period_labels_plural.get(ptype, 'Days') if dur != 1 else period_labels.get(ptype, 'Day')
            planned_label = f"{dur} {label}"

            if checkout and checkin:
                actual = max((checkin - checkout).days, 1)
                extra = max(actual - planned, 0) if planned else 0
                line.extra_days = extra
                if extra > 0:
                    line.duration_display = (
                        f"{planned_label} + "
                        f"{_format_duration(extra)} Extra"
                    )
                else:
                    line.duration_display = planned_label
                # Late fee for this serialized unit (qty is always 1)
                line.late_fee = extra * (line.late_fee_per_day or 0)
            else:
                line.extra_days = 0
                line.duration_display = planned_label
                line.late_fee = 0
