export const isRequired = (value) => {
  if (!value || (typeof value === "string" && !value.trim())) {
    return "This field is required";
  }
  return null;
};

// Common email domains for typo detection
const KNOWN_DOMAINS = [
  "gmail.com", "yahoo.com", "yahoo.in", "yahoo.co.in",
  "hotmail.com", "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "mail.com", "email.com",
  "zoho.com", "protonmail.com", "proton.me",
  "yandex.com", "gmx.com", "gmx.net",
  "rediffmail.com", "in.com",
];

// Fast Levenshtein with early exit — stops if distance exceeds max
const levenshteinFast = (a, b, max) => {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > max) return max + 1;
  let prev = new Uint8Array(n + 1);
  let curr = new Uint8Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n];
};

// Pre-build exact match set for O(1) lookup
const KNOWN_DOMAINS_SET = new Set(KNOWN_DOMAINS);

// Cache for domain suggestions to avoid recalculation
const suggestionCache = {};


// Suggest correction for mistyped domains (cached)
const getSuggestedDomain = (domain) => {
  const lower = domain.toLowerCase();
  if (KNOWN_DOMAINS_SET.has(lower)) return null;
  if (lower in suggestionCache) return suggestionCache[lower];
  let bestMatch = null;
  let bestDist = 4;
  for (let i = 0; i < KNOWN_DOMAINS.length; i++) {
    const dist = levenshteinFast(lower, KNOWN_DOMAINS[i], bestDist - 1);
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = KNOWN_DOMAINS[i];
      if (dist === 1) { suggestionCache[lower] = bestMatch; return bestMatch; }
    }
  }
  suggestionCache[lower] = bestMatch;
  return bestMatch;
};

export const isEmail = (value) => {
  if (!value) return null;
  // Basic format check
  const basicRegex = /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!basicRegex.test(value)) {
    return "Invalid email format (example: user@gmail.com)";
  }
  // Only allow .com TLD
  if (!value.toLowerCase().endsWith(".com")) {
    return "Only .com email addresses are accepted";
  }
  // Check for domain typos against known providers
  const domain = value.split("@")[1].toLowerCase();
  const suggestion = getSuggestedDomain(domain);
  if (suggestion) {
    return `Did you mean @${suggestion}?`;
  }
  return null;
};

// Returns suggested corrected email or null
export const getEmailSuggestion = (value) => {
  if (!value) return null;
  const basicRegex = /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!basicRegex.test(value)) return null;
  const parts = value.split("@");
  const domain = parts[1].toLowerCase();
  const suggestion = getSuggestedDomain(domain);
  if (suggestion) return `${parts[0]}@${suggestion}`;
  return null;
};

