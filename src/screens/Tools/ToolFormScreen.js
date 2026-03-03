import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView, RoundedContainer } from "@components/containers";
import NavigationHeader from "@components/Header/NavigationHeader";
import { TextInput } from "@components/common/TextInput";
import { Button } from "@components/common/Button";
import { COLORS, SPACING } from "@constants/theme";
import { showToastMessage } from "@components/Toast";
import useToolStore from "@stores/toolManagement/useToolStore";
import useAuthStore from "@stores/auth/useAuthStore";

const STATES = [
  { label: "Available", value: "available", color: "#4CAF50" },
  { label: "Rented", value: "rented", color: "#FF9800" },
  { label: "Maintenance", value: "maintenance", color: "#F44336" },
  { label: "Retired", value: "retired", color: "#9E9E9E" },
];

const CATEGORIES = [
  { label: "Power Tools", value: "1", code: "PWR" },
  { label: "Hand Tools", value: "2", code: "HND" },
  { label: "Heavy Equipment", value: "3", code: "HVY" },
  { label: "Measuring Instruments", value: "4", code: "MSR" },
  { label: "Safety Equipment", value: "5", code: "SFT" },
  { label: "Garden & Landscaping", value: "6", code: "GRD" },
  { label: "Cleaning Equipment", value: "7", code: "CLN" },
];

const ToolFormScreen = ({ navigation, route }) => {
  const mode = route?.params?.mode || "create";
  const existingTool = route?.params?.tool;
  const odooAuth = useAuthStore((s) => s.odooAuth);
  const addTool = useToolStore((s) => s.addTool);
  const updateToolStore = useToolStore((s) => s.updateTool);

  const [form, setForm] = useState({
    name: existingTool?.name || "",
    code: existingTool?.code || "",
    serial_number: existingTool?.serial_number || "",
    barcode: existingTool?.barcode || "",
    brand: existingTool?.brand || "",
    model_name: existingTool?.model_name || "",
    location: existingTool?.location || "",
    total_qty: existingTool?.total_qty?.toString() || "1",
    rental_price_per_day: existingTool?.rental_price_per_day?.toString() || "",
    late_fee_per_day: existingTool?.late_fee_per_day?.toString() || "",
    purchase_price: existingTool?.purchase_price?.toString() || "",
    purchase_date: existingTool?.purchase_date || "",
    description: existingTool?.description || "",
    state: existingTool?.state || "available",
    category_id: existingTool?.category_id || "",
  });
  const [errors, setErrors] = useState({});

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: null }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Tool name is required";
    if (!form.category_id) e.category_id = "Category is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      if (odooAuth) {
        if (existingTool?.odoo_id) {
          await updateToolStore(odooAuth, existingTool.odoo_id, form);
        } else {
          await addTool(odooAuth, form);
        }
      }
      showToastMessage("Tool saved successfully");
      navigation.goBack();
    } catch (error) {
      showToastMessage("Error: " + error.message);
    }
  };

  const renderChips = (field, options) => (
    <View style={styles.chipRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.chip, form[field] === opt.value && styles.chipActive]}
          onPress={() => handleChange(field, opt.value)}
        >
          <Text style={[styles.chipText, form[field] === opt.value && styles.chipTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const stateInfo = STATES.find((s) => s.value === form.state);

  return (
    <SafeAreaView>
      <NavigationHeader
        title={mode === "create" ? "Add Tool" : form.name || "Tool"}
        navigation={navigation}
      />
      <RoundedContainer>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Status */}
          <View style={[styles.statusBadge, { backgroundColor: stateInfo?.color || COLORS.gray }]}>
            <Text style={styles.statusText}>{stateInfo?.label || form.state}</Text>
          </View>

          {/* Basic Info */}
          <Text style={styles.section}>Basic Information</Text>
          <TextInput label="Tool Name *" placeholder="Enter tool name" value={form.name} onChangeText={(t) => handleChange("name", t)} error={errors.name} column />
          <TextInput label="Internal Code" placeholder="e.g. PWR-001" value={form.code} onChangeText={(t) => handleChange("code", t)} column />

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Category *</Text>
            {renderChips("category_id", CATEGORIES)}
            {errors.category_id && <Text style={styles.errorText}>{errors.category_id}</Text>}
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Status</Text>
            {renderChips("state", STATES)}
          </View>

          {/* Identification */}
          <Text style={styles.section}>Identification</Text>
          <TextInput label="Serial Number" placeholder="Serial number" value={form.serial_number} onChangeText={(t) => handleChange("serial_number", t)} column />
          <TextInput label="Barcode" placeholder="Barcode" value={form.barcode} onChangeText={(t) => handleChange("barcode", t)} column />
          <TextInput label="Brand" placeholder="Brand" value={form.brand} onChangeText={(t) => handleChange("brand", t)} column />
          <TextInput label="Model" placeholder="Model" value={form.model_name} onChangeText={(t) => handleChange("model_name", t)} column />
          <TextInput label="Storage Location" placeholder="e.g. Warehouse A, Shelf 3" value={form.location} onChangeText={(t) => handleChange("location", t)} column />

          {/* Quantity & Pricing */}
          <Text style={styles.section}>Quantity & Pricing</Text>
          <TextInput label="Total Quantity" placeholder="1" value={form.total_qty} onChangeText={(t) => handleChange("total_qty", t)} keyboardType="numeric" column />
          <TextInput label="Rental Price / Day" placeholder="0.00" value={form.rental_price_per_day} onChangeText={(t) => handleChange("rental_price_per_day", t)} keyboardType="decimal-pad" column />
          <TextInput label="Late Fee / Day" placeholder="0.00" value={form.late_fee_per_day} onChangeText={(t) => handleChange("late_fee_per_day", t)} keyboardType="decimal-pad" column />

          {/* Purchase Info */}
          <Text style={styles.section}>Purchase Info</Text>
          <TextInput label="Purchase Date" placeholder="YYYY-MM-DD" value={form.purchase_date} onChangeText={(t) => handleChange("purchase_date", t)} column />
          <TextInput label="Purchase Price" placeholder="0.00" value={form.purchase_price} onChangeText={(t) => handleChange("purchase_price", t)} keyboardType="decimal-pad" column />

          <TextInput label="Description" placeholder="Tool description..." value={form.description} onChangeText={(t) => handleChange("description", t)} multiline numberOfLines={3} column />

          <View style={{ marginTop: 16, paddingHorizontal: 16 }}>
            <Button title="Save Tool" onPress={handleSave} />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  scroll: { padding: SPACING.paddingMedium },
  statusBadge: { alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, marginBottom: 8 },
  statusText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  section: { fontSize: 17, fontWeight: "700", color: COLORS.primaryThemeColor, marginTop: 18, marginBottom: 8 },
  fieldWrap: { marginBottom: 10 },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: COLORS.primaryThemeColor, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: "#ddd", backgroundColor: "#f9f9f9" },
  chipActive: { backgroundColor: COLORS.primaryThemeColor, borderColor: COLORS.primaryThemeColor },
  chipText: { fontSize: 13, color: COLORS.gray },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  errorText: { color: COLORS.red, fontSize: 12, marginTop: 4 },
});

export default ToolFormScreen;
