import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Animated,
  Image,
  Keyboard,
  StyleSheet,
  TouchableWithoutFeedback,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  TextInput as RNTextInput,
  ActivityIndicator,
  Switch,
  Modal,
  FlatList,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

import { COLORS, FONT_FAMILY } from "@constants/theme";
import { Button } from "@components/common/Button";
import { OverlayLoader } from "@components/Loader";
import Text from "@components/Text";
import { SafeAreaView } from "@components/containers";
import { useAuthStore } from "@stores/auth";
import { showToastMessage } from "@components/Toast";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { odooAuthenticate, odooGetDatabases } from "@api/services/odooApi";
import { ODOO_CONFIG, getOdooUrl, setOdooUrl } from "@api/config/odooConfig";

const LoginScreen = ({ navigation }) => {
  const setUser = useAuthStore((state) => state.login);
  const savedAuth = useAuthStore((state) => state.odooAuth);

  const [serverUrl, setServerUrl] = useState(getOdooUrl());
  const [inputs, setInputs] = useState({
    username: "",
    password: "",
    database: ODOO_CONFIG.DATABASE,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [databases, setDatabases] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showDbDropdown, setShowDbDropdown] = useState(false);
  const [serverStatus, setServerStatus] = useState(null); // null | "success" | "error"
  const [loadingDbs, setLoadingDbs] = useState(false);
  const [autoFill, setAutoFill] = useState(false);

  const fetchDatabases = () => {
    setLoadingDbs(true);
    setServerStatus(null);
    odooGetDatabases()
      .then((dbs) => {
        if (dbs && dbs.length > 0) {
          setDatabases(dbs);
          setServerStatus("success");
          if (!dbs.includes(inputs.database)) {
            setInputs((prev) => ({ ...prev, database: dbs[0] }));
          }
        } else {
          setDatabases([]);
          setInputs((prev) => ({ ...prev, database: "" }));
          setServerStatus("error");
        }
      })
      .catch(() => {
        setDatabases([]);
        setInputs((prev) => ({ ...prev, database: "" }));
        setShowDbDropdown(false);
        setServerStatus("error");
      })
      .finally(() => {
        setLoadingDbs(false);
      });
  };

  useEffect(() => {
    // Load last used server URL
    AsyncStorage.getItem("lastServerUrl").then((savedUrl) => {
      if (savedUrl) {
        setServerUrl(savedUrl);
        setOdooUrl(savedUrl);
      }
      fetchDatabases();
    });
  }, []);

  const urlTimer = useRef(null);
  const shakeUsername = useRef(new Animated.Value(0)).current;
  const shakePassword = useRef(new Animated.Value(0)).current;
  const shakeDatabase = useRef(new Animated.Value(0)).current;

  const triggerShake = (animValue) => {
    Animated.sequence([
      Animated.timing(animValue, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(animValue, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(animValue, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(animValue, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(animValue, { toValue: 4, duration: 50, useNativeDriver: true }),
      Animated.timing(animValue, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleUrlChange = (text) => {
    setServerUrl(text);
    setOdooUrl(text);
    setServerStatus(null);

    // Debounce: auto-fetch after 800ms of no typing
    if (urlTimer.current) clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(() => {
      if (text.trim().length > 5) {
        fetchDatabases();
      }
    }, 800);
  };

  const handleUrlBlur = () => {
    if (urlTimer.current) clearTimeout(urlTimer.current);
    fetchDatabases();
  };

  const handleOnchange = (text, input) => {
    setInputs((prevState) => ({ ...prevState, [input]: text }));
  };

  const handleAutoFill = async (value) => {
    setAutoFill(value);
    if (value) {
      try {
        const saved = await AsyncStorage.getItem("savedCredentials");
        if (saved) {
          const { username, password, database } = JSON.parse(saved);
          setInputs((prev) => ({
            ...prev,
            username: username || prev.username,
            password: password || prev.password,
            database: database || prev.database,
          }));
        }
      } catch (e) {}
    } else {
      setInputs((prev) => ({ ...prev, username: "", password: "" }));
    }
  };

  const handleError = (error, input) => {
    setErrors((prevState) => ({ ...prevState, [input]: error }));
  };

  const validate = () => {
    Keyboard.dismiss();
    let isValid = true;

    if (!inputs.username) {
      handleError("Please input user name", "username");
      triggerShake(shakeUsername);
      isValid = false;
    }
    if (!inputs.password) {
      handleError("Please input password", "password");
      triggerShake(shakePassword);
      isValid = false;
    }
    if (!inputs.database) {
      handleError("Please input database name", "database");
      triggerShake(shakeDatabase);
      isValid = false;
    }

    if (isValid) {
      login();
    }
  };

  const login = async () => {
    setLoading(true);
    try {
      const odooAuth = await odooAuthenticate(
        inputs.database,
        inputs.username,
        inputs.password
      );

      const userData = {
        username: inputs.username,
        uid: odooAuth.uid,
        is_admin: true,
        database: inputs.database,
      };

      await AsyncStorage.setItem("lastServerUrl", serverUrl);
      await AsyncStorage.setItem("savedCredentials", JSON.stringify({
        username: inputs.username,
        password: inputs.password,
        database: inputs.database,
      }));
      setUser(userData, odooAuth, serverUrl);
      showToastMessage("Logged in");
      navigation.navigate("AppNavigator");
    } catch (error) {
      showToastMessage(error.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
      <SafeAreaView backgroundColor={COLORS.primaryThemeColor}>
        <OverlayLoader visible={loading} />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Logo at top */}
            <View style={styles.header}>
              <Image
                source={require("@assets/images/logo.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            {/* Login Card - centered */}
            <View style={styles.cardWrapper}>
              <Text style={styles.loginTitle}>Login to continue</Text>
              <View style={styles.card}>
                {/* Server URL */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Server URL</Text>
                  <View style={styles.urlRow}>
                    <RNTextInput
                      style={[styles.input, { flex: 1 }]}
                      value={serverUrl}
                      onChangeText={handleUrlChange}
                      onBlur={handleUrlBlur}
                      placeholder="e.g. http://your-server:8069"
                      placeholderTextColor="#aaa"
                      autoCapitalize="none"
                      keyboardType="url"
                    />
                    {loadingDbs && (
                      <ActivityIndicator size="small" color={COLORS.primaryThemeColor} style={{ marginLeft: 6 }} />
                    )}
                    {!loadingDbs && serverStatus === "success" && (
                      <MaterialIcons name="check-circle" size={20} color="#4CAF50" style={{ marginLeft: 6 }} />
                    )}
                    {!loadingDbs && serverStatus === "error" && (
                      <MaterialIcons name="cancel" size={20} color="#E53935" style={{ marginLeft: 6 }} />
                    )}
                  </View>
                  <View style={[styles.underline, serverStatus === "success" && { backgroundColor: "#4CAF50" }, serverStatus === "error" && { backgroundColor: "#E53935" }]} />
                </View>

                {/* Database Dropdown */}
                <Animated.View style={[styles.inputGroup, { zIndex: 100, transform: [{ translateX: shakeDatabase }] }]}>
                  <Text style={styles.label}>Database</Text>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => {
                      handleError(null, "database");
                      if (databases.length > 0) {
                        setShowDbDropdown(!showDbDropdown);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dropdownText, !inputs.database && { color: "#aaa" }]}>
                      {inputs.database || "Select database"}
                    </Text>
                    {loadingDbs ? (
                      <ActivityIndicator size="small" color={COLORS.primaryThemeColor} />
                    ) : (
                      <MaterialIcons
                        name={showDbDropdown ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                        size={22}
                        color="#888"
                      />
                    )}
                  </TouchableOpacity>
                  <View style={styles.underline} />
                  <Modal
                    visible={showDbDropdown}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowDbDropdown(false)}
                  >
                    <TouchableWithoutFeedback onPress={() => setShowDbDropdown(false)}>
                      <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                          <View style={styles.modalDropdown}>
                            <Text style={styles.modalDropdownTitle}>Select Database</Text>
                            <FlatList
                              data={databases}
                              keyExtractor={(item) => item}
                              style={{ maxHeight: 300 }}
                              renderItem={({ item: db }) => (
                                <TouchableOpacity
                                  style={[
                                    styles.dropdownItem,
                                    inputs.database === db && styles.dropdownItemActive,
                                  ]}
                                  onPress={() => {
                                    handleOnchange(db, "database");
                                    setShowDbDropdown(false);
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.dropdownItemText,
                                      inputs.database === db && styles.dropdownItemTextActive,
                                    ]}
                                  >
                                    {db}
                                  </Text>
                                  {inputs.database === db && (
                                    <MaterialIcons name="check" size={18} color={COLORS.primaryThemeColor} />
                                  )}
                                </TouchableOpacity>
                              )}
                            />
                          </View>
                        </TouchableWithoutFeedback>
                      </View>
                    </TouchableWithoutFeedback>
                  </Modal>
                  {errors.database && <Text style={styles.errorText}>{errors.database}</Text>}
                  {databases.length === 0 && !loadingDbs && (
                    <Text style={styles.hint}>No databases found. Check server URL.</Text>
                  )}
                </Animated.View>

                {/* Username */}
                <Animated.View style={[styles.inputGroup, { transform: [{ translateX: shakeUsername }] }]}>
                  <Text style={styles.label}>Username or Email</Text>
                  <RNTextInput
                    style={styles.input}
                    value={inputs.username}
                    onChangeText={(text) => handleOnchange(text, "username")}
                    onFocus={() => handleError(null, "username")}
                    placeholder="Enter username or email"
                    placeholderTextColor="#aaa"
                  />
                  <View style={styles.underline} />
                  {errors.username && <Text style={styles.errorText}>{errors.username}</Text>}
                </Animated.View>

                {/* Password */}
                <Animated.View style={[styles.inputGroup, { transform: [{ translateX: shakePassword }] }]}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.passwordRow}>
                    <RNTextInput
                      style={[styles.input, { flex: 1 }]}
                      value={inputs.password}
                      onChangeText={(text) => handleOnchange(text, "password")}
                      onFocus={() => handleError(null, "password")}
                      placeholder="Enter password"
                      placeholderTextColor="#aaa"
                      secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 6 }}>
                      <Text style={{ fontSize: 20 }}>{showPassword ? "🐵" : "🙈"}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.underline} />
                  {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
                </Animated.View>

                {/* Auto Fill Toggle */}
                <View style={styles.autoFillRow}>
                  <Text style={styles.autoFillLabel}>Auto Fill Credentials</Text>
                  <Switch
                    value={autoFill}
                    onValueChange={handleAutoFill}
                    trackColor={{ false: "#D0D0D0", true: COLORS.primaryThemeColor }}
                    thumbColor={autoFill ? "#fff" : "#f4f3f4"}
                  />
                </View>

                {/* Login Button */}
                <View style={styles.buttonContainer}>
                  <Button title="Login" onPress={validate} loading={loading} />
                </View>
              </View>
            </View>

            {/* Footer */}
            <Text style={styles.footer}>Powered by 369ai  |  v1.0.0</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    backgroundColor: "transparent",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 30,
  },
  header: {
    alignItems: "center",
  },
  logo: {
    width: 320,
    height: 128,
    marginTop: 70,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  cardWrapper: {
    marginTop: 90,
  },
  loginTitle: {
    fontSize: 20,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    textAlign: "center",
    marginBottom: 14,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 4,
      },
    }),
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: "#888",
    marginBottom: 0,
  },
  input: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.black,
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  underline: {
    height: 1,
    backgroundColor: "#D0D0D0",
  },
  urlRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  eyeIcon: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.primaryThemeColor,
    paddingLeft: 10,
  },
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  dropdownText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.black,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalDropdown: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 10,
      },
    }),
  },
  modalDropdownTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: "#555",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  dropdownList: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 10,
    marginTop: 2,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    zIndex: 100,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 10,
      },
    }),
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  dropdownItemActive: {
    backgroundColor: "#F0F4FF",
  },
  dropdownItemText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.black,
  },
  dropdownItemTextActive: {
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },
  errorText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: "#E53935",
    marginTop: 3,
  },
  hint: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.gray,
    marginTop: 3,
  },
  autoFillRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  autoFillLabel: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.primaryThemeColor,
  },
  buttonContainer: {
    marginTop: 10,
  },
  footer: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: "#B0B0B0",
    marginTop: 24,
  },
});

export default LoginScreen;
