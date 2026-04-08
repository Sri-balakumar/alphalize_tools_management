import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  fetchCategories,
  fetchTools,
  fetchOrders,
  fetchCustomers,
  fetchPricingRules,
  fetchToolReport,
  createTool as apiCreateTool,
  updateTool as apiUpdateTool,
  createOrder as apiCreateOrder,
  updateOrderValues as apiUpdateOrder,
  confirmOrder as apiConfirmOrder,
  cancelOrder as apiCancelOrder,
  markDone as apiMarkDone,
  createInvoice as apiCreateInvoice,
  createCustomer as apiCreateCustomer,
  deleteCustomer as apiDeleteCustomer,
  openCheckoutWizard as apiCheckoutOrder,
  openCheckinWizard as apiCheckinOrder,
  fetchExpenses as apiFetchExpenses,
  createExpense as apiCreateExpense,
  updateExpense as apiUpdateExpense,
  deleteExpense as apiDeleteExpense,
  expenseSubmit as apiExpenseSubmit,
  expenseApprove as apiExpenseApprove,
  expenseMarkPaid as apiExpenseMarkPaid,
  expenseRefuse as apiExpenseRefuse,
  expenseResetDraft as apiExpenseResetDraft,
} from "@api/services/odooService";

// Staleness threshold: skip re-fetch if data was fetched within this window
const STALE_MS = 30000; // 30 seconds
const _lastFetch = { categories: 0, tools: 0, orders: 0, customers: 0, pricingRules: 0, toolReport: 0, all: 0 };
const isFresh = (key) => Date.now() - _lastFetch[key] < STALE_MS;
const markFetched = (key) => { _lastFetch[key] = Date.now(); };
// Force next fetch to always hit network (called after mutations)
const invalidate = (key) => { _lastFetch[key] = 0; };

