import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, RoundedContainer } from "@components/containers";
import NavigationHeader from "@components/Header/NavigationHeader";
import { COLORS, SPACING, BORDER_RADIUS } from "@constants/theme";
import useToolStore from "@stores/toolManagement/useToolStore";
import useAuthStore from "@stores/auth/useAuthStore";

const ToolCategoriesScreen = ({ navigation }) => {
  const odooAuth = useAuthStore((s) => s.odooAuth);
  const categories = useToolStore((s) => s.categories);
  const tools = useToolStore((s) => s.tools);
  const fetchCategories = useToolStore((s) => s.fetchCategories);
  const fetchTools = useToolStore((s) => s.fetchTools);

  useFocusEffect(
    useCallback(() => {
      if (odooAuth) {
        fetchCategories(odooAuth);
        fetchTools(odooAuth);
      }
    }, [odooAuth])
  );

  // Compute tool_count dynamically from store tools
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
      <View style={styles.codeBox}>
        <Text style={styles.codeText}>{item.code}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.cardDesc} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <View style={styles.countBox}>
        <Text style={styles.countText}>{item.tool_count}</Text>
        <Text style={styles.countLabel}>Tools</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView>
      <NavigationHeader title="Tool Categories" navigation={navigation} />
      <RoundedContainer>
        <FlatList
          data={categoriesWithCount}
          renderItem={renderCategory}
          keyExtractor={(item) => item.id}
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
  cardDesc: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  countBox: {
    alignItems: "center",
    paddingLeft: 10,
  },
  countText: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.primaryThemeColor,
  },
  countLabel: {
    fontSize: 10,
    color: COLORS.gray,
  },
});

export default ToolCategoriesScreen;
