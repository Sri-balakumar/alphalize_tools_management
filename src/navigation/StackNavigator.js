import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import useAuthStore from "@stores/auth/useAuthStore";

import LoginScreen from "@screens/Auth/LoginScreen";
import AppNavigator from "./AppNavigator";
import OptionsScreen from "@screens/Home/Options/OptionsScreen";

import ToolManagementScreen from "@screens/ToolManagement/ToolManagementScreen";
import ToolCategoriesScreen from "@screens/ToolManagement/ToolCategoriesScreen";
import PricingScreen from "@screens/ToolManagement/PricingScreen";
import PricingFormScreen from "@screens/ToolManagement/PricingFormScreen";
import ToolAvailabilityScreen from "@screens/ToolManagement/ToolAvailabilityScreen";
import ToolsScreen from "@screens/Tools/ToolsScreen";
import ToolFormScreen from "@screens/Tools/ToolFormScreen";
import RentalOrdersScreen from "@screens/Rentals/RentalOrdersScreen";
import RentalOrderFormScreen from "@screens/Rentals/RentalOrderFormScreen";
import CustomersScreen from "@screens/Customers/CustomersScreen";
import OrderReportsScreen from "@screens/Rentals/OrderReportsScreen";
import DiscountDetailsScreen from "@screens/ToolManagement/DiscountDetailsScreen";
import RentalDashboardScreen from "@screens/ToolManagement/RentalDashboardScreen";

const Stack = createNativeStackNavigator();

const StackNavigator = () => {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

  return (
    <Stack.Navigator
      initialRouteName={isLoggedIn ? "AppNavigator" : "LoginScreen"}
      screenOptions={{ headerShown: false, animation: "fade" }}
    >
      {/* Auth */}
      <Stack.Screen name="LoginScreen" component={LoginScreen} />

      {/* Main App (Bottom Tabs) */}
      <Stack.Screen name="AppNavigator" component={AppNavigator} />

      {/* General */}
      <Stack.Screen name="OptionsScreen" component={OptionsScreen} />

      {/* Tool Management Module */}
      <Stack.Screen name="ToolManagementScreen" component={ToolManagementScreen} />
      <Stack.Screen name="ToolCategoriesScreen" component={ToolCategoriesScreen} />
      <Stack.Screen name="PricingScreen" component={PricingScreen} />
      <Stack.Screen name="PricingFormScreen" component={PricingFormScreen} />
      <Stack.Screen name="ToolsScreen" component={ToolsScreen} />
      <Stack.Screen name="ToolFormScreen" component={ToolFormScreen} />
      <Stack.Screen name="RentalOrdersScreen" component={RentalOrdersScreen} />
      <Stack.Screen name="RentalOrderFormScreen" component={RentalOrderFormScreen} />
      <Stack.Screen name="CustomersScreen" component={CustomersScreen} />
      <Stack.Screen name="ToolAvailabilityScreen" component={ToolAvailabilityScreen} />
      <Stack.Screen name="OrderReportsScreen" component={OrderReportsScreen} />
      <Stack.Screen name="DiscountDetailsScreen" component={DiscountDetailsScreen} />
      <Stack.Screen name="RentalDashboardScreen" component={RentalDashboardScreen} />
    </Stack.Navigator>
  );
};

export default StackNavigator;
