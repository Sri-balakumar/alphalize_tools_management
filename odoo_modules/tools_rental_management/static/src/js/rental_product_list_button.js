/** @odoo-module */

import { ListController } from "@web/views/list/list_controller";
import { listView } from "@web/views/list/list_view";
import { registry } from "@web/core/registry";

class RentalProductListController extends ListController {
    static template = "tools_rental_management.RentalProductListView";

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

export const rentalProductListView = {
    ...listView,
    Controller: RentalProductListController,
};

registry.category("views").add("rental_product_list", rentalProductListView);
