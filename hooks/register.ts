import type { Register } from 'claude-code'

const STEP = 10
const TOAST_MS = 30000
const lastBand: Record<string, number> = {}

const LABELS: Record<string, string> = {
  five_hour: '5-hour limit',
  seven_day: 'Weekly limit',
}

const label = (kind: string) => LABELS[kind] ?? kind

// Green under 50% used, yellow up to 80%, red from 80% on.
const dot = (used: number) => (used >= 80 ? '🔴' : used >= 50 ? '🟡' : '🟢')

// Time until the reset, e.g. "2h 15m" or "3d 4h".
const timeLeft = (iso?: string) => {
  if (!iso) return 'unknown'
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000)
  if (mins <= 0) return 'now'
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

// The reset moment on the clock, e.g. "Oct 20, 3:00 PM".
const resetClock = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'unknown'

export const register: Register = (on) => {
  // Proof that the plugin loaded, and a placeholder until usage data arrives.
  on('session.start', ($, e, next) => {
    $.ui.status('Usage alert: waiting for usage data')
    $.ui.toast('Usage alert loaded', { timeoutMs: 6000 })
    return next(e)
  })

  on('session.measure', ($, e, next) => {
    if (e.rateLimits.length === 0) {
      // No 5-hour / weekly windows: not on a subscription, or no response yet.
      $.ui.status('Usage alert: no plan usage data (needs a Claude subscription login)')
      return next(e)
    }

    $.ui.status(
      e.rateLimits.map((w) => `${label(w.kind)} ${w.percentUsed.toFixed(1)}%`).join(' · '),
    )

    for (const w of e.rateLimits) {
      const band = Math.floor(w.percentUsed / STEP) * STEP
      const prev = lastBand[w.kind] ?? 0
      if (band < prev) {
        // The usage window reset, so re-arm alerts for the new window.
        lastBand[w.kind] = band
        continue
      }
      if (band >= STEP && band > prev) {
        lastBand[w.kind] = band
        const used = w.percentUsed.toFixed(1)
        const left = (100 - w.percentUsed).toFixed(1)
        const until = timeLeft(w.resetsAt)
        const clock = resetClock(w.resetsAt)
        const color = dot(w.percentUsed)
        const message = `${color} ${used}% used | ${until} left`
        $.ui.toast(message, { timeoutMs: TOAST_MS })
        void $.ui.notify(message, { title: 'Usage alert' })
      }
    }

    return next(e)
  })
}
