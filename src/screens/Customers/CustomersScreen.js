import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ScrollView,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView, RoundedContainer } from "@components/containers";
import NavigationHeader from "@components/Header/NavigationHeader";
import { TextInput } from "@components/common/TextInput";
import { COLORS, SPACING, BORDER_RADIUS } from "@constants/theme";
import useToolStore from "@stores/toolManagement/useToolStore";
import useAuthStore from "@stores/auth/useAuthStore";
import { updateCustomer } from "@api/services/odooService";
import { isEmail, isPhone, getPhoneLength, getEmailSuggestion } from "@utils/validation/validation";

const COUNTRY_CODES = [
  { code: "+93", name: "Afghanistan" }, { code: "+355", name: "Albania" }, { code: "+213", name: "Algeria" },
  { code: "+376", name: "Andorra" }, { code: "+244", name: "Angola" }, { code: "+54", name: "Argentina" },
  { code: "+374", name: "Armenia" }, { code: "+61", name: "Australia" }, { code: "+43", name: "Austria" },
  { code: "+994", name: "Azerbaijan" }, { code: "+973", name: "Bahrain" }, { code: "+880", name: "Bangladesh" },
  { code: "+375", name: "Belarus" }, { code: "+32", name: "Belgium" }, { code: "+501", name: "Belize" },
  { code: "+229", name: "Benin" }, { code: "+975", name: "Bhutan" }, { code: "+591", name: "Bolivia" },
  { code: "+387", name: "Bosnia" }, { code: "+267", name: "Botswana" }, { code: "+55", name: "Brazil" },
  { code: "+673", name: "Brunei" }, { code: "+359", name: "Bulgaria" }, { code: "+226", name: "Burkina Faso" },
  { code: "+257", name: "Burundi" }, { code: "+855", name: "Cambodia" }, { code: "+237", name: "Cameroon" },
  { code: "+1", name: "Canada" }, { code: "+238", name: "Cape Verde" }, { code: "+236", name: "Central African Republic" },
  { code: "+235", name: "Chad" }, { code: "+56", name: "Chile" }, { code: "+86", name: "China" },
  { code: "+57", name: "Colombia" }, { code: "+269", name: "Comoros" }, { code: "+243", name: "Congo DR" },
  { code: "+242", name: "Congo" }, { code: "+506", name: "Costa Rica" }, { code: "+385", name: "Croatia" },
  { code: "+53", name: "Cuba" }, { code: "+357", name: "Cyprus" }, { code: "+420", name: "Czech Republic" },
  { code: "+45", name: "Denmark" }, { code: "+253", name: "Djibouti" }, { code: "+593", name: "Ecuador" },
  { code: "+20", name: "Egypt" }, { code: "+503", name: "El Salvador" }, { code: "+240", name: "Equatorial Guinea" },
  { code: "+291", name: "Eritrea" }, { code: "+372", name: "Estonia" }, { code: "+251", name: "Ethiopia" },
  { code: "+679", name: "Fiji" }, { code: "+358", name: "Finland" }, { code: "+33", name: "France" },
  { code: "+241", name: "Gabon" }, { code: "+220", name: "Gambia" }, { code: "+995", name: "Georgia" },
  { code: "+49", name: "Germany" }, { code: "+233", name: "Ghana" }, { code: "+30", name: "Greece" },
  { code: "+502", name: "Guatemala" }, { code: "+224", name: "Guinea" }, { code: "+592", name: "Guyana" },
  { code: "+509", name: "Haiti" }, { code: "+504", name: "Honduras" }, { code: "+852", name: "Hong Kong" },
  { code: "+36", name: "Hungary" }, { code: "+354", name: "Iceland" }, { code: "+968", name: "India" },
  { code: "+62", name: "Indonesia" }, { code: "+98", name: "Iran" }, { code: "+964", name: "Iraq" },
  { code: "+353", name: "Ireland" }, { code: "+972", name: "Israel" }, { code: "+39", name: "Italy" },
  { code: "+225", name: "Ivory Coast" }, { code: "+1876", name: "Jamaica" }, { code: "+81", name: "Japan" },
  { code: "+962", name: "Jordan" }, { code: "+7", name: "Kazakhstan" }, { code: "+254", name: "Kenya" },
  { code: "+965", name: "Kuwait" }, { code: "+996", name: "Kyrgyzstan" }, { code: "+856", name: "Laos" },
  { code: "+371", name: "Latvia" }, { code: "+961", name: "Lebanon" }, { code: "+266", name: "Lesotho" },
  { code: "+231", name: "Liberia" }, { code: "+218", name: "Libya" }, { code: "+423", name: "Liechtenstein" },
  { code: "+370", name: "Lithuania" }, { code: "+352", name: "Luxembourg" }, { code: "+853", name: "Macau" },
  { code: "+261", name: "Madagascar" }, { code: "+265", name: "Malawi" }, { code: "+60", name: "Malaysia" },
  { code: "+960", name: "Maldives" }, { code: "+223", name: "Mali" }, { code: "+356", name: "Malta" },
  { code: "+222", name: "Mauritania" }, { code: "+230", name: "Mauritius" }, { code: "+52", name: "Mexico" },
  { code: "+373", name: "Moldova" }, { code: "+377", name: "Monaco" }, { code: "+976", name: "Mongolia" },
  { code: "+382", name: "Montenegro" }, { code: "+212", name: "Morocco" }, { code: "+258", name: "Mozambique" },
  { code: "+95", name: "Myanmar" }, { code: "+264", name: "Namibia" }, { code: "+977", name: "Nepal" },
  { code: "+31", name: "Netherlands" }, { code: "+64", name: "New Zealand" }, { code: "+505", name: "Nicaragua" },
  { code: "+227", name: "Niger" }, { code: "+234", name: "Nigeria" }, { code: "+850", name: "North Korea" },
  { code: "+389", name: "North Macedonia" }, { code: "+47", name: "Norway" }, { code: "+968", name: "Oman" },
  { code: "+92", name: "Pakistan" }, { code: "+507", name: "Panama" }, { code: "+675", name: "Papua New Guinea" },
  { code: "+595", name: "Paraguay" }, { code: "+51", name: "Peru" }, { code: "+63", name: "Philippines" },
  { code: "+48", name: "Poland" }, { code: "+351", name: "Portugal" }, { code: "+974", name: "Qatar" },
  { code: "+40", name: "Romania" }, { code: "+7", name: "Russia" }, { code: "+250", name: "Rwanda" },
  { code: "+966", name: "Saudi Arabia" }, { code: "+221", name: "Senegal" }, { code: "+381", name: "Serbia" },
  { code: "+65", name: "Singapore" }, { code: "+421", name: "Slovakia" }, { code: "+386", name: "Slovenia" },
  { code: "+252", name: "Somalia" }, { code: "+27", name: "South Africa" }, { code: "+82", name: "South Korea" },
  { code: "+211", name: "South Sudan" }, { code: "+34", name: "Spain" }, { code: "+94", name: "Sri Lanka" },
  { code: "+249", name: "Sudan" }, { code: "+597", name: "Suriname" }, { code: "+46", name: "Sweden" },
  { code: "+41", name: "Switzerland" }, { code: "+963", name: "Syria" }, { code: "+886", name: "Taiwan" },
  { code: "+992", name: "Tajikistan" }, { code: "+255", name: "Tanzania" }, { code: "+66", name: "Thailand" },
  { code: "+228", name: "Togo" }, { code: "+216", name: "Tunisia" }, { code: "+90", name: "Turkey" },
  { code: "+993", name: "Turkmenistan" }, { code: "+256", name: "Uganda" }, { code: "+380", name: "Ukraine" },
  { code: "+971", name: "UAE" }, { code: "+44", name: "United Kingdom" }, { code: "+1", name: "United States" },
  { code: "+598", name: "Uruguay" }, { code: "+998", name: "Uzbekistan" }, { code: "+58", name: "Venezuela" },
  { code: "+84", name: "Vietnam" }, { code: "+967", name: "Yemen" }, { code: "+260", name: "Zambia" },
  { code: "+263", name: "Zimbabwe" },
];

