// DV-16 — global server error capture. Funnels every unhandled server error
// into error_logs via lib/errorLog.captureError, so API routes fail loud
// instead of silent, WITHOUT editing each route file.
//
// ponytail: onRequestError is a Next 15 hook. On this app's Next 14.2 it is
// dormant (never invoked); it activates automatically on a Next 15 upgrade.
// Params are typed inline because the `Instrumentation` type export is Next 15+.
// captureError is already used directly by the crons — the only always-on path
// today.

import { captureError } from './lib/errorLog'

export async function onRequestError(
  err: unknown,
  request: { path: string }
): Promise<void> {
  await captureError(err, { route: request.path })
}
