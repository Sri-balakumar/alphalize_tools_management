from odoo import models, fields, api, _
from odoo.exceptions import ValidationError


class RentalPricing(models.Model):
    _name = 'rental.pricing'
    _description = 'Rental Pricing Rule'
    _order = 'sequence, id'

    name = fields.Char(string='Name', compute='_compute_name', store=True)
    sequence = fields.Integer(string='Sequence', default=10)
    tool_id = fields.Many2one('rental.tool', string='Tool', ondelete='cascade')
    category_id = fields.Many2one(
        'rental.tool.category', string='Category',
        help='Apply this pricing to all tools in this category')

    # Period Definition
    period_type = fields.Selection([
        ('day', 'Per Day'),
        ('week', 'Per Week'),
        ('month', 'Per Month'),
        ('fixed', 'Fixed Price'),
    ], string='Period Type', required=True, default='day')

    # Pricing
    price = fields.Monetary(string='Rental Price', required=True)
    currency_id = fields.Many2one(
        'res.currency', string='Currency',
        default=lambda self: self.env.company.currency_id)

    # Min/Max duration for this price to apply
    min_duration = fields.Float(
        string='Min Duration',
        help='Minimum rental duration for this price (in period units). 0 = no minimum.')
    max_duration = fields.Float(
        string='Max Duration',
        help='Maximum rental duration for this price (in period units). 0 = no maximum.')

    # Late fee
    late_fee_per_day = fields.Monetary(string='Late Fee / Day')

    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        'res.company', string='Company',
        default=lambda self: self.env.company)
    notes = fields.Text(string='Notes')

    # Product name for grouping serialized products in pricing view
    product_name = fields.Char(
        string='Product Name',
        compute='_compute_product_name', store=True,
        help='Groups serialized products under one name for pricing.')
    serial_count = fields.Integer(
        string='Serial Units',
        compute='_compute_serial_count',
        help='Number of serialized units sharing this product name.')

    # Primary flag: only ONE pricing per product_name is primary.
    # The pricing list shows only primary records = one row per product.
    is_primary_pricing = fields.Boolean(
        string='Primary', default=False,
        help='If True, this is the representative pricing shown in the list.')

    @api.depends('tool_id', 'tool_id.name', 'tool_id.product_id',
                 'tool_id.product_id.name')
    def _compute_product_name(self):
        for rec in self:
            name = ''
            if rec.tool_id and rec.tool_id.product_id:
                name = rec.tool_id.product_id.name or rec.tool_id.name
            elif rec.tool_id:
                name = rec.tool_id.name
            elif rec.category_id:
                name = rec.category_id.name
            rec.product_name = name or 'General'

    def _compute_serial_count(self):
        """Count how many pricing rules share the same product_name."""
        for rec in self:
            if rec.product_name:
                rec.serial_count = self.search_count([
                    ('product_name', '=', rec.product_name)])
            else:
                rec.serial_count = 1

    @api.depends('price', 'tool_id', 'category_id')
    def _compute_name(self):
        for rec in self:
            source = rec.tool_id.name or (rec.category_id.name if rec.category_id else 'General')
            rec.name = f"{source} - ${rec.price}/day"

    def write(self, vals):
        res = super().write(vals)
        if (('price' in vals or 'late_fee_per_day' in vals)
                and not self.env.context.get('_syncing_rental_pricing')):
            for rec in self:
                if rec.tool_id and rec.tool_id.product_id:
                    product = rec.tool_id.product_id
                    product_vals = {}
                    if 'price' in vals:
                        product_vals['list_price'] = rec.price
                    if 'late_fee_per_day' in vals:
                        product_vals['rental_late_fee_per_day'] = rec.late_fee_per_day

                    # Find ALL products with same name (serialized siblings)
                    all_products = self.env['product.product'].search([
                        ('name', '=', product.name),
                    ])
                    all_products.with_context(
                        _syncing_rental_pricing=True).write(product_vals)

                    # Build sibling pricing vals
                    pricing_vals = {}
                    if 'price' in vals:
                        pricing_vals['price'] = rec.price
                    if 'late_fee_per_day' in vals:
                        pricing_vals['late_fee_per_day'] = rec.late_fee_per_day

                    # Update ALL sibling pricing rules with same product_name
                    siblings = self.search([
                        ('product_name', '=', rec.product_name),
                        ('id', '!=', rec.id),
                    ])
                    if siblings:
                        siblings.with_context(
                            _syncing_rental_pricing=True).write(pricing_vals)
        return res

    @api.model
    def _recompute_primary_flags(self):
        """Ensure exactly one pricing per product_name is marked primary.
        The first (lowest id) pricing per product_name becomes primary."""
        all_pricings = self.search([], order='product_name, id')
        seen = set()
        to_primary = self.env['rental.pricing']
        to_secondary = self.env['rental.pricing']
        for p in all_pricings:
            key = p.product_name or ''
            if key not in seen:
                seen.add(key)
                if not p.is_primary_pricing:
                    to_primary |= p
            else:
                if p.is_primary_pricing:
                    to_secondary |= p
        if to_primary:
            to_primary.with_context(
                _syncing_rental_pricing=True).write({'is_primary_pricing': True})
        if to_secondary:
            to_secondary.with_context(
                _syncing_rental_pricing=True).write({'is_primary_pricing': False})

    @api.constrains('price')
    def _check_price(self):
        for rec in self:
            if rec.price < 0:
                raise ValidationError(_('Rental price cannot be negative.'))

    @api.constrains('min_duration', 'max_duration')
    def _check_duration(self):
        for rec in self:
            if rec.min_duration < 0 or rec.max_duration < 0:
                raise ValidationError(_('Duration values cannot be negative.'))
            if rec.max_duration and rec.min_duration > rec.max_duration:
                raise ValidationError(
                    _('Minimum duration cannot exceed maximum duration.'))


