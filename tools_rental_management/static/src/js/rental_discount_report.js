/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class RentalDiscountReport extends Component {
    static template = "tools_rental_management.RentalDiscountReport";

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
            // Image popup
            popupVisible: false,
            popupSrc: "",
            popupIsSignature: false,
        });

        this.summaryCards = useState({
            totalDiscounted: 0,
            totalDiscount: 0,
            totalRevenue: 0,
            avgDiscount: 0,
        });

        onWillStart(() => this.loadData());
    }

    async loadData() {
        // Fetch company currency symbol
        const companies = await this.orm.searchRead("res.company", [], ["currency_id"], { limit: 1 });
        if (companies.length && companies[0].currency_id) {
            const currencies = await this.orm.searchRead("res.currency", [["id", "=", companies[0].currency_id[0]]], ["symbol"], { limit: 1 });
            this.currencySymbol = currencies.length ? currencies[0].symbol : "$";
        }

        const orders = await this.orm.searchRead(
            "rental.order",
            [["discount_amount", ">", 0]],
            [
                "name", "customer_code", "partner_id", "partner_phone",
                "partner_email", "date_order", "date_checkout", "date_checkin",
                "rental_period_type", "rental_duration",
                "state", "subtotal", "late_fee", "damage_charges",
                "discount_amount", "total_amount", "user_id",
                "discount_authorized_by", "discount_auth_photo",
                "discount_auth_signature",
            ],
            { order: "id desc" }
        );
        this.state.orders = orders;
        this._computeSummary();
    }

    _computeSummary() {
        const orders = this.filteredOrders;
        this.summaryCards.totalDiscounted = orders.length;
        this.summaryCards.totalDiscount = orders.reduce(
            (s, o) => s + (o.discount_amount || 0), 0
        );
        this.summaryCards.totalRevenue = orders.reduce(
            (s, o) => s + (o.total_amount || 0), 0
        );
        this.summaryCards.avgDiscount = orders.length
            ? this.summaryCards.totalDiscount / orders.length
            : 0;
    }

    get filteredOrders() {
        let list = this.state.orders;
        const q = (this.state.searchQuery || "").toLowerCase().trim();
        if (q) {
            list = list.filter((o) =>
                (o.customer_code || "").toLowerCase().includes(q) ||
                (o.name || "").toLowerCase().includes(q) ||
                (o.partner_id && o.partner_id[1] || "").toLowerCase().includes(q) ||
                (o.discount_authorized_by || "").toLowerCase().includes(q) ||
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
            this.state.expandedOrder = null;
            return;
        }
        const lines = await this.orm.searchRead(
            "rental.order.line",
            [["order_id", "=", orderId]],
            [
                "product_id", "serial_number", "unit_price", "planned_duration",
                "rental_cost", "late_fee_amount", "damage_charge",
                "discount_type", "discount_value", "discount_line_amount",
                "total_cost",
            ]
        );
        const order = this.state.orders.find((o) => o.id === orderId);
        this.state.expandedId = orderId;
        this.state.expandedLines = lines;
        this.state.expandedOrder = order;
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

    getDiscountTypeLabel(dtype) {
        if (dtype === "percentage") return "Percentage";
        if (dtype === "fixed") return "Fixed";
        return "-";
    }

    formatDiscountValue(line) {
        if (!line.discount_type || !line.discount_value) return "-";
        if (line.discount_type === "percentage") {
            return line.discount_value.toFixed(1) + "%";
        }
        return this.formatMoney(line.discount_value);
    }

    formatDate(d) {
        return d || "-";
    }

    formatDuration(val) {
        const n = Math.round(val || 0);
        return n + " Days";
    }

    getImageSrc(base64) {
        if (!base64) return "";
        return "data:image/png;base64," + base64;
    }

    onImageClick(ev, base64, isSignature) {
        ev.stopPropagation();
        ev.preventDefault();
        if (!base64) return;
        this.state.popupSrc = "data:image/png;base64," + base64;
        this.state.popupIsSignature = !!isSignature;
        this.state.popupVisible = true;
    }

    onClosePopup(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        this.state.popupVisible = false;
        this.state.popupSrc = "";
    }

    onOverlayClick(ev) {
        if (ev.target === ev.currentTarget) {
            this.state.popupVisible = false;
            this.state.popupSrc = "";
        }
    }

    get popupOverlayStyle() {
        const bg = this.state.popupIsSignature
            ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.88)";
        return "position:fixed;top:0;left:0;width:100vw;height:100vh;"
             + "background:" + bg + ";z-index:10000;"
             + "display:flex;align-items:center;justify-content:center;cursor:pointer;";
    }

    get popupCloseBtnColor() {
        return this.state.popupIsSignature ? "#333" : "#fff";
    }
}

registry.category("actions").add("rental_discount_report_dashboard", RentalDiscountReport);
