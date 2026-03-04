export const isRequired = (value) => {
  if (!value || (typeof value === "string" && !value.trim())) {
    return "This field is required";
  }
  return null;
};

export const isEmail = (value) => {
  // Stricter email validation with proper structure (example: user@gmail.com)
  const emailRegex = /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (value && !emailRegex.test(value)) {
    return "Invalid email format (example: user@gmail.com)";
  }
  return null;
};

export const isPhone = (value) => {
  if (!value) return null;
  
  // Extract only digits from the value (removes +, -, (, ), spaces, etc.)
  const digitsOnly = value.replace(/\D/g, "");
  
  // Check if there are exactly 10 digits
  if (digitsOnly.length !== 10) {
    return "Phone number must contain exactly 10 digits";
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
