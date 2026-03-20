from odoo import models, fields, tools


class RentalToolReport(models.Model):
    _name = 'rental.tool.report'
    _description = 'Rental Tool Availability Report'
    _auto = False
    _order = 'name'

    # ── Dimensions ────────────────────────────────────────────────────
    name = fields.Char(string='Tool Name', readonly=True)
    tool_id = fields.Many2one('rental.tool', string='Tool', readonly=True)
    category_id = fields.Many2one(
        'rental.tool.category', string='Category', readonly=True)
    state = fields.Selection([
        ('available', 'Available'),
        ('rented', 'Rented'),
        ('maintenance', 'Under Maintenance'),
        ('retired', 'Retired'),
    ], string='Status', readonly=True)
    company_id = fields.Many2one(
        'res.company', string='Company', readonly=True)

    # ── Measures ──────────────────────────────────────────────────────
    total_qty = fields.Float(string='Total Qty', readonly=True)
    checked_out_qty = fields.Float(string='Checked Out', readonly=True)
    available_qty = fields.Float(string='Available Qty', readonly=True)
    total_rentals = fields.Integer(string='Total Rentals', readonly=True)
    active_rentals = fields.Integer(string='Active Rentals', readonly=True)
    total_revenue = fields.Float(string='Total Revenue', readonly=True)
    price_per_day = fields.Float(string='Price / Day', readonly=True)
    late_fee_per_day = fields.Float(string='Late Fee / Day', readonly=True)
    currency_id = fields.Many2one(
        'res.currency', string='Currency', readonly=True)

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        self.env.cr.execute("""
            CREATE OR REPLACE VIEW %s AS (
                SELECT
                    t.id                    AS id,
                    t.name                  AS name,
                    t.id                    AS tool_id,
                    t.category_id           AS category_id,
                    t.state                 AS state,
                    t.company_id            AS company_id,
                    t.total_qty             AS total_qty,
                    t.currency_id           AS currency_id,

                    -- Checked-out qty: sum of (qty - returned) on active orders
                    COALESCE(co.checked_out_qty, 0)
                                            AS checked_out_qty,

                    -- Available = total - checked_out
                    t.total_qty - COALESCE(co.checked_out_qty, 0)
                                            AS available_qty,

                    -- Total completed rentals
                    COALESCE(done.total_rentals, 0)
                                            AS total_rentals,

                    -- Currently active (checked-out) rental count
                    COALESCE(co.active_rentals, 0)
                                            AS active_rentals,

                    -- Revenue from done orders
                    COALESCE(done.total_revenue, 0)
                                            AS total_revenue,

                    -- Price per day from first pricing rule
                    COALESCE(pr.price, 0)   AS price_per_day,

                    -- Late fee per day from first pricing rule
                    COALESCE(pr.late_fee, 0) AS late_fee_per_day

                FROM rental_tool t

                -- Checked-out quantities
                LEFT JOIN (
                    SELECT
                        ol.tool_id,
                        SUM(ol.quantity - COALESCE(ol.returned_qty, 0))
                            AS checked_out_qty,
                        COUNT(DISTINCT ol.order_id)
                            AS active_rentals
                    FROM rental_order_line ol
                    JOIN rental_order ro ON ro.id = ol.order_id
                    WHERE ro.state = 'checked_out'
                    GROUP BY ol.tool_id
                ) co ON co.tool_id = t.id

                -- Done order stats
                LEFT JOIN (
                    SELECT
                        ol.tool_id,
                        COUNT(ol.id) AS total_rentals,
                        SUM(ol.total_cost) AS total_revenue
                    FROM rental_order_line ol
                    JOIN rental_order ro ON ro.id = ol.order_id
                    WHERE ro.state = 'done'
                    GROUP BY ol.tool_id
                ) done ON done.tool_id = t.id

                -- First pricing rule (lowest sequence)
                LEFT JOIN LATERAL (
                    SELECT rp.price, rp.late_fee_per_day AS late_fee
                    FROM rental_pricing rp
                    WHERE rp.tool_id = t.id AND rp.active = true
                    ORDER BY rp.sequence, rp.id
                    LIMIT 1
                ) pr ON true

                WHERE t.active = true
            )
        """ % self._table)
