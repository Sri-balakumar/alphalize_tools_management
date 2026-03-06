import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  FlatList,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { BarChart, LineChart, PieChart } from "react-native-chart-kit";
import { SafeAreaView, RoundedContainer } from "@components/containers";
import NavigationHeader from "@components/Header/NavigationHeader";
import { COLORS, SPACING } from "@constants/theme";
import useToolStore from "@stores/toolManagement/useToolStore";
import useAuthStore from "@stores/auth/useAuthStore";
import { showToastMessage } from "@components/Toast";
import * as FileSystem from "expo-file-system";
import * as XLSX from "xlsx";
import * as Print from "expo-print";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_WIDTH = SCREEN_WIDTH - 32;

// ── Constants ─────────────────────────────────────────────────────
const MEASURES = [
  { key: "total_amount", label: "Total Amount", color: "#42A5F5" },
  { key: "subtotal", label: "Subtotal", color: "#66BB6A" },
  { key: "late_fee", label: "Late Fees", color: "#FF7043" },
  { key: "discount_amount", label: "Discount", color: "#AB47BC" },
  { key: "damage_charges", label: "Damage", color: "#EF5350" },
  { key: "count", label: "Count", color: "#26A69A" },
];

const GRAPH_TYPES = [
  { key: "bar", icon: "\u2587\u2585\u2587" },
  { key: "line", icon: "\u2571\u2572\u2571" },
  { key: "pie", icon: "\u25D4" },
];

const GROUP_BY = [
  { key: "month", label: "Month" },
  { key: "status", label: "Status" },
  { key: "period_type", label: "Period Type" },
];

const VIEW_MODES = [
  { key: "graph", icon: "\uD83D\uDCC8" },   // chart icon
  { key: "pivot", icon: "\u2630" },           // pivot/grid
  { key: "list", icon: "\u2261" },            // list lines
  { key: "calendar", icon: "\uD83D\uDCC5" }, // calendar
];

