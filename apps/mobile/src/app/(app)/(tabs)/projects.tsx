import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { ProjectCard } from '@/components/ProjectCard';
import { Button, Eyebrow, Screen, StateMessage, Title, colors } from '@/components/ui';
import { useApplications } from '@/hooks/use-api';

export default function ProjectsScreen() {
  const projects = useApplications(); const apps = projects.data || [];
  return <Screen scroll={false}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={projects.isRefetching} onRefresh={() => void projects.refetch()} tintColor={colors.teal} />}><Eyebrow>PROJECTS</Eyebrow><Title>Your deployments</Title><Text style={styles.copy}>Open a project to view its health, logs, domains, variables and deployment controls.</Text><Button onPress={() => router.push('/deploy')}>Create project with AI</Button><StateMessage loading={projects.isLoading} error={projects.error} empty={!projects.isLoading && !projects.error && apps.length === 0 ? 'No projects yet.' : undefined} />{apps.map((app) => <ProjectCard key={app.id} project={app} onPress={() => router.push({ pathname: '/projects/[id]', params: { id: app.id } })} />)}</ScrollView></Screen>;
}
const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 32 }, copy: { color: colors.muted, marginTop: 9, lineHeight: 21, fontSize: 14 } });
