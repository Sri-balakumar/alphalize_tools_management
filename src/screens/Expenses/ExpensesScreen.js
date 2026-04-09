import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, RoundedContainer } from "@components/containers";
import NavigationHeader from "@components/Header/NavigationHeader";
import { showToastMessage } from "@components/Toast";
import useToolStore from "@stores/toolManagement/useToolStore";
import useAuthStore from "@stores/auth/useAuthStore";

const STATE_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  done: "Paid",
  refused: "Refused",
};

const STATE_COLORS = {
  draft: "#9E9E9E",
  submitted: "#1976D2",
  approved: "#FB8C00",
  done: "#388E3C",
  refused: "#D32F2F",
};

const CATEGORY_LABELS = {
  fuel: "Fuel",
  repair: "Repair / Maintenance",
  tools: "Tools / Equipment",
  transport: "Transport",
  office: "Office",
  food: "Food / Travel",
  rent: "Rent / Utilities",
  other: "Other",
};

const PERIOD_LABELS = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  year: "This Year",
  all: "All Time",
};

const periodBounds = (period) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  switch (period) {
    case "today":
      return [startOfDay, endOfDay];
    case "week": {
      const day = now.getDay() || 7;
      const monday = new Date(startOfDay);
      monday.setDate(monday.getDate() - (day - 1));
      return [monday, endOfDay];
    }
    case "month":
      return [new Date(now.getFullYear(), now.getMonth(), 1), endOfDay];
    case "year":
      return [new Date(now.getFullYear(), 0, 1), endOfDay];
    case "all":
    default:
      return [null, null];
  }
};

const formatMoney = (val) => "ر.ع." + (parseFloat(val) || 0).toFixed(3);

