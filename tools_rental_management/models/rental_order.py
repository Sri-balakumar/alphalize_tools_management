from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError

DAY_MULTIPLIERS = {
    'day': 1,
    'week': 7,
    'month': 30,
}


class RentalOrder(models.Model):
    _name = 'rental.order'
    _description = 'Rental Order'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'create_date desc'

    # ── Header ──────────────────────────────────────────────────────────
    name = fields.Char(
        string='Rental Reference', required=True,
        copy=False, readonly=True, default='New')
    state = fields.Selection([
        ('draft', 'Draft'),
        ('confirmed', 'Confirmed'),
        ('checked_out', 'Checked Out'),
        ('checked_in', 'Checked In'),
        ('done', 'Done'),
        ('invoiced', 'Invoiced'),
        ('cancelled', 'Cancelled'),
    ], string='Status', default='draft', tracking=True, copy=False)

    # ── Customer ────────────────────────────────────────────────────────
    partner_id = fields.Many2one(
        'res.partner', string='Customer',
        required=True, tracking=True,
        domain=[('is_company', '=', False)])
    partner_phone = fields.Char(related='partner_id.phone', string='Phone')
    partner_email = fields.Char(related='partner_id.email', string='Email')

    # ── Dates ───────────────────────────────────────────────────────────
    date_order = fields.Date(
        string='Order Date', default=fields.Date.today,
        required=True, tracking=True)
    date_planned_checkout = fields.Date(
        string='Planned Check-Out', tracking=True)
    date_planned_checkin = fields.Date(
        string='Planned Check-In', tracking=True)
    date_checkout = fields.Date(
        string='Actual Check-Out', tracking=True, copy=False)
    date_checkin = fields.Date(
        string='Actual Check-In', tracking=True, copy=False)

    # ── Rental Period Config ────────────────────────────────────────────
    rental_period_type = fields.Selection([
        ('day', 'Daily'),
        ('week', 'Weekly'),
        ('month', 'Monthly'),
    ], string='Billing Period', default='day', required=True, tracking=True)
    rental_duration = fields.Float(
        string='Duration', default=1,
        help='Number of billing periods')
    actual_duration = fields.Float(
        string='Actual Duration', compute='_compute_actual_duration',
        store=True)
    actual_duration_display = fields.Char(
        string='Duration Display', compute='_compute_duration_display')

    # ── Lines ───────────────────────────────────────────────────────────
    line_ids = fields.One2many(
        'rental.order.line', 'order_id', string='Rental Lines')
    timesheet_ids = fields.One2many(
        'rental.timesheet', 'order_id', string='Timesheet')
    media_ids = fields.One2many(
        'rental.order.media', 'order_id', string='Photos & Signatures')
    checkout_media_ids = fields.One2many(
        'rental.order.media', 'order_id', string='Check-Out Media',
        domain=[('media_type', '=', 'checkout')])
    checkin_media_ids = fields.One2many(
        'rental.order.media', 'order_id', string='Check-In Media',
        domain=[('media_type', '=', 'checkin')])
    discount_media_ids = fields.One2many(
        'rental.order.media', 'order_id', string='Discount Media',
        domain=[('media_type', '=', 'discount')])

    # ── Financials ──────────────────────────────────────────────────────
    currency_id = fields.Many2one(
        'res.currency', string='Currency',
        default=lambda self: self.env.company.currency_id)
    subtotal = fields.Monetary(
        string='Subtotal', compute='_compute_totals', store=True)
    advance_amount = fields.Monetary(string='Advance Collected')
    advance_returned = fields.Boolean(string='Advance Returned', default=False)
    late_fee = fields.Monetary(
        string='Late Fees', compute='_compute_totals', store=True)
    damage_charges = fields.Monetary(string='Damage Charges')
    discount_amount = fields.Monetary(string='Discount')
    total_amount = fields.Monetary(
        string='Total Amount', compute='_compute_totals', store=True)
    amount_due = fields.Monetary(
        string='Amount Due', compute='_compute_amount_due', store=True)

    # ── Invoice ─────────────────────────────────────────────────────────
    invoice_id = fields.Many2one(
        'account.move', string='Invoice', copy=False)
    invoice_state = fields.Selection(
        related='invoice_id.state', string='Invoice Status')

    # ── Other ───────────────────────────────────────────────────────────
    company_id = fields.Many2one(
        'res.company', string='Company',
        default=lambda self: self.env.company)
    user_id = fields.Many2one(
        'res.users', string='Responsible',
        default=lambda self: self.env.user, tracking=True)
    notes = fields.Html(string='Internal Notes')
    terms = fields.Html(string='Terms & Conditions')
    is_late = fields.Boolean(
        string='Late Return', compute='_compute_is_late', store=True)
    # -- Check-Out Signature & Documents --
    customer_signature = fields.Binary(
        string='Check-Out Signature', copy=False,
        attachment=True)
    checkout_signature_date = fields.Datetime(
        string='Check-Out Signature Date', copy=False,
        help='Date & time the customer signed at check-out.')
    id_proof_ids = fields.Many2many(
        'ir.attachment', 'rental_order_id_proof_rel',
        'order_id', 'attachment_id',
        string='ID Proof', copy=False)
    id_proof_image = fields.Binary(
        string='ID Proof Photo', copy=False,
        attachment=True,
        help='ID proof photo captured at check-out.')

    # -- Check-In Signatures --
    checkin_customer_signature = fields.Binary(
        string='Customer Check-In Signature', copy=False,
        attachment=True)
    checkin_customer_signature_date = fields.Datetime(
        string='Customer Check-In Signature Date', copy=False,
        help='Date & time the customer signed at check-in.')
    checkin_signature = fields.Binary(
        string='Authority Check-In Signature', copy=False,
        attachment=True)
    checkin_signature_date = fields.Datetime(
        string='Authority Check-In Signature Date', copy=False,
        help='Date & time the authority signed at check-in.')
    checkin_signer_name = fields.Char(
        string='Check-In Signer', copy=False)
    customer_code = fields.Char(
        string='Customer ID', copy=False, readonly=True,
        help='Auto-generated Customer ID on confirmation.')

    # -- Discount Authorization --
    discount_authorized_by = fields.Char(
        string='Discount Authorized By', copy=False)
    discount_auth_signature = fields.Binary(
        string='Discount Authorizer Signature', copy=False,
        attachment=True)
    discount_auth_photo = fields.Binary(
        string='Discount Authorizer Photo', copy=False,
        attachment=True)
    discount_applied_date = fields.Datetime(
        string='Discount Applied On', copy=False,
        help='Date & time the discount was authorized and applied.')

    # -- Datetime Display (formatted Char for reliable readonly display) --
    checkout_signature_date_display = fields.Char(
        string='Signed On', compute='_compute_date_displays', store=False)
    checkin_customer_signature_date_display = fields.Char(
        string='Customer Signed On', compute='_compute_date_displays', store=False)
    checkin_signature_date_display = fields.Char(
        string='Authority Signed On', compute='_compute_date_displays', store=False)
    discount_applied_date_display = fields.Char(
        string='Applied On', compute='_compute_date_displays', store=False)

    # ── SQL Constraints ─────────────────────────────────────────────────
    _sql_constraints = [
        ('name_unique', 'UNIQUE(name, company_id)',
         'Rental reference must be unique per company!'),
    ]

    # ── Computed Methods ────────────────────────────────────────────────
    @api.depends('line_ids.rental_cost', 'line_ids.late_fee_amount',
                 'damage_charges', 'discount_amount')
    def _compute_totals(self):
        for order in self:
            subtotal = sum(order.line_ids.mapped('rental_cost'))
            late = sum(order.line_ids.mapped('late_fee_amount'))
            order.subtotal = subtotal
            order.late_fee = late
            order.total_amount = (
                subtotal + late
                + (order.damage_charges or 0.0)
                - (order.discount_amount or 0.0)
            )

    @api.depends('total_amount', 'advance_amount', 'advance_returned')
    def _compute_amount_due(self):
        for order in self:
            if order.advance_amount and not order.advance_returned:
                order.amount_due = max(
                    order.total_amount - order.advance_amount, 0.0)
            else:
                order.amount_due = order.total_amount

    @api.depends('date_checkout', 'date_checkin')
    def _compute_actual_duration(self):
        for order in self:
            if order.date_checkout and order.date_checkin:
                delta = (order.date_checkin - order.date_checkout).days
                order.actual_duration = max(delta, 1)
            else:
                order.actual_duration = 0

    @api.depends('checkout_signature_date', 'checkin_customer_signature_date',
                 'checkin_signature_date', 'discount_applied_date')
    def _compute_date_displays(self):
        fmt = '%d/%m/%Y %H:%M'
        for order in self:
            order.checkout_signature_date_display = (
                order.checkout_signature_date.strftime(fmt)
                if order.checkout_signature_date else '')
            order.checkin_customer_signature_date_display = (
                order.checkin_customer_signature_date.strftime(fmt)
                if order.checkin_customer_signature_date else '')
            order.checkin_signature_date_display = (
                order.checkin_signature_date.strftime(fmt)
                if order.checkin_signature_date else '')
            order.discount_applied_date_display = (
                order.discount_applied_date.strftime(fmt)
                if order.discount_applied_date else '')

    def _compute_duration_display(self):
        period_labels = {
            'day': ('Day', 'Days'),
            'week': ('Week', 'Weeks'),
            'month': ('Month', 'Months'),
        }
        for order in self:
            actual = order.actual_duration or 0  # always in days
            ptype = order.rental_period_type or 'day'
            singular, plural = period_labels.get(ptype, ('Day', 'Days'))
            # planned periods → planned days for comparison
            planned_periods = order.rental_duration or 0
            planned_days = planned_periods * DAY_MULTIPLIERS.get(ptype, 1)
            if actual and planned_days and actual > planned_days:
                extra = int(actual - planned_days)
                p_int = int(planned_periods)
                p_label = f"{p_int} {singular if p_int == 1 else plural}"
                e_label = f"{extra} {'Day' if extra == 1 else 'Days'}"
                order.actual_duration_display = f"{p_label} + {e_label} Extra"
            elif actual:
                d = int(actual)
                order.actual_duration_display = (
                    f"{d} {'Day' if d == 1 else 'Days'} (Actual)")
            elif planned_periods:
                d = int(planned_periods)
                order.actual_duration_display = (
                    f"{d} {singular if d == 1 else plural}")
            else:
                order.actual_duration_display = "0 Days"

    @api.depends('date_planned_checkin', 'date_checkin', 'state')
    def _compute_is_late(self):
        today = fields.Date.today()
        for order in self:
            if order.state == 'checked_out' and order.date_planned_checkin:
                order.is_late = today > order.date_planned_checkin
            elif order.date_planned_checkin and order.date_checkin:
                order.is_late = order.date_checkin > order.date_planned_checkin
            else:
                order.is_late = False

    @api.onchange('rental_period_type')
    def _onchange_rental_period_type(self):
        """Reset duration to 1 when period type changes.
        Duration is number of periods (not days)."""
        if self.rental_period_type:
            self.rental_duration = 1

    # ── CRUD Overrides ──────────────────────────────────────────────────
    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', 'New') == 'New':
                vals['name'] = self.env['ir.sequence'].next_by_code(
                    'rental.order') or 'New'
        return super().create(vals_list)

    def write(self, vals):
        """Auto-stamp datetime whenever a signature/photo is saved directly
        on the record (e.g. from mobile app or direct form edit)."""
        now = fields.Datetime.now()
        # Checkout signature saved directly → stamp checkout_signature_date
        if 'customer_signature' in vals and vals['customer_signature']:
            if 'checkout_signature_date' not in vals:
                vals['checkout_signature_date'] = now
        # ID proof photo saved directly → stamp checkout_signature_date
        if 'id_proof_image' in vals and vals['id_proof_image']:
            if 'checkout_signature_date' not in vals:
                vals['checkout_signature_date'] = now
        # Checkin customer signature saved directly
        if 'checkin_customer_signature' in vals and vals['checkin_customer_signature']:
            if 'checkin_customer_signature_date' not in vals:
                vals['checkin_customer_signature_date'] = now
        # Checkin authority signature saved directly
        if 'checkin_signature' in vals and vals['checkin_signature']:
            if 'checkin_signature_date' not in vals:
                vals['checkin_signature_date'] = now
        # Discount auth photo/signature saved directly
        if ('discount_auth_photo' in vals and vals['discount_auth_photo']) or            ('discount_auth_signature' in vals and vals['discount_auth_signature']):
            if 'discount_applied_date' not in vals:
                vals['discount_applied_date'] = now
        result = super().write(vals)
        # Re-sync media records whenever relevant fields change
        sig_fields = {
            'customer_signature', 'id_proof_image',
            'checkin_customer_signature', 'checkin_signature',
            'discount_auth_photo', 'discount_auth_signature',
        }
        if sig_fields & set(vals.keys()):
            for order in self:
                order._sync_media_records()
        # Auto-create timesheet entries when discount/damage written directly
        # (e.g. from mobile app bypassing wizards)
        if 'discount_amount' in vals and vals.get('discount_amount'):
            for order in self:
                # Only create if no discount timesheet entry exists yet
                existing = self.env['rental.timesheet'].search([
                    ('order_id', '=', order.id),
                    ('action', '=', 'discount'),
                ], limit=1)
                if not existing:
                    authorizer = (
                        vals.get('discount_authorized_by')
                        or order.discount_authorized_by
                        or ''
                    )
                    amount = vals['discount_amount']
                    notes = f'Discount of $ {amount:.2f} applied.'
                    if authorizer:
                        notes += f' Authorized by: {authorizer}.'
                    self.env['rental.timesheet'].create({
                        'order_id': order.id,
                        'action': 'discount',
                        'date': fields.Date.today(),
                        'user_id': self.env.user.id,
                        'notes': notes,
                        'cost_impact': -amount,
                    })
        if 'damage_charges' in vals and vals.get('damage_charges'):
            for order in self:
                existing = self.env['rental.timesheet'].search([
                    ('order_id', '=', order.id),
                    ('action', '=', 'damage'),
                ], limit=1)
                if not existing:
                    amount = vals['damage_charges']
                    self.env['rental.timesheet'].create({
                        'order_id': order.id,
                        'action': 'damage',
                        'date': fields.Date.today(),
                        'user_id': self.env.user.id,
                        'notes': f'Damage charges of $ {amount:.2f} recorded.',
                        'cost_impact': amount,
                    })
        return result

    def _sync_media_records(self):
        """Create/update rental.order.media records from the order's
        signature and photo fields so they appear in the popup list views."""
        self.ensure_one()
        fmt = '%d/%m/%Y %H:%M'

        def _upsert(media_type, media_kind, label, image_data,
                    signer_name=None, dt=None):
            if not image_data:
                return
            dt_str = dt.strftime(fmt) if dt else ''
            existing = self.env['rental.order.media'].search([
                ('order_id', '=', self.id),
                ('media_type', '=', media_type),
                ('label', '=', label),
            ], limit=1)
            vals = {
                'image_data': image_data,
                'signer_name': signer_name or '',
                'captured_on_display': dt_str,
            }
            if existing:
                existing.write(vals)
            else:
                self.env['rental.order.media'].create({
                    'order_id': self.id,
                    'media_type': media_type,
                    'media_kind': media_kind,
                    'label': label,
                    **vals,
                })

        # ── Check-Out ──
        _upsert('checkout', 'signature', 'Customer Signature',
                self.customer_signature,
                signer_name=self.partner_id.name,
                dt=self.checkout_signature_date)
        _upsert('checkout', 'photo', 'ID Proof Photo',
                self.id_proof_image,
                signer_name=self.partner_id.name,
                dt=self.checkout_signature_date)

        # ── Check-In ──
        _upsert('checkin', 'signature', 'Customer Signature',
                self.checkin_customer_signature,
                signer_name=self.partner_id.name,
                dt=self.checkin_customer_signature_date)
        _upsert('checkin', 'signature', 'Authority Signature',
                self.checkin_signature,
                signer_name=self.checkin_signer_name or self.user_id.name,
                dt=self.checkin_signature_date)

        # ── Discount ──
        _upsert('discount', 'photo', 'Authorizer Photo',
                self.discount_auth_photo,
                signer_name=self.discount_authorized_by,
                dt=self.discount_applied_date)
        _upsert('discount', 'signature', 'Authorizer Signature',
                self.discount_auth_signature,
                signer_name=self.discount_authorized_by,
                dt=self.discount_applied_date)

    # ── Workflow Actions ────────────────────────────────────────────────
    def action_confirm(self):
        for order in self:
            if not order.line_ids:
                raise UserError(_('Please add at least one rental line.'))
            # Validate tool availability BEFORE generating customer ID
            for line in order.line_ids:
                if line.tool_id and line.tool_id.available_qty <= 0:
                    tool_label = line.tool_id.name
                    if line.tool_id.serial_number:
                        tool_label = "[%s] %s" % (
                            line.tool_id.serial_number, line.tool_id.name)
                    raise UserError(
                        _('Tool "%s" is not available. Please remove it '
                          'before confirming.') % tool_label)
            if not order.customer_code:
                order.customer_code = self.env['ir.sequence'].next_by_code(
                    'rental.customer') or 'CUS/0001'
            order.state = 'confirmed'

    def action_checkout_wizard(self):
        """Open checkout wizard for ID proof and signature capture."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Check-Out Tools'),
            'res_model': 'rental.checkout.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_order_id': self.id,
                'default_partner_id': self.partner_id.id,
            },
        }

    def action_checkout(self):
        for order in self:
            if order.state != 'confirmed':
                raise UserError(_('Only confirmed orders can be checked out.'))
            # Validate tool availability (each serialized tool is either available or not)
            for line in order.line_ids:
                if line.tool_id and line.tool_id.available_qty <= 0:
                    tool_label = line.tool_id.name
                    if line.tool_id.serial_number:
                        tool_label = f"[{line.tool_id.serial_number}] {tool_label}"
                    raise UserError(
                        _('Tool "%s" is not available for checkout.') % tool_label)
            # Mark each tool as rented
            for line in order.line_ids:
                if line.tool_id:
                    line.tool_id.state = 'rented'
            order.date_checkout = fields.Date.today()
            order.state = 'checked_out'
            # Create initial timesheet entry
            self.env['rental.timesheet'].create({
                'order_id': order.id,
                'action': 'checkout',
                'date': fields.Date.today(),
                'user_id': self.env.user.id,
                'notes': 'Tools checked out to customer.',
            })

    def action_checkin_wizard(self):
        """Open check-in wizard for condition reporting."""
        self.ensure_one()
        # Pre-create wizard + lines in DB so readonly fields display correctly
        wizard = self.env['rental.checkin.wizard'].create({
            'order_id': self.id,
            'partner_id': self.partner_id.id,
        })
        line_vals = []
        for ol in self.line_ids:
            pending = 1 - (ol.returned_qty or 0)
            if pending <= 0:
                continue
            # Get late fee from best available source
            late_fee = 0
            if ol.pricing_id:
                late_fee = ol.pricing_id.late_fee_per_day or 0
            if not late_fee and ol.tool_id:
                late_fee = ol.tool_id.late_fee_per_day or 0
            if not late_fee and ol.product_id:
                late_fee = ol.product_id.rental_late_fee_per_day or 0
            # Build discount display string
            discount_display = ''
            if ol.discount_type == 'percentage' and ol.discount_value:
                discount_display = f"{ol.discount_value}%"
            elif ol.discount_type == 'fixed' and ol.discount_value:
                discount_display = f"$ {ol.discount_value}"
            line_vals.append({
                'wizard_id': wizard.id,
                'order_line_id': ol.id,
                'tool_id': ol.tool_id.id,
                'product_id': ol.product_id.id if ol.product_id else False,
                'quantity': 1,
                'returned_so_far': ol.returned_qty or 0,
                'pending_qty': pending,
                'return_qty': pending,
                'planned_days': (
                    (ol.planned_duration or self.rental_duration or 1)
                    * DAY_MULTIPLIERS.get(
                        ol.period_type or self.rental_period_type or 'day', 1)
                ),
                'late_fee_per_day': late_fee,
                'discount_display': discount_display,
                'discount_line_amount': ol.discount_line_amount or 0.0,
            })
        if line_vals:
            self.env['rental.checkin.wizard.line'].create(line_vals)
        wizard.original_line_count = len(line_vals)
        return {
            'type': 'ir.actions.act_window',
            'name': _('Check-In Tools'),
            'res_model': 'rental.checkin.wizard',
            'res_id': wizard.id,
            'view_mode': 'form',
            'target': 'new',
        }

    def action_discount_wizard(self):
        """Open discount authorization wizard."""
        self.ensure_one()
        wizard = self.env['rental.discount.wizard'].create({
            'order_id': self.id,
        })
        line_vals = []
        for ol in self.line_ids:
            line_vals.append({
                'wizard_id': wizard.id,
                'order_line_id': ol.id,
                'tool_id': ol.tool_id.id,
                'serial_number': ol.tool_id.serial_number or '',
                'rental_cost': ol.rental_cost,
                'late_fee': ol.late_fee_amount or 0.0,
                'damage_charge': ol.damage_charge or 0.0,
                'discount_type': ol.discount_type or 'percentage',
                'discount_value': ol.discount_value or 0.0,
            })
        if line_vals:
            self.env['rental.discount.wizard.line'].create(line_vals)
        return {
            'type': 'ir.actions.act_window',
            'name': _('Apply Discount'),
            'res_model': 'rental.discount.wizard',
            'res_id': wizard.id,
            'view_mode': 'form',
            'target': 'new',
        }

    def action_checkin(self, damage_notes=False, damage_charge=0.0):
        for order in self:
            if order.state != 'checked_out':
                raise UserError(_('Only checked-out orders can be checked in.'))
            order.date_checkin = fields.Date.today()
            if damage_charge:
                order.damage_charges = damage_charge
            # Release tools — mark available again
            for line in order.line_ids:
                if line.tool_id.state == 'rented':
                    line.tool_id.state = 'available'
            order.state = 'checked_in'
            # Create timesheet entry
            notes = 'Tools returned by customer.'
            if damage_notes:
                notes += f' Damage: {damage_notes}'
            self.env['rental.timesheet'].create({
                'order_id': order.id,
                'action': 'checkin',
                'date': fields.Date.today(),
                'user_id': self.env.user.id,
                'notes': notes,
            })

    def action_done(self):
        for order in self:
            if order.state != 'checked_in':
                raise UserError(
                    _('Only checked-in orders can be marked as done.'))
            order.state = 'invoiced'

    def action_create_invoice(self):
        """Create customer invoice from rental order."""
        self.ensure_one()
        if self.invoice_id:
            raise UserError(_('Invoice already exists for this order.'))
        if self.state not in ('checked_in', 'done'):
            raise UserError(
                _('Can only invoice checked-in or completed orders.'))

        invoice_lines = []
        for line in self.line_ids:
            product = line.tool_id._get_or_create_product()
            invoice_lines.append((0, 0, {
                'product_id': product.id,
                'name': f"Rental: {line.tool_id.name} "
                        f"({line.actual_duration_display})",
                'quantity': 1,
                'price_unit': line.total_cost,
            }))

        # Late fees
        if self.late_fee > 0:
            invoice_lines.append((0, 0, {
                'name': 'Late Return Fees',
                'quantity': 1,
                'price_unit': self.late_fee,
            }))

        # Damage charges
        if self.damage_charges > 0:
            invoice_lines.append((0, 0, {
                'name': 'Damage Charges',
                'quantity': 1,
                'price_unit': self.damage_charges,
            }))

        # Discount
        if self.discount_amount > 0:
            invoice_lines.append((0, 0, {
                'name': 'Discount',
                'quantity': 1,
                'price_unit': -self.discount_amount,
            }))

        # Advance deduction
        if self.advance_amount > 0 and not self.advance_returned:
            invoice_lines.append((0, 0, {
                'name': 'Advance Adjustment (collected at checkout)',
                'quantity': 1,
                'price_unit': -self.advance_amount,
            }))

        invoice = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': self.partner_id.id,
            'invoice_date': fields.Date.today(),
            'invoice_origin': self.name,
            'invoice_line_ids': invoice_lines,
            'narration': f'Rental Order: {self.name}',
        })

        self.invoice_id = invoice.id
        self.state = 'invoiced'

        # Timesheet entry
        self.env['rental.timesheet'].create({
            'order_id': self.id,
            'action': 'invoice',
            'date': fields.Date.today(),
            'user_id': self.env.user.id,
            'notes': f'Invoice {invoice.name} created.',
        })

        return {
            'type': 'ir.actions.act_window',
            'name': _('Rental Invoice'),
            'res_model': 'account.move',
            'res_id': invoice.id,
            'view_mode': 'form',
            'target': 'current',
        }

    def action_cancel(self):
        for order in self:
            if order.state in ('invoiced',):
                raise UserError(
                    _('Cannot cancel an invoiced order. '
                      'Cancel the invoice first.'))
            # Release tools if checked out
            if order.state in ('confirmed', 'checked_out'):
                for line in order.line_ids:
                    if line.tool_id.state == 'rented':
                        line.tool_id.state = 'available'
            order.state = 'cancelled'

    def action_reset_draft(self):
        for order in self:
            if order.state != 'cancelled':
                raise UserError(
                    _('Only cancelled orders can be reset to draft.'))
            order.state = 'draft'

    def action_view_invoice(self):
        self.ensure_one()
        if self.invoice_id:
            return {
                'type': 'ir.actions.act_window',
                'name': _('Invoice'),
                'res_model': 'account.move',
                'res_id': self.invoice_id.id,
                'view_mode': 'form',
                'target': 'current',
            }

    def action_return_advance(self):
        self.ensure_one()
        self.advance_returned = True
        self.env['rental.timesheet'].create({
            'order_id': self.id,
            'action': 'note',
            'date': fields.Date.today(),
            'user_id': self.env.user.id,
            'notes': f'Advance of {self.advance_amount} returned to customer.',
        })

    # ── Print Actions ────────────────────────────────────────────────
    def action_print_checkout_invoice(self):
        """Open print wizard for checkout invoice."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Print Checkout Invoice'),
            'res_model': 'rental.print.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_order_id': self.id,
                'default_report_type': 'checkout',
            },
        }

    def action_print_checkin_invoice(self):
        """Open print wizard for check-in invoice."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Print Check-In Invoice'),
            'res_model': 'rental.print.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_order_id': self.id,
                'default_report_type': 'checkin',
            },
        }
