from odoo import models, fields, api


class RentalOrderMedia(models.Model):
    _name = 'rental.order.media'
    _description = 'Rental Order Media (Photos & Signatures)'
    _order = 'sequence, id'

    order_id = fields.Many2one(
        'rental.order', string='Rental Order',
        ondelete='cascade', required=True)
    sequence = fields.Integer(default=10)

    # Category: which tab this belongs to
    media_type = fields.Selection([
        ('checkout', 'Check-Out'),
        ('checkin', 'Check-In'),
        ('discount', 'Discount'),
    ], string='Type', required=True)

    # What kind of media
    media_kind = fields.Selection([
        ('signature', 'Signature'),
        ('photo', 'Photo'),
    ], string='Kind', required=True)

    label = fields.Char(string='Label', required=True)
    signer_name = fields.Char(string='Name / Signer')
    captured_on_display = fields.Char(string='Captured On')
    image_data = fields.Binary(string='Image / Signature', attachment=True)

    # Thumbnail label for list view
    thumbnail_label = fields.Char(
        string='Preview', compute='_compute_thumbnail_label')

    @api.depends('label', 'signer_name')
    def _compute_thumbnail_label(self):
        for rec in self:
            rec.thumbnail_label = rec.signer_name or rec.label or ''
