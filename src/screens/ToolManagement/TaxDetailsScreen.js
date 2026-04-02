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
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, RoundedContainer } from "@components/containers";
import NavigationHeader from "@components/Header/NavigationHeader";
import { COLORS, SPACING, BORDER_RADIUS } from "@constants/theme";
import useToolStore from "@stores/toolManagement/useToolStore";
import useAuthStore from "@stores/auth/useAuthStore";

const STATE_CONFIG = {
  draft: { label: "Draft", color: "#9E9E9E" },
  confirmed: { label: "Confirmed", color: "#2196F3" },
  checked_out: { label: "Checked Out", color: "#FF9800" },
  checked_in: { label: "Checked In", color: "#4CAF50" },
  done: { label: "Done", color: "#388E3C" },
  invoiced: { label: "Invoiced", color: "#7B1FA2" },
  cancelled: { label: "Cancelled", color: "#F44336" },
};

const STATUS_OPTIONS = [
  { label: "All Statuses", value: "all" },
  { label: "Checked Out", value: "checked_out" },
  { label: "Checked In", value: "checked_in" },
  { label: "Done", value: "done" },
  { label: "Invoiced", value: "invoiced" },
];

const DropdownPicker = ({ label, value, options, onSelect }) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity style={dropStyles.trigger} onPress={() => setOpen(true)}>
        <Text style={dropStyles.triggerText} numberOfLines={1}>{selected?.label || label}</Text>
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
  trigger: { flexDirection: "row", alignItems: "center", backgroundColor: "#f5f5f5", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: "#ddd" },
  triggerText: { flex: 1, fontSize: 12, color: "#333" },
  arrow: { fontSize: 10, color: COLORS.gray, marginLeft: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  menu: { backgroundColor: "#fff", borderRadius: 12, padding: 8, width: 240, elevation: 8 },
  menuTitle: { fontSize: 13, fontWeight: "700", color: COLORS.gray, paddingHorizontal: 12, paddingVertical: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  menuItem: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  menuItemActive: { backgroundColor: COLORS.primaryThemeColor + "15" },
  menuItemText: { fontSize: 14, color: "#333" },
  menuItemTextActive: { color: COLORS.primaryThemeColor, fontWeight: "600" },
});

