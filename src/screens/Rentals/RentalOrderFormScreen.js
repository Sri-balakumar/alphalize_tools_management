import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Image,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, RoundedContainer } from "@components/containers";
import NavigationHeader from "@components/Header/NavigationHeader";
import { TextInput } from "@components/common/TextInput";
import { Button } from "@components/common/Button";
import { COLORS, SPACING, BORDER_RADIUS } from "@constants/theme";
import { showToastMessage } from "@components/Toast";
import useToolStore from "@stores/toolManagement/useToolStore";
import useAuthStore from "@stores/auth/useAuthStore";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { Asset } from "expo-asset";
import SignaturePad from "@components/common/SignaturePad/SignaturePad";
import CameraCapture from "@components/common/CameraCapture/CameraCapture";
import { updateOrderValues, updateOrderLineValues, fetchOrderDataById, fetchOrderImages, fetchOrderLineImages, downloadCheckoutInvoice, downloadCheckinInvoice, downloadPartialReturnInvoice, updateCustomer, fetchCustomerImages, sendInvoiceWhatsApp, sendWhatsAppDocument, fetchCompanyDetails } from "@api/services/odooService";
import { isEmail, isPhone, getPhoneLength, getEmailSuggestion } from "@utils/validation/validation";

const PERIOD_TYPES = [
  { label: "Daily", value: "day" },
  { label: "Weekly", value: "week" },
  { label: "Monthly", value: "month" },
];

const CONDITIONS = [
  { label: "Excellent", value: "excellent" },
  { label: "Good", value: "good" },
  { label: "Fair", value: "fair" },
  { label: "Poor", value: "poor" },
  { label: "Damaged", value: "damaged" },
];

const STATE_STEPS = [
  { key: "draft", label: "Draft" },
  { key: "confirmed", label: "Confirmed" },
  { key: "checked_out", label: "Checked Out" },
  { key: "checked_in", label: "Checked In" },
  { key: "invoiced", label: "Invoiced" },
];

const STATE_ORDER = ["draft", "confirmed", "checked_out", "checked_in", "done", "invoiced"];

const DEFAULT_TERMS_EN = [
  "All tools and equipment are delivered in good working condition.",
  "The customer must return the equipment in the same condition, except for normal wear and tear.",
  "The customer is fully responsible for any damage, loss, or missing parts during the rental period.",
  "Any damage or loss will be charged to the customer for repair or replacement.",
  "Equipment must be returned on the agreed date; late returns may incur additional rental charges.",
  "Equipment must not be sub-rented or transferred to another party without permission.",
  "The supplier is not responsible for accidents or injuries caused by improper use of the equipment.",
  "Any dispute shall be subject to the laws of the Sultanate of Oman.",
];

const DEFAULT_TERMS_AR = [
  "يتم تسليم جميع الأدوات والمعدات بحالة عمل جيدة.",
  "يجب على العميل إعادة المعدات بنفس الحالة، باستثناء التآكل والاستهلاك الطبيعي.",
  "العميل مسؤول مسؤولية كاملة عن أي ضرر أو فقدان أو أجزاء مفقودة خلال فترة الإيجار.",
  "سيتم تحميل العميل تكاليف الإصلاح أو الاستبدال في حالة حدوث أي ضرر أو فقدان.",
  "يجب إعادة المعدات في التاريخ المتفق عليه؛ وقد يترتب على التأخير رسوم إيجار إضافية.",
  "لا يجوز إعادة تأجير المعدات أو نقلها إلى طرف آخر دون إذن.",
  "المورد غير مسؤول عن الحوادث أو الإصابات الناتجة عن الاستخدام غير السليم للمعدات.",
  "أي نزاع يخضع لقوانين سلطنة عُمان.",
];

const DEFAULT_TERMS_TEXT = DEFAULT_TERMS_EN.map((t, i) => `${i + 1}. ${t}`).join("\n");

const today = () => {
  const d = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[d.getMonth()] + " " + d.getDate();
};
const todayISO = () => new Date().toISOString().split("T")[0];

// Extract time portion from a datetime string (Odoo format or JS locale string)
const formatTime = (dtStr) => {
  if (!dtStr) return "";
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
};

// Convert a local file URI to base64 string for Odoo Binary fields
const uriToBase64 = async (uri) => {
  if (!uri) return false;
  // Already a base64 data URI or raw base64
  if (uri.startsWith("data:")) {
    return uri.split(",")[1] || false;
  }
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return b64 || false;
  } catch (e) {
    console.warn("uriToBase64 error:", e);
    return false;
  }
};

// Convert Odoo base64 string to a displayable data URI
const base64ToDataUri = (b64, mimeType = "image/png") => {
  if (!b64) return null;
  if (b64.startsWith("data:")) return b64;
  return `data:${mimeType};base64,${b64}`;
};

const DetailItem = ({ label, value, color }) => (
  <View style={{ marginBottom: 10 }}>
    <Text style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{label}</Text>
    <Text style={{ fontSize: 14, fontWeight: "700", color: color || "#333" }}>{value || "-"}</Text>
  </View>
);

