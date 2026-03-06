from odoo import models, fields, _


class RentalPrintWizard(models.TransientModel):
    _name = 'rental.print.wizard'
    _description = 'Rental Invoice Print Wizard'

    order_id = fields.Many2one(
        'rental.order', string='Rental Order', required=True)
    report_type = fields.Selection([
        ('checkout', 'Checkout Invoice'),
        ('checkin', 'Check-In Invoice'),
    ], string='Invoice Type', required=True)
    paper_size = fields.Selection([
        ('a4', 'A4'),
        ('a5', 'A5'),
    ], string='Paper Size', default='a4', required=True)

    def action_print(self):
        self.ensure_one()
        report_map = {
            ('checkout', 'a4'): 'tools_rental_management.action_report_checkout_invoice_a4',
            ('checkout', 'a5'): 'tools_rental_management.action_report_checkout_invoice_a5',
            ('checkin', 'a4'): 'tools_rental_management.action_report_checkin_invoice_a4',
            ('checkin', 'a5'): 'tools_rental_management.action_report_checkin_invoice_a5',
        }
        action_xmlid = report_map.get((self.report_type, self.paper_size))
        return self.env.ref(action_xmlid).report_action(self.order_id)
