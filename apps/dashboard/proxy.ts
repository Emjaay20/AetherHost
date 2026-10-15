import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  '/',
  '/install.sh',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/preview(.*)',
]);

const isAdminRoute = createRouteMatcher(['/admin(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    const { userId, sessionClaims } = await auth.protect();

    if (isAdminRoute(req)) {
      const configuredAdmins = (process.env.ADMIN_TENANT_IDS || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);

      const configuredEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      const defaultAdminIds = [
        'user_3Jxd6h5lIR82rBjvdlrZ8uINHGv',
        'user_3K1xGX0gzLatvTSieLxpmbyZCH3',
      ];
      const defaultAdminEmails = [
        'youngmj2010@gmail.com',
        'yusuf@yusufsaka.dev',
      ];

      const allowedIds = new Set([...defaultAdminIds, ...configuredAdmins]);
      const allowedEmails = new Set([...defaultAdminEmails, ...configuredEmails]);

      const metadataRole = (
        sessionClaims?.metadata as Record<string, unknown> | undefined
      )?.role;
      const isRoleAdmin = metadataRole === 'admin';
      const isListedAdmin = Boolean(userId && allowedIds.has(userId));

      const claimEmail = (sessionClaims?.email as string | undefined)?.toLowerCase();
      const isEmailAdmin = Boolean(claimEmail && allowedEmails.has(claimEmail));

      if (!isListedAdmin && !isRoleAdmin && !isEmailAdmin) {
        return NextResponse.redirect(new URL('/console', req.url));
      }
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|sh)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
