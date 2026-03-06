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
import { TextInput } from "@components/common/TextInput";
import { COLORS, SPACING, BORDER_RADIUS } from "@constants/theme";
import useToolStore from "@stores/toolManagement/useToolStore";
<<<<<<< HEAD
import useAuthStore from "@stores/auth/useAuthStore";

const CustomersScreen = ({ navigation }) => {
  const odooAuth = useAuthStore((s) => s.odooAuth);
  const customers = useToolStore((s) => s.customers);
  const fetchCustomers = useToolStore((s) => s.fetchCustomers);
  const [search, setSearch] = useState("");

  useFocusEffect(
    useCallback(() => {
      if (odooAuth) {
        fetchCustomers(odooAuth);
      }
    }, [odooAuth])
  );

=======

const CustomersScreen = ({ navigation }) => {
  const customers = useToolStore((s) => s.customers);
  const [search, setSearch] = useState("");

>>>>>>> f186d93c3de7914fcacd7de6d9ae3045bbc30ed5
  const filteredCustomers = customers.filter(
    (c) =>
      !search.trim() ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.customer_code?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const renderCustomer = ({ item }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(item.name || "C").charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        {item.customer_code ? (
          <Text style={styles.code}>{item.customer_code}</Text>
        ) : null}
        {item.phone ? (
          <Text style={styles.detail}>{item.phone}</Text>
        ) : null}
        {item.email ? (
          <Text style={styles.detail}>{item.email}</Text>
        ) : null}
      </View>
      <View style={styles.stats}>
        <Text style={styles.rentalCount}>{item.rental_count || 0}</Text>
        <Text style={styles.rentalLabel}>Rentals</Text>
        {item.total_revenue > 0 && (
          <Text style={styles.revenueText}>
            ${parseFloat(item.total_revenue).toFixed(0)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No customers yet</Text>
      <Text style={styles.emptySubText}>
        Customers are added when creating rental orders
      </Text>
    </View>
  );

  return (
    <SafeAreaView>
      <NavigationHeader title="Customers" navigation={navigation} />
      <RoundedContainer>
        <View style={styles.searchWrap}>
          <TextInput
            placeholder="Search by name, code, phone, or email..."
            value={search}
            onChangeText={setSearch}
            column
          />
        </View>
        <FlatList
          data={filteredCustomers}
          renderItem={renderCustomer}
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
  searchWrap: {
    paddingHorizontal: SPACING.paddingMedium,
    paddingTop: 10,
  },
  list: {
    padding: SPACING.paddingMedium,
    flexGrow: 1,
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
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 22,
    backgroundColor: COLORS.primaryThemeColor,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "700",
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.black,
  },
  code: {
    fontSize: 12,
    color: COLORS.primaryThemeColor,
    marginTop: 1,
  },
  detail: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 1,
  },
  stats: {
    alignItems: "center",
    paddingLeft: 12,
  },
  rentalCount: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.primaryThemeColor,
  },
  rentalLabel: {
    fontSize: 10,
    color: COLORS.gray,
  },
  revenueText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4CAF50",
    marginTop: 2,
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

export default CustomersScreen;
