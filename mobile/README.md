# ServIQ-FM Mobile (Expo)

Technician + manager mobile app. Expo SDK 54 / React Native 0.81 / Supabase.

## Running locally

```bash
npm install
npm start          # Expo Dev Server, then scan QR with Expo Go on phone
npm run android    # launch on connected Android device / emulator
npm run ios        # launch on iOS simulator (macOS only)
```

Supabase URL + anon key are currently hardcoded in [`src/lib/supabase.ts`](src/lib/supabase.ts). Push notifications need `EXPO_PUBLIC_PROJECT_ID` — see [`.env.example`](.env.example).

## EAS Build & Submit

[EAS](https://docs.expo.dev/eas/) builds and signs binaries in the cloud and submits to TestFlight / Play Console.

### Prerequisites

- Expo account — sign up at [expo.dev](https://expo.dev)
- Apple Developer Program ($99/year) — only for iOS submissions
- Google Play Developer account ($25 one-time) — only for Android submissions

### First-time setup

```bash
npx eas-cli login          # authenticate with your Expo account
npm run eas:init           # creates the Expo project + writes projectId to app.json
cp .env.example .env       # then paste EXPO_PUBLIC_PROJECT_ID from app.json or expo.dev
```

`eas init` writes `expo.extra.eas.projectId` into `app.json`. Copy the same value into `.env` as `EXPO_PUBLIC_PROJECT_ID` so push-token registration works at runtime.

For cloud builds, also set the env var as an EAS secret so the build environment has it:

```bash
npx eas-cli secret:create --name EXPO_PUBLIC_PROJECT_ID --value <your-project-id>
```

### Build profiles ([`eas.json`](eas.json))

| Profile | Distribution | Use case |
|---------|-------------|----------|
| `development` | Internal dev client | Hot-reload native debug builds |
| `preview` | Internal, APK | Sideload onto Android, TestFlight internal on iOS |
| `production` | Store-ready, auto-version | App Store / Play Store submission |

### Commands

```bash
npm run build:preview   # both platforms, internal distribution
npm run build:prod      # both platforms, signed for store submission
npm run submit:prod     # submit the latest production build to App Store + Play Store
```

Per-platform: append `-- --platform android` or `-- --platform ios`.

### Android signing

EAS generates and manages the upload keystore on first build. For Play Store submission you'll be prompted once to create or upload service account credentials — follow [EAS Android submit docs](https://docs.expo.dev/submit/android/).

### iOS signing

EAS handles certificates and provisioning profiles automatically once you `eas-cli login` with an Apple ID that has access to the App Store Connect team. The `submit` profile needs `appleId`, `ascAppId`, and `appleTeamId` — add these to [`eas.json`](eas.json) under `submit.production.ios` before running `submit:prod`.

## Folder map

```
mobile/
├── app.json                       # Expo config (icon, splash, plugins)
├── eas.json                       # EAS build + submit profiles
├── assets/                        # icon, adaptive-icon, splash, favicon
├── src/
│   ├── context/                   # AuthContext, LangContext (bilingual EN/AR)
│   ├── i18n/index.ts              # translation keys
│   ├── lib/
│   │   ├── notifications.ts       # Expo push token registration
│   │   ├── supabase.ts            # Supabase client (URL/key currently hardcoded)
│   │   └── theme.ts               # brand colors, spacing, shadows
│   ├── navigation/index.tsx       # bottom tabs + stack
│   └── screens/                   # Home, WorkOrders, WorkOrderDetail,
│                                  # Assets, AssetDetail, QRScanner, Login, Profile
```

## Brand kit

Mobile uses the same brand palette as the web app — Brand Navy `#182848`, Signal Blue `#2898C8`, Service Teal `#48B8C0`. See [`src/lib/theme.ts`](src/lib/theme.ts). Source: [`web/src/brand/tokens.ts`](../web/src/brand/tokens.ts).

## Server-side push

Notifications are sent server-side via the Supabase Edge Function at [`supabase/functions/send-push/`](../supabase/functions/send-push/) and the web wrapper at [`web/src/lib/push.ts`](../web/src/lib/push.ts). The mobile app only registers the token on login.
