import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Application } from '@/api';
import { colors } from './ui';

export function statusInfo(status: string) {
  if (status === 'running') return { label: 'Running', color: '#4de2a6', background: '#102f2b' };
  if (status === 'failed') return { label: 'Failed', color: '#ff8585', background: '#42232a' };
  if (status === 'pending' || status === 'provisioning') return { label: 'Deploying', color: '#ffcb65', background: '#3d321d' };
  if (status === 'suspended') return { label: 'Suspended', color: '#aab6c4', background: '#253340' };
  return { label: status || 'Unknown', color: '#a4b6c4', background: '#1a2d3b' };
}

export function ProjectCard({ project, onPress }: { project: Application; onPress: () => void }) {
  const status = statusInfo(project.status);
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}><View style={[styles.mark, { backgroundColor: status.background }]}><Text style={styles.markText}>{project.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.body}><Text style={styles.name} numberOfLines={1}>{project.name}</Text><Text style={styles.meta} numberOfLines={1}>{project.runtime || 'Application'}{project.customDomain ? ` · ${project.customDomain}` : ''}</Text></View><View style={[styles.pill, { backgroundColor: status.background }]}><View style={[styles.dot, { backgroundColor: status.color }]} /><Text style={[styles.pillText, { color: status.color }]}>{status.label}</Text></View></Pressable>;
}

const styles = StyleSheet.create({ card: { minHeight: 75, padding: 13, marginTop: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 17 }, pressed: { opacity: 0.8 }, mark: { width: 43, height: 43, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, markText: { color: '#eafff9', fontSize: 18, fontWeight: '800' }, body: { flex: 1, minWidth: 0 }, name: { color: colors.text, fontSize: 15, fontWeight: '700' }, meta: { color: colors.muted, fontSize: 12, marginTop: 4 }, pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5 }, dot: { width: 6, height: 6, borderRadius: 3 }, pillText: { fontSize: 10, fontWeight: '800' } });
