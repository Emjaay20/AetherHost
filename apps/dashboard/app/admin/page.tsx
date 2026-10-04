import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import AdminDashboard from './AdminDashboard'

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3000'

async function getAdminData(token: string) {
  const [tenantsRes, analyticsRes] = await Promise.all([
    fetch(`${API_URL}/v1/admin/tenants`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
    fetch(`${API_URL}/v1/admin/analytics`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  ]);
  
  if (!tenantsRes.ok) return { error: 'Unauthorized' }
  return { 
    tenants: await tenantsRes.json(),
    analytics: analyticsRes.ok ? await analyticsRes.json() : null
  }
}

export default async function AdminPage() {
  const { userId, getToken } = await auth();
  if (!userId) redirect('/login');
  
  const token = await getToken();
  const { tenants, analytics, error } = await getAdminData(token!);

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[50vh]">
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground text-center">You do not have administrative privileges to view this page. {error}</p>
      </div>
    )
  }

  return <AdminDashboard tenants={tenants} analytics={analytics} />
}
