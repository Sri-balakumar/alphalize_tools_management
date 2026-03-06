<<<<<<< HEAD
import React, { useState, useCallback } from "react";
=======
import React, { useState } from "react";
>>>>>>> f186d93c3de7914fcacd7de6d9ae3045bbc30ed5
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from "react-native";
<<<<<<< HEAD
import { useFocusEffect } from "@react-navigation/native";
=======
>>>>>>> f186d93c3de7914fcacd7de6d9ae3045bbc30ed5
import { SafeAreaView, RoundedContainer } from "@components/containers";
import NavigationHeader from "@components/Header/NavigationHeader";
import { COLORS, SPACING, BORDER_RADIUS } from "@constants/theme";
import useToolStore from "@stores/toolManagement/useToolStore";
<<<<<<< HEAD
import useAuthStore from "@stores/auth/useAuthStore";
=======
>>>>>>> f186d93c3de7914fcacd7de6d9ae3045bbc30ed5

const STATES = [
  { label: "All", value: "all" },
  { label: "Available", value: "available", color: "#4CAF50" },
  { label: "Rented", value: "rented", color: "#FF9800" },
  { label: "Maintenance", value: "maintenance", color: "#F44336" },
  { label: "Retired", value: "retired", color: "#9E9E9E" },
];

const STATUS_COLORS = {
  available: "#4CAF50",
  rented: "#FF9800",
  maintenance: "#F44336",
  retired: "#9E9E9E",
};

const ToolsScreen = ({ navigation, route }) => {
  const categoryName = route?.params?.categoryName || "All Tools";
  const categoryId = route?.params?.categoryId;
<<<<<<< HEAD
  const odooAuth = useAuthStore((s) => s.odooAuth);
  const allTools = useToolStore((s) => s.tools);
  const fetchTools = useToolStore((s) => s.fetchTools);
=======
  const allTools = useToolStore((s) => s.tools);
>>>>>>> f186d93c3de7914fcacd7de6d9ae3045bbc30ed5
  const tools = categoryId
    ? allTools.filter((t) => t.category_id === categoryId)
    : allTools;
  const [activeFilter, setActiveFilter] = useState("all");

<<<<<<< HEAD
  // Refresh tools each time this screen is focused
  useFocusEffect(
    useCallback(() => {
      if (odooAuth) {
        fetchTools(odooAuth);
      }
    }, [odooAuth])
  );

=======
>>>>>>> f186d93c3de7914fcacd7de6d9ae3045bbc30ed5
  const filteredTools =
    activeFilter === "all"
      ? tools
      : tools.filter((t) => t.state === activeFilter);

  const renderFilterTabs = () => (
    <View style={styles.filterRow}>
      {STATES.map((s) => (
        <TouchableOpacity
          key={s.value}
          style={[
            styles.filterTab,
            activeFilter === s.value && styles.filterTabActive,
          ]}
          onPress={() => setActiveFilter(s.value)}
        >
          <Text
            style={[
              styles.filterTabText,
              activeFilter === s.value && styles.filterTabTextActive,
            ]}
          >
            {s.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderTool = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() =>
        navigation.navigate("ToolFormScreen", { tool: item, mode: "edit" })
      }
    >
      <View style={styles.cardTop}>
        <View style={styles.cardInfo}>
          <Text style={styles.toolName}>{item.name}</Text>
          <Text style={styles.toolCode}>{item.code || "No code"}</Text>
          {item.brand || item.model_name ? (
            <Text style={styles.brandText}>
              {[item.brand, item.model_name].filter(Boolean).join(" - ")}
            </Text>
          ) : null}
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: STATUS_COLORS[item.state] || COLORS.gray },
          ]}
        >
          <Text style={styles.statusText}>{item.state}</Text>
        </View>
      </View>

      <View style={styles.cardMid}>
        {item.serial_number ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Serial:</Text>
            <Text style={styles.detailValue}>{item.serial_number}</Text>
          </View>
        ) : null}
        {item.barcode ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Barcode:</Text>
            <Text style={styles.detailValue}>{item.barcode}</Text>
          </View>
        ) : null}
        {item.location ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location:</Text>
            <Text style={styles.detailValue}>{item.location}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardBottom}>
        <View style={styles.qtyBox}>
          <Text style={styles.qtyLabel}>Available</Text>
          <Text style={styles.qtyValue}>
            {item.available_qty ?? item.total_qty ?? 0}/
            {item.total_qty ?? 0}
          </Text>
        </View>
        <View style={styles.priceBox}>
          {item.rental_price_per_day ? (
            <Text style={styles.priceText}>
              ${parseFloat(item.rental_price_per_day).toFixed(2)}/day
            </Text>
          ) : (
            <Text style={styles.noPriceText}>No pricing</Text>
          )}
        </View>
      </View>

      {item.total_rental_count > 0 && (
        <View style={styles.statsRow}>
          <Text style={styles.statText}>
            {item.total_rental_count} rental(s)
          </Text>
          {item.total_revenue > 0 && (
            <Text style={styles.statText}>
              Revenue: ${parseFloat(item.total_revenue).toFixed(2)}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No tools found</Text>
      <Text style={styles.emptySubText}>Tap + to add a new tool</Text>
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader
        title={categoryName}
        navigation={navigation}
        rightComponent={
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("ToolFormScreen", {
                mode: "create",
                categoryName,
                categoryId,
              })
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
          data={filteredTools}
          renderItem={renderTool}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
        />
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.paddingMedium,
    paddingTop: 12,
    paddingBottom: 4,
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
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardInfo: {
    flex: 1,
  },
  toolName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.black,
  },
  toolCode: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  brandText: {
    fontSize: 12,
    color: COLORS.primaryThemeColor,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 11,
    color: COLORS.white,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  cardMid: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.gray,
    width: 65,
  },
  detailValue: {
    fontSize: 12,
    color: COLORS.black,
    flex: 1,
  },
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  qtyBox: {
    alignItems: "center",
  },
  qtyLabel: {
    fontSize: 10,
    color: COLORS.gray,
  },
  qtyValue: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.primaryThemeColor,
  },
  priceBox: {
    alignItems: "flex-end",
  },
  priceText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primaryThemeColor,
  },
  noPriceText: {
    fontSize: 12,
    color: COLORS.gray,
    fontStyle: "italic",
  },
  depositText: {
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 1,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  statText: {
    fontSize: 11,
    color: COLORS.gray,
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

export default ToolsScreen;
