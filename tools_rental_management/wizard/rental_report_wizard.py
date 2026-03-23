import io
import base64
from odoo import models, fields, _

try:
    import xlsxwriter
except ImportError:
    xlsxwriter = None


class RentalReportDownload(models.TransientModel):
    _name = 'rental.report.download'
    _description = 'Download Tool Availability Report'

    file_data = fields.Binary('Report File', readonly=True)
    file_name = fields.Char('File Name')

    def action_download_xlsx(self):
        """Generate and download Excel report."""
        if not xlsxwriter:
            raise Exception(_('xlsxwriter library is required for Excel export.'))

        records = self.env['rental.tool.report'].search([], order='name')

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        sheet = workbook.add_worksheet('Tool Availability')

        # ── Styles ────────────────────────────────────────────────────
        title_fmt = workbook.add_format({
            'bold': True, 'font_size': 16, 'align': 'center',
            'valign': 'vcenter', 'font_color': '#714B67',
        })
        header_fmt = workbook.add_format({
            'bold': True, 'font_size': 11, 'align': 'center',
            'valign': 'vcenter', 'bg_color': '#714B67',
            'font_color': '#FFFFFF', 'border': 1,
        })
        text_fmt = workbook.add_format({
            'font_size': 10, 'align': 'left', 'valign': 'vcenter',
            'border': 1,
        })
        num_fmt = workbook.add_format({
            'font_size': 10, 'align': 'center', 'valign': 'vcenter',
            'border': 1, 'num_format': '#,##0.00',
        })
        int_fmt = workbook.add_format({
            'font_size': 10, 'align': 'center', 'valign': 'vcenter',
            'border': 1, 'num_format': '#,##0',
        })
        currency_symbol = self.env.company.currency_id.symbol or '$'
        money_fmt = workbook.add_format({
            'font_size': 10, 'align': 'right', 'valign': 'vcenter',
            'border': 1, 'num_format': f'"{currency_symbol}"#,##0.00',
        })
        status_fmt = workbook.add_format({
            'font_size': 10, 'align': 'center', 'valign': 'vcenter',
            'border': 1, 'bold': True,
        })
        total_label_fmt = workbook.add_format({
            'bold': True, 'font_size': 11, 'align': 'right',
            'valign': 'vcenter', 'border': 1, 'bg_color': '#F2F2F2',
        })
        total_num_fmt = workbook.add_format({
            'bold': True, 'font_size': 11, 'align': 'center',
            'valign': 'vcenter', 'border': 1, 'bg_color': '#F2F2F2',
            'num_format': '#,##0.00',
        })
        total_money_fmt = workbook.add_format({
            'bold': True, 'font_size': 11, 'align': 'right',
            'valign': 'vcenter', 'border': 1, 'bg_color': '#F2F2F2',
            'num_format': f'"{currency_symbol}"#,##0.00',
        })
        total_int_fmt = workbook.add_format({
            'bold': True, 'font_size': 11, 'align': 'center',
            'valign': 'vcenter', 'border': 1, 'bg_color': '#F2F2F2',
            'num_format': '#,##0',
        })

        # ── Title ─────────────────────────────────────────────────────
        sheet.merge_range('A1:K1', 'Tool Availability Report', title_fmt)
        sheet.merge_range(
            'A2:K2',
            f'Generated on: {fields.Date.today()}',
            workbook.add_format({
                'align': 'center', 'font_size': 10,
                'font_color': '#888888',
            }),
        )

        # ── Column widths ─────────────────────────────────────────────
        widths = [5, 28, 18, 14, 12, 14, 14, 14, 14, 14, 16]
        for i, w in enumerate(widths):
            sheet.set_column(i, i, w)

        # ── Headers ───────────────────────────────────────────────────
        headers = [
            '#', 'Tool Name', 'Category', 'Status',
            'Total Qty', 'Available', 'Checked Out',
            'Active Orders', 'Total Rentals',
            'Price / Day', 'Late Fee / Day',
        ]
        row = 3
        for col, h in enumerate(headers):
            sheet.write(row, col, h, header_fmt)

        # ── Data rows ─────────────────────────────────────────────────
        row = 4
        sum_total = sum_avail = sum_co = 0.0
        sum_active = sum_rentals = 0
        state_labels = dict(records._fields['state'].selection)

        for idx, rec in enumerate(records, 1):
            sheet.write(row, 0, idx, int_fmt)
            sheet.write(row, 1, rec.name or '', text_fmt)
            sheet.write(row, 2, rec.category_id.name or '', text_fmt)
            sheet.write(row, 3, state_labels.get(rec.state, ''), status_fmt)
            sheet.write(row, 4, rec.total_qty, num_fmt)
            sheet.write(row, 5, rec.available_qty, num_fmt)
            sheet.write(row, 6, rec.checked_out_qty, num_fmt)
            sheet.write(row, 7, rec.active_rentals, int_fmt)
            sheet.write(row, 8, rec.total_rentals, int_fmt)
            sheet.write(row, 9, rec.price_per_day, money_fmt)
            sheet.write(row, 10, rec.late_fee_per_day, money_fmt)

            sum_total += rec.total_qty
            sum_avail += rec.available_qty
            sum_co += rec.checked_out_qty
            sum_active += rec.active_rentals
            sum_rentals += rec.total_rentals
            row += 1

        # ── Totals row ────────────────────────────────────────────────
        sheet.merge_range(row, 0, row, 3, 'TOTAL', total_label_fmt)
        sheet.write(row, 4, sum_total, total_num_fmt)
        sheet.write(row, 5, sum_avail, total_num_fmt)
        sheet.write(row, 6, sum_co, total_num_fmt)
        sheet.write(row, 7, sum_active, total_int_fmt)
        sheet.write(row, 8, sum_rentals, total_int_fmt)
        sheet.write(row, 9, '', total_money_fmt)
        sheet.write(row, 10, '', total_money_fmt)

        workbook.close()

        self.write({
            'file_data': base64.b64encode(output.getvalue()),
            'file_name': 'tool_availability_report.xlsx',
        })

        return {
            'type': 'ir.actions.act_url',
            'url': (
                f'/web/content?model=rental.report.download'
                f'&id={self.id}&field=file_data'
                f'&filename_field=file_name&download=true'
            ),
            'target': 'self',
        }

    def action_download_pdf(self):
        """Generate and download PDF report."""
        records = self.env['rental.tool.report'].search([], order='name')
        return (
            self.env.ref(
                'tools_rental_management.action_report_tool_availability_pdf'
            ).report_action(records)
        )
