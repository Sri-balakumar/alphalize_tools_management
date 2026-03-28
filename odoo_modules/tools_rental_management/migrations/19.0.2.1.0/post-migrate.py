"""
Post-migration: After adding attachment=True to Binary fields,
existing data stored inline in DB columns must be moved to ir.attachment.
Odoo does NOT auto-migrate this - we do it manually here.
"""
import logging
_logger = logging.getLogger(__name__)


def migrate(cr, version):
    """Move inline binary data to ir.attachment for all affected fields."""
    
    # Fields to migrate: (table, field_name, model_name, field_label)
    line_fields = [
        ('rental_order_line', 'checkout_tool_image', 'rental.order.line', 'checkout_tool_image'),
    ]
    order_fields = [
        ('rental_order', 'customer_signature', 'rental.order', 'customer_signature'),
        ('rental_order', 'id_proof_front', 'rental.order', 'id_proof_front'),
        ('rental_order', 'id_proof_back', 'rental.order', 'id_proof_back'),
        ('rental_order', 'checkin_customer_signature', 'rental.order', 'checkin_customer_signature'),
        ('rental_order', 'checkin_signature', 'rental.order', 'checkin_signature'),
        ('rental_order', 'discount_auth_signature', 'rental.order', 'discount_auth_signature'),
        ('rental_order', 'discount_auth_photo', 'rental.order', 'discount_auth_photo'),
    ]
    media_fields = [
        ('rental_order_media', 'image_data', 'rental.order.media', 'image_data'),
    ]

    all_fields = line_fields + order_fields + media_fields

    for table, column, model, field_name in all_fields:
        try:
            # Check if column still exists (it should during migration)
            cr.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = %s AND column_name = %s
            """, (table, column))
            if not cr.fetchone():
                _logger.info('Column %s.%s not found, skipping', table, column)
                continue

            # Find rows that have data in the column
            cr.execute(f"""
                SELECT id, "{column}" FROM "{table}"
                WHERE "{column}" IS NOT NULL AND "{column}" != ''
            """)
            rows = cr.fetchall()
            
            if not rows:
                _logger.info('No inline data found in %s.%s', table, column)
                continue

            _logger.info('Migrating %d records from %s.%s to ir.attachment', 
                        len(rows), table, column)

            for record_id, data in rows:
                if not data:
                    continue
                # Check if attachment already exists for this record+field
                cr.execute("""
                    SELECT id FROM ir_attachment
                    WHERE res_model = %s AND res_id = %s AND res_field = %s
                    LIMIT 1
                """, (model, record_id, field_name))
                existing = cr.fetchone()
                
                if existing:
                    # Already migrated
                    continue

                # Create attachment record
                cr.execute("""
                    INSERT INTO ir_attachment 
                        (name, res_model, res_id, res_field, type, datas, 
                         mimetype, create_date, write_date, create_uid, write_uid)
                    VALUES 
                        (%s, %s, %s, %s, 'binary', %s, 
                         'application/octet-stream', NOW(), NOW(), 1, 1)
                """, (
                    f'{field_name}_{record_id}',
                    model,
                    record_id,
                    field_name,
                    data,
                ))

            _logger.info('Migration complete for %s.%s', table, column)

        except Exception as e:
            _logger.warning('Migration failed for %s.%s: %s', table, column, str(e))
