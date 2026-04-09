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
      '  ⚠  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google login disabled.',
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
          const email =
            profile.emails?.[0]?.value ?? `${profile.id}@google.placeholder`
          const name = profile.displayName ?? ''
          const avatarUrl = profile.photos?.[0]?.value ?? ''

          const existingUser = await prisma.user.findUnique({ where: { googleId: profile.id } })
          const isNewUser = !existingUser

          const user = await prisma.user.upsert({
            where: { googleId: profile.id },
            update: { name, avatarUrl, email },
            create: {
              googleId: profile.id,
              email,
              name,
              avatarUrl,
            },
          })

          if (isNewUser) {
            // Check if there is unclaimed data under the system user (id=1).
            // This happens when the app was seeded or used before auth was enabled.
            // Reassign everything to the new real user automatically.
            const SYSTEM_USER_ID = 1
            const systemHasData = await prisma.targetCompany.count({ where: { userId: SYSTEM_USER_ID } })

            if (systemHasData > 0) {
              await prisma.$transaction([
                prisma.targetCompany.updateMany({ where: { userId: SYSTEM_USER_ID }, data: { userId: user.id } }),
                prisma.profile.updateMany({ where: { userId: SYSTEM_USER_ID }, data: { userId: user.id } }),
                prisma.resume.updateMany({ where: { userId: SYSTEM_USER_ID }, data: { userId: user.id } }),
                prisma.appSettings.updateMany({ where: { userId: SYSTEM_USER_ID }, data: { userId: user.id } }),
              ])
              console.log(`  ✓ Migrated system data → userId=${user.id} (${email})`)
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

    const frontendUrl =
      process.env.FRONTEND_URL ?? 'http://localhost:5173'

    // Redirect to frontend with token in the URL hash so it never hits server logs
    res.redirect(`${frontendUrl}?auth_token=${token}`)
  },
)

// GET /auth/failed
router.get('/failed', (_req, res) => {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
  res.redirect(`${frontendUrl}?auth_error=login_failed`)
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