const splitPhoneCountryCode = (fullPhone) => {
  if (!fullPhone) return { code: "+968", local: "" };
  let phone = fullPhone.replace(/[\s\-()]/g, "");
  if (!phone.startsWith("+")) return { code: "+968", local: phone };
  for (let len = 4; len >= 1; len--) {
    const prefix = phone.substring(0, len + 1);
    const match = COUNTRY_CODES.find((c) => c.code === prefix);
    if (match) return { code: match.code, local: phone.substring(len + 1) };
  }
  return { code: "+968", local: phone.replace("+", "") };
};

const CustomersScreen = ({ navigation }) => {
  const odooAuth = useAuthStore((s) => s.odooAuth);
  const customers = useToolStore((s) => s.customers);
  const fetchCustomers = useToolStore((s) => s.fetchCustomers);
  const deleteCustomerFromStore = useToolStore((s) => s.deleteCustomer);
  const [search, setSearch] = useState("");

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCountryCode, setEditCountryCode] = useState("+968");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ID Proof state
  const [editIdProofFront, setEditIdProofFront] = useState(null);
  const [editIdProofBack, setEditIdProofBack] = useState(null);
  const [idProofFrontChanged, setIdProofFrontChanged] = useState(false);
  const [idProofBackChanged, setIdProofBackChanged] = useState(false);

  // Country picker state
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  const filteredCountryCodes = useMemo(() => countrySearch.trim()
    ? COUNTRY_CODES.filter((c) =>
        c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
        c.code.includes(countrySearch)
      )
    : COUNTRY_CODES, [countrySearch]);

  const phoneMaxDigits = useMemo(() => getPhoneLength(editCountryCode), [editCountryCode]);
  const computedPhoneError = useMemo(() => editPhone.length > 0 && editPhone.length !== phoneMaxDigits
    ? `Phone number must contain exactly ${phoneMaxDigits} digits`
    : null, [editPhone, phoneMaxDigits]);
  const computedEmailError = useMemo(() => editEmail.length > 0 ? isEmail(editEmail) : null, [editEmail]);
  const emailSuggestion = useMemo(() => editEmail.length > 0 ? getEmailSuggestion(editEmail) : null, [editEmail]);
  const emailAutoComplete = useMemo(() => {
    const username = editEmail.split("@")[0];
    return username.length > 0 && !editEmail.includes("@gmail.com") ? username + "@gmail.com" : null;
  }, [editEmail]);
  const isSaveDisabled = useMemo(() => saving || !editName.trim() || !!computedPhoneError || !!computedEmailError, [saving, editName, computedPhoneError, computedEmailError]);

  useFocusEffect(
    useCallback(() => {
      if (odooAuth) {
        fetchCustomers(odooAuth);
      }
    }, [odooAuth])
  );

  const filteredCustomers = customers.filter(
    (c) =>
      !search.trim() ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.customer_code?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const openEditModal = (customer) => {
    const { code, local } = splitPhoneCountryCode(customer.phone || "");
    setEditCustomer(customer);
    setEditName(customer.name || "");
    setEditPhone(local);
    setEditCountryCode(code);
    setEditEmail(customer.email || "");
    setEditIdProofFront(customer.id_proof_front || null);
    setEditIdProofBack(customer.id_proof_back || null);
    setIdProofFrontChanged(false);
    setIdProofBackChanged(false);
    setShowEditModal(true);
  };

  const pickIdProof = async (side) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      if (side === "front") {
        setEditIdProofFront(result.assets[0].base64);
        setIdProofFrontChanged(true);
      } else {
        setEditIdProofBack(result.assets[0].base64);
        setIdProofBackChanged(true);
      }
    }
  };

  const captureIdProof = async (side) => {
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      if (side === "front") {
        setEditIdProofFront(result.assets[0].base64);
        setIdProofFrontChanged(true);
      } else {
        setEditIdProofBack(result.assets[0].base64);
        setIdProofBackChanged(true);
      }
    }
  };

  const showIdProofOptions = (side) => {
    Alert.alert(
      `ID Proof - ${side === "front" ? "Front" : "Back"}`,
      "Choose an option",
      [
        { text: "Camera", onPress: () => captureIdProof(side) },
        { text: "Gallery", onPress: () => pickIdProof(side) },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const handleDelete = () => {
    if (!editCustomer || !odooAuth) return;
    Alert.alert(
      "Delete Customer",
      `Are you sure you want to delete "${editCustomer.name}"? This will also delete all related rental orders and invoices. This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            const custId = editCustomer.odoo_id || parseInt(editCustomer.id);
            try {
              await deleteCustomerFromStore(odooAuth, custId);
              setShowEditModal(false);
            } catch (e) {
              Alert.alert("Error", "Failed to delete: " + e.message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handlePhoneChange = useCallback((text) => {
    const digitsOnly = text.replace(/\D/g, "");
    if (digitsOnly.length > phoneMaxDigits) return;
    setEditPhone(digitsOnly);
  }, [phoneMaxDigits]);

  const handleEmailChange = useCallback((text) => {
    setEditEmail(text);
  }, []);

  const handleSave = async () => {
    if (isSaveDisabled) return;
    if (!editCustomer || !odooAuth) return;
    const updatedFields = {
      name: editName.trim(),
      phone: editPhone ? editCountryCode + editPhone : "",
      email: editEmail.trim(),
    };
    if (idProofFrontChanged) {
      updatedFields.id_proof_front = editIdProofFront || false;
    }
    if (idProofBackChanged) {
      updatedFields.id_proof_back = editIdProofBack || false;
    }
    // Optimistically update the local list instantly
    const custId = editCustomer.odoo_id || parseInt(editCustomer.id);
    useToolStore.setState((state) => ({
      customers: state.customers.map((c) =>
        (c.odoo_id || parseInt(c.id)) === custId ? { ...c, ...updatedFields } : c
      ),
    }));
    setShowEditModal(false);
    // Sync with Odoo in background
    updateCustomer(odooAuth, custId, updatedFields).then(() => {
      fetchCustomers(odooAuth, true);
    }).catch((e) => {
      Alert.alert("Error", "Failed to update: " + e.message);
      fetchCustomers(odooAuth, true); // Revert to server state on error
    });
  };

  const renderCustomer = ({ item }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => openEditModal(item)}>
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
            ر.ع.{parseFloat(item.total_revenue).toFixed(3)}
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
        <FlatList
          data={filteredCustomers}
          renderItem={renderCustomer}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          ListHeaderComponent={
            <View style={styles.searchWrap}>
              <TextInput
                placeholder="Search by name, code, phone, or email..."
                value={search}
                onChangeText={setSearch}
                column
              />
            </View>
          }
        />
      </RoundedContainer>

      {/* Edit Customer Modal */}
      <Modal visible={showEditModal} animationType="fade" transparent onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit Customer</Text>
                  <TouchableOpacity onPress={() => setShowEditModal(false)}>
                    <Text style={styles.modalClose}>X</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>Name *</Text>
                <RNTextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Customer name"
                  placeholderTextColor="#999"
                  style={styles.input}
                />

                <Text style={styles.fieldLabel}>Phone</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => setShowCountryPicker(true)}
                    style={styles.countryCodeBtn}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#333" }}>{editCountryCode}</Text>
                    <Text style={{ fontSize: 9, color: "#888", marginLeft: 5 }}>{"\u25BC"}</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <RNTextInput
                      value={editPhone}
                      onChangeText={handlePhoneChange}
                      placeholder={`Phone number (${getPhoneLength(editCountryCode)} digits)`}
                      placeholderTextColor="#999"
                      keyboardType="phone-pad"
                      style={styles.input}
                    />
                  </View>
                </View>
                {computedPhoneError && <Text style={styles.errorText}>{computedPhoneError}</Text>}

                <Text style={styles.fieldLabel}>Email</Text>
                <RNTextInput
                  value={editEmail}
                  onChangeText={handleEmailChange}
                  placeholder="Email address"
                  placeholderTextColor="#999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                />
                {computedEmailError && <Text style={styles.errorText}>{computedEmailError}</Text>}
                {(emailSuggestion || emailAutoComplete) && (
                  <TouchableOpacity
                    onPress={() => setEditEmail(emailSuggestion || emailAutoComplete)}
                    style={{ backgroundColor: "#1565C0", borderRadius: 6, paddingVertical: 8, paddingHorizontal: 14, marginTop: 6, alignSelf: "flex-start" }}
                  >
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Use {emailSuggestion || emailAutoComplete}</Text>
                  </TouchableOpacity>
                )}

                {/* ID Proof Front */}
                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>ID Proof - Front</Text>
                {editIdProofFront ? (
                  <View style={styles.idProofContainer}>
                    <Image
                      source={{ uri: `data:image/png;base64,${editIdProofFront}` }}
                      style={styles.idProofImage}
                      resizeMode="contain"
                    />
                    <View style={styles.idProofActions}>
                      <TouchableOpacity
                        onPress={() => showIdProofOptions("front")}
                        style={styles.idProofChangeBtn}
                      >
                        <Text style={styles.idProofChangeBtnText}>Change</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setEditIdProofFront(null); setIdProofFrontChanged(true); }}
                        style={[styles.idProofChangeBtn, { backgroundColor: "#E53935" }]}
                      >
                        <Text style={styles.idProofChangeBtnText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => showIdProofOptions("front")}
                    style={styles.idProofUploadBtn}
                  >
                    <Text style={styles.idProofUploadText}>+ Capture / Upload Front</Text>
                  </TouchableOpacity>
                )}

                {/* ID Proof Back */}
                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>ID Proof - Back</Text>
                {editIdProofBack ? (
                  <View style={styles.idProofContainer}>
                    <Image
                      source={{ uri: `data:image/png;base64,${editIdProofBack}` }}
                      style={styles.idProofImage}
                      resizeMode="contain"
                    />
                    <View style={styles.idProofActions}>
                      <TouchableOpacity
                        onPress={() => showIdProofOptions("back")}
                        style={styles.idProofChangeBtn}
                      >
                        <Text style={styles.idProofChangeBtnText}>Change</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setEditIdProofBack(null); setIdProofBackChanged(true); }}
                        style={[styles.idProofChangeBtn, { backgroundColor: "#E53935" }]}
                      >
                        <Text style={styles.idProofChangeBtnText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => showIdProofOptions("back")}
                    style={styles.idProofUploadBtn}
                  >
                    <Text style={styles.idProofUploadText}>+ Capture / Upload Back</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={handleSave}
                  disabled={isSaveDisabled}
                  style={[styles.saveBtn, isSaveDisabled && { opacity: 0.4 }]}
                >
                  <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save"}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleDelete}
                  disabled={deleting}
                  style={[styles.deleteBtn, deleting && { opacity: 0.4 }]}
                >
                  <Text style={styles.deleteBtnText}>{deleting ? "Deleting..." : "Delete Customer"}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setShowEditModal(false)} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Country Code Picker Modal */}
      <Modal visible={showCountryPicker} animationType="fade" transparent onRequestClose={() => setShowCountryPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: "70%" }]}>
            <Text style={styles.modalTitle}>Select Country Code</Text>
            <RNTextInput
              placeholder="Search country name or code..."
              value={countrySearch}
              onChangeText={setCountrySearch}
              placeholderTextColor="#888"
              autoFocus={true}
              style={{ borderWidth: 1.5, borderColor: "#1565C0", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10, marginBottom: 12, fontSize: 15, backgroundColor: "#fff", color: "#333" }}
            />
            <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
              {filteredCountryCodes.map((item, idx) => (
                <TouchableOpacity
                  key={item.name + idx}
                  onPress={() => {
                    setEditCountryCode(item.code);
                    const maxDigits = getPhoneLength(item.code);
                    if (editPhone.length > maxDigits) {
                      setEditPhone(editPhone.substring(0, maxDigits));
                    }
                    setShowCountryPicker(false);
                    setCountrySearch("");
                  }}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "#f0f0f0",
                    backgroundColor: editCountryCode === item.code ? "#E3F2FD" : "#fff",
                    borderRadius: 4,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: editCountryCode === item.code ? "700" : "400", color: editCountryCode === item.code ? "#1565C0" : "#333" }}>
                    {item.name}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: editCountryCode === item.code ? "#1565C0" : "#666" }}>
                    {item.code}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => { setShowCountryPicker(false); setCountrySearch(""); }} style={{ marginTop: 10, paddingVertical: 10, alignItems: "center", backgroundColor: "#F5F5F5", borderRadius: 8 }}>
              <Text style={{ color: "#666", fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  searchWrap: {
    marginBottom: 14,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "85%",
    padding: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  modalClose: {
    fontSize: 20,
    color: "#999",
    fontWeight: "700",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#333",
    backgroundColor: "#fff",
  },
  countryCodeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    height: 43,
    paddingHorizontal: 12,
  },
  errorText: {
    color: "red",
    fontSize: 12,
    marginTop: 3,
  },
  saveBtn: {
    backgroundColor: "#1565C0",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  deleteBtn: {
    backgroundColor: "#E53935",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  deleteBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  cancelBtnText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "600",
  },
  idProofContainer: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#fafafa",
  },
  idProofImage: {
    width: "100%",
    height: 160,
    backgroundColor: "#f0f0f0",
  },
  idProofActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 8,
  },
  idProofChangeBtn: {
    backgroundColor: "#1565C0",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  idProofChangeBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  idProofUploadBtn: {
    borderWidth: 1.5,
    borderColor: "#1565C0",
    borderStyle: "dashed",
    borderRadius: 8,
    paddingVertical: 20,
    alignItems: "center",
    backgroundColor: "#F5F8FF",
  },
  idProofUploadText: {
    color: "#1565C0",
    fontSize: 13,
    fontWeight: "600",
  },
});

export default CustomersScreen;
