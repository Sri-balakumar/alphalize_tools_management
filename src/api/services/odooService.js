import * as FileSystem from "expo-file-system";
import {
  odooSearchRead,
  odooCreate,
  odooWrite,
  odooRead,
  odooCallMethod,
  downloadReportPdf,
  sendWhatsAppDocument,
} from "./odooApi";

// =============================================
// TOOL CATEGORIES - rental.tool.category
// =============================================

export const fetchCategories = async (auth) => {
  const records = await odooSearchRead(
    auth,
    "rental.tool.category",
    [["active", "=", true]],
    ["name", "code", "description", "parent_id", "tool_count", "child_count"],
    { order: "name" }
  );
  return records.map((r) => ({
    id: String(r.id),
    odoo_id: r.id,
    name: r.name,
    code: r.code || "",
    description: r.description || "",
    parent_id: r.parent_id ? String(r.parent_id[0]) : "",
    tool_count: r.tool_count || 0,
  }));
};

// =============================================
// TOOLS - rental.tool
// =============================================

const TOOL_FIELDS = [
  "name", "code", "serial_number", "barcode", "brand", "model_name",
  "location", "state", "category_id", "total_qty", "available_qty",
  "rental_price_per_day", "late_fee_per_day", "tax_rate",
  "purchase_price", "purchase_date", "description",
  "total_rental_count", "total_revenue", "active", "image",
];

export const fetchTools = async (auth, domain = []) => {
  const baseDomain = [["active", "=", true], ...domain];
  const records = await odooSearchRead(auth, "rental.tool", baseDomain, TOOL_FIELDS, { order: "name" });
  return records.map(mapTool);
};

export const fetchToolsByCategory = async (auth, categoryId) => {
  return fetchTools(auth, [["category_id", "=", Number(categoryId)]]);
};

export const fetchToolById = async (auth, id) => {
  const records = await odooRead(auth, "rental.tool", [Number(id)], TOOL_FIELDS);
  return records.length ? mapTool(records[0]) : null;
};

export const createTool = async (auth, values) => {
  const odooValues = {
    name: values.name,
    code: values.code || false,
    serial_number: values.serial_number || false,
    barcode: values.barcode || false,
    brand: values.brand || false,
    model_name: values.model_name || false,
    location: values.location || false,
    state: values.state || "available",
    category_id: values.category_id ? Number(values.category_id) : false,
    total_qty: parseFloat(values.total_qty) || 1,
    purchase_price: parseFloat(values.purchase_price) || 0,
    purchase_date: values.purchase_date || false,
    description: values.description || false,
  };
  const newId = await odooCreate(auth, "rental.tool", odooValues);
  return newId;
};

export const updateTool = async (auth, id, values) => {
  const odooValues = {};
  if (values.name !== undefined) odooValues.name = values.name;
  if (values.code !== undefined) odooValues.code = values.code || false;
  if (values.serial_number !== undefined) odooValues.serial_number = values.serial_number || false;
  if (values.barcode !== undefined) odooValues.barcode = values.barcode || false;
  if (values.brand !== undefined) odooValues.brand = values.brand || false;
  if (values.model_name !== undefined) odooValues.model_name = values.model_name || false;
  if (values.location !== undefined) odooValues.location = values.location || false;
  if (values.state !== undefined) odooValues.state = values.state;
  if (values.category_id !== undefined) odooValues.category_id = values.category_id ? Number(values.category_id) : false;
  if (values.total_qty !== undefined) odooValues.total_qty = parseFloat(values.total_qty) || 1;
  if (values.purchase_price !== undefined) odooValues.purchase_price = parseFloat(values.purchase_price) || 0;
  if (values.purchase_date !== undefined) odooValues.purchase_date = values.purchase_date || false;
  if (values.description !== undefined) odooValues.description = values.description || false;
  if (values.image !== undefined) odooValues.image = values.image || false;

  await odooWrite(auth, "rental.tool", [Number(id)], odooValues);
  return true;
};

