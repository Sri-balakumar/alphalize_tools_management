/** @odoo-module */

import { KanbanController } from "@web/views/kanban/kanban_controller";
import { kanbanView } from "@web/views/kanban/kanban_view";
import { registry } from "@web/core/registry";

class RentalProductKanbanController extends KanbanController {
    static template = "tools_rental_management.RentalProductKanbanView";

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

export const rentalProductKanbanView = {
    ...kanbanView,
    Controller: RentalProductKanbanController,
};

registry.category("views").add("rental_product_kanban", rentalProductKanbanView);
