import { I18nManager } from 'react-native'
import * as Updates from 'expo-updates'

// DV-32 — root-level RTL. Native layout mirroring only takes effect after a full
// JS reload, so forcing RTL is a "set the flag, then reload" operation. The guard
// (isRTL !== shouldRTL) makes this a no-op once the flag already matches the
// language, so there's no reload loop.
export async function syncRTL(lang: 'ar' | 'en'): Promise<void> {
  const shouldRTL = lang === 'ar'
  I18nManager.allowRTL(true)
  if (I18nManager.isRTL === shouldRTL) return
  I18nManager.forceRTL(shouldRTL)
  try {
    await Updates.reloadAsync()
  } catch {
    // Expo Go / dev: reloadAsync isn't supported — the flag is set but the layout
    // only flips on the next manual reload. ponytail: prod builds reload cleanly.
  }
}
