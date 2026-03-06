{
    'name': 'Tools Rental Management',
    'version': '19.0.2.1.0',
    'category': 'Rental',
    'summary': 'Manage tool rentals with check-out/check-in, timesheet tracking & cost calculation',
    'description': """
        Tools Rental Management
        ========================
        A comprehensive rental management solution for tools and equipment.

        Features:
        ---------
        * Tool/Equipment catalog with availability tracking
        * Flexible rental pricing (Hourly / Daily / Weekly / Monthly)
        * Check-Out and Check-In workflow with timesheet
        * Automatic cost calculation based on rental period
        * Late return penalty configuration
        * Advance payment at checkout
        * Damage tracking and charges
        * Customer rental history
        * Dashboard with KPIs
        * PDF Rental Agreement report
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': [
        'base',
        'product',
        'stock',
        'purchase',
        'contacts',
        'mail',
    ],
    'data': [
        'security/rental_security.xml',
        'security/ir.model.access.csv',
        'data/sequence_data.xml',
        'data/rental_period_data.xml',
        'data/cron_data.xml',
        'views/rental_order_views.xml',
        'views/rental_tool_views.xml',
        'views/rental_pricing_views.xml',
        'wizard/rental_checkin_wizard_views.xml',
        'wizard/rental_checkout_wizard_views.xml',
        'wizard/rental_discount_wizard_views.xml',
        'wizard/rental_report_wizard_views.xml',
        'wizard/rental_generate_serials_wizard_views.xml',
        'views/rental_product_views.xml',
        'views/product_views.xml',
        'views/rental_dashboard_views.xml',
        'views/rental_tool_report_views.xml',
        'views/rental_order_report_views.xml',
        'views/rental_discount_report_views.xml',
        'report/rental_agreement_report.xml',
        'report/rental_agreement_template.xml',
        'report/rental_tool_report_pdf.xml',
        'report/rental_invoice_reports.xml',
        'report/rental_checkout_invoice_template.xml',
        'report/rental_checkin_invoice_template.xml',
        'wizard/rental_print_wizard_views.xml',
        'views/rental_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'tools_rental_management/static/src/css/rental_dashboard.css',
            'tools_rental_management/static/src/js/rental_report_dashboard.js',
            'tools_rental_management/static/src/xml/rental_report_dashboard.xml',
            # product.product controllers (Tools & Equipment)
            'tools_rental_management/static/src/js/rental_product_kanban_button.js',
            'tools_rental_management/static/src/js/rental_product_list_button.js',
            'tools_rental_management/static/src/xml/rental_product_kanban_button.xml',
            'tools_rental_management/static/src/xml/rental_product_list_button.xml',
            # product.template controllers (Inventory > Products)
            'tools_rental_management/static/src/js/rental_template_kanban_button.js',
            'tools_rental_management/static/src/js/rental_template_list_button.js',
            'tools_rental_management/static/src/xml/rental_template_kanban_button.xml',
            'tools_rental_management/static/src/xml/rental_template_list_button.xml',
            # Camera + file upload widget
            'tools_rental_management/static/src/js/camera_widget.js',
            'tools_rental_management/static/src/xml/camera_widget.xml',
            # Image preview popup widget
            'tools_rental_management/static/src/js/image_preview_widget.js',
            'tools_rental_management/static/src/xml/image_preview_widget.xml',
            # Order Reports dashboard
            'tools_rental_management/static/src/js/rental_order_report.js',
            'tools_rental_management/static/src/xml/rental_order_report.xml',
            # Discount Details dashboard
            'tools_rental_management/static/src/js/rental_discount_report.js',
            'tools_rental_management/static/src/xml/rental_discount_report.xml',
            # Pricing Rules dashboard
            'tools_rental_management/static/src/js/rental_pricing_dashboard.js',
            'tools_rental_management/static/src/xml/rental_pricing_dashboard.xml',
            # Categories dashboard
            'tools_rental_management/static/src/js/rental_category_dashboard.js',
            'tools_rental_management/static/src/xml/rental_category_dashboard.xml',
        ],
    },
    'demo': [],
    'installable': True,
    'application': True,
    'auto_install': False,
    'post_init_hook': '_post_init_sync_categories',
}
