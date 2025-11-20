import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import {
  useGoogleAuth,
  storeTokens,
  fetchUserInfo,
  storeUserData,
  isAuthenticated,
} from '../lib/auth';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function AuthScreen() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Form states
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Google OAuth
  const { request, response, promptAsync } = useGoogleAuth();

  // Check if already authenticated
  useEffect(() => {
    checkAuthentication();
  }, []);

  // Handle OAuth response
  useEffect(() => {
    if (response?.type === 'success') {
      handleOAuthSuccess(response);
    } else if (response?.type === 'error') {
      Alert.alert('Authentication Error', 'Failed to sign in with Google');
      setIsLoading(false);
    }
  }, [response]);

  const checkAuthentication = async () => {
    const authenticated = await isAuthenticated();
    if (authenticated) {
      router.replace('/(tabs)');
    }
  };

  const handleOAuthSuccess = async (response: any) => {
    try {
      setIsLoading(true);
      
      console.log('OAuth Response:', response);
      
      // Check for authorization code (iOS/Android OAuth clients)
      if (response.params?.code) {
        const { code } = response.params;
        console.log('Authorization code received, exchanging for token...');
        
        // Get the code verifier from the request (required for PKCE)
        if (!request?.codeVerifier) {
          console.error('Code verifier not found in request');
          Alert.alert('Error', 'OAuth configuration error');
          setIsLoading(false);
          return;
        }
        
        // Exchange code for access token with PKCE code verifier
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            code,
            client_id: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
            redirect_uri: 'com.googleusercontent.apps.724387084684-52banqk5eaju4pna072snjsc2bc0okv4:/oauth2redirect/google',
            grant_type: 'authorization_code',
            code_verifier: request.codeVerifier,
          }).toString(),
        });

        const tokenData = await tokenResponse.json();
        console.log('Token exchange response:', tokenData);

        if (tokenData.access_token) {
          // Store tokens
          await storeTokens(tokenData.access_token, tokenData.expires_in);

          // Fetch and store user info
          const userInfo = await fetchUserInfo(tokenData.access_token);
          console.log('User info:', userInfo);
          await storeUserData(userInfo);

          // Navigate to main app
          router.replace('/(tabs)');
          
          Alert.alert('Success', `Welcome ${userInfo.name}!`);
        } else {
          console.error('No access token in token response:', tokenData);
          Alert.alert('Error', 'Failed to exchange code for token');
        }
      }
      // For implicit flow (Token response type)
      else if (response.params?.access_token) {
        const { access_token, expires_in } = response.params;
        
        console.log('Access token received:', access_token.substring(0, 20) + '...');
        
        // Store tokens
        await storeTokens(access_token, expires_in ? parseInt(expires_in) : 3600);

        // Fetch and store user info
        const userInfo = await fetchUserInfo(access_token);
        console.log('User info:', userInfo);
        await storeUserData(userInfo);

        // Navigate to main app
        router.replace('/(tabs)');
        
        Alert.alert('Success', `Welcome ${userInfo.name}!`);
      } else {
        console.error('No access token or code in response:', response);
        Alert.alert('Error', 'Failed to get access token');
      }
    } catch (error) {
      console.error('OAuth error:', error);
      Alert.alert('Authentication Error', 'Failed to complete sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAuthMode = () => {
    setIsLogin(!isLogin);
  };

  const handleLogin = () => {
    console.log('Login:', { email, password });
    // Add your login logic here
  };

  const handleRegister = () => {
    console.log('Register:', { email, username, password, confirmPassword });
    // Add your register logic here
  };

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      await promptAsync();
    } catch (error: any) {
      console.error('Google login error:', error);
      Alert.alert('Error', 'Failed to sign in with Google');
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <Animated.View
            entering={FadeInDown.duration(1000).springify()}
            style={styles.logoContainer}
          >
            <View style={styles.logoWrapper}>
              <Image
                source={require('../assets/images/logo.png')}
                style={isLogin ? styles.logoLarge : styles.logoSmall}
                resizeMode="contain"
              />
            </View>
          </Animated.View>

          {/* Title */}
          <Animated.Text
            entering={FadeInDown.delay(200).duration(1000).springify()}
            style={styles.title}
          >
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </Animated.Text>

          {/* Form */}
          <Animated.View
            entering={FadeInUp.delay(400).duration(1000).springify()}
            style={styles.formContainer}
          >
            {/* Email Input */}
            <View style={styles.inputWrapper}>
              <View style={styles.inputIconContainer}>
                <Ionicons name="mail-outline" size={20} color="#9CA3AF" />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Enter your email address"
                placeholderTextColor="#6B7280"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Username Input (Register only) */}
            {!isLogin && (
              <Animated.View
                entering={FadeIn.duration(500)}
                style={styles.inputWrapper}
              >
                <View style={styles.inputIconContainer}>
                  <Ionicons name="person-outline" size={20} color="#9CA3AF" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your User name"
                  placeholderTextColor="#6B7280"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                />
              </Animated.View>
            )}

            {/* Password Input */}
            <View style={styles.inputWrapper}>
              <View style={styles.inputIconContainer}>
                <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" />
              </View>
              <TextInput
                style={styles.input}
                placeholder={isLogin ? 'Enter your Password' : 'Enter your Password'}
                placeholderTextColor="#6B7280"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color="#9CA3AF"
                />
              </TouchableOpacity>
            </View>

            {/* Confirm Password Input (Register only) */}
            {!isLogin && (
              <Animated.View
                entering={FadeIn.duration(500)}
                style={styles.inputWrapper}
              >
                <View style={styles.inputIconContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm your Password"
                  placeholderTextColor="#6B7280"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Forgot Password (Login only) */}
            {isLogin && (
              <TouchableOpacity style={styles.forgotPassword}>
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Primary Button */}
          <Animated.View
            entering={FadeInUp.delay(600).duration(1000).springify()}
            style={styles.buttonContainer}
          >
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={isLogin ? handleLogin : handleRegister}
              activeOpacity={0.8}
            >
              <View style={styles.gradientButton}>
                <Text style={styles.primaryButtonText}>
                  {isLogin ? 'Login' : 'Register'}
                </Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* Social Login (Login only) */}
          {isLogin && (
            <Animated.View
              entering={FadeInUp.delay(800).duration(1000).springify()}
              style={styles.socialContainer}
            >
              <View style={styles.dividerContainer}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>Or continue with</Text>
                <View style={styles.divider} />
              </View>

              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogleLogin}
                activeOpacity={0.7}
                disabled={isLoading || !request}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="logo-google" size={28} color="#FFFFFF" />
                )}
              </TouchableOpacity>

              {isLoading && (
                <Text style={styles.loadingText}>Signing in with Google...</Text>
              )}
            </Animated.View>
          )}

          {/* Toggle Auth Mode */}
          <Animated.View
            entering={FadeInUp.delay(1000).duration(1000).springify()}
            style={styles.toggleContainer}
          >
            <Text style={styles.toggleText}>
              {isLogin ? "If you don't have an account register" : 'Already have an account?'}
            </Text>
            <TouchableOpacity onPress={toggleAuthMode}>
              <Text style={styles.toggleLink}>
                {isLogin ? ' Register' : ' Login'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoWrapper: {
    shadowColor: '#8B5CF6',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  logoLarge: {
    width: 120,
    height: 120,
  },
  logoSmall: {
    width: 80,
    height: 80,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 40,
    letterSpacing: 0.5,
  },
  formContainer: {
    gap: 16,
    marginBottom: 24,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 16,
    height: 56,
  },
  inputIconContainer: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    paddingVertical: 0,
  },
  eyeIcon: {
    padding: 8,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  forgotPasswordText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonContainer: {
    marginBottom: 24,
  },
  primaryButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
    backgroundColor: '#8B5CF6',
  },
  gradientButton: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  socialContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#374151',
  },
  dividerText: {
    color: '#6B7280',
    fontSize: 14,
    marginHorizontal: 16,
  },
  googleButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  toggleText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  toggleLink: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
});
