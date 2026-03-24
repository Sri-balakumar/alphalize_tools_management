from odoo import models, api, _
from odoo.exceptions import UserError


class ResPartner(models.Model):
    _inherit = 'res.partner'

    def action_force_delete(self):
        """Force delete selected partners by removing all dependent records first."""
        for partner in self:
            # Delete rental orders and their cascading children
            orders = self.env['rental.order'].sudo().search([
                ('partner_id', '=', partner.id)
            ])
            if orders:
                # Delete invoices linked to rental orders
                invoices = orders.mapped('invoice_id').filtered(lambda i: i)
                if invoices:
                    # Cancel posted invoices first, then delete
                    posted = invoices.filtered(lambda i: i.state == 'posted')
                    if posted:
                        posted.button_draft()
                    invoices.sudo().unlink()
                # Release rented tools before deleting orders
                for order in orders:
                    for line in order.line_ids:
                        if line.tool_id and line.tool_id.state == 'rented':
                            line.tool_id.state = 'available'
                orders.sudo().unlink()

            # Delete any standalone invoices/bills referencing this partner
            moves = self.env['account.move'].sudo().search([
                ('partner_id', '=', partner.id)
            ])
            if moves:
                posted = moves.filtered(lambda m: m.state == 'posted')
                if posted:
                    posted.button_draft()
                moves.sudo().unlink()

            # Remove mail activities, followers, and messages
            self.env['mail.activity'].sudo().search([
                ('res_model', '=', 'res.partner'),
                ('res_id', '=', partner.id)
            ]).unlink()
            self.env['mail.followers'].sudo().search([
                ('partner_id', '=', partner.id)
            ]).unlink()
            self.env['mail.message'].sudo().search([
                ('author_id', '=', partner.id)
            ]).unlink()

        # Finally delete the partners themselves
        self.sudo().unlink()
        return {'type': 'ir.actions.act_window_close'}
