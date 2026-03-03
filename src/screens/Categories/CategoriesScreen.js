import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, RoundedContainer } from "@components/containers";
import { COLORS, SPACING, BORDER_RADIUS } from "@constants/theme";
import useToolStore from "@stores/toolManagement/useToolStore";
import useAuthStore from "@stores/auth/useAuthStore";

const CategoriesScreen = ({ navigation }) => {
  const odooAuth = useAuthStore((s) => s.odooAuth);
  const categories = useToolStore((s) => s.categories);
  const tools = useToolStore((s) => s.tools);
  const loading = useToolStore((s) => s.loading);
  const fetchCategories = useToolStore((s) => s.fetchCategories);
  const fetchTools = useToolStore((s) => s.fetchTools);

  // Refresh categories & tools each time this tab is focused
  useFocusEffect(
    useCallback(() => {
      if (odooAuth) {
        fetchCategories(odooAuth);
        fetchTools(odooAuth);
      }
    }, [odooAuth])
  );

  // Compute tool count dynamically from store tools
  const categoriesWithCount = categories.map((cat) => ({
    ...cat,
    tool_count: tools.filter((t) => t.category_id === cat.id).length || cat.tool_count || 0,
  }));

  const renderCategory = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() =>
        navigation.navigate("ToolsScreen", {
          categoryId: item.id,
          categoryName: item.name,
        })
      }
    >
      <View style={styles.cardLeft}>
        <View style={styles.codeBox}>
          <Text style={styles.codeText}>{item.code}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Text style={styles.cardSub}>{item.tool_count} tools</Text>
        </View>
      </View>
      <Text style={styles.arrow}>{">"}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView>
      <RoundedContainer>
        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={COLORS.primaryThemeColor} />
            <Text style={styles.loadingText}>Loading categories...</Text>
          </View>
        )}
        {!loading && categoriesWithCount.length === 0 && (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>No categories found</Text>
          </View>
        )}
        <FlatList
          data={categoriesWithCount}
          renderItem={renderCategory}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  list: {
    padding: SPACING.paddingMedium,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  codeBox: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.medium,
    backgroundColor: "#f0ebff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  codeText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primaryThemeColor,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.black,
  },
  cardSub: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  arrow: {
    fontSize: 18,
    color: COLORS.gray,
    fontWeight: "bold",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.gray,
  },
  emptyRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.gray,
  },
});

export default CategoriesScreen;
