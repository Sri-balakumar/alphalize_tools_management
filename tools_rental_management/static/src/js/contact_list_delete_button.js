/** @odoo-module */

import { ListController } from "@web/views/list/list_controller";
import { listView } from "@web/views/list/list_view";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

class ContactListDeleteController extends ListController {
    static template = "tools_rental_management.ContactListDeleteView";

    setup() {
        super.setup();
        this.dialogService = useService("dialog");
    }

    get hasSelectedRecords() {
        return this.model.root.selection.length > 0;
    }

    onForceDelete() {
        const selectedIds = this.model.root.selection.map((r) => r.resId);
        const count = selectedIds.length;
        this.dialogService.add(ConfirmationDialog, {
            title: "Delete Contacts",
            body: `Are you sure you want to permanently delete ${count} contact(s)? This will also delete all related rental orders and invoices.`,
            confirm: async () => {
                await this.model.orm.call(
                    "res.partner",
                    "action_force_delete",
                    [selectedIds]
                );
                await this.model.load();
            },
            cancel: () => {},
        });
    }
}

export const contactListDeleteView = {
    ...listView,
    Controller: ContactListDeleteController,
};

registry.category("views").add("contact_list_delete", contactListDeleteView);
