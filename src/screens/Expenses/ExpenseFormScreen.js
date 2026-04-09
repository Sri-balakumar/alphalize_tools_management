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
import { fetchExpenseById, fetchInternalUsers, fetchAccounts, fetchExpenseCategories } from "@api/services/odooService";

// Categories are now fetched from rental.expense.category (no longer hardcoded).
// The CATEGORY_LABELS fallback is only used if old legacy Selection values appear.
const LEGACY_CATEGORY_LABELS = {
  fuel: "Fuel", repair: "Repair / Maintenance", tools: "Tools / Equipment",
  transport: "Transport", office: "Office", food: "Food / Travel",
  rent: "Rent / Utilities", other: "Other",
};

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

// ── Inline dropdown picker (modal-based, optionally searchable) ────
const DropdownPicker = ({ label, value, options, onSelect, placeholder, searchable }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = !searchable || !search.trim()
    ? options
    : options.filter((o) =>
        String(o.label || "").toLowerCase().includes(search.trim().toLowerCase())
      );
  const handleClose = () => {
    setOpen(false);
    setSearch("");
  };
  return (
    <View>
      <TouchableOpacity style={styles.dropTrigger} onPress={() => setOpen(true)}>
        <Text style={[styles.dropTriggerText, !selected && { color: "#999" }]}>
          {selected?.label || placeholder || label}
        </Text>
        <Text style={styles.dropArrow}>▼</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <TouchableOpacity
          style={styles.dropOverlay}
          activeOpacity={1}
          onPress={handleClose}
        >
          <TouchableOpacity activeOpacity={1} style={styles.dropMenu}>
            <Text style={styles.dropMenuTitle}>{label}</Text>
            {searchable ? (
              <TextInput
                style={styles.dropSearch}
                placeholder="Search..."
                placeholderTextColor="#999"
                value={search}
                onChangeText={setSearch}
                autoFocus={false}
              />
            ) : null}
            <ScrollView
              style={{ maxHeight: 340 }}
              keyboardShouldPersistTaps="handled"
            >
              {filtered.length === 0 ? (
                <Text style={styles.dropEmpty}>No matches</Text>
              ) : (
                filtered.map((opt) => (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[
                      styles.dropItem,
                      value === opt.value && styles.dropItemActive,
                    ]}
                    onPress={() => {
                      onSelect(opt.value);
                      handleClose();
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
                ))
              )}
            </ScrollView>
          </TouchableOpacity>
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
  const authUser = useAuthStore((s) => s.user);
  const orders = useToolStore((s) => s.orders);
  const fetchOrders = useToolStore((s) => s.fetchOrders);
  const addExpense = useToolStore((s) => s.addExpense);
  const updateExpense = useToolStore((s) => s.updateExpense);
  const deleteExpense = useToolStore((s) => s.deleteExpense);
  const expenseSubmit = useToolStore((s) => s.expenseSubmit);
  const expenseApprove = useToolStore((s) => s.expenseApprove);
  const expenseMarkPaid = useToolStore((s) => s.expenseMarkPaid);
  const expenseRefuse = useToolStore((s) => s.expenseRefuse);
  const expenseResetDraft = useToolStore((s) => s.expenseResetDraft);
  const expenseSplit = useToolStore((s) => s.expenseSplit);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [categoryId, setCategoryId] = useState(null);
  const [expenseCategories, setExpenseCategories] = useState([]);
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
  // Extra hr.expense parity fields
  const [managerId, setManagerId] = useState(null);
  const [accountName, setAccountName] = useState("");
  const [taxPercent, setTaxPercent] = useState(0);
  const [includedTaxes, setIncludedTaxes] = useState("0");
  const [users, setUsers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  // Split modal
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitParts, setSplitParts] = useState("2");

  const totalAmount = (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);

  // Auto-recompute included taxes whenever quantity, unitPrice, or taxPercent change
  const recomputeTax = (q, up, tp) => {
    const total = (parseFloat(q) || 0) * (parseFloat(up) || 0);
    setIncludedTaxes(String((total * (tp || 0) / 100).toFixed(3)));
  };

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
        setCategoryId(e.category_id || null);
        setQuantity(String(e.quantity || 1));
        setUnitPrice(String(e.unit_price || 0));
        setPaymentMode(e.payment_mode || "own_account");
        setPaymentMethod(e.payment_method || "cash");
        setRentalOrderId(e.rental_order_id || null);
        setNotes(e.notes || "");
        setReceiptImage(e.receipt_image || null);
        setReceiptName(e.receipt_filename || (e.receipt_image ? "receipt" : ""));
        setState(e.state || "draft");
        setUserName(e.user_name || "");
        setManagerId(e.manager_id || null);
        setAccountName(e.account_name || "");
        setTaxPercent(e.tax_percent || 0);
        setIncludedTaxes(String(e.included_taxes || 0));
      })
      .catch((err) => showToastMessage("Failed to load: " + err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [expenseId, odooAuth]);

  // Lazy-load expense categories (once per screen)
  useEffect(() => {
    if (!odooAuth || expenseCategories.length) return;
    fetchExpenseCategories(odooAuth)
      .then((list) => setExpenseCategories(list))
      .catch((e) => showToastMessage("Categories fetch failed: " + (e?.message || e)));
  }, [odooAuth]);

  // Lazy-load internal users for the Manager picker (once per screen)
  useEffect(() => {
    if (!odooAuth || users.length) return;
    fetchInternalUsers(odooAuth)
      .then((list) => setUsers(list))
      .catch(() => {});
  }, [odooAuth]);

  // Lazy-load accounting accounts for the Account picker (once per screen)
  useEffect(() => {
    if (!odooAuth || accounts.length) return;
    fetchAccounts(odooAuth)
      .then((list) => {
        setAccounts(list);
        if (!list.length) {
          showToastMessage("No accounts found in account.account");
        }
      })
      .catch((e) => {
        showToastMessage("Account fetch failed: " + (e?.message || e));
      });
  }, [odooAuth]);

  // Lazy-load rental orders for the Linked Rental Order picker (once per screen)
  useEffect(() => {
    if (!odooAuth || (orders && orders.length)) return;
    fetchOrders(odooAuth).catch(() => {});
  }, [odooAuth]);

  const editable = state === "draft";
  const requiredFilled = !!name.trim() && !!categoryId;
  const requireFieldsOrAlert = () => {
    const missing = [];
    if (!name.trim()) missing.push("Description");
    if (!categoryId) missing.push("Category");
    if (missing.length) {
      Alert.alert(
        "Missing Required Fields",
        "Please fill in: " + missing.join(" and ") + " before continuing.",
      );
      return false;
    }
    return true;
  };

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
        setReceiptName("receipt_photo_" + Date.now() + ".jpg");
      }
    } catch (e) {
      showToastMessage("Image error: " + e.message);
    }
  };

  const buildPayload = () => ({
    name,
    date,
    category_id: categoryId,
    tax_percent: taxPercent,
    quantity,
    unit_price: unitPrice,
    payment_mode: paymentMode,
    payment_method: paymentMethod,
    rental_order_id: rentalOrderId,
    notes,
    receipt_image: receiptImage,
    receipt_filename: receiptName,
    manager_id: managerId,
    account_name: accountName,
    included_taxes: includedTaxes,
  });

  const handleSave = async () => {
    if (!requireFieldsOrAlert()) return;
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

  // Attach Receipt — gated on required fields, supports any file format
  const [receiptName, setReceiptName] = useState("");

  const onAttachReceipt = () => {
    if (!requireFieldsOrAlert()) return;
    Alert.alert(
      "Attach Receipt",
      "Pick a file from camera or browse any document (PDF, image, etc.).",
      [
        { text: "Cancel", style: "cancel" },
        { text: "📷 Camera", onPress: () => pickReceipt(true) },
        { text: "📄 File", onPress: pickDocument },
      ]
    );
  };

  const pickDocument = async () => {
    try {
      const DocumentPicker = require("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      const FileSystem = require("expo-file-system");
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setReceiptImage(base64);
      setReceiptName(file.name || "receipt");
      showToastMessage("Attached: " + (file.name || "document"));
    } catch (e) {
      showToastMessage("File pick failed: " + (e.message || "error"));
    }
  };

  const getMimeType = (filename) => {
    const ext = (filename || "").split(".").pop().toLowerCase();
    const mimes = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      txt: "text/plain",
    };
    return mimes[ext] || "application/octet-stream";
  };

  const downloadReceipt = async () => {
    if (!receiptImage) return;
    try {
      const FileSystem = require("expo-file-system");
      const Sharing = require("expo-sharing");
      const fileName = receiptName || "receipt";
      const mimeType = getMimeType(fileName);

      // Try Android SAF (lets user pick Downloads folder)
      if (require("react-native").Platform.OS === "android") {
        try {
          const SAF = FileSystem.StorageAccessFramework;
          const perm = await SAF.requestDirectoryPermissionsAsync();
          if (perm.granted) {
            const uri = await SAF.createFileAsync(perm.directoryUri, fileName, mimeType);
            await FileSystem.writeAsStringAsync(uri, receiptImage, {
              encoding: FileSystem.EncodingType.Base64,
            });
            showToastMessage("Saved: " + fileName);
            return;
          }
        } catch (_e) {
          // Fall through to share
        }
      }

      // Fallback: write to cache + open share sheet (iOS or denied permission)
      const tmpUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(tmpUri, receiptImage, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await Sharing.shareAsync(tmpUri, { mimeType });
    } catch (e) {
      showToastMessage("Download failed: " + (e.message || "error"));
    }
  };

  const onSplitConfirm = async () => {
    const n = parseInt(splitParts, 10) || 0;
    if (n < 2 || n > 20) {
      Alert.alert("Invalid", "Number of parts must be between 2 and 20.");
      return;
    }
    if (isNew) {
      Alert.alert("Save First", "Please save the expense before splitting it.");
      return;
    }
    setSaving(true);
    try {
      // Save current edits first so the split inherits them
      await updateExpense(odooAuth, expenseId, buildPayload());
      await expenseSplit(odooAuth, expenseId, n);
      setShowSplitModal(false);
      showToastMessage("Split into " + n + " parts");
      navigation.goBack();
    } catch (e) {
      showToastMessage("Split failed: " + (e.message || "error"));
    } finally {
      setSaving(false);
    }
  };

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

          {/* TOP BUTTONS — Attach Receipt / Submit / Split Expense (Draft only) */}
          {state === "draft" && (
            <View style={styles.topBtnRow}>
              <TouchableOpacity
                style={[
                  styles.topBtn,
                  { backgroundColor: "#1976D2" },
                  !requiredFilled && styles.topBtnDisabled,
                ]}
                onPress={onAttachReceipt}
                disabled={saving}
              >
                <Text style={styles.topBtnText}>
                  📎 {receiptImage ? "Replace Receipt" : "Attach Receipt"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.topBtn,
                  { backgroundColor: "#714B67" },
                  (!requiredFilled || isNew) && styles.topBtnDisabled,
                ]}
                onPress={() => {
                  if (!requireFieldsOrAlert()) return;
                  if (isNew) {
                    Alert.alert("Save First", "Please save the expense before submitting.");
                    return;
                  }
                  onSubmit();
                }}
                disabled={saving}
              >
                <Text style={styles.topBtnText}>Submit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.topBtn,
                  { backgroundColor: "#FB8C00" },
                  (!requiredFilled || isNew) && styles.topBtnDisabled,
                ]}
                onPress={() => {
                  if (!requireFieldsOrAlert()) return;
                  if (isNew) {
                    Alert.alert("Save First", "Please save the expense before splitting it.");
                    return;
                  }
                  setSplitParts("2");
                  setShowSplitModal(true);
                }}
                disabled={saving}
              >
                <Text style={styles.topBtnText}>Split Expense</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* SECONDARY WORKFLOW ROW — only when not in Draft */}
          {state !== "draft" && (
            <View style={styles.workflowRow}>
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
          )}

          {/* DESCRIPTION */}
          <Text style={styles.label}>
            Description <Text style={{ color: "#D32F2F" }}>*</Text>
          </Text>
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
                onChangeText={(v) => {
                  setQuantity(v);
                  recomputeTax(v, unitPrice, taxPercent);
                }}
                keyboardType="numeric"
                selectTextOnFocus
                editable={editable}
              />
            </View>
          </View>

          <View style={styles.row2col}>
            <View style={styles.col}>
              <Text style={styles.label}>
                Category <Text style={{ color: "#D32F2F" }}>*</Text>
              </Text>
              {editable ? (
                <DropdownPicker
                  label="Category"
                  value={categoryId}
                  options={expenseCategories.map((c) => ({ value: c.id, label: c.label }))}
                  onSelect={(val) => {
                    setCategoryId(val);
                    const cat = expenseCategories.find((c) => c.id === val);
                    if (cat) {
                      setUnitPrice(String(cat.cost || 0));
                      setTaxPercent(cat.tax_percent || 0);
                      recomputeTax(quantity, cat.cost || 0, cat.tax_percent || 0);
                    }
                  }}
                  placeholder="Select category..."
                  searchable
                />
              ) : (
                <Text style={styles.readonlyValue}>
                  {expenseCategories.find((c) => c.id === categoryId)?.label || LEGACY_CATEGORY_LABELS[categoryId] || "—"}
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
                onChangeText={(v) => {
                  setUnitPrice(v);
                  recomputeTax(quantity, v, taxPercent);
                }}
                keyboardType="numeric"
                selectTextOnFocus
                editable={editable}
              />
            </View>
          </View>

          {/* TOTAL AMOUNT (with currency code on the right) */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Text style={styles.totalValue}>{totalAmount.toFixed(3)}</Text>
              <Text style={styles.totalCurrency}>OMR</Text>
            </View>
          </View>

          {/* INCLUDED TAXES — shows percentage badge + computed amount */}
          <Text style={styles.label}>Included Taxes</Text>
          <View style={styles.taxRow}>
            {parseFloat(includedTaxes) > 0 || taxPercent > 0 ? (
              <View style={styles.taxBadge}>
                <Text style={styles.taxBadgeText}>{taxPercent}%</Text>
              </View>
            ) : null}
            <Text style={styles.taxAmount}>
              {parseFloat(includedTaxes || 0).toFixed(3)} OMR
            </Text>
          </View>

          {/* COMPANY (read-only) */}
          <Text style={styles.label}>Company</Text>
          <Text style={styles.readonlyValue}>
            {authUser?.company_name || "(default company)"}
          </Text>

          {/* SPENT BY (read-only display from loaded record) */}
          {!isNew && userName ? (
            <>
              <Text style={styles.label}>Spent By (Employee)</Text>
              <Text style={styles.readonlyValue}>{userName}</Text>
            </>
          ) : null}

          {/* MANAGER — always Auto-validation */}
          <Text style={styles.label}>Manager</Text>
          <Text style={styles.readonlyValue}>Auto-validation</Text>

          {/* ACCOUNT — picker from account.account when available, fallback to free text */}
          <Text style={styles.label}>Account</Text>
          {editable ? (
            accounts.length > 0 ? (
              <DropdownPicker
                label="Account"
                value={accountName}
                options={[
                  { value: "", label: "(none)" },
                  ...accounts.map((a) => ({ value: a.label, label: a.label })),
                ]}
                onSelect={setAccountName}
                placeholder="Select account..."
                searchable
              />
            ) : (
              <TextInput
                style={styles.input}
                placeholder="e.g. 500101 Cost of Goods Sold in Trading"
                placeholderTextColor="#999"
                value={accountName}
                onChangeText={setAccountName}
              />
            )
          ) : (
            <Text style={styles.readonlyValue}>{accountName || "(none)"}</Text>
          )}

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
              searchable
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
                <View style={styles.receiptFileCard}>
                  <Text style={styles.receiptFileName} numberOfLines={1}>
                    {receiptName || "receipt"}
                  </Text>
                  <View style={styles.receiptFileActions}>
                    <TouchableOpacity onPress={downloadReceipt} style={styles.receiptIconBtn}>
                      <Text style={styles.receiptIconText}>⬇</Text>
                    </TouchableOpacity>
                    {editable && (
                      <TouchableOpacity
                        onPress={() => { setReceiptImage(null); setReceiptName(""); }}
                        style={[styles.receiptIconBtn, { backgroundColor: "#FFEBEE" }]}
                      >
                        <Text style={[styles.receiptIconText, { color: "#D32F2F" }]}>🗑</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
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
                    onPress={pickDocument}
                  >
                    <Text style={styles.receiptBtnText}>📄 File</Text>
                  </TouchableOpacity>
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

        {/* SPLIT EXPENSE MODAL */}
        <Modal
          visible={showSplitModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSplitModal(false)}
        >
          <View style={styles.splitOverlay}>
            <View style={styles.splitCard}>
              <Text style={styles.splitTitle}>Split Expense</Text>
              <Text style={styles.splitSubtitle}>
                Split this expense into how many equal parts? (2–20)
              </Text>
              <Text style={styles.splitInfo}>
                Current total: <Text style={{ fontWeight: "800", color: "#714B67" }}>
                  ر.ع.{totalAmount.toFixed(3)}
                </Text>
              </Text>
              <TextInput
                style={styles.splitInput}
                value={splitParts}
                onChangeText={setSplitParts}
                keyboardType="numeric"
                selectTextOnFocus
                placeholder="2"
                placeholderTextColor="#999"
              />
              <Text style={styles.splitPreview}>
                Each part will be ≈ ر.ع.
                {((totalAmount || 0) / (parseInt(splitParts, 10) || 2)).toFixed(3)}
              </Text>
              <View style={styles.splitBtnRow}>
                <TouchableOpacity
                  style={[styles.splitBtn, { backgroundColor: "#9E9E9E" }]}
                  onPress={() => setShowSplitModal(false)}
                  disabled={saving}
                >
                  <Text style={styles.splitBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.splitBtn, { backgroundColor: "#FB8C00" }, saving && { opacity: 0.6 }]}
                  onPress={onSplitConfirm}
                  disabled={saving}
                >
                  <Text style={styles.splitBtnText}>{saving ? "Splitting..." : "Split"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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

  topBtnRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  topBtn: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  topBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  topBtnDisabled: { opacity: 0.45 },

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
  totalCurrency: { fontSize: 13, fontWeight: "700", color: "#9C27B0", letterSpacing: 0.5 },
  taxRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  taxBadge: {
    backgroundColor: "#17A2B8",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  taxBadgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  taxAmount: { fontSize: 14, fontWeight: "700", color: "#333" },

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

  receiptFileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    padding: 12,
    gap: 10,
  },
  receiptFileName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  receiptFileActions: {
    flexDirection: "row",
    gap: 8,
  },
  receiptIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#E3F2FD",
    alignItems: "center",
    justifyContent: "center",
  },
  receiptIconText: { fontSize: 16 },
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

  // Split modal styles
  splitOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  splitCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  splitTitle: { fontSize: 18, fontWeight: "800", color: "#212121", marginBottom: 6 },
  splitSubtitle: { fontSize: 12, color: "#666", marginBottom: 10 },
  splitInfo: { fontSize: 12, color: "#666", marginBottom: 8 },
  splitInput: {
    borderWidth: 1.5,
    borderColor: "#FB8C00",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 18,
    fontWeight: "800",
    color: "#222",
    textAlign: "center",
    marginBottom: 8,
  },
  splitPreview: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    marginBottom: 14,
    fontStyle: "italic",
  },
  splitBtnRow: { flexDirection: "row", gap: 8 },
  splitBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: "center",
  },
  splitBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },

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
  dropSearch: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    backgroundColor: "#FAFAFA",
    color: "#222",
    marginHorizontal: 6,
    marginBottom: 6,
  },
  dropEmpty: {
    textAlign: "center",
    color: "#999",
    paddingVertical: 18,
    fontSize: 12,
    fontStyle: "italic",
  },
  dropItem: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  dropItemActive: { backgroundColor: "#714B6715" },
  dropItemText: { fontSize: 14, color: "#333" },
  dropItemTextActive: { color: "#714B67", fontWeight: "700" },
});

export default ExpenseFormScreen;
