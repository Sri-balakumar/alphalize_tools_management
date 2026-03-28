from odoo import models, fields, api, _
from odoo.exceptions import UserError


class RentalGenerateSerialsWizard(models.TransientModel):
    _name = 'rental.generate.serials.wizard'
    _description = 'Generate Serialized Rental Products'

    # ── Option 1: Copy from existing product ──
    template_product_id = fields.Many2one(
        'product.product', string='Copy From Product',
        help='Select an existing product to copy name, price, category, '
             'and image. Leave empty to create from scratch.')

    # ── Product details (auto-filled from template or entered manually) ──
    product_name = fields.Char(
        string='Product Name', required=True,
        help='Name for all generated products (e.g., "Drill Machine").')
    list_price = fields.Float(
        string='Rental Price / Day', default=0)
    late_fee_per_day = fields.Float(
        string='Late Fee / Day', default=0)
    rental_category_id = fields.Many2one(
        'rental.tool.category', string='Rental Category')
    image_1920 = fields.Binary(string='Image')

    # ── Serial number input (one serial per line) ──
    serial_numbers_text = fields.Text(
        string='Serial Numbers',
        help='Enter one serial number per line.\n'
             'Example:\nDRL-001\nDRL-002\nDRL-003')

    # ── Preview ──
    preview_text = fields.Text(
        string='Preview', compute='_compute_preview', readonly=True)
    product_count = fields.Integer(
        string='Products to Create', compute='_compute_preview')

    @api.onchange('template_product_id')
    def _onchange_template_product_id(self):
        if self.template_product_id:
            p = self.template_product_id
            self.product_name = p.name
            self.list_price = p.list_price
            self.late_fee_per_day = p.rental_late_fee_per_day or 0
            self.rental_category_id = p.rental_category_id.id if p.rental_category_id else False
            self.image_1920 = p.image_1920

    @api.depends('serial_numbers_text')
    def _compute_preview(self):
        for wiz in self:
            serials = wiz._get_serial_list()
            wiz.product_count = len(serials)
            if serials:
                shown = serials[:10]
                preview = '\n'.join(shown)
                if len(serials) > 10:
                    preview += f'\n... and {len(serials) - 10} more'
                wiz.preview_text = preview
            else:
                wiz.preview_text = ''

    def _get_serial_list(self):
        """Return list of serial numbers from text input."""
        self.ensure_one()
        if not self.serial_numbers_text:
            return []
        lines = self.serial_numbers_text.strip().split('\n')
        return [s.strip() for s in lines if s.strip()]

    def action_generate(self):
        """Create one product.product record per serial number."""
        self.ensure_one()
        serials = self._get_serial_list()
        if not serials:
            raise UserError(
                _('No serial numbers to generate. '
                  'Please enter serial numbers or configure the prefix settings.'))

        if not self.product_name:
            raise UserError(_('Product Name is required.'))

        # Check for duplicate serial numbers in input
        if len(serials) != len(set(serials)):
            raise UserError(_('Duplicate serial numbers found in your input.'))

        # Check for existing products with same default_code
        existing = self.env['product.product'].search([
            ('default_code', 'in', serials),
        ])
        if existing:
            codes = ', '.join(existing.mapped('default_code'))
            raise UserError(
                _('Products with these internal references already exist: %s')
                % codes)

        # Build product values
        Product = self.env['product.product']
        created = Product
        for serial in serials:
            vals = {
                'name': self.product_name,
                'default_code': serial,
                'list_price': self.list_price,
                'rental_late_fee_per_day': self.late_fee_per_day,
                'is_rental_tool': True,
                'type': 'consu',
            }
            if self.rental_category_id:
                vals['rental_category_id'] = self.rental_category_id.id
            if self.image_1920:
                vals['image_1920'] = self.image_1920
            created |= Product.create(vals)

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Products Created'),
                'message': _('%d serialized product(s) created for "%s".') % (
                    len(created), self.product_name),
                'type': 'success',
                'sticky': False,
                'next': {'type': 'ir.actions.act_window_close'},
            }
        }