// Generate serialized products (like the Odoo wizard)
export const generateSerializedProducts = async (auth, { productName, listPrice, lateFeePerDay, categoryId, serialNumbers, image }) => {
  const created = [];
  for (const serial of serialNumbers) {
    const vals = {
      name: productName,
      default_code: serial,
      list_price: parseFloat(listPrice) || 0,
      rental_late_fee_per_day: parseFloat(lateFeePerDay) || 0,
      is_rental_tool: true,
      type: "consu",
    };
    if (categoryId) vals.rental_category_id = Number(categoryId);
    if (image) vals.image_1920 = image;
    const newId = await odooCreate(auth, "product.product", vals);
    created.push(newId);
  }
  return created;
};

const mapTool = (r) => ({
  id: String(r.id),
  odoo_id: r.id,
  name: r.name,
  code: r.code || "",
  serial_number: r.serial_number || "",
  barcode: r.barcode || "",
  brand: r.brand || "",
  model_name: r.model_name || "",
  location: r.location || "",
  state: r.state || "available",
  category_id: r.category_id ? String(r.category_id[0]) : "",
  category_name: r.category_id ? r.category_id[1] : "",
  total_qty: r.total_qty || 0,
  available_qty: r.available_qty || 0,
  rental_price_per_day: String(r.rental_price_per_day || "0"),
  late_fee_per_day: String(r.late_fee_per_day || "0"),
  tax_rate: r.tax_rate || 0,
  purchase_price: String(r.purchase_price || "0"),
  purchase_date: r.purchase_date || "",
  description: r.description || "",
  total_rental_count: r.total_rental_count || 0,
  total_revenue: String(r.total_revenue || "0"),
  image: r.image || null,
});

// =============================================
// RENTAL ORDERS - rental.order
// =============================================

const ORDER_FIELDS = [
  "name", "state", "partner_id", "partner_phone", "partner_email",
  "date_order", "date_planned_checkout", "date_planned_checkin",
  "date_checkout", "date_checkin", "rental_period_type", "rental_duration",
  "actual_duration", "actual_duration_display", "advance_amount", "payment_method",
  "advance_returned", "checkin_payment_method", "cash_received", "checkin_cash_received",
  "amount_due", "subtotal", "late_fee", "tax_total", "damage_charges",
  "discount_amount", "discount_authorized_by", "total_amount",
  "invoice_id", "invoice_state", "notes", "terms",
  "is_late", "user_id", "customer_code",
  "line_ids",
];

// Image / signature Binary fields (fetched separately to avoid slowing list views)
const ORDER_IMAGE_FIELDS = [
  "customer_signature", "id_proof_front", "id_proof_back",
  "checkin_customer_signature", "checkin_signature",
  "discount_auth_signature", "discount_auth_photo",
];

const ORDER_LINE_FIELDS = [
  "tool_id", "serial_number", "pricing_id", "unit_price", "quantity",
  "period_type", "planned_duration", "actual_duration", "actual_duration_display",
  "returned_qty", "pending_qty", "rental_cost", "late_fee_amount", "total_cost",
  "checkout_condition", "checkin_condition", "damage_note", "damage_charge",
  "tax_ids", "tax_amount", "price_before_tax",
  "discount_type", "discount_value", "discount_line_amount", "notes",
];

const ORDER_LINE_IMAGE_FIELDS = [
  "checkout_tool_image",
  "checkin_tool_image",
];

