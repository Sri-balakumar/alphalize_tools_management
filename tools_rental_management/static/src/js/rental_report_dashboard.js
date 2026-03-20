/** @odoo-module */
import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

class RentalToolReportDashboard extends Component {
    static template = "tools_rental_management.RentalToolReportDashboard";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.allRecords = [];
        this.state = useState({
            records: [],
            searchQuery: "",
            sortField: "name",
            sortAsc: true,
            filterStatus: "all",
            filterCategory: "all",
            categories: [],
            // Summary
            totalTools: 0,
            totalQty: 0,
            totalAvailable: 0,
            totalCheckedOut: 0,
            totalActiveOrders: 0,
            totalRentals: 0,
            totalRevenue: 0,
        });

        onWillStart(async () => {
            await this.loadData();
        });
    }

    async loadData() {
        const records = await this.orm.searchRead(
            "rental.tool.report",
            [],
            [
                "name", "category_id", "state", "total_qty",
                "available_qty", "checked_out_qty", "active_rentals",
                "total_rentals", "price_per_day", "late_fee_per_day",
                "total_revenue",
            ],
            { order: "name" }
        );

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
                    (r.name || "").toLowerCase().includes(q) ||
                    (r.category_id && r.category_id[1] || "").toLowerCase().includes(q)
            );
        }

        // Status filter
        if (this.state.filterStatus !== "all") {
            rows = rows.filter((r) => r.state === this.state.filterStatus);
        }

        // Category filter
        if (this.state.filterCategory !== "all") {
            const catId = Number(this.state.filterCategory);
            rows = rows.filter((r) => r.category_id && r.category_id[0] === catId);
        }

        // Sort
        const field = this.state.sortField;
        const asc = this.state.sortAsc;
        rows.sort((a, b) => {
            let va = a[field];
            let vb = b[field];
            // Many2one fields: compare display name
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
        this.state.totalTools = rows.length;
        this.state.totalQty = rows.reduce((s, r) => s + r.total_qty, 0);
        this.state.totalAvailable = rows.reduce((s, r) => s + r.available_qty, 0);
        this.state.totalCheckedOut = rows.reduce((s, r) => s + r.checked_out_qty, 0);
        this.state.totalActiveOrders = rows.reduce((s, r) => s + r.active_rentals, 0);
        this.state.totalRentals = rows.reduce((s, r) => s + r.total_rentals, 0);
        this.state.totalRevenue = rows.reduce((s, r) => s + r.total_revenue, 0);
    }

    // ── Event Handlers ───────────────────────────────────────────────
    onSearchInput(ev) {
        this.state.searchQuery = ev.target.value;
        this._applyFilters();
    }

    onFilterStatus(ev) {
        this.state.filterStatus = ev.target.value;
        this._applyFilters();
    }

    onFilterCategory(ev) {
        this.state.filterCategory = ev.target.value;
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

    // ── Formatters ───────────────────────────────────────────────────
    getStatusClass(state) {
        return {
            available: "rtr_badge_success",
            rented: "rtr_badge_danger",
            maintenance: "rtr_badge_warning",
            retired: "rtr_badge_muted",
        }[state] || "";
    }

    getStatusLabel(state) {
        return {
            available: "Available",
            rented: "Rented",
            maintenance: "Maintenance",
            retired: "Retired",
        }[state] || state;
    }

    formatMoney(val) {
        return "$ " + Number(val || 0).toFixed(2);
    }

    formatQty(val) {
        return Number(val || 0).toFixed(0);
    }

    // ── Downloads ────────────────────────────────────────────────────
    async onDownloadExcel() {
        const ids = await this.orm.create("rental.report.download", [{}]);
        const act = await this.orm.call(
            "rental.report.download", "action_download_xlsx", [ids]
        );
        this.action.doAction(act);
    }

    async onDownloadPdf() {
        const ids = await this.orm.create("rental.report.download", [{}]);
        const act = await this.orm.call(
            "rental.report.download", "action_download_pdf", [ids]
        );
        this.action.doAction(act);
    }
}

registry.category("actions").add(
    "rental_tool_report_dashboard", RentalToolReportDashboard
);