const RentalOrderFormScreen = ({ navigation, route }) => {
  const existingOrder = route?.params?.order;
  const odooAuth = useAuthStore((s) => s.odooAuth);
  const customers = useToolStore((s) => s.customers);
  const storeFetchCustomers = useToolStore((s) => s.fetchCustomers);
  const tools = useToolStore((s) => s.tools);
  const storeFetchTools = useToolStore((s) => s.fetchTools);
  const pricingRules = useToolStore((s) => s.pricingRules);
  const addOrder = useToolStore((s) => s.addOrder);
  const updateOrder = useToolStore((s) => s.updateOrder);
  const storeConfirmOrder = useToolStore((s) => s.confirmOrder);
  const storeCancelOrder = useToolStore((s) => s.cancelOrder);
  const storeMarkDone = useToolStore((s) => s.markDone);
  const storeCheckoutOrder = useToolStore((s) => s.checkoutOrder);
  const storeCheckinOrder = useToolStore((s) => s.checkinOrder);
  const addCustomer = useToolStore((s) => s.addCustomer);
  const [saving, setSaving] = useState(false);
  const [odooOrderId, setOdooOrderId] = useState(existingOrder?.odoo_id || null);

  const [state, setState] = useState(existingOrder?.state || "draft");
  const [form, setForm] = useState({
    name: existingOrder?.name || "New",
    customer_id: existingOrder?.customer_id || "",
    partner_id: existingOrder?.partner_id || null,
    partner_name: existingOrder?.partner_name || "",
    partner_phone: existingOrder?.partner_phone || "",
    partner_email: existingOrder?.partner_email || "",
    responsible: existingOrder?.responsible || "Admin",
    date_order: existingOrder?.date_order || today(),
    date_planned_checkout: existingOrder?.date_planned_checkout || "",
    date_planned_checkin: existingOrder?.date_planned_checkin || "",
    date_checkout: existingOrder?.date_checkout || "",
    date_checkin: existingOrder?.date_checkin || "",
    date_checkout_raw: existingOrder?.date_checkout_raw || "",
    rental_period_type: existingOrder?.rental_period_type || "day",
    rental_duration: existingOrder?.rental_duration?.toString() || "1",
    actual_duration: existingOrder?.actual_duration || "",
    advance_amount: existingOrder?.advance_amount?.toString() || "0.00",
    payment_method: existingOrder?.payment_method || "",
    cash_received: existingOrder?.cash_received?.toString() || "",
    advance_returned: existingOrder?.advance_returned || false,
    checkin_payment_method: existingOrder?.checkin_payment_method || "",
    checkin_cash_received: existingOrder?.checkin_cash_received?.toString() || "",
    damage_charges: existingOrder?.damage_charges?.toString() || "0",
    discount_amount: existingOrder?.discount_amount?.toString() || "0",
    notes: existingOrder?.notes || "",
    terms: existingOrder?.terms || DEFAULT_TERMS_TEXT,
  });

  const [rawLines, setLines] = useState(existingOrder?.lines || []);

  // Always ensure tax data is present — compute from tools if missing
  const lines = useMemo(() => {
    if (!tools || tools.length === 0) return rawLines;
    return rawLines.map(fl => {
      if (parseFloat(fl.tax_amount) > 0) return fl;
      if (!fl.tool_id) return fl;
      const tool = tools.find(t => Number(t.odoo_id || t.id) === Number(fl.tool_id));
      if (!tool || !(parseFloat(tool.tax_rate) > 0)) return fl;
      const price = parseFloat(fl.unit_price) || 0;
      const dur = parseFloat(fl.planned_duration) || 1;
      const qty = parseFloat(fl.quantity) || 1;
      const multiplier = LINE_DAY_MULTIPLIERS[fl.period_type || "day"] || 1;
      const rentalCost = price * dur * multiplier * qty;
      const taxRate = parseFloat(tool.tax_rate);
      const taxAmt = rentalCost * taxRate / 100;
      return { ...fl, tax_rate: taxRate, tax_amount: taxAmt.toFixed(3), price_before_tax: rentalCost.toFixed(3) };
    });
  }, [rawLines, tools]);

  const [timesheet, setTimesheet] = useState(existingOrder?.timesheet || []);
  const [errors, setErrors] = useState({});
  const [activeTab, setActiveTab] = useState("lines");
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [tcAccepted, setTcAccepted] = useState(false);
  const isAfterCheckout = ["checked_out", "checked_in", "done", "invoiced"].includes(existingOrder?.state);
  const [checkoutIdProof, setCheckoutIdProof] = useState(false);
  const [idProofFrontUri, setIdProofFrontUri] = useState(null);
  const [idProofBackUri, setIdProofBackUri] = useState(null);
  const [toolPhotoUris, setToolPhotoUris] = useState({});
  const [toolPhotoTimestamps, setToolPhotoTimestamps] = useState({});
  const [toolCheckinPhotoUris, setToolCheckinPhotoUris] = useState({});
  const [toolCheckinPhotoTimestamps, setToolCheckinPhotoTimestamps] = useState({});
  const [idProofTimestamp, setIdProofTimestamp] = useState(null);
  const [checkoutSignature, setCheckoutSignature] = useState(false);
  const [checkoutSignatureUri, setCheckoutSignatureUri] = useState(null);
  const [checkinSignatureUri, setCheckinSignatureUri] = useState(null);
  const [checkinAuthoritySignatureUri, setCheckinAuthoritySignatureUri] = useState(null);
  const isAfterCheckin = ["checked_in", "done", "invoiced"].includes(existingOrder?.state);
  const [checkinReturnAdvance, setCheckinReturnAdvance] = useState(existingOrder?.advance_returned || false);
  const [checkinExcludedIdx, setCheckinExcludedIdx] = useState([]);
  const [checkinAlreadyReturnedIdx, setCheckinAlreadyReturnedIdx] = useState([]);
  const [checkinSignature, setCheckinSignature] = useState(false);
  const [checkinAuthoritySignature, setCheckinAuthoritySignature] = useState(false);
  const [checkinAuthoritySignatureTime, setCheckinAuthoritySignatureTime] = useState(existingOrder?.checkin_authority_signature_time || null);
  const [discountAuthPhotoTime, setDiscountAuthPhotoTime] = useState(existingOrder?.discount_auth_photo_time || null);
  const [checkinSignerName, setCheckinSignerName] = useState(existingOrder?.checkin_signer_name || "");
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [activeSignatureTarget, setActiveSignatureTarget] = useState(null);
  const signatureRef = useRef(null);
  const [signStrokeColor, setSignStrokeColor] = useState("#000");
  const [signStrokeWidth, setSignStrokeWidth] = useState(3);
  const [signModeEraser, setSignModeEraser] = useState(false);
  const [checkoutSignatureTime, setCheckoutSignatureTime] = useState(existingOrder?.checkout_signature_time || null);
  const [checkinSignatureTime, setCheckinSignatureTime] = useState(existingOrder?.checkin_signature_time || null);
  const [discountAuthSignatureTime, setDiscountAuthSignatureTime] = useState(existingOrder?.discount_auth_signature_time || null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraCallback, setCameraCallback] = useState(null);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountPage, setDiscountPage] = useState(1);
  const [discountAuthName, setDiscountAuthName] = useState(existingOrder?.discount_authorized_by || "");
  const [discountAuthSignatureUri, setDiscountAuthSignatureUri] = useState(null);
  const [discountAuthPhotoUri, setDiscountAuthPhotoUri] = useState(null);
  const [discountLines, setDiscountLines] = useState([]);
  const [discountMode, setDiscountMode] = useState("separate"); // "total" | "separate"
  const [totalDiscountType, setTotalDiscountType] = useState("percentage");
  const [totalDiscountValue, setTotalDiscountValue] = useState("");
  const discountSignatureRef = useRef(null);
  const [previewImageUri, setPreviewImageUri] = useState(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [activeToolLineIdx, setActiveToolLineIdx] = useState(-1);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceType, setInvoiceType] = useState("checkout"); // "checkout" | "checkin"
  const [invoicePaperSize, setInvoicePaperSize] = useState("a4");
  const [invoiceDownloading, setInvoiceDownloading] = useState(false);
  const [invoicePrinting, setInvoicePrinting] = useState(false);
  const [invoiceSendingWA, setInvoiceSendingWA] = useState(false);
  const [phoneError, setPhoneError] = useState(null);
  const [emailError, setEmailError] = useState(null);
  const [countryCode, setCountryCode] = useState("+968");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [companyInfo, setCompanyInfo] = useState({ name: "Tool Management", phone: "", email: "", street: "", street2: "", city: "", zip: "", state: "", country: "" });

  // Debounce refs for auto-saving phone and email
  const phoneDebounceRef = useRef(null);
  const emailDebounceRef = useRef(null);

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
    { code: "+36", name: "Hungary" }, { code: "+354", name: "Iceland" }, { code: "+91", name: "India" },
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

  const filteredCountryCodes = useMemo(() => countrySearch.trim()
    ? COUNTRY_CODES.filter((c) =>
        c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
        c.code.includes(countrySearch)
      )
    : COUNTRY_CODES, [countrySearch]);

  // Split a full phone like "+9689074837168" into { code: "+968", local: "9074837168" }
  const splitPhoneCountryCode = (fullPhone) => {
    if (!fullPhone) return { code: "+968", local: "" };
    let phone = fullPhone.replace(/[\s\-()]/g, "");
    if (!phone.startsWith("+")) return { code: "+968", local: phone };
    // Try matching longest country codes first (4 digits, then 3, 2, 1)
    for (let len = 4; len >= 1; len--) {
      const prefix = phone.substring(0, len + 1); // +1 for the "+"
      const match = COUNTRY_CODES.find((c) => c.code === prefix);
      if (match) return { code: match.code, local: phone.substring(len + 1) };
    }
    return { code: "+968", local: phone.replace("+", "") };
  };

  // On mount, split existing phone into country code + local number
  useEffect(() => {
    const phone = existingOrder?.partner_phone || "";
    if (phone) {
      const { code, local } = splitPhoneCountryCode(phone);
      setCountryCode(code);
      setForm((prev) => ({ ...prev, partner_phone: local }));
    }
    // Fetch company details from Odoo
    if (odooAuth) {
      fetchCompanyDetails(odooAuth).then((info) => setCompanyInfo(info)).catch(() => {});
      storeFetchCustomers(odooAuth, true);
    }
  }, []);

  const PERIOD_DURATION_MAP = { day: "1", week: "1", month: "1" };

  const PERIOD_LABELS = { day: "Day", week: "Week", month: "Month" };
  const getPeriodLabel = (periodType, count) => {
    const label = PERIOD_LABELS[periodType] || "Day";
    const n = parseFloat(count) || 1;
    return n === 1 ? label : label + "s";
  };

  const handleChange = (field, value) => {
    if (field === "rental_period_type") {
      const newDuration = PERIOD_DURATION_MAP[value] || "1";
      setForm((prev) => ({ ...prev, rental_period_type: value, rental_duration: newDuration }));
      setLines((prev) => prev.map((l) => ({ ...l, period_type: value, planned_duration: newDuration })));
      setErrors((prev) => ({ ...prev, rental_period_type: null }));
      return;
    }

    // Special handling for phone number - limit digits based on country code
    if (field === "partner_phone") {
      const digitsOnly = value.replace(/\D/g, "");
      const maxDigits = getPhoneLength(countryCode);
      if (digitsOnly.length > maxDigits) {
        return;
      }
    }

    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: null }));
    if (field === "partner_phone") setPhoneError(null);
    if (field === "partner_email") setEmailError(null);
  };

  // ---------- CUSTOMER AUTOCOMPLETE ----------
  const filteredCustomers =
    showCustomerDropdown && form.partner_name.trim().length > 0
      ? customers.filter((c) =>
        c.name.toLowerCase().includes(form.partner_name.toLowerCase())
      ).slice(0, 10)
      : [];

  const selectCustomer = (customer) => {
    const { code, local } = splitPhoneCountryCode(customer.phone || "");
    setCountryCode(code);
    setForm((prev) => ({
      ...prev,
      partner_name: customer.name,
      partner_phone: local,
      partner_email: customer.email || "",
      partner_id: customer.odoo_id || parseInt(customer.id) || null,
    }));
    setIsNewCustomer(false);
    setShowCustomerDropdown(false);
  };

  const clearCustomer = () => {
    setForm((prev) => ({
      ...prev,
      partner_name: "",
      partner_phone: "",
      partner_email: "",
      partner_id: null,
    }));
    setLines([]);
    setIsNewCustomer(false);
    setShowCustomerDropdown(false);
  };

  const LINE_DAY_MULTIPLIERS = { day: 1, week: 7, month: 30 };

  // ---------- TOOL AUTOCOMPLETE ----------
  const getFilteredTools = (searchText) => {
    if (!searchText || searchText.trim().length === 0) return [];
    // Collect tool IDs already selected in other lines of this order
    const usedToolIds = lines
      .map((l) => l.tool_id)
      .filter(Boolean);
    return tools
      .filter((t) => {
        // Only show tools with available_qty > 0 (matches Odoo's action_confirm check)
        const availQty = parseFloat(t.available_qty) || 0;
        if (availQty <= 0) return false;
        // Also filter by state (not rented, maintenance, retired)
        if (t.state && t.state !== "available") return false;
        // Exclude tools already added to other lines in this order
        const tId = t.odoo_id || parseInt(t.id);
        if (tId && usedToolIds.includes(tId)) return false;
        // Match search text against name, serial number, or code
        const search = searchText.toLowerCase();
        return (
          t.name.toLowerCase().includes(search) ||
          (t.serial_number && t.serial_number.toLowerCase().includes(search)) ||
          (t.code && t.code.toLowerCase().includes(search))
        );
      })
  };

  const selectTool = (index, tool) => {
    const toolOdooId = tool.odoo_id || parseInt(tool.id) || null;
    // Get late fee from tool, fall back to pricing rules
    let lateFee = parseFloat(tool.late_fee_per_day) || 0;
    if (lateFee === 0 && pricingRules && pricingRules.length > 0) {
      const rule = pricingRules.find(
        (pr) => pr.tool_id === toolOdooId || pr.tool_name === tool.name
      );
      if (rule) lateFee = parseFloat(rule.late_fee_per_day) || 0;
    }
    const taxRate = parseFloat(tool.tax_rate) || 0;
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        tool_name: tool.name,
        tool_id: toolOdooId,
        serial_number: tool.serial_number || "",
        unit_price: tool.rental_price_per_day || "0",
        late_fee_per_day: String(lateFee),
        tax_rate: taxRate,
      };
      const price = parseFloat(updated[index].unit_price) || 0;
      const dur = parseFloat(updated[index].planned_duration) || 1;
      const qty = parseFloat(updated[index].quantity) || 1;
      const multiplier = LINE_DAY_MULTIPLIERS[updated[index].period_type || form.rental_period_type || "day"] || 1;
      const rentalCost = price * dur * multiplier * qty;
      updated[index].line_total = rentalCost.toFixed(3);
      // Compute tax (exclusive: added on top of rental cost)
      if (taxRate > 0) {
        const taxAmt = rentalCost * taxRate / 100;
        updated[index].tax_amount = taxAmt.toFixed(3);
        updated[index].price_before_tax = rentalCost.toFixed(3);
        updated[index].tax_ids = [{ name: taxRate + '%' }];
      } else {
        updated[index].tax_amount = "0";
        updated[index].price_before_tax = rentalCost.toFixed(3);
        updated[index].tax_ids = [];
      }
      return updated;
    });
    setActiveToolLineIdx(-1);
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        tool_name: "",
        serial_number: "",
        pricing_rule: "",
        unit_price: "",
        quantity: "1",
        period_type: form.rental_period_type || "day",
        planned_duration: form.rental_duration,
        actual_duration: "",
        extra_days: "0",
        returned_qty: "0",
        checkout_condition: "",
        checkin_condition: "",
        checkout_tool_image: false,
        damage_note: "",
        damage_charge: "0",
        late_fee_per_day: "0",
        late_fee_amount: "0",
        tax_rate: 0,
        tax_amount: "0",
        price_before_tax: "0",
        tax_ids: [],
        discount_type: "",
        discount_value: "0",
        notes: "",
      },
    ]);
  };

  const updateLine = (index, field, value) => {
    const recomputeTax = (line) => {
      const price = parseFloat(line.unit_price) || 0;
      const dur = parseFloat(line.planned_duration) || 1;
      const qty = parseFloat(line.quantity) || 1;
      const multiplier = LINE_DAY_MULTIPLIERS[line.period_type || "day"] || 1;
      const rentalCost = price * dur * multiplier * qty;
      line.line_total = rentalCost.toFixed(3);
      const taxRate = parseFloat(line.tax_rate) || 0;
      if (taxRate > 0) {
        const taxAmt = rentalCost * taxRate / 100;
        line.tax_amount = taxAmt.toFixed(3);
        line.price_before_tax = rentalCost.toFixed(3);
      } else {
        line.tax_amount = "0";
        line.price_before_tax = rentalCost.toFixed(3);
      }
      return line;
    };

    // When per-line period_type changes, only update the specific line
    if (field === "period_type") {
      setLines((prev) => prev.map((l, i) => {
        if (i !== index) return l;
        return recomputeTax({ ...l, period_type: value });
      }));
      return;
    }
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (["unit_price", "planned_duration", "quantity"].includes(field)) {
        updated[index] = recomputeTax(updated[index]);
      }
      return updated;
    });
  };

  const removeLine = (index) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const addTimesheetEntry = (action, notes) => {
    setTimesheet((prev) => [
      ...prev,
      { id: Date.now().toString(), date: todayISO(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), action, notes, user: "Admin" },
    ]);
  };

  // ---------- CALCULATIONS ----------
  const calcLineTotal = (l) => {
    const price = parseFloat(l.unit_price) || 0;
    const dur = parseFloat(l.planned_duration) || 1;
    const qty = parseFloat(l.quantity) || 1;
    const multiplier = LINE_DAY_MULTIPLIERS[l.period_type || "day"] || 1;
    return price * dur * multiplier * qty;
  };

  const calcSubtotal = () => lines.reduce((sum, l) => sum + (parseFloat(l.price_before_tax) || calcLineTotal(l)), 0);
  const calcTaxTotal = () => lines.reduce((sum, l) => sum + (parseFloat(l.tax_amount) || 0), 0);
  const calcSubtotalWithTax = () => lines.reduce((sum, l) => sum + calcLineTotal(l), 0);
  const calcLateFees = () => lines.reduce((sum, l) => {
    const amt = parseFloat(l.late_fee_amount) || 0;
    return sum + amt;
  }, 0);
  const calcDamageCharges = () => lines.reduce((sum, l) => sum + (parseFloat(l.damage_charge) || 0), 0);

  // Grand Total = Subtotal (before tax) + Tax + LateFees + Damage - Discount
  const calcGrandTotal = () => {
    return calcSubtotal() + calcTaxTotal() + calcLateFees() + calcDamageCharges() - (parseFloat(form.discount_amount) || 0);
  };

  // Amount Due = GrandTotal - Advance (if not returned)
  const calcTotal = () => {
    const grand = calcGrandTotal();
    const advance = form.advance_returned ? 0 : (parseFloat(form.advance_amount) || 0);
    return grand - advance;
  };

  // Cash balance helpers (only relevant when payment_method is "cash")
  const calcCashBalance = () => (parseFloat(form.cash_received) || 0) - (parseFloat(form.advance_amount) || 0);
  const calcCheckinAmountDue = () => calcGrandTotal() - (checkinReturnAdvance ? 0 : (parseFloat(form.advance_amount) || 0));
  const calcCheckinCashBalance = () => (parseFloat(form.checkin_cash_received) || 0) - calcCheckinAmountDue();

  // ---------- WORKFLOW ACTIONS ----------
  const validateOrder = () => {
    const newErrors = {};
    if (!form.partner_name.trim()) newErrors.partner_name = "Customer is required";
    if (lines.length === 0) newErrors.lines = "Add at least one rental line";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Ensure partner_id exists — create new customer in Odoo if typed manually
  const ensurePartnerId = async () => {
    if (form.partner_id) return form.partner_id;
    if (!odooAuth || !form.partner_name.trim()) return null;
    try {
      const newId = await addCustomer(odooAuth, {
        name: form.partner_name.trim(),
        phone: form.partner_phone ? countryCode + form.partner_phone : "",
        email: form.partner_email || "",
      });
      setIsNewCustomer(true);
      setForm((prev) => ({ ...prev, partner_id: newId }));
      setShowCustomerDropdown(false);
      showToastMessage("New customer created: " + form.partner_name);
      return newId;
    } catch (e) {
      showToastMessage("Failed to create customer: " + e.message);
      return null;
    }
  };

  const actionConfirm = async () => {
    if (!validateOrder()) return;

    // Optimistic UI update: mark confirmed immediately so screen responds fast
    savedRef.current = true;
    setState("confirmed");
    showToastMessage("Confirming order...");

    // Run network work in background; do not block UI
    (async () => {
      try {
        if (odooOrderId && odooAuth) {
          // Update order header with latest period type and duration
          await updateOrderValues(odooAuth, odooOrderId, {
            rental_period_type: form.rental_period_type,
            rental_duration: parseFloat(form.rental_duration) || 1,
          });
          // Update each line's period_type and planned_duration
          await Promise.all(lines.map((l) => {
            if (!l.odoo_id) return null;
            return updateOrderLineValues(odooAuth, l.odoo_id, {
              period_type: l.period_type || form.rental_period_type,
              planned_duration: parseFloat(l.planned_duration) || parseFloat(form.rental_duration) || 1,
              unit_price: parseFloat(l.unit_price) || 0,
            });
          }).filter(Boolean));
          await storeConfirmOrder(odooAuth, odooOrderId);
          showToastMessage("Order confirmed");
          return;
        }

        if (odooAuth) {
          const partnerId = await ensurePartnerId();
          if (!partnerId) {
            showToastMessage("Customer is required. Please select or enter a customer.");
            return;
          }
          const orderValues = {
            partner_id: partnerId,
            date_planned_checkout: form.date_planned_checkout || false,
            date_planned_checkin: form.date_planned_checkin || false,
            rental_period_type: form.rental_period_type,
            rental_duration: parseFloat(form.rental_duration) || 1,
            advance_amount: parseFloat(form.advance_amount) || 0,
            payment_method: form.payment_method || false,
            cash_received: form.payment_method === 'cash' ? (parseFloat(form.cash_received) || 0) : 0,
            notes: form.notes || "",
            terms: form.terms || "",
          };
          const lineValues = lines.map((l) => ({
            tool_id: l.tool_id || null,
            unit_price: parseFloat(l.unit_price) || 0,
            quantity: parseFloat(l.quantity) || 1,
            planned_duration: parseFloat(l.planned_duration) || 1,
            period_type: l.period_type || form.rental_period_type,
          }));
          const newId = await addOrder(odooAuth, orderValues, lineValues);
          setOdooOrderId(newId);
          await storeConfirmOrder(odooAuth, newId);
          // Refresh order data to get line odoo_ids (needed for checkout photo saving)
          try {
            const fresh = await fetchOrderDataById(odooAuth, newId);
            if (fresh) {
              // Merge fresh lines with local tax data (Odoo may not have computed yet)
              const mergedLines = (fresh.lines || []).map((fl) => {
                const localLine = lines.find((ll) => ll.tool_id === fl.tool_id);
                if (localLine && !(parseFloat(fl.tax_amount) > 0) && parseFloat(localLine.tax_amount) > 0) {
                  return { ...fl, tax_amount: localLine.tax_amount, price_before_tax: localLine.price_before_tax, tax_rate: localLine.tax_rate, tax_ids: localLine.tax_ids };
                }
                return fl;
              });
              setLines(mergedLines);
              setForm((prev) => ({ ...prev, name: fresh.name || prev.name }));
            }
          } catch (e) {
            console.warn("Failed to refresh after confirm:", e.message);
          }
          showToastMessage("Order confirmed");
          return;
        }

        // Offline fallback
        const orderName = "RNT/" + new Date().getFullYear().toString().slice(2) + "/" + String(Math.floor(Math.random() * 99999)).padStart(5, "0");
        const custId = "CUS/" + String(Math.floor(Math.random() * 9999)).padStart(4, "0");
        setForm((prev) => ({ ...prev, name: orderName, customer_id: custId }));
        addTimesheetEntry("note", "Rental Order created");
        addTimesheetEntry("note", "Draft \u2192 Confirmed (Status)");
        showToastMessage("Order confirmed (offline)");
      } catch (e) {
        showToastMessage("Confirm failed: " + e.message);
        console.warn("actionConfirm background error:", e.message);
      }
    })();
  };

  const openCheckoutWizard = async () => {
    setTcAccepted(false);
    setShowCheckoutModal(true);

    // Auto-fetch ID proof from customer profile if not already loaded
    if (form.partner_id && !idProofFrontUri && odooAuth) {
      try {
        const partnerImgs = await fetchCustomerImages(odooAuth, form.partner_id);
        if (partnerImgs.id_proof_front) {
          setIdProofFrontUri(base64ToDataUri(partnerImgs.id_proof_front));
          setCheckoutIdProof(true);
        }
        if (partnerImgs.id_proof_back) {
          setIdProofBackUri(base64ToDataUri(partnerImgs.id_proof_back));
        }
      } catch (e) {
        // Ignore — customer may not have ID proof saved yet
      }
    }
  };

  const confirmCheckout = async () => {
    const missing = lines.find((l) => !l.checkout_condition);
    if (missing) {
      Alert.alert("Required", "Set condition for all tools before check-out");
      return;
    }
    if (!idProofFrontUri) {
      Alert.alert("Required", "ID Proof (Front Side) is mandatory for check-out");
      return;
    }
    if (!checkoutSignatureUri) {
      Alert.alert("Required", "Please provide customer signature for check-out");
      return;
    }
    if (parseFloat(form.advance_amount || 0) > 0 && !form.payment_method) {
      Alert.alert("Required", "Please select a payment method for the advance amount");
      return;
    }
    // Optimistic: close modal and update UI immediately
    setShowCheckoutModal(false);
    savedRef.current = true;
    setState("checked_out");
    const now = new Date();
    setForm((prev) => ({
      ...prev,
      date_checkout: now.toLocaleString(),
      date_checkout_raw: now.toISOString(),
      actual_duration: form.rental_duration + " " + getPeriodLabel(form.rental_period_type, form.rental_duration)
    }));
    addTimesheetEntry("checkout", "None \u2192 " + today() + " (Actual Check-Out)");
    addTimesheetEntry("note", "Confirmed \u2192 Checked Out (Status)");
    showToastMessage("Checking out... ");

    // Do the network work in background
    (async () => {
      try {
        if (odooOrderId && odooAuth) {
          // 1. Run checkout action FIRST (changes state to checked_out)
          await storeCheckoutOrder(odooAuth, odooOrderId);

          // 2. Convert all images to base64 in parallel
          const [sigB64, idFrontB64, idBackB64, ...lineB64s] = await Promise.all([
            uriToBase64(checkoutSignatureUri),
            uriToBase64(idProofFrontUri),
            uriToBase64(idProofBackUri),
            ...lines.map((_, i) => uriToBase64(toolPhotoUris[i])),
          ]);

          // 3. Save order-level values
          const orderVals = {};
          const advanceAmt = parseFloat(form.advance_amount) || 0;
          if (advanceAmt > 0) {
            orderVals.advance_amount = advanceAmt;
            if (form.payment_method) orderVals.payment_method = form.payment_method;
            if (form.payment_method === 'cash' && form.cash_received) {
              orderVals.cash_received = parseFloat(form.cash_received) || 0;
            }
          }
          if (sigB64) orderVals.customer_signature = sigB64;
          if (idFrontB64) orderVals.id_proof_front = idFrontB64;
          if (idBackB64) orderVals.id_proof_back = idBackB64;
          if (Object.keys(orderVals).length > 0) {
            await updateOrderValues(odooAuth, odooOrderId, orderVals);
          }

          // Save ID proof to customer profile for future checkouts
          if (form.partner_id && (idFrontB64 || idBackB64)) {
            const partnerVals = {};
            if (idFrontB64) partnerVals.id_proof_front = idFrontB64;
            if (idBackB64) partnerVals.id_proof_back = idBackB64;
            updateCustomer(odooAuth, form.partner_id, partnerVals).catch(() => {});
          }

          // 4. Save line-level photos & conditions in parallel
          await Promise.all(lines.map((line, i) => {
            const lineOdooId = line.odoo_id;
            if (!lineOdooId) return null;
            const updateVals = { checkout_condition: line.checkout_condition };
            if (lineB64s[i]) updateVals.checkout_tool_image = lineB64s[i];
            return updateOrderLineValues(odooAuth, lineOdooId, updateVals);
          }).filter(Boolean));

        }
        showToastMessage("Check-out completed");
      } catch (e) {
        showToastMessage("Checkout failed: " + e.message);
        console.warn("confirmCheckout background error:", e.message);
      }
    })();
  };

  const openCheckinWizard = () => {
    // Match Odoo formula: actual = max((checkin - checkout).days, 1)
    // extra = max(actual - planned, 0)
    const checkinDate = new Date();
    checkinDate.setHours(0, 0, 0, 0);

    let checkoutDate = null;
    const rawDate = form.date_checkout_raw || form.date_checkout;
    if (rawDate) {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        parsed.setHours(0, 0, 0, 0);
        checkoutDate = parsed;
      }
    }

    // Fallback if direct parse fails (regex for dd/mm/yyyy or mm/dd/yyyy)
    if (!checkoutDate && typeof rawDate === 'string' && rawDate.includes('/')) {
      const parts = rawDate.split(',')[0].split('/');
      if (parts.length === 3) {
        // Try day/month/year (Indian/UK style)
        const d = parseInt(parts[0]);
        const m = parseInt(parts[1]) - 1;
        const y = parseInt(parts[2]);
        const fallbackDate = new Date(y, m, d);
        if (!isNaN(fallbackDate.getTime())) {
          fallbackDate.setHours(0, 0, 0, 0);
          checkoutDate = fallbackDate;
        }
      }
    }

    // Calculate actual days between checkout and checkin. If same day, count as 1.
    const diffMs = checkoutDate ? (checkinDate.getTime() - checkoutDate.getTime()) : 0;
    const actualDays = checkoutDate
      ? Math.max(Math.round(diffMs / 86400000), 1)
      : (parseInt(form.rental_duration) || 1);

    // Update form status for the invoice header
    setForm((prev) => ({
      ...prev,
      actual_duration: String(actualDays) + " Day" + (actualDays > 1 ? "s" : "") + " (Actual)",
      date_checkin: new Date().toLocaleString(),
    }));

    // Auto-populate late_fee_per_day and extra_days PER LINE
    setLines((prev) => prev.map((line) => {
      // Skip recalculation for already-checked-in lines — preserve frozen values from Odoo
      const qty = parseFloat(line.quantity) || 1;
      const returned = parseFloat(line.returned_qty) || 0;
      if (returned >= qty) {
        return line;
      }
      // Per-line planned days using the line's own duration and period type
      const lineDuration = parseFloat(line.planned_duration) || 1;
      const lineMultiplier = LINE_DAY_MULTIPLIERS[line.period_type || form.rental_period_type || "day"] || 1;
      const linePlannedDays = Math.round(lineDuration * lineMultiplier);
      const lineExtraDays = linePlannedDays > 0 ? Math.max(actualDays - linePlannedDays, 0) : 0;

      // Robust fee lookup: line → pricing rule → tool
      const toolId = line.tool_id;
      let fee = parseFloat(line.late_fee_per_day) || 0;

      // Try pricing rules (by tool_id or tool_name)
      if (fee === 0 && pricingRules && pricingRules.length > 0) {
        const periodType = line.period_type || form.rental_period_type || "day";
        const rule = pricingRules.find(
          (r) => (Number(r.tool_id) === Number(toolId) || r.tool_name === line.tool_name) && r.period_type === periodType
        ) || pricingRules.find(
          (r) => (Number(r.tool_id) === Number(toolId) || r.tool_name === line.tool_name)
        );
        if (rule) fee = parseFloat(rule.late_fee_per_day) || 0;
      }

      // Try tool directly
      if (fee === 0 && tools && tools.length > 0) {
        const tool = tools.find((t) => {
          const tId = t.odoo_id || parseInt(t.id);
          return (tId && Number(tId) === Number(toolId)) || t.name === line.tool_name;
        });
        if (tool) fee = parseFloat(tool.late_fee_per_day) || 0;
      }

      const lateFeeAmt = (lineExtraDays * fee).toFixed(3);
      return {
        ...line,
        late_fee_per_day: String(fee),
        extra_days: String(lineExtraDays),
        actual_days: String(actualDays),
        late_fee_amount: lateFeeAmt,
      };
    }));
    // Pre-exclude already returned lines (matching Odoo: pending = qty - returned_qty, skip if <= 0)
    const alreadyReturned = [];
    lines.forEach((line, i) => {
      const qty = parseFloat(line.quantity) || 1;
      const returned = parseFloat(line.returned_qty) || 0;
      if (returned >= qty) alreadyReturned.push(i);
    });
    setCheckinAlreadyReturnedIdx(alreadyReturned);
    setCheckinExcludedIdx(alreadyReturned);
    setShowCheckinModal(true);
  };

  const removeFromCheckin = (idx) => {
    setCheckinExcludedIdx((prev) => [...prev, idx]);
  };

  const confirmCheckin = async () => {
    // Partial only if user manually removed lines (not counting already-returned)
    const userExcluded = checkinExcludedIdx.filter((i) => !checkinAlreadyReturnedIdx.includes(i));
    const isPartial = userExcluded.length > 0;
    const visibleLines = lines.filter((_, i) => !checkinExcludedIdx.includes(i));

    if (visibleLines.length === 0) {
      Alert.alert("Error", "At least one tool must be included for check-in");
      return;
    }

    const missing = visibleLines.find((l) => !l.checkin_condition);
    if (missing) {
      Alert.alert("Required", "Set condition for all returning tools before check-in");
      return;
    }
    const isPartialReturn = checkinExcludedIdx.filter((i) => !checkinAlreadyReturnedIdx.includes(i)).length > 0;
    if (!isPartialReturn && !form.checkin_payment_method) {
      Alert.alert("Required", "Please select a payment method for check-in");
      return;
    }
    if (!checkinSignatureUri) {
      Alert.alert("Required", "Customer signature is mandatory for check-in");
      return;
    }
    if (!checkinAuthoritySignatureUri) {
      Alert.alert("Required", "Authority signature is mandatory for check-in");
      return;
    }
    if (!checkinSignerName || !checkinSignerName.trim()) {
      Alert.alert("Required", "Signer name is mandatory for check-in");
      return;
    }

    setSaving(true);
    try {
      if (odooOrderId && odooAuth) {
        // Save checkin values (advance_returned, payment method, images/signatures) FIRST
        const checkinVals = {};
        if (!isPartial) checkinVals.advance_returned = checkinReturnAdvance;
        if (form.checkin_payment_method) checkinVals.checkin_payment_method = form.checkin_payment_method;
        if (form.checkin_payment_method === 'cash' && form.checkin_cash_received) {
          checkinVals.checkin_cash_received = parseFloat(form.checkin_cash_received) || 0;
        }
        // Convert all images to base64 in parallel
        const [custSigB64, authSigB64, ...checkinLineB64s] = await Promise.all([
          uriToBase64(checkinSignatureUri),
          uriToBase64(checkinAuthoritySignatureUri),
          ...lines.map((_, i) => uriToBase64(toolCheckinPhotoUris[i])),
        ]);
        if (custSigB64) checkinVals.checkin_customer_signature = custSigB64;
        if (authSigB64) checkinVals.checkin_signature = authSigB64;
        if (Object.keys(checkinVals).length > 0) {
          await updateOrderValues(odooAuth, odooOrderId, checkinVals);
        }
        // Save line photos, conditions, late fee, damage & returned_qty for VISIBLE lines only
        const totalDamageCharges = visibleLines.reduce((sum, l) => sum + (parseFloat(l.damage_charge) || 0), 0);
        // Update order-level damage_charges
        if (totalDamageCharges > 0) {
          await updateOrderValues(odooAuth, odooOrderId, { damage_charges: totalDamageCharges });
        }
        await Promise.all(lines.map((line, i) => {
          if (checkinExcludedIdx.includes(i)) return null;
          const lineOdooId = line.odoo_id;
          if (!lineOdooId) return null;
          const updateVals = { checkin_condition: line.checkin_condition };
          const lateFeeAmt = parseFloat(line.late_fee_amount) || 0;
          if (lateFeeAmt > 0) updateVals.late_fee_amount = lateFeeAmt;
          const dmgCharge = parseFloat(line.damage_charge) || 0;
          if (dmgCharge > 0) updateVals.damage_charge = dmgCharge;
          const extraDays = parseInt(line.extra_days) || 0;
          if (extraDays > 0) updateVals.extra_days = extraDays;
          if (line.damage_note) updateVals.damage_note = line.damage_note;
          if (checkinLineB64s[i]) updateVals.checkin_tool_image = checkinLineB64s[i];
          // For partial: mark this line as returned
          if (isPartial) updateVals.returned_qty = 1;
          return updateOrderLineValues(odooAuth, lineOdooId, updateVals);
        }).filter(Boolean));

        if (!isPartial) {
          // Full check-in: all tools returned
          await storeCheckinOrder(odooAuth, odooOrderId);
        } else {
          // Partial: set partial_return_date on Odoo order
          await updateOrderValues(odooAuth, odooOrderId, {
            partial_return_date: new Date().toISOString().replace('T', ' ').substring(0, 19),
          });
        }
        // Partial: order stays as checked_out on Odoo (no action_checkin call)
      }

      setShowCheckinModal(false);
      savedRef.current = true;

      if (isPartial) {
        // Partial return: mark returned lines, keep order checked_out
        const returnedNames = visibleLines.map((l) => l.tool_name).join(", ");
        setLines((prev) => prev.map((l, i) =>
          checkinExcludedIdx.includes(i) ? l : { ...l, returned_qty: l.quantity }
        ));
        addTimesheetEntry("note", "Partial return: " + returnedNames);
        showToastMessage("Partial check-in saved. " + userExcluded.length + " tool(s) still pending.");
      } else {
        // Full check-in
        setState("checked_in");
        setForm((prev) => ({
          ...prev,
          date_checkin: new Date().toLocaleString(),
          advance_returned: checkinReturnAdvance,
        }));
        setLines((prev) => prev.map((l) => ({ ...l, returned_qty: l.quantity })));
        addTimesheetEntry("checkin", "Tools returned by " + form.partner_name);
        addTimesheetEntry("note", "Checked Out \u2192 Checked In (Status)");
        showToastMessage("Check-in completed");
      }
    } catch (e) {
      showToastMessage("Check-in failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const actionDone = async () => {
    setSaving(true);
    try {
      if (odooOrderId && odooAuth) {
        await storeMarkDone(odooAuth, odooOrderId);
      }
      setState("invoiced");
      savedRef.current = true;
      addTimesheetEntry("note", "Checked In \u2192 Invoiced (Status)");
      showToastMessage("Order marked as done");
    } catch (e) {
      showToastMessage("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const openInvoiceModal = (type) => {
    setInvoiceType(type);
    setInvoicePaperSize("a4");
    setShowInvoiceModal(true);
  };

  const buildInvoiceHtml = (type, assets = {}) => {
    const isCheckin = type === "checkin";
    const isPartialReturn = type === "partial_return";
    const subtotal = calcSubtotal();
    const taxTotal = calcTaxTotal();
    const lateFees = isCheckin ? calcLateFees() : 0;
    const damageCharges = isCheckin ? calcDamageCharges() : 0;
    const discount = isCheckin ? (parseFloat(form.discount_amount) || 0) : 0;
    const advance = parseFloat(form.advance_amount) || 0;
    const grandTotal = subtotal + taxTotal + lateFees + damageCharges - discount;
    const amountDue = isCheckin ? grandTotal - (form.advance_returned ? 0 : advance) : grandTotal;
    const cashReceived = parseFloat(form.cash_received) || 0;
    const checkinCashReceived = parseFloat(form.checkin_cash_received) || 0;
    const cashBalance = cashReceived - advance;
    const checkinCashBalance = checkinCashReceived - amountDue;
    const totalAmt = grandTotal; // For compatibility with existing total row display
    const cur = "ر.ع.";

    // --- Checkout tool rows ---
    const checkoutToolRows = lines.map((l, i) => {
      const rentalCost = calcLineTotal(l);
      // include discount info if any
      let discountInfo = "";
      if (l.discount_type && (l.discount_value || l.discount_value === "0")) {
        const val = parseFloat(l.discount_value) || 0;
        if (l.discount_type === "percentage") {
          discountInfo = `${val}%`;
        } else {
          discountInfo = `${cur}${val.toFixed(3)}`;
        }
      }
      const lineTaxAmt = parseFloat(l.tax_amount) || 0;
      const lineTaxRate = parseFloat(l.tax_rate) > 0 ? l.tax_rate + '%' : (lineTaxAmt > 0 ? ((lineTaxAmt / ((parseFloat(l.price_before_tax) || rentalCost) || 1)) * 100).toFixed(1) + '%' : '');
      return `<tr>
        <td>${i + 1}</td>
        <td>${l.tool_name || "-"}</td>
        <td>${l.serial_number || ""}</td>
        <td>${l.checkout_condition || ""}</td>
        <td class="text-end">${cur}${(parseFloat(l.unit_price) || 0).toFixed(3)}</td>
        <td class="text-end">${parseInt(l.planned_duration) || 1} ${((d, pt) => d === 1 ? ({"day":"Day","week":"Week","month":"Month"})[pt] || "Day" : ({"day":"Days","week":"Weeks","month":"Months"})[pt] || "Days")(parseInt(l.planned_duration) || 1, l.period_type || form.rental_period_type || "day")}</td>
        <td class="text-end">${cur}${rentalCost.toFixed(3)}</td>
        <td class="text-end">${lineTaxRate}</td>
        <td class="text-end">${lineTaxAmt > 0 ? cur + lineTaxAmt.toFixed(3) : ''}</td>
      </tr>`;
    }).join("");

    // Partial return: filter to only returned lines
    const partialReturnToolRows = lines
      .filter(l => parseFloat(l.returned_qty) > 0)
      .map((l, i) => {
        const rentalCost = calcLineTotal(l);
        const lineTaxAmt = parseFloat(l.tax_amount) || 0;
        const lineTaxRate = parseFloat(l.tax_rate) > 0 ? l.tax_rate + '%' : (lineTaxAmt > 0 ? ((lineTaxAmt / ((parseFloat(l.price_before_tax) || rentalCost) || 1)) * 100).toFixed(1) + '%' : '');
        return `<tr>
          <td>${i + 1}</td>
          <td>${l.tool_name || "-"}</td>
          <td>${l.serial_number || ""}</td>
          <td>${l.checkout_condition || ""}</td>
          <td class="text-end">${cur}${(parseFloat(l.unit_price) || 0).toFixed(3)}</td>
          <td class="text-end">${parseInt(l.planned_duration) || 1} ${((d, pt) => d === 1 ? ({"day":"Day","week":"Week","month":"Month"})[pt] || "Day" : ({"day":"Days","week":"Weeks","month":"Months"})[pt] || "Days")(parseInt(l.planned_duration) || 1, l.period_type || form.rental_period_type || "day")}</td>
          <td class="text-end">${cur}${rentalCost.toFixed(3)}</td>
          <td class="text-end">${lineTaxRate}</td>
          <td class="text-end">${lineTaxAmt > 0 ? cur + lineTaxAmt.toFixed(3) : ''}</td>
        </tr>`;
      }).join("");

    // --- Checkin tool rows (more columns) ---
    const checkinToolRows = lines.map((l, i) => {
      const lateFee = parseFloat(l.late_fee_amount) || 0;
      const dmg = parseFloat(l.damage_charge) || 0;
      const latePerDay = parseFloat(l.late_fee_per_day) || 0;
      const discVal = parseFloat(l.discount_value) || 0;
      const discType = l.discount_type || "";
      let discAmt = 0;
      if (discType === "percentage") discAmt = (calcLineTotal(l) + lateFee + dmg) * discVal / 100;
      else if (discType === "fixed") discAmt = discVal;
      // render discount info: if percentage show value%, otherwise show amount
      const discDisplay = discType === "percentage"
        ? `${discVal}% (${cur}${discAmt.toFixed(3)})`
        : `${cur}${discAmt.toFixed(3)}`;
      return `<tr>
        <td>${i + 1}</td>
        <td>${l.tool_name || "-"}</td>
        <td>${l.serial_number || ""}</td>
        <td>${l.checkout_condition || ""}</td>
        <td>${l.checkin_condition || ""}</td>
        <td class="text-end">${cur}${(parseFloat(l.unit_price) || 0).toFixed(3)}</td>
        <td class="text-end">${parseInt(l.planned_duration) || 1} ${((d, pt) => d === 1 ? ({"day":"Day","week":"Week","month":"Month"})[pt] || "Day" : ({"day":"Days","week":"Weeks","month":"Months"})[pt] || "Days")(parseInt(l.planned_duration) || 1, l.period_type || form.rental_period_type || "day")}</td>
        <td class="text-end" ${parseInt(l.extra_days) > 0 ? 'style="color:red;font-weight:bold"' : ""}>${l.extra_days || "0"}</td>
        <td class="text-end" ${lateFee > 0 ? 'style="color:red;font-weight:bold"' : ""}>${cur}${lateFee.toFixed(3)}</td>
        <td>${l.damage_note || ""}</td>
        <td class="text-end" ${dmg > 0 ? 'style="color:red;font-weight:bold"' : ""}>${cur}${dmg.toFixed(3)}</td>
        <td class="text-end" ${discAmt > 0 ? 'style="color:green;font-weight:bold"' : ""}>${discDisplay}</td>
        <td class="text-end">${parseFloat(l.tax_rate) > 0 ? l.tax_rate + '%' : (parseFloat(l.tax_amount) > 0 ? ((parseFloat(l.tax_amount) / ((parseFloat(l.price_before_tax) || calcLineTotal(l)) || 1)) * 100).toFixed(1) + '%' : '')}</td>
        <td class="text-end">${parseFloat(l.tax_amount) > 0 ? cur + parseFloat(l.tax_amount).toFixed(3) : ''}</td>
      </tr>`;
    }).join("");

    const isA5 = invoicePaperSize === "a5";
    const sigW = isA5 ? 80 : 120;
    const sigH = isA5 ? 30 : 45;
    const sigFontSize = isA5 ? "8px" : "10px";

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      @page { size: ${isA5 ? "148mm 210mm" : "A4"} portrait; margin: ${isA5 ? "4mm" : "8mm"}; }
      body { font-family: Arial, Helvetica, sans-serif; padding: ${isA5 ? "4px" : "8px"}; color: #333; font-size: ${isA5 ? "7px" : "10px"}; line-height: ${isA5 ? "1.2" : "1.2"}; }
      .invoice-header { display: flex; align-items: center; margin-bottom: ${isA5 ? "3px" : "4px"}; border-bottom: 2px solid #2c3e50; padding-bottom: ${isA5 ? "3px" : "4px"}; }
      .invoice-header .header-left { flex: 1; text-align: left; }
      .invoice-header .header-center { flex: 2; text-align: center; }
      .invoice-header .header-right { flex: 1; text-align: right; direction: rtl; }
      h2.title { text-align: center; color: #2c3e50; margin: 0 0 ${isA5 ? "1px" : "2px"} 0; font-size: ${isA5 ? "10px" : "16px"}; }
      h4.sub { text-align: center; color: #888; margin: 0 0 ${isA5 ? "3px" : "8px"} 0; font-size: ${isA5 ? "7.5px" : "12px"}; }
      .row { display: flex; gap: ${isA5 ? "6px" : "10px"}; margin-bottom: ${isA5 ? "2px" : "4px"}; }
      .col { flex: 1; }
      .badge { text-align: center; margin-bottom: ${isA5 ? "3px" : "12px"}; }
      .badge span { background: #714B67; color: #fff; padding: ${isA5 ? "1px 8px" : "6px 18px"}; border-radius: 4px; font-size: ${isA5 ? "6.5px" : "13px"}; font-weight: 700; letter-spacing: 1px; }
      table.details { width: 100%; margin-bottom: ${isA5 ? "2px" : "4px"}; border-collapse: collapse; }
      table.details td { padding: ${isA5 ? "1px 3px" : "1px 6px"}; font-size: ${isA5 ? "6.5px" : "10px"}; }
      table.details td strong { color: #333; }
      h5 { margin: ${isA5 ? "3px 0 2px" : "8px 0 4px"}; color: #333; font-size: ${isA5 ? "8px" : "13px"}; }
      table.tools { width: 100%; border-collapse: collapse; margin-bottom: ${isA5 ? "2px" : "4px"}; font-size: ${isA5 ? "6.5px" : "9px"}; }
      table.tools th { background: #e9ecef; color: #333; padding: ${isA5 ? "1.5px 2px" : "4px 6px"}; text-align: left; font-size: ${isA5 ? "6px" : "10px"}; border: 1px solid #dee2e6; }
      table.tools td { padding: ${isA5 ? "1.5px 2px" : "3px 6px"}; border: 1px solid #dee2e6; }
      .text-end { text-align: right; }
      table.totals { width: ${isA5 ? "55%" : "50%"}; margin-left: auto; border-collapse: collapse; }
      table.totals td { padding: ${isA5 ? "1.5px 3px" : "1px 6px"}; font-size: ${isA5 ? "7px" : "10px"}; }
      .grand-row { border-top: 2px solid #000; }
      .grand-row td { font-size: ${isA5 ? "7.5px" : "14px"}; font-weight: 700; }
      .late-banner { background: #fff3cd; border: 1px solid #ffc107; padding: ${isA5 ? "2px 4px" : "8px 12px"}; margin-bottom: ${isA5 ? "3px" : "10px"}; border-radius: 4px; font-size: ${isA5 ? "6.5px" : "12px"}; }
      .late-banner strong { color: #856404; }
      .late-banner span { color: #856404; }
      .sig-row { display: flex; margin-top: ${isA5 ? "5px" : "8px"}; page-break-inside: avoid; page-break-before: avoid; }
      .terms-section { page-break-inside: auto; page-break-before: auto; }
      .sig-col { flex: 1; text-align: center; }
      .sig-col hr { border: none; border-top: 1px solid #333; width: 80%; margin: 0 auto ${isA5 ? "1px" : "4px"}; }
      .footer { margin-top: ${isA5 ? "3px" : "4px"}; font-size: ${isA5 ? "5.5px" : "8px"}; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: ${isA5 ? "1px" : "2px"}; page-break-inside: avoid; }
      .no-break { page-break-inside: avoid; }
    </style></head><body>

    <div class="invoice-header">
      <div class="header-left">
        <div style="font-size:${isA5 ? "10px" : "18px"};font-weight:900;color:#00AEEF;letter-spacing:1px;">SMART VISION</div>
        <div style="font-size:${isA5 ? "7px" : "12px"};font-weight:700;color:#333;">INTERNATIONAL L.L.C</div>
        <div style="font-size:${isA5 ? "5px" : "9px"};color:#333;margin-top:1px;">C.R No: 1199264 P.O:534, PC.:111, Sultanate of oman</div>
        <div style="font-size:${isA5 ? "5px" : "9px"};color:#333;">GSM: 97117880, 99047066</div>
        <div style="font-size:${isA5 ? "5px" : "9px"};color:#333;">Branch: AI Mawaleh  smartvisionllc1313@gmail.com</div>
        <div style="font-size:${isA5 ? "5px" : "9px"};color:#333;">VAT No: OM110025049X</div>
      </div>
      <div class="header-center">
        ${assets.logo ? `<div style="margin-bottom:${isA5 ? "3px" : "6px"};"><img src="${assets.logo}" style="width:${isA5 ? "80px" : "130px"};height:auto;" /></div>` : ""}
        <h2 class="title">${isCheckin ? "CHECK-IN INVOICE" : isPartialReturn ? "PARTIAL RETURN INVOICE" : "CHECKOUT INVOICE"}</h2>
        <h4 class="sub">${form.name || "New Order"}</h4>
        ${(form.customer_id || form.partner_id) ? `<div class="badge"><span>Customer ID: ${form.customer_id || form.partner_id}</span></div>` : ""}
      </div>
      <div class="header-right">
        <div style="font-size:${isA5 ? "10px" : "18px"};font-weight:900;color:#00AEEF;">الرؤية الذكية</div>
        <div style="font-size:${isA5 ? "7px" : "12px"};font-weight:700;color:#333;">الدولية ش.م.م</div>
        <div style="font-size:${isA5 ? "5px" : "9px"};color:#333;margin-top:1px;">س.ت: ١١٩٩٢٦٤ ص.ب:٥٣٤، ر.ب:١١١، سلطنة عمان</div>
        <div style="font-size:${isA5 ? "5px" : "9px"};color:#333;">هاتف: ٩٧١١٧٨٨٠، ٩٩٠٤٧٠٦٦</div>
        <div style="font-size:${isA5 ? "5px" : "9px"};color:#333;">فرع: الموالح  smartvisionllc1313@gmail.com</div>
      </div>
    </div>

    <div class="row">
      <div class="col">
        <strong>${companyInfo.name}</strong>${companyInfo.street ? "<br/>" + companyInfo.street : ""}${companyInfo.street2 ? ", " + companyInfo.street2 : ""}${companyInfo.city ? "<br/>" + companyInfo.city : ""}${companyInfo.state ? ", " + companyInfo.state : ""}${companyInfo.zip ? " " + companyInfo.zip : ""}${companyInfo.country ? "<br/>" + companyInfo.country : ""}${companyInfo.phone ? "<br/>Ph: " + companyInfo.phone : ""}${companyInfo.email ? "<br/>" + companyInfo.email : ""}
      </div>
      <div class="col" style="text-align:right;">
        <strong>Customer:</strong><br/>
        ${form.partner_name || "-"}${form.partner_phone ? "<br/>Ph: " + (form.partner_phone.startsWith("+") ? form.partner_phone : countryCode + form.partner_phone) : ""}${form.partner_email ? "<br/>" + form.partner_email : ""}
      </div>
    </div>


    <table class="details">
      <tr>
        <td><strong>Order Date:</strong></td>
        <td>${form.date_order || "-"}</td>
        <td><strong>Check-Out Date:</strong></td>
        <td>${form.date_checkout || form.date_planned_checkout || "-"}</td>
      </tr>
      ${isPartialReturn ? `<tr>
        <td><strong>Partial Return Date:</strong></td>
        <td>${new Date().toLocaleString()}</td>
        <td></td><td></td>
      </tr>` : ""}
      ${isCheckin ? `<tr>
        <td><strong>Check-In Date:</strong></td>
        <td>${form.date_checkin || "-"}</td>
        <td><strong>Advance:</strong></td>
        <td>${cur}${advance.toFixed(3)}</td>
      </tr>` : `<tr>
        <td></td>
        <td></td>
        <td><strong>Advance Collected:</strong></td>
        <td>${cur}${advance.toFixed(3)}</td>
      </tr>`}
      ${form.payment_method ? `<tr>
        <td><strong>${isCheckin ? "Checkout Payment:" : "Payment Method:"}</strong></td>
        <td>${form.payment_method.charAt(0).toUpperCase() + form.payment_method.slice(1)}</td>
        <td></td><td></td>
      </tr>` : ""}
      ${isCheckin && form.checkin_payment_method ? `<tr>
        <td><strong>Check-In Payment:</strong></td>
        <td>${form.checkin_payment_method.charAt(0).toUpperCase() + form.checkin_payment_method.slice(1)}</td>
        <td></td><td></td>
      </tr>` : ""}
      <tr>
        <td><strong>Responsible:</strong></td>
        <td>${form.responsible || "Admin"}</td>
        <td></td><td></td>
      </tr>
    </table>

    ${isCheckin && (existingOrder?.is_late || lateFees > 0) ? `<div class="late-banner"><strong>LATE RETURN</strong> <span>— Exceeded planned return date.</span></div>` : ""}

    <h5>Tools / Equipment</h5>
    ${!isCheckin ? `<table class="tools">
      <thead><tr>
        <th>#</th><th>Tool</th><th>Serial No.</th><th>Condition</th>
        <th class="text-end">Price</th><th class="text-end">Duration</th><th class="text-end">Total</th><th class="text-end">Tax %</th><th class="text-end">Tax Amt</th>
      </tr></thead>
      <tbody>${isPartialReturn ? partialReturnToolRows : checkoutToolRows}</tbody>
    </table>` : `<table class="tools">
      <thead><tr>
        <th>#</th><th>Tool</th><th>S/N</th><th>Out</th><th>In</th>
        <th class="text-end">Price</th><th class="text-end">Duration</th><th class="text-end">Extra Days</th>
        <th class="text-end">Late Fee</th><th>Damage</th><th class="text-end">Dmg ر.ع.</th><th class="text-end">Disc.</th><th class="text-end">Tax %</th><th class="text-end">Tax Amt</th>
      </tr></thead>
      <tbody>${checkinToolRows}</tbody>
    </table>`}

    <div style="display:flex;gap:${isA5 ? "4px" : "10px"};align-items:flex-start;">
      ${isCheckin && advance > 0 ? `<table class="details" style="width:50%;margin:0;">
        <tr><td><strong>Advance:</strong></td><td class="text-end">${cur}${advance.toFixed(3)}</td></tr>
        ${form.payment_method ? `<tr><td><strong>Checkout Payment:</strong></td><td class="text-end">${form.payment_method.charAt(0).toUpperCase() + form.payment_method.slice(1)}</td></tr>` : ""}
        ${form.payment_method === 'cash' && cashReceived > 0 ? `<tr><td><strong>Cash Received (Checkout):</strong></td><td class="text-end">${cur}${cashReceived.toFixed(3)}</td></tr><tr><td><strong>Balance Returned (Checkout):</strong></td><td class="text-end">${cur}${cashBalance.toFixed(3)}</td></tr>` : ""}
        ${form.checkin_payment_method ? `<tr><td><strong>Check-In Payment:</strong></td><td class="text-end">${form.checkin_payment_method.charAt(0).toUpperCase() + form.checkin_payment_method.slice(1)}</td></tr>` : ""}
        ${form.checkin_payment_method === 'cash' && checkinCashReceived > 0 ? `<tr><td><strong>Cash Received (Check-In):</strong></td><td class="text-end">${cur}${checkinCashReceived.toFixed(3)}</td></tr><tr><td><strong>Balance Returned (Check-In):</strong></td><td class="text-end">${cur}${checkinCashBalance.toFixed(3)}</td></tr>` : ""}
        <tr><td><strong>Returned:</strong></td><td class="text-end">${form.advance_returned ? "Yes" : "No"}</td></tr>
      </table>` : ""}
      ${!isCheckin && advance > 0 ? `<table class="details" style="width:50%;margin:0;">
        <tr><td>Advance Collected:</td><td class="text-end">${cur}${advance.toFixed(3)}</td></tr>
        ${form.payment_method ? `<tr><td>Payment Method:</td><td class="text-end">${form.payment_method.charAt(0).toUpperCase() + form.payment_method.slice(1)}</td></tr>` : ""}
        ${form.payment_method === 'cash' && cashReceived > 0 ? `<tr><td>Cash Received:</td><td class="text-end">${cur}${cashReceived.toFixed(3)}</td></tr><tr><td>Balance Returned:</td><td class="text-end">${cur}${cashBalance.toFixed(3)}</td></tr>` : ""}
      </table>` : ""}
      <table class="totals" style="width:50%;margin:0;">
        <tr><td><strong>Subtotal:</strong></td><td class="text-end">${cur}${subtotal.toFixed(3)}</td></tr>
        ${taxTotal > 0 ? `<tr><td>Tax:</td><td class="text-end">${cur}${taxTotal.toFixed(3)}</td></tr>` : ""}
        ${lateFees > 0 ? `<tr style="color:red;font-weight:bold"><td>Late Fees:</td><td class="text-end">${cur}${lateFees.toFixed(3)}</td></tr>` : ""}
        ${damageCharges > 0 ? `<tr style="color:red;font-weight:bold"><td>Damage:</td><td class="text-end">${cur}${damageCharges.toFixed(3)}</td></tr>` : ""}
        ${discount > 0 ? `<tr style="color:green;font-weight:bold"><td>Discount:</td><td class="text-end">-${cur}${discount.toFixed(3)}</td></tr>` : ""}
        <tr class="grand-row"><td><strong>TOTAL:</strong></td><td class="text-end"><strong>${cur}${grandTotal.toFixed(3)}</strong></td></tr>
        ${isCheckin && advance > 0 && !form.advance_returned ? `<tr><td>Advance (-):</td><td class="text-end">-${cur}${advance.toFixed(3)}</td></tr>` : ""}
        ${isCheckin ? `<tr class="grand-row" style="background-color:#f9f9f9"><td><strong>Amount Due:</strong></td><td class="text-end"><strong>${cur}${amountDue.toFixed(3)}</strong></td></tr>` : ""}
        ${isCheckin && form.checkin_payment_method === 'cash' && checkinCashReceived > 0 ? `<tr style="color:#28a745;font-weight:bold"><td>Cash Received:</td><td class="text-end">${cur}${checkinCashReceived.toFixed(3)}</td></tr><tr style="color:#28a745;font-weight:bold"><td>Balance to Return:</td><td class="text-end">${cur}${checkinCashBalance.toFixed(3)}</td></tr>` : ""}
        ${!isCheckin && form.payment_method === 'cash' && cashReceived > 0 ? `<tr style="color:#28a745;font-weight:bold"><td>Cash Received:</td><td class="text-end">${cur}${cashReceived.toFixed(3)}</td></tr><tr style="color:#28a745;font-weight:bold"><td>Balance to Return:</td><td class="text-end">${cur}${cashBalance.toFixed(3)}</td></tr>` : ""}
      </table>
    </div>

    ${!isCheckin || isPartialReturn ? `<div class="terms-section" style="margin-top:${isA5 ? "3px" : "6px"};border-top:1px solid #ccc;padding-top:${isA5 ? "2px" : "4px"};">
      <h5 style="margin:0 0 ${isA5 ? "1px" : "3px"} 0;font-size:${isA5 ? "6.5px" : "9px"};">Terms &amp; Conditions / الشروط والأحكام</h5>
      <table style="width:100%;border-collapse:collapse;font-size:${isA5 ? "5.5px" : "7px"};color:#444;">
        <tbody>
          ${DEFAULT_TERMS_EN.map((t, i) => `<tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:${isA5 ? "0.5px 1px" : "0.5px 3px"};vertical-align:top;font-weight:600;width:3%;">${i + 1}.</td>
            <td style="padding:${isA5 ? "0.5px 1px" : "0.5px 3px"};vertical-align:top;line-height:${isA5 ? "1.1" : "1.2"};width:50%;">${t}</td>
            <td style="padding:${isA5 ? "0.5px 1px" : "0.5px 3px"};vertical-align:top;text-align:right;direction:rtl;line-height:${isA5 ? "1.1" : "1.2"};width:47%;">${DEFAULT_TERMS_AR[i]}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : ""}

    <div class="sig-row" style="${!isCheckin ? 'justify-content:center;' : ''}">
      <div class="sig-col" style="${!isCheckin ? 'flex:none;min-width:200px;' : ''}">
        ${(() => {
        const sigImg = (isCheckin || isPartialReturn) ? assets.checkinSignature : assets.checkoutSignature;
        const sigName = form.partner_name || "";
        const sigTime = isCheckin
          ? (form.checkin_signature_time || form.date_checkin || new Date().toLocaleString())
          : (form.checkout_signature_time
            ? new Date(form.checkout_signature_time).toLocaleString()
            : form.date_checkout || form.date_order || new Date().toLocaleString());
        if (sigImg) {
          return `<img src="${sigImg}" style="width:${sigW}px;height:${sigH}px;object-fit:contain;margin-bottom:2px;"/><div><strong>Customer</strong></div><div>${sigName}</div><div style="font-size:${sigFontSize};color:#666">${sigTime}</div>`;
        }
        return `<hr/><div><strong>Customer Signature</strong></div><div>${sigName}</div><div style="font-size:${sigFontSize};color:#666">${sigTime}</div>`;
      })()}
      </div>
      ${isCheckin ? `<div class="sig-col">
        ${(() => {
        const authImg = assets.checkinAuthoritySignature;
        const authName = checkinSignerName || form.responsible || "";
        const authTime = form.checkin_signature_time
            ? new Date(form.checkin_signature_time).toLocaleString()
            : form.date_checkin || new Date().toLocaleString();

        if (authImg) {
          return `<img src="${authImg}" style="width:${sigW}px;height:${sigH}px;object-fit:contain;margin-bottom:2px;"/><div><strong>Authority</strong></div><div>${authName}</div><div style="font-size:${sigFontSize};color:#666">${authTime}</div>`;
        }
        return `<hr/><div><strong>Authority Signature</strong></div><div>${authName}</div><div style="font-size:${sigFontSize};color:#666">${authTime}</div>`;
      })()}
      </div>` : ""}
      ${isCheckin && assets.discountAuthSignature ? `<div class="sig-col">
        <img src="${assets.discountAuthSignature}" style="width:${sigW}px;height:${sigH}px;object-fit:contain;margin-bottom:2px;"/>
        <div><strong>Discount Auth.</strong></div>
        <div>${discountAuthName || ""}</div>
        <div style="font-size:${sigFontSize};color:#666">${new Date(form.discount_auth_signature_time).toLocaleString()}</div>
      </div>` : ""}
    </div>

    <div class="footer">Generated from Tool Management App &mdash; ${new Date().toLocaleString()}</div>
    ${assets.cornerImage ? `<div style="text-align:right;margin-top:${isA5 ? "4px" : "10px"};"><img src="${assets.cornerImage}" style="width:${isA5 ? "130px" : "250px"};height:auto;" /></div>` : ""}
    </body></html>`;
  };

  // Try to get PDF from Odoo server, returns file URI or null on failure
  const fetchOdooPdf = async () => {
    if (!odooOrderId || !odooAuth) return null;
    try {
      const downloadFn = invoiceType === "checkout" ? downloadCheckoutInvoice : invoiceType === "partial_return" ? downloadPartialReturnInvoice : downloadCheckinInvoice;
      const fileUri = await downloadFn(odooAuth, odooOrderId, invoicePaperSize);
      return fileUri;
    } catch (e) {
      console.warn("Odoo PDF download failed, using local fallback:", e.message);
      return null;
    }
  };

  // Fallback: generate PDF locally from HTML
  const generateLocalPdf = async () => {
    // Resolve any signature file URIs to data URIs so images embed correctly in HTML
    const resolveImageDataUri = async (val) => {
      if (!val) return null;
      // already data uri
      if (typeof val === "string" && val.startsWith("data:")) return val;
      // if it's raw base64 (no data:), convert
      if (typeof val === "string" && /^[A-Za-z0-9+/=\r\n]+$/.test(val) && val.length > 100) {
        return base64ToDataUri(val);
      }
      // if it's existingOrder base64 fields (may not be data:), detect by length/characters
      if (typeof val === "string" && val.startsWith("/9j/")) {
        return base64ToDataUri(val);
      }
      // else treat as file URI -> read as base64
      try {
        const b64 = await uriToBase64(val);
        if (b64) return base64ToDataUri(b64);
      } catch (e) {
        // ignore
      }
      return null;
    };

    const resolveWithFallback = async (primary, fallback) => {
      const result = await resolveImageDataUri(primary);
      if (result) return result;
      return resolveImageDataUri(fallback);
    };

    const assets = {};
    assets.checkoutSignature = await resolveWithFallback(checkoutSignatureUri, existingOrder?.customer_signature);
    assets.checkinSignature = await resolveWithFallback(checkinSignatureUri, existingOrder?.checkin_customer_signature);
    assets.checkinAuthoritySignature = await resolveWithFallback(checkinAuthoritySignatureUri, existingOrder?.checkin_signature);
    assets.discountAuthSignature = await resolveWithFallback(discountAuthSignatureUri, existingOrder?.discount_auth_signature);
    try {
      const logoAsset = Asset.fromModule(require("@assets/images/logo.png"));
      await logoAsset.downloadAsync();
      const logoB64 = await uriToBase64(logoAsset.localUri);
      assets.logo = logoB64 ? base64ToDataUri(logoB64, "image/jpeg") : null;
    } catch (e) {
      assets.logo = null;
    }
    try {
      const cornerAsset = Asset.fromModule(require("@assets/images/invoice_corner.jpeg"));
      await cornerAsset.downloadAsync();
      const cornerB64 = await uriToBase64(cornerAsset.localUri);
      assets.cornerImage = cornerB64 ? base64ToDataUri(cornerB64, "image/jpeg") : null;
    } catch (e) {
      assets.cornerImage = null;
    }

    const html = buildInvoiceHtml(invoiceType, assets);
    const printOptions = { html, base64: false };
    // Set explicit page dimensions for A5 (148mm x 210mm = 420pt x 595pt)
    if (invoicePaperSize === "a5") {
      printOptions.width = 420;
      printOptions.height = 595;
    }
    const { uri } = await Print.printToFileAsync(printOptions);
    return uri;
  };

  const handleInvoiceDownload = async () => {
    setInvoiceDownloading(true);
    try {
      // Try Odoo server PDF first, fall back to local HTML
      let pdfUri = await fetchOdooPdf();
      if (!pdfUri) {
        pdfUri = await generateLocalPdf();
      }

      const fileName = `${invoiceType === "checkout" ? "Checkout" : "CheckIn"}_Invoice_${(form.name || "order").replace(/\//g, "-")}_${Date.now()}.pdf`;

      if (Platform.OS === "android") {
        // Use StorageAccessFramework to save to Downloads (visible in file manager)
        const SAF = FileSystem.StorageAccessFramework;
        const permissions = await SAF.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const base64Data = await FileSystem.readAsStringAsync(pdfUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const safUri = await SAF.createFileAsync(
            permissions.directoryUri,
            fileName,
            "application/pdf"
          );
          await FileSystem.writeAsStringAsync(safUri, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });
          setShowInvoiceModal(false);
          showToastMessage("PDF saved: " + fileName);
        } else {
          // User denied folder access, fall back to share sheet
          const destUri = FileSystem.documentDirectory + fileName;
          await FileSystem.copyAsync({ from: pdfUri, to: destUri });
          setShowInvoiceModal(false);
          await Sharing.shareAsync(destUri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
          showToastMessage("PDF shared: " + fileName);
        }
      } else {
        const destUri = FileSystem.documentDirectory + fileName;
        await FileSystem.copyAsync({ from: pdfUri, to: destUri });
        setShowInvoiceModal(false);
        await Sharing.shareAsync(destUri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
        showToastMessage("PDF saved: " + fileName);
      }
    } catch (e) {
      showToastMessage("Download error: " + e.message);
    } finally {
      setInvoiceDownloading(false);
    }
  };

  const handleInvoicePrint = async () => {
    setInvoicePrinting(true);
    try {
      // Try Odoo PDF first for printing too
      let pdfUri = await fetchOdooPdf();
      if (pdfUri) {
        // Print the Odoo PDF file directly
        await Print.printAsync({ uri: pdfUri });
      } else {
        // Fallback to local HTML print (ensure images are resolved)
        const localUri = await generateLocalPdf();
        if (localUri) await Print.printAsync({ uri: localUri });
      }
      setShowInvoiceModal(false);
    } catch (e) {
      if (!e.message?.includes("cancelled")) {
        showToastMessage("Print error: " + e.message);
      }
    } finally {
      setInvoicePrinting(false);
    }
  };

  const handleInvoiceWhatsApp = async () => {
    const customerPhone = form.partner_phone ? countryCode.replace("+", "") + form.partner_phone : "";
    if (!customerPhone) {
      showToastMessage("No phone number found for this customer");
      return;
    }
    setInvoiceSendingWA(true);
    try {
      // Get PDF: try Odoo server first, fall back to local generation
      let pdfUri = await fetchOdooPdf();
      if (!pdfUri) {
        pdfUri = await generateLocalPdf();
      }
      if (!pdfUri) {
        showToastMessage("Could not generate PDF");
        return;
      }

      // Read PDF as base64
      const base64Data = await FileSystem.readAsStringAsync(pdfUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const filename = `${invoiceType === "checkout" ? "Checkout" : "CheckIn"}_Invoice_${(form.name || "order").replace(/\//g, "-")}.pdf`;

      // Send via WhatsApp API
      await sendWhatsAppDocument(odooAuth, customerPhone, base64Data, filename, filename);
      setShowInvoiceModal(false);
      showToastMessage("WhatsApp sent to " + customerPhone);
    } catch (e) {
      showToastMessage("WhatsApp error: " + e.message);
    } finally {
      setInvoiceSendingWA(false);
    }
  };

  const actionCancel = () => {
    Alert.alert("Cancel Order", "Are you sure you want to cancel this order?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            if (odooOrderId && odooAuth) {
              await storeCancelOrder(odooAuth, odooOrderId);
              showToastMessage("Order cancelled in Odoo");
              navigation.goBack();
              return;
            }
            setState("cancelled");
            addTimesheetEntry("note", "Order cancelled");
            showToastMessage("Order cancelled");
          } catch (e) {
            showToastMessage("Error: " + e.message);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!validateOrder()) return;
    // Quick local save + immediate navigation for snappy UX.
    if (!validateOrder()) return;
    setSaving(true);
    try {
      const partnerId = await ensurePartnerId();
      if (!partnerId) {
        showToastMessage("Customer is required. Please select or enter a customer.");
        setSaving(false);
        return;
      }

      const orderValues = {
        partner_id: partnerId,
        date_planned_checkout: form.date_planned_checkout || false,
        date_planned_checkin: form.date_planned_checkin || false,
        rental_period_type: form.rental_period_type,
        rental_duration: parseFloat(form.rental_duration) || 1,
        advance_amount: parseFloat(form.advance_amount) || 0,
        payment_method: form.payment_method || false,
        notes: form.notes || "",
        terms: form.terms || "",
      };
      const lineValues = lines.map((l) => ({
        tool_id: l.tool_id || null,
        unit_price: parseFloat(l.unit_price) || 0,
        quantity: parseFloat(l.quantity) || 1,
        planned_duration: parseFloat(l.planned_duration) || 1,
        period_type: l.period_type || form.rental_period_type,
      }));

      // Optimistic: navigate back immediately, perform server save in background
      savedRef.current = true;
      showToastMessage("Saving order...");
      navigation.goBack();

      (async () => {
        try {
          if (odooOrderId && odooAuth) {
            await updateOrder(odooAuth, odooOrderId, orderValues);
            // Also update each line's period_type and planned_duration
            await Promise.all(lines.map((l) => {
              if (!l.odoo_id) return null;
              return updateOrderLineValues(odooAuth, l.odoo_id, {
                period_type: l.period_type || form.rental_period_type,
                planned_duration: parseFloat(l.planned_duration) || parseFloat(form.rental_duration) || 1,
                unit_price: parseFloat(l.unit_price) || 0,
              });
            }).filter(Boolean));
            showToastMessage("Order updated in Odoo");
          } else if (odooAuth) {
            await addOrder(odooAuth, orderValues, lineValues);
            showToastMessage("Order created in Odoo");
          } else {
            showToastMessage("Order saved locally");
          }
        } catch (e) {
          console.warn("Background save failed:", e.message);
          showToastMessage("Background save failed: " + e.message);
        }
      })();
      return;
    } catch (e) {
      showToastMessage("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ---------- AUTO-SAVE PHONE NUMBER ----------
  useEffect(() => {
    if (!form.partner_phone || !form.partner_id || !odooAuth) return;

    // Validate phone number
    if (!form.partner_phone || form.partner_phone.trim() === "") {
      setPhoneError(null);
      if (phoneDebounceRef.current) clearTimeout(phoneDebounceRef.current);
      return;
    }

    const phoneValidationError = isPhone(form.partner_phone, countryCode);
    setPhoneError(phoneValidationError);

    // Don't auto-save if validation fails
    if (phoneValidationError) {
      if (phoneDebounceRef.current) {
        clearTimeout(phoneDebounceRef.current);
      }
      return;
    }

    phoneDebounceRef.current = setTimeout(async () => {
      try {
        await updateCustomer(odooAuth, form.partner_id, { phone: countryCode + form.partner_phone });
        if (isNewCustomer) {
          showToastMessage("Phone number saved");
        }
      } catch (e) {
        console.warn("Failed to auto-save phone:", e.message);
        if (isNewCustomer) {
          showToastMessage("Failed to save phone number");
        }
      }
    }, 1500); // Save after 1.5 seconds of inactivity

    return () => {
      if (phoneDebounceRef.current) {
        clearTimeout(phoneDebounceRef.current);
      }
    };
  }, [form.partner_phone, form.partner_id, odooAuth]);

  // ---------- AUTO-SAVE EMAIL ADDRESS ----------
  useEffect(() => {
    if (!form.partner_id || !odooAuth) return;

    // Validate email
    if (!form.partner_email || form.partner_email.trim() === "") {
      setEmailError(null);
      if (emailDebounceRef.current) clearTimeout(emailDebounceRef.current);
      return;
    }

    const emailValidationError = isEmail(form.partner_email);
    setEmailError(emailValidationError);

    // Don't auto-save if validation fails
    if (emailValidationError) {
      if (emailDebounceRef.current) {
        clearTimeout(emailDebounceRef.current);
      }
      return;
    }

    if (emailDebounceRef.current) {
      clearTimeout(emailDebounceRef.current);
    }

    emailDebounceRef.current = setTimeout(async () => {
      try {
        await updateCustomer(odooAuth, form.partner_id, { email: form.partner_email });
        if (isNewCustomer) {
          showToastMessage("Email saved");
        }
      } catch (e) {
        console.warn("Failed to auto-save email:", e.message);
        if (isNewCustomer) {
          showToastMessage("Failed to save email");
        }
      }
    }, 1500); // Save after 1.5 seconds of inactivity

    return () => {
      if (emailDebounceRef.current) {
        clearTimeout(emailDebounceRef.current);
      }
    };
  }, [form.partner_email, form.partner_id, odooAuth]);

  // ---------- REFRESH ORDER DATA + IMAGES on every focus (parallel image loading) ----------
  const discountAuthorizedThisVisit = useRef(false);
  const lastFocusFetch = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (!existingOrder?.odoo_id || !odooAuth) return;
      const now = Date.now();
      if (now - lastFocusFetch.current < 5000) return;
      lastFocusFetch.current = now;
      discountAuthorizedThisVisit.current = false;
      let cancelled = false;
      (async () => {
        try {
          // 1. Fetch fresh order data (lightweight, no images)
          const fresh = await fetchOrderDataById(odooAuth, existingOrder.odoo_id);
          if (cancelled || !fresh) return;
          setState(fresh.state || "draft");
          const freshForm = {
            name: fresh.name || "New",
            customer_id: fresh.customer_id || "",
            partner_id: fresh.partner_id || null,
            partner_name: fresh.partner_name || "",
            partner_phone: splitPhoneCountryCode(fresh.partner_phone || "").local,
            partner_email: fresh.partner_email || "",
            responsible: fresh.responsible || "Admin",
            date_order: fresh.date_order || today(),
            date_planned_checkout: fresh.date_planned_checkout || "",
            date_planned_checkin: fresh.date_planned_checkin || "",
            date_checkout: fresh.date_checkout || "",
            date_checkin: fresh.date_checkin || "",
            date_checkout_raw: fresh.date_checkout_raw || "",
            rental_period_type: fresh.rental_period_type || "day",
            rental_duration: fresh.rental_duration?.toString() || "1",
            actual_duration: fresh.actual_duration || "",
            advance_amount: fresh.advance_amount?.toString() || "0",
            payment_method: fresh.payment_method || "",
            cash_received: fresh.cash_received?.toString() || "",
            advance_returned: fresh.advance_returned || false,
            checkin_payment_method: fresh.checkin_payment_method || "",
            checkin_cash_received: fresh.checkin_cash_received?.toString() || "",
            damage_charges: fresh.damage_charges?.toString() || "0",
            discount_amount: fresh.discount_amount?.toString() || "0",
            notes: fresh.notes || "",
            terms: fresh.terms || "",
          };
          setForm(freshForm);
          const freshLines = (fresh.lines || []).map((fl) => {
            // If tax_amount is 0 but tool has tax, compute locally
            const flToolId = Number(fl.tool_id);
            if (!(parseFloat(fl.tax_amount) > 0) && flToolId && tools && tools.length > 0) {
              const tool = tools.find(t => Number(t.odoo_id || t.id) === flToolId);
              if (tool && parseFloat(tool.tax_rate) > 0) {
                const price = parseFloat(fl.unit_price) || 0;
                const dur = parseFloat(fl.planned_duration) || 1;
                const qty = parseFloat(fl.quantity) || 1;
                const multiplier = LINE_DAY_MULTIPLIERS[fl.period_type || "day"] || 1;
                const rentalCost = price * dur * multiplier * qty;
                const taxRate = parseFloat(tool.tax_rate);
                const taxAmt = rentalCost * taxRate / 100;
                return {
                  ...fl,
                  tax_rate: taxRate,
                  tax_amount: taxAmt.toFixed(3),
                  price_before_tax: rentalCost.toFixed(3),
                  tax_ids: [{ name: taxRate + '%' }],
                };
              }
            }
            return fl;
          });
          setLines(freshLines);
          setTimesheet(fresh.timesheet || []);
          setOdooOrderId(fresh.odoo_id);

          // 2. Fetch order images + line images IN PARALLEL (not sequential)
          const lineIds = freshLines.map((l) => l.odoo_id).filter(Boolean);
          const [imgs, lineImgs] = await Promise.all([
            fetchOrderImages(odooAuth, existingOrder.odoo_id).catch(() => null),
            lineIds.length > 0 ? fetchOrderLineImages(odooAuth, lineIds).catch(() => []) : Promise.resolve([]),
          ]);
          if (cancelled) return;

          // Apply order-level images
          if (imgs) {
            if (imgs.customer_signature) {
              setCheckoutSignatureUri(base64ToDataUri(imgs.customer_signature));
              setCheckoutSignature(true);
            }
            if (imgs.id_proof_front) {
              setIdProofFrontUri(base64ToDataUri(imgs.id_proof_front));
              setCheckoutIdProof(true);
            }
            if (imgs.id_proof_back) {
              setIdProofBackUri(base64ToDataUri(imgs.id_proof_back));
            }
            if (imgs.checkout_signature_date) {
              setCheckoutSignatureTime(imgs.checkout_signature_date);
              setIdProofTimestamp(imgs.checkout_signature_date);
            } else if (freshForm.date_checkout) {
              if (imgs.customer_signature) setCheckoutSignatureTime(freshForm.date_checkout);
              if (imgs.id_proof_front) setIdProofTimestamp(freshForm.date_checkout);
            }
            if (imgs.checkin_customer_signature) {
              setCheckinSignatureUri(base64ToDataUri(imgs.checkin_customer_signature));
              setCheckinSignature(true);
            }
            if (imgs.checkin_customer_signature_date) {
              setCheckinSignatureTime(imgs.checkin_customer_signature_date);
            } else if (imgs.checkin_customer_signature && freshForm.date_checkin) {
              setCheckinSignatureTime(freshForm.date_checkin);
            }
            if (imgs.checkin_signature) {
              setCheckinAuthoritySignatureUri(base64ToDataUri(imgs.checkin_signature));
              setCheckinAuthoritySignature(true);
            }
            if (imgs.checkin_signature_date) {
              setCheckinAuthoritySignatureTime(imgs.checkin_signature_date);
            } else if (imgs.checkin_signature && freshForm.date_checkin) {
              setCheckinAuthoritySignatureTime(freshForm.date_checkin);
            }
            if (imgs.checkin_signer_name) setCheckinSignerName(imgs.checkin_signer_name);
            // Discount authorization
            setDiscountAuthSignatureUri(imgs.discount_auth_signature ? base64ToDataUri(imgs.discount_auth_signature) : null);
            setDiscountAuthPhotoUri(imgs.discount_auth_photo ? base64ToDataUri(imgs.discount_auth_photo) : null);
            if (imgs.discount_applied_date) {
              setDiscountAuthSignatureTime(imgs.discount_applied_date);
              setDiscountAuthPhotoTime(imgs.discount_applied_date);
            } else {
              if (imgs.discount_auth_photo) setDiscountAuthPhotoTime(freshForm.date_checkout || freshForm.date_order);
              if (imgs.discount_auth_signature) setDiscountAuthSignatureTime(freshForm.date_checkout || freshForm.date_order);
            }
            setDiscountAuthName(imgs.discount_authorized_by || "");
          }

          // Apply line-level images
          if (lineImgs && lineImgs.length > 0) {
            const photoMap = {};
            const timeMap = {};
            const checkinPhotoMap = {};
            const checkinTimeMap = {};
            lineImgs.forEach((li) => {
              const idx = freshLines.findIndex((l) => Number(l.odoo_id) === Number(li.id));
              if (idx >= 0) {
                if (li.checkout_tool_image) {
                  photoMap[idx] = base64ToDataUri(li.checkout_tool_image);
                  timeMap[idx] = freshForm.date_checkout || freshForm.date_order || "";
                }
                if (li.checkin_tool_image) {
                  checkinPhotoMap[idx] = base64ToDataUri(li.checkin_tool_image);
                  checkinTimeMap[idx] = freshForm.date_checkin || "";
                }
                if (li.checkout_condition) updateLine(idx, "checkout_condition", li.checkout_condition);
                if (li.checkin_condition) updateLine(idx, "checkin_condition", li.checkin_condition);
              }
            });
            setToolPhotoUris(photoMap);
            setToolPhotoTimestamps(timeMap);
            setToolCheckinPhotoUris(checkinPhotoMap);
            setToolCheckinPhotoTimestamps(checkinTimeMap);
          }
        } catch (e) {
          console.warn("Failed to refresh order data/images:", e.message);
        }
      })();
      return () => { cancelled = true; };
    }, [existingOrder?.odoo_id, odooAuth])
  );

  // ---------- REFRESH TOOLS on every focus so available_qty is up-to-date ----------
  useFocusEffect(
    useCallback(() => {
      if (odooAuth) {
        storeFetchTools(odooAuth);
      }
    }, [odooAuth])
  );

  // ---------- AUTO-SAVE ON LEAVE ----------
  const savedRef = useRef(false);
  const formRef = useRef(form);
  const linesRef = useRef(lines);
  formRef.current = form;
  linesRef.current = lines;

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (savedRef.current) return;
      const curForm = formRef.current;
      const curLines = linesRef.current;
      if (!curForm.partner_name.trim() || curLines.length === 0) return;
      if (!odooAuth || odooOrderId) return;

      e.preventDefault();
      savedRef.current = true;

      const doAutoSave = async () => {
        let partnerId = curForm.partner_id;
        if (!partnerId) {
          try {
            partnerId = await addCustomer(odooAuth, {
              name: curForm.partner_name.trim(),
              phone: curForm.partner_phone ? countryCode + curForm.partner_phone : "",
              email: curForm.partner_email || "",
            });
          } catch (_) {
            navigation.dispatch(e.data.action);
            return;
          }
        }
        const orderValues = {
          partner_id: partnerId,
          date_planned_checkout: curForm.date_planned_checkout || false,
          date_planned_checkin: curForm.date_planned_checkin || false,
          rental_period_type: curForm.rental_period_type,
          rental_duration: parseFloat(curForm.rental_duration) || 1,
          advance_amount: parseFloat(curForm.advance_amount) || 0,
          payment_method: curForm.payment_method || false,
          cash_received: parseFloat(curForm.cash_received) || 0,
          checkin_cash_received: parseFloat(curForm.checkin_cash_received) || 0,
          notes: curForm.notes || "",
          terms: curForm.terms || "",
        };
        const lineValues = curLines.map((l) => ({
          tool_id: l.tool_id || null,
          unit_price: parseFloat(l.unit_price) || 0,
          quantity: parseFloat(l.quantity) || 1,
          planned_duration: parseFloat(l.planned_duration) || 1,
          period_type: l.period_type || curForm.rental_period_type,
        }));
        addOrder(odooAuth, orderValues, lineValues)
          .then(() => showToastMessage("Order auto-saved as draft"))
          .catch(() => { })
          .finally(() => navigation.dispatch(e.data.action));
      };
      doAutoSave();
    });
    return unsubscribe;
  }, [navigation, odooAuth, existingOrder, addOrder, addCustomer]);

  // ---------- HELPER ----------
  const stateIdx = STATE_ORDER.indexOf(state);
  const isEditable = state === "draft";
  const periodLabel = PERIOD_TYPES.find((p) => p.value === form.rental_period_type)?.label || "Daily";

  // ---------- CAMERA & FILE PICKER ----------
  const openCamera = (callback) => {
    setCameraCallback(() => callback);
    setShowCamera(true);
  };

  const handleCameraCapture = (uri) => {
    setShowCamera(false);
    if (cameraCallback) {
      cameraCallback(uri);
      setCameraCallback(null);
    }
  };

  const openCameraForIdProofFront = () => {
    openCamera((uri) => {
      setIdProofFrontUri(uri);
      setIdProofTimestamp(new Date().toLocaleString());
      setCheckoutIdProof(true);
      showToastMessage("ID Proof (Front) captured");
    });
  };

  const pickFileForIdProofFront = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.length > 0) {
        setIdProofFrontUri(result.assets[0].uri);
        setIdProofTimestamp(new Date().toLocaleString());
        setCheckoutIdProof(true);
        showToastMessage("ID Proof (Front) attached");
      }
    } catch (e) {
      Alert.alert("Error", "Could not pick file: " + e.message);
    }
  };

  const removeIdProofFront = () => {
    setIdProofFrontUri(null);
    if (!idProofBackUri) setCheckoutIdProof(false);
  };

  const openCameraForIdProofBack = () => {
    openCamera((uri) => {
      setIdProofBackUri(uri);
      showToastMessage("ID Proof (Back) captured");
    });
  };

  const pickFileForIdProofBack = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.length > 0) {
        setIdProofBackUri(result.assets[0].uri);
        showToastMessage("ID Proof (Back) attached");
      }
    } catch (e) {
      Alert.alert("Error", "Could not pick file: " + e.message);
    }
  };

  const removeIdProofBack = () => {
    setIdProofBackUri(null);
  };

  const openCameraForToolPhoto = (lineIdx) => {
    openCamera((uri) => {
      setToolPhotoUris((prev) => ({ ...prev, [lineIdx]: uri }));
      setToolPhotoTimestamps((prev) => ({ ...prev, [lineIdx]: new Date().toLocaleString() }));
      updateLine(lineIdx, "checkout_tool_image", true);
      showToastMessage("Tool photo captured");
    });
  };

  const removeToolPhoto = (lineIdx) => {
    setToolPhotoUris((prev) => {
      const updated = { ...prev };
      delete updated[lineIdx];
      return updated;
    });
    setToolPhotoTimestamps((prev) => {
      const updated = { ...prev };
      delete updated[lineIdx];
      return updated;
    });
    updateLine(lineIdx, "checkout_tool_image", false);
  };

  const openCameraForCheckinToolPhoto = (lineIdx) => {
    openCamera((uri) => {
      setToolCheckinPhotoUris((prev) => ({ ...prev, [lineIdx]: uri }));
      setToolCheckinPhotoTimestamps((prev) => ({ ...prev, [lineIdx]: new Date().toLocaleString() }));
      updateLine(lineIdx, "checkin_tool_image", true);
      showToastMessage("Check-in tool photo captured");
    });
  };

  const removeCheckinToolPhoto = (lineIdx) => {
    setToolCheckinPhotoUris((prev) => {
      const updated = { ...prev };
      delete updated[lineIdx];
      return updated;
    });
    setToolCheckinPhotoTimestamps((prev) => {
      const updated = { ...prev };
      delete updated[lineIdx];
      return updated;
    });
    updateLine(lineIdx, "checkin_tool_image", false);
  };

  // ---------- SIGNATURE PAD ----------
  const openSignaturePad = (target) => {
    // target: { setUri, setFlag, id }
    setActiveSignatureTarget(target);
    // reset the drawing before showing
    if (signatureRef.current) signatureRef.current.clearSignature();
    // initialize tool settings to defaults
    setSignStrokeColor((target && target.defaultColor) || "#000");
    setSignStrokeWidth((target && target.defaultWidth) || 3);
    setSignModeEraser(false);
    setShowSignaturePad(true);
  };

  const handleSignatureSave = async () => {
    if (!activeSignatureTarget) return;
    if (signatureRef.current?.isEmpty()) {
      Alert.alert("Required", "Please draw your signature first.");
      return;
    }
    try {
      const uri = await signatureRef.current.readSignature();
      if (uri) {
        const { setUri, setFlag, id } = activeSignatureTarget;
        setUri(uri);
        if (typeof setFlag === 'function') setFlag(true);
        // capture timestamp for this signature
        const now = new Date().toISOString();
        if (id === 'checkout') {
          setCheckoutSignatureTime(now);
          setForm((p) => ({ ...p, checkout_signature_time: now }));
        } else if (id === 'checkin_customer') {
          setCheckinSignatureTime(now);
          setForm((p) => ({ ...p, checkin_signature_time: now }));
        } else if (id === 'checkin_authority') {
          setCheckinAuthoritySignatureTime(now);
          setForm((p) => ({ ...p, checkin_authority_signature_time: now }));
        } else if (id === 'discount_auth') {
          setDiscountAuthSignatureTime(now);
          setForm((p) => ({ ...p, discount_auth_signature_time: now }));
        }
        setShowSignaturePad(false);
        setActiveSignatureTarget(null);
        showToastMessage("Signature saved");
      }
    } catch (e) {
      Alert.alert("Error", "Could not save signature");
    }
  };

  const handleSignatureClear = () => {
    if (signatureRef.current) signatureRef.current.clearSignature();
  };

  const removeSignature = (setUri, setFlag) => {
    setUri(null);
    setFlag(false);
  };

  // ---------- STATUS BREADCRUMB ----------
  const renderStatusBreadcrumb = () => (
    <View style={styles.breadcrumbRow}>
      {STATE_STEPS.map((step, idx) => {
        const stepIdx = STATE_ORDER.indexOf(step.key);
        const isActive = state === step.key;
        const isPast = stateIdx > stepIdx;
        return (
          <View key={step.key} style={styles.breadcrumbItem}>
            <View style={[styles.breadcrumbDot, isActive && styles.breadcrumbDotActive, isPast && styles.breadcrumbDotPast]} />
            <Text style={[styles.breadcrumbLabel, isActive && styles.breadcrumbLabelActive, isPast && styles.breadcrumbLabelPast]}>
              {step.label}
            </Text>
            {idx < STATE_STEPS.length - 1 && <View style={[styles.breadcrumbLine, isPast && styles.breadcrumbLinePast]} />}
          </View>
        );
      })}
    </View>
  );

  // ---------- ACTION BUTTONS ----------
  const renderActionButtons = () => {
    if (state === "cancelled") return null;
    return (
      <View style={styles.actionRow}>
        {state === "draft" && (
          <>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.primaryThemeColor }]} onPress={actionConfirm}>
              <Text style={styles.actionBtnText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelActionBtn} onPress={actionCancel}>
              <Text style={styles.cancelActionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
        {state === "confirmed" && (
          <>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#FF9800" }]} onPress={openCheckoutWizard}>
              <Text style={styles.actionBtnText}>Check-Out Tools</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelActionBtn} onPress={actionCancel}>
              <Text style={styles.cancelActionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
        {state === "checked_out" && (
          <>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#E65100" }]} onPress={() => {
              // Skip auth page only if authorized during THIS visit (security: re-entering requires re-auth)
              setDiscountPage(discountAuthorizedThisVisit.current ? 2 : 1);
              setDiscountLines(lines.map((l, idx) => ({
                idx,
                tool_name: l.tool_name || "Tool " + (idx + 1),
                serial_number: l.serial_number || "-",
                rental_cost: (parseFloat(l.unit_price) || 0) * (parseFloat(l.planned_duration) || 1) * (LINE_DAY_MULTIPLIERS[l.period_type || "day"] || 1) * (parseFloat(l.quantity) || 1),
                late_fee: parseFloat(l.late_fee_amount) || 0,
                damage_charge: parseFloat(l.damage_charge) || 0,
                discount_type: l.discount_type || "percentage",
                discount_value: l.discount_value && l.discount_value !== "0" ? l.discount_value : "",
              })));
              setShowDiscountModal(true);
            }}>
              <Text style={styles.actionBtnText}>Discount</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#4CAF50" }]} onPress={openCheckinWizard}>
              <Text style={styles.actionBtnText}>Check-In Tools</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelActionBtn} onPress={actionCancel}>
              <Text style={styles.cancelActionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
        {state === "checked_in" && (
          <>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#388E3C" }]} onPress={actionDone}>
              <Text style={styles.actionBtnText}>Mark Done</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelActionBtn} onPress={actionCancel}>
              <Text style={styles.cancelActionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
        {/* Print Checkout Invoice: visible at checked_out, checked_in, invoiced (matches Odoo) */}
        {["checked_out", "checked_in", "invoiced"].includes(state) && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#1565C0" }]} onPress={() => openInvoiceModal("checkout")} disabled={saving}>
            <Text style={styles.actionBtnText}>Checkout Invoice</Text>
          </TouchableOpacity>
        )}
        {/* Print Partial Return Invoice: visible when partial returns exist */}
        {["checked_out", "checked_in", "invoiced"].includes(state) && (lines.some(l => parseFloat(l.returned_qty) > 0) || existingOrder?.partial_return_date) && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#FF6F00" }]} onPress={() => openInvoiceModal("partial_return")} disabled={saving}>
            <Text style={styles.actionBtnText}>Partial Return Invoice</Text>
          </TouchableOpacity>
        )}
        {/* Print Check-In Invoice: visible only at invoiced (matches Odoo) */}
        {state === "invoiced" && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#7B1FA2" }]} onPress={() => openInvoiceModal("checkin")} disabled={saving}>
            <Text style={styles.actionBtnText}>Check-In Invoice</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ---------- CONDITION CHIPS ----------
  const renderConditionChips = (value, onSelect, disabled) => (
    <View style={styles.chipRow}>
      {CONDITIONS.map((c) => (
        <TouchableOpacity
          key={c.value}
          style={[styles.condChip, value === c.value && styles.condChipActive]}
          onPress={() => !disabled && onSelect(c.value)}
          disabled={disabled}
        >
          <Text style={[styles.condChipText, value === c.value && styles.condChipTextActive]}>
            {c.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // ---------- TABS ----------
  const getTabs = () => {
    const tabs = [
      { key: "lines", label: "Rental Lines" },
      { key: "timesheet", label: "Timesheet" },
    ];
    const afterCheckout = ["checked_out", "checked_in", "done", "invoiced"].includes(state);
    const afterCheckin = ["checked_in", "done", "invoiced"].includes(state);
    if (afterCheckout) tabs.push({ key: "checkout_details", label: "Check-Out" });
    if (afterCheckin) tabs.push({ key: "checkin_details", label: "Check-In" });
    if (parseFloat(form.discount_amount) > 0) tabs.push({ key: "discount_details", label: "Discount" });
    if (afterCheckout) tabs.push({ key: "tool_photos", label: "Tool Photos" });
    tabs.push({ key: "notes", label: "Notes" });
    return tabs;
  };

  // ---------- CHECK-OUT MODAL ----------
  const renderCheckoutModal = () => (
    <Modal visible={showCheckoutModal} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { padding: 0 }]}>
          {/* Header */}
          <View style={coStyles.header}>
            <View>
              <Text style={coStyles.headerTitle}>Check-Out Tools</Text>
              <Text style={coStyles.headerSub}>{form.name}</Text>
            </View>
            <TouchableOpacity style={coStyles.closeBtn} onPress={() => setShowCheckoutModal(false)}>
              <Text style={coStyles.closeBtnText}>X</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ padding: 16 }}>
            {/* Order Info Card */}
            <View style={ciStyles.infoCard}>
              <View style={ciStyles.infoGrid}>
                <View style={ciStyles.infoItem}>
                  <Text style={ciStyles.infoLabel}>Customer</Text>
                  <Text style={ciStyles.infoValue}>{form.partner_name || "-"}</Text>
                </View>
                <View style={ciStyles.infoItem}>
                  <Text style={ciStyles.infoLabel}>Duration</Text>
                  <Text style={ciStyles.infoValue}>{form.rental_duration} {getPeriodLabel(form.rental_period_type, form.rental_duration)}(s)</Text>
                </View>
                <View style={ciStyles.infoItem}>
                  <Text style={ciStyles.infoLabel}>Check-Out Date</Text>
                  <Text style={[ciStyles.infoValue, { color: "#1565C0", fontWeight: "700" }]}>{new Date().toLocaleString()}</Text>
                </View>
                <View style={ciStyles.infoItem}>
                  <Text style={ciStyles.infoLabel}>Planned Check-In</Text>
                  <Text style={ciStyles.infoValue}>{form.date_planned_checkin || "-"}</Text>
                </View>
              </View>
            </View>

            {/* Tools Section */}
            <Text style={ciStyles.sectionTitle}>TOOLS ({lines.length})</Text>
            {lines.map((line, idx) => (
              <View key={line.id} style={ciStyles.toolCard}>
                {/* Tool Header */}
                <View style={ciStyles.toolHeader}>
                  <View style={[ciStyles.toolNumBadge, { backgroundColor: "#1565C0" }]}>
                    <Text style={ciStyles.toolNumText}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={ciStyles.toolName}>{line.tool_name || "Tool " + (idx + 1)}</Text>
                    {line.serial_number ? <Text style={ciStyles.toolSerial}>S/N: {line.serial_number}</Text> : null}
                  </View>
                </View>

                {/* Pricing Info */}
                <View style={coStyles.pricingRow}>
                  <View style={coStyles.pricingItem}>
                    <Text style={ciStyles.lateFeeLabel}>Price / {PERIOD_LABELS[form.rental_period_type] || "Day"}</Text>
                    <View style={ciStyles.readOnlyBox}>
                      <Text style={ciStyles.readOnlyText}>ر.ع.{parseFloat(line.unit_price || 0).toFixed(3)}</Text>
                    </View>
                  </View>
                  <View style={coStyles.pricingItem}>
                    <Text style={ciStyles.lateFeeLabel}>Duration</Text>
                    <View style={ciStyles.readOnlyBox}>
                      <Text style={ciStyles.readOnlyText}>{line.planned_duration || "1"} {getPeriodLabel(line.period_type || form.rental_period_type, line.planned_duration)}(s)</Text>
                    </View>
                  </View>
                  <View style={coStyles.pricingItem}>
                    <Text style={ciStyles.lateFeeLabel}>Total</Text>
                    <View style={[ciStyles.readOnlyBox, { backgroundColor: "#E3F2FD", borderColor: "#90CAF9" }]}>
                      <Text style={[ciStyles.readOnlyText, { color: "#1565C0", fontWeight: "700" }]}>ر.ع.{calcLineTotal(line).toFixed(3)}</Text>
                    </View>
                  </View>
                  {parseFloat(line.tax_amount || 0) > 0 && (
                    <>
                      <View style={coStyles.pricingItem}>
                        <Text style={ciStyles.lateFeeLabel}>Tax %</Text>
                        <View style={ciStyles.readOnlyBox}>
                          <Text style={ciStyles.readOnlyText}>{parseFloat(line.tax_rate) > 0 ? line.tax_rate + '%' : (parseFloat(line.tax_amount) > 0 ? ((parseFloat(line.tax_amount) / (parseFloat(line.price_before_tax) || 1)) * 100).toFixed(1) + '%' : '5%')}</Text>
                        </View>
                      </View>
                      <View style={coStyles.pricingItem}>
                        <Text style={ciStyles.lateFeeLabel}>Tax Amt</Text>
                        <View style={[ciStyles.readOnlyBox, { backgroundColor: "#FFF3E0", borderColor: "#FFB74D" }]}>
                          <Text style={[ciStyles.readOnlyText, { color: "#E65100", fontWeight: "700" }]}>ر.ع.{parseFloat(line.tax_amount).toFixed(3)}</Text>
                        </View>
                      </View>
                    </>
                  )}
                </View>

                {/* Condition */}
                <View style={ciStyles.fieldBlock}>
                  <Text style={ciStyles.fieldLabel}>Condition <Text style={{ color: "#F44336" }}>*</Text></Text>
                  {renderConditionChips(line.checkout_condition, (v) => updateLine(idx, "checkout_condition", v))}
                </View>

                {/* Tool Photo */}
                <View style={ciStyles.fieldBlock}>
                  <Text style={ciStyles.fieldLabel}>Tool Photo</Text>
                  {toolPhotoUris[idx] ? (
                    <View style={styles.capturedImageWrap}>
                      <Image source={{ uri: toolPhotoUris[idx] }} style={styles.capturedImage} />
                      {toolPhotoTimestamps[idx] && <Text style={styles.photoTimestamp}>{toolPhotoTimestamps[idx]}</Text>}
                      <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => removeToolPhoto(idx)}>
                        <Text style={styles.photoRemoveBtnText}>X</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={coStyles.captureBtn} onPress={() => openCameraForToolPhoto(idx)}>
                      <Text style={{ fontSize: 22, marginBottom: 2 }}>{"\uD83D\uDCF7"}</Text>
                      <Text style={coStyles.captureBtnText}>Capture Tool Photo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            {/* Advance Collected */}
            <Text style={ciStyles.sectionTitle}>ADVANCE COLLECTED</Text>
            <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: "#e0e0e0" }}>
              <TextInput
                label="Advance Amount"
                placeholder="0.00"
                value={form.advance_amount && form.advance_amount !== "0" && form.advance_amount !== "0.00" ? form.advance_amount : ""}
                onChangeText={(t) => handleChange("advance_amount", t)}
                keyboardType="decimal-pad"
                column
              />
              {parseFloat(form.advance_amount || 0) > 0 && (
                <View style={{ marginTop: 10 }}>
                  <Text style={ciStyles.fieldLabel}>Payment Method <Text style={{ color: "#F44336" }}>*</Text></Text>
                  <View style={styles.chipRow}>
                    {[{ label: "Cash", value: "cash" }, { label: "Card", value: "card" }, { label: "Bank", value: "bank" }, { label: "Credit", value: "credit" }].map((pm) => (
                      <TouchableOpacity
                        key={pm.value}
                        style={[styles.condChip, form.payment_method === pm.value && styles.condChipActive]}
                        onPress={() => handleChange("payment_method", pm.value)}
                      >
                        <Text style={[styles.condChipText, form.payment_method === pm.value && styles.condChipTextActive]}>
                          {pm.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {form.payment_method === "cash" && parseFloat(form.advance_amount || 0) > 0 && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={ciStyles.fieldLabel}>Cash Received (ر.ع.)</Text>
                      <RNTextInput
                        style={[styles.input, { borderWidth: 1, borderColor: "#e0e0e0", borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: "#fff" }]}
                        placeholder="0.000"
                        value={form.cash_received}
                        onChangeText={(t) => handleChange("cash_received", t)}
                        keyboardType="decimal-pad"
                      />
                      {parseFloat(form.cash_received || 0) > 0 && (
                        <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={ciStyles.fieldLabel}>Balance to Return</Text>
                          <Text style={{ fontSize: 16, fontWeight: "700", color: calcCashBalance() >= 0 ? "#4CAF50" : "#F44336" }}>
                            ر.ع.{calcCashBalance().toFixed(3)}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Totals Card */}
            <View style={ciStyles.totalsCard}>
              <View style={ciStyles.totalRow}>
                <Text style={ciStyles.totalLabel}>Subtotal</Text>
                <Text style={ciStyles.totalValue}>
                  ر.ع.{lines.reduce((sum, l) => sum + calcLineTotal(l), 0).toFixed(3)}
                </Text>
              </View>
              {parseFloat(form.advance_amount || 0) > 0 && (
                <View style={ciStyles.totalRow}>
                  <Text style={ciStyles.totalLabel}>Advance</Text>
                  <Text style={[ciStyles.totalValue, { color: "#4CAF50" }]}>-ر.ع.{parseFloat(form.advance_amount || 0).toFixed(3)}</Text>
                </View>
              )}
            </View>

            {/* ID Proof Front Section */}
            <Text style={ciStyles.sectionTitle}>ID PROOF - FRONT <Text style={{ color: "#F44336" }}>*</Text></Text>
            {idProofFrontUri ? (
              <View style={styles.capturedImageWrap}>
                <Image source={{ uri: idProofFrontUri }} style={styles.capturedIdProof} />
                {idProofTimestamp && <Text style={styles.photoTimestamp}>{idProofTimestamp}</Text>}
                <TouchableOpacity style={styles.photoRemoveBtn} onPress={removeIdProofFront}>
                  <Text style={styles.photoRemoveBtnText}>X</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={coStyles.idProofBtnRow}>
                <TouchableOpacity style={coStyles.captureBtn} onPress={openCameraForIdProofFront}>
                  <Text style={{ fontSize: 22, marginBottom: 2 }}>{"\uD83D\uDCF7"}</Text>
                  <Text style={coStyles.captureBtnText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={coStyles.captureBtn} onPress={pickFileForIdProofFront}>
                  <Text style={{ fontSize: 22, marginBottom: 2 }}>{"\uD83D\uDCCE"}</Text>
                  <Text style={coStyles.captureBtnText}>Attach</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ID Proof Back Section */}
            <Text style={[ciStyles.sectionTitle, { marginTop: 12 }]}>ID PROOF - BACK <Text style={{ color: "#999", fontSize: 11 }}>(Optional)</Text></Text>
            {idProofBackUri ? (
              <View style={styles.capturedImageWrap}>
                <Image source={{ uri: idProofBackUri }} style={styles.capturedIdProof} />
                <TouchableOpacity style={styles.photoRemoveBtn} onPress={removeIdProofBack}>
                  <Text style={styles.photoRemoveBtnText}>X</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={coStyles.idProofBtnRow}>
                <TouchableOpacity style={coStyles.captureBtn} onPress={openCameraForIdProofBack}>
                  <Text style={{ fontSize: 22, marginBottom: 2 }}>{"\uD83D\uDCF7"}</Text>
                  <Text style={coStyles.captureBtnText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={coStyles.captureBtn} onPress={pickFileForIdProofBack}>
                  <Text style={{ fontSize: 22, marginBottom: 2 }}>{"\uD83D\uDCCE"}</Text>
                  <Text style={coStyles.captureBtnText}>Attach</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Terms & Conditions */}
            <Text style={ciStyles.sectionTitle}>TERMS & CONDITIONS <Text style={{ color: "#F44336" }}>*</Text></Text>
            <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#e0e0e0" }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#333", marginBottom: 8 }}>Terms & Conditions</Text>
              {DEFAULT_TERMS_EN.map((term, i) => (
                <Text key={"en" + i} style={{ fontSize: 11.5, color: "#444", marginBottom: 4, lineHeight: 17 }}>
                  {i + 1}. {term}
                </Text>
              ))}
              <View style={{ borderTopWidth: 1, borderTopColor: "#e0e0e0", marginVertical: 10 }} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#333", marginBottom: 8, textAlign: "right" }}>الشروط والأحكام</Text>
              {DEFAULT_TERMS_AR.map((term, i) => (
                <Text key={"ar" + i} style={{ fontSize: 11.5, color: "#444", marginBottom: 4, lineHeight: 18, textAlign: "right", writingDirection: "rtl" }}>
                  {i + 1}. {term}
                </Text>
              ))}
            </View>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", marginBottom: 14, paddingVertical: 6 }}
              onPress={() => {
                if (tcAccepted) {
                  setTcAccepted(false);
                  setCheckoutSignatureUri(null);
                  setCheckoutSignature(false);
                } else {
                  setTcAccepted(true);
                }
              }}
              activeOpacity={0.7}
            >
              <View style={{
                width: 22, height: 22, borderRadius: 4, borderWidth: 2,
                borderColor: tcAccepted ? "#1565C0" : "#999",
                backgroundColor: tcAccepted ? "#1565C0" : "#fff",
                alignItems: "center", justifyContent: "center", marginRight: 10,
              }}>
                {tcAccepted && <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>{"\u2713"}</Text>}
              </View>
              <Text style={{ fontSize: 12.5, color: "#333", flex: 1 }}>
                I have read and agree to the Terms & Conditions{"\n"}
                <Text style={{ writingDirection: "rtl" }}>لقد قرأت وأوافق على الشروط والأحكام</Text>
              </Text>
            </TouchableOpacity>

            {/* Customer Signature */}
            <Text style={ciStyles.sectionTitle}>CUSTOMER SIGNATURE <Text style={{ color: "#F44336" }}>*</Text></Text>
            {!tcAccepted ? (
              <View style={{ backgroundColor: "#FFF3E0", borderRadius: 8, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#FFE0B2" }}>
                <Text style={{ fontSize: 12, color: "#E65100", textAlign: "center" }}>Please accept the Terms & Conditions above to sign</Text>
              </View>
            ) : checkoutSignatureUri ? (
              <View style={styles.capturedImageWrap}>
                <Image source={{ uri: checkoutSignatureUri }} style={styles.capturedSignature} />
                {checkoutSignatureTime && <Text style={styles.photoTimestamp}>Signed: {new Date(checkoutSignatureTime).toLocaleString()}</Text>}
                <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => removeSignature(setCheckoutSignatureUri, setCheckoutSignature)}>
                  <Text style={styles.photoRemoveBtnText}>X</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.signBox}
                onPress={() => openSignaturePad({ setUri: setCheckoutSignatureUri, setFlag: setCheckoutSignature, id: 'checkout' })}
              >
                <Text style={{ fontSize: 28, marginBottom: 4 }}>{"\u270D\uFE0F"}</Text>
                <Text style={styles.signBoxText}>Tap to Sign</Text>
              </TouchableOpacity>
            )}

            {/* Buttons */}
            <View style={ciStyles.btnRow}>
              <TouchableOpacity style={ciStyles.cancelBtn} onPress={() => setShowCheckoutModal(false)}>
                <Text style={[ciStyles.btnText, { color: "#666" }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ciStyles.confirmBtn, { backgroundColor: "#1565C0" }]} onPress={confirmCheckout}>
                <Text style={ciStyles.btnText}>Confirm Check-Out</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // ---------- CHECK-IN MODAL ----------
  const renderCheckinModal = () => (
    <Modal visible={showCheckinModal} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { padding: 0 }]}>
          {/* Header */}
          <View style={ciStyles.header}>
            <View>
              <Text style={ciStyles.headerTitle}>Check-In Tools</Text>
              <Text style={ciStyles.headerSub}>{form.name}</Text>
            </View>
            <TouchableOpacity style={ciStyles.closeBtn} onPress={() => setShowCheckinModal(false)}>
              <Text style={ciStyles.closeBtnText}>X</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ padding: 16 }}>
            {/* Order Info Card */}
            <View style={ciStyles.infoCard}>
              <View style={ciStyles.infoGrid}>
                <View style={ciStyles.infoItem}>
                  <Text style={ciStyles.infoLabel}>Customer</Text>
                  <Text style={ciStyles.infoValue}>{form.partner_name || "-"}</Text>
                </View>
                <View style={ciStyles.infoItem}>
                  <Text style={ciStyles.infoLabel}>Duration</Text>
                  <Text style={ciStyles.infoValue}>{form.rental_duration} {getPeriodLabel(form.rental_period_type, form.rental_duration)}(s)</Text>
                </View>
                <View style={ciStyles.infoItem}>
                  <Text style={ciStyles.infoLabel}>Check-Out</Text>
                  <Text style={ciStyles.infoValue}>{form.date_checkout || "-"}</Text>
                </View>
                <View style={ciStyles.infoItem}>
                  <Text style={ciStyles.infoLabel}>Check-In</Text>
                  <Text style={[ciStyles.infoValue, { color: "#4CAF50", fontWeight: "700" }]}>{new Date().toLocaleString()}</Text>
                </View>
              </View>
              {/* Duration display matching Odoo */}
              {(() => {
                const planned = parseInt(form.rental_duration) || 0;
                const extra = parseInt(lines[0]?.extra_days) || 0;
                const isLate = extra > 0;
                return (
                  <View style={ciStyles.durationRow}>
                    <Text style={ciStyles.infoLabel}>Total Duration</Text>
                    <Text style={[ciStyles.durationText, isLate && { color: "#E65100" }]}>
                      {planned} {planned === 1 ? (PERIOD_LABELS[form.rental_period_type] || "Day") : (({"day":"Days","week":"Weeks","month":"Months"})[form.rental_period_type] || "Days")}{isLate ? ` + ${extra} ${extra === 1 ? "Day" : "Days"} Extra` : ""}
                    </Text>
                  </View>
                );
              })()}
              {parseInt(lines[0]?.extra_days) > 0 && (
                <View style={ciStyles.lateWarning}>
                  <Text style={ciStyles.lateWarningText}>
                    Late Return — Customer has exceeded the planned rental duration. Late fees will apply.
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={ciStyles.depositRow}
                onPress={() => setCheckinReturnAdvance(!checkinReturnAdvance)}
              >
                <View style={[styles.checkbox, checkinReturnAdvance && styles.checkboxChecked]}>
                  {checkinReturnAdvance && <Text style={styles.checkMark}>{"\u2713"}</Text>}
                </View>
                <Text style={ciStyles.depositLabel}>Return Advance</Text>
                <Text style={ciStyles.depositAmt}>ر.ع.{parseFloat(form.advance_amount || 0).toFixed(3)}</Text>
              </TouchableOpacity>
            </View>

            {/* Tools Section */}
            <Text style={ciStyles.sectionTitle}>TOOLS ({lines.filter((_, i) => !checkinExcludedIdx.includes(i)).length} of {lines.length})</Text>
            {checkinExcludedIdx.filter((i) => !checkinAlreadyReturnedIdx.includes(i)).length > 0 && (
              <View style={{ backgroundColor: "#FFF8E1", borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: "#FFE082" }}>
                <Text style={{ color: "#F57F17", fontSize: 13, fontWeight: "600" }}>
                  Partial Return — {checkinExcludedIdx.filter((i) => !checkinAlreadyReturnedIdx.includes(i)).length} tool(s) skipped. They will remain as pending.
                </Text>
              </View>
            )}
            {lines.map((line, idx) => {
              if (checkinExcludedIdx.includes(idx)) return null;
              return (
              <View key={line.id} style={ciStyles.toolCard}>
                {/* Tool Header */}
                <View style={ciStyles.toolHeader}>
                  <View style={ciStyles.toolNumBadge}>
                    <Text style={ciStyles.toolNumText}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={ciStyles.toolName}>{line.tool_name || "Tool " + (idx + 1)}</Text>
                    {line.serial_number ? <Text style={ciStyles.toolSerial}>S/N: {line.serial_number}</Text> : null}
                  </View>
                  {lines.length > 1 && (
                    <TouchableOpacity
                      style={{ backgroundColor: "#FFEBEE", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "#EF9A9A" }}
                      onPress={() => {
                        Alert.alert(
                          "Remove from Check-In",
                          `Skip returning "${line.tool_name || "this tool"}" now? It will remain as pending.`,
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Remove", style: "destructive", onPress: () => removeFromCheckin(idx) },
                          ]
                        );
                      }}
                    >
                      <Text style={{ color: "#D32F2F", fontSize: 13, fontWeight: "700" }}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Pricing Info (matching checkout) */}
                <View style={coStyles.pricingRow}>
                  <View style={coStyles.pricingItem}>
                    <Text style={ciStyles.lateFeeLabel}>Price / {PERIOD_LABELS[form.rental_period_type] || "Day"}</Text>
                    <View style={ciStyles.readOnlyBox}>
                      <Text style={ciStyles.readOnlyText}>ر.ع.{parseFloat(line.unit_price || 0).toFixed(3)}</Text>
                    </View>
                  </View>
                  <View style={coStyles.pricingItem}>
                    <Text style={ciStyles.lateFeeLabel}>Duration</Text>
                    <View style={ciStyles.readOnlyBox}>
                      <Text style={ciStyles.readOnlyText}>{line.planned_duration || "1"} {getPeriodLabel(line.period_type || form.rental_period_type, line.planned_duration)}(s)</Text>
                    </View>
                  </View>
                  <View style={coStyles.pricingItem}>
                    <Text style={ciStyles.lateFeeLabel}>Total</Text>
                    <View style={[ciStyles.readOnlyBox, { backgroundColor: "#E8F5E9", borderColor: "#81C784" }]}>
                      <Text style={[ciStyles.readOnlyText, { color: "#2E7D32", fontWeight: "700" }]}>ر.ع.{calcLineTotal(line).toFixed(3)}</Text>
                    </View>
                  </View>
                  {parseFloat(line.tax_amount || 0) > 0 && (
                    <>
                      <View style={coStyles.pricingItem}>
                        <Text style={ciStyles.lateFeeLabel}>Tax %</Text>
                        <View style={ciStyles.readOnlyBox}>
                          <Text style={ciStyles.readOnlyText}>{parseFloat(line.tax_rate) > 0 ? line.tax_rate + '%' : (parseFloat(line.tax_amount) > 0 ? ((parseFloat(line.tax_amount) / (parseFloat(line.price_before_tax) || 1)) * 100).toFixed(1) + '%' : '5%')}</Text>
                        </View>
                      </View>
                      <View style={coStyles.pricingItem}>
                        <Text style={ciStyles.lateFeeLabel}>Tax Amt</Text>
                        <View style={[ciStyles.readOnlyBox, { backgroundColor: "#FFF3E0", borderColor: "#FFB74D" }]}>
                          <Text style={[ciStyles.readOnlyText, { color: "#E65100", fontWeight: "700" }]}>ر.ع.{parseFloat(line.tax_amount).toFixed(3)}</Text>
                        </View>
                      </View>
                    </>
                  )}
                </View>

                {/* Return Condition */}
                <View style={ciStyles.fieldBlock}>
                  <Text style={ciStyles.fieldLabel}>Return Condition <Text style={{ color: "#F44336" }}>*</Text></Text>
                  {renderConditionChips(line.checkin_condition, (v) => updateLine(idx, "checkin_condition", v))}
                </View>

                {/* Check-in Tool Photo (optional) */}
                <View style={ciStyles.fieldBlock}>
                  <Text style={ciStyles.fieldLabel}>Tool Photo (Check-In)</Text>
                  {toolCheckinPhotoUris[idx] ? (
                    <View style={styles.capturedImageWrap}>
                      <Image source={{ uri: toolCheckinPhotoUris[idx] }} style={styles.capturedImage} />
                      {toolCheckinPhotoTimestamps[idx] && <Text style={styles.photoTimestamp}>{toolCheckinPhotoTimestamps[idx]}</Text>}
                      <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => removeCheckinToolPhoto(idx)}>
                        <Text style={styles.photoRemoveBtnText}>X</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={coStyles.captureBtn} onPress={() => openCameraForCheckinToolPhoto(idx)}>
                      <Text style={{ fontSize: 22, marginBottom: 2 }}>{"\uD83D\uDCF7"}</Text>
                      <Text style={coStyles.captureBtnText}>Capture Check-In Photo</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Late Fee Section */}
                <View style={ciStyles.lateFeeSectionCard}>
                  <Text style={ciStyles.lateFeeTitle}>Late Fee</Text>
                  <View style={ciStyles.lateFeeGrid}>
                    <View style={ciStyles.lateFeeItem}>
                      <Text style={ciStyles.lateFeeLabel}>Fee / Day</Text>
                      <View style={ciStyles.readOnlyBox}>
                        <Text style={ciStyles.readOnlyText}>ر.ع.{parseFloat(line.late_fee_per_day || 0).toFixed(3)}</Text>
                      </View>
                    </View>
                    <View style={ciStyles.lateFeeItem}>
                      <Text style={ciStyles.lateFeeLabel}>Extra Days</Text>
                      <View style={[ciStyles.readOnlyBox, parseInt(line.extra_days) > 0 && { backgroundColor: "#FFF3E0", borderColor: "#FFB74D" }]}>
                        <Text style={[ciStyles.readOnlyText, parseInt(line.extra_days) > 0 && { color: "#E65100", fontWeight: "700" }]}>
                          {line.extra_days || "0"}
                        </Text>
                      </View>
                    </View>
                    <View style={ciStyles.lateFeeItem}>
                      <Text style={ciStyles.lateFeeLabel}>Total Late Fee</Text>
                      <View style={[ciStyles.readOnlyBox, parseFloat(line.late_fee_amount) > 0 && { backgroundColor: "#FFF3E0", borderColor: "#FFB74D" }]}>
                        <Text style={[ciStyles.readOnlyText, parseFloat(line.late_fee_amount) > 0 && { color: "#E65100", fontWeight: "700" }]}>
                          ر.ع.{parseFloat(line.late_fee_amount || 0).toFixed(3)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Damage Section */}
                <View style={ciStyles.fieldBlock}>
                  <Text style={ciStyles.damageTitle}>Damage</Text>
                  <View style={{ marginBottom: 8 }}>
                    <Text style={ciStyles.fieldLabel}>Damage Note</Text>
                    <RNTextInput
                      style={[ciStyles.editableInput, { minHeight: 40 }]}
                      placeholder="Describe any damage..."
                      value={line.damage_note || ""}
                      onChangeText={(t) => updateLine(idx, "damage_note", t)}
                      multiline
                    />
                  </View>
                  <View>
                    <Text style={ciStyles.fieldLabel}>Damage Charge (ر.ع.)</Text>
                    <RNTextInput
                      style={ciStyles.editableInput}
                      placeholder="0.00"
                      value={line.damage_charge && line.damage_charge !== "0" && line.damage_charge !== "0.00" ? line.damage_charge : ""}
                      onChangeText={(t) => updateLine(idx, "damage_charge", t)}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              </View>
              );
            })}

            {/* Payment Summary */}
            <View style={ciStyles.totalsCard}>
              <Text style={[ciStyles.sectionTitle, { marginBottom: 8, marginTop: 0 }]}>PAYMENT SUMMARY</Text>
              <View style={ciStyles.totalRow}>
                <Text style={ciStyles.totalLabel}>Rental Subtotal</Text>
                <Text style={ciStyles.totalValue}>ر.ع.{calcSubtotal().toFixed(3)}</Text>
              </View>
              {calcTaxTotal() > 0 && (
                <View style={ciStyles.totalRow}>
                  <Text style={ciStyles.totalLabel}>Tax</Text>
                  <Text style={ciStyles.totalValue}>ر.ع.{calcTaxTotal().toFixed(3)}</Text>
                </View>
              )}
              {calcLateFees() > 0 && (
                <View style={ciStyles.totalRow}>
                  <Text style={[ciStyles.totalLabel, { color: "#F44336" }]}>Late Fees</Text>
                  <Text style={[ciStyles.totalValue, { color: "#F44336" }]}>ر.ع.{calcLateFees().toFixed(3)}</Text>
                </View>
              )}
              {calcDamageCharges() > 0 && (
                <View style={ciStyles.totalRow}>
                  <Text style={[ciStyles.totalLabel, { color: "#F44336" }]}>Damage Charges</Text>
                  <Text style={[ciStyles.totalValue, { color: "#F44336" }]}>ر.ع.{calcDamageCharges().toFixed(3)}</Text>
                </View>
              )}
              {(parseFloat(form.discount_amount) || 0) > 0 && (
                <View style={ciStyles.totalRow}>
                  <Text style={[ciStyles.totalLabel, { color: "#4CAF50" }]}>Discount</Text>
                  <Text style={[ciStyles.totalValue, { color: "#4CAF50" }]}>-ر.ع.{(parseFloat(form.discount_amount) || 0).toFixed(3)}</Text>
                </View>
              )}
              <View style={{ borderTopWidth: 1, borderTopColor: "#ccc", marginVertical: 6 }} />
              <View style={ciStyles.totalRow}>
                <Text style={[ciStyles.totalLabel, { fontWeight: "700", fontSize: 14 }]}>TOTAL</Text>
                <Text style={[ciStyles.totalValue, { fontWeight: "700", fontSize: 14 }]}>ر.ع.{calcGrandTotal().toFixed(3)}</Text>
              </View>
              {(parseFloat(form.advance_amount) || 0) > 0 && !checkinReturnAdvance && (
                <View style={ciStyles.totalRow}>
                  <Text style={[ciStyles.totalLabel, { color: "#007bff" }]}>Advance Collected (-)</Text>
                  <Text style={[ciStyles.totalValue, { color: "#007bff" }]}>
                    -ر.ع.{(parseFloat(form.advance_amount) || 0).toFixed(3)}
                  </Text>
                </View>
              )}
              {(parseFloat(form.advance_amount) || 0) > 0 && checkinReturnAdvance && (
                <View style={ciStyles.totalRow}>
                  <Text style={[ciStyles.totalLabel, { color: "#999" }]}>Advance (Returned)</Text>
                  <Text style={[ciStyles.totalValue, { color: "#999" }]}>
                    ر.ع.{(parseFloat(form.advance_amount) || 0).toFixed(3)}
                  </Text>
                </View>
              )}
              <View style={{ borderTopWidth: 2, borderTopColor: "#333", marginVertical: 6 }} />
              <View style={ciStyles.totalRow}>
                <Text style={[ciStyles.totalLabel, { fontWeight: "800", fontSize: 15, color: "#2c3e50" }]}>AMOUNT DUE</Text>
                <Text style={[ciStyles.totalValue, { fontWeight: "800", fontSize: 15, color: "#2c3e50" }]}>
                  ر.ع.{calcCheckinAmountDue().toFixed(3)}
                </Text>
              </View>
            </View>

            {/* Payment Method — only show on full return */}
            {checkinExcludedIdx.filter((i) => !checkinAlreadyReturnedIdx.includes(i)).length === 0 && (
              <>
                <Text style={ciStyles.sectionTitle}>PAYMENT METHOD <Text style={{ color: "#F44336" }}>*</Text></Text>
                <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: "#e0e0e0" }}>
                  <View style={styles.chipRow}>
                    {[{ label: "Cash", value: "cash" }, { label: "Card", value: "card" }, { label: "Bank", value: "bank" }, { label: "Credit", value: "credit" }].map((pm) => (
                      <TouchableOpacity
                        key={pm.value}
                        style={[styles.condChip, form.checkin_payment_method === pm.value && styles.condChipActive]}
                        onPress={() => handleChange("checkin_payment_method", pm.value)}
                      >
                        <Text style={[styles.condChipText, form.checkin_payment_method === pm.value && styles.condChipTextActive]}>
                          {pm.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Cash Received (only for cash payment) */}
                {form.checkin_payment_method === "cash" && (
                  <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: "#e0e0e0" }}>
                    <Text style={ciStyles.fieldLabel}>Cash Received (ر.ع.)</Text>
                    <RNTextInput
                      style={[styles.input, { borderWidth: 1, borderColor: "#e0e0e0", borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: "#f9f9f9" }]}
                      placeholder="0.000"
                      value={form.checkin_cash_received}
                      onChangeText={(t) => handleChange("checkin_cash_received", t)}
                      keyboardType="decimal-pad"
                    />
                    {parseFloat(form.checkin_cash_received || 0) > 0 && (
                      <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={ciStyles.fieldLabel}>Balance to Return</Text>
                        <Text style={{ fontSize: 16, fontWeight: "700", color: calcCheckinCashBalance() >= 0 ? "#4CAF50" : "#F44336" }}>
                          ر.ع.{calcCheckinCashBalance().toFixed(3)}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </>
            )}

            {/* Customer Signature */}
            <Text style={ciStyles.sectionTitle}>CUSTOMER SIGNATURE <Text style={{ color: "#F44336" }}>*</Text></Text>
            {checkinSignatureUri ? (
              <View style={styles.capturedImageWrap}>
                <Image source={{ uri: checkinSignatureUri }} style={styles.capturedSignature} />
                {checkinSignatureTime && <Text style={styles.photoTimestamp}>Signed: {new Date(checkinSignatureTime).toLocaleString()}</Text>}
                <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => removeSignature(setCheckinSignatureUri, setCheckinSignature)}>
                  <Text style={styles.photoRemoveBtnText}>X</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.signBox}
                onPress={() => openSignaturePad({ setUri: setCheckinSignatureUri, setFlag: setCheckinSignature, id: 'checkin_customer' })}
              >
                <Text style={{ fontSize: 28, marginBottom: 4 }}>{"\u270D\uFE0F"}</Text>
                <Text style={styles.signBoxText}>Tap to Sign</Text>
              </TouchableOpacity>
            )}

            {/* Authority Signature */}
            <Text style={ciStyles.sectionTitle}>AUTHORITY SIGNATURE <Text style={{ color: "#F44336" }}>*</Text></Text>
            <View style={{ marginBottom: 10 }}>
              <Text style={ciStyles.fieldLabel}>Signer Name <Text style={{ color: "#F44336" }}>*</Text></Text>
              <RNTextInput
                style={ciStyles.editableInput}
                placeholder="Authority name"
                value={checkinSignerName}
                onChangeText={setCheckinSignerName}
              />
            </View>
            {checkinAuthoritySignatureUri ? (
              <View style={styles.capturedImageWrap}>
                <Image source={{ uri: checkinAuthoritySignatureUri }} style={styles.capturedSignature} />
                {checkinAuthoritySignatureTime && <Text style={styles.photoTimestamp}>Signed: {new Date(checkinAuthoritySignatureTime).toLocaleString()}</Text>}
                <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => removeSignature(setCheckinAuthoritySignatureUri, setCheckinAuthoritySignature)}>
                  <Text style={styles.photoRemoveBtnText}>X</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.signBox}
                onPress={() => openSignaturePad({ setUri: setCheckinAuthoritySignatureUri, setFlag: setCheckinAuthoritySignature, id: 'checkin_authority' })}
              >
                <Text style={{ fontSize: 28, marginBottom: 4 }}>{"\u270D\uFE0F"}</Text>
                <Text style={styles.signBoxText}>Tap to Sign</Text>
              </TouchableOpacity>
            )}

            {/* Buttons */}
            <View style={ciStyles.btnRow}>
              <TouchableOpacity style={ciStyles.cancelBtn} onPress={() => setShowCheckinModal(false)}>
                <Text style={[ciStyles.btnText, { color: "#666" }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ciStyles.confirmBtn, checkinExcludedIdx.filter((i) => !checkinAlreadyReturnedIdx.includes(i)).length > 0 && { backgroundColor: "#FF8F00" }]} onPress={confirmCheckin}>
                <Text style={ciStyles.btnText}>{checkinExcludedIdx.filter((i) => !checkinAlreadyReturnedIdx.includes(i)).length > 0 ? "Save Partial Return" : "Confirm Check-In"}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // ========== DISCOUNT MODAL ==========
  const discountGoNext = async () => {
    if (!discountAuthName.trim()) {
      Alert.alert("Required", "Authorized person name is required");
      return;
    }
    if (!discountAuthSignatureUri) {
      Alert.alert("Required", "Authorized person signature is required");
      return;
    }
    if (!discountAuthPhotoUri) {
      Alert.alert("Required", "Authorized person photo is required");
      return;
    }
    // Mark authorized for this visit so changing discount skips auth page
    discountAuthorizedThisVisit.current = true;
    setDiscountPage(2);
  };

  const updateDiscountLine = (idx, field, value) => {
    setDiscountLines((prev) => prev.map((dl, i) => i === idx ? { ...dl, [field]: value } : dl));
  };

  const calcDiscountLineAmt = (dl) => {
    const base = dl.rental_cost + dl.late_fee + dl.damage_charge;
    const val = parseFloat(dl.discount_value) || 0;
    if (dl.discount_type === "percentage") {
      return Math.min(base, base * val / 100);
    }
    return Math.min(base, val);
  };

  // Distribute total discount proportionally to all lines (matches Odoo _apply_total_discount_to_lines)
  const applyTotalDiscountToLines = (type, value) => {
    const val = parseFloat(value) || 0;
    if (val <= 0) {
      setDiscountLines((prev) => prev.map((dl) => ({ ...dl, discount_type: "percentage", discount_value: "" })));
      return;
    }
    if (type === "percentage") {
      const clamped = Math.min(val, 100);
      setDiscountLines((prev) => prev.map((dl) => ({ ...dl, discount_type: "percentage", discount_value: String(clamped) })));
    } else {
      // Fixed: distribute proportionally based on each line's base cost
      const grandTotal = discountLines.reduce((s, dl) => s + dl.rental_cost + dl.late_fee + dl.damage_charge, 0);
      if (grandTotal <= 0) return;
      const clampedVal = Math.min(val, grandTotal);
      setDiscountLines((prev) => prev.map((dl) => {
        const base = dl.rental_cost + dl.late_fee + dl.damage_charge;
        const ratio = base / grandTotal;
        const lineFixed = Math.round(clampedVal * ratio * 100) / 100;
        return { ...dl, discount_type: "fixed", discount_value: String(lineFixed) };
      }));
    }
  };

  const handleDiscountModeChange = (mode) => {
    setDiscountMode(mode);
    setTotalDiscountType("percentage");
    setTotalDiscountValue("");
    // Reset all line discounts when changing mode
    setDiscountLines((prev) => prev.map((dl) => ({ ...dl, discount_type: "percentage", discount_value: "" })));
  };

  const handleTotalDiscountChange = (field, value) => {
    if (field === "type") {
      setTotalDiscountType(value);
      setTotalDiscountValue("");
      // Reset lines
      setDiscountLines((prev) => prev.map((dl) => ({ ...dl, discount_type: "percentage", discount_value: "" })));
    } else {
      setTotalDiscountValue(value);
      applyTotalDiscountToLines(totalDiscountType, value);
    }
  };

  const applyDiscount = async () => {
    let totalDiscount = 0;
    for (let i = 0; i < discountLines.length; i++) {
      const dl = discountLines[i];
      const val = parseFloat(dl.discount_value) || 0;
      if (val < 0) {
        Alert.alert("Invalid", "Discount value cannot be negative");
        return;
      }
      if (dl.discount_type === "percentage" && val > 100) {
        Alert.alert("Invalid", "Percentage cannot exceed 100%");
        return;
      }
      const base = dl.rental_cost + dl.late_fee + dl.damage_charge;
      const discAmt = calcDiscountLineAmt(dl);
      if (dl.discount_type === "fixed" && val > base) {
        Alert.alert("Invalid", `Discount (ر.ع.${val.toFixed(3)}) for "${dl.tool_name}" exceeds its total (ر.ع.${base.toFixed(3)}). Discount cannot be more than the original amount.`);
        return;
      }
      totalDiscount += discAmt;
    }
    if (totalDiscount <= 0) {
      Alert.alert("Invalid", "Enter discount for at least one line");
      return;
    }
    const grandBase = discountLines.reduce((s, dl) => s + dl.rental_cost + dl.late_fee + dl.damage_charge, 0);
    if (totalDiscount > grandBase) {
      Alert.alert("Invalid", `Total discount (ر.ع.${totalDiscount.toFixed(3)}) exceeds the total amount (ر.ع.${grandBase.toFixed(3)}). Discount cannot be more than the original amount.`);
      return;
    }
    // Apply locally and close modal immediately for snappy UI
    setForm((prev) => ({ ...prev, discount_amount: totalDiscount.toFixed(3) }));
    setLines((prev) => prev.map((l, idx) => {
      const dl = discountLines[idx];
      if (!dl) return l;
      return { ...l, discount_type: dl.discount_type, discount_value: dl.discount_value, discount_line_amount: calcDiscountLineAmt(dl) };
    }));
    setShowDiscountModal(false);
    showToastMessage("Applying discount...");

    // Save in background
    (async () => {
      if (odooOrderId && odooAuth) {
        try {
          const [sigB64, photoB64] = await Promise.all([
            uriToBase64(discountAuthSignatureUri),
            uriToBase64(discountAuthPhotoUri),
          ]);
          const discountVals = { discount_amount: totalDiscount };
          if (discountAuthName.trim()) discountVals.discount_authorized_by = discountAuthName.trim();
          if (sigB64) discountVals.discount_auth_signature = sigB64;
          if (photoB64) discountVals.discount_auth_photo = photoB64;
          await updateOrderValues(odooAuth, odooOrderId, discountVals);
          await Promise.all(discountLines.map((dl, i) => {
            const lineOdooId = lines[i]?.odoo_id;
            if (!lineOdooId || !dl.discount_type || !dl.discount_value) return null;
            return updateOrderLineValues(odooAuth, lineOdooId, {
              discount_type: dl.discount_type,
              discount_value: parseFloat(dl.discount_value) || 0,
            });
          }).filter(Boolean));
          showToastMessage("Discount applied: ر.ع." + totalDiscount.toFixed(3));
        } catch (e) {
          console.warn("Failed to save discount data:", e.message);
          showToastMessage("Failed to save discount: " + e.message);
        }
      } else {
        showToastMessage("Discount applied");
      }
    })();
  };

  const removeDiscount = async () => {
    setForm((prev) => ({ ...prev, discount_amount: "0" }));
    setLines((prev) => prev.map((l) => ({ ...l, discount_type: "", discount_value: "0" })));
    // Also clear in Odoo
    if (odooOrderId && odooAuth) {
      try {
        await Promise.all([
          updateOrderValues(odooAuth, odooOrderId, { discount_amount: 0 }),
          ...lines.filter((l) => l.odoo_id).map((l) =>
            updateOrderLineValues(odooAuth, l.odoo_id, { discount_type: false, discount_value: 0 })
          ),
        ]);
      } catch (e) {
        console.warn("Failed to clear discount in Odoo:", e.message);
      }
    }
    setShowDiscountModal(false);
    showToastMessage("Discount removed");
  };

  const renderDiscountModal = () => (
    <Modal visible={showDiscountModal} animationType="slide" transparent onRequestClose={() => setShowDiscountModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { maxHeight: "90%" }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {discountPage === 1 ? "Discount - Authorization" : "Discount - Apply"}
              </Text>
              <TouchableOpacity onPress={() => setShowDiscountModal(false)}>
                <Text style={styles.modalClose}>X</Text>
              </TouchableOpacity>
            </View>

            {/* Step indicator */}
            <View style={{ flexDirection: "row", marginBottom: 16 }}>
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: "#FF9800", marginRight: 4 }} />
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: discountPage === 2 ? "#FF9800" : "#e0e0e0", marginLeft: 4 }} />
            </View>

            {discountPage === 1 ? (
              <>
                {/* PAGE 1 - Authorization */}
                <Text style={styles.modalSection}>AUTHORIZATION DETAILS</Text>

                {/* Authorized Person Name */}
                <Text style={styles.modalFieldLabel}>Authorized Person Name *</Text>
                <RNTextInput
                  placeholder="Enter authorized person name"
                  placeholderTextColor="#bbb"
                  value={discountAuthName}
                  onChangeText={setDiscountAuthName}
                  style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: "#333", backgroundColor: "#fafafa", marginBottom: 16 }}
                />

                {/* Authorized Signature */}
                <Text style={styles.modalFieldLabel}>Authorized Signature *</Text>
                {discountAuthSignatureUri ? (
                  <View style={styles.capturedImageWrap}>
                    <Image source={{ uri: discountAuthSignatureUri }} style={styles.capturedSignature} />
                    {discountAuthSignatureTime && <Text style={styles.photoTimestamp}>Signed: {new Date(discountAuthSignatureTime).toLocaleString()}</Text>}
                    <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => setDiscountAuthSignatureUri(null)}>
                      <Text style={styles.photoRemoveBtnText}>X</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{ borderWidth: 1.5, borderColor: "#FF9800", borderStyle: "dashed", borderRadius: 8, paddingVertical: 28, alignItems: "center", marginBottom: 16, backgroundColor: "#FFF8E1" }}
                    onPress={() => openSignaturePad({ setUri: setDiscountAuthSignatureUri, setFlag: () => { }, id: 'discount_auth' })}
                  >
                    <Text style={{ fontSize: 22 }}>&#9997;</Text>
                    <Text style={{ color: "#FF9800", fontWeight: "600", marginTop: 4 }}>Tap to Sign</Text>
                  </TouchableOpacity>
                )}

                {/* Authorized Photo */}
                <Text style={styles.modalFieldLabel}>Authorized Person Photo *</Text>
                {discountAuthPhotoUri ? (
                  <View style={styles.capturedImageWrap}>
                    <Image source={{ uri: discountAuthPhotoUri }} style={styles.capturedImage} />
                    {discountAuthPhotoTime && <Text style={styles.photoTimestamp}>Captured: {discountAuthPhotoTime}</Text>}
                    <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => setDiscountAuthPhotoUri(null)}>
                      <Text style={styles.photoRemoveBtnText}>X</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", marginBottom: 16 }}>
                    <TouchableOpacity
                      style={{ flex: 1, borderWidth: 1.5, borderColor: "#FF9800", borderRadius: 8, paddingVertical: 14, alignItems: "center", backgroundColor: "#FFF8E1", marginRight: 8 }}
                      onPress={() => openCamera((uri) => {
                        setDiscountAuthPhotoUri(uri);
                        setDiscountAuthPhotoTime(new Date().toLocaleString());
                      })}
                    >
                      <Text style={{ fontSize: 18 }}>&#128247;</Text>
                      <Text style={{ color: "#FF9800", fontWeight: "600", marginTop: 2, fontSize: 13 }}>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, borderWidth: 1.5, borderColor: "#FF9800", borderRadius: 8, paddingVertical: 14, alignItems: "center", backgroundColor: "#FFF8E1" }}
                      onPress={async () => {
                        try {
                          const res = await DocumentPicker.getDocumentAsync({ type: "image/*" });
                          if (!res.canceled && res.assets?.[0]) {
                            setDiscountAuthPhotoUri(res.assets[0].uri);
                            setDiscountAuthPhotoTime(new Date().toLocaleString());
                          }
                        } catch (_) { }
                      }}
                    >
                      <Text style={{ fontSize: 18 }}>&#128206;</Text>
                      <Text style={{ color: "#FF9800", fontWeight: "600", marginTop: 2, fontSize: 13 }}>Attach</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Next Button */}
                <View style={styles.modalBtnRow}>
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: "#9E9E9E" }]} onPress={() => setShowDiscountModal(false)}>
                    <Text style={styles.modalBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: "#FF9800" }]} onPress={discountGoNext}>
                    <Text style={styles.modalBtnText}>Next</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {/* PAGE 2 - Discount Entry */}
                {/* Auth Info Card */}
                <View style={{ backgroundColor: "#FFF8E1", padding: 12, borderRadius: 8, marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <View>
                      <Text style={{ fontSize: 11, color: "#888" }}>Authorized By</Text>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#333" }}>{discountAuthName}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 11, color: "#888" }}>Subtotal</Text>
                      <Text style={{ fontSize: 16, fontWeight: "800", color: "#333" }}>ر.ع.{calcSubtotal().toFixed(3)}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setDiscountPage(1)} style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: "#E65100", fontWeight: "600" }}>Edit Authorization Details</Text>
                  </TouchableOpacity>
                </View>

                {/* Discount Mode Selector (only when multiple lines) */}
                {discountLines.length > 1 && (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={{ fontSize: 12, color: "#888", fontWeight: "600", marginBottom: 6 }}>CHOOSE DISCOUNT METHOD</Text>
                    <View style={{ flexDirection: "row", backgroundColor: "#f0f0f0", borderRadius: 8, padding: 3 }}>
                      <TouchableOpacity
                        onPress={() => handleDiscountModeChange("total")}
                        style={{ flex: 1, paddingVertical: 9, borderRadius: 6, alignItems: "center", backgroundColor: discountMode === "total" ? "#FF9800" : "transparent" }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "700", color: discountMode === "total" ? "#fff" : "#666" }}>Total Discount</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDiscountModeChange("separate")}
                        style={{ flex: 1, paddingVertical: 9, borderRadius: 6, alignItems: "center", backgroundColor: discountMode === "separate" ? "#FF9800" : "transparent" }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "700", color: discountMode === "separate" ? "#fff" : "#666" }}>Per Product</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* TOTAL MODE: Single discount input distributed to all lines */}
                {discountMode === "total" && discountLines.length > 1 && (() => {
                  const grandBase = discountLines.reduce((s, dl) => s + dl.rental_cost + dl.late_fee + dl.damage_charge, 0);
                  const totalVal = parseFloat(totalDiscountValue) || 0;
                  const totalExceeds = totalDiscountType === "fixed" ? totalVal > grandBase : totalVal > 100;
                  return (
                  <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: totalExceeds ? "#F44336" : "#FFE0B2", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#E65100", marginBottom: 10 }}>TOTAL PRODUCT DISCOUNT</Text>

                    {/* Type Toggle */}
                    <View style={{ flexDirection: "row", backgroundColor: "#f0f0f0", borderRadius: 8, padding: 3, marginBottom: 10 }}>
                      <TouchableOpacity
                        onPress={() => handleTotalDiscountChange("type", "percentage")}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 6, alignItems: "center", backgroundColor: totalDiscountType === "percentage" ? "#FF9800" : "transparent" }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "700", color: totalDiscountType === "percentage" ? "#fff" : "#666" }}>Percentage %</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleTotalDiscountChange("type", "fixed")}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 6, alignItems: "center", backgroundColor: totalDiscountType === "fixed" ? "#FF9800" : "transparent" }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "700", color: totalDiscountType === "fixed" ? "#fff" : "#666" }}>Fixed ر.ع.</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Value Input */}
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: totalExceeds ? "#F44336" : "#ddd", borderRadius: 8, backgroundColor: totalExceeds ? "#FFF0F0" : "#fafafa" }}>
                        <View style={{ paddingHorizontal: 10, paddingVertical: 8, backgroundColor: totalExceeds ? "#FFCDD2" : "#FFF3E0", borderTopLeftRadius: 7, borderBottomLeftRadius: 7 }}>
                          <Text style={{ fontSize: 14, fontWeight: "700", color: totalExceeds ? "#F44336" : "#FF9800" }}>{totalDiscountType === "percentage" ? "%" : "ر.ع."}</Text>
                        </View>
                        <RNTextInput
                          placeholder="0"
                          placeholderTextColor="#ccc"
                          value={totalDiscountValue}
                          onChangeText={(t) => handleTotalDiscountChange("value", t)}
                          keyboardType="decimal-pad"
                          style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: totalExceeds ? "#F44336" : "#333" }}
                        />
                      </View>
                      <View style={{ marginLeft: 10, alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 11, color: "#888" }}>Total Discount</Text>
                        <Text style={{ fontSize: 15, fontWeight: "700", color: "#F44336" }}>
                          -ر.ع.{discountLines.reduce((sum, dl) => sum + calcDiscountLineAmt(dl), 0).toFixed(3)}
                        </Text>
                      </View>
                    </View>
                    {totalExceeds && (
                      <Text style={{ fontSize: 11, color: "#F44336", fontWeight: "600", marginTop: 6 }}>
                        Discount exceeds total amount (ر.ع.{grandBase.toFixed(3)}). Must be less than original amount.
                      </Text>
                    )}
                  </View>
                  );
                })()}

                {/* Line Breakdown (always shown - readonly in total mode, editable in separate mode) */}
                <Text style={styles.modalSection}>
                  {discountMode === "total" && discountLines.length > 1 ? "DISCOUNT BREAKDOWN" : "TOOL DISCOUNTS"}
                </Text>

                {discountLines.map((dl, idx) => {
                  const lineTotal = dl.rental_cost + dl.late_fee + dl.damage_charge;
                  const discAmt = calcDiscountLineAmt(dl);
                  const isTotalMode = discountMode === "total" && discountLines.length > 1;
                  const dlVal = parseFloat(dl.discount_value) || 0;
                  const lineExceeds = dl.discount_type === "fixed" ? dlVal > lineTotal : dlVal > 100;
                  return (
                    <View key={idx} style={[styles.modalToolCard, { marginBottom: 12 }]}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: "#333", flex: 1 }}>{dl.tool_name}</Text>
                        <Text style={{ fontSize: 12, color: "#888" }}>S/N: {dl.serial_number}</Text>
                      </View>

                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                        <Text style={{ fontSize: 12, color: "#666" }}>Rental: ر.ع.{dl.rental_cost.toFixed(3)}</Text>
                        {dl.late_fee > 0 && <Text style={{ fontSize: 12, color: "#666" }}>Late: ر.ع.{dl.late_fee.toFixed(3)}</Text>}
                        {dl.damage_charge > 0 && <Text style={{ fontSize: 12, color: "#666" }}>Damage: ر.ع.{dl.damage_charge.toFixed(3)}</Text>}
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#333" }}>Total: ر.ع.{lineTotal.toFixed(3)}</Text>
                      </View>

                      {isTotalMode ? (
                        /* Total mode: show readonly breakdown per line */
                        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 6, borderTopWidth: 1, borderTopColor: "#eee" }}>
                          <Text style={{ fontSize: 12, color: "#666" }}>
                            Discount: {dl.discount_type === "percentage" ? (dl.discount_value || "0") + "%" : "ر.ع." + (parseFloat(dl.discount_value) || 0).toFixed(3)}
                          </Text>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: discAmt > 0 ? "#F44336" : "#999" }}>-ر.ع.{discAmt.toFixed(3)}</Text>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: "#333" }}>Final: ر.ع.{(lineTotal - discAmt).toFixed(3)}</Text>
                        </View>
                      ) : (
                        <>
                          {/* Separate mode: editable per-line discount */}
                          <View style={{ flexDirection: "row", backgroundColor: "#f0f0f0", borderRadius: 8, padding: 3, marginBottom: 8 }}>
                            <TouchableOpacity
                              onPress={() => updateDiscountLine(idx, "discount_type", "percentage")}
                              style={{ flex: 1, paddingVertical: 7, borderRadius: 6, alignItems: "center", backgroundColor: dl.discount_type === "percentage" ? "#FF9800" : "transparent" }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: "700", color: dl.discount_type === "percentage" ? "#fff" : "#666" }}>Percentage %</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => updateDiscountLine(idx, "discount_type", "fixed")}
                              style={{ flex: 1, paddingVertical: 7, borderRadius: 6, alignItems: "center", backgroundColor: dl.discount_type === "fixed" ? "#FF9800" : "transparent" }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: "700", color: dl.discount_type === "fixed" ? "#fff" : "#666" }}>Fixed ر.ع.</Text>
                            </TouchableOpacity>
                          </View>

                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: lineExceeds ? "#F44336" : "#ddd", borderRadius: 8, backgroundColor: lineExceeds ? "#FFF0F0" : "#fafafa" }}>
                              <View style={{ paddingHorizontal: 10, paddingVertical: 8, backgroundColor: lineExceeds ? "#FFCDD2" : "#FFF3E0", borderTopLeftRadius: 7, borderBottomLeftRadius: 7 }}>
                                <Text style={{ fontSize: 14, fontWeight: "700", color: lineExceeds ? "#F44336" : "#FF9800" }}>{dl.discount_type === "percentage" ? "%" : "ر.ع."}</Text>
                              </View>
                              <RNTextInput
                                placeholder="0"
                                placeholderTextColor="#ccc"
                                value={dl.discount_value && dl.discount_value !== "0" && dl.discount_value !== "0.00" ? dl.discount_value : ""}
                                onChangeText={(t) => updateDiscountLine(idx, "discount_value", t)}
                                keyboardType="decimal-pad"
                                style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: lineExceeds ? "#F44336" : "#333" }}
                              />
                            </View>
                            <View style={{ marginLeft: 10, alignItems: "flex-end" }}>
                              <Text style={{ fontSize: 11, color: "#888" }}>Discount</Text>
                              <Text style={{ fontSize: 15, fontWeight: "700", color: discAmt > 0 ? "#F44336" : "#999" }}>-ر.ع.{discAmt.toFixed(3)}</Text>
                              <Text style={{ fontSize: 11, color: "#4CAF50" }}>Final: ر.ع.{(lineTotal - discAmt).toFixed(3)}</Text>
                            </View>
                          </View>
                          {lineExceeds && (
                            <Text style={{ fontSize: 11, color: "#F44336", fontWeight: "600", marginTop: 4 }}>
                              Discount exceeds total (ر.ع.{lineTotal.toFixed(3)}). Must be less than original amount.
                            </Text>
                          )}
                        </>
                      )}
                    </View>
                  );
                })}

                {/* Total Discount Summary */}
                <View style={{ backgroundColor: "#FFF3E0", padding: 12, borderRadius: 8, flexDirection: "row", justifyContent: "space-between", marginTop: 4, marginBottom: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#333" }}>Total Discount</Text>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: "#F44336" }}>
                    -ر.ع.{discountLines.reduce((sum, dl) => sum + calcDiscountLineAmt(dl), 0).toFixed(3)}
                  </Text>
                </View>

                {/* Buttons */}
                <View style={styles.modalBtnRow}>
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: "#9E9E9E" }]} onPress={() => {
                    if (discountAuthorizedThisVisit.current) { setShowDiscountModal(false); } else { setDiscountPage(1); }
                  }}>
                    <Text style={styles.modalBtnText}>{discountAuthorizedThisVisit.current ? "Cancel" : "Back"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: "#4CAF50" }]} onPress={applyDiscount}>
                    <Text style={styles.modalBtnText}>Apply Discount</Text>
                  </TouchableOpacity>
                </View>
                {parseFloat(form.discount_amount) > 0 && (
                  <TouchableOpacity
                    onPress={removeDiscount}
                    style={{ borderWidth: 1.5, borderColor: "#F44336", borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 8 }}
                  >
                    <Text style={{ color: "#F44336", fontSize: 14, fontWeight: "700" }}>Remove Existing Discount</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // ========== MAIN RENDER ==========
  return (
    <SafeAreaView>
      <NavigationHeader
        title={form.name === "New" ? "New Rental Order" : form.name}
        navigation={navigation}
      />
      <RoundedContainer>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ACTION BUTTONS */}
          {renderActionButtons()}

          {/* STATUS BREADCRUMB */}
          {renderStatusBreadcrumb()}

          {/* ========= CUSTOMER SECTION ========= */}
          <View style={styles.sectionCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={[styles.sectionCardTitle, { marginBottom: 0 }]}>CUSTOMER</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 10, color: "#aaa", fontWeight: "600" }}>Order Date:</Text>
                <Text style={{ fontSize: 13, color: "#555", fontWeight: "600", marginTop: 1 }}>{form.date_order}</Text>
              </View>
            </View>

            <View style={[styles.fieldGroup, { zIndex: 10 }]}>
              <Text style={styles.inputLabel}>Customer *</Text>
              {form.partner_id && !showCustomerDropdown ? (
                <View style={styles.selectedCustomerRow}>
                  <View style={styles.selectedCustomerInfo}>
                    <Text style={styles.selectedCustomerName} numberOfLines={1}>{form.partner_name}</Text>
                    {form.partner_phone ? <Text style={styles.selectedCustomerSub} numberOfLines={1}>{form.partner_phone.startsWith("+") ? form.partner_phone : countryCode + " " + form.partner_phone}</Text> : null}
                    {form.partner_email ? <Text style={styles.selectedCustomerSub} numberOfLines={1}>{form.partner_email}</Text> : null}
                  </View>
                  {isEditable && (
                    <TouchableOpacity onPress={clearCustomer} style={styles.clearBtn}>
                      <Text style={styles.clearBtnText}>X</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <TextInput
                  placeholder="Search customer..."
                  value={form.partner_name}
                  onChangeText={(t) => {
                    handleChange("partner_name", t);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => form.partner_name.length > 0 && setShowCustomerDropdown(true)}
                  editable={isEditable}
                  column
                />
              )}
              {errors.partner_name && <Text style={styles.errorText}>{errors.partner_name}</Text>}
              {showCustomerDropdown && form.partner_name.trim().length > 0 && (
                <ScrollView style={styles.dropdown} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {filteredCustomers.map((c) => (
                    <TouchableOpacity key={c.id} style={styles.dropdownItem} onPress={() => selectCustomer(c)}>
                      <Text style={styles.dropdownItemName}>{c.name}</Text>
                      <Text style={styles.dropdownItemSub} numberOfLines={1}>
                        {c.phone ? c.phone : ""}{c.email ? " \u2022 " + c.email : ""}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {/* Always offer Create New option at the bottom if enough chars typed */}
                  {state === "draft" && form.partner_name.trim().length > 2 && (
                    <TouchableOpacity
                      onPress={ensurePartnerId}
                      style={[styles.dropdownItem, { backgroundColor: "#f0f7ff", borderTopWidth: 1, borderTopColor: "#d0e0ff" }]}
                    >
                      <Text style={[styles.dropdownItemName, { color: "#1565C0" }]}>+ Create New "{form.partner_name}"</Text>
                      <Text style={styles.dropdownItemSub}>Create a new entry with this name</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              )}
              {state === "draft" && showCustomerDropdown && form.partner_name.trim().length > 0 && filteredCustomers.length === 0 && (
                <View style={styles.dropdown}>
                  <Text style={styles.dropdownEmpty}>No customers found</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowCustomerDropdown(false);
                      ensurePartnerId();
                    }}
                    style={{
                      backgroundColor: "#E3F2FD",
                      padding: 10,
                      borderRadius: 6,
                      alignItems: "center",
                      marginTop: 5,
                      borderWidth: 1,
                      borderColor: "#1565C0"
                    }}
                  >
                    <Text style={{ color: "#1565C0", fontWeight: "700", fontSize: 13 }}>+ Create "{form.partner_name}"</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>


            {/* FORCE CREATE BUTTON */}
            {state === "draft" && !form.partner_id && form.partner_name.trim().length > 2 && (
              <TouchableOpacity
                onPress={ensurePartnerId}
                style={{
                  backgroundColor: "#2196F3",
                  borderRadius: 8,
                  paddingVertical: 14,
                  alignItems: "center",
                  marginTop: 4,
                  marginBottom: 12,
                  elevation: 4,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ fontSize: 18, color: "#fff", marginRight: 8 }}>{"\uD83D\uDC64"}</Text>
                  <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>
                    CREATE NEW CUSTOMER
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            {/* Phone with Country Code */}
            <View style={{ marginBottom: 3 }}>
              <Text style={{ fontSize: 16, color: "#1565C0", fontWeight: "600", marginVertical: 5 }}>Phone</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <TouchableOpacity
                  onPress={() => isEditable && setShowCountryPicker(true)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "white",
                    borderWidth: 0.8,
                    borderColor: "#BBB7B7",
                    borderRadius: 6,
                    height: 38,
                    paddingHorizontal: 12,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#333" }}>{countryCode}</Text>
                  <Text style={{ fontSize: 9, color: "#888", marginLeft: 5 }}>{"\u25BC"}</Text>
                </TouchableOpacity>
                <View style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "white",
                  borderWidth: 0.8,
                  borderColor: "#BBB7B7",
                  borderRadius: 6,
                  height: 38,
                  paddingHorizontal: 15,
                }}>
                  <RNTextInput
                    placeholder={`Phone number (${getPhoneLength(countryCode)} digits)`}
                    placeholderTextColor="#666666"
                    value={form.partner_phone}
                    onChangeText={(t) => handleChange("partner_phone", t)}
                    keyboardType="phone-pad"
                    editable={isEditable}
                    style={{ flex: 1, color: "#000", fontSize: 14 }}
                  />
                </View>
              </View>
              {phoneError && <Text style={styles.errorText}>{phoneError}</Text>}
            </View>

            {/* Email */}
            <View style={{ marginBottom: 8 }}>
              <TextInput
                label="Email"
                placeholder="Email address"
                value={form.partner_email}
                onChangeText={(t) => handleChange("partner_email", t)}
                keyboardType="email-address"
                editable={isEditable}
                column
              />
              {emailError && <Text style={styles.errorText}>{emailError}</Text>}
              {(() => {
                const email = form.partner_email || "";
                if (!email.length) return null;
                const username = email.split("@")[0];
                if (!username) return null;
                const typoSuggestion = getEmailSuggestion(email);
                const gmailFull = username + "@gmail.com";
                const suggestion = typoSuggestion || (email !== gmailFull ? gmailFull : null);
                if (!suggestion) return null;
                return (
                  <TouchableOpacity
                    onPress={() => handleChange("partner_email", suggestion)}
                    style={{ backgroundColor: "#1565C0", borderRadius: 6, paddingVertical: 8, paddingHorizontal: 14, marginTop: 6, alignSelf: "flex-start" }}
                  >
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Use {suggestion}</Text>
                  </TouchableOpacity>
                );
              })()}
            </View>

            {form.customer_id ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Customer ID</Text>
                <Text style={styles.infoValue}>{form.customer_id}</Text>
              </View>
            ) : null}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Responsible</Text>
              <Text style={styles.infoValue}>{form.responsible}</Text>
            </View>
          </View>


          {/* ========= CHECK-OUT / CHECK-IN SECTION ========= */}
          {(state === "checked_out" || state === "checked_in" || state === "done" || state === "invoiced") && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionCardTitle}>CHECK-OUT / CHECK-IN</Text>
              <View style={styles.row2Col}>
                <View style={styles.colHalf}>
                  <Text style={styles.infoLabel}>Actual Check-Out</Text>
                  <Text style={[styles.infoValue, { marginTop: 2, color: "#1565C0" }]}>{form.date_checkout || "-"}</Text>
                  {formatTime(form.date_checkout_raw || form.date_checkout) ? (
                    <Text style={[styles.infoValue, { marginTop: 1, color: "#1565C0", fontSize: 13, fontWeight: "700" }]}>{formatTime(form.date_checkout_raw || form.date_checkout)}</Text>
                  ) : null}
                </View>
                <View style={styles.colHalf}>
                  <Text style={styles.infoLabel}>Actual Check-In</Text>
                  <Text style={[styles.infoValue, { marginTop: 2, color: "#4CAF50" }]}>{form.date_checkin || "-"}</Text>
                  {formatTime(form.date_checkin) ? (
                    <Text style={[styles.infoValue, { marginTop: 1, color: "#4CAF50", fontSize: 13, fontWeight: "700" }]}>{formatTime(form.date_checkin)}</Text>
                  ) : null}
                </View>
              </View>
              <View style={[styles.infoRow, { marginTop: 8 }]}>
                <Text style={styles.infoLabel}>Duration</Text>
                <Text style={styles.infoValue}>{form.actual_duration || form.rental_duration + " " + (PERIOD_LABELS[form.rental_period_type] || "Day")}</Text>
              </View>
            </View>
          )}

          {/* ========= FINANCIALS SECTION (read-only, shown after checkout) ========= */}
          {!isEditable && parseFloat(form.advance_amount || 0) > 0 && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionCardTitle}>FINANCIALS</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Advance Collected</Text>
                <Text style={styles.infoValue}>ر.ع.{form.advance_amount || "0.000"}</Text>
              </View>
              {form.advance_returned && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Advance Status</Text>
                  <Text style={[styles.infoValue, { color: "#4CAF50", fontWeight: "700" }]}>Returned</Text>
                </View>
              )}
            </View>
          )}

          {/* ========= TABS ========= */}
          <View style={styles.tabRow}>
            {getTabs().map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ----- TAB: RENTAL LINES ----- */}
          {activeTab === "lines" && (
            <View style={styles.tabContent}>
              {lines.map((line, idx) => (
                <View key={line.id} style={styles.lineCard}>
                  {/* Line header */}
                  <View style={styles.lineCardHeader}>
                    <Text style={styles.lineCardNum}>Line {idx + 1}</Text>
                    {state === "draft" && (
                      <TouchableOpacity onPress={() => removeLine(idx)}>
                        <Text style={styles.removeLineBtnText}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Tool selection - full width */}
                  <View style={styles.fieldGroup}>
                    <Text style={styles.inputLabel}>Tool</Text>
                    {isEditable ? (
                      <>
                        {line.tool_id && activeToolLineIdx !== idx ? (
                          <View style={styles.selectedToolRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.selectedToolName}>{line.tool_name}</Text>
                              <Text style={styles.selectedToolSub}>S/N: {line.serial_number || "-"}</Text>
                            </View>
                            {state === "draft" && (
                              <TouchableOpacity
                                onPress={() => {
                                  updateLine(idx, "tool_name", "");
                                  updateLine(idx, "tool_id", null);
                                  updateLine(idx, "serial_number", "");
                                  updateLine(idx, "unit_price", "");
                                  setActiveToolLineIdx(idx);
                                }}
                                style={styles.clearBtnSmall}
                              >
                                <Text style={styles.clearBtnText}>X</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ) : (
                          <>
                            <TextInput
                              placeholder="Search tool..."
                              value={line.tool_name}
                              onChangeText={(t) => {
                                updateLine(idx, "tool_name", t);
                                setActiveToolLineIdx(idx);
                              }}
                              onFocus={() => setActiveToolLineIdx(idx)}
                              column
                            />
                            {activeToolLineIdx === idx && getFilteredTools(line.tool_name).length > 0 && (
                              <View style={styles.toolDropdown}>
                                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
                                  {getFilteredTools(line.tool_name).map((t) => (
                                    <TouchableOpacity key={t.id} style={styles.dropdownItem} onPress={() => selectTool(idx, t)}>
                                      <Text style={styles.dropdownItemName}>{t.name}</Text>
                                      <Text style={styles.dropdownItemSub}>S/N: {t.serial_number || "-"} {"\u2022"} ر.ع.{t.rental_price_per_day}/day</Text>
                                    </TouchableOpacity>
                                  ))}
                                </ScrollView>
                              </View>
                            )}
                            {activeToolLineIdx === idx && line.tool_name.trim().length > 0 && getFilteredTools(line.tool_name).length === 0 && (
                              <View style={styles.toolDropdown}>
                                <Text style={styles.dropdownEmpty}>No available tools found</Text>
                              </View>
                            )}
                          </>
                        )}
                        {!line.tool_id && line.serial_number ? (
                          <Text style={{ fontSize: 12, color: "#888", marginTop: 4 }}>S/N: {line.serial_number}</Text>
                        ) : null}
                      </>
                    ) : (
                      <View>
                        <Text style={styles.lineInfoText}>{line.tool_name}</Text>
                        <Text style={styles.lineInfoSub}>S/N: {line.serial_number || "-"}</Text>
                      </View>
                    )}
                  </View>

                  {/* Per-line Period Type: Day / Week / Month */}
                  <View style={styles.fieldGroup}>
                    <Text style={styles.lineMetricLabel}>Per</Text>
                    <View style={[styles.chipRow, { marginTop: 4, marginBottom: 4 }]}>
                      {PERIOD_TYPES.map((pt) => (
                        <TouchableOpacity
                          key={pt.value}
                          style={[styles.periodChip, (line.period_type || "day") === pt.value && styles.periodChipActive]}
                          onPress={() => isEditable && updateLine(idx, "period_type", pt.value)}
                          disabled={!isEditable}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.periodChipText, (line.period_type || "day") === pt.value && styles.periodChipTextActive]}>
                            {pt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Price / Duration / Total - 3 columns */}
                  <View style={styles.lineMetricsRow}>
                    <View style={styles.lineMetric}>
                      <Text style={styles.lineMetricLabel}>
                        Price/{(PERIOD_TYPES.find((p) => p.value === (line.period_type || "day"))?.label || "Day")}
                      </Text>
                      {isEditable ? (
                        <TextInput placeholder="0.00" value={line.unit_price && line.unit_price !== "0" && line.unit_price !== "0.00" ? line.unit_price : ""} onChangeText={(t) => updateLine(idx, "unit_price", t)} keyboardType="decimal-pad" column />
                      ) : (
                        <Text style={styles.lineMetricValue}>ر.ع.{line.unit_price || "0.000"}</Text>
                      )}
                    </View>
                    <View style={styles.lineMetric}>
                      <Text style={styles.lineMetricLabel}>
                        Duration ({{ day: "Days", week: "Weeks", month: "Months" }[line.period_type || "day"] || "Days"})
                      </Text>
                      {state === "draft" ? (
                        <TextInput
                          placeholder="1"
                          value={line.planned_duration !== "" ? String(line.planned_duration || "1") : ""}
                          onChangeText={(t) => {
                            if (t === "") {
                              updateLine(idx, "planned_duration", "");
                              return;
                            }
                            const num = parseInt(t) || 0;
                            if (num < 1) return;
                            updateLine(idx, "planned_duration", String(num));
                          }}
                          onBlur={() => {
                            if (!line.planned_duration || line.planned_duration === "0" || line.planned_duration === "") {
                              updateLine(idx, "planned_duration", "1");
                            }
                          }}
                          keyboardType="numeric"
                          selectTextOnFocus
                          column
                        />
                      ) : (
                        <Text style={styles.lineMetricValue}>{line.planned_duration || "1"}</Text>
                      )}
                    </View>
                    <View style={[styles.lineMetric, { alignItems: "flex-end" }]}>
                      <Text style={styles.lineMetricLabel}>Total</Text>
                      <Text style={styles.lineTotalText}>ر.ع.{calcLineTotal(line).toFixed(3)}</Text>
                    </View>
                  </View>
                  {parseFloat(line.tax_amount || 0) > 0 && (
                    <View style={styles.lineMetricsRow}>
                      <View style={styles.lineMetric}>
                        <Text style={styles.lineMetricLabel}>Tax %</Text>
                        <Text style={[styles.lineMetricValue, { color: "#E65100" }]}>
                          {parseFloat(line.tax_rate) > 0 ? line.tax_rate + '%' : (parseFloat(line.tax_amount) > 0 ? ((parseFloat(line.tax_amount) / (parseFloat(line.price_before_tax) || 1)) * 100).toFixed(1) + '%' : '-')}
                        </Text>
                      </View>
                      <View style={styles.lineMetric}>
                        <Text style={styles.lineMetricLabel}>Tax Amount</Text>
                        <Text style={[styles.lineMetricValue, { color: "#E65100", fontWeight: "700" }]}>ر.ع.{parseFloat(line.tax_amount).toFixed(3)}</Text>
                      </View>
                      <View style={[styles.lineMetric, { alignItems: "flex-end" }]}>
                        <Text style={[styles.lineMetricLabel, { textAlign: "right" }]}>Before Tax</Text>
                        <Text style={[styles.lineMetricValue, { textAlign: "right" }]}>ر.ع.{(parseFloat(line.price_before_tax) || calcLineTotal(line)).toFixed(3)}</Text>
                      </View>
                    </View>
                  )}
                  {state !== "draft" && state !== "confirmed" && (parseFloat(line.late_fee_amount || 0) > 0 || parseFloat(line.damage_charge || 0) > 0) && (
                    <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#f0f0f0" }}>
                      {parseFloat(line.late_fee_amount || 0) > 0 && (
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                          <Text style={{ fontSize: 12, color: "#E65100" }}>Late Fee ({line.extra_days || 0} extra days)</Text>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: "#E65100" }}>ر.ع.{parseFloat(line.late_fee_amount).toFixed(3)}</Text>
                        </View>
                      )}
                      {parseFloat(line.damage_charge || 0) > 0 && (
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <View style={{ flex: 1, marginRight: 10 }}>
                            <Text style={{ fontSize: 12, color: "#D32F2F" }}>Damage Charge</Text>
                            {line.damage_note ? <Text style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}>{line.damage_note}</Text> : null}
                          </View>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: "#D32F2F" }}>ر.ع.{parseFloat(line.damage_charge).toFixed(3)}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              ))}

              {isEditable && form.partner_name.trim().length > 0 && (
                <TouchableOpacity onPress={addLine} style={styles.addLineBtn}>
                  <Text style={styles.addLineBtnText}>+ Add a line</Text>
                </TouchableOpacity>
              )}

              {isEditable && !form.partner_name.trim() && (
                <View style={{
                  backgroundColor: "#FFF9C4",
                  padding: 12,
                  borderRadius: 8,
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: "#FBC02D",
                  alignItems: "center"
                }}>
                  <Text style={{ color: "#827717", fontSize: 13, fontWeight: "600" }}>
                    Please enter a customer name to add tools
                  </Text>
                </View>
              )}

              {errors.lines && <Text style={styles.errorText}>{errors.lines}</Text>}

              {lines.length > 0 && (
                <View style={styles.lineTotals}>
                  <View style={styles.lineTotalRow}>
                    <Text style={styles.lineTotalLabel}>Subtotal</Text>
                    <Text style={styles.lineTotalValue}>ر.ع.{calcSubtotal().toFixed(3)}</Text>
                  </View>
                  {calcTaxTotal() > 0 && (
                    <View style={styles.lineTotalRow}>
                      <Text style={styles.lineTotalLabel}>Tax</Text>
                      <Text style={styles.lineTotalValue}>ر.ع.{calcTaxTotal().toFixed(3)}</Text>
                    </View>
                  )}
                  {calcLateFees() > 0 && (
                    <View style={styles.lineTotalRow}>
                      <Text style={[styles.lineTotalLabel, { color: "#F44336" }]}>Late Fees</Text>
                      <Text style={[styles.lineTotalValue, { color: "#F44336", fontWeight: "700" }]}>ر.ع.{calcLateFees().toFixed(3)}</Text>
                    </View>
                  )}
                  {calcDamageCharges() > 0 && (
                    <View style={styles.lineTotalRow}>
                      <Text style={[styles.lineTotalLabel, { color: "#F44336" }]}>Damage Charges</Text>
                      <Text style={[styles.lineTotalValue, { color: "#F44336", fontWeight: "700" }]}>ر.ع.{calcDamageCharges().toFixed(3)}</Text>
                    </View>
                  )}
                  {parseFloat(form.discount_amount) > 0 && (
                    <View style={styles.lineTotalRow}>
                      <Text style={[styles.lineTotalLabel, { color: "#4CAF50" }]}>Discount</Text>
                      <Text style={[styles.lineTotalValue, { color: "#4CAF50", fontWeight: "700" }]}>-ر.ع.{parseFloat(form.discount_amount).toFixed(3)}</Text>
                    </View>
                  )}
                  <View style={[styles.lineTotalRow, styles.grandTotalRow, { borderTopWidth: 1, borderTopColor: "#ccc", marginTop: 6, paddingTop: 6 }]}>
                    <Text style={styles.grandTotalLabel}>Total</Text>
                    <Text style={styles.grandTotalValue}>ر.ع.{calcGrandTotal().toFixed(3)}</Text>
                  </View>
                  {form.payment_method ? (
                    <View style={styles.lineTotalRow}>
                      <Text style={styles.lineTotalLabel}>Checkout Payment</Text>
                      <Text style={styles.lineTotalValue}>{form.payment_method.charAt(0).toUpperCase() + form.payment_method.slice(1)}</Text>
                    </View>
                  ) : null}
                  {form.payment_method === "cash" && parseFloat(form.cash_received || 0) > 0 ? (
                    <>
                      <View style={styles.lineTotalRow}>
                        <Text style={styles.lineTotalLabel}>Cash Received (Checkout)</Text>
                        <Text style={styles.lineTotalValue}>ر.ع.{parseFloat(form.cash_received).toFixed(3)}</Text>
                      </View>
                      <View style={styles.lineTotalRow}>
                        <Text style={styles.lineTotalLabel}>Balance Returned (Checkout)</Text>
                        <Text style={[styles.lineTotalValue, { color: "#4CAF50" }]}>ر.ع.{calcCashBalance().toFixed(3)}</Text>
                      </View>
                    </>
                  ) : null}
                  {form.checkin_payment_method ? (
                    <View style={styles.lineTotalRow}>
                      <Text style={styles.lineTotalLabel}>Check-In Payment</Text>
                      <Text style={styles.lineTotalValue}>{form.checkin_payment_method.charAt(0).toUpperCase() + form.checkin_payment_method.slice(1)}</Text>
                    </View>
                  ) : null}
                  {form.checkin_payment_method === "cash" && parseFloat(form.checkin_cash_received || 0) > 0 ? (
                    <>
                      <View style={styles.lineTotalRow}>
                        <Text style={styles.lineTotalLabel}>Cash Received (Check-In)</Text>
                        <Text style={styles.lineTotalValue}>ر.ع.{parseFloat(form.checkin_cash_received).toFixed(3)}</Text>
                      </View>
                      <View style={styles.lineTotalRow}>
                        <Text style={styles.lineTotalLabel}>Balance Returned (Check-In)</Text>
                        <Text style={[styles.lineTotalValue, { color: "#4CAF50" }]}>ر.ع.{calcCheckinCashBalance().toFixed(3)}</Text>
                      </View>
                    </>
                  ) : null}
                  {parseFloat(form.advance_amount) > 0 && (
                    <View style={styles.lineTotalRow}>
                      <Text style={styles.lineTotalLabel}>
                        Advance Collected{form.advance_returned ? " (Returned)" : " (-)"}
                      </Text>
                      <Text style={[styles.lineTotalValue, { color: form.advance_returned ? "#999" : "#4CAF50" }]}>
                        {form.advance_returned ? "" : "-"}ر.ع.{parseFloat(form.advance_amount).toFixed(3)}
                      </Text>
                    </View>
                  )}
                  {parseFloat(form.advance_amount) > 0 && !form.advance_returned && (
                    <View style={[styles.lineTotalRow, { borderTopWidth: 2, borderTopColor: "#333", marginTop: 6, paddingTop: 6 }]}>
                      <Text style={[styles.grandTotalLabel, { color: "#2c3e50" }]}>Amount Due</Text>
                      <Text style={[styles.grandTotalValue, { color: "#2c3e50" }]}>ر.ع.{calcTotal().toFixed(3)}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* ----- TAB: TIMESHEET / LOG ----- */}
          {activeTab === "timesheet" && (
            <View style={styles.tabContent}>
              {timesheet.length === 0 ? (
                <Text style={styles.emptyTabText}>No activity logged yet</Text>
              ) : (
                timesheet.map((t) => (
                  <View key={t.id} style={styles.tsRow}>
                    <View style={styles.tsLeft}>
                      <Text style={styles.tsUser}>{t.user}</Text>
                      <Text style={styles.tsTime}>{t.date} {t.time}</Text>
                    </View>
                    <Text style={styles.tsNote}>{t.notes}</Text>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ----- TAB: CHECK-OUT DETAILS ----- */}
          {activeTab === "checkout_details" && (
            <View style={styles.tabContent}>
              {/* Header Info */}
              <View style={styles.detailInfoCard}>
                <View style={styles.row2Col}>
                  <View style={styles.colHalf}>
                    <Text style={styles.detailSmallLabel}>Customer</Text>
                    <Text style={styles.detailSmallValue}>{form.partner_name}</Text>
                  </View>
                  <View style={styles.colHalf}>
                    <Text style={styles.detailSmallLabel}>Check-Out Date</Text>
                    <Text style={styles.detailSmallValue}>{form.date_checkout || "-"}</Text>
                  </View>
                </View>
              </View>

              {/* Render Signatures & ID proofs here instead of tool info */}

              {/* Customer Signature */}
              <Text style={styles.detailSectionTitle}>Customer Signature</Text>
              {checkoutSignatureUri ? (
                <TouchableOpacity onPress={() => setPreviewImageUri(checkoutSignatureUri)}>
                  <View style={styles.detailImageWrap}>
                    <Image source={{ uri: checkoutSignatureUri }} style={{ width: "100%", height: 140, resizeMode: "contain", backgroundColor: "#fff" }} />
                    {checkoutSignatureTime && <Text style={{ fontSize: 10, color: "#999", textAlign: "center", marginTop: 4 }}>Signed: {new Date(checkoutSignatureTime).toLocaleString()}</Text>}
                    <Text style={{ fontSize: 11, color: "#2196F3", textAlign: "center", marginTop: 4 }}>Tap to enlarge</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: "#999", fontSize: 13, marginBottom: 12 }}>Not captured</Text>
              )}

              {/* ID Proof - Front */}
              <Text style={styles.detailSectionTitle}>ID Proof - Front</Text>
              {idProofFrontUri ? (
                <TouchableOpacity onPress={() => setPreviewImageUri(idProofFrontUri)}>
                  <View style={styles.detailImageWrap}>
                    <Image source={{ uri: idProofFrontUri }} style={{ width: "100%", height: 220, resizeMode: "contain" }} />
                    {idProofTimestamp && <Text style={{ fontSize: 10, color: "#999", textAlign: "center", marginTop: 4 }}>Captured: {idProofTimestamp}</Text>}
                    <Text style={{ fontSize: 11, color: "#2196F3", textAlign: "center", marginTop: 4 }}>Tap to enlarge</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: "#999", fontSize: 13, marginBottom: 12 }}>Not captured</Text>
              )}

              {/* ID Proof - Back */}
              <Text style={styles.detailSectionTitle}>ID Proof - Back</Text>
              {idProofBackUri ? (
                <TouchableOpacity onPress={() => setPreviewImageUri(idProofBackUri)}>
                  <View style={styles.detailImageWrap}>
                    <Image source={{ uri: idProofBackUri }} style={{ width: "100%", height: 220, resizeMode: "contain" }} />
                    <Text style={{ fontSize: 11, color: "#2196F3", textAlign: "center", marginTop: 4 }}>Tap to enlarge</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: "#999", fontSize: 13, marginBottom: 12 }}>Not captured</Text>
              )}
            </View>
          )}

          {/* ----- TAB: CHECK-IN DETAILS ----- */}
          {activeTab === "checkin_details" && (
            <View style={styles.tabContent}>
              {/* Header Info */}
              <View style={styles.detailInfoCard}>
                <View style={styles.row2Col}>
                  <View style={styles.colHalf}>
                    <Text style={styles.detailSmallLabel}>Check-In Date</Text>
                    <Text style={styles.detailSmallValue}>{form.date_checkin || "-"}</Text>
                  </View>
                  <View style={styles.colHalf}>
                    <Text style={styles.detailSmallLabel}>Duration</Text>
                    <Text style={styles.detailSmallValue}>{form.actual_duration || form.rental_duration + " " + (PERIOD_LABELS[form.rental_period_type] || "Day")}</Text>
                  </View>
                </View>
                {form.advance_returned && (
                  <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ color: "#4CAF50", fontWeight: "700", fontSize: 13 }}>Advance Returned</Text>
                  </View>
                )}
              </View>

              {/* Totals & Signatures only */}

              {/* Totals */}
              {(calcLateFees() > 0 || calcDamageCharges() > 0 || parseFloat(form.discount_amount) > 0) && (
                <View style={{ backgroundColor: "#FFF8E1", padding: 12, borderRadius: 8, marginBottom: 12 }}>
                  {calcLateFees() > 0 && <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: "#666" }}>Total Late Fees</Text><Text style={{ fontWeight: "700", color: "#E65100" }}>ر.ع.{calcLateFees().toFixed(3)}</Text></View>}
                  {calcDamageCharges() > 0 && <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}><Text style={{ color: "#666" }}>Total Damage Charges</Text><Text style={{ fontWeight: "700", color: "#C62828" }}>ر.ع.{calcDamageCharges().toFixed(3)}</Text></View>}
                  {parseFloat(form.discount_amount) > 0 && <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}><Text style={{ color: "#666" }}>Total Discount</Text><Text style={{ fontWeight: "700", color: "#4CAF50" }}>-ر.ع.{parseFloat(form.discount_amount).toFixed(3)}</Text></View>}
                </View>
              )}

              {/* Customer Signature */}
              <Text style={styles.detailSectionTitle}>Customer Signature</Text>
              {checkinSignatureUri ? (
                <TouchableOpacity onPress={() => setPreviewImageUri(checkinSignatureUri)}>
                  <View style={styles.detailImageWrap}>
                    <Image source={{ uri: checkinSignatureUri }} style={{ width: "100%", height: 140, resizeMode: "contain", backgroundColor: "#fff" }} />
                    {checkinSignatureTime && <Text style={{ fontSize: 10, color: "#999", textAlign: "center", marginTop: 4 }}>Signed: {new Date(checkinSignatureTime).toLocaleString()}</Text>}
                    <Text style={{ fontSize: 11, color: "#2196F3", textAlign: "center", marginTop: 4 }}>Tap to enlarge</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: "#999", fontSize: 13, marginBottom: 12 }}>Not captured</Text>
              )}

              {/* Authority Signature */}
              <Text style={styles.detailSectionTitle}>Authority Signature</Text>
              {checkinSignerName ? <Text style={{ fontSize: 13, color: "#333", marginBottom: 4 }}>Signer: {checkinSignerName}</Text> : null}
              {checkinAuthoritySignatureUri ? (
                <TouchableOpacity onPress={() => setPreviewImageUri(checkinAuthoritySignatureUri)}>
                  <View style={styles.detailImageWrap}>
                    <Image source={{ uri: checkinAuthoritySignatureUri }} style={{ width: "100%", height: 140, resizeMode: "contain", backgroundColor: "#fff" }} />
                    {checkinAuthoritySignatureTime && <Text style={{ fontSize: 10, color: "#999", textAlign: "center", marginTop: 4 }}>Signed: {new Date(checkinAuthoritySignatureTime).toLocaleString()}</Text>}
                    <Text style={{ fontSize: 11, color: "#2196F3", textAlign: "center", marginTop: 4 }}>Tap to enlarge</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: "#999", fontSize: 13, marginBottom: 12 }}>Not captured</Text>
              )}
            </View>
          )}

          {/* ----- TAB: DISCOUNT DETAILS ----- */}
          {activeTab === "discount_details" && (
            <View style={styles.tabContent}>
              {/* Header Info */}
              <View style={styles.detailInfoCard}>
                <View style={styles.row2Col}>
                  <View style={styles.colHalf}>
                    <Text style={styles.detailSmallLabel}>Authorized By</Text>
                    <Text style={styles.detailSmallValue}>{discountAuthName || "-"}</Text>
                  </View>
                  <View style={styles.colHalf}>
                    <Text style={styles.detailSmallLabel}>Total Discount</Text>
                    <Text style={[styles.detailSmallValue, { color: "#F44336", fontWeight: "800" }]}>-ر.ع.{parseFloat(form.discount_amount).toFixed(3)}</Text>
                  </View>
                </View>
                <DetailItem label="Authorization Date" value={discountAuthSignatureTime ? new Date(discountAuthSignatureTime).toLocaleString() : (form.discount_auth_signature_time ? new Date(form.discount_auth_signature_time).toLocaleString() : '')} />
              </View>

              {/* Authorizer Photo */}
              <Text style={styles.detailSectionTitle}>Authorizer Photo</Text>
              {discountAuthPhotoUri ? (
                <TouchableOpacity onPress={() => setPreviewImageUri(discountAuthPhotoUri)}>
                  <View style={styles.detailImageWrap}>
                    <Image source={{ uri: discountAuthPhotoUri }} style={{ width: "100%", height: 220, resizeMode: "contain" }} />
                    {discountAuthPhotoTime && <Text style={{ fontSize: 10, color: "#999", textAlign: "center", marginTop: 4 }}>Captured: {discountAuthPhotoTime}</Text>}
                    <Text style={{ fontSize: 11, color: "#2196F3", textAlign: "center", marginTop: 4 }}>Tap to enlarge</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: "#999", fontSize: 13, marginBottom: 12 }}>Not captured</Text>
              )}

              {/* Authorizer Signature */}
              <Text style={styles.detailSectionTitle}>Authorizer Signature</Text>
              {discountAuthSignatureUri ? (
                <TouchableOpacity onPress={() => setPreviewImageUri(discountAuthSignatureUri)}>
                  <View style={styles.detailImageWrap}>
                    <Image source={{ uri: discountAuthSignatureUri }} style={{ width: "100%", height: 140, resizeMode: "contain", backgroundColor: "#fff" }} />
                    {discountAuthSignatureTime && <Text style={{ fontSize: 10, color: "#999", textAlign: "center", marginTop: 4 }}>Signed: {new Date(discountAuthSignatureTime).toLocaleString()}</Text>}
                    <Text style={{ fontSize: 11, color: "#2196F3", textAlign: "center", marginTop: 4 }}>Tap to enlarge</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: "#999", fontSize: 13, marginBottom: 12 }}>Not captured</Text>
              )}

              {/* Discount Breakdown */}
              <Text style={styles.detailSectionTitle}>Discount Breakdown</Text>
              {lines.map((line, idx) => {
                const rentalCost = (parseFloat(line.unit_price) || 0) * (parseFloat(line.planned_duration) || 1) * (LINE_DAY_MULTIPLIERS[line.period_type || "day"] || 1) * (parseFloat(line.quantity) || 1);
                const lateFee = parseFloat(line.late_fee_amount) || 0;
                const dmgCharge = parseFloat(line.damage_charge) || 0;
                const lineTotal = rentalCost + lateFee + dmgCharge;
                const dType = line.discount_type || "";
                const dVal = parseFloat(line.discount_value) || 0;
                const dAmt = dType === "percentage" ? lineTotal * dVal / 100 : Math.min(dVal, lineTotal);
                return (
                  <View key={line.id} style={styles.detailToolCard}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#333", flex: 1 }}>{line.tool_name || "Tool " + (idx + 1)}</Text>
                      <Text style={{ fontSize: 12, color: "#888" }}>S/N: {line.serial_number || "-"}</Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                      <Text style={{ fontSize: 12, color: "#666" }}>Rental: ر.ع.{rentalCost.toFixed(3)}</Text>
                      {lateFee > 0 && <Text style={{ fontSize: 12, color: "#E65100" }}>Late: ر.ع.{lateFee.toFixed(3)}</Text>}
                      {dmgCharge > 0 && <Text style={{ fontSize: 12, color: "#C62828" }}>Damage: ر.ع.{dmgCharge.toFixed(3)}</Text>}
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#eee" }}>
                      <Text style={{ fontSize: 12, color: "#666" }}>Discount: {dType === "percentage" ? dVal + "%" : "ر.ع." + dVal.toFixed(3)}</Text>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: dAmt > 0 ? "#4CAF50" : "#999" }}>-ر.ع.{dAmt.toFixed(3)}</Text>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#333" }}>Final: ر.ع.{(lineTotal - dAmt).toFixed(3)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ----- TAB: TOOL PHOTOS ----- */}
          {activeTab === "tool_photos" && (
            <View style={styles.tabContent}>
              <View style={styles.detailInfoCard}>
                <View style={styles.row2Col}>
                  <View style={styles.colHalf}>
                    <Text style={styles.detailSmallLabel}>Check-Out Date</Text>
                    <Text style={styles.detailSmallValue}>{form.date_checkout || "-"}</Text>
                  </View>
                  <View style={styles.colHalf}>
                    <Text style={styles.detailSmallLabel}>Check-In Date</Text>
                    <Text style={styles.detailSmallValue}>{form.date_checkin || "-"}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.detailSectionTitle}>TOOL CONDITIONS & PHOTOS</Text>
              {lines.map((line, idx) => (
                <View key={line.id} style={[styles.detailToolCard, { paddingBottom: 15 }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: "#2c3e50" }}>{line.tool_name || "Tool " + (idx + 1)}</Text>
                      <Text style={{ fontSize: 12, color: "#7f8c8d", marginTop: 2 }}>S/N: {line.serial_number || "-"}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", gap: 15 }}>
                    {/* Check-Out Side */}
                    <View style={{ flex: 1, backgroundColor: "#f8f9fa", padding: 10, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: "#2196F3" }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#2196F3", marginBottom: 6, letterSpacing: 0.5 }}>AT CHECK-OUT</Text>
                      <View style={[styles.conditionBadge, { alignSelf: "flex-start", marginBottom: 8, backgroundColor: ["excellent", "good"].includes(line.checkout_condition) ? "#E8F5E9" : line.checkout_condition === "fair" ? "#FFF8E1" : "#FFEBEE" }]}>
                        <Text style={[styles.conditionBadgeText, { color: ["excellent", "good"].includes(line.checkout_condition) ? "#2E7D32" : line.checkout_condition === "fair" ? "#F57F17" : "#C62828" }]}>{(line.checkout_condition || "N/A").toUpperCase()}</Text>
                      </View>
                      <View style={{ width: "100%", height: 220, backgroundColor: "#fff", borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: "#e0e0e0" }}>
                        {toolPhotoUris[idx] ? (
                          <TouchableOpacity onPress={() => setPreviewImageUri(toolPhotoUris[idx])} style={{ flex: 1 }}>
                            <Image source={{ uri: toolPhotoUris[idx] }} style={{ width: "100%", height: "100%", resizeMode: "contain" }} />
                          </TouchableOpacity>
                        ) : (
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 10, color: "#bdc3c7" }}>No Photo</Text>
                          </View>
                        )}
                      </View>
                      {toolPhotoTimestamps[idx] && <Text style={{ fontSize: 9, color: "#95a5a6", marginTop: 6, textAlign: "center" }}>{toolPhotoTimestamps[idx]}</Text>}
                    </View>

                    {/* Check-In Side */}
                    {(state === "checked_in" || state === "done" || state === "invoiced") && (
                      <View style={{ flex: 1, backgroundColor: "#f8f9fa", padding: 10, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: "#4CAF50" }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: "#4CAF50", marginBottom: 6, letterSpacing: 0.5 }}>AT CHECK-IN</Text>
                        <View style={[styles.conditionBadge, { alignSelf: "flex-start", marginBottom: 8, backgroundColor: ["excellent", "good"].includes(line.checkin_condition) ? "#E8F5E9" : line.checkin_condition === "fair" ? "#FFF8E1" : "#FFEBEE" }]}>
                          <Text style={[styles.conditionBadgeText, { color: ["excellent", "good"].includes(line.checkin_condition) ? "#2E7D32" : line.checkin_condition === "fair" ? "#F57F17" : "#C62828" }]}>{(line.checkin_condition || "N/A").toUpperCase()}</Text>
                        </View>
                        <View style={{ width: "100%", height: 220, backgroundColor: "#fff", borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: "#e0e0e0" }}>
                          {toolCheckinPhotoUris[idx] ? (
                            <TouchableOpacity onPress={() => setPreviewImageUri(toolCheckinPhotoUris[idx])} style={{ flex: 1 }}>
                              <Image source={{ uri: toolCheckinPhotoUris[idx] }} style={{ width: "100%", height: "100%", resizeMode: "contain" }} />
                            </TouchableOpacity>
                          ) : (
                            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontSize: 10, color: "#bdc3c7" }}>No Check-in Photo</Text>
                            </View>
                          )}
                        </View>
                        {toolCheckinPhotoTimestamps[idx] && <Text style={{ fontSize: 9, color: "#95a5a6", marginTop: 6, textAlign: "center" }}>{toolCheckinPhotoTimestamps[idx]}</Text>}
                        {line.damage_note ? (
                          <Text style={{ fontSize: 9, color: "#e74c3c", marginTop: 8, fontWeight: "600" }}>Damage: {line.damage_note}</Text>
                        ) : null}
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ----- TAB: NOTES & TERMS ----- */}
          {activeTab === "notes" && (
            <View style={styles.tabContent}>
              <TextInput label="Internal Notes" placeholder="Add notes..." value={form.notes} onChangeText={(t) => handleChange("notes", t)} multiline numberOfLines={3} column />
              <View style={{ height: 10 }} />
              <TextInput label="Terms & Conditions" placeholder="Add terms..." value={form.terms} onChangeText={(t) => handleChange("terms", t)} multiline numberOfLines={3} column />
            </View>
          )}

          {/* SAVE & CONFIRM BUTTONS for Draft */}
          {state === "draft" && (
            <View style={styles.bottomBtnRow}>
              <TouchableOpacity
                style={[styles.bottomBtn, { backgroundColor: COLORS.primaryThemeColor }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.bottomBtnText}>{saving ? "Saving..." : "Save Draft"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bottomBtn, { backgroundColor: "#4CAF50" }]}
                onPress={actionConfirm}
                disabled={saving}
              >
                <Text style={styles.bottomBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* CHECK-OUT BUTTON for Confirmed */}
          {state === "confirmed" && (
            <View style={styles.bottomBtnRow}>
              <TouchableOpacity
                style={[styles.bottomBtn, { backgroundColor: "#FF9800", flex: 1 }]}
                onPress={openCheckoutWizard}
              >
                <Text style={styles.bottomBtnText}>Check-Out Tools</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </RoundedContainer>

      {renderCheckoutModal()}
      {renderCheckinModal()}
      {renderDiscountModal()}

      {/* IMAGE PREVIEW MODAL */}
      <Modal visible={!!previewImageUri} animationType="fade" transparent onRequestClose={() => setPreviewImageUri(null)}>
        <TouchableOpacity
          activeOpacity={1}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center" }}
          onPress={() => setPreviewImageUri(null)}
        >
          <TouchableOpacity
            style={{ position: "absolute", top: 50, right: 20, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" }}
            onPress={() => setPreviewImageUri(null)}
          >
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>X</Text>
          </TouchableOpacity>
          {previewImageUri && (
            <Image source={{ uri: previewImageUri }} style={{ width: "95%", height: "75%", resizeMode: "contain" }} />
          )}
        </TouchableOpacity>
      </Modal>

      {/* CAMERA MODAL */}
      <CameraCapture
        visible={showCamera}
        onCapture={handleCameraCapture}
        onClose={() => { setShowCamera(false); setCameraCallback(null); }}
      />

      {/* SIGNATURE PAD MODAL */}
      <Modal visible={showSignaturePad} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.signPadModal}>
            <View style={styles.signPadHeader}>
              <Text style={styles.signPadTitle}>Draw Signature</Text>
              <TouchableOpacity onPress={() => { setShowSignaturePad(false); setActiveSignatureTarget(null); }}>
                <Text style={styles.modalClose}>X</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', flex: 1 }}>
              <View style={styles.signToolsColumn}>
                <Text style={styles.toolsTitle}>Signature Tools</Text>
                <TouchableOpacity style={[styles.toolBtn, signModeEraser ? styles.toolBtnActive : null]} onPress={() => setSignModeEraser(false)}>
                  <Text style={styles.toolBtnText}>Pen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.toolBtn, signModeEraser ? styles.toolBtnActive : null, { marginTop: 6 }]} onPress={() => setSignModeEraser(true)}>
                  <Text style={styles.toolBtnText}>Eraser</Text>
                </TouchableOpacity>

                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontSize: 12, color: '#666' }}>Size</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                    <TouchableOpacity onPress={() => setSignStrokeWidth((w) => Math.max(1, w - 1))} style={styles.sizeBtn}><Text>-</Text></TouchableOpacity>
                    <View style={{ flex: 1, alignItems: 'center' }}><Text>{signStrokeWidth}px</Text></View>
                    <TouchableOpacity onPress={() => setSignStrokeWidth((w) => Math.min(20, w + 1))} style={styles.sizeBtn}><Text>+</Text></TouchableOpacity>
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontSize: 12, color: '#666' }}>Ink Color</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                    {['#000', '#1E88E5', '#E53935', '#43A047', '#8E24AA', '#000000', '#37474F'].map((c) => (
                      <TouchableOpacity key={c} onPress={() => { setSignStrokeColor(c); setSignModeEraser(false); }} style={[styles.colorDot, { backgroundColor: c, borderWidth: signStrokeColor === c ? 2 : 0 }]} />
                    ))}
                  </View>
                </View>

                <TouchableOpacity style={[styles.toolActionBtn, { marginTop: 18 }]} onPress={() => { if (signatureRef.current) signatureRef.current.clearSignature(); showToastMessage('Cleared'); }}>
                  <Text style={{ color: '#E53935' }}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.toolActionBtn, { marginTop: 8 }]} onPress={async () => {
                  try {
                    const res = await DocumentPicker.getDocumentAsync({ type: 'image/*' });
                    if (res.type === 'success' && activeSignatureTarget) {
                      const { setUri, setFlag, id } = activeSignatureTarget;
                      setUri(res.uri);
                      if (typeof setFlag === 'function') setFlag(true);
                      const now = new Date().toISOString();
                      if (id === 'checkout') setCheckoutSignatureTime(now);
                      else if (id === 'checkin_customer') setCheckinSignatureTime(now);
                      else if (id === 'discount_auth') setDiscountAuthSignatureTime(now);
                      setShowSignaturePad(false);
                      setActiveSignatureTarget(null);
                      showToastMessage('Image uploaded');
                    }
                  } catch (e) {
                    showToastMessage('Upload failed');
                  }
                }}>
                  <Text style={{ color: '#1976D2' }}>Upload</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.signPadCanvas}>
                <SignaturePad
                  ref={signatureRef}
                  style={{ flex: 1 }}
                  strokeColor={signModeEraser ? '#fff' : signStrokeColor}
                  strokeWidth={signStrokeWidth}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 }}>
                  <Text style={{ fontSize: 12, color: '#666' }}>{activeSignatureTarget?.id ? activeSignatureTarget.id.replace('_', ' ').toUpperCase() : ''}</Text>
                  <Text style={{ fontSize: 12, color: '#666' }}>{/* placeholder for timestamp */}</Text>
                </View>
                <View style={styles.signPadBtnRow}>
                  <TouchableOpacity style={[styles.signPadBtn, { backgroundColor: '#9E9E9E' }]} onPress={() => { if (signatureRef.current) signatureRef.current.clearSignature(); }}>
                    <Text style={styles.signPadBtnText}>Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.signPadBtn, { backgroundColor: '#4CAF50' }]}
                    onPress={handleSignatureSave}
                  >
                    <Text style={styles.signPadBtnText}>Save Signature</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* COUNTRY CODE PICKER MODAL */}
      <Modal visible={showCountryPicker} animationType="fade" transparent onRequestClose={() => setShowCountryPicker(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 16, width: "85%", maxHeight: "70%", padding: 16, elevation: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#333", marginBottom: 10 }}>Select Country Code</Text>
            <RNTextInput
              placeholder="Search country name or code..."
              value={countrySearch}
              onChangeText={setCountrySearch}
              placeholderTextColor="#888"
              autoFocus={true}
              style={{ borderWidth: 1.5, borderColor: "#1565C0", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, fontSize: 15, backgroundColor: "#fff", color: "#333" }}
            />
            <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
              {filteredCountryCodes.map((item, idx) => (
                <TouchableOpacity
                  key={item.name + idx}
                  onPress={() => {
                    setCountryCode(item.code);
                    const maxDigits = getPhoneLength(item.code);
                    const currentPhone = form.partner_phone?.replace(/\D/g, "") || "";
                    if (currentPhone.length > maxDigits) {
                      setForm((prev) => ({ ...prev, partner_phone: currentPhone.substring(0, maxDigits) }));
                    }
                    setPhoneError(null);
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
                    backgroundColor: countryCode === item.code ? "#E3F2FD" : "#fff",
                    borderRadius: 4,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: countryCode === item.code ? "700" : "400", color: countryCode === item.code ? "#1565C0" : "#333" }}>
                    {item.name}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: countryCode === item.code ? "#1565C0" : "#666" }}>
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

      {/* INVOICE PRINT MODAL */}
      <Modal visible={showInvoiceModal} animationType="slide" transparent onRequestClose={() => setShowInvoiceModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 16, width: "85%", padding: 20, elevation: 10 }}>
            {/* Header */}
            <Image
              source={require("@assets/images/logo.png")}
              style={{ width: 240, height: 96, resizeMode: "contain", alignSelf: "center", marginBottom: 10 }}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#333" }}>
                {invoiceType === "checkout" ? "Checkout Invoice" : invoiceType === "partial_return" ? "Partial Return Invoice" : "Check-In Invoice"}
              </Text>
              <TouchableOpacity onPress={() => setShowInvoiceModal(false)}>
                <Text style={{ fontSize: 22, color: "#999", fontWeight: "700" }}>X</Text>
              </TouchableOpacity>
            </View>

            {/* Order Info */}
            <View style={{ backgroundColor: "#F5F5F5", borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#333" }}>{form.name || "New Order"}</Text>
              <Text style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{form.partner_name || "No customer"}</Text>
              <Text style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Date: {form.date_order}</Text>
              <Text style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Tools: {lines.length} item(s)</Text>
            </View>

            {/* Paper Size Selection */}
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#555", marginBottom: 8 }}>Paper Size</Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
              {[{ key: "a4", label: "A4" }, { key: "a5", label: "A5" }].map((ps) => (
                <TouchableOpacity
                  key={ps.key}
                  onPress={() => setInvoicePaperSize(ps.key)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: invoicePaperSize === ps.key ? "#1565C0" : "#ddd",
                    backgroundColor: invoicePaperSize === ps.key ? "#E3F2FD" : "#fafafa",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: "700", color: invoicePaperSize === ps.key ? "#1565C0" : "#888" }}>
                    {ps.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
              {/* Download PDF */}
              <TouchableOpacity
                onPress={handleInvoiceDownload}
                disabled={invoiceDownloading || invoicePrinting || invoiceSendingWA}
                style={{
                  flex: 1,
                  backgroundColor: invoiceType === "checkout" ? "#1565C0" : "#7B1FA2",
                  paddingVertical: 14,
                  borderRadius: 10,
                  alignItems: "center",
                  opacity: invoiceDownloading ? 0.6 : 1,
                }}
              >
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
                  {invoiceDownloading ? "Downloading..." : "Download PDF"}
                </Text>
              </TouchableOpacity>

              {/* Print */}
              <TouchableOpacity
                onPress={handleInvoicePrint}
                disabled={invoiceDownloading || invoicePrinting || invoiceSendingWA}
                style={{
                  flex: 1,
                  backgroundColor: "#FF9800",
                  paddingVertical: 14,
                  borderRadius: 10,
                  alignItems: "center",
                  opacity: invoicePrinting ? 0.6 : 1,
                }}
              >
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
                  {invoicePrinting ? "Printing..." : "Print"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Send WhatsApp */}
            <TouchableOpacity
              onPress={handleInvoiceWhatsApp}
              disabled={invoiceDownloading || invoicePrinting || invoiceSendingWA}
              style={{
                backgroundColor: "#25D366",
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: "center",
                marginBottom: 10,
                opacity: invoiceSendingWA ? 0.6 : 1,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
                {invoiceSendingWA ? "Sending..." : "Send WhatsApp"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowInvoiceModal(false)}
              style={{ paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: "#F5F5F5" }}
            >
              <Text style={{ color: "#666", fontSize: 14, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView >
  );
};

// Check-Out Modal Styles
const coStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1565C0",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  closeBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  pricingRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  pricingItem: { flex: 1 },
  captureBtn: {
    backgroundColor: "#FFF8E1",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#FF9800",
    flex: 1,
  },
  captureBtnText: { fontSize: 13, fontWeight: "600", color: "#FF9800" },
  idProofBtnRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
});

// Check-In Modal Styles
const ciStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#4CAF50",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  closeBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  infoCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e8e8e8",
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  infoItem: { width: "50%", marginBottom: 10 },
  infoLabel: { fontSize: 11, color: "#999", fontWeight: "500", marginBottom: 2 },
  infoValue: { fontSize: 14, color: "#333", fontWeight: "600" },
  durationRow: {
    paddingTop: 6,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    marginTop: 4,
  },
  durationText: { fontSize: 14, color: "#333", fontWeight: "700", marginTop: 2 },
  lateWarning: {
    backgroundColor: "#FFF3E0",
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#FFB74D",
  },
  lateWarningText: { fontSize: 12, color: "#E65100", fontWeight: "600" },
  depositRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    paddingTop: 10,
    marginTop: 4,
  },
  depositLabel: { fontSize: 13, color: "#333", fontWeight: "500", marginLeft: 8, flex: 1 },
  depositAmt: { fontSize: 14, fontWeight: "700", color: "#4CAF50" },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#555",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 6,
  },
  toolCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e8e8e8",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  toolHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    marginBottom: 12,
  },
  toolNumBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "#4CAF50",
    alignItems: "center", justifyContent: "center",
  },
  toolNumText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  toolName: { fontSize: 15, fontWeight: "700", color: "#333" },
  toolSerial: { fontSize: 12, color: "#888", marginTop: 2 },
  fieldBlock: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#777", marginBottom: 6 },
  lateFeeSectionCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  lateFeeTitle: { fontSize: 13, fontWeight: "700", color: "#555", marginBottom: 10 },
  lateFeeGrid: { flexDirection: "row", gap: 8 },
  lateFeeItem: { flex: 1 },
  lateFeeLabel: { fontSize: 11, color: "#888", fontWeight: "500", marginBottom: 4 },
  readOnlyBox: {
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    alignItems: "center",
  },
  readOnlyText: { fontSize: 14, color: "#333", fontWeight: "500" },
  editableInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#ddd",
    fontSize: 14,
    color: "#333",
  },
  damageTitle: { fontSize: 13, fontWeight: "700", color: "#555", marginBottom: 10 },
  totalsCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  totalLabel: { fontSize: 13, fontWeight: "600", color: "#666" },
  totalValue: { fontSize: 15, fontWeight: "700", color: "#333" },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  confirmBtn: {
    flex: 2,
    backgroundColor: "#4CAF50",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#f0f0f0",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

const styles = StyleSheet.create({
  scroll: { padding: 14, paddingBottom: 30 },

  // Action Buttons
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  actionBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  cancelActionBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: "#f5f5f5", borderWidth: 1, borderColor: "#ddd" },
  cancelActionBtnText: { color: "#333", fontSize: 13, fontWeight: "600" },

  // Breadcrumb - Step indicator
  breadcrumbRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 16, paddingHorizontal: 4 },
  breadcrumbItem: { flexDirection: "row", alignItems: "center" },
  breadcrumbDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ddd" },
  breadcrumbDotActive: { backgroundColor: COLORS.primaryThemeColor, width: 12, height: 12, borderRadius: 6 },
  breadcrumbDotPast: { backgroundColor: "#4CAF50" },
  breadcrumbLabel: { fontSize: 9, color: "#aaa", marginLeft: 3, marginRight: 3, fontWeight: "500" },
  breadcrumbLabelActive: { color: COLORS.primaryThemeColor, fontWeight: "700", fontSize: 10 },
  breadcrumbLabelPast: { color: "#4CAF50", fontWeight: "600" },
  breadcrumbLine: { width: 16, height: 2, backgroundColor: "#ddd", marginHorizontal: 2 },
  breadcrumbLinePast: { backgroundColor: "#4CAF50" },

  // Section Cards
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  sectionCardTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primaryThemeColor,
    letterSpacing: 1,
    marginBottom: 12,
  },

  // Field Groups (vertical stacking)
  fieldGroup: { marginBottom: 8 },
  inputLabel: { fontSize: 12, fontWeight: "600", color: "#666", marginBottom: 4 },

  // 2-column layout
  row2Col: { flexDirection: "row", gap: 12, marginBottom: 8 },
  colHalf: { flex: 1 },

  // Info rows (read-only horizontal)
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  infoLabel: { fontSize: 13, color: "#888" },
  infoValue: { fontSize: 14, fontWeight: "500", color: COLORS.black },

  errorText: { color: COLORS.red, fontSize: 11, marginTop: 2 },

  // Period Chips
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  periodChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "#f0f0f0", borderWidth: 1, borderColor: "#e0e0e0" },
  periodChipActive: { backgroundColor: COLORS.primaryThemeColor, borderColor: COLORS.primaryThemeColor },
  periodChipText: { fontSize: 13, color: "#666", fontWeight: "500" },
  periodChipTextActive: { color: "#fff", fontWeight: "600" },

  // Condition Chips
  condChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, borderWidth: 1, borderColor: "#ddd", backgroundColor: "#f9f9f9" },
  condChipActive: { backgroundColor: COLORS.primaryThemeColor, borderColor: COLORS.primaryThemeColor },
  condChipText: { fontSize: 11, color: "#666" },
  condChipTextActive: { color: "#fff", fontWeight: "600" },

  // Customer autocomplete
  selectedCustomerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0ebff",
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#d9d0f0",
  },
  selectedCustomerInfo: { flex: 1, marginRight: 8 },
  selectedCustomerName: { fontSize: 15, fontWeight: "700", color: COLORS.black },
  selectedCustomerSub: { fontSize: 12, color: "#666", marginTop: 2 },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  clearBtnSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  clearBtnText: { fontSize: 11, fontWeight: "700", color: "#555" },

  // Dropdowns
  dropdown: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 200,
    elevation: 6,
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  toolDropdown: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 180,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  dropdownItemName: { fontSize: 14, fontWeight: "600", color: COLORS.black },
  dropdownItemSub: { fontSize: 11, color: "#888", marginTop: 2 },
  dropdownEmpty: { fontSize: 12, color: "#aaa", textAlign: "center", paddingVertical: 14 },

  // Tabs
  tabRow: { flexDirection: "row", marginTop: 4, marginBottom: 4, backgroundColor: COLORS.white, borderRadius: 10, padding: 4, elevation: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8 },
  tabActive: { backgroundColor: COLORS.primaryThemeColor },
  tabText: { fontSize: 11, fontWeight: "600", color: "#888" },
  tabTextActive: { color: "#fff", fontWeight: "700" },
  tabContent: { paddingTop: 12, minHeight: 100 },

  // Rental Line Cards
  lineCard: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primaryThemeColor,
  },
  lineCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  lineCardNum: { fontSize: 13, fontWeight: "700", color: COLORS.primaryThemeColor },
  removeLineBtnText: { fontSize: 12, color: COLORS.red, fontWeight: "600" },
  lineInfoText: { fontSize: 14, fontWeight: "500", color: COLORS.black },
  lineInfoSub: { fontSize: 11, color: "#888", marginTop: 2 },

  // Tool autocomplete in lines
  selectedToolRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0ebff",
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  selectedToolName: { fontSize: 13, fontWeight: "600", color: COLORS.black },
  selectedToolSub: { fontSize: 11, color: "#888" },

  // Line metrics (Price / Duration / Total)
  lineMetricsRow: { flexDirection: "row", marginTop: 8, gap: 8 },
  lineMetric: { flex: 1 },
  lineMetricLabel: { fontSize: 11, fontWeight: "600", color: "#888", marginBottom: 4 },
  lineMetricValue: { fontSize: 13, fontWeight: "500", color: COLORS.black },
  lineTotalText: { fontSize: 15, fontWeight: "700", color: COLORS.primaryThemeColor, textAlign: "right" },

  conditionDisplayRow: { flexDirection: "row", gap: 12, paddingVertical: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#f0f0f0", marginTop: 8 },
  conditionDisplayText: { fontSize: 11, color: "#888", textTransform: "capitalize" },

  addLineBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.primaryThemeColor,
    borderStyle: "dashed",
    alignItems: "center",
    marginBottom: 10,
  },
  addLineBtnText: { fontSize: 14, color: COLORS.primaryThemeColor, fontWeight: "600" },
  emptyTabText: { fontSize: 13, color: "#aaa", textAlign: "center", paddingTop: 30 },

  // Line Totals
  lineTotals: { marginTop: 12, paddingTop: 12, borderTopWidth: 2, borderTopColor: "#e0e0e0", backgroundColor: COLORS.white, borderRadius: 10, padding: 14 },
  lineTotalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  lineTotalLabel: { fontSize: 13, color: "#888" },
  lineTotalValue: { fontSize: 13, fontWeight: "600", color: COLORS.black },
  grandTotalRow: { borderTopWidth: 1, borderTopColor: "#e0e0e0", marginTop: 6, paddingTop: 10 },
  grandTotalLabel: { fontSize: 16, fontWeight: "700", color: COLORS.primaryThemeColor },
  grandTotalValue: { fontSize: 16, fontWeight: "700", color: COLORS.primaryThemeColor },

  // Timesheet
  tsRow: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f0f0f0", gap: 10 },
  tsLeft: { width: 100 },
  tsUser: { fontSize: 12, fontWeight: "600", color: COLORS.primaryThemeColor },
  tsTime: { fontSize: 10, color: "#888" },
  tsNote: { fontSize: 12, color: COLORS.black, flex: 1 },

  // Checkout detail tab
  detailLabel2: { fontSize: 13, fontWeight: "600", color: "#888", marginTop: 6 },
  detailValue2: { fontSize: 13, color: COLORS.black, marginBottom: 4 },

  // ======= MODAL =======
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center" },
  modalContent: { backgroundColor: "#fff", marginHorizontal: 12, marginVertical: 40, borderRadius: 12, padding: 16, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: COLORS.black },
  modalClose: { fontSize: 18, fontWeight: "700", color: "#888", padding: 4 },

  modalInfoRow: { flexDirection: "row", marginBottom: 8 },
  modalLabel: { fontSize: 11, color: "#888" },
  modalValue: { fontSize: 13, color: COLORS.black, fontWeight: "500" },

  modalSection: { fontSize: 13, fontWeight: "700", color: "#333", marginTop: 16, marginBottom: 8, letterSpacing: 0.5 },
  modalFieldLabel: { fontSize: 11, fontWeight: "600", color: "#888", marginBottom: 4 },

  modalToolCard: { backgroundColor: "#f8f8f8", borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "#eee" },
  modalToolRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  modalToolRow2: { flexDirection: "row", marginTop: 6 },
  modalToolName: { fontSize: 13, fontWeight: "600", color: COLORS.black },
  modalToolSerial: { fontSize: 11, color: "#888" },
  modalToolDetail: { fontSize: 12, color: "#888" },
  modalToolTotal: { fontSize: 13, fontWeight: "700", color: COLORS.primaryThemeColor },

  // Photo button
  photoBtn: { marginTop: 8, backgroundColor: "#f0f0f0", borderRadius: 6, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "#ddd", borderStyle: "dashed" },
  photoBtnDone: { backgroundColor: "#E8F5E9", borderColor: "#4CAF50", borderStyle: "solid" },
  photoBtnText: { fontSize: 12, color: "#888" },
  photoBtnTextDone: { color: "#2E7D32", fontWeight: "600" },

  // ID Proof
  idProofRow: { flexDirection: "row", gap: 10 },
  idProofBtn: { flex: 1, backgroundColor: "#f5f5f5", borderRadius: 6, padding: 12, alignItems: "center", borderWidth: 1, borderColor: "#ddd" },
  idProofBtnDone: { backgroundColor: "#E8F5E9", borderColor: "#4CAF50" },
  idProofBtnText: { fontSize: 12, color: "#888", fontWeight: "500" },
  idProofBtnTextDone: { color: "#2E7D32", fontWeight: "600" },

  // Signature
  signBox: { backgroundColor: "#FFF8E1", borderRadius: 8, paddingVertical: 28, paddingHorizontal: 20, alignItems: "center", borderWidth: 1.5, borderColor: "#FF9800", borderStyle: "dashed", marginBottom: 10 },
  signBoxDone: { backgroundColor: "#E8F5E9", borderColor: "#4CAF50", borderStyle: "solid" },
  signBoxText: { fontSize: 14, color: "#FF9800", fontWeight: "600" },
  signBoxTextDone: { color: "#2E7D32", fontWeight: "700" },

  // Checkbox
  checkboxRow: { flexDirection: "row", alignItems: "center", paddingTop: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 3, borderWidth: 2, borderColor: "#999", justifyContent: "center", alignItems: "center", marginRight: 8 },
  checkboxChecked: { backgroundColor: COLORS.primaryThemeColor, borderColor: COLORS.primaryThemeColor },
  checkMark: { color: "#fff", fontSize: 13, fontWeight: "700" },
  checkboxLabel: { fontSize: 13, color: COLORS.black, fontWeight: "500" },

  // Total Damage
  totalDamageRow: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#ddd", marginTop: 8, gap: 12 },
  totalDamageLabel: { fontSize: 13, fontWeight: "600", color: "#888" },
  totalDamageValue: { fontSize: 14, fontWeight: "700", color: COLORS.black },

  // Modal buttons
  modalBtnRow: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 6, alignItems: "center" },
  modalBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Captured image previews
  capturedImageWrap: { position: "relative", marginTop: 8, marginBottom: 8, backgroundColor: "#f9f9f9", borderRadius: 8, borderWidth: 1, borderColor: "#eee" },
  capturedImage: { width: "100%", height: 220, borderRadius: 8, resizeMode: "contain" },
  capturedIdProof: { width: "100%", height: 250, borderRadius: 8, resizeMode: "contain" },
  capturedSignature: { width: "100%", height: 160, borderRadius: 8, resizeMode: "contain", backgroundColor: "#fff" },
  photoRemoveBtn: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.6)", width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  photoRemoveBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  photoTimestamp: { fontSize: 10, color: "#999", textAlign: "center", paddingVertical: 4 },

  // Discount modal
  discountTypeBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: "#ccc", alignItems: "center", backgroundColor: "#f5f5f5" },
  discountTypeBtnActive: { borderColor: "#E65100", backgroundColor: "#FFF3E0" },
  discountTypeBtnText: { fontSize: 14, fontWeight: "600", color: "#888" },
  discountTypeBtnTextActive: { color: "#E65100" },

  // Bottom action buttons
  bottomBtnRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  bottomBtn: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: "center" },
  bottomBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Signature Pad Modal
  signPadModal: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, height: "60%", marginTop: "auto" },
  signToolsColumn: { width: 160, paddingRight: 12, borderRightWidth: 1, borderRightColor: '#eee' },
  toolsTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  toolBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#f6f6f6', marginTop: 6 },
  toolBtnActive: { backgroundColor: '#E3F2FD' },
  toolBtnText: { color: '#333' },
  sizeBtn: { width: 32, height: 32, borderRadius: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' },
  colorDot: { width: 28, height: 28, borderRadius: 14, marginRight: 8, marginBottom: 8, borderColor: '#fff' },
  toolActionBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee', alignItems: 'center' },
  signPadHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  signPadTitle: { fontSize: 18, fontWeight: "700", color: COLORS.black },
  signPadCanvas: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: "#ddd", overflow: "hidden" },
  signPadBtnRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  signPadBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  signPadBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Detail Tabs
  detailInfoCard: { backgroundColor: "#f8f9fa", padding: 14, borderRadius: 10, marginBottom: 14, borderWidth: 1, borderColor: "#eee" },
  detailSmallLabel: { fontSize: 11, color: "#888", marginBottom: 2 },
  detailSmallValue: { fontSize: 14, fontWeight: "700", color: "#333" },
  detailSectionTitle: { fontSize: 13, fontWeight: "700", color: "#555", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  detailToolCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, marginBottom: 10 },
  detailImageWrap: { backgroundColor: "#f9f9f9", borderRadius: 10, borderWidth: 1, borderColor: "#eee", padding: 8, marginBottom: 14, overflow: "hidden" },
  conditionBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  conditionBadgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
});

export default RentalOrderFormScreen;
