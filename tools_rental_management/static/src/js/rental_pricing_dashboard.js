/** @odoo-module */
import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

class RentalPricingDashboard extends Component {
    static template = "tools_rental_management.RentalPricingDashboard";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.allRecords = [];
        this.state = useState({
            records: [],
            searchQuery: "",
            sortField: "product_name",
            sortAsc: true,
            filterCategory: "all",
            filterPeriod: "all",
            categories: [],
            // Summary
            totalProducts: 0,
            totalUnits: 0,
            avgPrice: 0,
            totalWithLateFee: 0,
        });

        onWillStart(async () => {
            await this.loadData();
        });
    }

    async loadData() {
        const records = await this.orm.searchRead(
            "rental.pricing",
            [["is_primary_pricing", "=", true]],
            [
                "product_name", "serial_count", "category_id",
                "period_type", "price", "late_fee_per_day",
                "min_duration", "max_duration",
                "active", "tool_id",
            ],
            { order: "product_name" }
        );

        // Resolve category from tool when category_id is empty
        const toolIds = records
            .filter((r) => !r.category_id && r.tool_id)
            .map((r) => r.tool_id[0]);
        let toolCatMap = {};
        if (toolIds.length) {
            const tools = await this.orm.searchRead(
                "rental.tool",
                [["id", "in", toolIds]],
                ["id", "category_id"]
            );
            for (const t of tools) {
                if (t.category_id) {
                    toolCatMap[t.id] = t.category_id;
                }
            }
        }

        // Merge: use category_id from pricing, fallback to tool's category
        for (const r of records) {
            if (!r.category_id && r.tool_id && toolCatMap[r.tool_id[0]]) {
                r.category_id = toolCatMap[r.tool_id[0]];
            }
        }

        this.allRecords = records;

        // Build unique category list
        const catMap = {};
        for (const r of records) {
            if (r.category_id) {
                catMap[r.category_id[0]] = r.category_id[1];
            }
        }
        this.state.categories = Object.entries(catMap)
            .map(([id, name]) => ({ id: Number(id), name }))
            .sort((a, b) => a.name.localeCompare(b.name));

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
                    (r.product_name || "").toLowerCase().includes(q) ||
                    (r.category_id && r.category_id[1] || "").toLowerCase().includes(q)
            );
        }

        // Category filter
        if (this.state.filterCategory !== "all") {
            const catId = Number(this.state.filterCategory);
            rows = rows.filter((r) => r.category_id && r.category_id[0] === catId);
        }

        // Period filter
        if (this.state.filterPeriod !== "all") {
            rows = rows.filter((r) => r.period_type === this.state.filterPeriod);
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
        this._computeSummary(rows);
    }

    _computeSummary(rows) {
        this.state.totalProducts = rows.length;
        this.state.totalUnits = rows.reduce((s, r) => s + (r.serial_count || 0), 0);
        const priced = rows.filter((r) => r.price > 0);
        this.state.avgPrice = priced.length
            ? priced.reduce((s, r) => s + r.price, 0) / priced.length
            : 0;
        this.state.totalWithLateFee = rows.filter((r) => r.late_fee_per_day > 0).length;
    }

    // ── Event Handlers ───────────────────────────────────────────────
    onSearchInput(ev) {
        this.state.searchQuery = ev.target.value;
        this._applyFilters();
    }

    onFilterCategory(ev) {
        this.state.filterCategory = ev.target.value;
        this._applyFilters();
    }

    onFilterPeriod(ev) {
        this.state.filterPeriod = ev.target.value;
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

    onOpenPricing(rec) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "rental.pricing",
            res_id: rec.id,
            views: [[false, "form"]],
            target: "current",
        });
    }

    // ── Formatters ───────────────────────────────────────────────────
    getPeriodLabel(pt) {
        return { day: "Per Day", week: "Per Week", month: "Per Month", fixed: "Fixed" }[pt] || pt;
    }

    getPeriodClass(pt) {
        return {
            day: "rtr_badge_info",
            week: "rtr_badge_success",
            month: "rtr_badge_warning",
            fixed: "rtr_badge_danger",
        }[pt] || "";
    }

    formatMoney(val) {
        return "$ " + Number(val || 0).toFixed(2);
    }
}

registry.category("actions").add(
    "rental_pricing_dashboard", RentalPricingDashboard
);
