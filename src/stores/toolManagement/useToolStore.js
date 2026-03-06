import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  fetchCategories,
  fetchTools,
  fetchOrders,
  fetchCustomers,
  fetchPricingRules,
  createTool as apiCreateTool,
  updateTool as apiUpdateTool,
  createOrder as apiCreateOrder,
  updateOrderValues as apiUpdateOrder,
  confirmOrder as apiConfirmOrder,
  cancelOrder as apiCancelOrder,
  markDone as apiMarkDone,
  createInvoice as apiCreateInvoice,
  createCustomer as apiCreateCustomer,
  openCheckoutWizard as apiCheckoutOrder,
  openCheckinWizard as apiCheckinOrder,
} from "@api/services/odooService";

const useToolStore = create(
  persist(
    (set, get) => ({
      // Data
      categories: [],
      tools: [],
      customers: [],
      orders: [],
      pricingRules: [],
      // Loading states
      loading: false,
      error: null,

      // =============================================
      // FETCH ALL DATA FROM ODOO
      // =============================================
      fetchAllData: async (auth) => {
        set({ loading: true, error: null });
        try {
          const [categories, tools, orders, customers, pricingRules] =
            await Promise.all([
              fetchCategories(auth).catch(() => []),
              fetchTools(auth).catch(() => []),
              fetchOrders(auth).catch(() => []),
              fetchCustomers(auth).catch(() => []),
              fetchPricingRules(auth).catch(() => []),
            ]);
          set({ categories, tools, orders, customers, pricingRules, loading: false });
        } catch (error) {
          set({ error: error.message, loading: false });
        }
      },

      // Fetch individual models
      fetchCategories: async (auth) => {
        try {
          const categories = await fetchCategories(auth);
          set({ categories });
        } catch (e) {
          console.warn("fetchCategories error:", e.message);
        }
      },

      fetchTools: async (auth) => {
        try {
          const tools = await fetchTools(auth);
          set({ tools });
        } catch (e) {
          console.warn("fetchTools error:", e.message);
        }
      },

      fetchOrders: async (auth) => {
        try {
          const orders = await fetchOrders(auth);
          set({ orders });
        } catch (e) {
          console.warn("fetchOrders error:", e.message);
        }
      },

      fetchCustomers: async (auth) => {
        try {
          const customers = await fetchCustomers(auth);
          set({ customers });
        } catch (e) {
          console.warn("fetchCustomers error:", e.message);
        }
      },

      fetchPricingRules: async (auth) => {
        try {
          const pricingRules = await fetchPricingRules(auth);
          set({ pricingRules });
        } catch (e) {
          console.warn("fetchPricingRules error:", e.message);
        }
      },

      // =============================================
      // TOOL OPERATIONS
      // =============================================
      addTool: async (auth, values) => {
        const newId = await apiCreateTool(auth, values);
        await get().fetchTools(auth);
        return newId;
      },

      updateTool: async (auth, id, values) => {
        await apiUpdateTool(auth, id, values);
        await get().fetchTools(auth);
      },

      getToolsByCategory: (categoryId) => {
        if (!categoryId) return get().tools;
        return get().tools.filter((t) => t.category_id === categoryId);
      },

      // =============================================
      // ORDER OPERATIONS
      // =============================================
      addOrder: async (auth, values, lines) => {
        const newId = await apiCreateOrder(auth, values, lines);
        await get().fetchOrders(auth);
        return newId;
      },

      updateOrder: async (auth, id, values) => {
        await apiUpdateOrder(auth, id, values);
        await get().fetchOrders(auth);
      },

      confirmOrder: async (auth, id) => {
        await apiConfirmOrder(auth, id);
        await get().fetchOrders(auth);
      },

      cancelOrder: async (auth, id) => {
        await apiCancelOrder(auth, id);
        await get().fetchOrders(auth);
      },

      markDone: async (auth, id) => {
        await apiMarkDone(auth, id);
        await get().fetchOrders(auth);
      },

      createInvoice: async (auth, id) => {
        await apiCreateInvoice(auth, id);
        await get().fetchOrders(auth);
      },

      checkoutOrder: async (auth, id) => {
        await apiCheckoutOrder(auth, id);
        await get().fetchOrders(auth);
      },

      checkinOrder: async (auth, id) => {
        await apiCheckinOrder(auth, id);
        await get().fetchOrders(auth);
      },

      // =============================================
      // CUSTOMER OPERATIONS
      // =============================================
      addCustomer: async (auth, values) => {
        const newId = await apiCreateCustomer(auth, values);
        await get().fetchCustomers(auth);
        return newId;
      },

      // =============================================
      // HELPER
      // =============================================
      getCategoryToolCount: (categoryId) => {
        return get().tools.filter((t) => t.category_id === categoryId).length;
      },

      clearData: () =>
        set({
          categories: [],
          tools: [],
          customers: [],
          orders: [],
          pricingRules: [],
          error: null,
        }),
    }),
    {
      name: "tool-management-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: () => ({
        // Don't persist any data — always fetch fresh from Odoo
      }),
    }
  )
);

export default useToolStore;
