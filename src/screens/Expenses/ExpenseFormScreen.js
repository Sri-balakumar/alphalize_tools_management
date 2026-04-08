import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView, RoundedContainer } from "@components/containers";
import NavigationHeader from "@components/Header/NavigationHeader";
import { showToastMessage } from "@components/Toast";
import useToolStore from "@stores/toolManagement/useToolStore";
import useAuthStore from "@stores/auth/useAuthStore";
import { fetchExpenseById } from "@api/services/odooService";

const CATEGORIES = [
  { value: "fuel", label: "Fuel" },
  { value: "repair", label: "Repair / Maintenance" },
  { value: "tools", label: "Tools / Equipment" },
  { value: "transport", label: "Transport" },
  { value: "office", label: "Office" },
  { value: "food", label: "Food / Travel" },
  { value: "rent", label: "Rent / Utilities" },
  { value: "other", label: "Other" },
];

const PAYMENT_MODES = [
  { value: "own_account", label: "Employee (to reimburse)" },
  { value: "company_account", label: "Company" },
];

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank" },
  { value: "credit", label: "Credit" },
];

const STATE_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  done: "Paid",
  refused: "Refused",
};

const STATE_COLORS = {
  draft: "#9E9E9E",
  submitted: "#1976D2",
  approved: "#FB8C00",
  done: "#388E3C",
  refused: "#D32F2F",
};

const STATE_FLOW = ["draft", "submitted", "approved", "done"];

const todayIso = () => {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
};

