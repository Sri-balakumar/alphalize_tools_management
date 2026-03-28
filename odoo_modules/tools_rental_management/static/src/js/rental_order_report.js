/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

/**
 * RentalOrderReport – a client-action dashboard that lists every rental order
 * with its Customer ID.  Clicking a Customer ID expands a detail panel showing
 * the full order information (tools, financials, dates, conditions).
 */
export class RentalOrderReport extends Component {
    static template = "tools_rental_management.RentalOrderReport";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.currencySymbol = "";

        this.state = useState({
            orders: [],
            searchQuery: "",
            filterStatus: "all",
            expandedId: null,
            expandedLines: [],
            expandedOrder: null,
        });

        this.summaryCards = useState({
            totalOrders: 0,
            activeRentals: 0,
            totalRevenue: 0,
            lateReturns: 0,
        });

        onWillStart(() => this.loadData());
    }

    /* ── Data loading ─────────────────────────────────────── */

    async loadData() {
        // Fetch company currency symbol
        const companies = await this.orm.searchRead("res.company", [], ["currency_id"], { limit: 1 });
        if (companies.length && companies[0].currency_id) {
            const currencies = await this.orm.searchRead("res.currency", [["id", "=", companies[0].currency_id[0]]], ["symbol"], { limit: 1 });
            this.currencySymbol = currencies.length ? currencies[0].symbol : "$";
        }

        const orders = await this.orm.searchRead(
            "rental.order", [],
            [
                "name", "customer_code", "partner_id", "partner_phone",
                "partner_email", "date_order", "date_checkout", "date_checkin",
                "date_planned_checkin", "rental_period_type", "rental_duration",
                "actual_duration_display", "state", "subtotal", "late_fee",
                "damage_charges", "discount_amount", "total_amount",
                "advance_amount", "advance_returned", "is_late", "user_id",
            ],
            { order: "id desc" }
        );
        this.state.orders = orders;
        this._computeSummary();
    }

    _computeSummary() {
        const orders = this.filteredOrders;
        this.summaryCards.totalOrders = orders.length;
        this.summaryCards.activeRentals = orders.filter(
            (o) => o.state === "checked_out"
        ).length;
        this.summaryCards.totalRevenue = orders.reduce(
            (s, o) => s + (o.total_amount || 0), 0
        );
        this.summaryCards.lateReturns = orders.filter((o) => o.is_late).length;
    }

    /* ── Filtering ────────────────────────────────────────── */

    get filteredOrders() {
        let list = this.state.orders;
        const q = (this.state.searchQuery || "").toLowerCase().trim();
        if (q) {
            list = list.filter((o) =>
                (o.customer_code || "").toLowerCase().includes(q) ||
                (o.name || "").toLowerCase().includes(q) ||
                (o.partner_id && o.partner_id[1] || "").toLowerCase().includes(q) ||
                (o.partner_phone || "").toLowerCase().includes(q)
            );
        }
        if (this.state.filterStatus !== "all") {
            list = list.filter((o) => o.state === this.state.filterStatus);
        }
        return list;
    }

    onSearchInput(ev) {
        this.state.searchQuery = ev.target.value;
        this._computeSummary();
    }

    onFilterStatus(ev) {
        this.state.filterStatus = ev.target.value;
        this._computeSummary();
    }

    /* ── Expand / Collapse detail ─────────────────────────── */

    async onToggleDetail(orderId) {
        if (this.state.expandedId === orderId) {
            this.state.expandedId = null;
            this.state.expandedLines = [];
            this.state.expandedOrder = null;
            return;
        }
        // Load order lines for this order
        const lines = await this.orm.searchRead(
            "rental.order.line",
            [["order_id", "=", orderId]],
            [
                "product_id", "tool_id", "serial_number", "unit_price", "planned_duration",
                "rental_cost", "checkout_condition", "checkin_condition",
                "late_fee_amount", "damage_charge", "damage_note",
            ]
        );
        const order = this.state.orders.find((o) => o.id === orderId);
        this.state.expandedId = orderId;
        this.state.expandedLines = lines;
        this.state.expandedOrder = order;
    }

    /* ── Navigate to order form ───────────────────────────── */

    onOpenOrder(orderId) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "rental.order",
            res_id: orderId,
            views: [[false, "form"]],
            target: "current",
        });
    }

    /* ── Helpers ───────────────────────────────────────────── */

    formatMoney(val) {
        return (this.currencySymbol || "$") + " " + (val || 0).toFixed(2);
    }

    getStatusLabel(state) {
        const map = {
            draft: "Draft",
            confirmed: "Confirmed",
            checked_out: "Checked Out",
            checked_in: "Checked In",
            invoiced: "Invoiced",
            cancelled: "Cancelled",
        };
        return map[state] || state;
    }

    getStatusClass(state) {
        const map = {
            draft: "secondary",
            confirmed: "info",
            checked_out: "warning",
            checked_in: "primary",
            invoiced: "success",
            cancelled: "danger",
        };
        return "badge rounded-pill bg-" + (map[state] || "secondary");
    }

    getConditionClass(cond) {
        if (!cond) return "";
        const map = {
            excellent: "text-success fw-bold",
            good: "text-success",
            fair: "text-warning",
            poor: "text-danger",
            damaged: "text-danger fw-bold",
        };
        return map[cond] || "";
    }

    capitalize(str) {
        if (!str) return "-";
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    formatDuration(val) {
        const n = Math.round(val || 0);
        return n + " Days";
    }

    formatDate(d) {
        if (!d) return "-";
        return d;
    }
}

registry.category("actions").add("rental_order_report_dashboard", RentalOrderReport);
