import { auth, currentUser } from '@clerk/nextjs/server'

export const DEFAULT_ADMIN_EMAILS = [
  'youngmj2010@gmail.com',
  'yusuf@yusufsaka.dev',
]

export const DEFAULT_ADMIN_TENANT_IDS = [
  'user_3Jxd6h5lIR82rBjvdlrZ8uINHGv',
  'user_3K1xGX0gzLatvTSieLxpmbyZCH3',
]

export function isUserAdmin({
  userId,
  emails = [],
  role,
}: {
  userId?: string | null
  emails?: string[]
  role?: string | null
}): boolean {
  if (role === 'admin') return true

  const envAdminIds = (process.env.ADMIN_TENANT_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  const allowedIds = new Set([...DEFAULT_ADMIN_TENANT_IDS, ...envAdminIds])
  if (userId && allowedIds.has(userId)) return true

  const envAdminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const allowedEmails = new Set([
    ...DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()),
    ...envAdminEmails,
  ])

  for (const email of emails) {
    if (email && allowedEmails.has(email.toLowerCase())) {
      return true
    }
  }

  return false
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    const { userId, sessionClaims } = await auth()
    if (!userId) return false

    const role = (sessionClaims?.metadata as Record<string, unknown> | undefined)?.role as string | undefined
    const sessionEmail = (sessionClaims?.email as string | undefined)

    if (isUserAdmin({ userId, emails: sessionEmail ? [sessionEmail] : [], role })) {
      return true
    }

    const user = await currentUser()
    const emails = user?.emailAddresses?.map((e) => e.emailAddress) || []

    return isUserAdmin({ userId, emails, role })
  } catch (err) {
    console.error('Failed to check admin status:', err)
    return false
  }
}
