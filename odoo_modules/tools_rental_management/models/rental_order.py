import base64
import io
import os
import subprocess
import tempfile
from datetime import datetime

from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
from odoo.tools import config

try:
    import xlsxwriter
except ImportError:
    xlsxwriter = None

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
    date_checkout = fields.Datetime(
        string='Actual Check-Out', tracking=True, copy=False)
    date_checkin = fields.Datetime(
        string='Actual Check-In', tracking=True, copy=False)
    partial_return_date = fields.Datetime(
        string='Partial Return Date', copy=False)

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
    payment_method = fields.Selection([
        ('cash', 'Cash'),
        ('card', 'Card'),
        ('bank', 'Bank'),
        ('credit', 'Credit'),
    ], string='Payment Method')
    advance_returned = fields.Boolean(string='Advance Returned', default=False)
    checkin_payment_method = fields.Selection([
        ('cash', 'Cash'),
        ('card', 'Card'),
        ('bank', 'Bank'),
        ('credit', 'Credit'),
    ], string='Check-In Payment Method')
    cash_received = fields.Monetary(string='Cash Received (Checkout)')
    checkin_cash_received = fields.Monetary(string='Cash Received (Check-In)')
    cash_balance = fields.Monetary(
        string='Balance Returned (Checkout)',
        compute='_compute_cash_balance', store=True)
    checkin_cash_balance = fields.Monetary(
        string='Balance Returned (Check-In)',
        compute='_compute_checkin_cash_balance', store=True)
    payment_status = fields.Selection([
        ('paid', 'Paid'),
        ('unpaid', 'Unpaid'),
    ], string='Payment Status', copy=False)
    payment_due_days = fields.Integer(
        string='Due Days', compute='_compute_payment_due_days')
    payment_credit_days = fields.Integer(
        string='Credit Days', copy=False,
        help='Total days the payment was on credit before being marked paid.')
    customer_rating = fields.Selection([
        ('perfect', 'Perfect'),
        ('very_good', 'Very Good'),
        ('good', 'Good'),
        ('fair', 'Fair'),
        ('poor', 'Poor'),
        ('skipped', 'Skipped'),
    ], string='Customer Rating', copy=False,
       help='Rating of customer behavior at this check-in.')
    customer_rating_notes = fields.Text(string='Rating Notes', copy=False)
    customer_rating_date = fields.Datetime(string='Rating Date', copy=False)
    late_fee = fields.Monetary(
        string='Late Fees', compute='_compute_totals', store=True)
    tax_total = fields.Monetary(
        string='Tax', compute='_compute_totals', store=True)
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
    id_proof_front = fields.Binary(
        string='ID Proof - Front', copy=False,
        attachment=True,
        help='ID proof front side photo captured at check-out.')
    id_proof_back = fields.Binary(
        string='ID Proof - Back', copy=False,
        attachment=True,
        help='ID proof back side photo captured at check-out.')

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
    checkout_time_display = fields.Char(
        string='Check-Out Time', compute='_compute_date_displays', store=False)
    checkin_time_display = fields.Char(
        string='Check-In Time', compute='_compute_date_displays', store=False)
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
                 'line_ids.tax_amount', 'line_ids.price_before_tax',
                 'damage_charges', 'discount_amount')
    def _compute_totals(self):
        for order in self:
            rental_total = sum(order.line_ids.mapped('rental_cost'))
            late = sum(order.line_ids.mapped('late_fee_amount'))
            tax = sum(order.line_ids.mapped('tax_amount'))
            # Subtotal = rental_cost (price_before_tax is same as rental_cost when tax is applied via wizard)
            order.subtotal = rental_total
            order.late_fee = late
            order.tax_total = tax
            # Total = rental cost + tax + late fees + damage - discount
            order.total_amount = (
                rental_total + tax + late
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

    @api.depends('cash_received', 'advance_amount')
    def _compute_cash_balance(self):
        for order in self:
            if order.cash_received:
                order.cash_balance = (order.cash_received or 0.0) - (order.advance_amount or 0.0)
            else:
                order.cash_balance = 0.0

    @api.depends('checkin_cash_received', 'amount_due')
    def _compute_checkin_cash_balance(self):
        for order in self:
            if order.checkin_cash_received:
                order.checkin_cash_balance = (order.checkin_cash_received or 0.0) - (order.amount_due or 0.0)
            else:
                order.checkin_cash_balance = 0.0

    def _compute_payment_due_days(self):
        for order in self:
            if order.payment_status == 'unpaid' and order.date_checkin:
                delta = fields.Datetime.now() - order.date_checkin
                order.payment_due_days = delta.days
            else:
                order.payment_due_days = 0

    @api.depends('date_checkout', 'date_checkin')
    def _compute_actual_duration(self):
        for order in self:
            if order.date_checkout and order.date_checkin:
                delta = (order.date_checkin - order.date_checkout).days
                order.actual_duration = max(delta, 1)
            else:
                order.actual_duration = 0

    @api.depends('date_checkout', 'date_checkin',
                 'checkout_signature_date', 'checkin_customer_signature_date',
                 'checkin_signature_date', 'discount_applied_date')
    def _compute_date_displays(self):
        import pytz
        fmt = '%d/%m/%Y %I:%M %p'
        time_fmt = '%I:%M %p'
        user_tz = pytz.timezone(self.env.user.tz or 'UTC')
        def _fmt(dt, use_fmt=None):
            if not dt:
                return ''
            utc_dt = pytz.utc.localize(dt.replace(tzinfo=None))
            local_dt = utc_dt.astimezone(user_tz)
            return local_dt.strftime(use_fmt or fmt)
        for order in self:
            order.checkout_time_display = _fmt(
                order.date_checkout, time_fmt)
            order.checkin_time_display = _fmt(
                order.date_checkin, time_fmt)
            order.checkout_signature_date_display = _fmt(
                order.checkout_signature_date)
            order.checkin_customer_signature_date_display = _fmt(
                order.checkin_customer_signature_date)
            order.checkin_signature_date_display = _fmt(
                order.checkin_signature_date)
            order.discount_applied_date_display = _fmt(
                order.discount_applied_date)

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
                order.is_late = order.date_checkin.date() > order.date_planned_checkin
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
        if 'id_proof_front' in vals and vals['id_proof_front']:
            if 'checkout_signature_date' not in vals:
                vals['checkout_signature_date'] = now
        if 'id_proof_back' in vals and vals['id_proof_back']:
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
            'customer_signature', 'id_proof_front', 'id_proof_back',
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
                    symbol = order.currency_id.symbol or '$'
                    notes = f'Discount of {symbol} {amount:.2f} applied.'
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
                        'notes': f'Damage charges of {order.currency_id.symbol or "$"} {amount:.2f} recorded.',
                        'cost_impact': amount,
                    })
        return result

    def _sync_media_records(self):
        """Create/update rental.order.media records from the order's
        signature and photo fields so they appear in the popup list views."""
        import pytz
        self.ensure_one()
        fmt = '%d/%m/%Y %I:%M %p'
        user_tz = pytz.timezone(self.env.user.tz or 'UTC')

        def _upsert(media_type, media_kind, label, image_data,
                    signer_name=None, dt=None):
            if not image_data:
                return
            if dt:
                utc_dt = pytz.utc.localize(dt.replace(tzinfo=None))
                local_dt = utc_dt.astimezone(user_tz)
                dt_str = local_dt.strftime(fmt)
            else:
                dt_str = ''
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
        _upsert('checkout', 'photo', 'ID Proof - Front',
                self.id_proof_front,
                signer_name=self.partner_id.name,
                dt=self.checkout_signature_date)
        _upsert('checkout', 'photo', 'ID Proof - Back',
                self.id_proof_back,
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
            # Force compute tax on lines


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
            order.date_checkout = fields.Datetime.now()
            order.state = 'checked_out'
            # Force recompute tax amounts on lines

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
                discount_display = f"{self.currency_id.symbol or '$'} {ol.discount_value}"
            line_vals.append({
                'wizard_id': wizard.id,
                'order_line_id': ol.id,
                'tool_id': ol.tool_id.id,
                'product_id': ol.product_id.id if ol.product_id else False,
                'quantity': 1,
                'returned_so_far': ol.returned_qty or 0,
                'pending_qty': pending,
                'return_qty': pending,
                'period_type': ol.period_type or self.rental_period_type or 'day',
                'planned_duration': ol.planned_duration or self.rental_duration or 1,
                'planned_days': (
                    (ol.planned_duration or self.rental_duration or 1)
                    * DAY_MULTIPLIERS.get(
                        ol.period_type or self.rental_period_type or 'day', 1)
                ),
                'late_fee_per_day': late_fee,
                'discount_display': discount_display,
                'discount_line_amount': ol.discount_line_amount or 0.0,
                'tax_percentage': ol.tax_percentage or 0.0,
                'tax_amount': ol.tax_amount or 0.0,
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

    def action_tax_wizard(self):
        """Open tax wizard to apply tax per product line."""
        self.ensure_one()
        wizard = self.env['rental.tax.wizard'].create({
            'order_id': self.id,
        })
        line_vals = []
        for ol in self.line_ids:
            line_vals.append({
                'wizard_id': wizard.id,
                'order_line_id': ol.id,
                'tool_id': ol.tool_id.id,
                'rental_cost': ol.rental_cost,
                'tax_percentage': ol.tax_percentage or 0.0,
            })
        if line_vals:
            self.env['rental.tax.wizard.line'].create(line_vals)
        return {
            'type': 'ir.actions.act_window',
            'name': _('Apply Tax'),
            'res_model': 'rental.tax.wizard',
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
            order.date_checkin = fields.Datetime.now()
            if damage_charge:
                order.damage_charges = damage_charge
            # Release tools — mark available again
            for line in order.line_ids:
                if line.tool_id.state == 'rented':
                    line.tool_id.state = 'available'
            order.state = 'checked_in'
            # Force recompute tax amounts on lines

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
            if not order.customer_rating:
                raise UserError(_(
                    'Please give the customer rating first before marking '
                    'the order as done. Click the "Customer Rating" button.'
                ))
            order.state = 'invoiced'

    @api.model
    def render_sales_report_xlsx(self, title, sections):
        """Build a real .xlsx file from a list of sections, return base64.

        sections: list of dicts, each shaped:
            { "name": str, "headers": [str, ...], "rows": [[cell, ...], ...] }

        Used by the Sales Report OWL dashboard for client-side Excel
        downloads. Produces a genuine .xlsx (no HTML hack) so Excel opens it
        with zero file-format warnings.
        """
        if xlsxwriter is None:
            raise UserError(_(
                'The "xlsxwriter" Python library is required for Excel export. '
                'Please install it (it ships with Odoo by default).'))

        period_label = self.env.context.get('period_label', '')
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        sheet = workbook.add_worksheet('Sales Report')

        # ── Formats ──
        title_fmt = workbook.add_format({
            'bold': True, 'font_size': 16,
            'font_color': '#714B67', 'font_name': 'Arial',
        })
        info_fmt = workbook.add_format({
            'italic': True, 'font_size': 10,
            'font_color': '#666666', 'font_name': 'Arial',
        })
        section_fmt = workbook.add_format({
            'bold': True, 'font_size': 13,
            'font_color': '#333333', 'font_name': 'Arial',
            'bottom': 2, 'bottom_color': '#714B67',
        })
        header_fmt = workbook.add_format({
            'bold': True, 'font_color': '#FFFFFF',
            'bg_color': '#714B67', 'border': 1,
            'align': 'left', 'valign': 'vcenter',
            'font_name': 'Arial', 'font_size': 11,
        })
        cell_fmt = workbook.add_format({
            'border': 1, 'align': 'left', 'valign': 'vcenter',
            'font_name': 'Arial', 'font_size': 11,
        })
        cell_right_fmt = workbook.add_format({
            'border': 1, 'align': 'right', 'valign': 'vcenter',
            'font_name': 'Arial', 'font_size': 11,
        })

        # ── Title block ──
        sheet.merge_range(0, 0, 0, 4, title or 'Sales Report', title_fmt)
        sheet.set_row(0, 24)
        sheet.write(
            1, 0,
            'Period: ' + (period_label or 'All Time')
            + '   ·   Generated: ' + datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            info_fmt,
        )

        row = 3
        max_cols = 0
        for sec in sections:
            name = sec.get('name', '') if isinstance(sec, dict) else ''
            headers = sec.get('headers', []) if isinstance(sec, dict) else []
            rows = sec.get('rows', []) if isinstance(sec, dict) else []
            if headers:
                max_cols = max(max_cols, len(headers))

            sheet.merge_range(row, 0, row, max(0, len(headers) - 1) or 0,
                              name, section_fmt)
            row += 1
            for c, h in enumerate(headers):
                sheet.write(row, c, h, header_fmt)
            sheet.set_row(row, 22)
            row += 1
            for data_row in rows:
                for c, val in enumerate(data_row):
                    fmt = cell_right_fmt if c >= 2 else cell_fmt
                    sheet.write(row, c, val, fmt)
                row += 1
            row += 2  # blank gap between sections

        # ── Column widths ──
        # 4-col layout: Rank · Customer/Tool · Orders/Times · Revenue
        # 2-col layout: Metric · Value (handled by widths below)
        widths = [12, 36, 18, 22, 16]
        for i, w in enumerate(widths[:max(max_cols, 2)]):
            sheet.set_column(i, i, w)

        workbook.close()
        output.seek(0)
        return base64.b64encode(output.read()).decode('ascii')

    @api.model
    def render_html_to_pdf(self, html_body):
        """Convert an HTML string to a PDF and return base64-encoded bytes.

        Used by the Sales Report OWL dashboard for client-side PDF downloads.
        Bypasses Odoo's `_run_wkhtmltopdf` (which ignores `wkhtmltopdf_path`
        on Windows and looks for the binary on PATH only). We explicitly
        resolve the binary from `odoo.conf` first, then fall back to the
        known install path next to Odoo.
        """
        # Resolve the wkhtmltopdf binary
        candidates = []
        cfg_path = config.get('wkhtmltopdf_path')
        if cfg_path:
            candidates.append(cfg_path)
        candidates.extend([
            r'C:\Program Files\Odoo 19.0.20260119\thirdparty\wkhtmltopdf.exe',
            r'C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe',
            'wkhtmltopdf',
        ])
        wk_bin = None
        for c in candidates:
            if c and (os.path.isfile(c) or c == 'wkhtmltopdf'):
                wk_bin = c
                break
        if not wk_bin:
            raise UserError(_(
                'wkhtmltopdf binary not found. Set `wkhtmltopdf_path` in '
                'odoo.conf or install wkhtmltopdf.'))

        # Write HTML to a temp file, run wkhtmltopdf, read the PDF, clean up
        html_fd, html_path = tempfile.mkstemp(suffix='.html')
        os.close(html_fd)
        pdf_path = html_path[:-5] + '.pdf'
        try:
            with open(html_path, 'wb') as f:
                f.write(html_body.encode('utf-8'))
            try:
                subprocess.run(
                    [wk_bin, '--encoding', 'utf-8', '--quiet',
                     '--enable-local-file-access',
                     html_path, pdf_path],
                    check=True, capture_output=True,
                )
            except subprocess.CalledProcessError as e:
                stderr = (e.stderr or b'').decode('utf-8', errors='replace')
                raise UserError(_('wkhtmltopdf failed: %s') % stderr)
            with open(pdf_path, 'rb') as f:
                pdf_bytes = f.read()
        finally:
            for p in (html_path, pdf_path):
                try:
                    os.unlink(p)
                except OSError:
                    pass
        return base64.b64encode(pdf_bytes).decode('ascii')

    def action_open_rating_popup(self):
        """Manually re-open the customer rating popup for this order."""
        self.ensure_one()
        if self.state not in ('checked_in', 'invoiced'):
            raise UserError(
                _('Customer rating is only available after check-in.'))
        wizard = self.env['rental.checkin.wizard'].create({
            'order_id': self.id,
            'partner_id': self.partner_id.id,
        })
        partner = self.partner_id
        existing = getattr(partner, 'customer_rating', False) or False
        existing_notes = getattr(partner, 'customer_rating_notes', False) or False
        wizard.previous_rating_value = existing if existing else False
        wizard.previous_rating_notes = existing_notes if existing_notes else False
        wizard.is_new_customer = not existing
        if existing and existing != 'skipped':
            wizard.rating_value = existing
        view = self.env.ref(
            'tools_rental_management.view_rental_checkin_wizard_rating_form',
            raise_if_not_found=False,
        )
        action = {
            'type': 'ir.actions.act_window',
            'name': _('Customer Rating'),
            'res_model': 'rental.checkin.wizard',
            'res_id': wizard.id,
            'view_mode': 'form',
            'target': 'new',
        }
        if view:
            action['views'] = [(view.id, 'form')]
            action['view_id'] = view.id
        return action

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

    def action_mark_paid(self):
        self.ensure_one()
        if self.date_checkin:
            delta = fields.Datetime.now() - self.date_checkin
            self.payment_credit_days = delta.days
        self.payment_status = 'paid'

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

    def action_print_partial_return_invoice(self):
        """Open print wizard for partial return invoice."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Print Partial Return Invoice'),
            'res_model': 'rental.print.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_order_id': self.id,
                'default_report_type': 'partial_return',
            },
        }
