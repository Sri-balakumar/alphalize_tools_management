import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
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

const FILTER_TABS = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Checked Out", value: "checked_out" },
  { label: "Checked In", value: "checked_in" },
  { label: "Done", value: "done" },
  { label: "Invoiced", value: "invoiced" },
];

const RentalOrdersScreen = ({ navigation }) => {
  const orders = useToolStore((s) => s.orders);
  const fetchOrders = useToolStore((s) => s.fetchOrders);
  const odooAuth = useAuthStore((s) => s.odooAuth);
  const [activeFilter, setActiveFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (odooAuth) {
        setRefreshing(true);
        fetchOrders(odooAuth).finally(() => setRefreshing(false));
      }
    }, [odooAuth, fetchOrders])
  );

  const filteredOrders =
    activeFilter === "all"
      ? orders
      : orders.filter((o) => o.state === activeFilter);

  const renderFilterTabs = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterContent}
    >
      {FILTER_TABS.map((tab) => (
        <TouchableOpacity
          key={tab.value}
          style={[
            styles.filterTab,
            activeFilter === tab.value && styles.filterTabActive,
          ]}
          onPress={() => setActiveFilter(tab.value)}
        >
          <Text
            style={[
              styles.filterTabText,
              activeFilter === tab.value && styles.filterTabTextActive,
            ]}
          >
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderOrder = ({ item }) => {
    const stateInfo = STATE_CONFIG[item.state] || STATE_CONFIG.draft;
    const toolCount = item.line_ids?.length || item.lines?.length || 0;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() =>
          navigation.navigate("RentalOrderFormScreen", {
            order: item,
            mode: "edit",
          })
        }
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderRef}>{item.name}</Text>
            <Text style={styles.customerName}>{item.partner_name}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: stateInfo.color }]}>
            <Text style={styles.badgeText}>{stateInfo.label}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.dateRow}>
            <View style={styles.dateItem}>
              <Text style={styles.dateLabel}>Order Date</Text>
              <Text style={styles.dateValue}>{item.date_order || "-"}</Text>
            </View>
            <View style={styles.dateItem}>
              <Text style={styles.dateLabel}>Planned Out</Text>
              <Text style={styles.dateValue}>
                {item.date_planned_checkout || "-"}
              </Text>
            </View>
            <View style={styles.dateItem}>
              <Text style={styles.dateLabel}>Planned In</Text>
              <Text style={styles.dateValue}>
                {item.date_planned_checkin || "-"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.durationText}>
            {item.rental_duration || 1} {item.rental_period_type || "day"}(s)
          </Text>
          {toolCount > 0 && (
            <Text style={styles.toolCountText}>
              {toolCount} tool(s)
            </Text>
          )}
          <Text style={styles.amountText}>
            ${item.total_amount?.toFixed(2) || "0.00"}
          </Text>
        </View>

        {parseFloat(item.advance_amount) > 0 && (
          <View style={styles.depositRow}>
            <Text style={styles.depositText}>
              Advance: ${parseFloat(item.advance_amount).toFixed(2)}
            </Text>
            {item.advance_returned && (
              <Text style={styles.depositReturned}>Returned</Text>
            )}
          </View>
        )}

        {item.is_late && (
          <View style={styles.lateWarning}>
            <Text style={styles.lateText}>LATE RETURN</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No rental orders</Text>
      <Text style={styles.emptySubText}>
        Tap + to create a new rental order
      </Text>
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Rental Orders"
        navigation={navigation}
        rightComponent={
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("RentalOrderFormScreen", { mode: "create" })
            }
            style={styles.addBtn}
          >
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        }
      />
      <RoundedContainer>
        {renderFilterTabs()}
        <FlatList
          data={filteredOrders}
          renderItem={renderOrder}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          refreshing={refreshing}
          onRefresh={() => {
            if (odooAuth) {
              setRefreshing(true);
              fetchOrders(odooAuth).finally(() => setRefreshing(false));
            }
          }}
        />
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  filterScroll: {
    maxHeight: 44,
    paddingTop: 10,
  },
  filterContent: {
    paddingHorizontal: SPACING.paddingMedium,
    gap: 6,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
  },
  filterTabActive: {
    backgroundColor: COLORS.primaryThemeColor,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.gray,
  },
  filterTabTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  list: {
    padding: SPACING.paddingMedium,
    flexGrow: 1,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.paddingMedium,
    marginBottom: SPACING.marginSmall,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  orderRef: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.primaryThemeColor,
  },
  customerName: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.black,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 11,
    color: COLORS.white,
    fontWeight: "600",
  },
  cardBody: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  dateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dateItem: {
    alignItems: "center",
  },
  dateLabel: {
    fontSize: 10,
    color: COLORS.gray,
    marginBottom: 2,
  },
  dateValue: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.black,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  durationText: {
    fontSize: 13,
    color: COLORS.gray,
  },
  toolCountText: {
    fontSize: 12,
    color: COLORS.primaryThemeColor,
    fontWeight: "500",
  },
  amountText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primaryThemeColor,
  },
  depositRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  depositText: {
    fontSize: 12,
    color: COLORS.gray,
  },
  depositReturned: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4CAF50",
  },
  lateWarning: {
    marginTop: 8,
    backgroundColor: "#FFF3E0",
    padding: 6,
    borderRadius: 4,
    alignItems: "center",
  },
  lateText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#E65100",
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  addBtnText: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "bold",
    marginTop: -2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.gray,
  },
  emptySubText: {
    fontSize: 14,
    color: COLORS.gray,
    marginTop: 6,
  },
});

export default RentalOrdersScreen;
