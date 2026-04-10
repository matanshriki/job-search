import { Router } from 'express'
import prisma from '../db/client'
import { requireAuth } from '../middleware/auth'
import { generateWeeklyDigest } from '../services/weeklyDigest'
import { sendWeeklyDigestEmail, isEmailEnabled } from '../services/emailService'

const router = Router()
router.use(requireAuth)

// GET /api/digest — generate and return this week's digest data
router.get('/', async (req, res) => {
  try {
    const digest = await generateWeeklyDigest(req.userId)
    res.json({ ok: true, digest, emailEnabled: isEmailEnabled() })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/digest/send — send the digest email now (or return it if email not configured)
router.post('/send', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } })
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' })

    const profileRow = await prisma.profile.findFirst({ where: { userId: req.userId } })
    const recipientEmail = req.body?.email || profileRow?.email || user.email
    const recipientName = profileRow?.fullName?.split(' ')[0] || user.name?.split(' ')[0] || 'there'

    if (!recipientEmail) {
      return res.status(400).json({ ok: false, error: 'No email address found. Add one to your profile.' })
    }

    const digest = await generateWeeklyDigest(req.userId)
    const result = await sendWeeklyDigestEmail(digest, recipientEmail, recipientName)

    res.json({ ok: true, ...result, digest })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

export default router