export const fetchOrders = async (auth, domain = []) => {
  const records = await odooSearchRead(auth, "rental.order", domain, ORDER_FIELDS, { order: "id desc", limit: 200 });
  // Collect all line IDs and fetch them in one batch for performance
  const allLineIds = [];
  const lineIdMap = {};
  for (const r of records) {
    if (r.line_ids && r.line_ids.length > 0) {
      for (const lid of r.line_ids) {
        allLineIds.push(lid);
        if (!lineIdMap[lid]) lineIdMap[lid] = [];
        lineIdMap[lid].push(r.id);
      }
    }
  }

  let allLines = [];
  if (allLineIds.length > 0) {
    try {
      allLines = await odooRead(auth, "rental.order.line", allLineIds, ORDER_LINE_FIELDS);
    } catch (e) {
      console.warn("Failed to fetch order lines:", e.message);
    }
  }

  // Group lines by order
  const linesByOrder = {};
  for (const line of allLines) {
    // Find which order(s) this line belongs to
    for (const r of records) {
      if (r.line_ids && r.line_ids.includes(line.id)) {
        if (!linesByOrder[r.id]) linesByOrder[r.id] = [];
        linesByOrder[r.id].push(line);
        break;
      }
    }
  }

  return records.map((r) => mapOrder(r, linesByOrder[r.id] || []));
};

export const fetchOrderById = async (auth, id) => {
  // Fetch order fields + image fields together for single-order view
  const records = await odooRead(auth, "rental.order", [Number(id)], [...ORDER_FIELDS, ...ORDER_IMAGE_FIELDS]);
  if (!records.length) return null;
  const r = records[0];
  let lines = [];
  if (r.line_ids && r.line_ids.length > 0) {
    try {
      lines = await odooRead(auth, "rental.order.line", r.line_ids, [...ORDER_LINE_FIELDS, ...ORDER_LINE_IMAGE_FIELDS]);
    } catch (e) {
      // Fallback if checkin_tool_image doesn't exist yet
      lines = await odooRead(auth, "rental.order.line", r.line_ids, [...ORDER_LINE_FIELDS, "checkout_tool_image"]);
    }
  }
  // Fetch timesheet
  let timesheet = [];
  try {
    timesheet = await odooSearchRead(
      auth, "rental.timesheet",
      [["order_id", "=", Number(id)]],
      ["date", "action", "notes", "user_id", "duration_days", "cost_impact"],
      { order: "date desc, id desc" }
    );
  } catch (e) {
    // Timesheet may not exist
  }
  return mapOrder(r, lines, timesheet);
};

// Lightweight fetch: order data + lines WITHOUT images (fast refresh for form screen)
export const fetchOrderDataById = async (auth, id) => {
  const records = await odooRead(auth, "rental.order", [Number(id)], ORDER_FIELDS);
  if (!records.length) return null;
  const r = records[0];
  let lines = [];
  if (r.line_ids && r.line_ids.length > 0) {
    lines = await odooRead(auth, "rental.order.line", r.line_ids, ORDER_LINE_FIELDS);
  }
  let timesheet = [];
  try {
    timesheet = await odooSearchRead(
      auth, "rental.timesheet",
      [["order_id", "=", Number(id)]],
      ["date", "action", "notes", "user_id", "duration_days", "cost_impact"],
      { order: "date desc, id desc" }
    );
  } catch (e) {
    // Timesheet model may not exist
  }
  return mapOrder(r, lines, timesheet);
};

// Timestamp & signer-name fields that exist on rental.order (matches Odoo model exactly)
const ORDER_IMAGE_DATE_FIELDS = [
  "checkout_signature_date",
  "checkin_customer_signature_date",
  "checkin_signature_date",
  "checkin_signer_name",
  "discount_applied_date",
];

// Fetch only image/signature fields for a single order (lightweight call for form screen)
// In-memory image cache to avoid re-fetching binary data on every focus
const _imageCache = {};
const _imageCacheTime = {};
const IMAGE_CACHE_MS = 120000; // 2 minutes

