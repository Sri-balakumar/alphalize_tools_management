import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system";
import XLSX from "xlsx";
import { showToastMessage } from "@components/Toast";
import { SafeAreaView, RoundedContainer } from "@components/containers";
import NavigationHeader from "@components/Header/NavigationHeader";
import { COLORS, SPACING, BORDER_RADIUS } from "@constants/theme";
import useToolStore from "@stores/toolManagement/useToolStore";
import useAuthStore from "@stores/auth/useAuthStore";

const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Available", value: "available" },
  { label: "Rented", value: "rented" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Retired", value: "retired" },
];

const STATUS_COLORS = {
  available: "#4CAF50",
  rented: "#FF9800",
  maintenance: "#F44336",
  retired: "#9E9E9E",
};

const STATUS_LABELS = {
  available: "Avail",
  rented: "Rented",
  maintenance: "Maint",
  retired: "Retired",
};

const STATUS_FULL_LABELS = {
  available: "Available",
  rented: "Rented",
  maintenance: "Under Maintenance",
  retired: "Retired",
};

// ── Build HTML for PDF ────────────────────────────────────────────
const buildReportHtml = (data) => {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const sumTotal = data.reduce((s, r) => s + r.total_qty, 0);
  const sumAvail = data.reduce((s, r) => s + r.available_qty, 0);
  const sumOut = data.reduce((s, r) => s + r.checked_out_qty, 0);
  const sumRentals = data.reduce((s, r) => s + r.total_rentals, 0);
  const sumRevenue = data.reduce((s, r) => s + r.total_revenue, 0);

  const rows = data.map((r, i) => {
    const bg = i % 2 === 0 ? "#ffffff" : "#f8f8f8";
    const statusColor = { available: "#28a745", rented: "#dc3545", maintenance: "#ffc107", retired: "#6c757d" }[r.state] || "#888";
    const statusTextColor = r.state === "maintenance" ? "#333" : "#fff";
    return `<tr style="background:${bg};">
      <td style="padding:6px;text-align:center;border:1px solid #ddd;">${i + 1}</td>
      <td style="padding:6px;text-align:left;border:1px solid #ddd;font-weight:bold;">${r.name}</td>
      <td style="padding:6px;text-align:left;border:1px solid #ddd;">${r.category_name || "\u2014"}</td>
      <td style="padding:6px;text-align:center;border:1px solid #ddd;">
        <span style="background:${statusColor};color:${statusTextColor};padding:2px 8px;border-radius:10px;font-size:9px;">
          ${STATUS_FULL_LABELS[r.state] || r.state}
        </span>
      </td>
      <td style="padding:6px;text-align:center;border:1px solid #ddd;">${r.total_qty}</td>
      <td style="padding:6px;text-align:center;border:1px solid #ddd;color:#28a745;font-weight:bold;">${r.available_qty}</td>
      <td style="padding:6px;text-align:center;border:1px solid #ddd;color:#dc3545;font-weight:bold;">${r.checked_out_qty}</td>
      <td style="padding:6px;text-align:center;border:1px solid #ddd;">${r.total_rentals}</td>
      <td style="padding:6px;text-align:right;border:1px solid #ddd;">$ ${r.price_per_day.toFixed(2)}</td>
      <td style="padding:6px;text-align:right;border:1px solid #ddd;">$ ${r.late_fee_per_day.toFixed(2)}</td>
      <td style="padding:6px;text-align:right;border:1px solid #ddd;color:#28a745;font-weight:bold;">$ ${r.total_revenue.toFixed(2)}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; font-size: 10px; }
    h2 { color: #714B67; margin-bottom: 5px; text-align: center; }
    .sub { color: #888; font-size: 11px; text-align: center; margin: 0 0 15px; }
    .summary { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    .summary td { width: 20%; text-align: center; padding: 10px; border: 1px solid #ddd; }
    .summary .num { font-size: 20px; font-weight: bold; }
    .summary .lbl { font-size: 10px; color: #666; margin-top: 2px; }
    table.data { width: 100%; border-collapse: collapse; font-size: 10px; }
    table.data th {
      background: #714B67; color: #fff; padding: 8px 6px;
      border: 1px solid #5a3a52; font-size: 10px;
    }
    .totals td { background: #f2f2f2; font-weight: bold; font-size: 11px; padding: 8px 6px; border: 1px solid #ddd; }
    .footer { margin-top: 18px; text-align: center; font-size: 9px; color: #aaa; }
  </style>
</head>
<body>
  <h2>Tool Availability Report</h2>
  <p class="sub">Generated on: ${today}</p>

  <table class="summary">
    <tr>
      <td style="background:#f8f4f7;">
        <div class="num" style="color:#714B67;">${data.length}</div>
        <div class="lbl">Total Tools</div>
      </td>
      <td style="background:#f0faf0;">
        <div class="num" style="color:#28a745;">${sumAvail}</div>
        <div class="lbl">Available</div>
      </td>
      <td style="background:#fff5f5;">
        <div class="num" style="color:#dc3545;">${sumOut}</div>
        <div class="lbl">Checked Out</div>
      </td>
      <td style="background:#f4f8ff;">
        <div class="num" style="color:#007bff;">${sumRentals}</div>
        <div class="lbl">Total Rentals</div>
      </td>
      <td style="background:#fffbf0;">
        <div class="num" style="color:#fd7e14;">$ ${sumRevenue.toFixed(2)}</div>
        <div class="lbl">Total Revenue</div>
      </td>
    </tr>
  </table>

  <table class="data">
    <thead>
      <tr>
        <th style="text-align:center;">#</th>
        <th style="text-align:left;">Tool Name</th>
        <th style="text-align:left;">Category</th>
        <th style="text-align:center;">Status</th>
        <th style="text-align:center;">Total Qty</th>
        <th style="text-align:center;">Available</th>
        <th style="text-align:center;">Checked Out</th>
        <th style="text-align:center;">Total Rentals</th>
        <th style="text-align:right;">Price / Day</th>
        <th style="text-align:right;">Late Fee / Day</th>
        <th style="text-align:right;">Revenue</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr class="totals">
        <td colspan="4" style="text-align:right;">TOTAL</td>
        <td style="text-align:center;">${sumTotal}</td>
        <td style="text-align:center;color:#28a745;">${sumAvail}</td>
        <td style="text-align:center;color:#dc3545;">${sumOut}</td>
        <td style="text-align:center;">${sumRentals}</td>
        <td style="text-align:right;"></td>
        <td style="text-align:right;"></td>
        <td style="text-align:right;color:#28a745;">$ ${sumRevenue.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">Tools Rental Management</div>
</body>
</html>`;
};

// ── Build Excel workbook ──────────────────────────────────────────
const buildExcelFile = async (data) => {
  const header = [
    "#", "Tool Name", "Category", "Status",
    "Total Qty", "Available", "Checked Out",
    "Total Rentals", "Price / Day", "Late Fee / Day", "Revenue",
  ];
  const rows = data.map((r, i) => [
    i + 1,
    r.name,
    r.category_name || "",
    STATUS_FULL_LABELS[r.state] || r.state,
    r.total_qty,
    r.available_qty,
    r.checked_out_qty,
    r.total_rentals,
    r.price_per_day,
    r.late_fee_per_day,
    r.total_revenue,
  ]);

  const sumTotal = data.reduce((s, r) => s + r.total_qty, 0);
  const sumAvail = data.reduce((s, r) => s + r.available_qty, 0);
  const sumOut = data.reduce((s, r) => s + r.checked_out_qty, 0);
  const sumRentals = data.reduce((s, r) => s + r.total_rentals, 0);
  const sumRevenue = data.reduce((s, r) => s + r.total_revenue, 0);
  rows.push(["", "", "", "TOTAL", sumTotal, sumAvail, sumOut, sumRentals, "", "", sumRevenue]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = [
    { wch: 5 }, { wch: 28 }, { wch: 18 }, { wch: 16 },
    { wch: 10 }, { wch: 10 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tool Availability");

  const wbOut = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  const fileUri = FileSystem.cacheDirectory + "Tool_Availability_Report.xlsx";
  await FileSystem.writeAsStringAsync(fileUri, wbOut, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return fileUri;
};

// Dropdown picker
const DropdownPicker = ({ label, value, options, onSelect }) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View>
      <TouchableOpacity style={dropStyles.trigger} onPress={() => setOpen(true)}>
        <Text style={dropStyles.triggerText} numberOfLines={1}>
          {selected?.label || label}
        </Text>
        <Text style={dropStyles.arrow}>{"\u25BC"}</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={dropStyles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={dropStyles.menu}>
            <Text style={dropStyles.menuTitle}>{label}</Text>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[dropStyles.menuItem, value === opt.value && dropStyles.menuItemActive]}
                onPress={() => { onSelect(opt.value); setOpen(false); }}
              >
                <Text style={[dropStyles.menuItemText, value === opt.value && dropStyles.menuItemTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const dropStyles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 100,
  },
  triggerText: { fontSize: 12, color: "#333", fontWeight: "500", flex: 1 },
  arrow: { fontSize: 8, color: COLORS.gray, marginLeft: 4 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  menu: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 8,
    width: 220,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.gray,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  menuItem: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  menuItemActive: { backgroundColor: COLORS.primaryThemeColor + "15" },
  menuItemText: { fontSize: 14, color: "#333" },
  menuItemTextActive: { color: COLORS.primaryThemeColor, fontWeight: "600" },
});

const ToolAvailabilityScreen = ({ navigation }) => {
  const odooAuth = useAuthStore((s) => s.odooAuth);
  const toolReport = useToolStore((s) => s.toolReport);
  const fetchToolReport = useToolStore((s) => s.fetchToolReport);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [downloading, setDownloading] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (odooAuth) fetchToolReport(odooAuth);
    }, [odooAuth])
  );

  const summary = useMemo(() => {
    const totalTools = toolReport.length;
    const available = toolReport.reduce((s, r) => s + r.available_qty, 0);
    const checkedOut = toolReport.reduce((s, r) => s + r.checked_out_qty, 0);
    const totalRentals = toolReport.reduce((s, r) => s + r.total_rentals, 0);
    const totalRevenue = toolReport.reduce((s, r) => s + r.total_revenue, 0);
    return { totalTools, available, checkedOut, totalRentals, totalRevenue };
  }, [toolReport]);

  const categoryOptions = useMemo(() => {
    const catSet = new Set();
    toolReport.forEach((r) => { if (r.category_name) catSet.add(r.category_name); });
    return [
      { label: "All Categories", value: "all" },
      ...Array.from(catSet).sort().map((c) => ({ label: c, value: c })),
    ];
  }, [toolReport]);

  const handleDownload = async (type) => {
    if (toolReport.length === 0) {
      showToastMessage("No tool report data to export.");
      return;
    }
    setDownloading(type);
    try {
      const fileName = type === "pdf"
        ? "Tool_Availability_Report.pdf"
        : "Tool_Availability_Report.xlsx";
      const mimeType = type === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

      // Generate the file
      let tempUri;
      if (type === "pdf") {
        const html = buildReportHtml(toolReport);
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        tempUri = uri;
      } else {
        tempUri = await buildExcelFile(toolReport);
      }

      // Read generated file as base64
      const base64Data = await FileSystem.readAsStringAsync(tempUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Pick a folder (e.g. Downloads), then save there — visible in file manager
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) {
        showToastMessage("Storage permission denied");
        return;
      }

      const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        fileName,
        mimeType,
      );
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      showToastMessage("Saved " + fileName);
    } catch (e) {
      console.log("Download error:", e);
      showToastMessage("Download failed: " + (e.message || "Something went wrong"));
    } finally {
      setDownloading(null);
    }
  };

  const filteredReport = useMemo(() => {
    return toolReport.filter((r) => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!(r.name.toLowerCase().includes(q) || r.category_name.toLowerCase().includes(q))) return false;
      }
      if (selectedStatus !== "all" && r.state !== selectedStatus) return false;
      if (selectedCategory !== "all" && r.category_name !== selectedCategory) return false;
      return true;
    });
  }, [toolReport, searchQuery, selectedStatus, selectedCategory]);

  const TableHeader = () => (
    <View style={styles.tableRow}>
      <Text style={[styles.hCell, styles.colNum]}>#</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, styles.colName]}>TOOL NAME</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, styles.colCat]}>CATEGORY</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, styles.colStatus]}>STATUS</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, styles.colSmall]}>QTY</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, styles.colSmall]}>AVAIL</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, styles.colSmall]}>OUT</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, styles.colSmall]}>RENTALS</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, styles.colPrice]}>PRICE</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, styles.colPrice]}>LATE</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, styles.colRevenue]}>REVENUE</Text>
    </View>
  );

  const renderRow = ({ item, index }) => (
    <View style={[styles.dataRow, index % 2 === 0 && { backgroundColor: "#fafafa" }]}>
      <Text style={[styles.cell, styles.colNum]}>{index + 1}</Text>
      <View style={styles.vLineData} />
      <Text style={[styles.cell, styles.colName, { fontWeight: "600" }]} numberOfLines={1}>{item.name}</Text>
      <View style={styles.vLineData} />
      <Text style={[styles.cell, styles.colCat, { color: COLORS.gray }]} numberOfLines={1}>{item.category_name || "\u2014"}</Text>
      <View style={styles.vLineData} />
      <View style={styles.colStatus}>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.state] || COLORS.gray }]}>
          <Text style={styles.statusText}>{STATUS_LABELS[item.state] || item.state}</Text>
        </View>
      </View>
      <View style={styles.vLineData} />
      <Text style={[styles.cell, styles.colSmall]}>{item.total_qty}</Text>
      <View style={styles.vLineData} />
      <Text style={[styles.cell, styles.colSmall, { color: "#4CAF50" }]}>{item.available_qty}</Text>
      <View style={styles.vLineData} />
      <Text style={[styles.cell, styles.colSmall, { color: "#F44336" }]}>{item.checked_out_qty}</Text>
      <View style={styles.vLineData} />
      <Text style={[styles.cell, styles.colSmall]}>{item.total_rentals}</Text>
      <View style={styles.vLineData} />
      <Text style={[styles.cell, styles.colPrice]}>{item.price_per_day.toFixed(2)}</Text>
      <View style={styles.vLineData} />
      <Text style={[styles.cell, styles.colPrice]}>{item.late_fee_per_day.toFixed(2)}</Text>
      <View style={styles.vLineData} />
      <Text style={[styles.cell, styles.colRevenue, { color: "#4CAF50", fontWeight: "600" }]}>{item.total_revenue.toFixed(2)}</Text>
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader title="Tool Availability Report" navigation={navigation} />
      <RoundedContainer>
        {/* Summary cards */}
        <View style={styles.summaryContainer}>
          <View style={styles.summaryTopRow}>
            <View style={[styles.summaryCard, { borderLeftColor: "#2196F3" }]}>
              <Text style={[styles.summaryNumber, { color: "#2196F3" }]}>{summary.totalTools}</Text>
              <Text style={styles.summaryLabel}>TOTAL TOOLS</Text>
            </View>
            <View style={[styles.summaryCard, { borderLeftColor: "#4CAF50" }]}>
              <Text style={[styles.summaryNumber, { color: "#4CAF50" }]}>{summary.available}</Text>
              <Text style={styles.summaryLabel}>AVAILABLE</Text>
            </View>
            <View style={[styles.summaryCard, { borderLeftColor: "#F44336" }]}>
              <Text style={[styles.summaryNumber, { color: "#F44336" }]}>{summary.checkedOut}</Text>
              <Text style={styles.summaryLabel}>CHECKED OUT</Text>
            </View>
          </View>
          <View style={styles.summaryBottomRow}>
            <View style={[styles.summaryCard, { borderLeftColor: "#FF9800" }]}>
              <Text style={[styles.summaryNumber, { color: "#FF9800" }]}>{summary.totalRentals}</Text>
              <Text style={styles.summaryLabel}>TOTAL RENTALS</Text>
            </View>
            <View style={[styles.summaryCard, { borderLeftColor: "#4CAF50" }]}>
              <Text style={[styles.summaryNumber, { color: "#4CAF50" }]}>$ {summary.totalRevenue.toFixed(2)}</Text>
              <Text style={styles.summaryLabel}>TOTAL REVENUE</Text>
            </View>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search tools..."
            placeholderTextColor="#aaa"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>{"\u2715"}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filters + Download buttons */}
        <View style={styles.filterRow}>
          <DropdownPicker label="Status" value={selectedStatus} options={STATUS_OPTIONS} onSelect={setSelectedStatus} />
          <DropdownPicker label="Category" value={selectedCategory} options={categoryOptions} onSelect={setSelectedCategory} />
          <TouchableOpacity
            style={[styles.downloadBtn, { backgroundColor: "#4CAF50" }]}
            onPress={() => handleDownload("excel")}
            disabled={!!downloading}
            activeOpacity={0.7}
          >
            {downloading === "excel" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.downloadBtnText}>Download Excel</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.downloadBtn, { backgroundColor: "#F44336" }]}
            onPress={() => handleDownload("pdf")}
            disabled={!!downloading}
            activeOpacity={0.7}
          >
            {downloading === "pdf" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.downloadBtnText}>Download PDF</Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.countText}>
          {filteredReport.length} of {toolReport.length}
        </Text>

        {/* Table */}
        <View style={styles.tableHeader}>
          <TableHeader />
        </View>
        <FlatList
          data={filteredReport}
          renderItem={renderRow}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No tools found</Text>
            </View>
          }
        />
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Summary cards - grid layout
  summaryContainer: {
    paddingHorizontal: SPACING.paddingMedium,
    paddingTop: 10,
    paddingBottom: 4,
  },
  summaryTopRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  summaryBottomRow: {
    flexDirection: "row",
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    borderLeftWidth: 3,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  summaryNumber: { fontSize: 18, fontWeight: "700" },
  summaryLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: COLORS.gray,
    letterSpacing: 0.5,
    marginTop: 3,
    textAlign: "center",
  },

  // Download buttons (matches dropdown trigger size)
  downloadBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  downloadBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },

  // Search
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACING.paddingMedium,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: BORDER_RADIUS.medium,
    backgroundColor: "#fff",
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#333",
  },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  clearBtnText: { fontSize: 16, color: COLORS.gray, fontWeight: "600" },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.paddingMedium,
    paddingVertical: 8,
    gap: 8,
  },
  countText: { fontSize: 11, color: COLORS.gray, textAlign: "right", paddingHorizontal: SPACING.paddingMedium, paddingBottom: 4 },

  // Table
  tableHeader: {
    backgroundColor: "#714B67",
    borderTopWidth: 1,
    borderTopColor: "#5a3a52",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  hCell: {
    fontSize: 8,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    backgroundColor: COLORS.white,
  },
  cell: {
    fontSize: 10,
    color: COLORS.black,
    textAlign: "center",
  },

  // Vertical divider lines
  vLine: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  vLineData: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#e0e0e0",
  },

  // Column flex values
  colNum: { width: 20 },
  colName: { flex: 2.5, textAlign: "left", paddingHorizontal: 2 },
  colCat: { flex: 1.5, textAlign: "left", paddingHorizontal: 2 },
  colStatus: { flex: 1.2, alignItems: "center", justifyContent: "center" },
  colSmall: { flex: 0.7, textAlign: "center" },
  colPrice: { flex: 1, textAlign: "center" },
  colRevenue: { flex: 1.2, textAlign: "center" },

  statusBadge: {
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  statusText: {
    color: "#fff",
    fontSize: 7,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.gray,
  },
});

export default ToolAvailabilityScreen;
