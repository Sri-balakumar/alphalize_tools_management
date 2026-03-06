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
  invoiced: { label: "Invoiced", color: "#4CAF50" },
  cancelled: { label: "Cancelled", color: "#F44336" },
};

const STATUS_OPTIONS = [
  { label: "All Statuses", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Checked Out", value: "checked_out" },
  { label: "Checked In", value: "checked_in" },
  { label: "Done", value: "done" },
  { label: "Invoiced", value: "invoiced" },
  { label: "Cancelled", value: "cancelled" },
];

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
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  triggerText: { fontSize: 13, color: "#333", fontWeight: "500", flex: 1 },
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
    width: 240,
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

// ── Expanded detail section ───────────────────────────────────────
const OrderDetail = ({ order, navigation }) => {
  const formatDate = (d) => (d ? d.split(" ")[0] : "-");

  return (
    <View style={detailStyles.container}>
      {/* Three-column info cards */}
      <View style={detailStyles.infoRow}>
        {/* Customer Details */}
        <View style={[detailStyles.infoCard, { borderLeftColor: "#714B67" }]}>
          <Text style={detailStyles.infoTitle}>Customer Details</Text>
          <DetailRow label="Name" value={order.partner_name} />
          <DetailRow label="Phone" value={order.partner_phone || "-"} />
          <DetailRow label="Email" value={order.partner_email || "-"} />
          {order.customer_id ? (
            <View style={detailStyles.detailRow}>
              <Text style={detailStyles.detailLabel}>Customer ID:</Text>
              <View style={[detailStyles.custBadge, { backgroundColor: "#4CAF50" }]}>
                <Text style={detailStyles.custBadgeText}>{order.customer_id}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Rental Period */}
        <View style={[detailStyles.infoCard, { borderLeftColor: "#FF9800" }]}>
          <Text style={detailStyles.infoTitle}>Rental Period</Text>
          <DetailRow label="Order Date" value={formatDate(order.date_order)} />
          <DetailRow label="Check-Out" value={formatDate(order.date_checkout || order.date_planned_checkout)} />
          <DetailRow label="Check-In" value={formatDate(order.date_checkin || order.date_planned_checkin)} />
          <DetailRow label="Planned Return" value={formatDate(order.date_planned_checkin)} />
          <DetailRow label="Duration" value={`${order.rental_duration || 1} ${(order.rental_period_type || "Day").charAt(0).toUpperCase() + (order.rental_period_type || "day").slice(1)}`} />
          <DetailRow label="Billing" value={(order.rental_period_type || "Day").charAt(0).toUpperCase() + (order.rental_period_type || "day").slice(1)} />
        </View>

        {/* Financial Summary */}
        <View style={[detailStyles.infoCard, { borderLeftColor: "#4CAF50" }]}>
          <Text style={detailStyles.infoTitle}>Financial Summary</Text>
          <DetailRow label="Subtotal" value={`$ ${(order.subtotal || 0).toFixed(2)}`} />
          <View style={detailStyles.detailRow}>
            <Text style={[detailStyles.detailLabel, { fontWeight: "700", fontSize: 13 }]}>Total:</Text>
            <Text style={[detailStyles.detailValue, { fontWeight: "700", fontSize: 13, color: "#714B67" }]}>
              $ {(order.total_amount || 0).toFixed(2)}
            </Text>
          </View>
          <DetailRow label="Advance" value={`$ ${parseFloat(order.advance_amount || 0).toFixed(2)}`} />
          <DetailRow label="Responsible" value={order.responsible || "Admin"} />
        </View>
      </View>

      {/* Tools / Equipment sub-table */}
      {order.lines && order.lines.length > 0 && (
        <View style={detailStyles.toolsSection}>
          <Text style={detailStyles.toolsTitle}>Tools / Equipment</Text>
          {/* Header */}
          <View style={detailStyles.toolHeaderRow}>
            <Text style={[detailStyles.toolHCell, { width: 24 }]}>#</Text>
            <Text style={[detailStyles.toolHCell, { flex: 1.5 }]}>Tool</Text>
            <Text style={[detailStyles.toolHCell, { flex: 1 }]}>Serial No.</Text>
            <Text style={[detailStyles.toolHCell, { flex: 1 }]}>Out Cond.</Text>
            <Text style={[detailStyles.toolHCell, { flex: 1 }]}>In Cond.</Text>
            <Text style={[detailStyles.toolHCell, { flex: 0.8 }]}>Price/Day</Text>
            <Text style={[detailStyles.toolHCell, { flex: 0.7 }]}>Duration</Text>
            <Text style={[detailStyles.toolHCell, { flex: 0.9 }]}>Rental Cost</Text>
            <Text style={[detailStyles.toolHCell, { flex: 0.7 }]}>Late Fee</Text>
            <Text style={[detailStyles.toolHCell, { flex: 0.7 }]}>Damage</Text>
            <Text style={[detailStyles.toolHCell, { flex: 1 }]}>Damage Note</Text>
          </View>
          {/* Rows */}
          {order.lines.map((line, idx) => {
            const outCond = line.checkout_condition || "-";
            const inCond = line.checkin_condition || "-";
            const condColor = (c) => {
              if (!c || c === "-") return "#333";
              if (c.toLowerCase() === "excellent" || c.toLowerCase() === "good") return "#4CAF50";
              if (c.toLowerCase() === "fair") return "#FF9800";
              return "#F44336";
            };
            return (
              <View key={line.id} style={[detailStyles.toolDataRow, idx % 2 === 0 && { backgroundColor: "#fafafa" }]}>
                <Text style={[detailStyles.toolCell, { width: 24 }]}>{idx + 1}</Text>
                <Text style={[detailStyles.toolCell, { flex: 1.5 }]} numberOfLines={1}>{line.tool_name || "-"}</Text>
                <Text style={[detailStyles.toolCell, { flex: 1 }]}>{line.serial_number || "-"}</Text>
                <Text style={[detailStyles.toolCell, { flex: 1, color: condColor(outCond) }]}>{outCond}</Text>
                <Text style={[detailStyles.toolCell, { flex: 1, color: condColor(inCond) }]}>{inCond}</Text>
                <Text style={[detailStyles.toolCell, { flex: 0.8 }]}>$ {parseFloat(line.unit_price || 0).toFixed(2)}</Text>
                <Text style={[detailStyles.toolCell, { flex: 0.7 }]}>{line.planned_duration || "-"} Days</Text>
                <Text style={[detailStyles.toolCell, { flex: 0.9 }]}>$ {(line.rental_cost || 0).toFixed(2)}</Text>
                <Text style={[detailStyles.toolCell, { flex: 0.7 }]}>$ {parseFloat(line.late_fee_amount || 0).toFixed(2)}</Text>
                <Text style={[detailStyles.toolCell, { flex: 0.7 }]}>$ {parseFloat(line.damage_charge || 0).toFixed(2)}</Text>
                <Text style={[detailStyles.toolCell, { flex: 1 }]} numberOfLines={1}>{line.damage_note || "-"}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Open Full Order button */}
      <TouchableOpacity
        style={detailStyles.openBtn}
        activeOpacity={0.7}
        onPress={() =>
          navigation.navigate("RentalOrderFormScreen", {
            order,
            mode: "edit",
          })
        }
      >
        <Text style={detailStyles.openBtnText}>Open Full Order</Text>
      </TouchableOpacity>
    </View>
  );
};

const DetailRow = ({ label, value }) => (
  <View style={detailStyles.detailRow}>
    <Text style={detailStyles.detailLabel}>{label}:</Text>
    <Text style={detailStyles.detailValue}>{value}</Text>
  </View>
);

const detailStyles = StyleSheet.create({
  container: {
    backgroundColor: "#fafafa",
    paddingHorizontal: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  infoRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  infoCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  infoTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#714B67",
    marginBottom: 6,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#555",
  },
  detailValue: {
    fontSize: 10,
    color: "#333",
    marginLeft: 2,
    flex: 1,
  },
  custBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 4,
  },
  custBadgeText: {
    fontSize: 9,
    color: "#fff",
    fontWeight: "700",
  },
  toolsSection: {
    marginBottom: 10,
  },
  toolsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#714B67",
    marginBottom: 6,
  },
  toolHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#714B67",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  toolHCell: {
    fontSize: 8,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  toolDataRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e8e8e8",
    backgroundColor: "#fff",
  },
  toolCell: {
    fontSize: 9,
    color: "#333",
    textAlign: "center",
  },
  openBtn: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#714B67",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  openBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});

// ── Main screen ───────────────────────────────────────────────────
const OrderReportsScreen = ({ navigation }) => {
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

  // Summary
  const summary = useMemo(() => {
    const totalOrders = orders.length;
    const activeRentals = orders.filter(
      (o) => o.state === "checked_out" || o.state === "confirmed"
    ).length;
    const totalRevenue = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
    const lateReturns = orders.filter((o) => o.is_late).length;
    return { totalOrders, activeRentals, totalRevenue, lateReturns };
  }, [orders]);

  // Filtered orders
  const filtered = useMemo(() => {
    return orders.filter((o) => {
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
  }, [orders, searchQuery, selectedStatus]);

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // ── Table header ──
  const TableHeader = () => (
    <View style={styles.headerRow}>
      <Text style={[styles.hCell, { width: 28 }]}>#</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 1.2 }]}>Customer ID</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 1.5 }]}>Order</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 2 }]}>Customer</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 1.3 }]}>Phone</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 1 }]}>Date</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 1.1 }]}>Status</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { flex: 1 }]}>Amount</Text>
      <View style={styles.vLine} />
      <Text style={[styles.hCell, { width: 28 }]}></Text>
    </View>
  );

  // ── Table row ──
  const renderRow = ({ item, index }) => {
    const stateInfo = STATE_CONFIG[item.state] || STATE_CONFIG.draft;
    const isExpanded = expandedId === item.id;
    const formatDate = (d) => (d ? d.split(" ")[0] : "-");
    const custId = item.customer_id;

    return (
      <View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => toggleExpand(item.id)}
          style={[styles.dataRow, index % 2 === 0 && { backgroundColor: "#fafafa" }]}
        >
          <Text style={[styles.cell, { width: 28 }]}>{index + 1}</Text>
          <View style={styles.vLineData} />
          <View style={{ flex: 1.2, alignItems: "center", justifyContent: "center" }}>
            {custId ? (
              <View style={[styles.custIdBadge, { backgroundColor: "#4CAF50" }]}>
                <Text style={styles.custIdText}>{custId}</Text>
              </View>
            ) : (
              <View style={[styles.custIdBadge, { backgroundColor: "#9E9E9E" }]}>
                <Text style={styles.custIdText}>N/A</Text>
              </View>
            )}
          </View>
          <View style={styles.vLineData} />
          <Text style={[styles.cell, { flex: 1.5 }]}>{item.name}</Text>
          <View style={styles.vLineData} />
          <Text style={[styles.cell, { flex: 2, textAlign: "left", paddingLeft: 4 }]} numberOfLines={1}>
            {item.partner_name || "-"}
          </Text>
          <View style={styles.vLineData} />
          <Text style={[styles.cell, { flex: 1.3 }]}>{item.partner_phone || "-"}</Text>
          <View style={styles.vLineData} />
          <Text style={[styles.cell, { flex: 1 }]}>{formatDate(item.date_order)}</Text>
          <View style={styles.vLineData} />
          <View style={{ flex: 1.1, alignItems: "center", justifyContent: "center" }}>
            <View style={[styles.statusBadge, { backgroundColor: stateInfo.color }]}>
              <Text style={styles.statusText}>{stateInfo.label}</Text>
            </View>
          </View>
          <View style={styles.vLineData} />
          <Text style={[styles.cell, { flex: 1, fontWeight: "600", color: "#333" }]}>
            $ {(item.total_amount || 0).toFixed(2)}
          </Text>
          <View style={styles.vLineData} />
          <View style={{ width: 28, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 12, color: COLORS.gray }}>{isExpanded ? "\u25B2" : "\u25BC"}</Text>
          </View>
        </TouchableOpacity>
        {isExpanded && <OrderDetail order={item} navigation={navigation} />}
      </View>
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Order Reports" navigation={navigation} />
      <RoundedContainer>
        {/* Count label */}
        <Text style={styles.showingText}>Showing {filtered.length} orders</Text>

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderLeftColor: "#714B67" }]}>
            <Text style={styles.summaryLabel}>TOTAL ORDERS</Text>
            <Text style={[styles.summaryNumber, { color: "#333" }]}>{summary.totalOrders}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: "#FF9800" }]}>
            <Text style={styles.summaryLabel}>ACTIVE RENTALS</Text>
            <Text style={[styles.summaryNumber, { color: "#FF9800" }]}>{summary.activeRentals}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: "#4CAF50" }]}>
            <Text style={styles.summaryLabel}>TOTAL REVENUE</Text>
            <Text style={[styles.summaryNumber, { color: "#4CAF50" }]}>$ {summary.totalRevenue.toFixed(2)}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: "#F44336" }]}>
            <Text style={styles.summaryLabel}>LATE RETURNS</Text>
            <Text style={[styles.summaryNumber, { color: "#F44336" }]}>{summary.lateReturns}</Text>
          </View>
        </View>

        {/* Search + Status filter */}
        <View style={styles.filterRow}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by Customer ID, Order, Name, Phone..."
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
          <DropdownPicker
            label="All Statuses"
            value={selectedStatus}
            options={STATUS_OPTIONS}
            onSelect={setSelectedStatus}
          />
        </View>

        {/* Table */}
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
              <Text style={styles.emptyText}>No orders found</Text>
            </View>
          }
        />
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  showingText: {
    fontSize: 12,
    color: COLORS.gray,
    textAlign: "right",
    paddingHorizontal: SPACING.paddingMedium,
    paddingTop: 8,
  },
  // Summary
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.paddingMedium,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderLeftWidth: 3,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  summaryLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: COLORS.gray,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  summaryNumber: {
    fontSize: 18,
    fontWeight: "700",
  },
  // Filter
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.paddingMedium,
    paddingVertical: 8,
    gap: 8,
    alignItems: "center",
  },
  searchBox: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: BORDER_RADIUS.medium,
    backgroundColor: "#fff",
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: "#333",
  },
  clearBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  clearBtnText: { fontSize: 14, color: COLORS.gray, fontWeight: "600" },
  // Table
  tableHeader: {
    backgroundColor: "#714B67",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  hCell: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
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
  custIdBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  custIdText: {
    fontSize: 8,
    color: "#fff",
    fontWeight: "700",
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusText: {
    color: "#fff",
    fontSize: 8,
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

export default OrderReportsScreen;
