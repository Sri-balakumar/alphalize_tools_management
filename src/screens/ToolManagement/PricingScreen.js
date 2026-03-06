import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, RoundedContainer } from "@components/containers";
import NavigationHeader from "@components/Header/NavigationHeader";
import { COLORS, SPACING, BORDER_RADIUS } from "@constants/theme";
import useToolStore from "@stores/toolManagement/useToolStore";
import useAuthStore from "@stores/auth/useAuthStore";

const PERIOD_LABELS = {
  day: "Day",
  week: "Week",
  month: "Month",
  fixed: "Fixed",
};

const PricingScreen = ({ navigation }) => {
  const odooAuth = useAuthStore((s) => s.odooAuth);
  const pricingRules = useToolStore((s) => s.pricingRules);
  const fetchPricingRules = useToolStore((s) => s.fetchPricingRules);

  useFocusEffect(
    useCallback(() => {
      if (odooAuth) {
        fetchPricingRules(odooAuth);
      }
    }, [odooAuth])
  );

  const renderRule = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ruleName}>{item.name}</Text>
          {item.tool_name ? (
            <Text style={styles.toolRef}>Tool: {item.tool_name}</Text>
          ) : item.category_name ? (
            <Text style={styles.toolRef}>Category: {item.category_name}</Text>
          ) : null}
        </View>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, item.is_primary_pricing && styles.badgePrimary]}>
            <Text style={styles.badgeText}>
              {PERIOD_LABELS[item.period_type] || item.period_type}
            </Text>
          </View>
          {item.is_primary_pricing && (
            <View style={[styles.badge, styles.badgePrimary, { marginLeft: 4 }]}>
              <Text style={[styles.badgeText, { color: "#2E7D32" }]}>Primary</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.price}>
          ${item.price?.toFixed(2)}/{PERIOD_LABELS[item.period_type] || "unit"}
        </Text>
        <View style={styles.detailGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Late Fee</Text>
            <Text style={styles.detailValue}>
              ${item.late_fee_per_day?.toFixed(2) || "0.00"}/day
            </Text>
          </View>
          {(item.min_duration > 0 || item.max_duration > 0) && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Duration</Text>
              <Text style={styles.detailValue}>
                {item.min_duration || 0} - {item.max_duration || "No max"} days
              </Text>
            </View>
          )}
        </View>
      </View>

      {item.notes ? (
        <Text style={styles.notesText} numberOfLines={2}>
          {item.notes}
        </Text>
      ) : null}
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No pricing rules configured</Text>
      <Text style={styles.emptySubText}>
        Pricing rules are set per tool or per category. Add tools first, then
        configure pricing from the tool form.
      </Text>
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader title="Pricing Rules" navigation={navigation} />
      <RoundedContainer>
        <FlatList
          data={pricingRules}
          renderItem={renderRule}
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
  ruleName: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.black,
  },
  toolRef: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: "row",
    marginLeft: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "#E0E0E0",
  },
  badgePrimary: {
    backgroundColor: "#E8F5E9",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.primaryThemeColor,
    textTransform: "capitalize",
  },
  cardBody: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  price: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.primaryThemeColor,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  detailItem: {},
  detailLabel: {
    fontSize: 10,
    color: COLORS.gray,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "500",
    color: COLORS.black,
  },
  notesText: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 8,
    fontStyle: "italic",
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
    textAlign: "center",
    paddingHorizontal: 40,
  },
});

export default PricingScreen;
