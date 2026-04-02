import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Image,
  StyleSheet,
  BackHandler,
  FlatList,
  TouchableOpacity,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Text from "@components/Text";
import { RoundedContainer, SafeAreaView } from "@components/containers";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import { showToastMessage } from "@components/Toast";
import { useAuthStore } from "@stores/auth";
import CarouselPagination from "@components/Home/CarouselPagination";
import ListHeader from "@components/Home/ListHeader";
import Constants from "expo-constants";

const MENU_ITEMS = [
  { id: "1", title: "New Rental", screen: "RentalOrderFormScreen", icon: "add-circle", bg: "#E0F7FA", accent: "#00BCD4" },
  { id: "2", title: "Rental Orders", screen: "RentalOrdersScreen", icon: "assignment", bg: "#E3F2FD", accent: "#2196F3" },
  { id: "3", title: "Tools & Equipment", screen: "ToolsScreen", icon: "build", bg: "#FFF3E0", accent: "#FF9800" },
  { id: "4", title: "Pricing Rules", screen: "PricingScreen", icon: "attach-money", bg: "#FFF8E1", accent: "#FFC107" },
  { id: "5", title: "Tool Categories", screen: "ToolCategoriesScreen", icon: "folder-open", bg: "#E8F5E9", accent: "#4CAF50" },
  { id: "6", title: "Customers", screen: "CustomersScreen", icon: "people", bg: "#F3E5F5", accent: "#9C27B0" },
  { id: "7", title: "Tool Availability", screen: "ToolAvailabilityScreen", icon: "bar-chart", bg: "#E8EAF6", accent: "#3F51B5" },
  { id: "8", title: "Order Reports", screen: "OrderReportsScreen", icon: "description", bg: "#FBE9E7", accent: "#FF5722" },
  { id: "9", title: "Discount Details", screen: "DiscountDetailsScreen", icon: "local-offer", bg: "#FCE4EC", accent: "#E91E63" },
  { id: "12", title: "Tax Details", screen: "TaxDetailsScreen", icon: "receipt", bg: "#E3F2FD", accent: "#1565C0" },
  { id: "10", title: "Rental Dashboard", screen: "RentalDashboardScreen", icon: "trending-up", bg: "#E1F5FE", accent: "#03A9F4" },
  { id: "11", title: "Customer ID Proofs", screen: "CustomersScreen", icon: "badge", bg: "#EFEBE9", accent: "#795548", params: { filterIdProofs: true } },
];

const formatData = (data, numColumns) => {
  const remainder = data.length % numColumns;
  if (remainder === 0) return data;
  const blanks = numColumns - remainder;
  const result = [...data];
  for (let i = 0; i < blanks; i++) {
    result.push({ id: `blank-${i}`, empty: true });
  }
  return result;
};

const HomeScreen = ({ navigation }) => {
  const user = useAuthStore((state) => state.user);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [backPressCount, setBackPressCount] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleBackPress = useCallback(() => {
    if (navigation.isFocused()) {
      if (backPressCount === 0) {
        setBackPressCount(1);
        return true;
      } else if (backPressCount === 1) {
        BackHandler.exitApp();
      }
    }
    return false;
  }, [backPressCount, navigation]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress
    );
    return () => backHandler.remove();
  }, [handleBackPress]);

  useEffect(() => {
    const timer = setTimeout(() => setBackPressCount(0), 2000);
    return () => clearTimeout(timer);
  }, [backPressCount]);

  useEffect(() => {
    if (backPressCount === 1) {
      showToastMessage("Press back again to exit");
    }
  }, [backPressCount]);

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <View style={[styles.card, styles.cardInvisible]} />;
    }
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate(item.screen, item.params || {})}
      >
        <View style={[styles.iconWrapper, { backgroundColor: item.bg }]}>
          <MaterialIcons name={item.icon} size={30} color={item.accent} />
        </View>
        <View style={styles.cardTextContainer}>
          <Text numberOfLines={2} style={styles.cardTitle}>
            {item.title}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView backgroundColor={COLORS.primaryThemeColor}>
      <RoundedContainer>
        {/* Company Logo Header */}
        <View style={styles.logoContainer}>
          <Image
            source={require("@assets/images/logo.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        {/* Carousel Banner */}
        <CarouselPagination />

        {/* Date & Time */}
        <View style={styles.greetingContainer}>
          <MaterialIcons name="calendar-today" size={18} color={COLORS.primaryThemeColor} />
          <Text style={styles.dateText}>
            {currentTime.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
          </Text>
          <View style={styles.timeBadge}>
            <MaterialIcons name="access-time" size={14} color="#fff" />
            <Text style={styles.timeText}>
              {currentTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        </View>

        {/* Section Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, backgroundColor: COLORS.primaryThemeColor, borderRadius: 10, marginHorizontal: 8, marginTop: 4 }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#fff", fontFamily: FONT_FAMILY.urbanistBold }}>Quick Access</Text>
            <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: FONT_FAMILY.urbanistMedium }}>Manage your tools &amp; rentals</Text>
          </View>
          {user?.company_name ? (
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
              <MaterialIcons name="business" size={14} color="#fff" />
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#fff", marginLeft: 4, fontFamily: FONT_FAMILY.urbanistSemiBold }}>{user.company_name}</Text>
            </View>
          ) : null}
        </View>

        {/* 2-column Menu Grid */}
        <FlatList
          key="grid-2"
          data={formatData(MENU_ITEMS, 2)}
          numColumns={2}
          style={styles.list}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <Text style={styles.footer}>Powered by 369ai  |  v{require("../../../app.json").expo.version}</Text>
          }
        />
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  greetingContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8ECF0",
    gap: 8,
  },
  dateText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.primaryThemeColor,
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  timeText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: "#fff",
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    marginHorizontal: 10,
    marginTop: 4,
    backgroundColor: "transparent",
    borderRadius: 16,
    borderWidth: 0,
    borderColor: "transparent",
  },
  logoImage: {
    width: 320,
    height: 128,
    marginBottom: 6,
    backgroundColor: "transparent",
  },
  tagline: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.gray,
    letterSpacing: 0.3,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 100,
    paddingTop: 6,
  },
  card: {
    flex: 1,
    alignItems: "center",
    margin: 5,
    borderRadius: 16,
    backgroundColor: "#fff",
    paddingVertical: 16,
    paddingHorizontal: 6,
    minHeight: 130,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: {
        elevation: 4,
      },
    }),
  },
  cardInvisible: {
    backgroundColor: "transparent",
    elevation: 0,
    shadowOpacity: 0,
    borderWidth: 0,
  },
  iconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  cardTextContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: 2,
  },
  cardTitle: {
    fontSize: 11.5,
    textAlign: "center",
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistBold,
    lineHeight: 15,
  },
  footer: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: "#B0B0B0",
    marginTop: 16,
    marginBottom: 10,
  },
});

export default HomeScreen;