const STATE_LABELS = {
  draft: "Draft",
  confirmed: "Confirmed",
  checked_out: "Checked Out",
  checked_in: "Checked In",
  done: "Done",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const STATE_COLORS = {
  draft: "#9E9E9E",
  confirmed: "#2196F3",
  checked_out: "#FF9800",
  checked_in: "#4CAF50",
  done: "#388E3C",
  invoiced: "#7B1FA2",
  cancelled: "#F44336",
};

const PIE_COLORS = [
  "#42A5F5", "#66BB6A", "#FF7043", "#AB47BC", "#EF5350",
  "#26A69A", "#FFA726", "#78909C", "#EC407A", "#5C6BC0",
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Dropdown picker ───────────────────────────────────────────────
const DropdownPicker = ({ label, value, options, onSelect }) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={{ flex: 1 }}>
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
            <ScrollView style={{ maxHeight: 350 }}>
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
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const dropStyles = StyleSheet.create({
  trigger: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#f5f5f5",
    borderRadius: 8, borderWidth: 1, borderColor: "#ddd", paddingHorizontal: 10, paddingVertical: 8,
  },
  triggerText: { fontSize: 13, color: "#333", fontWeight: "500", flex: 1 },
  arrow: { fontSize: 8, color: COLORS.gray, marginLeft: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  menu: { backgroundColor: "#fff", borderRadius: 12, padding: 8, width: 240, elevation: 8 },
  menuTitle: { fontSize: 13, fontWeight: "700", color: COLORS.gray, paddingHorizontal: 12, paddingVertical: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  menuItem: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  menuItemActive: { backgroundColor: COLORS.primaryThemeColor + "15" },
  menuItemText: { fontSize: 14, color: "#333" },
  menuItemTextActive: { color: COLORS.primaryThemeColor, fontWeight: "600" },
});

// ── Helpers ───────────────────────────────────────────────────────
const groupOrders = (orders, groupBy) => {
  const groups = {};
  for (const o of orders) {
    let key;
    if (groupBy === "month") {
      const d = o.date_order || "";
      if (d) {
        const p = d.split("-");
        key = `${MONTH_NAMES[parseInt(p[1], 10) - 1]} ${p[0]}`;
      } else key = "No Date";
    } else if (groupBy === "status") {
      key = STATE_LABELS[o.state] || o.state || "Unknown";
    } else {
      key = (o.rental_period_type || "day").charAt(0).toUpperCase() + (o.rental_period_type || "day").slice(1);
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  }
  return groups;
};

const getMeasureValue = (orders, measure) => {
  if (measure === "count") return orders.length;
  return orders.reduce((s, o) => {
    const v = (measure === "discount_amount" || measure === "damage_charges")
      ? parseFloat(o[measure] || 0) : (o[measure] || 0);
    return s + v;
  }, 0);
};

const sortMonthLabels = (labels) => {
  return [...labels].sort((a, b) => {
    const parse = (l) => {
      const p = l.split(" ");
      return (parseInt(p[1], 10) || 0) * 12 + MONTH_NAMES.indexOf(p[0]);
    };
    return parse(a) - parse(b);
  });
};

// ────────────────────────────────────────────────────────────────
// GRAPH VIEW
// ────────────────────────────────────────────────────────────────
const GraphView = ({ orders, selectedMeasure, setSelectedMeasure, graphType, setGraphType, groupBy, setGroupBy }) => {
  const measureInfo = MEASURES.find((m) => m.key === selectedMeasure) || MEASURES[0];

  const chartData = useMemo(() => {
    const groups = groupOrders(orders, groupBy);
    let labels = Object.keys(groups);
    if (groupBy === "month") labels = sortMonthLabels(labels);
    const values = labels.map((l) => getMeasureValue(groups[l], selectedMeasure));
    return { labels, values };
  }, [orders, groupBy, selectedMeasure]);

  const chartConfig = {
    backgroundColor: "#fff", backgroundGradientFrom: "#fff", backgroundGradientTo: "#fff",
    decimalPlaces: selectedMeasure === "count" ? 0 : 2,
    color: (opacity = 1) => {
      const h = measureInfo.color;
      return `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${opacity})`;
    },
    labelColor: () => "#555", propsForLabels: { fontSize: 10 },
    propsForBackgroundLines: { stroke: "#e8e8e8" }, barPercentage: 0.6,
  };

  const renderChart = () => {
    if (chartData.labels.length === 0) {
      return <View style={gs.emptyChart}><Text style={gs.emptyChartText}>No data to display</Text></View>;
    }
    const displayLabels = chartData.labels.map((l) => l.length > 10 ? l.substring(0, 9) + ".." : l);

    if (graphType === "pie") {
      const pieData = chartData.labels.map((label, idx) => ({
        name: label, value: Math.round(chartData.values[idx] * 100) / 100,
        color: PIE_COLORS[idx % PIE_COLORS.length], legendFontColor: "#555", legendFontSize: 11,
      }));
      return <PieChart data={pieData} width={CHART_WIDTH} height={220} chartConfig={chartConfig} accessor="value" backgroundColor="transparent" paddingLeft="10" absolute />;
    }

    const data = { labels: displayLabels, datasets: [{ data: chartData.values.length > 0 ? chartData.values : [0] }] };
    if (graphType === "line") {
      return <LineChart data={data} width={CHART_WIDTH} height={260} chartConfig={chartConfig} bezier style={gs.chart} fromZero yAxisLabel={selectedMeasure === "count" ? "" : "$ "} />;
    }
    return <BarChart data={data} width={CHART_WIDTH} height={260} chartConfig={chartConfig} style={gs.chart} fromZero showValuesOnTopOfBars yAxisLabel={selectedMeasure === "count" ? "" : "$ "} />;
  };

  return (
    <View>
      {/* Measures row */}
      <View style={gs.measuresRow}>
        <DropdownPicker
          label="Measures"
          value={selectedMeasure}
          options={MEASURES.map((m) => ({ label: m.label, value: m.key }))}
          onSelect={setSelectedMeasure}
        />
        <View style={gs.graphTypeBtns}>
          {GRAPH_TYPES.map((gt) => (
            <TouchableOpacity
              key={gt.key}
              style={[gs.graphTypeBtn, graphType === gt.key && gs.graphTypeBtnActive]}
              onPress={() => setGraphType(gt.key)}
            >
              <Text style={[gs.graphTypeBtnText, graphType === gt.key && { color: "#fff" }]}>{gt.icon}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <DropdownPicker
          label="Group By"
          value={groupBy}
          options={GROUP_BY.map((g) => ({ label: g.label, value: g.key }))}
          onSelect={setGroupBy}
        />
      </View>

      {/* Chart */}
      <View style={gs.chartContainer}>
        <Text style={gs.chartTitle}>{measureInfo.label}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          {renderChart()}
        </ScrollView>
      </View>
    </View>
  );
};

const gs = StyleSheet.create({
  measuresRow: { flexDirection: "row", paddingHorizontal: SPACING.paddingMedium, paddingTop: 10, gap: 8, alignItems: "center" },
  graphTypeBtns: { flexDirection: "row", gap: 2 },
  graphTypeBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, backgroundColor: "#f0f0f0", borderWidth: 1, borderColor: "#ddd" },
  graphTypeBtnActive: { backgroundColor: "#714B67", borderColor: "#714B67" },
  graphTypeBtnText: { fontSize: 12, color: "#555" },
  chartContainer: { marginHorizontal: SPACING.paddingMedium, marginTop: 12, backgroundColor: "#fff", borderRadius: 12, padding: 12, elevation: 2 },
  chartTitle: { fontSize: 14, fontWeight: "700", color: "#333", marginBottom: 8, textAlign: "center" },
  chart: { borderRadius: 8 },
  emptyChart: { width: CHART_WIDTH, height: 200, justifyContent: "center", alignItems: "center" },
  emptyChartText: { fontSize: 16, color: COLORS.gray },
});

// ────────────────────────────────────────────────────────────────
// PIVOT VIEW
// ────────────────────────────────────────────────────────────────
const PIVOT_MEASURES = [
  { key: "total_amount", label: "Total Amount" },
  { key: "late_fee", label: "Late Fees" },
  { key: "subtotal", label: "Subtotal" },
  { key: "discount_amount", label: "Discount" },
  { key: "damage_charges", label: "Damage" },
];

const PivotView = ({ orders }) => {
  const [expanded, setExpanded] = useState(true); // expanded by default like Odoo
  const [activeMeasures, setActiveMeasures] = useState(["total_amount", "late_fee"]);
  const [measuresOpen, setMeasuresOpen] = useState(false);

  const toggleMeasure = (key) => {
    setActiveMeasures((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev; // keep at least 1
        return prev.filter((m) => m !== key);
      }
      return [...prev, key];
    });
  };

  const getVal = (order, key) => {
    if (key === "discount_amount" || key === "damage_charges") return parseFloat(order[key] || 0);
    return order[key] || 0;
  };

  const pivotData = useMemo(() => {
    const months = {};
    const periodTypes = new Set();
    for (const o of orders) {
      const d = o.date_order || "";
      let monthKey = "No Date";
      if (d) {
        const p = d.split("-");
        monthKey = `${MONTH_FULL[parseInt(p[1], 10) - 1]} ${p[0]}`;
      }
      const pt = (o.rental_period_type || "day").charAt(0).toUpperCase() + (o.rental_period_type || "day").slice(1);
      periodTypes.add(pt);
      if (!months[monthKey]) months[monthKey] = {};
      if (!months[monthKey][pt]) months[monthKey][pt] = [];
      months[monthKey][pt].push(o);
    }

    const sortedMonths = Object.keys(months).sort((a, b) => {
      const parse = (l) => { const p = l.split(" "); return (parseInt(p[1], 10) || 0) * 12 + MONTH_FULL.indexOf(p[0]); };
      return parse(a) - parse(b);
    });

    return { months, sortedMonths, periodTypes: Array.from(periodTypes).sort() };
  }, [orders]);

  const { months, sortedMonths, periodTypes } = pivotData;

  const sumMeasure = (orderList, key) => orderList.reduce((s, o) => s + getVal(o, key), 0);

  const allOrdersForPt = (pt) => {
    let all = [];
    for (const m of sortedMonths) { if (months[m][pt]) all = all.concat(months[m][pt]); }
    return all;
  };

  const measureCount = activeMeasures.length;
  const colWidth = Math.max(100, 120);

  const handleDownloadExcel = async () => {
    try {
      const measureLabels = activeMeasures.map((mk) => PIVOT_MEASURES.find((m) => m.key === mk)?.label || mk);
      const rows = [];

      // Header row
      const header = ["Month", ...measureLabels.map((l) => `Total - ${l}`)];
      for (const pt of periodTypes) {
        for (const ml of measureLabels) header.push(`${pt} - ${ml}`);
      }
      rows.push(header);

      // Grand total row
      const totalRow = ["Total"];
      for (const mk of activeMeasures) totalRow.push(sumMeasure(orders, mk));
      for (const pt of periodTypes) {
        for (const mk of activeMeasures) totalRow.push(sumMeasure(allOrdersForPt(pt), mk));
      }
      rows.push(totalRow);

      // Month rows
      for (const month of sortedMonths) {
        const allInMonth = Object.values(months[month]).flat();
        const row = [month];
        for (const mk of activeMeasures) row.push(sumMeasure(allInMonth, mk));
        for (const pt of periodTypes) {
          const ptOrders = months[month][pt] || [];
          for (const mk of activeMeasures) row.push(sumMeasure(ptOrders, mk));
        }
        rows.push(row);
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pivot");
      const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) { showToastMessage("Storage permission denied"); return; }

      const fileName = `Rental_Pivot_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri, fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: FileSystem.EncodingType.Base64 });
      showToastMessage("Saved " + fileName);
    } catch (e) {
      showToastMessage("Download failed: " + (e.message || "Something went wrong"));
    }
  };

  return (
    <View>
      {/* Measures toolbar */}
      <View style={pv.toolbar}>
        <TouchableOpacity style={pv.measuresBtn} onPress={() => setMeasuresOpen(true)}>
          <Text style={pv.measuresBtnText}>Measures</Text>
          <Text style={pv.measuresArrow}>{"\u25BC"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={pv.downloadBtn} onPress={handleDownloadExcel}>
          <Text style={pv.downloadBtnText}>{"\u2B07"} Download</Text>
        </TouchableOpacity>
      </View>

      {/* Measures modal */}
      <Modal visible={measuresOpen} transparent animationType="fade" onRequestClose={() => setMeasuresOpen(false)}>
        <TouchableOpacity style={pv.modalOverlay} activeOpacity={1} onPress={() => setMeasuresOpen(false)}>
          <View style={pv.modalMenu}>
            <Text style={pv.modalTitle}>MEASURES</Text>
            {PIVOT_MEASURES.map((m) => {
              const isActive = activeMeasures.includes(m.key);
              return (
                <TouchableOpacity key={m.key} style={pv.modalItem} onPress={() => toggleMeasure(m.key)}>
                  <View style={[pv.checkbox, isActive && pv.checkboxActive]}>
                    {isActive && <Text style={pv.checkmark}>{"\u2713"}</Text>}
                  </View>
                  <Text style={[pv.modalItemText, isActive && { color: "#714B67", fontWeight: "600" }]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Pivot table */}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={pv.table}>
          {/* Header row 1: Group names */}
          <View style={pv.headerRow}>
            <View style={pv.rowLabelCell} />
            <View style={pv.vLineH} />
            <View style={[pv.groupCell, { width: colWidth * measureCount }]}>
              <Text style={pv.headerText}>Total</Text>
            </View>
            {periodTypes.map((pt) => (
              <React.Fragment key={pt}>
                <View style={pv.vLineH} />
                <View style={[pv.groupCell, { width: colWidth * measureCount }]}>
                  <Text style={pv.headerText}>{pt}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          {/* Header row 2: Measure names */}
          <View style={pv.subHeaderRow}>
            <View style={pv.rowLabelCell} />
            <View style={pv.vLineH} />
            {activeMeasures.map((mk) => (
              <View key={`total-${mk}`} style={[pv.mCell, { width: colWidth }]}>
                <Text style={pv.subHeaderText}>{PIVOT_MEASURES.find((m) => m.key === mk)?.label}</Text>
              </View>
            ))}
            {periodTypes.map((pt) => (
              <React.Fragment key={pt}>
                <View style={pv.vLineH} />
                {activeMeasures.map((mk) => (
                  <View key={`${pt}-${mk}`} style={[pv.mCell, { width: colWidth }]}>
                    <Text style={pv.subHeaderText}>{PIVOT_MEASURES.find((m) => m.key === mk)?.label}</Text>
                  </View>
                ))}
              </React.Fragment>
            ))}
          </View>

          {/* Total row */}
          <TouchableOpacity style={pv.totalRow} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
            <View style={pv.rowLabelCell}>
              <Text style={pv.toggleIcon}>{expanded ? "\u229F" : "\u229E"}</Text>
              <Text style={pv.totalLabel}>Total</Text>
            </View>
            <View style={pv.vLineD} />
            {activeMeasures.map((mk) => (
              <View key={`gt-${mk}`} style={[pv.mCell, { width: colWidth }]}>
                <Text style={pv.totalValue}>$ {sumMeasure(orders, mk).toFixed(2)}</Text>
              </View>
            ))}
            {periodTypes.map((pt) => (
              <React.Fragment key={pt}>
                <View style={pv.vLineD} />
                {activeMeasures.map((mk) => (
                  <View key={`gt-${pt}-${mk}`} style={[pv.mCell, { width: colWidth }]}>
                    <Text style={pv.totalValue}>$ {sumMeasure(allOrdersForPt(pt), mk).toFixed(2)}</Text>
                  </View>
                ))}
              </React.Fragment>
            ))}
          </TouchableOpacity>

          {/* Month rows */}
          {expanded && sortedMonths.map((month, idx) => {
            const allInMonth = Object.values(months[month]).flat();
            return (
              <View key={month} style={[pv.dataRow, idx % 2 !== 0 && { backgroundColor: "#fafafa" }]}>
                <View style={pv.rowLabelCell}>
                  <Text style={pv.expandIcon}>{"\u229E"}</Text>
                  <Text style={pv.monthLabel}>{month}</Text>
                </View>
                <View style={pv.vLineD} />
                {activeMeasures.map((mk) => (
                  <View key={`${month}-${mk}`} style={[pv.mCell, { width: colWidth }]}>
                    <Text style={pv.cellValue}>$ {sumMeasure(allInMonth, mk).toFixed(2)}</Text>
                  </View>
                ))}
                {periodTypes.map((pt) => (
                  <React.Fragment key={pt}>
                    <View style={pv.vLineD} />
                    {activeMeasures.map((mk) => (
                      <View key={`${month}-${pt}-${mk}`} style={[pv.mCell, { width: colWidth }]}>
                        <Text style={pv.cellValue}>$ {sumMeasure(months[month][pt] || [], mk).toFixed(2)}</Text>
                      </View>
                    ))}
                  </React.Fragment>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const pv = StyleSheet.create({
  // Toolbar
  toolbar: { flexDirection: "row", paddingHorizontal: SPACING.paddingMedium, paddingTop: 10, paddingBottom: 4, gap: 8 },
  measuresBtn: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#714B67",
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, gap: 6,
  },
  measuresBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  measuresArrow: { fontSize: 8, color: "#fff" },
  downloadBtn: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#4CAF50",
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, gap: 6,
  },
  downloadBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  modalMenu: { backgroundColor: "#fff", borderRadius: 12, padding: 12, width: 260, elevation: 8 },
  modalTitle: { fontSize: 12, fontWeight: "700", color: COLORS.gray, letterSpacing: 0.5, marginBottom: 8, paddingHorizontal: 4 },
  modalItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 4, gap: 10 },
  modalItemText: { fontSize: 14, color: "#333" },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: "#ccc", justifyContent: "center", alignItems: "center" },
  checkboxActive: { borderColor: "#714B67", backgroundColor: "#714B67" },
  checkmark: { fontSize: 13, color: "#fff", fontWeight: "700" },
  // Table
  table: { marginHorizontal: SPACING.paddingMedium, marginTop: 6, borderRadius: 8, overflow: "hidden", elevation: 2, backgroundColor: "#fff" },
  headerRow: { flexDirection: "row", backgroundColor: "#714B67", paddingVertical: 10, alignItems: "center" },
  subHeaderRow: { flexDirection: "row", backgroundColor: "#8B6580", paddingVertical: 7, alignItems: "center" },
  headerText: { fontSize: 13, fontWeight: "700", color: "#fff", textAlign: "center" },
  subHeaderText: { fontSize: 10, fontWeight: "600", color: "#ddd", textAlign: "center" },
  rowLabelCell: { width: 150, flexDirection: "row", alignItems: "center", paddingHorizontal: 10 },
  groupCell: { justifyContent: "center", alignItems: "center" },
  mCell: { justifyContent: "center", alignItems: "center", paddingVertical: 2 },
  vLineH: { width: 1, alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.25)" },
  vLineD: { width: 1, alignSelf: "stretch", backgroundColor: "#e0e0e0" },
  totalRow: { flexDirection: "row", paddingVertical: 12, backgroundColor: "#f5f5f5", borderBottomWidth: 1, borderBottomColor: "#ddd", alignItems: "center" },
  dataRow: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee", backgroundColor: "#fff", alignItems: "center" },
  toggleIcon: { fontSize: 16, color: "#714B67", fontWeight: "700" },
  totalLabel: { fontSize: 13, fontWeight: "700", color: "#2196F3", marginLeft: 6 },
  totalValue: { fontSize: 12, fontWeight: "700", color: "#333", textAlign: "center" },
  expandIcon: { fontSize: 16, color: "#2196F3" },
  monthLabel: { fontSize: 12, fontWeight: "500", color: "#2196F3", marginLeft: 6 },
  cellValue: { fontSize: 11, color: "#444", textAlign: "center" },
});

// ────────────────────────────────────────────────────────────────
// LIST VIEW
// ────────────────────────────────────────────────────────────────
const ListView = ({ orders, navigation }) => {
  const renderRow = ({ item, index }) => {
    const stateInfo = { label: STATE_LABELS[item.state] || item.state, color: STATE_COLORS[item.state] || "#9E9E9E" };
    const formatDate = (d) => (d ? d.split(" ")[0] : "-");
    return (
      <TouchableOpacity
        style={[lv.row, index % 2 === 0 && { backgroundColor: "#fafafa" }]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate("RentalOrderFormScreen", { order: item, mode: "edit" })}
      >
        <Text style={[lv.cell, { width: 30 }]}>{index + 1}</Text>
        <View style={lv.vLine} />
        <Text style={[lv.cell, { flex: 1.3, fontWeight: "600", color: "#714B67" }]}>{item.name}</Text>
        <View style={lv.vLine} />
        <Text style={[lv.cell, { flex: 0.9, color: "#1565C0", fontWeight: "500" }]}>{item.customer_id || "-"}</Text>
        <View style={lv.vLine} />
        <Text style={[lv.cell, { flex: 1.8, textAlign: "left", paddingLeft: 4 }]} numberOfLines={1}>{item.partner_name || "-"}</Text>
        <View style={lv.vLine} />
        <Text style={[lv.cell, { flex: 1 }]}>{formatDate(item.date_order)}</Text>
        <View style={lv.vLine} />
        <View style={{ flex: 0.9, alignItems: "center", justifyContent: "center" }}>
          <View style={[lv.badge, { backgroundColor: stateInfo.color }]}>
            <Text style={lv.badgeText}>{stateInfo.label}</Text>
          </View>
        </View>
        <View style={lv.vLine} />
        <Text style={[lv.cell, { flex: 1.2, fontWeight: "600" }]}>$ {(item.total_amount || 0).toFixed(2)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={lv.container}>
      {/* Header */}
      <View style={lv.header}>
        <Text style={[lv.hCell, { width: 30 }]}>#</Text>
        <View style={lv.vLineH} />
        <Text style={[lv.hCell, { flex: 1.3 }]}>Order</Text>
        <View style={lv.vLineH} />
        <Text style={[lv.hCell, { flex: 0.9 }]}>Customer ID</Text>
        <View style={lv.vLineH} />
        <Text style={[lv.hCell, { flex: 1.8 }]}>Customer</Text>
        <View style={lv.vLineH} />
        <Text style={[lv.hCell, { flex: 1 }]}>Date</Text>
        <View style={lv.vLineH} />
        <Text style={[lv.hCell, { flex: 0.9 }]}>Status</Text>
        <View style={lv.vLineH} />
        <Text style={[lv.hCell, { flex: 1.2 }]}>Total</Text>
      </View>
      <FlatList
        data={orders}
        renderItem={renderRow}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<View style={lv.empty}><Text style={lv.emptyText}>No orders</Text></View>}
      />
    </View>
  );
};

const lv = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", backgroundColor: "#714B67", paddingVertical: 8, paddingHorizontal: 4, alignItems: "center" },
  hCell: { fontSize: 10, fontWeight: "700", color: "#fff", textAlign: "center" },
  vLineH: { width: 1, alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.3)" },
  row: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: "#e0e0e0", backgroundColor: "#fff", alignItems: "center" },
  cell: { fontSize: 10, color: "#333", textAlign: "center" },
  vLine: { width: 1, alignSelf: "stretch", backgroundColor: "#e0e0e0" },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  badgeText: { color: "#fff", fontSize: 8, fontWeight: "700" },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontSize: 16, color: COLORS.gray },
});

// ────────────────────────────────────────────────────────────────
// CALENDAR VIEW
// ────────────────────────────────────────────────────────────────
const CalendarView = ({ orders, navigation }) => {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  const calendarData = useMemo(() => {
    // Group orders by date
    const byDate = {};
    for (const o of orders) {
      const d = (o.date_order || "").split(" ")[0];
      if (d) {
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(o);
      }
    }

    // Build calendar grid
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const weeks = [];
    let week = new Array(firstDay).fill(null);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      week.push({ day: d, date: dateStr, orders: byDate[dateStr] || [] });
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }

    return { weeks, monthLabel: `${MONTH_FULL[currentMonth]} ${currentYear}` };
  }, [orders, currentYear, currentMonth]);

  const goToPrev = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };

  const goToNext = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const [selectedDate, setSelectedDate] = useState(null);
  const selectedOrders = useMemo(() => {
    if (!selectedDate) return [];
    const byDate = {};
    for (const o of orders) {
      const d = (o.date_order || "").split(" ")[0];
      if (d) {
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(o);
      }
    }
    return byDate[selectedDate] || [];
  }, [orders, selectedDate]);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={cv.container}>
        {/* Month nav */}
        <View style={cv.navRow}>
          <TouchableOpacity onPress={goToPrev} style={cv.navBtn}><Text style={cv.navBtnText}>{"\u25C0"}</Text></TouchableOpacity>
          <Text style={cv.monthLabel}>{calendarData.monthLabel}</Text>
          <TouchableOpacity onPress={goToNext} style={cv.navBtn}><Text style={cv.navBtnText}>{"\u25B6"}</Text></TouchableOpacity>
        </View>

        {/* Day names */}
        <View style={cv.weekRow}>
          {DAY_NAMES.map((d) => (
            <View key={d} style={cv.dayNameCell}><Text style={cv.dayNameText}>{d}</Text></View>
          ))}
        </View>

        {/* Calendar grid */}
        {calendarData.weeks.map((week, wIdx) => (
          <View key={wIdx} style={cv.weekRow}>
            {week.map((cell, cIdx) => {
              if (!cell) return <View key={cIdx} style={cv.emptyCell} />;
              const hasOrders = cell.orders.length > 0;
              const isSelected = selectedDate === cell.date;
              const totalAmt = cell.orders.reduce((s, o) => s + (o.total_amount || 0), 0);
              return (
                <TouchableOpacity
                  key={cIdx}
                  style={[cv.dayCell, hasOrders && cv.dayCellHasOrders, isSelected && cv.dayCellSelected]}
                  onPress={() => setSelectedDate(isSelected ? null : cell.date)}
                  activeOpacity={0.7}
                >
                  <Text style={[cv.dayNum, isSelected && { color: "#fff" }]}>{cell.day}</Text>
                  {hasOrders && (
                    <View>
                      <Text style={[cv.orderCount, isSelected && { color: "#fff" }]}>{cell.orders.length} order{cell.orders.length > 1 ? "s" : ""}</Text>
                      <Text style={[cv.orderAmount, isSelected && { color: "#ddd" }]}>$ {totalAmt.toFixed(0)}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {/* Selected date orders */}
        {selectedDate && selectedOrders.length > 0 && (
          <View style={cv.selectedSection}>
            <Text style={cv.selectedTitle}>Orders on {selectedDate}</Text>
            {selectedOrders.map((o) => (
              <TouchableOpacity
                key={o.id}
                style={cv.orderCard}
                onPress={() => navigation.navigate("RentalOrderFormScreen", { order: o, mode: "edit" })}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={cv.orderName}>{o.name}</Text>
                  <View style={[cv.statusBadge, { backgroundColor: STATE_COLORS[o.state] || "#9E9E9E" }]}>
                    <Text style={cv.statusText}>{STATE_LABELS[o.state] || o.state}</Text>
                  </View>
                </View>
                <Text style={cv.orderCustomer}>{o.partner_name || "-"}</Text>
                <Text style={cv.orderTotal}>$ {(o.total_amount || 0).toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const cv = StyleSheet.create({
  container: { paddingHorizontal: SPACING.paddingMedium, paddingTop: 10 },
  navRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  navBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  navBtnText: { fontSize: 16, color: "#714B67", fontWeight: "700" },
  monthLabel: { fontSize: 18, fontWeight: "700", color: "#333" },
  weekRow: { flexDirection: "row", gap: 2, marginBottom: 2 },
  dayNameCell: { flex: 1, alignItems: "center", paddingVertical: 6, backgroundColor: "#714B67", borderRadius: 4 },
  dayNameText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  emptyCell: { flex: 1, minHeight: 60 },
  dayCell: { flex: 1, minHeight: 60, backgroundColor: "#fff", borderRadius: 6, padding: 4, borderWidth: 1, borderColor: "#e8e8e8" },
  dayCellHasOrders: { backgroundColor: "#E3F2FD", borderColor: "#90CAF9" },
  dayCellSelected: { backgroundColor: "#714B67", borderColor: "#714B67" },
  dayNum: { fontSize: 12, fontWeight: "600", color: "#333" },
  orderCount: { fontSize: 8, color: "#1565C0", fontWeight: "600", marginTop: 2 },
  orderAmount: { fontSize: 8, color: "#555" },
  selectedSection: { marginTop: 12 },
  selectedTitle: { fontSize: 14, fontWeight: "700", color: "#714B67", marginBottom: 8 },
  orderCard: { backgroundColor: "#fff", borderRadius: 8, padding: 12, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: "#714B67", elevation: 1 },
  orderName: { fontSize: 14, fontWeight: "700", color: "#714B67" },
  orderCustomer: { fontSize: 12, color: "#555", marginTop: 2 },
  orderTotal: { fontSize: 14, fontWeight: "700", color: "#333", marginTop: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusText: { color: "#fff", fontSize: 10, fontWeight: "600" },
});

// ────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ────────────────────────────────────────────────────────────────
const RentalDashboardScreen = ({ navigation }) => {
  const odooAuth = useAuthStore((s) => s.odooAuth);
  const orders = useToolStore((s) => s.orders);
  const fetchOrders = useToolStore((s) => s.fetchOrders);

  const [viewMode, setViewMode] = useState("graph");
  const [selectedMeasure, setSelectedMeasure] = useState("total_amount");
  const [graphType, setGraphType] = useState("bar");
  const [groupBy, setGroupBy] = useState("month");

  useFocusEffect(
    useCallback(() => {
      if (odooAuth) fetchOrders(odooAuth);
    }, [odooAuth])
  );

  // Summary KPIs
  const summary = useMemo(() => {
    const total = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
    const count = orders.length;
    const avg = count ? total / count : 0;
    const active = orders.filter((o) => o.state === "checked_out" || o.state === "confirmed").length;
    const late = orders.reduce((s, o) => s + (o.late_fee || 0), 0);
    const disc = orders.reduce((s, o) => s + parseFloat(o.discount_amount || 0), 0);
    return { total, count, avg, active, late, disc };
  }, [orders]);

  const handleDownloadList = async () => {
    try {
      const statusColors = { draft: "#9E9E9E", confirmed: "#4CAF50", checked_out: "#FF5722", checked_in: "#FF9800", invoiced: "#673AB7", cancelled: "#F44336" };
      const tableRows = orders.map((o, i) => {
        const st = STATE_LABELS[o.state] || o.state || "";
        const sc = statusColors[o.state] || "#9E9E9E";
        return `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9f9f9"}">
          <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${i + 1}</td>
          <td style="padding:6px 8px;border:1px solid #ddd;color:#714B67;font-weight:600">${o.name || ""}</td>
          <td style="padding:6px 8px;border:1px solid #ddd;color:#1565C0">${o.customer_id || "-"}</td>
          <td style="padding:6px 8px;border:1px solid #ddd">${o.partner_name || "-"}</td>
          <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${o.date_order ? o.date_order.split(" ")[0] : "-"}</td>
          <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${o.rental_period_type || "-"}</td>
          <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-weight:600">$ ${(o.total_amount || 0).toFixed(2)}</td>
          <td style="padding:6px 8px;border:1px solid #ddd;text-align:center"><span style="background:${sc};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px">${st}</span></td>
        </tr>`;
      }).join("");

      const html = `<html><head><style>body{font-family:Arial,sans-serif;padding:20px}h2{color:#714B67;margin-bottom:10px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#714B67;color:#fff;padding:8px;border:1px solid #714B67;text-align:center}</style></head>
      <body><h2>Rental Orders</h2><p style="color:#666;font-size:12px">Generated: ${new Date().toLocaleDateString()}</p>
      <table><thead><tr><th>#</th><th>Order</th><th>Customer ID</th><th>Customer</th><th>Date</th><th>Period</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>${tableRows}</tbody></table></body></html>`;

      const { uri: tempUri } = await Print.printToFileAsync({ html });
      const base64 = await FileSystem.readAsStringAsync(tempUri, { encoding: FileSystem.EncodingType.Base64 });

      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) { showToastMessage("Storage permission denied"); return; }

      const fileName = `Rental_Orders_${new Date().toISOString().slice(0, 10)}.pdf`;
      const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri, fileName, "application/pdf"
      );
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.deleteAsync(tempUri, { idempotent: true });
      showToastMessage("Saved " + fileName);
    } catch (e) {
      showToastMessage("Download failed: " + (e.message || "Something went wrong"));
    }
  };

  // View mode switcher in header right
  const ViewModeSwitcher = () => (
    <View style={styles.viewModeRow}>
      {viewMode === "list" && (
        <TouchableOpacity style={styles.downloadListBtn} onPress={handleDownloadList}>
          <Text style={styles.downloadListText}>Download</Text>
        </TouchableOpacity>
      )}
      {VIEW_MODES.map((vm) => (
        <TouchableOpacity
          key={vm.key}
          style={[styles.viewModeBtn, viewMode === vm.key && styles.viewModeBtnActive]}
          onPress={() => setViewMode(vm.key)}
        >
          <Text style={[styles.viewModeIcon, viewMode === vm.key && { color: "#fff" }]}>{vm.icon}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderContent = () => {
    switch (viewMode) {
      case "graph":
        return (
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Summary */}
            <View style={styles.summaryRow}>
              <View style={[styles.sCard, { borderLeftColor: "#714B67" }]}>
                <Text style={styles.sLabel}>TOTAL REVENUE</Text>
                <Text style={[styles.sNum, { color: "#714B67" }]}>$ {summary.total.toFixed(2)}</Text>
              </View>
              <View style={[styles.sCard, { borderLeftColor: "#42A5F5" }]}>
                <Text style={styles.sLabel}>TOTAL ORDERS</Text>
                <Text style={[styles.sNum, { color: "#42A5F5" }]}>{summary.count}</Text>
              </View>
              <View style={[styles.sCard, { borderLeftColor: "#66BB6A" }]}>
                <Text style={styles.sLabel}>AVG. ORDER</Text>
                <Text style={[styles.sNum, { color: "#66BB6A" }]}>$ {summary.avg.toFixed(2)}</Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <View style={[styles.sCard, { borderLeftColor: "#FF9800" }]}>
                <Text style={styles.sLabel}>ACTIVE RENTALS</Text>
                <Text style={[styles.sNum, { color: "#FF9800" }]}>{summary.active}</Text>
              </View>
              <View style={[styles.sCard, { borderLeftColor: "#FF7043" }]}>
                <Text style={styles.sLabel}>LATE FEES</Text>
                <Text style={[styles.sNum, { color: "#FF7043" }]}>$ {summary.late.toFixed(2)}</Text>
              </View>
              <View style={[styles.sCard, { borderLeftColor: "#AB47BC" }]}>
                <Text style={styles.sLabel}>DISCOUNTS</Text>
                <Text style={[styles.sNum, { color: "#AB47BC" }]}>$ {summary.disc.toFixed(2)}</Text>
              </View>
            </View>
            <GraphView
              orders={orders}
              selectedMeasure={selectedMeasure}
              setSelectedMeasure={setSelectedMeasure}
              graphType={graphType}
              setGraphType={setGraphType}
              groupBy={groupBy}
              setGroupBy={setGroupBy}
            />
            <View style={{ height: 30 }} />
          </ScrollView>
        );
      case "pivot":
        return (
          <ScrollView showsVerticalScrollIndicator={false}>
            <PivotView orders={orders} />
            <View style={{ height: 30 }} />
          </ScrollView>
        );
      case "list":
        return <ListView orders={orders} navigation={navigation} />;
      case "calendar":
        return <CalendarView orders={orders} navigation={navigation} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Rental Dashboard"
        navigation={navigation}
        rightComponent={<ViewModeSwitcher />}
      />
      <RoundedContainer>
        {renderContent()}
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // View mode switcher
  viewModeRow: { flexDirection: "row", gap: 3 },
  viewModeBtn: {
    width: 30, height: 30, borderRadius: 6, justifyContent: "center", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  viewModeBtnActive: { backgroundColor: "rgba(255,255,255,0.35)" },
  viewModeIcon: { fontSize: 14, color: "rgba(255,255,255,0.7)" },
  downloadListBtn: {
    height: 30, borderRadius: 6, justifyContent: "center", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.25)", marginRight: 6, paddingHorizontal: 10,
  },
  downloadListText: { fontSize: 11, fontWeight: "600", color: "#fff" },
  // Summary
  summaryRow: { flexDirection: "row", paddingHorizontal: SPACING.paddingMedium, paddingTop: 8, gap: 6 },
  sCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 10,
    borderLeftWidth: 3, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2,
  },
  sLabel: { fontSize: 8, fontWeight: "700", color: COLORS.gray, letterSpacing: 0.3, marginBottom: 4 },
  sNum: { fontSize: 16, fontWeight: "700" },
});

export default RentalDashboardScreen;
