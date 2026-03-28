from odoo import models, fields, _
from odoo.exceptions import UserError


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

    _REPORT_MAP = {
        ('checkout', 'a4'): 'tools_rental_management.action_report_checkout_invoice_a4',
        ('checkout', 'a5'): 'tools_rental_management.action_report_checkout_invoice_a5',
        ('checkin', 'a4'): 'tools_rental_management.action_report_checkin_invoice_a4',
        ('checkin', 'a5'): 'tools_rental_management.action_report_checkin_invoice_a5',
    }

    def action_print(self):
        self.ensure_one()
        action_xmlid = self._REPORT_MAP.get((self.report_type, self.paper_size))
        return self.env.ref(action_xmlid).report_action(self.order_id)

    def action_download_pdf(self):
        self.ensure_one()
        return self.action_print()

    def action_send_whatsapp(self):
        self.ensure_one()

        if 'whatsapp.session' not in self.env:
            raise UserError(_("WhatsApp module (whatsapp_neonize) is not installed."))

        session = self.env['whatsapp.session'].sudo().search([
            ('status', '=', 'connected'),
            '|',
            ('company_id', '=', self.env.company.id),
            ('company_id', '=', False),
        ], limit=1)
        if not session:
            raise UserError(_(
                "No active WhatsApp session found.\n"
                "Please go to WhatsApp \u2192 Sessions and connect first."
            ))

        phone = self.order_id.partner_id.phone
        if not phone:
            raise UserError(
                _("Customer '%s' has no phone number set.") % self.order_id.partner_id.name
            )

        action_xmlid = self._REPORT_MAP[(self.report_type, self.paper_size)]
        report_action = self.env.ref(action_xmlid)

        try:
            pdf_content, _ctype = self.env['ir.actions.report']._render_qweb_pdf(
                report_action.report_name, self.order_id.ids
            )
        except Exception as e:
            raise UserError(_("Failed to generate PDF: %s") % str(e))

        invoice_type = 'CheckIn' if self.report_type == 'checkin' else 'Checkout'
        filename = f"{invoice_type}_Invoice_{self.order_id.name}.pdf"
        caption = f"{invoice_type} Invoice - {self.order_id.name}"

        session.send_document(phone, pdf_content, filename, caption=caption, mimetype='application/pdf')

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('WhatsApp'),
                'message': _('Invoice sent to %s', phone),
                'type': 'success',
                'sticky': False,
            },
        }
