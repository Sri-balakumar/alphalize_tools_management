from odoo import models, fields, api, _


class RentalToolCategory(models.Model):
    _name = 'rental.tool.category'
    _description = 'Rental Tool Category'
    _order = 'name'

    name = fields.Char(string='Category Name', required=True)
    code = fields.Char(string='Code')
    parent_id = fields.Many2one('rental.tool.category', string='Parent Category')
    child_ids = fields.One2many('rental.tool.category', 'parent_id', string='Sub Categories')
    description = fields.Text(string='Description')
    tool_count = fields.Integer(string='Tools', compute='_compute_tool_count')
    child_count = fields.Integer(string='Sub Categories', compute='_compute_child_count')
    active = fields.Boolean(default=True)

    @api.depends('name')
    def _compute_tool_count(self):
        for rec in self:
            rec.tool_count = self.env['rental.tool'].search_count([
                ('category_id', '=', rec.id)
            ])

    @api.depends('child_ids')
    def _compute_child_count(self):
        for rec in self:
            rec.child_count = len(rec.child_ids)

    def action_view_tools(self):
        """Open the tools list filtered by this category."""
        return {
            'type': 'ir.actions.act_window',
            'name': _('Tools – %s', self.name),
            'res_model': 'rental.tool',
            'view_mode': 'kanban,list,form',
            'domain': [('category_id', '=', self.id)],
            'context': {},
        }

    # ── Two-way sync: rental.tool.category ↔ product.category ─────────
    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        if not self.env.context.get('_syncing_categories'):
            ProductCateg = self.env['product.category']
            for rec in records:
                existing = ProductCateg.search(
                    [('name', '=', rec.name)], limit=1)
                if not existing:
                    ProductCateg.with_context(
                        _syncing_categories=True
                    ).create({'name': rec.name})
        return records

    def write(self, vals):
        old_names = {r.id: r.name for r in self} if 'name' in vals else {}
        res = super().write(vals)
        if 'name' in vals and not self.env.context.get('_syncing_categories'):
            ProductCateg = self.env['product.category']
            for rec in self:
                old_name = old_names.get(rec.id)
                if old_name and old_name != rec.name:
                    existing = ProductCateg.search(
                        [('name', '=', old_name)], limit=1)
                    if existing:
                        existing.with_context(
                            _syncing_categories=True
                        ).write({'name': rec.name})
        return res
