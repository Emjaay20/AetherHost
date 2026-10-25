import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Eyebrow, Screen, StateMessage, Title, colors } from '@/components/ui';
import { useEvents } from '@/hooks/use-api';

export default function ActivityScreen() {
  const events = useEvents(); const items = events.data || [];
  return <Screen scroll={false}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={events.isRefetching} onRefresh={() => void events.refetch()} tintColor={colors.teal} />}><Eyebrow>ACTIVITY</Eyebrow><Title>Everything that happened.</Title><Text style={styles.copy}>Deployment changes, domain events, and important workspace activity.</Text><StateMessage loading={events.isLoading} error={events.error} empty={!events.isLoading && !events.error && items.length === 0 ? 'No activity has been recorded yet.' : undefined} />{items.map((event, index) => <Card key={event.id || `${event.createdAt}-${index}`}><View style={styles.row}><View style={styles.dot} /><Text style={styles.event}>{event.message || event.type || event.eventType || 'Workspace event'}</Text></View>{event.createdAt && <Text style={styles.time}>{formatDate(event.createdAt)}</Text>}</Card>)}</ScrollView></Screen>;
}
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(); }
const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 32 }, copy: { color: colors.muted, marginTop: 9, fontSize: 14, lineHeight: 21 }, row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.teal, marginTop: 5 }, event: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }, time: { color: colors.muted, fontSize: 11, marginTop: 9, marginLeft: 18 } });
