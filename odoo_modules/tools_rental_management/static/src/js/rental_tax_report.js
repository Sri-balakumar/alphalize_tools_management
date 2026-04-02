/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class RentalTaxReport extends Component {
    static template = "tools_rental_management.RentalTaxReport";

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
        });

        this.summaryCards = useState({
            totalTaxedOrders: 0,
            totalTax: 0,
            totalRevenue: 0,
            avgTax: 0,
        });

        onWillStart(() => this.loadData());
    }

    async loadData() {
        try {
            const companies = await this.orm.searchRead("res.company", [], ["currency_id"], { limit: 1 });
            if (companies.length && companies[0].currency_id) {
                const currencies = await this.orm.searchRead("res.currency", [["id", "=", companies[0].currency_id[0]]], ["symbol"], { limit: 1 });
                this.currencySymbol = currencies.length ? currencies[0].symbol : "$";
            }

            const orders = await this.orm.searchRead(
                "rental.order",
                [["tax_total", ">", 0]],
                [
                    "name", "customer_code", "partner_id", "partner_phone",
                    "partner_email", "date_order", "date_checkout", "date_checkin",
                    "rental_period_type", "rental_duration",
                    "state", "subtotal", "tax_total", "total_amount", "user_id",
                ],
                { order: "id desc" }
            );
            this.state.orders = orders;
            this._computeSummary();
        } catch (e) {
            console.error("Tax Report loadData error:", e);
            this.state.orders = [];
            this._computeSummary();
        }
    }

    _computeSummary() {
        const orders = this.filteredOrders;
        this.summaryCards.totalTaxedOrders = orders.length;
        this.summaryCards.totalTax = orders.reduce((s, o) => s + (o.tax_total || 0), 0);
        this.summaryCards.totalRevenue = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
        this.summaryCards.avgTax = orders.length ? this.summaryCards.totalTax / orders.length : 0;
    }

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

    async onToggleDetail(orderId) {
        if (this.state.expandedId === orderId) {
            this.state.expandedId = null;
            this.state.expandedLines = [];
            return;
        }
        const lines = await this.orm.searchRead(
            "rental.order.line",
            [["order_id", "=", orderId]],
            [
                "product_id", "serial_number", "unit_price", "planned_duration",
                "rental_cost", "tax_percentage", "tax_amount", "price_before_tax",
                "total_cost",
            ]
        );
        this.state.expandedId = orderId;
        this.state.expandedLines = lines;
    }

    onOpenOrder(orderId) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "rental.order",
            res_id: orderId,
            views: [[false, "form"]],
            target: "current",
        });
    }

    formatMoney(val) {
        return (this.currencySymbol || "$") + " " + (val || 0).toFixed(2);
    }

    getStatusLabel(state) {
        const map = {
            draft: "Draft", confirmed: "Confirmed",
            checked_out: "Checked Out", checked_in: "Checked In",
            invoiced: "Invoiced", cancelled: "Cancelled",
        };
        return map[state] || state;
    }

    getStatusClass(state) {
        const map = {
            draft: "secondary", confirmed: "info",
            checked_out: "warning", checked_in: "primary",
            invoiced: "success", cancelled: "danger",
        };
        return "badge rounded-pill bg-" + (map[state] || "secondary");
    }

    formatDate(d) {
        return d || "-";
    }
}

registry.category("actions").add("rental_tax_report_dashboard", RentalTaxReport);