// ── Inline dropdown picker (modal-based) ─────────────────────────────
const DropdownPicker = ({ label, value, options, onSelect, placeholder }) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View>
      <TouchableOpacity style={styles.dropTrigger} onPress={() => setOpen(true)}>
        <Text style={[styles.dropTriggerText, !selected && { color: "#999" }]}>
          {selected?.label || placeholder || label}
        </Text>
        <Text style={styles.dropArrow}>▼</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity
          style={styles.dropOverlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={styles.dropMenu}>
            <Text style={styles.dropMenuTitle}>{label}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {options.map((opt) => (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[
                    styles.dropItem,
                    value === opt.value && styles.dropItemActive,
                  ]}
                  onPress={() => {
                    onSelect(opt.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropItemText,
                      value === opt.value && styles.dropItemTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ════════════════════════════════════════════════════════════════════
const ExpenseFormScreen = ({ navigation, route }) => {
  const expenseId = route?.params?.id || null;
  const isNew = !expenseId;

  const odooAuth = useAuthStore((s) => s.odooAuth);
  const orders = useToolStore((s) => s.orders);
  const addExpense = useToolStore((s) => s.addExpense);
  const updateExpense = useToolStore((s) => s.updateExpense);
  const deleteExpense = useToolStore((s) => s.deleteExpense);
  const expenseSubmit = useToolStore((s) => s.expenseSubmit);
  const expenseApprove = useToolStore((s) => s.expenseApprove);
  const expenseMarkPaid = useToolStore((s) => s.expenseMarkPaid);
  const expenseRefuse = useToolStore((s) => s.expenseRefuse);
  const expenseResetDraft = useToolStore((s) => s.expenseResetDraft);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState("other");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0");
  const [paymentMode, setPaymentMode] = useState("own_account");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [rentalOrderId, setRentalOrderId] = useState(null);
  const [notes, setNotes] = useState("");
  const [receiptImage, setReceiptImage] = useState(null);
  const [state, setState] = useState("draft");
  const [userName, setUserName] = useState("");
  const [activeTab, setActiveTab] = useState("notes");

  const totalAmount = (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);

  // Load existing expense
  useEffect(() => {
    if (isNew || !odooAuth) return;
    let cancelled = false;
    setLoading(true);
    fetchExpenseById(odooAuth, expenseId)
      .then((e) => {
        if (cancelled || !e) return;
        setName(e.name || "");
        setDate(e.date || todayIso());
        setCategory(e.category || "other");
        setQuantity(String(e.quantity || 1));
        setUnitPrice(String(e.unit_price || 0));
        setPaymentMode(e.payment_mode || "own_account");
        setPaymentMethod(e.payment_method || "cash");
        setRentalOrderId(e.rental_order_id || null);
        setNotes(e.notes || "");
        setReceiptImage(e.receipt_image || null);
        setState(e.state || "draft");
        setUserName(e.user_name || "");
      })
      .catch((err) => showToastMessage("Failed to load: " + err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [expenseId, odooAuth]);

  const editable = state === "draft";

  const orderOptions = [
    { value: null, label: "(none)" },
    ...(orders || [])
      .filter((o) => o.odoo_id)
      .map((o) => ({
        value: o.odoo_id,
        label: o.name + (o.partner_name ? " · " + o.partner_name : ""),
      })),
  ];

  const pickReceipt = async (fromCamera) => {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showToastMessage("Permission denied");
        return;
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            base64: true,
            quality: 0.7,
          });
      if (!result.canceled && result.assets?.[0]?.base64) {
        setReceiptImage(result.assets[0].base64);
      }
    } catch (e) {
      showToastMessage("Image error: " + e.message);
    }
  };

  const buildPayload = () => ({
    name,
    date,
    category,
    quantity,
    unit_price: unitPrice,
    payment_mode: paymentMode,
    payment_method: paymentMethod,
    rental_order_id: rentalOrderId,
    notes,
    receipt_image: receiptImage,
  });

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Description Required", "Please enter a description for this expense.");
      return;
    }
    if (totalAmount <= 0) {
      Alert.alert("Invalid Amount", "Quantity × Unit Price must be greater than zero.");
      return;
    }
    if (!odooAuth) return;
    setSaving(true);
    try {
      if (isNew) {
        const newId = await addExpense(odooAuth, buildPayload());
        showToastMessage("Expense created");
        navigation.replace("ExpenseFormScreen", { id: newId });
      } else {
        await updateExpense(odooAuth, expenseId, buildPayload());
        showToastMessage("Expense saved");
      }
    } catch (e) {
      showToastMessage("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (isNew) return;
    Alert.alert("Delete Expense", "Are you sure? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await deleteExpense(odooAuth, expenseId);
            showToastMessage("Deleted");
            navigation.goBack();
          } catch (e) {
            showToastMessage("Delete failed: " + e.message);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const runWorkflow = async (fn, successMsg) => {
    if (isNew) {
      Alert.alert("Save First", "Please save the expense before running this action.");
      return;
    }
    setSaving(true);
    try {
      // Save current edits first if still in draft (so user input isn't lost)
      if (state === "draft") {
        await updateExpense(odooAuth, expenseId, buildPayload());
      }
      await fn(odooAuth, expenseId);
      const updated = await fetchExpenseById(odooAuth, expenseId);
      if (updated) setState(updated.state);
      showToastMessage(successMsg);
    } catch (e) {
      showToastMessage("Action failed: " + (e.message || "error"));
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = () => runWorkflow(expenseSubmit, "Submitted for approval");
  const onApprove = () => runWorkflow(expenseApprove, "Approved");
  const onMarkPaid = () => runWorkflow(expenseMarkPaid, "Marked as paid");
  const onRefuse = () => runWorkflow(expenseRefuse, "Refused");
  const onResetDraft = () => runWorkflow(expenseResetDraft, "Reset to draft");

  if (loading) {
    return (
      <SafeAreaView>
        <NavigationHeader title="Expense" navigation={navigation} />
        <RoundedContainer>
          <View style={{ padding: 40, alignItems: "center" }}>
            <ActivityIndicator size="large" color="#714B67" />
          </View>
        </RoundedContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView>
      <NavigationHeader
        title={isNew ? "New Expense" : name || "Expense"}
        navigation={navigation}
      />
      <RoundedContainer>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
          {/* STATE BREADCRUMB */}
          <View style={styles.breadcrumb}>
            {STATE_FLOW.map((s, i) => {
              const active = s === state;
              const past = STATE_FLOW.indexOf(state) > i;
              return (
                <React.Fragment key={s}>
                  <View
                    style={[
                      styles.crumb,
                      (active || past) && { backgroundColor: STATE_COLORS[s] || "#714B67" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.crumbText,
                        (active || past) && { color: "#fff" },
                      ]}
                    >
                      {STATE_LABELS[s]}
                    </Text>
                  </View>
                  {i < STATE_FLOW.length - 1 && <Text style={styles.crumbSep}>›</Text>}
                </React.Fragment>
              );
            })}
            {state === "refused" && (
              <View style={[styles.crumb, { backgroundColor: STATE_COLORS.refused, marginLeft: 8 }]}>
                <Text style={[styles.crumbText, { color: "#fff" }]}>Refused</Text>
              </View>
            )}
          </View>

          {/* WORKFLOW BUTTONS */}
          <View style={styles.workflowRow}>
            {state === "draft" && (
              <TouchableOpacity
                style={[styles.workflowBtn, { backgroundColor: "#1976D2" }]}
                onPress={onSubmit}
                disabled={saving || isNew}
              >
                <Text style={styles.workflowBtnText}>Submit</Text>
              </TouchableOpacity>
            )}
            {state === "submitted" && (
              <>
                <TouchableOpacity
                  style={[styles.workflowBtn, { backgroundColor: "#FB8C00" }]}
                  onPress={onApprove}
                  disabled={saving}
                >
                  <Text style={styles.workflowBtnText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.workflowBtn, { backgroundColor: "#D32F2F" }]}
                  onPress={onRefuse}
                  disabled={saving}
                >
                  <Text style={styles.workflowBtnText}>Refuse</Text>
                </TouchableOpacity>
              </>
            )}
            {state === "approved" && (
              <>
                <TouchableOpacity
                  style={[styles.workflowBtn, { backgroundColor: "#388E3C" }]}
                  onPress={onMarkPaid}
                  disabled={saving}
                >
                  <Text style={styles.workflowBtnText}>Mark as Paid</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.workflowBtn, { backgroundColor: "#D32F2F" }]}
                  onPress={onRefuse}
                  disabled={saving}
                >
                  <Text style={styles.workflowBtnText}>Refuse</Text>
                </TouchableOpacity>
              </>
            )}
            {(state === "submitted" || state === "approved" || state === "refused") && (
              <TouchableOpacity
                style={[styles.workflowBtn, { backgroundColor: "#9E9E9E" }]}
                onPress={onResetDraft}
                disabled={saving}
              >
                <Text style={styles.workflowBtnText}>Reset to Draft</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* DESCRIPTION */}
          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.input, !editable && styles.inputReadonly]}
            placeholder="e.g. Petrol for delivery van"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
            editable={editable}
          />

          {/* TWO-COLUMN: date / quantity, category / unit price */}
          <View style={styles.row2col}>
            <View style={styles.col}>
              <Text style={styles.label}>Expense Date</Text>
              <TextInput
                style={[styles.input, !editable && styles.inputReadonly]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#999"
                value={date}
                onChangeText={setDate}
                editable={editable}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Quantity</Text>
              <TextInput
                style={[styles.input, !editable && styles.inputReadonly]}
                placeholder="1"
                placeholderTextColor="#999"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                editable={editable}
              />
            </View>
          </View>

          <View style={styles.row2col}>
            <View style={styles.col}>
              <Text style={styles.label}>Category</Text>
              {editable ? (
                <DropdownPicker
                  label="Category"
                  value={category}
                  options={CATEGORIES}
                  onSelect={setCategory}
                />
              ) : (
                <Text style={styles.readonlyValue}>
                  {CATEGORIES.find((c) => c.value === category)?.label || category}
                </Text>
              )}
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Unit Price</Text>
              <TextInput
                style={[styles.input, !editable && styles.inputReadonly]}
                placeholder="0.000"
                placeholderTextColor="#999"
                value={unitPrice}
                onChangeText={setUnitPrice}
                keyboardType="numeric"
                editable={editable}
              />
            </View>
          </View>

          {/* TOTAL AMOUNT */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>ر.ع.{totalAmount.toFixed(3)}</Text>
          </View>

          {/* SPENT BY (read-only display from loaded record) */}
          {!isNew && userName ? (
            <>
              <Text style={styles.label}>Spent By</Text>
              <Text style={styles.readonlyValue}>{userName}</Text>
            </>
          ) : null}

          {/* PAID BY + PAYMENT METHOD */}
          <View style={styles.row2col}>
            <View style={styles.col}>
              <Text style={styles.label}>Paid By</Text>
              {editable ? (
                <DropdownPicker
                  label="Paid By"
                  value={paymentMode}
                  options={PAYMENT_MODES}
                  onSelect={setPaymentMode}
                />
              ) : (
                <Text style={styles.readonlyValue}>
                  {PAYMENT_MODES.find((p) => p.value === paymentMode)?.label || paymentMode}
                </Text>
              )}
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Payment Method</Text>
              {editable ? (
                <DropdownPicker
                  label="Payment Method"
                  value={paymentMethod}
                  options={PAYMENT_METHODS}
                  onSelect={setPaymentMethod}
                />
              ) : (
                <Text style={styles.readonlyValue}>
                  {PAYMENT_METHODS.find((p) => p.value === paymentMethod)?.label || paymentMethod}
                </Text>
              )}
            </View>
          </View>

          {/* LINKED RENTAL ORDER */}
          <Text style={styles.label}>Linked Rental Order</Text>
          {editable ? (
            <DropdownPicker
              label="Rental Order"
              value={rentalOrderId}
              options={orderOptions}
              onSelect={setRentalOrderId}
              placeholder="(none)"
            />
          ) : (
            <Text style={styles.readonlyValue}>
              {orderOptions.find((o) => o.value === rentalOrderId)?.label || "(none)"}
            </Text>
          )}

          {/* TABS: Notes / Receipt */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "notes" && styles.tabActive]}
              onPress={() => setActiveTab("notes")}
            >
              <Text style={[styles.tabText, activeTab === "notes" && styles.tabTextActive]}>
                Notes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "receipt" && styles.tabActive]}
              onPress={() => setActiveTab("receipt")}
            >
              <Text style={[styles.tabText, activeTab === "receipt" && styles.tabTextActive]}>
                Receipt
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === "notes" ? (
            <TextInput
              style={[
                styles.input,
                { minHeight: 90, textAlignVertical: "top" },
                !editable && styles.inputReadonly,
              ]}
              placeholder="Any additional details about this expense..."
              placeholderTextColor="#999"
              value={notes}
              onChangeText={setNotes}
              multiline
              editable={editable}
            />
          ) : (
            <View>
              {receiptImage ? (
                <Image
                  source={{ uri: "data:image/png;base64," + receiptImage }}
                  style={styles.receiptImg}
                />
              ) : (
                <View style={styles.receiptPlaceholder}>
                  <Text style={{ color: "#999" }}>No receipt attached</Text>
                </View>
              )}
              {editable && (
                <View style={styles.receiptBtnRow}>
                  <TouchableOpacity
                    style={[styles.receiptBtn, { backgroundColor: "#1976D2" }]}
                    onPress={() => pickReceipt(true)}
                  >
                    <Text style={styles.receiptBtnText}>📷 Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.receiptBtn, { backgroundColor: "#388E3C" }]}
                    onPress={() => pickReceipt(false)}
                  >
                    <Text style={styles.receiptBtnText}>🖼 Gallery</Text>
                  </TouchableOpacity>
                  {receiptImage && (
                    <TouchableOpacity
                      style={[styles.receiptBtn, { backgroundColor: "#D32F2F" }]}
                      onPress={() => setReceiptImage(null)}
                    >
                      <Text style={styles.receiptBtnText}>✕ Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          {/* SAVE / DELETE */}
          <View style={{ marginTop: 20 }}>
            {editable && (
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            )}
            {!isNew && state !== "done" && (
              <TouchableOpacity
                style={[styles.deleteBtn, saving && { opacity: 0.6 }]}
                onPress={handleDelete}
                disabled={saving}
              >
                <Text style={styles.deleteBtnText}>Delete Expense</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  breadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  crumb: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#eee",
    marginVertical: 2,
  },
  crumbText: { fontSize: 11, fontWeight: "700", color: "#666" },
  crumbSep: { fontSize: 14, color: "#bbb", marginHorizontal: 4 },

  workflowRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  workflowBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  workflowBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  label: {
    fontSize: 11,
    fontWeight: "800",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    backgroundColor: "#fff",
    color: "#222",
  },
  inputReadonly: { backgroundColor: "#f4f4f4", color: "#555" },
  readonlyValue: {
    fontSize: 13,
    color: "#333",
    fontWeight: "600",
    backgroundColor: "#f4f4f4",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },

  row2col: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },

  totalCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F3E5F5",
    borderRadius: 10,
    padding: 14,
    marginTop: 14,
    marginBottom: 4,
  },
  totalLabel: { fontSize: 12, fontWeight: "800", color: "#714B67", textTransform: "uppercase" },
  totalValue: { fontSize: 22, fontWeight: "800", color: "#714B67" },

  tabRow: { flexDirection: "row", marginTop: 16, marginBottom: 8, gap: 6 },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#f4f4f4",
    alignItems: "center",
  },
  tabActive: { backgroundColor: "#714B67" },
  tabText: { fontSize: 13, fontWeight: "700", color: "#666" },
  tabTextActive: { color: "#fff" },

  receiptImg: {
    width: "100%",
    height: 220,
    borderRadius: 10,
    backgroundColor: "#f4f4f4",
    resizeMode: "contain",
  },
  receiptPlaceholder: {
    height: 140,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fafafa",
    alignItems: "center",
    justifyContent: "center",
  },
  receiptBtnRow: { flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" },
  receiptBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  receiptBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  saveBtn: {
    backgroundColor: "#714B67",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  deleteBtn: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: "#D32F2F",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  deleteBtnText: { color: "#D32F2F", fontSize: 13, fontWeight: "800" },

  // Dropdown styles
  dropTrigger: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  dropTriggerText: { flex: 1, fontSize: 13, color: "#222", fontWeight: "600" },
  dropArrow: { fontSize: 9, color: "#888", marginLeft: 4 },
  dropOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dropMenu: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 8,
    width: "100%",
    maxWidth: 360,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  dropMenuTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#888",
    paddingHorizontal: 12,
    paddingVertical: 8,
    textTransform: "uppercase",
  },
  dropItem: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  dropItemActive: { backgroundColor: "#714B6715" },
  dropItemText: { fontSize: 14, color: "#333" },
  dropItemTextActive: { color: "#714B67", fontWeight: "700" },
});

export default ExpenseFormScreen;
