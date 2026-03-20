/** @odoo-module */

import { KanbanController } from "@web/views/kanban/kanban_controller";
import { kanbanView } from "@web/views/kanban/kanban_view";
import { registry } from "@web/core/registry";

/**
 * Extends KanbanController for product.template views in Inventory.
 * Adds "Generate Serialized Products" button just like the
 * rental_product_kanban does for product.product.
 */
class RentalTemplateKanbanController extends KanbanController {
    static template = "tools_rental_management.RentalTemplateKanbanView";

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

export const rentalTemplateKanbanView = {
    ...kanbanView,
    Controller: RentalTemplateKanbanController,
};

registry.category("views").add("rental_template_kanban", rentalTemplateKanbanView);
