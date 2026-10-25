import { useAuth, useClerk, useSSO } from '@clerk/expo';
import { useSignIn, useSignUp } from '@clerk/expo/legacy';
import * as AuthSession from 'expo-auth-session';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

WebBrowser.maybeCompleteAuthSession();

type Props = { children: ReactNode };
type Mode = 'signIn' | 'signUp' | 'verifySignIn' | 'verifySignUp';

export function AuthScreen({ children }: Props) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#24d2c0" size="large" />
      </View>
    );
  }

  return isSignedIn ? <>{children}</> : <AuthenticationForm />;
}

export function AuthenticationForm() {
  const clerk = useClerk();
  const { isLoaded: signInLoaded, signIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'github' | null>(null);

  const handleSocialAuth = async (strategy: 'oauth_google' | 'oauth_github') => {
    try {
      setSocialLoading(strategy === 'oauth_google' ? 'google' : 'github');
      setError(null);

      const redirectUrl = AuthSession.makeRedirectUri({
        path: 'sso-callback',
      });

      const { createdSessionId, setActive } = await startSSOFlow({
        strategy,
        redirectUrl,
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setSocialLoading(null);
    }
  };

  const handleEmailAction = async () => {
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'signIn') {
        if (!signInLoaded || !signIn) throw new Error('Sign-in service is initializing.');

        // If user entered a password, attempt standard password login
        if (password) {
          try {
            const res = await signIn.create({ identifier: email.trim(), password });
            if (res.status === 'complete' && res.createdSessionId) {
              await clerk.setActive({ session: res.createdSessionId });
              return;
            }
          } catch (pwErr) {
            // If password fails or isn't enabled as first factor in Clerk, fallback to OTP
            console.log('Password login not completed, trying email code factor:', pwErr);
          }
        }

        // Standard Clerk passwordless OTP flow (used in Clerk production)
        const signInAttempt = await signIn.create({ identifier: email.trim() });
        const emailCodeFactor = signInAttempt.supportedFirstFactors?.find(
          (factor: any) => factor.strategy === 'email_code'
        ) as any;

        if (emailCodeFactor) {
          await signIn.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: emailCodeFactor.emailAddressId,
          });
          setMode('verifySignIn');
        } else {
          setError('No email code strategy found for this account. Please use Google or GitHub.');
        }
        return;
      }

      // Sign-Up flow
      if (!signUpLoaded || !signUp) throw new Error('Sign-up service is initializing.');
      const result = await signUp.create({
        emailAddress: email.trim(),
        ...(password ? { password } : {}),
      });

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      if (result.status === 'complete' && result.createdSessionId) {
        await clerk.setActive({ session: result.createdSessionId });
      } else {
        setMode('verifySignUp');
      }
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async () => {
    if (!code.trim()) return setError('Enter the 6-digit verification code.');
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'verifySignIn') {
        if (!signIn) throw new Error('Sign-in service not ready.');
        const result = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code: code.trim(),
        });
        if (result.status === 'complete' && result.createdSessionId) {
          await clerk.setActive({ session: result.createdSessionId });
        } else {
          setError('Verification could not be completed. Please try again.');
        }
        return;
      }

      if (!signUp) throw new Error('Sign-up service not ready.');
      const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (result.status === 'complete' && result.createdSessionId) {
        await clerk.setActive({ session: result.createdSessionId });
      } else {
        setError('Your account needs another verification step.');
      }
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const isVerify = mode === 'verifySignIn' || mode === 'verifySignUp';
  const isSignIn = mode === 'signIn';

  return (
    <LinearGradient colors={['#07111f', '#0b2736', '#07111f']} style={styles.page}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>A</Text>
            </View>
            <Text style={styles.product}>AETHERHOST</Text>
            <Text style={styles.headline}>
              {isVerify
                ? 'Check your inbox'
                : isSignIn
                ? 'Deploy from anywhere.'
                : 'Build without limits.'}
            </Text>
            <Text style={styles.tagline}>
              {isVerify
                ? `We sent a 6-digit verification code to ${email}.`
                : 'Your cloud workspace, powered by Clerk.'}
            </Text>
          </View>

          <View style={styles.card}>
            {!isVerify ? (
              <>
                <Text style={styles.cardTitle}>
                  {isSignIn ? 'Sign in to AetherHost' : 'Create an account'}
                </Text>

                {/* Social Sign In Buttons (Google & GitHub) */}
                <View style={styles.socialGroup}>
                  <Pressable
                    disabled={!!socialLoading || submitting}
                    onPress={() => handleSocialAuth('oauth_google')}
                    style={({ pressed }) => [
                      styles.socialBtn,
                      pressed && styles.pressed,
                      socialLoading === 'google' && styles.disabled,
                    ]}
                  >
                    {socialLoading === 'google' ? (
                      <ActivityIndicator color="#f4f8fb" size="small" />
                    ) : (
                      <>
                        <View style={styles.googleBadge}>
                          <Text style={styles.googleIconText}>G</Text>
                        </View>
                        <Text style={styles.socialBtnText}>Continue with Google</Text>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    disabled={!!socialLoading || submitting}
                    onPress={() => handleSocialAuth('oauth_github')}
                    style={({ pressed }) => [
                      styles.socialBtn,
                      pressed && styles.pressed,
                      socialLoading === 'github' && styles.disabled,
                    ]}
                  >
                    {socialLoading === 'github' ? (
                      <ActivityIndicator color="#f4f8fb" size="small" />
                    ) : (
                      <>
                        <View style={styles.githubBadge}>
                          <Text style={styles.githubIconText}>⌥</Text>
                        </View>
                        <Text style={styles.socialBtnText}>Continue with GitHub</Text>
                      </>
                    )}
                  </Pressable>
                </View>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR WITH EMAIL</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Email Inputs */}
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="Email address"
                  placeholderTextColor="#6d8495"
                  style={styles.input}
                  value={email}
                />
                <TextInput
                  autoComplete={isSignIn ? 'current-password' : 'new-password'}
                  onChangeText={setPassword}
                  placeholder={isSignIn ? 'Password (optional if using code)' : 'Password'}
                  placeholderTextColor="#6d8495"
                  secureTextEntry
                  style={styles.input}
                  value={password}
                />

                {error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  disabled={submitting || !!socialLoading}
                  onPress={handleEmailAction}
                  style={({ pressed }) => [
                    styles.primary,
                    pressed && styles.pressed,
                    (submitting || !!socialLoading) && styles.disabled,
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#051015" />
                  ) : (
                    <Text style={styles.primaryText}>
                      {isSignIn ? 'Continue with Email' : 'Create account'}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => {
                    setError(null);
                    setMode(isSignIn ? 'signUp' : 'signIn');
                  }}
                  style={styles.switchButton}
                >
                  <Text style={styles.switchText}>
                    {isSignIn
                      ? 'New to AetherHost? Create an account'
                      : 'Already have an account? Sign in'}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>Enter verification code</Text>
                <Text style={styles.verificationNote}>
                  Enter the 6-digit code sent to your email to verify your session.
                </Text>
                <TextInput
                  autoFocus
                  keyboardType="number-pad"
                  maxLength={6}
                  onChangeText={setCode}
                  placeholder="000000"
                  placeholderTextColor="#6d8495"
                  style={[styles.input, styles.codeInput]}
                  value={code}
                />

                {error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  disabled={submitting}
                  onPress={verifyCode}
                  style={({ pressed }) => [
                    styles.primary,
                    pressed && styles.pressed,
                    submitting && styles.disabled,
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#051015" />
                  ) : (
                    <Text style={styles.primaryText}>Verify & Continue</Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => {
                    setError(null);
                    setMode('signIn');
                    setCode('');
                  }}
                  style={styles.switchButton}
                >
                  <Text style={styles.switchText}>← Back to sign in</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function readError(error: unknown) {
  const clerkError = error as {
    errors?: { longMessage?: string; message?: string }[];
    message?: string;
  };
  return (
    clerkError.errors?.[0]?.longMessage ||
    clerkError.errors?.[0]?.message ||
    clerkError.message ||
    'Something went wrong. Please check your credentials and try again.'
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  keyboard: { flex: 1 },
  scrollContent: { padding: 24, justifyContent: 'center', minHeight: '100%' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#07111f' },
  hero: { marginBottom: 24 },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#22cbb8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: { fontSize: 24, fontWeight: '900', color: '#06111e' },
  product: { color: '#63ecdf', letterSpacing: 2, fontSize: 11, fontWeight: '800', marginBottom: 8 },
  headline: {
    color: '#f4f8fb',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: { color: '#a5b8c6', marginTop: 6, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: 'rgba(10, 29, 42, 0.92)',
    borderColor: 'rgba(116, 213, 203, 0.22)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
  },
  cardTitle: { color: '#f4f8fb', fontWeight: '700', fontSize: 18, marginBottom: 16 },
  socialGroup: { gap: 10, marginBottom: 16 },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#0f2434',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 16,
  },
  socialBtnText: {
    color: '#f4f8fb',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 10,
  },
  googleBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ea4335',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIconText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  githubBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#24292e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  githubIconText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dividerText: {
    color: '#657e8f',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginHorizontal: 12,
  },
  input: {
    borderColor: '#29495a',
    borderWidth: 1,
    borderRadius: 12,
    color: '#f4f8fb',
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: '#081d2b',
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 8,
    fontWeight: '700',
    borderColor: '#23cbb8',
  },
  verificationNote: {
    color: '#9eb4c5',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  error: { color: '#ff9c9c', marginBottom: 12, fontSize: 13, lineHeight: 18 },
  primary: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#23cbb8',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  primaryText: { fontWeight: '800', fontSize: 15, color: '#06131e' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
  switchButton: { paddingTop: 16, alignItems: 'center' },
  switchText: { color: '#80d8cf', fontSize: 13, fontWeight: '600' },
});
