"""
Migration: Move rental_order_line.checkout_tool_image from inline binary
to attachment storage (attachment=True was added in 2.1.0).
Odoo handles this automatically when attachment=True is set - this script
just ensures the version bump triggers the field migration.
"""


def migrate(cr, version):
    # Odoo automatically migrates Binary fields to attachments when
    # attachment=True is added. No manual SQL needed - the ORM handles it
    # during module upgrade via _auto_init().
    pass