export const fetchOrderImages = async (auth, id) => {
  const cacheKey = `order_${id}`;
  if (_imageCache[cacheKey] && Date.now() - (_imageCacheTime[cacheKey] || 0) < IMAGE_CACHE_MS) {
    return _imageCache[cacheKey];
  }
  const fields = [...ORDER_IMAGE_FIELDS, "discount_authorized_by", ...ORDER_IMAGE_DATE_FIELDS];
  let records;
  try {
    records = await odooRead(auth, "rental.order", [Number(id)], fields);
  } catch (e) {
    // Fallback: timestamp fields may not exist
    records = await odooRead(auth, "rental.order", [Number(id)], [...ORDER_IMAGE_FIELDS, "discount_authorized_by"]);
  }
  if (!records.length) return null;
  const r = records[0];
  const result = {
    customer_signature: r.customer_signature || false,
    id_proof_front: r.id_proof_front || false,
    id_proof_back: r.id_proof_back || false,
    checkin_customer_signature: r.checkin_customer_signature || false,
    checkin_signature: r.checkin_signature || false,
    discount_auth_signature: r.discount_auth_signature || false,
    discount_auth_photo: r.discount_auth_photo || false,
    discount_authorized_by: r.discount_authorized_by || "",
    checkout_signature_date: r.checkout_signature_date || false,
    checkin_customer_signature_date: r.checkin_customer_signature_date || false,
    checkin_signature_date: r.checkin_signature_date || false,
    checkin_signer_name: r.checkin_signer_name || "",
    discount_applied_date: r.discount_applied_date || false,
    checkout_condition: r.checkout_condition || "",
    checkin_condition: r.checkin_condition || "",
  };
  _imageCache[cacheKey] = result;
  _imageCacheTime[cacheKey] = Date.now();
  return result;
};

export const createOrder = async (auth, values, lineValues = []) => {
  const odooValues = {
    partner_id: values.partner_id ? Number(values.partner_id) : false,
    date_planned_checkout: values.date_planned_checkout || false,
    date_planned_checkin: values.date_planned_checkin || false,
    rental_period_type: values.rental_period_type || "day",
    rental_duration: parseFloat(values.rental_duration) || 1,
    advance_amount: parseFloat(values.advance_amount) || 0,
    notes: values.notes || false,
    terms: values.terms || false,
  };

  // Create order lines as One2many commands
  if (lineValues.length > 0) {
    odooValues.line_ids = lineValues.map((l) => [
      0, 0, {
        tool_id: l.tool_id ? Number(l.tool_id) : false,
        unit_price: parseFloat(l.unit_price) || 0,
        quantity: parseFloat(l.quantity) || 1,
        planned_duration: parseFloat(l.planned_duration) || 1,
        period_type: l.period_type || "day",
      },
    ]);
  }

  const newId = await odooCreate(auth, "rental.order", odooValues);
  return newId;
};

export const updateOrderValues = async (auth, id, values) => {
  await odooWrite(auth, "rental.order", [Number(id)], values);
  // Invalidate image cache if images were updated
  delete _imageCache[`order_${id}`];
  delete _imageCacheTime[`order_${id}`];
  return true;
};

export const updateOrderLineValues = async (auth, lineId, values) => {
  await odooWrite(auth, "rental.order.line", [Number(lineId)], values);
  // Invalidate any line image cache containing this line
  Object.keys(_imageCache).forEach((k) => {
    if (k.startsWith("lines_") && k.includes(String(lineId))) {
      delete _imageCache[k];
      delete _imageCacheTime[k];
    }
  });
  return true;
};

export const fetchOrderLineImages = async (auth, lineIds) => {
  if (!lineIds || !lineIds.length) return [];
  const cacheKey = `lines_${lineIds.sort().join(",")}`;
  if (_imageCache[cacheKey] && Date.now() - (_imageCacheTime[cacheKey] || 0) < IMAGE_CACHE_MS) {
    return _imageCache[cacheKey];
  }
  const allFields = ["checkout_tool_image", "checkout_condition", "checkin_condition", "checkin_tool_image"];
  let records;
  try {
    records = await odooRead(auth, "rental.order.line", lineIds.map(Number), allFields);
  } catch (e) {
    records = await odooRead(auth, "rental.order.line", lineIds.map(Number), allFields.slice(0, 3));
  }
  const result = records.map((r) => ({
    id: r.id,
    checkout_tool_image: r.checkout_tool_image || false,
    checkin_tool_image: r.checkin_tool_image || false,
    checkout_condition: r.checkout_condition || "",
    checkin_condition: r.checkin_condition || "",
  }));
  _imageCache[cacheKey] = result;
  _imageCacheTime[cacheKey] = Date.now();
  return result;
};