const ExpensesScreen = ({ navigation }) => {
  const odooAuth = useAuthStore((s) => s.odooAuth);
  const expenses = useToolStore((s) => s.expenses);
  const fetchExpenses = useToolStore((s) => s.fetchExpenses);

  const [stateFilter, setStateFilter] = useState("all");
  const [period, setPeriod] = useState("month");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!odooAuth) return;
      setLoading(true);
      fetchExpenses(odooAuth).finally(() => setLoading(false));
    }, [odooAuth])
  );

  const onRefresh = async () => {
    if (!odooAuth) return;
    setRefreshing(true);
    try {
      await fetchExpenses(odooAuth);
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = useMemo(() => {
    const [from, to] = periodBounds(period);
    const q = (search || "").toLowerCase().trim();
    return (expenses || []).filter((e) => {
      if (stateFilter !== "all" && e.state !== stateFilter) return false;
      if (from || to) {
        if (!e.date) return false;
        const d = new Date(e.date);
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      if (q) {
        const blob = (
          (e.name || "") +
          " " +
          (e.user_name || "") +
          " " +
          (CATEGORY_LABELS[e.category] || "")
        ).toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [expenses, stateFilter, period, search]);

  const totals = useMemo(() => {
    let total = 0,
      paid = 0,
      pending = 0;
    for (const e of filtered) {
      const amt = parseFloat(e.total_amount) || 0;
      total += amt;
      if (e.state === "done") paid += amt;
      else if (["submitted", "approved"].includes(e.state)) pending += amt;
    }
    return { total, paid, pending, count: filtered.length };
  }, [filtered]);

  const openNew = () => navigation.navigate("ExpenseFormScreen", { id: null });
  const openExisting = (expense) =>
    navigation.navigate("ExpenseFormScreen", { id: expense.odoo_id });

  const renderRow = ({ item }) => (
    <TouchableOpacity style={styles.row} onPress={() => openExisting(item)} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name || "(no description)"}
          </Text>
          <View style={[styles.badge, { backgroundColor: STATE_COLORS[item.state] || "#888" }]}>
            <Text style={styles.badgeText}>{STATE_LABELS[item.state] || item.state}</Text>
          </View>
        </View>
        <View style={styles.rowMeta}>
          <Text style={styles.rowMetaText}>{item.date || "—"}</Text>
          <Text style={styles.rowMetaDot}>·</Text>
          <Text style={styles.rowMetaText}>{item.category_label || CATEGORY_LABELS[item.category] || item.category || "—"}</Text>
          <Text style={styles.rowMetaDot}>·</Text>
          <Text style={styles.rowMetaText} numberOfLines={1}>
            {item.user_name || "—"}
          </Text>
        </View>
      </View>
      <Text style={styles.rowAmount}>{formatMoney(item.total_amount)}</Text>
    </TouchableOpacity>
  );

  const stateButtons = [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft" },
    { key: "submitted", label: "Submitted" },
    { key: "approved", label: "Approved" },
    { key: "done", label: "Paid" },
    { key: "refused", label: "Refused" },
  ];
  const periodButtons = [
    { key: "today", label: "Today" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "year", label: "Year" },
    { key: "all", label: "All" },
  ];

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Expenses"
        navigation={navigation}
        rightComponent={
          <TouchableOpacity onPress={openNew} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ New</Text>
          </TouchableOpacity>
        }
      />
      <RoundedContainer>
        <View style={{ padding: 14, paddingBottom: 0 }}>
          {/* Period pills */}
          <View style={styles.pillBar}>
            {periodButtons.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.pill, period === p.key && styles.pillActive]}
                onPress={() => setPeriod(p.key)}
              >
                <Text style={[styles.pillText, period === p.key && styles.pillTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Totals card */}
          <View style={styles.totalsCard}>
            <View style={styles.totalsCol}>
              <Text style={styles.totalsLabel}>Total</Text>
              <Text style={[styles.totalsValue, { color: "#714B67" }]}>
                {formatMoney(totals.total)}
              </Text>
            </View>
            <View style={styles.totalsDivider} />
            <View style={styles.totalsCol}>
              <Text style={styles.totalsLabel}>Paid</Text>
              <Text style={[styles.totalsValue, { color: "#388E3C" }]}>
                {formatMoney(totals.paid)}
              </Text>
            </View>
            <View style={styles.totalsDivider} />
            <View style={styles.totalsCol}>
              <Text style={styles.totalsLabel}>Pending</Text>
              <Text style={[styles.totalsValue, { color: "#FB8C00" }]}>
                {formatMoney(totals.pending)}
              </Text>
            </View>
            <View style={styles.totalsDivider} />
            <View style={styles.totalsCol}>
              <Text style={styles.totalsLabel}>Count</Text>
              <Text style={[styles.totalsValue, { color: "#1976D2" }]}>{totals.count}</Text>
            </View>
          </View>

          {/* Search */}
          <TextInput
            style={styles.search}
            placeholder="Search expenses..."
            placeholderTextColor="#999"
            value={search}
            onChangeText={setSearch}
          />

          {/* State filter pills */}
          <View style={styles.pillBar}>
            {stateButtons.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[
                  styles.statePill,
                  stateFilter === s.key && styles.statePillActive,
                  s.key !== "all" && { borderColor: STATE_COLORS[s.key] },
                  stateFilter === s.key && s.key !== "all" && {
                    backgroundColor: STATE_COLORS[s.key],
                  },
                ]}
                onPress={() => setStateFilter(s.key)}
              >
                <Text
                  style={[
                    styles.statePillText,
                    stateFilter === s.key && styles.statePillTextActive,
                    s.key !== "all" && { color: STATE_COLORS[s.key] },
                    stateFilter === s.key && { color: "#fff" },
                  ]}
                >
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#714B67" />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderRow}
            contentContainerStyle={{ padding: 14, paddingTop: 6, paddingBottom: 80 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No expenses for this filter</Text>
                <TouchableOpacity onPress={openNew} style={styles.emptyBtn}>
                  <Text style={styles.emptyBtnText}>+ Record First Expense</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  addBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addBtnText: { color: "#714B67", fontSize: 13, fontWeight: "800" },

  pillBar: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  pillActive: { backgroundColor: "#714B67", borderColor: "#714B67" },
  pillText: { fontSize: 11, color: "#555", fontWeight: "600" },
  pillTextActive: { color: "#fff" },

  statePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  statePillActive: { backgroundColor: "#714B67", borderColor: "#714B67" },
  statePillText: { fontSize: 11, color: "#555", fontWeight: "700" },
  statePillTextActive: { color: "#fff" },

  totalsCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  totalsCol: { flex: 1, alignItems: "center" },
  totalsDivider: { width: 1, backgroundColor: "#eee" },
  totalsLabel: { fontSize: 10, color: "#888", textTransform: "uppercase", marginBottom: 4 },
  totalsValue: { fontSize: 14, fontWeight: "800" },

  search: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    backgroundColor: "#fff",
    color: "#222",
    marginBottom: 10,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowName: { flex: 1, fontSize: 14, fontWeight: "800", color: "#333", marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  rowMeta: { flexDirection: "row", alignItems: "center", marginTop: 4, flexWrap: "wrap" },
  rowMetaText: { fontSize: 11, color: "#666" },
  rowMetaDot: { fontSize: 11, color: "#bbb", marginHorizontal: 6 },
  rowAmount: { fontSize: 15, fontWeight: "800", color: "#714B67", marginLeft: 12 },

  center: { padding: 32, alignItems: "center" },
  emptyBox: { padding: 32, alignItems: "center" },
  emptyText: { color: "#999", fontSize: 13, marginBottom: 12 },
  emptyBtn: {
    backgroundColor: "#714B67",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});

export default ExpensesScreen;
