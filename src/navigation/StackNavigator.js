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
import SalesReportScreen from "@screens/Rentals/SalesReportScreen";
import ExpensesScreen from "@screens/Expenses/ExpensesScreen";
import ExpenseFormScreen from "@screens/Expenses/ExpenseFormScreen";
import CustomersScreen from "@screens/Customers/CustomersScreen";
import OrderReportsScreen from "@screens/Rentals/OrderReportsScreen";
import DiscountDetailsScreen from "@screens/ToolManagement/DiscountDetailsScreen";
import TaxDetailsScreen from "@screens/ToolManagement/TaxDetailsScreen";
import RentalDashboardScreen from "@screens/ToolManagement/RentalDashboardScreen";

const Stack = createNativeStackNavigator();

const StackNavigator = () => {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

  return (
    <Stack.Navigator
      initialRouteName={isLoggedIn ? "AppNavigator" : "LoginScreen"}
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        animationDuration: 250,
      }}
    >
      {/* Auth - fade in */}
      <Stack.Screen
        name="LoginScreen"
        component={LoginScreen}
        options={{ animation: "fade" }}
      />

      {/* Main App (Bottom Tabs) - fade in */}
      <Stack.Screen
        name="AppNavigator"
        component={AppNavigator}
        options={{ animation: "fade" }}
      />

      {/* General - slide from bottom */}
      <Stack.Screen
        name="OptionsScreen"
        component={OptionsScreen}
        options={{ animation: "slide_from_bottom" }}
      />

      {/* Tool Management Module - slide from right */}
      <Stack.Screen name="ToolManagementScreen" component={ToolManagementScreen} />
      <Stack.Screen name="ToolCategoriesScreen" component={ToolCategoriesScreen} />
      <Stack.Screen name="PricingScreen" component={PricingScreen} />
      <Stack.Screen name="ToolsScreen" component={ToolsScreen} />
      <Stack.Screen name="ToolAvailabilityScreen" component={ToolAvailabilityScreen} />
      <Stack.Screen name="OrderReportsScreen" component={OrderReportsScreen} />
      <Stack.Screen name="SalesReportScreen" component={SalesReportScreen} />
      <Stack.Screen name="ExpensesScreen" component={ExpensesScreen} />
      <Stack.Screen
        name="ExpenseFormScreen"
        component={ExpenseFormScreen}
        options={{ animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="CustomersScreen" component={CustomersScreen} />
      <Stack.Screen name="DiscountDetailsScreen" component={DiscountDetailsScreen} />
      <Stack.Screen name="TaxDetailsScreen" component={TaxDetailsScreen} />
      <Stack.Screen name="RentalDashboardScreen" component={RentalDashboardScreen} />

      {/* Form screens - slide from bottom (modal feel) */}
      <Stack.Screen
        name="PricingFormScreen"
        component={PricingFormScreen}
        options={{ animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="ToolFormScreen"
        component={ToolFormScreen}
        options={{ animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="RentalOrdersScreen"
        component={RentalOrdersScreen}
      />
      <Stack.Screen
        name="RentalOrderFormScreen"
        component={RentalOrderFormScreen}
        options={{ animation: "slide_from_bottom" }}
      />
    </Stack.Navigator>
  );
};

export default StackNavigator;
