import { Router } from 'express'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import prisma from '../db/client'
import { signToken, requireAuth } from '../middleware/auth'

const router = Router()

/** Initialise Google OAuth strategy. Call once at startup. */
export function setupPassport() {
  const clientID = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3001'

  if (!clientID || !clientSecret) {
    console.warn(
      '  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google login disabled.',
    )
    return
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL: `${backendUrl}/auth/google/callback`,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const rawEmail =
            profile.emails?.[0]?.value ?? `${profile.id}@google.placeholder`
          const email = rawEmail.trim().toLowerCase()
          const name = profile.displayName ?? ''
          const avatarUrl = profile.photos?.[0]?.value ?? ''

          // 1) Returning Google user
          let user = await prisma.user.findUnique({ where: { googleId: profile.id } })

          if (user) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { name, avatarUrl, email },
            })
          } else {
            // 2) Existing row with same email (seed / import) but no googleId yet — attach this Google account
            const byEmail = await prisma.user.findUnique({ where: { email } })
            if (byEmail) {
              if (byEmail.googleId && byEmail.googleId !== profile.id) {
                return done(
                  new Error(
                    'This email is already linked to a different Google account. Use that account or contact support.',
                  ),
                )
              }
              user = await prisma.user.update({
                where: { id: byEmail.id },
                data: { googleId: profile.id, name, avatarUrl, email },
              })
            } else {
              user = await prisma.user.create({
                data: { googleId: profile.id, email, name, avatarUrl },
              })
            }
          }

          // Create default profile + settings on first login if still missing
          const existingProfile = await prisma.profile.findFirst({
            where: { userId: user.id },
          })
          if (!existingProfile) {
            await prisma.profile.create({
              data: { userId: user.id, fullName: name, email },
            })
          }

          const existingSettings = await prisma.appSettings.findUnique({
            where: { userId: user.id },
          })
          if (!existingSettings) {
            await prisma.appSettings.create({
              data: {
                userId: user.id,
                minRelevantScore: 55,
                autoScanIntervalHours: 6,
                autoRunFitAnalysis: true,
                fitAnalysisThreshold: 55,
              },
            })
          }

          done(null, user)
        } catch (err) {
          done(err as Error)
        }
      },
    ),
  )

  passport.serializeUser((user: Express.User, done) => done(null, user))
  passport.deserializeUser((user: Express.User, done) => done(null, user))
}

// GET /auth/google — kick off the OAuth flow
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false }),
)

// GET /auth/google/callback — Google redirects here after consent
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/failed' }),
  (req, res) => {
    const user = req.user as { id: number; email: string; name: string; avatarUrl: string }
    const token = signToken({ userId: user.id, email: user.email })

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'

    // Put the JWT in the URL *fragment* (hash), not the query string. Query tokens leak via
    // Referer headers, server access logs, and analytics — and users can accidentally share them.
    const target = new URL(frontendUrl, 'http://localhost')
    target.hash = `auth_token=${encodeURIComponent(token)}`
    res.redirect(target.toString())
  },
)

// GET /auth/failed
router.get('/failed', (_req, res) => {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
  const target = new URL(frontendUrl, 'http://localhost')
  target.hash = 'auth_error=login_failed'
  res.redirect(target.toString())
})

// GET /auth/me — returns current user info (requires JWT)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
    })
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' })
    res.json({ ok: true, user })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /auth/logout — client just drops the token; this is a no-op but useful for future revocation
router.post('/logout', requireAuth, (_req, res) => {
  res.json({ ok: true, message: 'Logged out successfully.' })
})

export default router
