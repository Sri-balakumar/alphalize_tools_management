from odoo import models, fields, api, _
from odoo.exceptions import ValidationError


class RentalTool(models.Model):
    _name = 'rental.tool'
    _description = 'Rental Tool / Equipment'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'name'

    name = fields.Char(string='Tool Name', required=True, tracking=True)
    code = fields.Char(string='Internal Reference', copy=False)
    image = fields.Binary(string='Image', attachment=True)
    category_id = fields.Many2one(
        'rental.tool.category', string='Category',
        required=True, tracking=True)
    description = fields.Html(string='Description')
    serial_number = fields.Char(string='Serial Number')
    barcode = fields.Char(string='Barcode', copy=False)

    # Ownership & Location
    company_id = fields.Many2one(
        'res.company', string='Company',
        default=lambda self: self.env.company)
    location = fields.Char(string='Storage Location')

    # Status
    state = fields.Selection([
        ('available', 'Available'),
        ('rented', 'Rented'),
        ('maintenance', 'Under Maintenance'),
        ('retired', 'Retired'),
    ], string='Status', default='available', tracking=True)

    # Pricing
    pricing_ids = fields.One2many(
        'rental.pricing', 'tool_id', string='Pricing Rules')
    currency_id = fields.Many2one(
        'res.currency', string='Currency',
        default=lambda self: self.env.company.currency_id)

    # Quantity
    total_qty = fields.Float(string='Total Qty', default=1, tracking=True)
    available_qty = fields.Float(
        string='Available Qty', compute='_compute_available_qty')

    # Specifications
    brand = fields.Char(string='Brand')
    model_name = fields.Char(string='Model')
    purchase_date = fields.Date(string='Purchase Date')
    purchase_price = fields.Monetary(string='Purchase Price')

    # Computed
    total_rental_count = fields.Integer(
        string='Total Rentals', compute='_compute_rental_stats')
    total_revenue = fields.Monetary(
        string='Total Revenue', compute='_compute_rental_stats')
    current_rental_id = fields.Many2one(
        'rental.order', string='Current Rental',
        compute='_compute_current_rental')
    active = fields.Boolean(default=True)

    # Product link for inventory/reference
    product_id = fields.Many2one(
        'product.product', string='Linked Product',
        help='Product from inventory linked to this tool.')

    # Pricing shortcut fields (from first pricing rule)
    rental_price_per_day = fields.Monetary(
        string='Price / Day', compute='_compute_pricing_fields',
        inverse='_set_rental_price', currency_field='currency_id')
    late_fee_per_day = fields.Monetary(
        string='Late Fee / Day', compute='_compute_pricing_fields',
        inverse='_set_late_fee', currency_field='currency_id')

    # Product-related display fields
    product_list_price = fields.Float(
        string='Product Sale Price',
        related='product_id.list_price', readonly=True)
    product_qty_available = fields.Float(
        string='Product On Hand',
        related='product_id.qty_available', readonly=True)

    _sql_constraints = [
        ('barcode_unique', 'UNIQUE(barcode)',
         'Barcode must be unique per tool!'),
    ]

    @api.onchange('product_id')
    def _onchange_product_id(self):
        """When a product is linked, auto-populate tool fields from product."""
        if self.product_id:
            product = self.product_id
            if not self.name:
                self.name = product.name
            if not self.code:
                self.code = product.default_code or ''
            if not self.serial_number:
                self.serial_number = product.default_code or ''
            if not self.barcode:
                self.barcode = product.barcode or ''
            if not self.image:
                self.image = product.image_1920 or False
            self.total_qty = 1

    def name_get(self):
        result = []
        for tool in self:
            name = tool.name
            if tool.code:
                name = f'[{tool.code}] {name}'
            result.append((tool.id, name))
        return result

    def _compute_rental_stats(self):
        for tool in self:
            orders = self.env['rental.order.line'].search([
                ('tool_id', '=', tool.id),
                ('order_id.state', 'in', ['checked_in', 'done', 'invoiced']),
            ])
            tool.total_rental_count = len(orders)
            tool.total_revenue = sum(orders.mapped('total_cost'))

    def _compute_available_qty(self):
        for tool in self:
            lines = self.env['rental.order.line'].search([
                ('tool_id', '=', tool.id),
                ('order_id.state', '=', 'checked_out'),
            ])
            # Rented = checked out qty minus already returned qty
            rented_qty = sum(
                (l.quantity - (l.returned_qty or 0)) for l in lines
            )
            tool.available_qty = tool.total_qty - rented_qty

    def _compute_current_rental(self):
        for tool in self:
            line = self.env['rental.order.line'].search([
                ('tool_id', '=', tool.id),
                ('order_id.state', '=', 'checked_out'),
            ], limit=1)
            tool.current_rental_id = line.order_id.id if line else False

    # ── Pricing shortcut compute / inverse ───────────────────────────────
    @api.depends('pricing_ids.price', 'pricing_ids.late_fee_per_day')
    def _compute_pricing_fields(self):
        for tool in self:
            pricing = tool.pricing_ids[:1]
            tool.rental_price_per_day = pricing.price if pricing else 0
            tool.late_fee_per_day = pricing.late_fee_per_day if pricing else 0

    def _set_rental_price(self):
        for tool in self:
            pricing = tool.pricing_ids[:1]
            if pricing:
                # Let pricing.write sync to product naturally
                # (pricing.write → product.write with flag → no loop)
                pricing.write({'price': tool.rental_price_per_day})

    def _set_late_fee(self):
        for tool in self:
            pricing = tool.pricing_ids[:1]
            if pricing:
                pricing.write({'late_fee_per_day': tool.late_fee_per_day})

    # ── Sync rental.tool → product on save ────────────────────────────────
    _product_sync_fields = {'name', 'code', 'barcode', 'image', 'category_id'}

    def write(self, vals):
        res = super().write(vals)
        if (self._product_sync_fields & set(vals)
                and not self.env.context.get('_syncing_rental_pricing')):
            for tool in self:
                if not tool.product_id:
                    continue
                product_vals = {}
                if 'name' in vals:
                    product_vals['name'] = tool.name
                if 'code' in vals:
                    product_vals['default_code'] = tool.code
                if 'barcode' in vals:
                    product_vals['barcode'] = tool.barcode
                if 'image' in vals:
                    product_vals['image_1920'] = tool.image
                if 'category_id' in vals:
                    product_vals['rental_category_id'] = tool.category_id.id
                if product_vals:
                    tool.product_id.with_context(
                        _syncing_rental_pricing=True).write(product_vals)
        return res

    def action_set_available(self):
        self.write({'state': 'available'})

    def action_set_maintenance(self):
        self.write({'state': 'maintenance'})

    def action_set_retired(self):
        self.write({'state': 'retired'})

