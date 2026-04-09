import { Router } from 'express'
import prisma from '../db/client'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

// GET /api/resumes
router.get('/', async (req, res) => {
  try {
    const resumes = await prisma.resume.findMany({
      where: { userId: req.userId },
      orderBy: [{ isBaseResume: 'desc' }, { createdAt: 'desc' }],
    })
    res.json({ ok: true, resumes })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/resumes
router.post('/', async (req, res) => {
  try {
    const { title, rawText, isBaseResume } = req.body as {
      title: string; rawText?: string; isBaseResume?: boolean
    }
    if (!title) return res.status(400).json({ ok: false, error: 'title is required' })

    if (isBaseResume) {
      await prisma.resume.updateMany({ where: { userId: req.userId }, data: { isBaseResume: false } })
    }

    const resume = await prisma.resume.create({
      data: { userId: req.userId, title, rawText: rawText ?? '', isBaseResume: isBaseResume ?? false },
    })
    res.status(201).json({ ok: true, resume })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/resumes/:id
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const resume = await prisma.resume.findFirst({ where: { id, userId: req.userId } })
    if (!resume) return res.status(404).json({ ok: false, error: 'Not found' })
    res.json({ ok: true, resume })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// PUT /api/resumes/:id
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const existing = await prisma.resume.findFirst({ where: { id, userId: req.userId } })
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' })

    const { title, rawText, isBaseResume } = req.body as {
      title?: string; rawText?: string; isBaseResume?: boolean
    }

    if (isBaseResume) {
      await prisma.resume.updateMany({ where: { userId: req.userId, id: { not: id } }, data: { isBaseResume: false } })
    }

    const resume = await prisma.resume.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(rawText !== undefined && { rawText }),
        ...(isBaseResume !== undefined && { isBaseResume }),
      },
    })
    res.json({ ok: true, resume })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// DELETE /api/resumes/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const resume = await prisma.resume.findFirst({ where: { id, userId: req.userId } })
    if (!resume) return res.status(404).json({ ok: false, error: 'Not found' })
    if (resume.isBaseResume) {
      return res.status(400).json({ ok: false, error: 'Cannot delete the base resume. Set another as base first.' })
    }
    await prisma.resume.delete({ where: { id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

export default router
