import { Redirect, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, IconButton } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField, KeyboardForm, type FormFieldHandle } from '../components/KeyboardForm';
import { tapHaptic } from '../components/motion';
import { getSettings } from '../src/settings/settings';

/**
 * Login is a demo: there is no account system, nothing is sent or stored, and
 * any well-formed email signs in. "Continue as guest" is therefore the main
 * action. The forgot-password and social buttons, which did nothing, are gone.
 */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<FormFieldHandle>(null);

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleLogin = () => {
    let valid = true;
    setEmailError('');
    setPasswordError('');
    
    // Email validation
    if (!email) {
      setEmailError('Email is required');
      valid = false;
    } else if (!validateEmail(email)) {
      setEmailError('Invalid email format');
      valid = false;
    }
    
    // Password validation
    if (!password) {
      setPasswordError('Password is required');
      valid = false;
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      valid = false;
    }
    
    if (!valid) return;
    tapHaptic();
    
    // Extract username from email (everything before @)
    const username = email.split('@')[0].trim();
    if (!username) {
      setEmailError('Invalid email format');
      return;
    }
    
    // Navigate to HomePage with username
    router.replace({
      pathname: '/HomePage',
      params: { username: username.charAt(0).toUpperCase() + username.slice(1) },
    });
  };

  // First launch: the short introduction comes first.
  if (!getSettings().welcomeSeen) return <Redirect href="/welcome" />;

  return (
    <KeyboardForm
      style={styles.page}
      contentContainerStyle={[styles.scrollContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Dishcovery</Text>
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
          Demo login — nothing is stored or sent anywhere. Any email and a 6-character password work.
        </Text>
        <Text style={styles.divider}>or log in</Text>
        <Text style={styles.label}>Email</Text>
        <FormField
          style={styles.input}
          placeholder="example@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          accessibilityLabel="Email"
        />
        {!!emailError && <Text style={styles.error}>{emailError}</Text>}
        <Text style={styles.label}>Password</Text>
        <FormField
          ref={passwordRef}
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          returnKeyType="done"
          onSubmitEditing={handleLogin}
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
        {!!passwordError && <Text style={styles.error}>{passwordError}</Text>}
        <Button
          mode="contained"
          style={styles.button}
          contentStyle={styles.buttonContent}
          onPress={handleLogin}
          buttonColor="#abe1e5"
          textColor="#20515a"
        >
          Log In
        </Button>
        <View style={styles.bottomRow}>
          <Text style={styles.bottomText}>Don&apos;t have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/SignUp')} style={styles.linkTarget} accessibilityRole="link">
            <Text style={styles.signUpLink}>Sign Up</Text>
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
  },
  divider: {
    alignSelf: 'center',
    marginTop: 24,
    marginBottom: 8,
    color: '#5f6e7a',
  },
  bottomText: {
    color: '#222',
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
  signUpLink: {
    color: '#20515a',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
}); 