import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = { background: '#07111f', surface: '#0b1d2b', border: '#1b3c4d', text: '#f4f8fb', muted: '#91a8b7', teal: '#48d8ca', danger: '#ff9ca6' };

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const content = <View style={styles.page}>{children}</View>;
  return <SafeAreaView style={styles.safe}>{scroll ? <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>{content}</ScrollView> : content}</SafeAreaView>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: object }>) { return <View style={[styles.card, style]}>{children}</View>; }
export function Eyebrow({ children }: PropsWithChildren) { return <Text style={styles.eyebrow}>{children}</Text>; }
export function Title({ children }: PropsWithChildren) { return <Text style={styles.title}>{children}</Text>; }
export function Copy({ children }: PropsWithChildren) { return <Text style={styles.copy}>{children}</Text>; }

export function Button({ children, onPress, variant = 'primary', loading = false, disabled = false }: PropsWithChildren<{ onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean; disabled?: boolean }>) {
  return <Pressable disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, styles[variant], (disabled || loading) && styles.disabled, pressed && styles.pressed]}>{loading ? <ActivityIndicator color={variant === 'primary' ? colors.background : colors.teal} /> : <Text style={[styles.buttonText, variant !== 'primary' && styles.buttonTextSecondary, variant === 'danger' && styles.buttonTextDanger]}>{children}</Text>}</Pressable>;
}

export function StateMessage({ error, loading, empty }: { error?: unknown; loading?: boolean; empty?: string }) {
  if (loading) return <View style={styles.state}><ActivityIndicator color={colors.teal} /></View>;
  if (error) return <Card style={styles.error}><Text style={styles.errorText}>{error instanceof Error ? error.message : 'Something went wrong. Please try again.'}</Text></Card>;
  return empty ? <Card style={styles.state}><Text style={styles.copy}>{empty}</Text></Card> : null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, scroll: { flexGrow: 1 }, page: { flex: 1, padding: 20, paddingBottom: 36 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 14 }, eyebrow: { color: colors.teal, fontSize: 10, letterSpacing: 1.8, fontWeight: '800', marginBottom: 7 }, title: { color: colors.text, fontSize: 27, letterSpacing: -0.6, lineHeight: 33, fontWeight: '800' }, copy: { color: colors.muted, fontSize: 14, lineHeight: 21 }, button: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 12 }, primary: { backgroundColor: colors.teal }, secondary: { backgroundColor: '#15394a', borderColor: '#286076', borderWidth: 1 }, danger: { backgroundColor: '#311d26', borderColor: '#813942', borderWidth: 1 }, buttonText: { color: '#06131e', fontWeight: '800', fontSize: 14 }, buttonTextSecondary: { color: '#a7f5ed' }, buttonTextDanger: { color: colors.danger }, disabled: { opacity: 0.55 }, pressed: { opacity: 0.82 }, state: { alignItems: 'center', justifyContent: 'center', minHeight: 100, marginTop: 22 }, error: { borderColor: '#813942', backgroundColor: '#311d26' }, errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
});
