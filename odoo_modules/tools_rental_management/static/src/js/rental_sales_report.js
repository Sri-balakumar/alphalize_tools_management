/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class RentalSalesReport extends Component {
    static template = "tools_rental_management.RentalSalesReport";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.currencySymbol = "";

        this.state = useState({
            orders: [],
            orderLines: [],
            period: "month",          // 'today' | 'week' | 'month' | 'year' | 'all' | 'custom'
            customDateFrom: "",
            customDateTo: "",
            // Top-N filters: 0 means "show all"
            customerLimit: 0,
            toolLimit: 0,
            // Payment method filter: 'all' | 'cash' | 'card' | 'bank' | 'credit'
            paymentMethod: "all",
        });

        this.summary = useState({
            totalRevenue: 0,
            orderCount: 0,
            avgOrderValue: 0,
            totalTax: 0,
            totalDamage: 0,
            totalLate: 0,
            totalDiscount: 0,
            netRevenue: 0,
            topCustomers: [],
            topTools: [],
        });

        onWillStart(() => this.loadData());
    }

    async loadData() {
        try {
            // Currency symbol
            const companies = await this.orm.searchRead(
                "res.company", [], ["currency_id"], { limit: 1 }
            );
            if (companies.length && companies[0].currency_id) {
                const cur = await this.orm.searchRead(
                    "res.currency",
                    [["id", "=", companies[0].currency_id[0]]],
                    ["symbol"], { limit: 1 }
                );
                this.currencySymbol = cur.length ? cur[0].symbol : "$";
            }

            // Only completed rentals count toward sales
            const orders = await this.orm.searchRead(
                "rental.order",
                [["state", "in", ["checked_in", "invoiced"]]],
                [
                    "name", "partner_id", "date_order",
                    "date_checkout", "date_checkin", "state",
                    "subtotal", "tax_total", "late_fee",
                    "damage_charges", "discount_amount", "total_amount",
                    "payment_method", "checkin_payment_method",
                ],
                { order: "date_checkin desc" }
            );
            this.state.orders = orders;

            // Load order lines for top-tools aggregation (one shot)
            const orderIds = orders.map((o) => o.id);
            if (orderIds.length) {
                this.state.orderLines = await this.orm.searchRead(
                    "rental.order.line",
                    [["order_id", "in", orderIds]],
                    ["order_id", "tool_id", "quantity", "total_cost"]
                );
            } else {
                this.state.orderLines = [];
            }

            this._computeSummary();
        } catch (e) {
            console.error("Sales Report loadData error:", e);
            this.state.orders = [];
            this.state.orderLines = [];
            this._computeSummary();
        }
    }

    // ────────── Period filter helpers ──────────
    _periodBounds() {
        // Returns [fromDate, toDate] as ISO date strings (or null = unbounded).
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        switch (this.state.period) {
            case "today":
                return [startOfDay, endOfDay];
            case "week": {
                const day = now.getDay() || 7; // Mon=1..Sun=7
                const monday = new Date(startOfDay);
                monday.setDate(monday.getDate() - (day - 1));
                return [monday, endOfDay];
            }
            case "month": {
                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                return [start, endOfDay];
            }
            case "year": {
                const start = new Date(now.getFullYear(), 0, 1);
                return [start, endOfDay];
            }
            case "custom": {
                const from = this.state.customDateFrom ? new Date(this.state.customDateFrom) : null;
                const to = this.state.customDateTo ? new Date(this.state.customDateTo + "T23:59:59") : null;
                return [from, to];
            }
            case "all":
            default:
                return [null, null];
        }
    }

    _orderDate(o) {
        // Prefer actual check-in date; fall back to order date.
        const raw = o.date_checkin || o.date_order;
        if (!raw) return null;
        return new Date(raw);
    }

    _orderPaymentMethod(o) {
        // Prefer the check-in (final settlement) method, fall back to checkout method.
        return o.checkin_payment_method || o.payment_method || "";
    }

    get filteredOrders() {
        const [from, to] = this._periodBounds();
        const pm = this.state.paymentMethod;
        return this.state.orders.filter((o) => {
            // Period filter
            if (from || to) {
                const d = this._orderDate(o);
                if (!d) return false;
                if (from && d < from) return false;
                if (to && d > to) return false;
            }
            // Payment method filter
            if (pm && pm !== "all") {
                if (this._orderPaymentMethod(o) !== pm) return false;
            }
            return true;
        });
    }

    get periodLabel() {
        const map = {
            today: "Today",
            week: "This Week",
            month: "This Month",
            year: "This Year",
            all: "All Time",
            custom: "Custom Range",
        };
        const p = map[this.state.period] || "";
        if (this.state.paymentMethod && this.state.paymentMethod !== "all") {
            return p + " · " + this.paymentMethodLabel;
        }
        return p;
    }

    // ────────── Aggregation ──────────
    _computeSummary() {
        const orders = this.filteredOrders;
        const filteredIds = new Set(orders.map((o) => o.id));

        let totalRevenue = 0, totalTax = 0, totalDamage = 0;
        let totalLate = 0, totalDiscount = 0;
        const customerAgg = {}; // { partnerId: { name, count, revenue } }

        for (const o of orders) {
            totalRevenue += o.total_amount || 0;
            totalTax += o.tax_total || 0;
            totalDamage += o.damage_charges || 0;
            totalLate += o.late_fee || 0;
            totalDiscount += o.discount_amount || 0;

            if (o.partner_id) {
                const pid = o.partner_id[0];
                const pname = o.partner_id[1] || "Unknown";
                if (!customerAgg[pid]) {
                    customerAgg[pid] = { id: pid, name: pname, count: 0, revenue: 0 };
                }
                customerAgg[pid].count += 1;
                customerAgg[pid].revenue += o.total_amount || 0;
            }
        }

        // All customers sorted by revenue desc (no slice)
        const topCustomers = Object.values(customerAgg)
            .sort((a, b) => b.revenue - a.revenue);

        // Top tools — aggregate from order lines belonging to filtered orders
        const toolAgg = {}; // { toolName: { name, qty, revenue } }
        for (const line of this.state.orderLines) {
            const oid = line.order_id ? line.order_id[0] : null;
            if (!oid || !filteredIds.has(oid)) continue;
            const tname = line.tool_id ? line.tool_id[1] : "Unknown Tool";
            if (!toolAgg[tname]) {
                toolAgg[tname] = { name: tname, qty: 0, revenue: 0 };
            }
            toolAgg[tname].qty += line.quantity || 0;
            toolAgg[tname].revenue += line.total_cost || 0;
        }
        const topTools = Object.values(toolAgg)
            .sort((a, b) => b.revenue - a.revenue);

        this.summary.totalRevenue = totalRevenue;
        this.summary.orderCount = orders.length;
        this.summary.avgOrderValue = orders.length ? totalRevenue / orders.length : 0;
        this.summary.totalTax = totalTax;
        this.summary.totalDamage = totalDamage;
        this.summary.totalLate = totalLate;
        this.summary.totalDiscount = totalDiscount;
        this.summary.netRevenue = totalRevenue - totalDiscount;
        this.summary.topCustomers = topCustomers;
        this.summary.topTools = topTools;
    }

    // ────────── Event handlers ──────────
    onPeriodChange(period) {
        this.state.period = period;
        if (period !== "custom") {
            this.state.customDateFrom = "";
            this.state.customDateTo = "";
        }
        this._computeSummary();
    }

    onPaymentMethodChange(method) {
        this.state.paymentMethod = method;
        this._computeSummary();
    }

    isActivePayment(method) {
        return this.state.paymentMethod === method;
    }

    paymentPillStyle(method) {
        const active = this.isActivePayment(method);
        return active
            ? "background:#4A2F44;color:#fff;border:1px solid #4A2F44;"
              + "padding:6px 14px;border-radius:20px;font-weight:600;cursor:pointer;"
            : "background:#fff;color:#555;border:1px solid #ddd;"
              + "padding:6px 14px;border-radius:20px;font-weight:500;cursor:pointer;";
    }

    get paymentMethodLabel() {
        const map = { all: "All Payments", cash: "Cash", card: "Card", bank: "Bank", credit: "Credit" };
        return map[this.state.paymentMethod] || "All Payments";
    }

    onCustomDateFrom(ev) {
        this.state.customDateFrom = ev.target.value;
        this.state.period = "custom";
        this._computeSummary();
    }

    onCustomDateTo(ev) {
        this.state.customDateTo = ev.target.value;
        this.state.period = "custom";
        this._computeSummary();
    }

    onCustomerLimitChange(ev) {
        this.state.customerLimit = parseInt(ev.target.value, 10) || 0;
    }

    onToolLimitChange(ev) {
        this.state.toolLimit = parseInt(ev.target.value, 10) || 0;
    }

    get displayCustomers() {
        const list = this.summary.topCustomers;
        return this.state.customerLimit > 0 ? list.slice(0, this.state.customerLimit) : list;
    }

    get displayTools() {
        const list = this.summary.topTools;
        return this.state.toolLimit > 0 ? list.slice(0, this.state.toolLimit) : list;
    }

    isActivePeriod(period) {
        return this.state.period === period;
    }

    pillStyle(period) {
        const active = this.isActivePeriod(period);
        return active
            ? "background:#714B67;color:#fff;border:1px solid #714B67;"
              + "padding:6px 14px;border-radius:20px;font-weight:600;cursor:pointer;"
            : "background:#fff;color:#555;border:1px solid #ddd;"
              + "padding:6px 14px;border-radius:20px;font-weight:500;cursor:pointer;";
    }

    formatMoney(val) {
        return (this.currencySymbol || "$") + " " + (val || 0).toFixed(2);
    }

    formatNumber(val) {
        return Number(val || 0).toFixed(0);
    }

    // ────────── Download helpers ──────────
    _escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    _todayStamp() {
        const d = new Date();
        return d.getFullYear() + "-"
            + String(d.getMonth() + 1).padStart(2, "0") + "-"
            + String(d.getDate()).padStart(2, "0");
    }

    _triggerDownload(filename, mimeType, content) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    _buildExcelHtml(title, sections) {
        // sections: [{ name, headers: [...], rows: [[...], ...] }]
        // Excel ignores HTML border attributes — must use inline CSS so cells
        // get visible grid lines on import. We also use <col width=…> so the
        // Excel columns get a sensible width on open.
        const widthsByHeaderCount = {
            2: [220, 200],
            4: [80, 280, 130, 160],
        };
        let body = "<h2 style='font-family:Arial,sans-serif;color:#714B67;margin:0 0 4px 0;'>"
                 + this._escHtml(title) + "</h2>"
                 + "<p style='font-family:Arial,sans-serif;font-size:12px;color:#666;margin:0 0 14px 0;'>"
                 + "Period: <b>" + this._escHtml(this.periodLabel) + "</b>"
                 + " &nbsp;&middot;&nbsp; Generated: " + this._escHtml(new Date().toLocaleString())
                 + "</p>";
        for (const sec of sections) {
            body += "<h3 style='font-family:Arial,sans-serif;color:#333;margin:14px 0 4px 0;'>"
                  + this._escHtml(sec.name) + "</h3>";
            const widths = widthsByHeaderCount[sec.headers.length] || sec.headers.map(() => 140);
            body += "<table style='border-collapse:collapse;font-family:Arial,sans-serif;"
                  + "font-size:12px;table-layout:fixed;'>";
            // <col> elements give Excel proper column widths on import
            for (const w of widths) {
                body += "<col style='width:" + w + "px;mso-width-source:userset;"
                      + "mso-width-alt:" + (w * 36) + ";' width='" + w + "'/>";
            }
            body += "<thead><tr>";
            for (let i = 0; i < sec.headers.length; i++) {
                body += "<th style='border:1px solid #555;background:#714B67;color:#ffffff;"
                      + "padding:8px 12px;text-align:left;font-weight:700;width:" + widths[i] + "px;'>"
                      + this._escHtml(sec.headers[i]) + "</th>";
            }
            body += "</tr></thead><tbody>";
            for (const row of sec.rows) {
                body += "<tr>";
                for (let i = 0; i < row.length; i++) {
                    body += "<td style='border:1px solid #999;padding:6px 12px;width:"
                          + widths[i] + "px;'>"
                          + this._escHtml(row[i]) + "</td>";
                }
                body += "</tr>";
            }
            body += "</tbody></table><br/>";
        }
        // Office namespaces + ExcelWorkbook XML hint Excel to honour col widths
        return "<html xmlns:o='urn:schemas-microsoft-com:office:office' "
             + "xmlns:x='urn:schemas-microsoft-com:office:excel' "
             + "xmlns='http://www.w3.org/TR/REC-html40'>"
             + "<head><meta charset='UTF-8'/>"
             + "<!--[if gte mso 9]><xml>"
             + "<x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>"
             + "<x:Name>Sales Report</x:Name>"
             + "<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>"
             + "</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>"
             + "</xml><![endif]-->"
             + "<title>" + this._escHtml(title) + "</title></head><body>"
             + body + "</body></html>";
    }

    _buildPdfHtml(title, sections) {
        // sections: [{ name, headers, rows }]   OR   { kpis: [{label, value}] } in addition
        let body = "<h2 style='color:#714B67;margin-bottom:4px;'>" + this._escHtml(title) + "</h2>"
                 + "<div style='color:#666;font-size:12px;margin-bottom:14px;'>Period: <b>"
                 + this._escHtml(this.periodLabel) + "</b> &nbsp;·&nbsp; Generated: "
                 + this._escHtml(new Date().toLocaleString()) + "</div>";
        for (const sec of sections) {
            if (sec.kpis) {
                body += "<h3 style='color:#333;margin-top:14px;'>" + this._escHtml(sec.name) + "</h3>";
                body += "<table style='width:100%;border-collapse:collapse;margin-bottom:10px;'><tbody>";
                for (let i = 0; i < sec.kpis.length; i += 2) {
                    body += "<tr>";
                    for (let j = 0; j < 2; j++) {
                        const k = sec.kpis[i + j];
                        if (k) {
                            body += "<td style='border:1px solid #ddd;padding:8px;width:50%;'>"
                                  + "<div style='color:#888;font-size:11px;text-transform:uppercase;'>"
                                  + this._escHtml(k.label) + "</div>"
                                  + "<div style='font-size:18px;font-weight:700;color:#333;'>"
                                  + this._escHtml(k.value) + "</div></td>";
                        } else {
                            body += "<td></td>";
                        }
                    }
                    body += "</tr>";
                }
                body += "</tbody></table>";
                continue;
            }
            body += "<h3 style='color:#333;margin-top:14px;'>" + this._escHtml(sec.name) + "</h3>";
            body += "<table style='width:100%;border-collapse:collapse;font-size:12px;'><thead>"
                  + "<tr style='background:#714B67;color:#fff;'>";
            for (const h of sec.headers) {
                body += "<th style='padding:6px 8px;text-align:left;border:1px solid #ddd;'>"
                      + this._escHtml(h) + "</th>";
            }
            body += "</tr></thead><tbody>";
            for (const row of sec.rows) {
                body += "<tr>";
                for (const cell of row) {
                    body += "<td style='padding:5px 8px;border:1px solid #ddd;'>"
                          + this._escHtml(cell) + "</td>";
                }
                body += "</tr>";
            }
            body += "</tbody></table>";
        }
        return "<html><head><meta charset='UTF-8'/><title>" + this._escHtml(title) + "</title>"
             + "<style>body{font-family:Arial,sans-serif;padding:24px;color:#222;}"
             + "h2,h3{margin:0;}</style></head><body>"
             + body
             + "</body></html>";
    }

    async _downloadXlsxFromSections(filename, title, sections) {
        try {
            // Server-side build via xlsxwriter for a real .xlsx file (no warnings).
            const ctx = { period_label: this.periodLabel };
            const b64 = await this.orm.call(
                "rental.order",
                "render_sales_report_xlsx",
                [title, sections],
                { context: ctx }
            );
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            console.error("Excel download failed:", e);
            alert("Failed to generate Excel: " + (e.message || e));
        }
    }

    async _downloadPdfFromHtml(filename, html) {
        try {
            // Server-side render via Odoo's bundled wkhtmltopdf.
            const b64 = await this.orm.call("rental.order", "render_html_to_pdf", [html]);
            // base64 → Uint8Array (binary-safe)
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            console.error("PDF download failed:", e);
            alert("Failed to generate PDF: " + (e.message || e));
        }
    }

    _customerSection() {
        return {
            name: "Customers Ranked",
            headers: ["Rank", "Customer", "Orders", "Revenue"],
            rows: this.displayCustomers.map((c, i) => [
                i + 1,
                c.name,
                c.count,
                this.formatMoney(c.revenue),
            ]),
        };
    }

    _toolSection() {
        return {
            name: "Tools Ranked",
            headers: ["Rank", "Tool", "Times Rented", "Revenue"],
            rows: this.displayTools.map((t, i) => [
                i + 1,
                t.name,
                this.formatNumber(t.qty),
                this.formatMoney(t.revenue),
            ]),
        };
    }

    _kpiSection() {
        return {
            name: "Summary",
            kpis: [
                { label: "Total Revenue",   value: this.formatMoney(this.summary.totalRevenue) },
                { label: "Total Orders",    value: this.formatNumber(this.summary.orderCount) },
                { label: "Avg Order Value", value: this.formatMoney(this.summary.avgOrderValue) },
                { label: "Tax Collected",   value: this.formatMoney(this.summary.totalTax) },
                { label: "Damage Charges",  value: this.formatMoney(this.summary.totalDamage) },
                { label: "Late Fees",       value: this.formatMoney(this.summary.totalLate) },
                { label: "Discounts Given", value: this.formatMoney(this.summary.totalDiscount) },
                { label: "Net Revenue",     value: this.formatMoney(this.summary.netRevenue) },
            ],
        };
    }

    // ────────── Download button handlers ──────────
    async downloadCustomersExcel() {
        await this._downloadXlsxFromSections(
            "customers_ranked_" + this._todayStamp() + ".xlsx",
            "Sales Report — Customers Ranked",
            [this._customerSection()]
        );
    }

    async downloadCustomersPdf() {
        const html = this._buildPdfHtml("Sales Report — Customers Ranked", [this._customerSection()]);
        await this._downloadPdfFromHtml("customers_ranked_" + this._todayStamp() + ".pdf", html);
    }

    async downloadToolsExcel() {
        await this._downloadXlsxFromSections(
            "tools_ranked_" + this._todayStamp() + ".xlsx",
            "Sales Report — Tools Ranked",
            [this._toolSection()]
        );
    }

    async downloadToolsPdf() {
        const html = this._buildPdfHtml("Sales Report — Tools Ranked", [this._toolSection()]);
        await this._downloadPdfFromHtml("tools_ranked_" + this._todayStamp() + ".pdf", html);
    }

    async downloadFullExcel() {
        const summarySection = {
            name: "Summary",
            headers: ["Metric", "Value"],
            rows: this._kpiSection().kpis.map((k) => [k.label, k.value]),
        };
        await this._downloadXlsxFromSections(
            "sales_report_" + this._todayStamp() + ".xlsx",
            "Sales Report",
            [summarySection, this._customerSection(), this._toolSection()]
        );
    }

    async downloadFullPdf() {
        const html = this._buildPdfHtml("Sales Report", [
            this._kpiSection(),
            this._customerSection(),
            this._toolSection(),
        ]);
        await this._downloadPdfFromHtml("sales_report_" + this._todayStamp() + ".pdf", html);
    }
}

registry.category("actions").add("rental_sales_report_dashboard", RentalSalesReport);
