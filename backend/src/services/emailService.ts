/**
 * Email Service — nodemailer wrapper.
 *
 * Configure via environment variables (add to backend/.env):
 *
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_USER=you@gmail.com
 *   SMTP_PASS=your-gmail-app-password   # Gmail: myaccount.google.com → Security → App Passwords
 *   SMTP_FROM=you@gmail.com             # defaults to SMTP_USER
 *   DIGEST_TO=you@gmail.com            # who receives the weekly digest
 *
 * If SMTP_HOST is not set, email sending is silently skipped and a warning is logged.
 */

import nodemailer from 'nodemailer'
import type { WeeklyDigestData } from './weeklyDigest'

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587', 10)
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM ?? SMTP_USER
const DIGEST_TO = process.env.DIGEST_TO ?? SMTP_USER

export function isEmailEnabled(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS && DIGEST_TO)
}

function createTransport() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
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

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendWeeklyDigestEmail(
  data: WeeklyDigestData,
  recipientEmail: string,
  recipientName = 'there',
): Promise<{ sent: boolean; message: string }> {
  if (!isEmailEnabled()) {
    return {
      sent: false,
      message: 'Email not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS, DIGEST_TO to backend/.env to enable.',
    }
  }

  const transporter = createTransport()
  const html = buildWeeklyDigestHtml(data, recipientName)

  await transporter.sendMail({
    from: `"Job Search Copilot" <${SMTP_FROM}>`,
    to: recipientEmail,
    subject: `Your weekly job search summary — ${data.period.label}`,
    html,
  })

  return { sent: true, message: `Digest sent to ${recipientEmail}` }
}
