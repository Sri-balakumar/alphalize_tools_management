/** @odoo-module **/

import { KanbanController } from "@web/views/kanban/kanban_controller";
import { ListController } from "@web/views/list/list_controller";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";

/**
 * Global patch: adds "Generate Serialized Products" button to ALL
 * kanban and list views that operate on product.product or product.template.
 *
 * This covers:
 *   - Inventory > Products  (product.template, action-390)
 *   - Tools Rental > Tools & Equipment  (product.product, custom js_class)
 *   - Any other product list/kanban view
 *
 * Uses plain helper functions (not getters) for sharing logic.
 */

function _shouldShowGenerateSerialsButton(instance) {
    const resModel = instance.props?.resModel;
    return resModel === "product.product" || resModel === "product.template";
}

async function _onGenerateSerials(instance) {
    await instance.actionService.doAction(
        "tools_rental_management.action_rental_generate_serials",
        {
            onClose: () => {
                instance.model.load();
            },
        }
    );
}

patch(KanbanController.prototype, {
    setup() {
        super.setup(...arguments);
        this.actionService = useService("action");
    },

    get showGenerateSerialsButton() {
        return _shouldShowGenerateSerialsButton(this);
    },

    async onGenerateSerials() {
        return _onGenerateSerials(this);
    },
});

patch(ListController.prototype, {
    setup() {
        super.setup(...arguments);
        this.actionService = useService("action");
    },

    get showGenerateSerialsButton() {
        return _shouldShowGenerateSerialsButton(this);
    },

    async onGenerateSerials() {
        return _onGenerateSerials(this);
    },
});
