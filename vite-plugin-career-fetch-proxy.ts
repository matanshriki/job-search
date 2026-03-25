import * as http from 'node:http'
import * as https from 'node:https'
import type { ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const MAX_BYTES = 5 * 1024 * 1024

/** Real browser UA — some CDNs block generic “compatible; …” bot strings. */
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function formatFetchError(e: unknown): string {
  if (!(e instanceof Error)) return String(e)
  const c = e.cause instanceof Error ? e.cause.message : e.cause != null ? String(e.cause) : ''
  if (c && !e.message.includes(c)) return `${e.message} (${c})`
  return e.message
}

function tlsTroubleshootHint(message: string): string {
  if (!/certificate|tls|ssl|unable.to.verify|cert/i.test(message)) return ''
  return (
    ' If this persists, set NODE_EXTRA_CA_CERTS to your organization root CA, ' +
    'or start Vite with JOB_SEARCH_ALLOW_INSECURE_TLS=1 (forces insecure TLS for this dev proxy only).'
  )
}

/** Node fetch failed before TLS — common behind corporate SSL inspection (browser may still work). */
function isLikelyTlsVerificationFailure(message: string): boolean {
  return /self-signed|certificate chain|unable to verify|UNABLE_TO_VERIFY|certificate verify failed|ssl\/tls|openssl|ERR_TLS|x509/i.test(
    message,
  )
}

function sendFetchedHtml(
  res: ServerResponse,
  buf: Buffer,
  statusCode: number,
  finalUrl: string,
): void {
  if (buf.byteLength > MAX_BYTES) {
    sendJson(res, 413, { ok: false, error: 'Response exceeds size limit (5MB)' })
    return
  }
  const html = buf.toString('utf-8')
  if (statusCode < 200 || statusCode >= 400) {
    sendJson(res, 200, {
      ok: false,
      error: `HTTP ${statusCode} when fetching career page.`,
      status: statusCode,
      finalUrl,
    })
    return
  }
  sendJson(res, 200, { ok: true, html, finalUrl })
}

/** Dev escape hatch when Node fetch fails TLS (e.g. MITM corporate proxies). */
function httpGetAllowInsecure(
  urlStr: string,
  headers: Record<string, string>,
  maxRedirects: number,
): Promise<{ statusCode: number; buf: Buffer; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    const visit = (current: string, left: number) => {
      let target: URL
      try {
        target = new URL(current)
      } catch {
        reject(new Error('Invalid URL during redirect'))
        return
      }
      const isHttps = target.protocol === 'https:'
      const lib = isHttps ? https : http
      const opts: https.RequestOptions = {
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers,
        ...(isHttps ? { rejectUnauthorized: false } : {}),
      }
      const req = lib.request(opts, (incoming) => {
        const code = incoming.statusCode ?? 0
        const loc = incoming.headers.location
        if (loc && left > 0 && code >= 301 && code <= 308) {
          incoming.resume()
          let next: string
          try {
            next = new URL(loc, current).toString()
          } catch {
            reject(new Error(`Bad redirect Location: ${loc}`))
            return
          }
          visit(next, left - 1)
          return
        }
        const chunks: Buffer[] = []
        incoming.on('data', (d: Buffer) => chunks.push(d))
        incoming.on('end', () => {
          resolve({ statusCode: code, buf: Buffer.concat(chunks), finalUrl: current })
        })
      })
      req.on('error', reject)
      req.end()
    }
    visit(urlStr, maxRedirects)
  })
}

function isBlockedProxyHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true
  if (h.endsWith('.localhost') || h.endsWith('.local')) return true
  const octets = h.split('.')
  if (octets.length === 4 && octets.every((p) => /^\d{1,3}$/.test(p))) {
    const [a, b] = octets.map(Number)
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
  }
  return false
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/**
 * Dev-only: fetches career HTML server-side so the browser avoids CORS.
 * Not available in `vite preview` or static hosting.
 */
export function careerFetchDevProxy(): Plugin {
  return {
    name: 'career-fetch-dev-proxy',
    configureServer(server) {
      server.middlewares.use(
        '/__career_fetch',
        async (req, res, next) => {
          if (req.method !== 'GET') {
            next()
            return
          }
          let targetRaw: string
          try {
            const u = new URL(req.url ?? '', 'http://vite.local')
            targetRaw = u.searchParams.get('url') ?? ''
          } catch {
            sendJson(res, 400, { ok: false, error: 'Invalid request URL' })
            return
          }
          if (!targetRaw) {
            sendJson(res, 400, { ok: false, error: 'Missing url query parameter' })
            return
          }
          let targetUrl: URL
          try {
            targetUrl = new URL(targetRaw)
          } catch {
            sendJson(res, 400, { ok: false, error: 'Invalid target URL' })
            return
          }
          if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
            sendJson(res, 400, { ok: false, error: 'Only http and https URLs are allowed' })
            return
          }
          if (isBlockedProxyHost(targetUrl.hostname)) {
            sendJson(res, 403, {
              ok: false,
              error: 'Blocked host (private/local addresses are not allowed)',
            })
            return
          }

          const forwardHeaders: Record<string, string> = {
            'User-Agent': BROWSER_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          }

          const forceInsecureTls =
            process.env.JOB_SEARCH_ALLOW_INSECURE_TLS === '1' ||
            process.env.JOB_SEARCH_ALLOW_INSECURE_TLS === 'true'

          try {
            const runInsecure = async () => {
              const { statusCode, buf, finalUrl } = await httpGetAllowInsecure(
                targetUrl.toString(),
                forwardHeaders,
                12,
              )
              sendFetchedHtml(res, buf, statusCode, finalUrl)
            }

            if (forceInsecureTls) {
              await runInsecure()
              return
            }

            try {
              const r = await fetch(targetUrl.toString(), {
                redirect: 'follow',
                headers: forwardHeaders,
              })
              const finalUrl = r.url
              const ab = await r.arrayBuffer()
              const buf = Buffer.from(ab)
              if (!r.ok) {
                sendJson(res, 200, {
                  ok: false,
                  error: `HTTP ${r.status} when fetching career page.`,
                  status: r.status,
                  finalUrl,
                })
                return
              }
              sendFetchedHtml(res, buf, r.status, finalUrl)
            } catch (fetchErr) {
              const em = formatFetchError(fetchErr)
              if (isLikelyTlsVerificationFailure(em)) {
                await runInsecure()
                return
              }
              throw fetchErr
            }
          } catch (e) {
            const msg = formatFetchError(e)
            sendJson(res, 200, {
              ok: false,
              error: msg + tlsTroubleshootHint(msg),
            })
          }
        },
      )
    },
  }
}
