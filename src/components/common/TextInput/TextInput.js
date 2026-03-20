import React from 'react';
import { View, TextInput as RNTextInput, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const TextInput = ({
  label,
  labelColor,
  error,
  onPress,
  password,
  dropIcon,
  login,
  validate,
  column = true,
  required = false,
  onFocus = () => {},
  ...props
}) => {
  const inputRef = React.useRef(null);
  const [hidePassword, setHidePassword] = React.useState(password);
  const [isFocused, setIsFocused] = React.useState(false);

  const handlePress = () => {
    if (inputRef.current) inputRef.current.focus();
    if (onFocus) onFocus();
    if (onPress) onPress();
  };

  return (
    <View style={[styles.container, { flexDirection: column ? 'column' : 'row' }]}>
      <View style={styles.labelContainer}>
        <Text style={[styles.label, { color: labelColor }]}>
          {label}
          {required && <Text style={styles.requiredAsterisk}>*</Text>}
        </Text>
      </View>
      <TouchableWithoutFeedback onPress={handlePress}>
        <View
          style={[
            styles.inputContainer,
            {
              borderColor: error || validate
                ? COLORS.red
                : isFocused
                  ? COLORS.primaryThemeColor
                  : '#BBB7B7',
            },
          ]}
        >
          <RNTextInput
            ref={inputRef}
            autoCorrect={false}
            onFocus={() => {
              onFocus();
              setIsFocused(true);
            }}
            onBlur={() => setIsFocused(false)}
            secureTextEntry={hidePassword}
            style={styles.input}
            placeholderTextColor={'#666666'}
            {...props}
          />
        </View>
      </TouchableWithoutFeedback>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labelContainer: {},
  label: {
    flex: 2 / 3,
    marginVertical: 5,
    fontSize: 16,
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  inputContainer: {
    flex: 3 / 3,
    minHeight: 43,
    flexDirection: 'row',
    paddingHorizontal: 15,
    borderRadius: 6,
    borderWidth: 0.8,
    backgroundColor: 'white',
    alignItems: 'center',
  },
  input: {
    color: COLORS.black,
    flex: 1,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginVertical: 5,
  },
  requiredAsterisk: {
    color: COLORS.red,
    fontSize: 16,
    marginLeft: 5,
  },
  errorText: {
    color: COLORS.red,
    fontSize: 12,
    marginTop: 5,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
});

export default TextInput;
