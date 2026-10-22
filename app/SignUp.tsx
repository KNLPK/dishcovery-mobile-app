import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, IconButton } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField, KeyboardForm, type FormFieldHandle } from '../components/KeyboardForm';
import { tapHaptic } from '../components/motion';

type InputRef = FormFieldHandle;

/**
 * Sign-up is a demo like login: no account is created and nothing is stored.
 * "Continue as guest" is the main action. The Terms of Use / Privacy Policy
 * checkbox pointed at documents that do not exist, so it is gone.
 */
export default function SignUp() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [dob, setDob] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({
    fullName: '',
    email: '',
    mobile: '',
    dob: '',
    password: '',
    confirmPassword: '',
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // "Next" order. Date of birth is a picker, not typed, so Next skips it.
  const emailRef = useRef<InputRef>(null);
  const mobileRef = useRef<InputRef>(null);
  const passwordRef = useRef<InputRef>(null);
  const confirmRef = useRef<InputRef>(null);

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleSignUp = () => {
    let valid = true;
    const newErrors: any = {
      fullName: '',
      email: '',
      mobile: '',
      dob: '',
      password: '',
      confirmPassword: '',
    };
    if (!fullName) {
      newErrors.fullName = 'Full name is required';
      valid = false;
    }
    if (!email) {
      newErrors.email = 'Email is required';
      valid = false;
    } else if (!validateEmail(email)) {
      newErrors.email = 'Invalid email format';
      valid = false;
    }
    if (!mobile) {
      newErrors.mobile = 'Mobile number is required';
      valid = false;
    }
    if (!dob) {
      newErrors.dob = 'Date of birth is required';
      valid = false;
    }
    if (!password) {
      newErrors.password = 'Password is required';
      valid = false;
    }
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Confirm your password';
      valid = false;
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
      valid = false;
    }
    setErrors(newErrors);
    if (!valid) return;
    tapHaptic();
    // Demo only: no account is created.
    router.replace({ pathname: '/HomePage', params: { username: fullName } });
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || new Date();
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      const formatted = currentDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      setDob(formatted);
    }
  };

  return (
    <KeyboardForm
      style={styles.page}
      contentContainerStyle={[styles.scrollContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Sign Up</Text>
        <Button
          mode="contained"
          style={styles.button}
          contentStyle={styles.buttonContent}
          onPress={() => {
            tapHaptic();
            router.replace('/HomePage');
          }}
          buttonColor="#20515a"
          textColor="#ffffff"
        >
          Continue as guest
        </Button>
        <Text style={styles.demoNote}>
          Demo sign-up — nothing is stored or sent anywhere, and no account is created.
        </Text>
        <Text style={styles.label}>Full Name</Text>
        <FormField
          style={styles.input}
          placeholder="Ucup"
          value={fullName}
          onChangeText={setFullName}
          autoComplete="name"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
          accessibilityLabel="Full name"
        />
        {!!errors.fullName && <Text style={styles.error}>{errors.fullName}</Text>}
        <Text style={styles.label}>Email</Text>
        <FormField
          ref={emailRef}
          style={styles.input}
          placeholder="example@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => mobileRef.current?.focus()}
          accessibilityLabel="Email"
        />
        {!!errors.email && <Text style={styles.error}>{errors.email}</Text>}
        <Text style={styles.label}>Mobile Number</Text>
        <FormField
          ref={mobileRef}
          style={styles.input}
          placeholder="+ 123 456 789"
          value={mobile}
          onChangeText={setMobile}
          keyboardType="phone-pad"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          accessibilityLabel="Mobile number"
        />
        {!!errors.mobile && <Text style={styles.error}>{errors.mobile}</Text>}
        <Text style={styles.label}>Date Of Birth</Text>
        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          accessibilityRole="button"
          accessibilityLabel={dob ? `Date of birth, ${dob}` : 'Choose date of birth'}
        >
          <View pointerEvents="none">
            <FormField style={styles.input} placeholder="DD / MM / YYYY" value={dob} editable={false} />
          </View>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={dob ? new Date(dob.split('/').reverse().join('-')) : new Date()}
            mode="date"
            display="default"
            onChange={handleDateChange}
            maximumDate={new Date()}
          />
        )}
        {!!errors.dob && <Text style={styles.error}>{errors.dob}</Text>}
        <Text style={styles.label}>Password</Text>
        <FormField
          ref={passwordRef}
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmRef.current?.focus()}
          accessibilityLabel="Password"
          trailing={
            <IconButton
              icon={showPassword ? 'eye-off' : 'eye'}
              size={22}
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            />
          }
        />
        {!!errors.password && <Text style={styles.error}>{errors.password}</Text>}
        <Text style={styles.label}>Confirm Password</Text>
        <FormField
          ref={confirmRef}
          style={styles.input}
          placeholder="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showConfirmPassword}
          returnKeyType="done"
          onSubmitEditing={handleSignUp}
          accessibilityLabel="Confirm password"
          trailing={
            <IconButton
              icon={showConfirmPassword ? 'eye-off' : 'eye'}
              size={22}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              style={styles.eyeIcon}
              accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
            />
          }
        />
        {!!errors.confirmPassword && <Text style={styles.error}>{errors.confirmPassword}</Text>}
        <Button
          mode="contained"
          style={styles.button}
          contentStyle={styles.buttonContent}
          onPress={handleSignUp}
          buttonColor="#abe1e5"
          textColor="#20515a"
        >
          Sign Up
        </Button>
        <View style={styles.bottomRow}>
          <Text>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/')} style={styles.linkTarget} accessibilityRole="link">
            <Text style={styles.loginLink}>Log In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardForm>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#fff' },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#20515a',
    alignSelf: 'center',
    marginBottom: 32,
  },
  label: {
    marginLeft: 8,
    marginBottom: 4,
    color: '#222',
    fontWeight: '500',
  },
  input: {
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  error: {
    color: '#b3261e',
    marginLeft: 8,
    marginBottom: 8,
    fontSize: 13,
  },
  eyeIcon: {
    marginRight: 0,
    width: 48,
    height: 48,
    backgroundColor: 'transparent',
  },
  button: {
    borderRadius: 20,
    marginVertical: 8,
  },
  buttonContent: {
    minHeight: 48,
  },
  demoNote: {
    color: '#5f6e7a',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginHorizontal: 8,
    marginBottom: 16,
  },
  linkTarget: {
    minHeight: 48,
    justifyContent: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  loginLink: {
    color: '#20515a',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
}); 