const useToolStore = create(
  persist(
    (set, get) => ({
      // Data
      categories: [],
      tools: [],
      customers: [],
      orders: [],
      pricingRules: [],
      toolReport: [],
      expenses: [],
      // Loading states
      loading: false,
      error: null,

      // =============================================
      // FETCH ALL DATA FROM ODOO
      // =============================================
      fetchAllData: async (auth, force) => {
        if (!force && isFresh("all")) return;
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
          markFetched("all"); markFetched("categories"); markFetched("tools");
          markFetched("orders"); markFetched("customers"); markFetched("pricingRules");
        } catch (error) {
          set({ error: error.message, loading: false });
        }
      },

      // Fetch individual models (skip if fresh)
      fetchCategories: async (auth, force) => {
        if (!force && isFresh("categories")) return;
        try {
          const categories = await fetchCategories(auth);
          set({ categories });
          markFetched("categories");
        } catch (e) {
          console.warn("fetchCategories error:", e.message);
        }
      },

      fetchTools: async (auth, force) => {
        if (!force && isFresh("tools")) return;
        try {
          const tools = await fetchTools(auth);
          set({ tools });
          markFetched("tools");
        } catch (e) {
          console.warn("fetchTools error:", e.message);
        }
      },

      fetchOrders: async (auth, force) => {
        if (!force && isFresh("orders")) return;
        try {
          const orders = await fetchOrders(auth);
          set({ orders });
          markFetched("orders");
        } catch (e) {
          console.warn("fetchOrders error:", e.message);
        }
      },

      fetchCustomers: async (auth, force) => {
        if (!force && isFresh("customers")) return;
        try {
          const customers = await fetchCustomers(auth);
          set({ customers });
          markFetched("customers");
        } catch (e) {
          console.warn("fetchCustomers error:", e.message);
        }
      },

      fetchPricingRules: async (auth, force) => {
        if (!force && isFresh("pricingRules")) return;
        try {
          const pricingRules = await fetchPricingRules(auth);
          set({ pricingRules });
          markFetched("pricingRules");
        } catch (e) {
          console.warn("fetchPricingRules error:", e.message);
        }
      },

      updatePricingRuleInStore: (id, values) => {
        set((state) => ({
          pricingRules: state.pricingRules.map((r) =>
            String(r.id) === String(id) ? { ...r, ...values } : r
          ),
        }));
        invalidate("pricingRules");
      },

      fetchToolReport: async (auth, force) => {
        if (!force && isFresh("toolReport")) return;
        try {
          const toolReport = await fetchToolReport(auth);
          set({ toolReport });
          markFetched("toolReport");
        } catch (e) {
          console.warn("fetchToolReport error:", e.message);
        }
      },

      // =============================================
      // TOOL OPERATIONS
      // =============================================
      addTool: async (auth, values) => {
        const newId = await apiCreateTool(auth, values);
        invalidate("tools");
        await get().fetchTools(auth, true);
        return newId;
      },

      updateTool: async (auth, id, values) => {
        await apiUpdateTool(auth, id, values);
        invalidate("tools");
        await get().fetchTools(auth, true);
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
        invalidate("orders");
        await get().fetchOrders(auth, true);
        return newId;
      },

      updateOrder: async (auth, id, values) => {
        await apiUpdateOrder(auth, id, values);
        invalidate("orders");
        await get().fetchOrders(auth, true);
      },

      confirmOrder: async (auth, id) => {
        await apiConfirmOrder(auth, id);
        invalidate("orders");
        await get().fetchOrders(auth, true);
      },

      cancelOrder: async (auth, id) => {
        await apiCancelOrder(auth, id);
        invalidate("orders");
        await get().fetchOrders(auth, true);
      },

      markDone: async (auth, id) => {
        await apiMarkDone(auth, id);
        invalidate("orders");
        await get().fetchOrders(auth, true);
      },

      createInvoice: async (auth, id) => {
        await apiCreateInvoice(auth, id);
        invalidate("orders");
        await get().fetchOrders(auth, true);
      },

      checkoutOrder: async (auth, id) => {
        await apiCheckoutOrder(auth, id);
        invalidate("orders");
        await get().fetchOrders(auth, true);
      },

      checkinOrder: async (auth, id) => {
        await apiCheckinOrder(auth, id);
        invalidate("orders");
        await get().fetchOrders(auth, true);
      },

      // =============================================
      // CUSTOMER OPERATIONS
      // =============================================
      addCustomer: async (auth, values) => {
        const newId = await apiCreateCustomer(auth, values);
        invalidate("customers");
        await get().fetchCustomers(auth, true);
        return newId;
      },

      deleteCustomer: async (auth, customerId) => {
        await apiDeleteCustomer(auth, customerId);
        invalidate("customers");
        await get().fetchCustomers(auth, true);
      },

      // =============================================
      // EXPENSE OPERATIONS - rental.expense
      // =============================================
      fetchExpenses: async (auth) => {
        try {
          const expenses = await apiFetchExpenses(auth);
          set({ expenses });
          return expenses;
        } catch (e) {
          console.log("fetchExpenses error:", e);
          return [];
        }
      },

      addExpense: async (auth, values) => {
        const newId = await apiCreateExpense(auth, values);
        await get().fetchExpenses(auth);
        return newId;
      },

      updateExpense: async (auth, expenseId, values) => {
        await apiUpdateExpense(auth, expenseId, values);
        await get().fetchExpenses(auth);
      },

      deleteExpense: async (auth, expenseId) => {
        await apiDeleteExpense(auth, expenseId);
        await get().fetchExpenses(auth);
      },

      expenseSubmit: async (auth, id) => {
        await apiExpenseSubmit(auth, id);
        await get().fetchExpenses(auth);
      },
      expenseApprove: async (auth, id) => {
        await apiExpenseApprove(auth, id);
        await get().fetchExpenses(auth);
      },
      expenseMarkPaid: async (auth, id) => {
        await apiExpenseMarkPaid(auth, id);
        await get().fetchExpenses(auth);
      },
      expenseRefuse: async (auth, id) => {
        await apiExpenseRefuse(auth, id);
        await get().fetchExpenses(auth);
      },
      expenseResetDraft: async (auth, id) => {
        await apiExpenseResetDraft(auth, id);
        await get().fetchExpenses(auth);
      },

      // =============================================
      // HELPER
      // =============================================
      getCategoryToolCount: (categoryId) => {
        return get().tools.filter((t) => t.category_id === categoryId).length;
      },

      clearData: () => {
        Object.keys(_lastFetch).forEach((k) => { _lastFetch[k] = 0; });
        set({
          categories: [],
          tools: [],
          customers: [],
          orders: [],
          pricingRules: [],
          toolReport: [],
          error: null,
        });
      },
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
