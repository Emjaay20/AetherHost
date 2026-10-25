import { useUser } from '@clerk/expo';
import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ProjectCard } from '@/components/ProjectCard';
import { Button, Card, Eyebrow, Screen, StateMessage, Title, colors } from '@/components/ui';
import { useApplications } from '@/hooks/use-api';

export default function HomeScreen() {
  const { user } = useUser();
  const projects = useApplications();
  const apps = projects.data || [];
  const running = apps.filter((app) => app.status === 'running').length;
  const name = user?.firstName || user?.username || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'there';
  return <Screen scroll={false}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={projects.isRefetching} onRefresh={() => void projects.refetch()} tintColor={colors.teal} />}>
    <Eyebrow>AETHERHOST</Eyebrow><Title>Good to see you, {name}.</Title>
    <Card style={styles.hero}><Text style={styles.heroLabel}>LIVE INFRASTRUCTURE</Text><Text style={styles.heroValue}>{running} {running === 1 ? 'project' : 'projects'} running</Text><Text style={styles.heroCopy}>{apps.length} total deployment{apps.length === 1 ? '' : 's'}</Text></Card>
    <Button onPress={() => router.push('/deploy')}>Deploy with AI</Button>
    <View style={styles.heading}><Text style={styles.section}>Recent projects</Text><Text style={styles.count}>{apps.length}</Text></View>
    <StateMessage loading={projects.isLoading} error={projects.error} empty={!projects.isLoading && !projects.error && apps.length === 0 ? 'Your cloud is ready. Create your first project with AI.' : undefined} />
    {apps.slice(0, 5).map((app) => <ProjectCard key={app.id} project={app} onPress={() => router.push({ pathname: '/projects/[id]', params: { id: app.id } })} />)}
    {apps.length > 5 && <Button variant="secondary" onPress={() => router.push('/projects')}>View all projects</Button>}
  </ScrollView></Screen>;
}
const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 32 }, hero: { backgroundColor: '#12605f', borderColor: '#268e88', minHeight: 135, justifyContent: 'center' }, heroLabel: { color: '#b9fff6', fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginBottom: 9 }, heroValue: { color: '#fff', fontSize: 23, fontWeight: '800' }, heroCopy: { color: '#b8e6e4', fontSize: 12, marginTop: 6 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 29, marginBottom: 3 }, section: { color: colors.text, fontSize: 16, fontWeight: '800' }, count: { color: colors.muted, backgroundColor: '#13293a', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, fontSize: 12, overflow: 'hidden' } });
