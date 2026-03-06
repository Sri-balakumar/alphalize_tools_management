import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "@components/containers";
import NavigationHeader from "@components/Header/NavigationHeader";
import { COLORS } from "@constants/theme";
import useToolStore from "@stores/toolManagement/useToolStore";
import useAuthStore from "@stores/auth/useAuthStore";
import { showToastMessage } from "@components/Toast";

const MENU_ITEMS = [
  { id: "1", title: "New Rental", screen: "RentalOrderFormScreen", icon: "➕", bg: "#E0F7FA" },
  { id: "2", title: "Rental Orders", screen: "RentalOrdersScreen", icon: "📋", bg: "#E3F2FD" },
  { id: "3", title: "Tools & Equipment", screen: "ToolsScreen", icon: "🔧", bg: "#FFF3E0" },
  { id: "4", title: "Pricing Rules", screen: "PricingScreen", icon: "💰", bg: "#FFF8E1" },
  { id: "5", title: "Tool Categories", screen: "ToolCategoriesScreen", icon: "📂", bg: "#E8F5E9" },
  { id: "6", title: "Customers", screen: "CustomersScreen", icon: "👥", bg: "#F3E5F5" },
  { id: "7", title: "Tool Availability", screen: "ToolAvailabilityScreen", icon: "📊", bg: "#E8EAF6" },
  { id: "8", title: "Order Reports", screen: "OrderReportsScreen", icon: "📑", bg: "#FBE9E7" },
  { id: "9", title: "Discount Details", screen: "DiscountDetailsScreen", icon: "🏷️", bg: "#FCE4EC" },
];

const ToolManagementScreen = ({ navigation }) => {
  const odooAuth = useAuthStore((s) => s.odooAuth);
  const loading = useToolStore((s) => s.loading);
  const error = useToolStore((s) => s.error);
  const fetchAllData = useToolStore((s) => s.fetchAllData);

  // Fetch data on mount and every time the screen is focused (e.g. returning from order form)
  useFocusEffect(
    useCallback(() => {
      if (odooAuth) {
        fetchAllData(odooAuth);
      }
    }, [odooAuth])
  );

  useEffect(() => {
    if (error) {
      showToastMessage("Error: " + error);
    }
  }, [error]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => navigation.navigate(item.screen)}
    >
      <View style={[styles.iconBox, { backgroundColor: item.bg }]}>
        <Text style={styles.iconText}>{item.icon}</Text>
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView backgroundColor={COLORS.primaryThemeColor}>
      <NavigationHeader title="Tool Management" navigation={navigation} />
      <View style={styles.container}>
        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.loadingText}>Loading from Odoo...</Text>
          </View>
        )}
        <FlatList
          data={MENU_ITEMS}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primaryThemeColor,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 8,
  },
  loadingText: {
    color: "#fff",
    fontSize: 13,
  },
  grid: {
    padding: 12,
    paddingBottom: 30,
  },
  row: {
    justifyContent: "space-between",
    marginBottom: 12,
  },
  card: {
    width: "48%",
    backgroundColor: "#F5F5F8",
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  iconText: {
    fontSize: 28,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.black,
    textAlign: "center",
  },
});

export default ToolManagementScreen;
