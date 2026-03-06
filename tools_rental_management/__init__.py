from . import models
from . import wizard


def _post_init_sync_categories(env):
    """Sync all existing categories between product.category and rental.tool.category."""
    RentalCategory = env['rental.tool.category']
    ProductCategory = env['product.category']

    # 1. Sync rental.tool.category → product.category
    for rc in RentalCategory.search([]):
        existing = ProductCategory.search([('name', '=', rc.name)], limit=1)
        if not existing:
            ProductCategory.with_context(_syncing_categories=True).create({
                'name': rc.name,
            })

    # 2. Sync product.category → rental.tool.category
    for pc in ProductCategory.search([]):
        existing = RentalCategory.search([('name', '=', pc.name)], limit=1)
        if not existing:
            RentalCategory.with_context(_syncing_categories=True).create({
                'name': pc.name,
            })
