/** @odoo-module */
import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

class RentalCategoryDashboard extends Component {
    static template = "tools_rental_management.RentalCategoryDashboard";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.allRecords = [];
        this.state = useState({
            records: [],
            searchQuery: "",
            sortField: "name",
            sortAsc: true,
            filterType: "all",
            // Summary
            totalCategories: 0,
            withTools: 0,
            emptyCategories: 0,
            totalSubCategories: 0,
            totalTools: 0,
        });

        onWillStart(async () => {
            await this.loadData();
        });
    }

    async loadData() {
        const records = await this.orm.searchRead(
            "rental.tool.category",
            [["active", "in", [true, false]]],
            [
                "name", "code", "parent_id", "tool_count",
                "child_count", "active", "description",
            ],
            { order: "name" }
        );

        this.allRecords = records;
        this._applyFilters();
    }

    // ── Filtering + Sorting ──────────────────────────────────────────
    _applyFilters() {
        let rows = [...this.allRecords];

        // Text search
        const q = this.state.searchQuery.toLowerCase().trim();
        if (q) {
            rows = rows.filter(
                (r) =>
                    (r.name || "").toLowerCase().includes(q) ||
                    (r.code || "").toLowerCase().includes(q) ||
                    (r.parent_id && r.parent_id[1] || "").toLowerCase().includes(q)
            );
        }

        // Type filter
        if (this.state.filterType === "with_tools") {
            rows = rows.filter((r) => r.tool_count > 0);
        } else if (this.state.filterType === "empty") {
            rows = rows.filter((r) => r.tool_count === 0);
        } else if (this.state.filterType === "parent") {
            rows = rows.filter((r) => !r.parent_id);
        } else if (this.state.filterType === "sub") {
            rows = rows.filter((r) => r.parent_id);
        } else if (this.state.filterType === "archived") {
            rows = rows.filter((r) => !r.active);
        }

        // Sort
        const field = this.state.sortField;
        const asc = this.state.sortAsc;
        rows.sort((a, b) => {
            let va = a[field];
            let vb = b[field];
            if (Array.isArray(va)) va = va[1] || "";
            if (Array.isArray(vb)) vb = vb[1] || "";
            if (va == null) va = "";
            if (vb == null) vb = "";
            let cmp;
            if (typeof va === "string") {
                cmp = va.localeCompare(vb);
            } else {
                cmp = (va || 0) - (vb || 0);
            }
            return asc ? cmp : -cmp;
        });

        this.state.records = rows;
        this._computeSummary();
    }

    _computeSummary() {
        const all = this.allRecords.filter((r) => r.active);
        this.state.totalCategories = all.length;
        this.state.withTools = all.filter((r) => r.tool_count > 0).length;
        this.state.emptyCategories = all.filter((r) => r.tool_count === 0).length;
        this.state.totalSubCategories = all.filter((r) => r.parent_id).length;
        this.state.totalTools = all.reduce((s, r) => s + (r.tool_count || 0), 0);
    }

    // ── Event Handlers ───────────────────────────────────────────────
    onSearchInput(ev) {
        this.state.searchQuery = ev.target.value;
        this._applyFilters();
    }

    onFilterType(ev) {
        this.state.filterType = ev.target.value;
        this._applyFilters();
    }

    onSort(field) {
        if (this.state.sortField === field) {
            this.state.sortAsc = !this.state.sortAsc;
        } else {
            this.state.sortField = field;
            this.state.sortAsc = true;
        }
        this._applyFilters();
    }

    getSortIcon(field) {
        if (this.state.sortField !== field) return "fa-sort";
        return this.state.sortAsc ? "fa-sort-asc" : "fa-sort-desc";
    }

    onOpenCategory(rec) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "rental.tool.category",
            res_id: rec.id,
            views: [[false, "form"]],
            target: "current",
        });
    }

    onViewTools(rec, ev) {
        ev.stopPropagation();
        this.action.doAction({
            type: "ir.actions.act_window",
            name: `Tools – ${rec.name}`,
            res_model: "rental.tool",
            view_mode: "kanban,list,form",
            views: [[false, "kanban"], [false, "list"], [false, "form"]],
            domain: [["category_id", "=", rec.id]],
            target: "current",
        });
    }
}

registry.category("actions").add(
    "rental_category_dashboard", RentalCategoryDashboard
);