// ── Expanded tax detail ──────────────────────────────────────────
const TaxDetail = ({ order, navigation }) => {
  const allLines = order.lines || [];

  return (
    <View style={detailStyles.container}>
      {/* Tax info card */}
      <View style={detailStyles.infoRow}>
        <View style={[detailStyles.infoCard, { borderLeftColor: "#1565C0" }]}>
          <Text style={detailStyles.infoTitle}>Tax Summary</Text>
          <DetailRow label="Order" value={order.name} />
          {order.customer_id ? (
            <View style={detailStyles.detailRow}>
              <Text style={detailStyles.detailLabel}>Customer ID:</Text>
              <View style={detailStyles.custBadge}>
                <Text style={detailStyles.custBadgeText}>{order.customer_id}</Text>
              </View>
            </View>
          ) : null}
          <DetailRow label="Total Tax" value={`ر.ع.${parseFloat(order.tax_total || 0).toFixed(3)}`} valueColor="#E65100" />
          <DetailRow label="Subtotal" value={`ر.ع.${parseFloat(order.subtotal || 0).toFixed(3)}`} />
          <DetailRow label="Total Amount" value={`ر.ع.${parseFloat(order.total_amount || 0).toFixed(3)}`} valueColor="#2E7D32" />
        </View>
      </View>

      {/* Tax Breakdown table */}
      {allLines.length > 0 && (
        <View style={detailStyles.toolsSection}>
          <Text style={detailStyles.toolsTitle}>Tax Breakdown</Text>
          <View style={detailStyles.toolHeaderRow}>
            <Text style={[detailStyles.toolHCell, { width: 22 }]}>#</Text>
            <Text style={[detailStyles.toolHCell, { flex: 1.5 }]}>Tool</Text>
            <Text style={[detailStyles.toolHCell, { flex: 1 }]}>Serial No.</Text>
            <Text style={[detailStyles.toolHCell, { flex: 0.9 }]}>Rental Cost</Text>
            <Text style={[detailStyles.toolHCell, { flex: 0.7 }]}>Tax %</Text>
            <Text style={[detailStyles.toolHCell, { flex: 0.8 }]}>Tax Amount</Text>
            <Text style={[detailStyles.toolHCell, { flex: 0.9 }]}>Final Amount</Text>
          </View>
          {allLines.map((line, idx) => {
            const rentalCost = line.rental_cost || 0;
            const taxPct = parseFloat(line.tax_percentage || 0);
            const taxAmt = parseFloat(line.tax_amount || 0);
            const finalAmt = rentalCost + taxAmt;

            return (
              <View key={line.id} style={[detailStyles.toolDataRow, idx % 2 === 0 && { backgroundColor: "#fafafa" }]}>
                <Text style={[detailStyles.toolCell, { width: 22 }]}>{idx + 1}</Text>
                <Text style={[detailStyles.toolCell, { flex: 1.5 }]} numberOfLines={1}>{line.tool_name || "-"}</Text>
                <Text style={[detailStyles.toolCell, { flex: 1 }]}>{line.serial_number || "-"}</Text>
                <Text style={[detailStyles.toolCell, { flex: 0.9 }]}>ر.ع.{rentalCost.toFixed(3)}</Text>
                <Text style={[detailStyles.toolCell, { flex: 0.7, color: "#1565C0", fontWeight: "600" }]}>{taxPct.toFixed(1)}%</Text>
                <Text style={[detailStyles.toolCell, { flex: 0.8, color: "#E65100", fontWeight: "600" }]}>ر.ع.{taxAmt.toFixed(3)}</Text>
                <Text style={[detailStyles.toolCell, { flex: 0.9, fontWeight: "600" }]}>ر.ع.{finalAmt.toFixed(3)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Open Full Order button */}
      <TouchableOpacity
        style={detailStyles.openBtn}
        activeOpacity={0.7}
        onPress={() => navigation.navigate("RentalOrderFormScreen", { order, mode: "edit" })}
      >
        <Text style={detailStyles.openBtnText}>Open Full Order</Text>
      </TouchableOpacity>
    </View>
  );
};

const DetailRow = ({ label, value, valueColor }) => (
  <View style={detailStyles.detailRow}>
    <Text style={detailStyles.detailLabel}>{label}:</Text>
    <Text style={[detailStyles.detailValue, valueColor && { color: valueColor, fontWeight: "700" }]}>{value}</Text>
  </View>
);

const detailStyles = StyleSheet.create({
  container: { backgroundColor: "#fafafa", paddingHorizontal: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#e0e0e0" },
  infoRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  infoCard: { flex: 1, backgroundColor: "#fff", borderRadius: 8, padding: 10, borderLeftWidth: 3, elevation: 1 },
  infoTitle: { fontSize: 11, fontWeight: "700", color: "#1565C0", marginBottom: 6 },
  detailRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  detailLabel: { fontSize: 10, fontWeight: "600", color: "#555" },
  detailValue: { fontSize: 10, color: "#333", marginLeft: 2, flex: 1 },
  custBadge: { backgroundColor: "#4CAF50", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginLeft: 4 },
  custBadgeText: { fontSize: 9, color: "#fff", fontWeight: "700" },
  toolsSection: { marginBottom: 10 },
  toolsTitle: { fontSize: 12, fontWeight: "700", color: "#1565C0", marginBottom: 6 },
  toolHeaderRow: { flexDirection: "row", backgroundColor: "#1565C0", paddingVertical: 6, paddingHorizontal: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  toolHCell: { fontSize: 8, fontWeight: "700", color: "#fff", textAlign: "center" },
  toolDataRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: "#e8e8e8", backgroundColor: "#fff" },
  toolCell: { fontSize: 9, color: "#333", textAlign: "center" },
  openBtn: { alignSelf: "flex-end", backgroundColor: "#714B67", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  openBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});

// ── Main screen ──────────────────────────────────────────────────
const TaxDetailsScreen = ({ navigation }) => {
  const odooAuth = useAuthStore((s) => s.odooAuth);
  const orders = useToolStore((s) => s.orders);
  const fetchOrders = useToolStore((s) => s.fetchOrders);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (odooAuth) fetchOrders(odooAuth);
    }, [odooAuth])
  );

  const taxedOrders = useMemo(() => {
    return orders.filter((o) => {
      const taxTotal = o.lines?.reduce((s, l) => s + (parseFloat(l.tax_amount) || 0), 0) || 0;
      return taxTotal > 0 || parseFloat(o.tax_total || 0) > 0;
    });
  }, [orders]);

  const summary = useMemo(() => {
    const totalTaxed = taxedOrders.length;
    const totalTax = taxedOrders.reduce((s, o) => {
      const lineTax = o.lines?.reduce((ls, l) => ls + (parseFloat(l.tax_amount) || 0), 0) || 0;
      return s + (lineTax || parseFloat(o.tax_total || 0));
    }, 0);
    const avgTax = totalTaxed ? totalTax / totalTaxed : 0;
    const totalRevenue = taxedOrders.reduce((s, o) => s + (o.total_amount || 0), 0);
    return { totalTaxed, totalTax, avgTax, totalRevenue };
  }, [taxedOrders]);

  const filtered = useMemo(() => {
    return taxedOrders.filter((o) => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const match =
          (o.customer_id || "").toLowerCase().includes(q) ||
          (o.name || "").toLowerCase().includes(q) ||
          (o.partner_name || "").toLowerCase().includes(q) ||
          (o.partner_phone || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (selectedStatus !== "all" && o.state !== selectedStatus) return false;
      return true;
    });
  }, [taxedOrders, searchQuery, selectedStatus]);

  const toggleExpand = (id) => setExpandedId((prev) => (prev === id ? null : id));

  const TableHeader = () => (
    <View style={styles.headerRow}>
      <Text style={[styles.hCell, { width: 26 }]}>#</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 1.1 }]}>Customer ID</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 1.4 }]}>Order</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 1.5 }]}>Customer</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 1 }]}>Date</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 0.9 }]}>Subtotal</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 0.9 }]}>Tax</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 1 }]}>Total Amount</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 1 }]}>Status</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { width: 26 }]}></Text>
    </View>
  );

  const renderRow = ({ item, index }) => {
    const stateInfo = STATE_CONFIG[item.state] || STATE_CONFIG.draft;
    const isExpanded = expandedId === item.id;
    const formatDate = (d) => (d ? d.split(" ")[0] : "-");
    const taxTotal = item.lines?.reduce((s, l) => s + (parseFloat(l.tax_amount) || 0), 0) || parseFloat(item.tax_total || 0);
    const subtotal = item.subtotal || 0;
    const totalAmount = item.total_amount || 0;

    return (
      <View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => toggleExpand(item.id)}
          style={[styles.dataRow, index % 2 === 0 && { backgroundColor: "#fafafa" }]}
        >
          <Text style={[styles.cell, { width: 26 }]}>{index + 1}</Text>
          <View style={styles.vLineData} />
          <View style={{ flex: 1.1, alignItems: "center", justifyContent: "center" }}>
            {item.customer_id ? (
              <View style={[styles.custIdBadge, { backgroundColor: "#4CAF50" }]}>
                <Text style={styles.custIdText}>{item.customer_id}</Text>
              </View>
            ) : (
              <View style={[styles.custIdBadge, { backgroundColor: "#9E9E9E" }]}>
                <Text style={styles.custIdText}>N/A</Text>
              </View>
            )}
          </View>
          <View style={styles.vLineData} />
          <Text style={[styles.cell, { flex: 1.4 }]}>{item.name}</Text>
          <View style={styles.vLineData} />
          <Text style={[styles.cell, { flex: 1.5, textAlign: "left", paddingLeft: 4 }]} numberOfLines={1}>{item.partner_name || "-"}</Text>
          <View style={styles.vLineData} />
          <Text style={[styles.cell, { flex: 1 }]}>{formatDate(item.date_order)}</Text>
          <View style={styles.vLineData} />
          <Text style={[styles.cell, { flex: 0.9 }]}>ر.ع.{subtotal.toFixed(3)}</Text>
          <View style={styles.vLineData} />
          <View style={{ flex: 0.9, alignItems: "center", justifyContent: "center", backgroundColor: "#E3F2FD", borderRadius: 4, marginHorizontal: 1 }}>
            <Text style={[styles.cell, { color: "#E65100", fontWeight: "600" }]}>+ ر.ع.{taxTotal.toFixed(3)}</Text>
          </View>
          <View style={styles.vLineData} />
          <Text style={[styles.cell, { flex: 1, fontWeight: "600", color: "#333" }]}>ر.ع.{totalAmount.toFixed(3)}</Text>
          <View style={styles.vLineData} />
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <View style={[styles.statusBadge, { backgroundColor: stateInfo.color }]}>
              <Text style={styles.statusText}>{stateInfo.label}</Text>
            </View>
          </View>
          <View style={styles.vLineData} />
          <View style={{ width: 26, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 12, color: COLORS.gray }}>{isExpanded ? "\u25B2" : "\u25BC"}</Text>
          </View>
        </TouchableOpacity>
        {isExpanded && <TaxDetail order={item} navigation={navigation} />}
      </View>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Tax Details" navigation={navigation} />
      <RoundedContainer>
        <Text style={styles.showingText}>Showing {filtered.length} taxed orders</Text>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderLeftColor: "#1565C0" }]}>
            <Text style={styles.summaryLabel}>TAXED ORDERS</Text>
            <Text style={[styles.summaryNumber, { color: "#333" }]}>{summary.totalTaxed}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: "#E65100" }]}>
            <Text style={styles.summaryLabel}>TOTAL TAX COLLECTED</Text>
            <Text style={[styles.summaryNumber, { color: "#E65100" }]}>ر.ع.{summary.totalTax.toFixed(3)}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: "#2196F3" }]}>
            <Text style={styles.summaryLabel}>AVG. TAX/ORDER</Text>
            <Text style={[styles.summaryNumber, { color: "#2196F3" }]}>ر.ع.{summary.avgTax.toFixed(3)}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: "#28a745" }]}>
            <Text style={styles.summaryLabel}>TOTAL REVENUE (INCL. TAX)</Text>
            <Text style={[styles.summaryNumber, { color: "#28a745" }]}>ر.ع.{summary.totalRevenue.toFixed(3)}</Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by Customer ID, Order, Name..."
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
          <DropdownPicker label="All Statuses" value={selectedStatus} options={STATUS_OPTIONS} onSelect={setSelectedStatus} />
        </View>

        <View style={styles.tableHeader}>
          <TableHeader />
        </View>
        <FlatList
          data={filtered}
          renderItem={renderRow}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No taxed orders found</Text>
            </View>
          }
        />
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  showingText: { fontSize: 12, color: COLORS.gray, textAlign: "right", paddingHorizontal: SPACING.paddingMedium, paddingTop: 8 },
  summaryRow: { flexDirection: "row", paddingHorizontal: SPACING.paddingMedium, paddingTop: 8, paddingBottom: 4, gap: 6 },
  summaryCard: { flex: 1, backgroundColor: COLORS.white, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 10, borderLeftWidth: 3, elevation: 2 },
  summaryLabel: { fontSize: 8, fontWeight: "700", color: COLORS.gray, letterSpacing: 0.3, marginBottom: 4 },
  summaryNumber: { fontSize: 18, fontWeight: "700" },
  filterRow: { flexDirection: "row", paddingHorizontal: SPACING.paddingMedium, paddingVertical: 8, gap: 8, alignItems: "center" },
  searchBox: { flex: 2, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#ddd", borderRadius: BORDER_RADIUS.medium, backgroundColor: "#fff" },
  searchInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: "#333" },
  clearBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  clearBtnText: { fontSize: 14, color: COLORS.gray, fontWeight: "600" },
  tableHeader: { backgroundColor: "#1565C0" },
  headerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 4 },
  hCell: { fontSize: 9, fontWeight: "700", color: "#fff", textAlign: "center" },
  dataRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: "#e0e0e0", backgroundColor: COLORS.white },
  cell: { fontSize: 10, color: COLORS.black, textAlign: "center" },
  vLine: { width: 1, alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.3)" },
  vLineData: { width: 1, alignSelf: "stretch", backgroundColor: "#e0e0e0" },
  custIdBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  custIdText: { fontSize: 8, color: "#fff", fontWeight: "700" },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  statusText: { color: "#fff", fontSize: 8, fontWeight: "700" },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 100 },
  emptyText: { fontSize: 18, fontWeight: "600", color: COLORS.gray },
});

export default TaxDetailsScreen;
