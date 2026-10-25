import { useAuth } from '@clerk/expo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';
import { aetherApi } from '@/api';
import { Button, Card, Copy, Eyebrow, Screen, Title, colors } from '@/components/ui';
import { queryKeys } from '@/hooks/use-api';

export default function AiScreen() {
  const { getToken } = useAuth(); const client = useQueryClient(); const [prompt, setPrompt] = useState(''); const [name, setName] = useState('');
  const create = useMutation({ mutationFn: async () => { const token = await getToken(); if (!token) throw new Error('Your session expired. Please sign in again.'); return aetherApi.createFromPrompt(token, prompt.trim(), name.trim() || undefined); }, onSuccess: (project) => { void client.invalidateQueries({ queryKey: queryKeys.applications }); router.replace({ pathname: '/projects/[id]', params: { id: project.id } }); }, onError: (error) => Alert.alert('Could not start your project', error instanceof Error ? error.message : 'Please try again.') });
  return <Screen><Eyebrow>AI ARCHITECT</Eyebrow><Title>Describe what you want to deploy.</Title><Copy>AetherHost creates the project, prepares its deployment, and gives you a workspace to refine it.</Copy><Card><Text style={styles.label}>PROJECT IDEA</Text><TextInput multiline value={prompt} onChangeText={setPrompt} placeholder="A booking app for a Lagos wellness studio, with reservations and an admin dashboard." placeholderTextColor="#6d8495" textAlignVertical="top" style={styles.prompt} /><Text style={styles.label}>PROJECT NAME (OPTIONAL)</Text><TextInput value={name} onChangeText={setName} autoCapitalize="none" placeholder="wellness-booking" placeholderTextColor="#6d8495" style={styles.input} /><Button disabled={!prompt.trim()} loading={create.isPending} onPress={() => create.mutate()}>Generate and deploy</Button></Card><Card><Text style={styles.helpTitle}>Refine from the project workspace</Text><Text style={styles.help}>After deployment, use AI Edit inside the project to request updates to the codebase and trigger a new deployment.</Text></Card></Screen>;
}
const styles = StyleSheet.create({ label: { color: colors.muted, fontSize: 10, letterSpacing: 1.1, fontWeight: '800', marginBottom: 8 }, prompt: { minHeight: 140, padding: 12, color: colors.text, backgroundColor: '#071522', borderColor: '#244b60', borderWidth: 1, borderRadius: 12, fontSize: 15, lineHeight: 22, marginBottom: 18 }, input: { minHeight: 48, paddingHorizontal: 12, color: colors.text, backgroundColor: '#071522', borderColor: '#244b60', borderWidth: 1, borderRadius: 12, fontSize: 15 }, helpTitle: { color: colors.text, fontWeight: '800', fontSize: 14, marginBottom: 7 }, help: { color: colors.muted, lineHeight: 20, fontSize: 13 } });
