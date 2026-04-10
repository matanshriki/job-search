/**
 * Email Service — nodemailer wrapper.
 *
 * Configure via environment variables (Railway / backend/.env):
 *
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_USER=your-sending-address@gmail.com    # mailbox used to *send* mail
 *   SMTP_PASS=your-gmail-app-password             # Gmail → Security → App Passwords
 *   SMTP_FROM=your-sending-address@gmail.com      # optional; defaults to SMTP_USER
 *
 * Weekly digests go to each user’s Google sign-in email (`User.email`), with a fallback
 * to `Profile.email` if the account email is missing. You do not set a single “digest to”
 * address — the app sends one message per user.
 *
 * Prefer Resend on Railway (SMTP port 587 is often blocked):
 *   RESEND_API_KEY=re_...
 *   RESEND_FROM="Job Search <onboarding@resend.dev>"
 *
 * Optional SMTP tuning:
 *   SMTP_CONNECTION_TIMEOUT_MS  (default 20000)
 *   SMTP_SOCKET_TIMEOUT_MS      (default 35000)
 *   SMTP_IPV4_ONLY=false
 *   SMTP_USE_GMAIL_PRESET=true  (use nodemailer’s gmail preset when host is gmail)
 */

import dns from 'node:dns'

import type { WeeklyDigestData } from './weeklyDigest'

/** Strip whitespace / accidental quotes — common when pasting into Railway. */
function normalizeSecret(raw: string | undefined): string {
  if (!raw) return ''
  let s = raw.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim()
  }
  return s
}

const RESEND_API_KEY = normalizeSecret(process.env.RESEND_API_KEY)
/** Default Resend sandbox sender; production: verify a domain at resend.com and set RESEND_FROM. */
const RESEND_FROM = normalizeSecret(process.env.RESEND_FROM) || 'Job Search Copilot <onboarding@resend.dev>'

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587', 10)
const SMTP_USER = process.env.SMTP_USER
/** Gmail app passwords are often pasted with spaces — strip them. */
const SMTP_PASS = process.env.SMTP_PASS?.replace(/\s+/g, '') ?? ''
const SMTP_FROM = process.env.SMTP_FROM ?? SMTP_USER

/** Railway / many clouds have no usable IPv6 route; Gmail’s AAAA record then gives ENETUNREACH. Force IPv4. */
const SMTP_IPV4_ONLY = process.env.SMTP_IPV4_ONLY !== 'false'

export function isEmailEnabled(): boolean {
  return !!RESEND_API_KEY || !!(SMTP_HOST && SMTP_USER && SMTP_PASS)
}

/** For UI: Resend is tried first when both are set. */
export function getEmailDeliveryMode(): 'resend' | 'smtp' | 'off' {
  if (RESEND_API_KEY) return 'resend'
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) return 'smtp'
  return 'off'
}

/** Nodemailer defaults can wait many minutes on blocked SMTP ports — keep UX predictable. */
const SMTP_CONNECTION_MS = parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? '20000', 10)
const SMTP_SOCKET_MS = parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS ?? '35000', 10)

const ipv4Lookup =
  SMTP_IPV4_ONLY
    ? {
        lookup: (hostname: string, _options: object, callback: (err: Error | null, address: string, family?: number) => void) => {
          dns.lookup(hostname, { family: 4 }, callback)
        },
      }
    : {}