// Phone digit length by country code
export const PHONE_LENGTH_BY_CODE = {
  "+93": 9,    // Afghanistan
  "+355": 9,   // Albania
  "+213": 9,   // Algeria
  "+376": 6,   // Andorra
  "+244": 9,   // Angola
  "+54": 10,   // Argentina
  "+374": 8,   // Armenia
  "+61": 9,    // Australia
  "+43": 10,   // Austria
  "+994": 9,   // Azerbaijan
  "+973": 8,   // Bahrain
  "+880": 10,  // Bangladesh
  "+375": 9,   // Belarus
  "+32": 9,    // Belgium
  "+501": 7,   // Belize
  "+229": 8,   // Benin
  "+975": 8,   // Bhutan
  "+591": 8,   // Bolivia
  "+387": 8,   // Bosnia
  "+267": 8,   // Botswana
  "+55": 11,   // Brazil
  "+673": 7,   // Brunei
  "+359": 9,   // Bulgaria
  "+226": 8,   // Burkina Faso
  "+257": 8,   // Burundi
  "+855": 9,   // Cambodia
  "+237": 9,   // Cameroon
  "+1": 10,    // Canada / US
  "+238": 7,   // Cape Verde
  "+236": 8,   // Central African Republic
  "+235": 8,   // Chad
  "+56": 9,    // Chile
  "+86": 11,   // China
  "+57": 10,   // Colombia
  "+269": 7,   // Comoros
  "+243": 9,   // Congo DR
  "+242": 9,   // Congo
  "+506": 8,   // Costa Rica
  "+385": 9,   // Croatia
  "+53": 8,    // Cuba
  "+357": 8,   // Cyprus
  "+420": 9,   // Czech Republic
  "+45": 8,    // Denmark
  "+253": 8,   // Djibouti
  "+593": 9,   // Ecuador
  "+20": 10,   // Egypt
  "+503": 8,   // El Salvador
  "+240": 9,   // Equatorial Guinea
  "+291": 7,   // Eritrea
  "+372": 8,   // Estonia
  "+251": 9,   // Ethiopia
  "+679": 7,   // Fiji
  "+358": 10,  // Finland
  "+33": 9,    // France
  "+241": 7,   // Gabon
  "+220": 7,   // Gambia
  "+995": 9,   // Georgia
  "+49": 11,   // Germany
  "+233": 9,   // Ghana
  "+30": 10,   // Greece
  "+502": 8,   // Guatemala
  "+224": 9,   // Guinea
  "+592": 7,   // Guyana
  "+509": 8,   // Haiti
  "+504": 8,   // Honduras
  "+852": 8,   // Hong Kong
  "+36": 9,    // Hungary
  "+354": 7,   // Iceland
  "+91": 10,   // India
  "+62": 12,   // Indonesia
  "+98": 10,   // Iran
  "+964": 10,  // Iraq
  "+353": 9,   // Ireland
  "+972": 9,   // Israel
  "+39": 10,   // Italy
  "+225": 10,  // Ivory Coast
  "+1876": 7,  // Jamaica
  "+81": 10,   // Japan
  "+962": 9,   // Jordan
  "+7": 10,    // Kazakhstan / Russia
  "+254": 9,   // Kenya
  "+965": 8,   // Kuwait
  "+996": 9,   // Kyrgyzstan
  "+856": 10,  // Laos
  "+371": 8,   // Latvia
  "+961": 8,   // Lebanon
  "+266": 8,   // Lesotho
  "+231": 7,   // Liberia
  "+218": 10,  // Libya
  "+423": 7,   // Liechtenstein
  "+370": 8,   // Lithuania
  "+352": 9,   // Luxembourg
  "+853": 8,   // Macau
  "+261": 9,   // Madagascar
  "+265": 9,   // Malawi
  "+60": 10,   // Malaysia
  "+960": 7,   // Maldives
  "+223": 8,   // Mali
  "+356": 8,   // Malta
  "+222": 8,   // Mauritania
  "+230": 8,   // Mauritius
  "+52": 10,   // Mexico
  "+373": 8,   // Moldova
  "+377": 8,   // Monaco
  "+976": 8,   // Mongolia
  "+382": 8,   // Montenegro
  "+212": 9,   // Morocco
  "+258": 9,   // Mozambique
  "+95": 9,    // Myanmar
  "+264": 10,  // Namibia
  "+977": 10,  // Nepal
  "+31": 9,    // Netherlands
  "+64": 9,    // New Zealand
  "+505": 8,   // Nicaragua
  "+227": 8,   // Niger
  "+234": 10,  // Nigeria
  "+850": 10,  // North Korea
  "+389": 8,   // North Macedonia
  "+47": 8,    // Norway
  "+968": 8,   // Oman
  "+92": 10,   // Pakistan
  "+507": 8,   // Panama
  "+675": 8,   // Papua New Guinea
  "+595": 9,   // Paraguay
  "+51": 9,    // Peru
  "+63": 10,   // Philippines
  "+48": 9,    // Poland
  "+351": 9,   // Portugal
  "+974": 8,   // Qatar
  "+40": 9,    // Romania
  "+250": 9,   // Rwanda
  "+966": 9,   // Saudi Arabia
  "+221": 9,   // Senegal
  "+381": 9,   // Serbia
  "+65": 8,    // Singapore
  "+421": 9,   // Slovakia
  "+386": 8,   // Slovenia
  "+252": 8,   // Somalia
  "+27": 9,    // South Africa
  "+82": 10,   // South Korea
  "+211": 9,   // South Sudan
  "+34": 9,    // Spain
  "+94": 9,    // Sri Lanka
  "+249": 9,   // Sudan
  "+597": 7,   // Suriname
  "+46": 9,    // Sweden
  "+41": 9,    // Switzerland
  "+963": 9,   // Syria
  "+886": 9,   // Taiwan
  "+992": 9,   // Tajikistan
  "+255": 9,   // Tanzania
  "+66": 9,    // Thailand
  "+228": 8,   // Togo
  "+216": 8,   // Tunisia
  "+90": 10,   // Turkey
  "+993": 8,   // Turkmenistan
  "+256": 9,   // Uganda
  "+380": 9,   // Ukraine
  "+971": 9,   // UAE
  "+44": 10,   // United Kingdom
  "+598": 8,   // Uruguay
  "+998": 9,   // Uzbekistan
  "+58": 10,   // Venezuela
  "+84": 10,   // Vietnam
  "+967": 9,   // Yemen
  "+260": 9,   // Zambia
  "+263": 9,   // Zimbabwe
};

// Get expected phone digit length for a country code (defaults to 10)
export const getPhoneLength = (countryCode) => {
  return PHONE_LENGTH_BY_CODE[countryCode] || 10;
};

export const isPhone = (value, countryCode) => {
  if (!value) return null;

  // Extract only digits from the value (removes +, -, (, ), spaces, etc.)
  const digitsOnly = value.replace(/\D/g, "");

  const expectedLength = getPhoneLength(countryCode);

  if (digitsOnly.length !== expectedLength) {
    return `Phone number must contain exactly ${expectedLength} digits`;
  }
  return null;
};

export const validateFields = (fields, rules) => {
  const errors = {};
  for (const [key, validators] of Object.entries(rules)) {
    for (const validator of validators) {
      const error = validator(fields[key]);
      if (error) {
        errors[key] = error;
        break;
      }
    }
  }
  return errors;
};