// Workflow actions (call Odoo model methods)
export const confirmOrder = async (auth, id) => {
  return odooCallMethod(auth, "rental.order", "action_confirm", [Number(id)]);
};

export const cancelOrder = async (auth, id) => {
  return odooCallMethod(auth, "rental.order", "action_cancel", [Number(id)]);
};

export const markDone = async (auth, id) => {
  return odooCallMethod(auth, "rental.order", "action_done", [Number(id)]);
};

export const createInvoice = async (auth, id) => {
  return odooCallMethod(auth, "rental.order", "action_create_invoice", [Number(id)]);
};

// Invoice PDF reports
export const downloadCheckoutInvoice = async (auth, orderId, paperSize = "a4") => {
  const reportName = paperSize === "a5"
    ? "tools_rental_management.report_checkout_invoice_a5"
    : "tools_rental_management.report_checkout_invoice";
  return downloadReportPdf(auth, reportName, Number(orderId));
};

export const downloadCheckinInvoice = async (auth, orderId, paperSize = "a4") => {
  const reportName = paperSize === "a5"
    ? "tools_rental_management.report_checkin_invoice_a5"
    : "tools_rental_management.report_checkin_invoice";
  return downloadReportPdf(auth, reportName, Number(orderId));
};

// Send invoice PDF via WhatsApp
export const sendInvoiceWhatsApp = async (auth, orderId, invoiceType, customerPhone, paperSize = "a4") => {
  let reportName;
  if (invoiceType === "checkout") {
    reportName = paperSize === "a5"
      ? "tools_rental_management.report_checkout_invoice_a5"
      : "tools_rental_management.report_checkout_invoice";
  } else {
    reportName = paperSize === "a5"
      ? "tools_rental_management.report_checkin_invoice_a5"
      : "tools_rental_management.report_checkin_invoice";
  }

  const pdfUri = await downloadReportPdf(auth, reportName, Number(orderId));
  const base64Data = await FileSystem.readAsStringAsync(pdfUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const filename = `${invoiceType === "checkout" ? "Checkout" : "CheckIn"}_Invoice_${orderId}.pdf`;
  return sendWhatsAppDocument(auth, customerPhone, base64Data, filename, filename);
};

// Re-export for direct use
export { sendWhatsAppDocument };

// Fetch company details from Odoo
export const fetchCompanyDetails = async (auth) => {
  const result = await odooSearchRead(auth, "res.company", [], ["name", "phone", "email", "street", "street2", "city", "zip", "state_id", "country_id"], 1);
  if (result && result.length > 0) {
    const c = result[0];
    return {
      name: c.name || "Tool Management",
      phone: c.phone || "",
      email: c.email || "",
      street: c.street || "",
      street2: c.street2 || "",
      city: c.city || "",
      zip: c.zip || "",
      state: c.state_id ? c.state_id[1] : "",
      country: c.country_id ? c.country_id[1] : "",
    };
  }
  return { name: "Tool Management", phone: "", email: "", street: "", street2: "", city: "", zip: "", state: "", country: "" };
};

// Checkout wizard
export const openCheckoutWizard = async (auth, orderId) => {
  return odooCallMethod(auth, "rental.order", "action_checkout", [Number(orderId)]);
};

// Checkin wizard
export const openCheckinWizard = async (auth, orderId) => {
  return odooCallMethod(auth, "rental.order", "action_checkin", [Number(orderId)]);
};

const mapOrder = (r, lines = [], timesheet = []) => ({
  id: String(r.id),
  odoo_id: r.id,
  name: r.name || "New",
  state: r.state || "draft",
  customer_id: r.customer_code || "",
  partner_id: r.partner_id ? r.partner_id[0] : null,
  partner_name: r.partner_id ? r.partner_id[1] : "",
  partner_phone: r.partner_phone || "",
  partner_email: r.partner_email || "",
  responsible: r.user_id ? r.user_id[1] : "Admin",
  date_order: r.date_order || "",
  date_planned_checkout: r.date_planned_checkout || "",
  date_planned_checkin: r.date_planned_checkin || "",
  date_checkout: r.date_checkout || "",
  date_checkin: r.date_checkin || "",
  rental_period_type: r.rental_period_type || "day",
  rental_duration: String(r.rental_duration || 1),
  actual_duration: r.actual_duration_display || "",
  date_checkout_raw: r.date_checkout || "",
  date_checkin_raw: r.date_checkin || "",
  advance_amount: String(r.advance_amount || 0),
  payment_method: r.payment_method || "",
  advance_returned: r.advance_returned || false,
  checkin_payment_method: r.checkin_payment_method || "",
  amount_due: r.amount_due || 0,
  invoice_id: r.invoice_id ? r.invoice_id[0] : null,
  invoice_state: r.invoice_state || false,
  discount_amount: String(r.discount_amount || 0),
  discount_authorized_by: r.discount_authorized_by || "",
  damage_charges: String(r.damage_charges || 0),
  total_amount: r.total_amount || 0,
  subtotal: r.subtotal || 0,
  late_fee: r.late_fee || 0,
  notes: r.notes || "",
  terms: r.terms || "",
  is_late: r.is_late || false,
  // Image / signature base64 strings (false if empty)
  customer_signature: r.customer_signature || false,
  id_proof_front: r.id_proof_front || false,
  id_proof_back: r.id_proof_back || false,
  checkin_customer_signature: r.checkin_customer_signature || false,
  checkin_signature: r.checkin_signature || false,
  discount_auth_signature: r.discount_auth_signature || false,
  discount_auth_photo: r.discount_auth_photo || false,
  lines: lines.map(mapOrderLine),
  timesheet: timesheet.map(mapTimesheet),
});

const mapOrderLine = (l) => ({
  id: String(l.id),
  odoo_id: l.id,
  tool_name: l.tool_id ? l.tool_id[1] : "",
  tool_id: l.tool_id ? l.tool_id[0] : null,
  serial_number: l.serial_number || "",
  pricing_rule: l.pricing_id ? l.pricing_id[1] : "",
  unit_price: String(l.unit_price || 0),
  quantity: String(l.quantity || 1),
  period_type: l.period_type || "day",
  planned_duration: String(l.planned_duration || 1),
  actual_duration: l.actual_duration_display || "",
  returned_qty: String(l.returned_qty || 0),
  pending_qty: l.pending_qty || 0,
  rental_cost: l.rental_cost || 0,
  late_fee_amount: String(l.late_fee_amount || 0),
  total_cost: l.total_cost || 0,
  checkout_condition: l.checkout_condition || "",
  checkin_condition: l.checkin_condition || "",
  damage_note: l.damage_note || "",
  damage_charge: String(l.damage_charge || 0),
  discount_type: l.discount_type || "",
  discount_value: String(l.discount_value || 0),
  discount_line_amount: l.discount_line_amount || 0,
  notes: l.notes || "",
  extra_days: String(Math.max(0, (parseInt(l.actual_duration) || 0) - (parseInt(l.planned_duration) || 0))),
  late_fee_per_day: String(l.late_fee_per_day || 0),
  tax_ids: l.tax_ids ? l.tax_ids.map(t => ({ name: Array.isArray(t) ? t[1] : t })) : [],
  tax_amount: String(l.tax_amount || 0),
  price_before_tax: String(l.price_before_tax || 0),
  checkout_tool_image: l.checkout_tool_image || false,
});

const mapTimesheet = (t) => ({
  id: String(t.id),
  date: t.date || "",
  time: "",
  action: t.action || "note",
  notes: t.notes || "",
  user: t.user_id ? t.user_id[1] : "Admin",
});

// =============================================
// CUSTOMERS - res.partner
// =============================================

export const fetchCustomers = async (auth) => {
  // Fetch all partners (individuals) - Odoo module uses domain [('is_company','=',False)]
  // But also include customer_rank > 0 as fallback for broader results
  const records = await odooSearchRead(
    auth,
    "res.partner",
    ["|", ["customer_rank", ">", 0], ["is_company", "=", false]],
    ["name", "phone", "email", "customer_rank", "street", "city", "id_proof_front", "id_proof_back"],
    { order: "name", limit: 200 }
  );
  return records.map((r) => ({
    id: String(r.id),
    odoo_id: r.id,
    name: r.name || "",
    customer_code: "",
    phone: r.phone || "",
    email: r.email || "",
    rental_count: 0,
    total_revenue: "0",
    id_proof_front: r.id_proof_front || false,
    id_proof_back: r.id_proof_back || false,
  }));
};

export const searchCustomers = async (auth, query) => {
  const records = await odooSearchRead(
    auth,
    "res.partner",
    ["|", "|", ["name", "ilike", query], ["phone", "ilike", query], ["email", "ilike", query]],
    ["name", "phone", "email", "customer_rank", "street", "city"],
    { order: "name", limit: 50 }
  );
  return records.map((r) => ({
    id: String(r.id),
    odoo_id: r.id,
    name: r.name || "",
    customer_code: "",
    phone: r.phone || "",
    email: r.email || "",
    rental_count: 0,
    total_revenue: "0",
  }));
};

export const createCustomer = async (auth, values) => {
  const odooValues = {
    name: values.name,
    phone: values.phone || false,
    email: values.email || false,
    customer_rank: 1,
  };
  const newId = await odooCreate(auth, "res.partner", odooValues);
  return newId;
};

export const updateCustomer = async (auth, customerId, values) => {
  const odooValues = {};
  if (values.phone !== undefined) {
    odooValues.phone = values.phone || false;
  }
  if (values.email !== undefined) {
    odooValues.email = values.email || false;
  }
  if (values.name !== undefined) {
    odooValues.name = values.name;
  }
  if (values.id_proof_front !== undefined) {
    odooValues.id_proof_front = values.id_proof_front || false;
  }
  if (values.id_proof_back !== undefined) {
    odooValues.id_proof_back = values.id_proof_back || false;
  }
  await odooWrite(auth, "res.partner", [customerId], odooValues);
};

export const fetchCustomerImages = async (auth, partnerId) => {
  const records = await odooRead(auth, "res.partner", [Number(partnerId)], ["id_proof_front", "id_proof_back"]);
  return records[0] || {};
};

export const deleteCustomer = async (auth, customerId) => {
  return odooCallMethod(auth, "res.partner", "action_force_delete", [customerId]);
};

// =============================================
// PRICING RULES - rental.pricing
// =============================================

export const fetchPricingRules = async (auth) => {
  const records = await odooSearchRead(
    auth,
    "rental.pricing",
    [["active", "=", true], ["is_primary_pricing", "=", true]],
    [
      "name", "product_name", "tool_id", "category_id", "period_type", "price",
      "late_fee_per_day", "min_duration", "max_duration",
      "serial_count", "is_primary_pricing", "notes",
    ],
    { order: "sequence, name" }
  );

  // Fetch tool categories for rules where category_id is not set directly
  const toolIds = records
    .filter((r) => !r.category_id && r.tool_id)
    .map((r) => r.tool_id[0]);
  let toolCategoryMap = {};
  if (toolIds.length > 0) {
    const tools = await odooSearchRead(
      auth,
      "rental.tool",
      [["id", "in", toolIds]],
      ["id", "category_id"]
    );
    tools.forEach((t) => {
      if (t.category_id) toolCategoryMap[t.id] = t.category_id[1];
    });
  }

  return records.map((r) => {
    const catName = r.category_id
      ? r.category_id[1]
      : r.tool_id
        ? toolCategoryMap[r.tool_id[0]] || ""
        : "";
    return {
      id: String(r.id),
      odoo_id: r.id,
      name: r.name || "",
      product_name: r.product_name || r.name || "",
      tool_id: r.tool_id ? r.tool_id[0] : null,
      tool_name: r.tool_id ? r.tool_id[1] : "",
      category_name: catName,
      period_type: r.period_type || "day",
      price: r.price || 0,
      late_fee_per_day: r.late_fee_per_day || 0,
      min_duration: r.min_duration || 0,
      max_duration: r.max_duration || 0,
      serial_count: r.serial_count || 1,
      is_primary_pricing: r.is_primary_pricing || false,
      notes: r.notes || "",
    };
  });
};

export const updatePricingRule = async (auth, id, values) => {
  const odooValues = {};
  if (values.period_type !== undefined) odooValues.period_type = values.period_type;
  if (values.price !== undefined) odooValues.price = parseFloat(values.price) || 0;
  if (values.late_fee_per_day !== undefined) odooValues.late_fee_per_day = parseFloat(values.late_fee_per_day) || 0;
  if (values.min_duration !== undefined) odooValues.min_duration = parseFloat(values.min_duration) || 0;
  if (values.max_duration !== undefined) odooValues.max_duration = parseFloat(values.max_duration) || 0;
  if (values.notes !== undefined) odooValues.notes = values.notes || false;
  await odooWrite(auth, "rental.pricing", [Number(id)], odooValues);
  return true;
};

// =============================================
// TOOL AVAILABILITY REPORT - rental.tool.report
// =============================================

const REPORT_FIELDS = [
  "name", "serial_number", "tool_id", "category_id", "state",
  "total_qty", "available_qty", "checked_out_qty",
  "total_rentals", "active_rentals", "total_revenue",
  "price_per_day", "late_fee_per_day",
];

export const fetchToolReport = async (auth) => {
  const records = await odooSearchRead(
    auth,
    "rental.tool.report",
    [],
    REPORT_FIELDS,
    { order: "name" }
  );
  return records.map((r) => ({
    id: String(r.id),
    name: r.name || "",
    serial_number: r.serial_number || "",
    category_name: r.category_id ? r.category_id[1] : "",
    state: r.state || "available",
    total_qty: r.total_qty || 0,
    available_qty: r.available_qty || 0,
    checked_out_qty: r.checked_out_qty || 0,
    active_orders: r.active_rentals || 0,
    total_rentals: r.total_rentals || 0,
    total_revenue: r.total_revenue || 0,
    price_per_day: r.price_per_day || 0,
    late_fee_per_day: r.late_fee_per_day || 0,
  }));
};

export default {
  fetchCategories,
  fetchTools,
  fetchToolsByCategory,
  fetchToolById,
  createTool,
  updateTool,
  generateSerializedProducts,
  fetchOrders,
  fetchOrderById,
  fetchOrderDataById,
  fetchOrderImages,
  createOrder,
  updateOrderValues,
  updateOrderLineValues,
  fetchOrderLineImages,
  confirmOrder,
  cancelOrder,
  markDone,
  createInvoice,
  downloadCheckoutInvoice,
  downloadCheckinInvoice,
  openCheckoutWizard,
  openCheckinWizard,
  fetchCustomers,
  createCustomer,
  updateCustomer,
  fetchCustomerImages,
  deleteCustomer,
  fetchPricingRules,
  updatePricingRule,
  fetchToolReport,
};
