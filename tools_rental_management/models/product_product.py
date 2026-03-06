from odoo import models, fields, api, _
import logging

_logger = logging.getLogger(__name__)


class ProductProduct(models.Model):
    _inherit = 'product.product'

    # ── Rental-specific fields on product ───────────────────────────────
    is_rental_tool = fields.Boolean(
        string='Available for Rental', default=True,
        help='If checked, this product will appear in the '
             'Tools dropdown on Rental Orders.')
    # Alias used in rental product views
    is_rental = fields.Boolean(
        related='is_rental_tool', string='Rental',
        store=True, readonly=False)
    rental_tool_id = fields.Many2one(
        'rental.tool', string='Rental Tool',
        store=True, copy=False)
    rental_state = fields.Selection(
        related='rental_tool_id.state', string='Rental Status',
        readonly=True)
    rental_late_fee_per_day = fields.Monetary(
        string='Late Fee / Day',
        currency_field='currency_id',
        help='Late fee charged per day for overdue rentals.')
    rental_category_id = fields.Many2one(
        'rental.tool.category', string='Rental Category',
        help='Category used in Rental Tools. All rental tool categories are available here.')
    # Alias used in rental product views
    rental_categ_id = fields.Many2one(
        related='rental_category_id', string='Rental Category',
        store=True, readonly=False)

    # ── Related fields from linked rental.tool ────────────────────────
    rental_price_per_day = fields.Monetary(
        related='rental_tool_id.rental_price_per_day',
        string='Rental Price/Day', readonly=False)
    rental_location = fields.Char(
        related='rental_tool_id.location',
        string='Storage Location', readonly=False)
    rental_total_qty = fields.Float(
        related='rental_tool_id.total_qty',
        string='Total Qty', readonly=True)
    rental_available_qty = fields.Float(
        related='rental_tool_id.available_qty',
        string='Available Qty', readonly=True)
    rental_on_hand = fields.Integer(
        string='On Hand', compute='_compute_rental_on_hand',
        help='Each serialized rental product always has exactly 1 unit.')
    rental_total_rentals = fields.Integer(
        string='Total Rentals',
        compute='_compute_rental_stats')
    rental_revenue = fields.Monetary(
        string='Total Revenue',
        compute='_compute_rental_stats',
        currency_field='currency_id')

    @api.depends('is_rental_tool')
    def _compute_rental_on_hand(self):
        for product in self:
            product.rental_on_hand = 1 if product.is_rental_tool else 0

    def _compute_rental_stats(self):
        for product in self:
            if product.rental_tool_id:
                product.rental_total_rentals = product.rental_tool_id.total_rental_count
                product.rental_revenue = product.rental_tool_id.total_revenue
            else:
                product.rental_total_rentals = 0
                product.rental_revenue = 0

    # ── Stored flag: is this product currently available for rental? ──
    rental_available = fields.Boolean(
        string='Available for Rental Now',
        compute='_compute_rental_available',
        store=True)

    @api.depends('rental_tool_id', 'rental_tool_id.state', 'is_rental_tool')
    def _compute_rental_available(self):
        for product in self:
            if not product.is_rental_tool:
                product.rental_available = False
            elif product.rental_tool_id:
                product.rental_available = (
                    product.rental_tool_id.state == 'available')
            else:
                product.rental_available = True

    # ── Filter out unavailable products in rental order line dropdown ──
    @api.model
    def _name_search(self, name='', domain=None, operator='ilike', limit=None, order=None):
        if self.env.context.get('rental_order_product_select'):
            unavailable_tools = self.env['rental.tool'].search([
                ('state', 'not in', ['available']),
            ])
            unavailable_product_ids = unavailable_tools.mapped('product_id').ids
            domain = list(domain or [])
            domain += [('id', 'not in', unavailable_product_ids)]
        return super()._name_search(
            name, domain=domain, operator=operator,
            limit=limit, order=order)

    # ── Actions for rental product views ──────────────────────────────
    def action_create_rental_tool(self):
        """Create a rental tool from this product."""
        self.ensure_one()
        self.is_rental_tool = True
        self._sync_to_rental_tool()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Rental Tool Created'),
                'message': _('Rental tool created for "%s".') % self.name,
                'type': 'success',
                'sticky': False,
            }
        }

    def action_view_rental_tool(self):
        """Open the linked rental tool form."""
        self.ensure_one()
        if not self.rental_tool_id:
            return
        return {
            'type': 'ir.actions.act_window',
            'name': _('Rental Tool'),
            'res_model': 'rental.tool',
            'res_id': self.rental_tool_id.id,
            'view_mode': 'form',
            'target': 'current',
        }

    # ── Sync product → rental.tool ──────────────────────────────────────
    def _sync_to_rental_tool(self):
        """Create or update a rental.tool record for each product.
        Each serialized product gets its own rental.tool (1:1 mapping).
        Optimized with batch prefetch to avoid N+1 queries.
        """
        if not self:
            return

        RentalTool = self.env['rental.tool']
        RentalCategory = self.env['rental.tool.category']
        RentalPricing = self.env['rental.pricing']

        # Batch prefetch: all existing tools for these products in one query
        all_tools = RentalTool.search([('product_id', 'in', self.ids)])
        tool_by_product = {t.product_id.id: t for t in all_tools}

        # Prefetch all existing pricings for these tools in one query
        tool_ids = all_tools.ids
        all_pricings = RentalPricing.search(
            [('tool_id', 'in', tool_ids)]) if tool_ids else RentalPricing
        pricings_by_tool = {}
        for p in all_pricings:
            pricings_by_tool.setdefault(p.tool_id.id, []).append(p)

        # Cache rental categories to avoid repeated searches
        categ_cache = {}

        # Collect products that need rental_tool_id update
        link_updates = {}  # {product_id: tool_id}
        tools_to_create = []

        for product in self:
            existing_tool = tool_by_product.get(product.id)

            if existing_tool:
                if product.rental_tool_id.id != existing_tool.id:
                    link_updates[product.id] = existing_tool.id
                category = self._get_rental_category_cached(
                    product, RentalCategory, categ_cache)
                update_vals = {
                    'total_qty': 1,
                    'name': product.name,
                    'code': product.default_code or existing_tool.code,
                    'serial_number': product.default_code or existing_tool.serial_number,
                }
                if product.image_1920:
                    update_vals['image'] = product.image_1920
                if category:
                    update_vals['category_id'] = category.id
                existing_tool.with_context(
                    _syncing_rental_pricing=True).write(update_vals)
                self._sync_pricing_rule_cached(
                    existing_tool, product, RentalPricing,
                    pricings_by_tool.get(existing_tool.id, []))
            else:
                category = self._get_rental_category_cached(
                    product, RentalCategory, categ_cache)
                tools_to_create.append({
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

        # Batch create new tools
        if tools_to_create:
            try:
                new_tools = RentalTool.create(tools_to_create)
                for tool in new_tools:
                    link_updates[tool.product_id.id] = tool.id
                    product = self.filtered(
                        lambda p, pid=tool.product_id.id: p.id == pid)
                    if product:
                        self._sync_pricing_rule_cached(
                            tool, product, RentalPricing, [])
            except Exception as e:
                _logger.warning(
                    'Could not batch create rental tools: %s', str(e))

        # Batch update rental_tool_id links
        if link_updates:
            for product in self:
                new_tool_id = link_updates.get(product.id)
                if new_tool_id and product.rental_tool_id.id != new_tool_id:
                    product.with_context(
                        _syncing_rental_pricing=True
                    ).write({'rental_tool_id': new_tool_id})

    def _get_rental_category_cached(self, product, RentalCategory, cache):
        """Get rental category with cache to avoid repeated searches."""
        if product.rental_category_id:
            return product.rental_category_id
        categ_name = product.categ_id.name if product.categ_id else 'General'
        if categ_name in cache:
            return cache[categ_name]
        category = RentalCategory.search(
            [('name', '=', categ_name)], limit=1)
        if not category:
            category = RentalCategory.create({
                'name': categ_name,
                'code': categ_name[:4].upper(),
            })
        cache[categ_name] = category
        return category

    def _sync_pricing_rule_cached(self, tool, product, RentalPricing,
                                  existing_list):
        """Create or update a pricing rule. Always creates for new tools
        even if price is 0 so every tool appears in the pricing list.
        Sets is_primary_pricing=True if no other pricing with same
        product name already has the primary flag."""
        pricing_vals = {
            'price': product.list_price or 0,
            'late_fee_per_day': product.rental_late_fee_per_day or 0,
        }
        if existing_list:
            existing_list[0].with_context(
                _syncing_rental_pricing=True).write(pricing_vals)
            if len(existing_list) > 1:
                RentalPricing.browse(
                    [p.id for p in existing_list[1:]]).unlink()
        else:
            # Check if a primary pricing already exists for this product name
            product_name = product.name or tool.name or 'General'
            has_primary = RentalPricing.search_count([
                ('product_name', '=', product_name),
                ('is_primary_pricing', '=', True),
            ])
            pricing_vals.update({
                'tool_id': tool.id,
                'period_type': 'day',
                'is_primary_pricing': not has_primary,
            })
            RentalPricing.with_context(
                _syncing_rental_pricing=True).create(pricing_vals)

    # ── Bulk: Mark / Unmark ALL products for Rental ─────────────────────
    @api.model
    def action_mark_all_rental(self):
        """Mark ALL active products as Available for Rental."""
        products = self.search([('active', '=', True)])
        products.write({'is_rental_tool': True})
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('All Marked for Rental'),
                'message': _('%d product(s) marked as Available for Rental.') % len(products),
                'type': 'success',
                'sticky': False,
            }
        }

    @api.model
    def action_unmark_all_rental(self):
        """Remove ALL products from rental availability."""
        products = self.search([('is_rental_tool', '=', True)])
        products.write({'is_rental_tool': False})
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('All Removed from Rental'),
                'message': _('%d product(s) removed from Rental.') % len(products),
                'type': 'success',
                'sticky': False,
            }
        }

    # ── Button: Sync this product to rental tools ───────────────────────
    def action_sync_to_rental(self):
        self._sync_to_rental_tool()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Sync Complete'),
                'message': _('%d product(s) synced to Rental Tools.') % len(self),
                'type': 'success',
                'sticky': False,
            }
        }

    # ── Bulk sync: ALL products ─────────────────────────────────────────
    @api.model
    def action_sync_all_products_to_rental(self):
        products = self.search([('active', '=', True)])
        products._sync_to_rental_tool()
        # Recompute primary flags so only one pricing per product shows
        self.env['rental.pricing']._recompute_primary_flags()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Full Sync Complete'),
                'message': _('%d product(s) synced to Rental Tools.') % len(products),
                'type': 'success',
                'sticky': False,
            }
        }

    # ── Cron: Sync products marked for rental ───────────────────────────
    @api.model
    def _cron_sync_products_to_rental_tools(self):
        products = self.search([('is_rental_tool', '=', True)])
        products._sync_to_rental_tool()
        self.env['rental.pricing']._recompute_primary_flags()
        _logger.info('Cron: Synced %d products to rental tools.', len(products))

    # ── Auto-sync on write/create ───────────────────────────────────────
    _rental_sync_fields = {
        'is_rental_tool', 'is_rental', 'list_price', 'rental_late_fee_per_day',
        'name', 'image_1920', 'default_code', 'barcode', 'qty_available',
        'rental_category_id', 'rental_categ_id',
    }

    def write(self, vals):
        res = super().write(vals)
        if (self._rental_sync_fields & set(vals)
                and not self.env.context.get('_syncing_rental_pricing')):
            self.filtered('is_rental_tool').with_context(
                _syncing_rental_pricing=True)._sync_to_rental_tool()
        return res

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records.filtered('is_rental_tool')._sync_to_rental_tool()
        return records


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    # Fields needed by rental_product_views.xml inherited template form
    is_rental = fields.Boolean(
        string='Available for Rental', default=False)
    rental_categ_id = fields.Many2one(
        'rental.tool.category', string='Rental Category')
    rental_price_per_day = fields.Monetary(
        string='Rental Price/Day', currency_field='currency_id')
    rental_late_fee_per_day = fields.Monetary(
        string='Late Fee / Day', currency_field='currency_id')
    rental_location = fields.Char(string='Storage Location')

    # Fields that should propagate to product.product variants for rental sync
    _rental_template_sync_fields = {
        'is_rental', 'rental_categ_id', 'rental_price_per_day',
        'rental_late_fee_per_day', 'rental_location',
        'list_price', 'name', 'image_1920', 'default_code', 'barcode',
    }

    def _propagate_rental_to_variants(self):
        """Propagate rental fields from template to product variants
        and trigger rental tool + pricing sync."""
        for template in self:
            variants = template.product_variant_ids
            if not variants:
                continue
            variant_vals = {}
            if template.is_rental:
                variant_vals['is_rental_tool'] = True
            if template.rental_categ_id:
                variant_vals['rental_category_id'] = template.rental_categ_id.id
            if template.rental_late_fee_per_day:
                variant_vals['rental_late_fee_per_day'] = template.rental_late_fee_per_day
            if variant_vals:
                variants.with_context(
                    _syncing_rental_pricing=True).write(variant_vals)
            # Trigger full sync for rental-enabled variants
            rental_variants = variants.filtered('is_rental_tool')
            if rental_variants:
                rental_variants._sync_to_rental_tool()

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        rental_templates = records.filtered('is_rental')
        if rental_templates:
            rental_templates._propagate_rental_to_variants()
        return records

    def write(self, vals):
        res = super().write(vals)
        if (self._rental_template_sync_fields & set(vals)
                and not self.env.context.get('_syncing_rental_pricing')):
            self.filtered('is_rental')._propagate_rental_to_variants()
        return res


class ProductCategory(models.Model):
    _inherit = 'product.category'

    # ── Two-way sync: product.category → rental.tool.category ─────────
    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        if not self.env.context.get('_syncing_categories'):
            RentalCategory = self.env['rental.tool.category']
            for rec in records:
                existing = RentalCategory.search(
                    [('name', '=', rec.name)], limit=1)
                if not existing:
                    RentalCategory.with_context(
                        _syncing_categories=True
                    ).create({'name': rec.name})
        return records

    def write(self, vals):
        old_names = {r.id: r.name for r in self} if 'name' in vals else {}
        res = super().write(vals)
        if 'name' in vals and not self.env.context.get('_syncing_categories'):
            RentalCategory = self.env['rental.tool.category']
            for rec in self:
                old_name = old_names.get(rec.id)
                if old_name and old_name != rec.name:
                    existing = RentalCategory.search(
                        [('name', '=', old_name)], limit=1)
                    if existing:
                        existing.with_context(
                            _syncing_categories=True
                        ).write({'name': rec.name})
        return res
