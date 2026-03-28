/** @odoo-module */

import { ListController } from "@web/views/list/list_controller";
import { listView } from "@web/views/list/list_view";
import { registry } from "@web/core/registry";

/**
 * Extends ListController for product.template views in Inventory.
 * Adds "Generate Serialized Products" button just like the
 * rental_product_list does for product.product.
 */
class RentalTemplateListController extends ListController {
    static template = "tools_rental_management.RentalTemplateListView";

    onGenerateSerials() {
        this.actionService.doAction(
            "tools_rental_management.action_rental_generate_serials",
            {
                onClose: () => {
                    this.model.load();
                },
            }
        );
    }
}

export const rentalTemplateListView = {
    ...listView,
    Controller: RentalTemplateListController,
};

registry.category("views").add("rental_template_list", rentalTemplateListView);
