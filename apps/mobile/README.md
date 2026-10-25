# AetherHost Mobile

The native operations companion for AetherHost. It shares Clerk authentication and the tenant-scoped control-plane API with the web console, so users manage the same projects from a phone without duplicating data or permissions.

## Preview distribution

The first release is intentionally **not** going to the Play Store or App Store.

- **Android:** use the signed APK published on the AetherHost website. It can be installed directly after Android approves the download source.
- **iPhone / iPad:** use [Expo Go](https://expo.dev/go) for a preview session. Expo Go opens AetherHost inside Expo Go; it does not install AetherHost as a standalone iOS app.

When the team is ready for store-style iOS delivery, build through TestFlight. Until then, do not describe the Expo Go preview as an App Store installation.

## What is in the mobile app

- Clerk sign-in and the same tenant permissions as the dashboard
- Project list, status, recent deployments, manual redeploy, and live logs
- Deployment timeline plus DNS and HTTPS verification for custom domains
- Masked environment variables with deliberate reveal controls
- AI deployment diagnosis and a prefilled guided fix workflow
- Plans, usage, invoices, checkout links, and tenant API key management
- Opt-in device notifications for deployment starts and failures

## Run locally

1. Copy `.env.example` to `.env`.
2. Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` to the existing Clerk publishable key.
3. Set `EXPO_PUBLIC_API_URL` to the public HTTPS API address on the VPS, for example `https://api.aetherhost.example`.
4. In Clerk, enable the Native API and register these native identifiers:
   - Android package: `com.aetherhost.app`
   - iOS bundle identifier: `com.aetherhost.app`
5. Start Expo:

   ```bash
   pnpm --dir apps/mobile start
   ```

Open the QR code in Expo Go for early device testing. The app is configured with an EAS project ID, which is used when registering a physical device for push notifications.

## Create a downloadable Android APK

Install and sign in to the Expo Application Services CLI, then run:

```bash
pnpm --dir apps/mobile android:apk
```

This uses the `preview` profile in `eas.json` and creates a signed, installable `.apk` file. Promote a build by replacing the Android download URL on the AetherHost marketing page and in the root README.

## Notification delivery

The API stores a tenant’s Expo device tokens and sends alerts when a deployment starts or fails. Android delivery needs Firebase Cloud Messaging credentials configured in the Expo project. iOS push delivery needs Apple Push Notification service credentials and an Apple distribution build. The app remains usable if a user declines notification permission.
