from odoo import models, fields, api, _
from odoo.exceptions import UserError


class RentalAddProductWizard(models.TransientModel):
    _name = 'rental.add.product.wizard'
    _description = 'Add Products from Inventory to Rental Order'

    order_id = fields.Many2one(
        'rental.order', string='Rental Order',
        required=True, ondelete='cascade')
    line_ids = fields.One2many(
        'rental.add.product.wizard.line', 'wizard_id',
        string='Products')

    def action_add_products(self):
        """Create rental order lines from selected products."""
        self.ensure_one()
        if not self.line_ids:
            raise UserError(_('Please select at least one product.'))

        for wiz_line in self.line_ids:
            if wiz_line.quantity <= 0:
                continue
            # Get or create rental tool from product
            tool = self.env['rental.tool']._get_or_create_from_product(
                wiz_line.product_id)
            # Create rental order line
            self.env['rental.order.line'].create({
                'order_id': self.order_id.id,
                'tool_id': tool.id,
                'product_id': wiz_line.product_id.id,
                'quantity': wiz_line.quantity,
                'unit_price': wiz_line.price_unit,
            })
        return {'type': 'ir.actions.act_window_close'}


class RentalAddProductWizardLine(models.TransientModel):
    _name = 'rental.add.product.wizard.line'
    _description = 'Add Product Wizard Line'

    wizard_id = fields.Many2one(
        'rental.add.product.wizard', string='Wizard',
        ondelete='cascade', required=True)
    product_id = fields.Many2one(
        'product.product', string='Product',
        required=True)
    product_uom_qty = fields.Float(
        related='product_id.qty_available',
        string='In Stock', readonly=True)
    quantity = fields.Float(string='Qty', default=1)
    price_unit = fields.Float(
        string='Price/Day',
        help='Daily rental price.')

    @api.onchange('product_id')
    def _onchange_product_id(self):
        if self.product_id:
            if self.product_id.rental_price_per_day:
                self.price_unit = self.product_id.rental_price_per_day
            else:
                self.price_unit = self.product_id.list_price or 0.0
