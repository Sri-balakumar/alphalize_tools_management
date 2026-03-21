from odoo import models, fields, api, _
from odoo.exceptions import UserError

DAY_MULTIPLIERS = {
    'day': 1,
    'week': 7,
    'month': 30,
}


class RentalOrderLine(models.Model):
    _name = 'rental.order.line'
    _description = 'Rental Order Line'
    _order = 'sequence, id'

    order_id = fields.Many2one(
        'rental.order', string='Rental Order',
        ondelete='cascade', required=True)
    sequence = fields.Integer(default=10)

    # ── Product (main user-facing field) ────────────────────────────────
    product_id = fields.Many2one(
        'product.product', string='Product',
        domain=[('is_rental_tool', '=', True)],
        help='Select a serialized rental product.')

    # Tool (auto-linked behind the scenes)
    tool_id = fields.Many2one(
        'rental.tool', string='Tool',
        domain=[('state', 'not in', ['retired', 'maintenance'])])
    tool_category_id = fields.Many2one(
        related='tool_id.category_id', string='Category', store=True)
    tool_available_qty = fields.Float(
        string='Available', compute='_compute_tool_available_qty')
    qty_warning = fields.Char(
        string='Warning', compute='_compute_tool_available_qty')

    # Pricing
    pricing_id = fields.Many2one(
        'rental.pricing', string='Pricing Rule')
    currency_id = fields.Many2one(
        related='order_id.currency_id')
    unit_price = fields.Monetary(string='Price')
    quantity = fields.Float(string='Qty', default=1, readonly=True)
    returned_qty = fields.Float(string='Returned', default=0)
    pending_qty = fields.Float(
        string='Pending', compute='_compute_pending_qty', store=True)

    # Per-line period and duration (number of periods)
    period_type = fields.Selection([
        ('day', 'Day'),
        ('week', 'Week'),
        ('month', 'Month'),
    ], string='Per', default='day')
    planned_duration = fields.Float(
        string='Duration', default=1,
        help='Number of billing periods')
    actual_duration = fields.Float(
        string='Actual Duration', compute='_compute_line_duration',
        store=True)
    actual_duration_display = fields.Char(
        string='Duration', compute='_compute_duration_display')

    # Costs
    rental_cost = fields.Monetary(
        string='Rental Cost', compute='_compute_costs', store=True)
    late_fee_amount = fields.Monetary(
        string='Late Fee', default=0, currency_field='currency_id')
    total_cost = fields.Monetary(
        string='Total', compute='_compute_costs', store=True)

    # Condition tracking
    CONDITION_SELECTION = [
        ('excellent', 'Excellent'),
        ('good', 'Good'),
        ('fair', 'Fair'),
        ('poor', 'Poor'),
        ('damaged', 'Damaged'),
    ]
    # Tool display name — always resolves: product_id.name → tool_id.name
    tool_display_name = fields.Char(
        string='Tool', compute='_compute_tool_display_name',
        store=True)

    serial_number = fields.Char(
        related='tool_id.serial_number', string='Serial No.', readonly=True)
    checkout_tool_image = fields.Binary(
        string='Tool Photo (Check-Out)', copy=False,
        attachment=True,
        help='Photo of the tool taken at check-out.')
    checkin_tool_image = fields.Binary(
        string='Tool Photo (Check-In)', copy=False,
        attachment=True,
        help='Photo of the tool taken at check-in.')
    checkout_condition = fields.Selection(
        CONDITION_SELECTION, string='Check-Out Condition',
        help='Condition of the tool at check-out.')
    checkin_condition = fields.Selection(
        CONDITION_SELECTION, string='Check-In Condition',
        help='Condition of the tool at check-in.')
    extra_days = fields.Integer(
        string='Extra Days', default=0,
        help='Number of days beyond the planned duration. Set during check-in.')
    damage_note = fields.Char(
        string='Damage Note',
        help='Damage notes recorded during check-in.')
    damage_charge = fields.Monetary(
        string='Damage Charge', default=0,
        currency_field='currency_id',
        help='Damage charge recorded during check-in.')

    # Discount fields
    discount_type = fields.Selection([
        ('percentage', 'Percentage'),
        ('fixed', 'Fixed Amount'),
    ], string='Discount Type')
    discount_value = fields.Float(
        string='Discount Value',
        help='Percentage (0-100) or fixed monetary amount.')
    discount_line_amount = fields.Monetary(
        string='Line Discount',
        compute='_compute_discount_line_amount', store=True,
        currency_field='currency_id',
        help='Computed discount amount for this line.')

    # Notes
    notes = fields.Text(string='Notes')

    @api.depends('product_id', 'tool_id')
    def _compute_tool_display_name(self):
        for line in self:
            if line.product_id:
                line.tool_display_name = line.product_id.name
            elif line.tool_id:
                line.tool_display_name = line.tool_id.name
            else:
                line.tool_display_name = ''

    @api.depends('quantity', 'returned_qty')
    def _compute_pending_qty(self):
        for line in self:
            line.pending_qty = line.quantity - (line.returned_qty or 0)

    # ── Auto-set price and inherit order period on create ──
    @api.model_create_multi
    def create(self, vals_list):
        # Inherit period_type from order if not explicitly set
        for vals in vals_list:
            if 'period_type' not in vals or not vals.get('period_type'):
                order_id = vals.get('order_id')
                if order_id:
                    order = self.env['rental.order'].browse(order_id)
                    if order.rental_period_type:
                        vals['period_type'] = order.rental_period_type
        lines = super().create(vals_list)
        for line in lines:
            if not line.unit_price:
                if line.pricing_id:
                    line.unit_price = line.pricing_id.price
                elif line.tool_id and line.tool_id.product_id:
                    line.unit_price = line.tool_id.product_id.list_price
                elif line.product_id:
                    line.unit_price = line.product_id.list_price
        return lines

    # ── Computed: available qty and warning ──
    @api.depends('tool_id')
    def _compute_tool_available_qty(self):
        for line in self:
            if line.tool_id:
                line.tool_available_qty = line.tool_id.available_qty
                if line.tool_id.available_qty <= 0:
                    line.qty_warning = _('Not available!')
                else:
                    line.qty_warning = False
            else:
                line.tool_available_qty = 0
                line.qty_warning = False

    # ── Onchange: Product selected → find/create rental tool → fill line ──
    @api.onchange('product_id')
    def _onchange_product_id(self):
        """When a product is selected, auto-find or create a rental.tool
        and populate all line fields from it."""
        if not self.product_id:
            self.tool_id = False
            return

        # Block duplicate product selection in the same order
        if self.order_id:
            same_product = self.order_id.line_ids.filtered(
                lambda l: l.product_id.id == self.product_id.id
            )
            if len(same_product) > 1:
                product_name = self.product_id.display_name
                self.product_id = False
                self.tool_id = False
                return {'warning': {
                    'title': _('Already Selected'),
                    'message': _('"%s" is already added in this order. '
                                 'Please choose a different tool.') % product_name,
                }}

        product = self.product_id
        RentalTool = self.env['rental.tool']

        # 1. Search for existing rental tool linked to this exact product (1:1)
        tool = RentalTool.search([
            ('product_id', '=', product.id),
            ('state', 'not in', ['retired', 'maintenance']),
        ], limit=1)

        # 2. If not found, auto-create rental tool from product
        if not tool:
            RentalCategory = self.env['rental.tool.category']
            categ_name = product.categ_id.name if product.categ_id else 'General'
            category = RentalCategory.search(
                [('name', '=', categ_name)], limit=1)
            if not category:
                category = RentalCategory.create({
                    'name': categ_name,
                    'code': categ_name[:4].upper(),
                })
            tool = RentalTool.create({
                'name': product.name,
                'product_id': product.id,
                'category_id': category.id,
                'image': product.image_1920 or False,
                'code': product.default_code or False,
                'serial_number': product.default_code or False,
                'barcode': product.barcode or False,
                'total_qty': 1,
                'state': 'available',
            })
            # Create pricing rule from product's list_price
            if product.list_price:
                self.env['rental.pricing'].create({
                    'tool_id': tool.id,
                    'period_type': 'day',
                    'price': product.list_price,
                    'late_fee_per_day': product.rental_late_fee_per_day or 0,
                })

        # 3. Link product to tool if not linked
        if tool and not tool.product_id:
            tool.product_id = product.id

        # 4. Check tool availability before assigning
        if tool and tool.available_qty <= 0:
            tool_label = tool.name
            if tool.serial_number:
                tool_label = "[%s] %s" % (tool.serial_number, tool.name)
            self.product_id = False
            self.tool_id = False
            return {'warning': {
                'title': _('Tool Not Available'),
                'message': _('Tool "%s" is not available for rental. '
                             'Please select a different tool.') % tool_label,
            }}

        # 5. Set tool and trigger pricing
        self.tool_id = tool.id
        self._onchange_tool_id()

    # ── Onchange: Tool selected → auto-assign pricing + price ──
    @api.onchange('tool_id')
    def _onchange_tool_id(self):
        if self.tool_id:
            # Sync product_id from tool
            if self.tool_id.product_id and not self.product_id:
                self.product_id = self.tool_id.product_id.id

            # 1. Direct tool pricing (linked to this tool)
            pricing = self.tool_id.pricing_ids[:1]
            if not pricing:
                # 2. Any pricing rule matching this tool or its category
                pricing = self.env['rental.pricing'].search([
                    '|',
                    ('tool_id', '=', self.tool_id.id),
                    '&',
                    ('tool_id', '=', False),
                    ('category_id', '=', self.tool_id.category_id.id),
                ], limit=1)
            if pricing:
                self.pricing_id = pricing.id
                self.unit_price = pricing.price
            else:
                self.pricing_id = False
                # Fallback: product sale price as daily rate
                if self.tool_id.product_id and self.tool_id.product_id.list_price > 0:
                    self.unit_price = self.tool_id.product_id.list_price
                else:
                    self.unit_price = 0

    # ── Onchange: Pricing rule changed → update price ──
    @api.onchange('pricing_id')
    def _onchange_pricing_id(self):
        if self.pricing_id:
            self.unit_price = self.pricing_id.price

    # ── Onchange: Per changed → reset duration to 1 period ──
    @api.onchange('period_type')
    def _onchange_period_type(self):
        """Reset duration to 1 when period type changes.
        Duration is number of periods (not days)."""
        if self.period_type:
            self.planned_duration = 1

    # ── Computed: actual duration from order dates ──
    @api.depends('order_id.actual_duration', 'order_id.rental_duration')
    def _compute_line_duration(self):
        for line in self:
            if line.order_id.actual_duration:
                line.actual_duration = line.order_id.actual_duration
            else:
                line.actual_duration = (
                    line.planned_duration
                    or line.order_id.rental_duration
                    or 0
                )

    def _compute_duration_display(self):
        for line in self:
            dur = line.actual_duration or line.planned_duration or 0
            line.actual_duration_display = f"{dur} Days"

    # ── Computed: Discount per line ──
    @api.depends('discount_type', 'discount_value', 'rental_cost',
                 'late_fee_amount', 'damage_charge')
    def _compute_discount_line_amount(self):
        for line in self:
            if not line.discount_type or not line.discount_value:
                line.discount_line_amount = 0.0
                continue
            base = ((line.rental_cost or 0.0)
                    + (line.late_fee_amount or 0.0)
                    + (line.damage_charge or 0.0))
            if line.discount_type == 'percentage':
                line.discount_line_amount = base * (line.discount_value / 100.0)
            else:
                line.discount_line_amount = min(line.discount_value, base)

    # ── Computed: Total = price/day × planned_duration × qty ──
    @api.depends(
        'unit_price', 'late_fee_amount', 'discount_line_amount',
        'planned_duration', 'pricing_id', 'period_type',
        'order_id.rental_duration')
    def _compute_costs(self):
        for line in self:
            # Use PLANNED duration for base rental cost (not actual)
            planned = (
                line.planned_duration
                or line.order_id.rental_duration
                or 1
            )
            price = line.unit_price or (line.pricing_id.price if line.pricing_id else 0)

            # Base rental cost = price × planned periods × day multiplier
            multiplier = DAY_MULTIPLIERS.get(
                line.period_type or line.order_id.rental_period_type or 'day', 1)
            line.rental_cost = price * planned * multiplier
            line.total_cost = (line.rental_cost
                               + (line.late_fee_amount or 0)
                               - (line.discount_line_amount or 0))

    def write(self, vals):
        """Handle direct writes from mobile app for condition and photo fields."""
        # Normalize checkout_condition value if app sends different casing
        if 'checkout_condition' in vals and vals['checkout_condition']:
            raw = str(vals['checkout_condition']).lower().strip()
            valid = [c[0] for c in self.CONDITION_SELECTION]
            if raw in valid:
                vals['checkout_condition'] = raw
            else:
                # Try partial match e.g. "Good" → "good"
                match = next((c[0] for c in self.CONDITION_SELECTION
                              if c[1].lower() == raw), None)
                if match:
                    vals['checkout_condition'] = match
                else:
                    vals.pop('checkout_condition')

        # Normalize checkin_condition the same way
        if 'checkin_condition' in vals and vals['checkin_condition']:
            raw = str(vals['checkin_condition']).lower().strip()
            valid = [c[0] for c in self.CONDITION_SELECTION]
            if raw in valid:
                vals['checkin_condition'] = raw
            else:
                match = next((c[0] for c in self.CONDITION_SELECTION
                              if c[1].lower() == raw), None)
                if match:
                    vals['checkin_condition'] = match
                else:
                    vals.pop('checkin_condition')

        # Sanitize image: if value is clearly a URL/path (not base64), discard
        for img_field in ('checkout_tool_image', 'checkin_tool_image'):
            if img_field in vals and vals[img_field]:
                val = vals[img_field]
                # Only discard if it's a short string that is clearly a URL or file path
                # Valid base64 images are long (thousands of chars) and won't match these
                if isinstance(val, str) and len(val) < 200 and (
                    val.startswith('http://') or
                    val.startswith('https://') or
                    val.startswith('file://')
                ):
                    vals.pop(img_field)

        result = super().write(vals)
        # Auto-aggregate line damage_charge to order damage_charges
        if 'damage_charge' in vals:
            for order in self.mapped('order_id'):
                total_damage = sum(
                    order.line_ids.mapped('damage_charge'))
                if total_damage != (order.damage_charges or 0):
                    order.damage_charges = total_damage
        return result