/** Lazy-load nodemailer (pulls in TLS/native code) only when actually sending mail. */
async function createTransport() {
  const { default: nodemailer } = await import('nodemailer')
  const useGmailPreset =
    (SMTP_HOST?.includes('gmail') ?? false) || process.env.SMTP_USE_GMAIL_PRESET === 'true'
  if (useGmailPreset && SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: SMTP_CONNECTION_MS,
      greetingTimeout: SMTP_CONNECTION_MS,
      socketTimeout: SMTP_SOCKET_MS,
      ...ipv4Lookup,
    })
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: SMTP_CONNECTION_MS,
    greetingTimeout: SMTP_CONNECTION_MS,
    socketTimeout: SMTP_SOCKET_MS,
    ...ipv4Lookup,
  })
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} (exceeded ${ms}ms)`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

// ─── HTML email template ──────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return '#10b981'
  if (score >= 65) return '#f59e0b'
  return '#6b7280'
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: 'New', considering: 'Considering', applied: 'Applied',
    interviewing: 'Interviewing', offered: 'Offered', rejected: 'Rejected', archived: 'Archived',
  }
  return labels[status] ?? status
}

function buildWeeklyDigestHtml(data: WeeklyDigestData, recipientName: string): string {
  const { period, stats, topMatches, appliedThisWeek, pipelineSnapshot, dashboardUrl } = data

  const topMatchRows = topMatches.map((job) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #1e2a3a;">
        <a href="${job.jobUrl || dashboardUrl + 'jobs/' + job.id}" style="color:#60a5fa;text-decoration:none;font-weight:600;font-size:14px;">
          ${job.title}
        </a>
        <div style="color:#94a3b8;font-size:12px;margin-top:2px;">${job.company} · ${job.location}</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e2a3a;text-align:right;white-space:nowrap;">
        <span style="display:inline-block;background:${scoreColor(job.fitScore)}22;color:${scoreColor(job.fitScore)};border:1px solid ${scoreColor(job.fitScore)}44;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:700;">
          ${job.fitScore}/100
        </span>
      </td>
      <td style="padding:10px 0 10px 12px;border-bottom:1px solid #1e2a3a;text-align:right;white-space:nowrap;">
        <span style="color:#64748b;font-size:12px;">${statusLabel(job.status)}</span>
      </td>
    </tr>
  `).join('')

  const appliedRows = appliedThisWeek.length > 0
    ? appliedThisWeek.map((job) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #1e2a3a;">
          <a href="${job.jobUrl || dashboardUrl + 'jobs/' + job.id}" style="color:#60a5fa;text-decoration:none;font-weight:600;font-size:14px;">
            ${job.title}
          </a>
          <div style="color:#94a3b8;font-size:12px;margin-top:2px;">${job.company} · ${job.location}</div>
        </td>
        <td style="padding:10px 0 10px 12px;border-bottom:1px solid #1e2a3a;text-align:right;">
          <span style="display:inline-block;background:#10b98122;color:#10b981;border:1px solid #10b98144;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:700;">
            ${job.fitScore}/100
          </span>
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="2" style="padding:14px 0;color:#64748b;font-size:13px;">No applications this week.</td></tr>'

  const pipelineRows = pipelineSnapshot.map((p) => `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <div style="width:90px;color:#94a3b8;font-size:12px;text-align:right;">${statusLabel(p.status)}</div>
      <div style="flex:1;background:#1e2a3a;border-radius:4px;overflow:hidden;height:8px;">
        <div style="width:${Math.min(100, (p.count / (topMatches.length + 1)) * 100)}%;background:#3b82f6;height:8px;border-radius:4px;"></div>
      </div>
      <div style="width:24px;color:#e2e8f0;font-size:12px;font-weight:700;">${p.count}</div>
    </div>
  `).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:linear-gradient(135deg,#1e40af22,#7c3aed22);border:1px solid #3b82f633;border-radius:12px;padding:12px 20px;margin-bottom:16px;">
        <span style="font-size:20px;">🤖</span>
        <span style="color:#94a3b8;font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin-left:8px;">Job Search Copilot</span>
      </div>
      <h1 style="color:#f1f5f9;font-size:24px;font-weight:700;margin:0 0 6px 0;">
        Your Weekly Job Search Summary
      </h1>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 8px 0;">Hi ${escapeHtml(recipientName)}, here is your recap.</p>
      <p style="color:#64748b;font-size:14px;margin:0;">${period.label}</p>
    </div>

    <!-- Stats row -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">
      ${[
        { label: 'Jobs Found', value: stats.jobsFound, color: '#3b82f6' },
        { label: 'High Match', value: stats.highMatchJobs, color: '#10b981' },
        { label: 'Applied', value: stats.appliedCount, color: '#8b5cf6' },
        { label: 'Inbox Prepared', value: stats.queueItemsCreated, color: '#f59e0b' },
      ].map((s) => `
        <div style="background:#1e293b;border:1px solid #1e2a3a;border-radius:10px;padding:14px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:${s.color};line-height:1;">${s.value}</div>
          <div style="font-size:11px;color:#64748b;margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${s.label}</div>
        </div>
      `).join('')}
    </div>

    <!-- Agent activity -->
    <div style="background:#1e293b;border:1px solid #1e2a3a;border-radius:10px;padding:16px;margin-bottom:24px;">
      <p style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px 0;">Agent Activity This Week</p>
      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        ${[
          { icon: '🔍', label: 'Company scans', value: stats.companiesScanned },
          { icon: '🤖', label: 'Fit analyses', value: stats.fitAnalysesRun },
          { icon: '📋', label: 'Board sources', value: stats.boardCrawlsRun },
          { icon: '✉️', label: 'Drafts queued', value: stats.queueItemsCreated },
        ].map((a) => `
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:14px;">${a.icon}</span>
            <span style="color:#e2e8f0;font-size:14px;font-weight:700;">${a.value}</span>
            <span style="color:#64748b;font-size:12px;">${a.label}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Top matches -->
    ${topMatches.length > 0 ? `
    <div style="background:#1e293b;border:1px solid #1e2a3a;border-radius:10px;padding:20px;margin-bottom:24px;">
      <p style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 14px 0;">Top Matches This Week</p>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${topMatchRows}</tbody>
      </table>
    </div>` : ''}

    <!-- Applied -->
    <div style="background:#1e293b;border:1px solid #1e2a3a;border-radius:10px;padding:20px;margin-bottom:24px;">
      <p style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 14px 0;">Applied This Week</p>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${appliedRows}</tbody>
      </table>
    </div>

    <!-- Pipeline -->
    ${pipelineSnapshot.length > 0 ? `
    <div style="background:#1e293b;border:1px solid #1e2a3a;border-radius:10px;padding:20px;margin-bottom:24px;">
      <p style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 14px 0;">Pipeline Snapshot</p>
      ${pipelineRows}
    </div>` : ''}

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:32px;">
      <a href="${dashboardUrl}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:10px;letter-spacing:0.02em;">
        Open Dashboard →
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;color:#334155;font-size:12px;line-height:1.6;">
      <p style="margin:0;">Sent by your Job Search Copilot · Every Monday at 8am</p>
      <p style="margin:4px 0 0 0;">To stop emails, remove SMTP_HOST from your backend/.env</p>
    </div>
  </div>
</body>
</html>`
}

// ─── Resend (HTTPS :443 — works where SMTP is blocked) ────────────────────────

function resendFailureHint(apiMessage: string): string {
  const m = apiMessage.toLowerCase()
  if (
    m.includes('api key') ||
    m.includes('validation') ||
    m.includes('unauthorized') ||
    m.includes('invalid') ||
    m.includes('forbidden')
  ) {
    return (
      ' Create a new key in the Resend dashboard (API Keys) — it must start with re_. ' +
      'Paste it into Railway with no extra spaces, quotes, or line breaks. Save variables and redeploy.'
    )
  }
  if (
    m.includes('domain') ||
    m.includes('onboarding') ||
    m.includes('only') ||
    m.includes('not allowed to send')
  ) {
    return (
      ' With onboarding@resend.dev you can usually only send to the email you used to sign up at Resend. ' +
      'Verify a domain in Resend and set RESEND_FROM to an address on that domain for any recipient.'
    )
  }
  return ' See https://resend.com/docs for this error.'
}

async function sendDigestViaResend(
  html: string,
  subject: string,
  to: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = RESEND_API_KEY
  if (!key) return { ok: false, error: 'RESEND_API_KEY missing' }
  if (!key.startsWith('re_')) {
    return {
      ok: false,
      error:
        'RESEND_API_KEY should start with re_. Check for a copy/paste mistake or create a new API key in the Resend dashboard.',
    }
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 25_000)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [to],
        subject,
        html,
      }),
      signal: ac.signal,
    })
    const body = (await res.json().catch(() => ({}))) as {
      message?: string | string[]
      name?: string
    }
    if (!res.ok) {
      const msgPart = Array.isArray(body.message) ? body.message.join(', ') : body.message
      const detail = [msgPart, body.name].filter(Boolean).join(' — ')
      return { ok: false, error: detail || `${res.status} ${res.statusText}` }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendWeeklyDigestEmail(
  data: WeeklyDigestData,
  recipientEmail: string,
  recipientName = 'there',
): Promise<{ sent: boolean; message: string }> {
  if (!isEmailEnabled()) {
    return {
      sent: false,
      message:
        'Email not configured. Set RESEND_API_KEY (recommended on Railway) or SMTP_HOST, SMTP_USER, and SMTP_PASS.',
    }
  }

  const html = buildWeeklyDigestHtml(data, recipientName)
  const subject = `Your weekly job search summary — ${data.period.label}`

  if (RESEND_API_KEY) {
    const r = await sendDigestViaResend(html, subject, recipientEmail)
    if (r.ok) {
      return { sent: true, message: `Digest sent to ${recipientEmail} (via Resend)` }
    }
    return {
      sent: false,
      message: `${r.error}.${resendFailureHint(r.error)}`,
    }
  }

  const transporter = await createTransport()
  const sendMs = Math.min(60000, SMTP_SOCKET_MS + 15000)
  try {
    await withTimeout(
      transporter.sendMail({
        from: `"Job Search Copilot" <${SMTP_FROM}>`,
        to: recipientEmail,
        subject,
        html,
      }),
      sendMs,
      'SMTP sendMail',
    )
  } catch (e) {
    const hint =
      ' Railway often blocks SMTP. Add RESEND_API_KEY (resend.com, free tier) — uses HTTPS instead of port 587 — or try from a host that allows outbound SMTP.'
    return {
      sent: false,
      message: `${e instanceof Error ? e.message : String(e)}.${hint}`,
    }
  }

  return { sent: true, message: `Digest sent to ${recipientEmail}` }
}