class RentalPricingTemplate(models.Model):
    """Reusable pricing templates that can be applied to multiple tools."""
    _name = 'rental.pricing.template'
    _description = 'Rental Pricing Template'
    _order = 'name'

    name = fields.Char(string='Template Name', required=True)
    description = fields.Text(string='Description')
    line_ids = fields.One2many(
        'rental.pricing.template.line', 'template_id',
        string='Pricing Lines')
    active = fields.Boolean(default=True)
    line_count = fields.Integer(
        compute='_compute_line_count', string='Lines')

    @api.depends('line_ids')
    def _compute_line_count(self):
        for rec in self:
            rec.line_count = len(rec.line_ids)

    def action_apply_to_tools(self):
        """Open wizard to select tools and apply this template."""
        return {
            'type': 'ir.actions.act_window',
            'name': _('Apply Template to Tools'),
            'res_model': 'rental.tool',
            'view_mode': 'list',
            'target': 'current',
            'context': {'default_pricing_template_id': self.id},
        }


class RentalPricingTemplateLine(models.Model):
    _name = 'rental.pricing.template.line'
    _description = 'Rental Pricing Template Line'
    _order = 'sequence'

    template_id = fields.Many2one(
        'rental.pricing.template', string='Template',
        ondelete='cascade', required=True)
    sequence = fields.Integer(default=10)
    period_type = fields.Selection([
        ('day', 'Per Day'),
        ('week', 'Per Week'),
        ('month', 'Per Month'),
        ('fixed', 'Fixed Price'),
    ], string='Period Type', required=True, default='day')
    price = fields.Monetary(string='Price', required=True)
    currency_id = fields.Many2one(
        'res.currency', string='Currency',
        default=lambda self: self.env.company.currency_id)
    min_duration = fields.Float(string='Min Duration')
    max_duration = fields.Float(string='Max Duration')
    late_fee_per_day = fields.Monetary(string='Late Fee / Day')
