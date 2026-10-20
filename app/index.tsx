import { Redirect, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, IconButton, TextInput } from 'react-native-paper';

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
    <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
      <View style={styles.container}>
        <Text style={styles.title}>Dishcovery</Text>
        <Button
          mode="contained"
          style={styles.button}
          contentStyle={styles.buttonContent}
          onPress={() => router.replace('/HomePage')}
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
        <TextInput
          mode="flat"
          style={[styles.input, { backgroundColor: '#abe1e5' }]}
          placeholder="example@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        {!!emailError && <Text style={styles.error}>{emailError}</Text>}
        <Text style={styles.label}>Password</Text>
        <View style={[styles.passwordContainer, { backgroundColor: '#abe1e5' }]}>
          <TextInput
            mode="flat"
            style={[styles.passwordInput, { backgroundColor: 'transparent' }]}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <IconButton
            icon={showPassword ? 'eye-off' : 'eye'}
            size={22}
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeIcon}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          />
        </View>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: '#abe1e5',
    borderRadius: 20,
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  error: {
    color: '#b3261e',
    marginLeft: 8,
    marginBottom: 8,
    fontSize: 13,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#abe1e5',
    borderRadius: 20,
    marginBottom: 8,
  },
  passwordInput: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
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