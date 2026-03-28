// Odoo Connection Configuration
// Change these values to match your Odoo server

export const ODOO_CONFIG = {
  // Your PC IP on the LAN (where Odoo is running)
  HOST: "192.168.29.78",
  PORT: 8069,
  DATABASE: "testing1",
  PROTOCOL: "http",
};

// Default URL - can be changed at runtime via setOdooUrl()
let _odooUrl = `${ODOO_CONFIG.PROTOCOL}://${ODOO_CONFIG.HOST}:${ODOO_CONFIG.PORT}`;

export const getOdooUrl = () => _odooUrl;
export const setOdooUrl = (url) => { _odooUrl = url.replace(/\/+$/, ""); };

// Keep ODOO_URL as a getter for backward compatibility
export { _odooUrl as ODOO_URL };
export const JSONRPC_URL = `${_odooUrl}/jsonrpc`;
export const WEB_URL = `${_odooUrl}/web`;
