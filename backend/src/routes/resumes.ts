import { Router } from 'express'
import multer from 'multer'
import prisma from '../db/client'
import { requireAuth } from '../middleware/auth'
import { parseFileToText, isSupportedMime } from '../services/fileParser'
import { callAi } from '../services/aiService'
import { buildCvExtractionMessages, type ExtractedProfile } from '../prompts/cvExtraction'

const router = Router()
router.use(requireAuth)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
})

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

// POST /api/resumes/upload — multipart file upload (PDF or DOCX)
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded. Send a PDF or DOCX as the "file" field.' })
    }

    const mimeType = req.file.mimetype
    if (!isSupportedMime(mimeType)) {
      return res.status(400).json({ ok: false, error: `Unsupported file type "${mimeType}". Upload a PDF or DOCX.` })
    }

    const rawText = await parseFileToText(req.file.buffer, mimeType)

    if (!rawText || rawText.length < 50) {
      return res.status(422).json({ ok: false, error: 'Could not extract text from the file. Make sure the PDF is not scanned/image-only.' })
    }

    const title = (req.body.title as string | undefined)?.trim()
      || req.file.originalname.replace(/\.(pdf|docx)$/i, '')

    const isBaseResume = req.body.isBaseResume === 'true' || req.body.isBaseResume === true

    if (isBaseResume) {
      await prisma.resume.updateMany({ where: { userId: req.userId }, data: { isBaseResume: false } })
    }

    const resume = await prisma.resume.create({
      data: {
        userId: req.userId,
        title,
        rawText,
        isBaseResume,
        filePath: req.file.originalname,
      },
    })

    res.status(201).json({ ok: true, resume, charCount: rawText.length })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/resumes/:id/extract-profile — AI extraction of profile fields from resume text
router.post('/:id/extract-profile', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const resume = await prisma.resume.findFirst({ where: { id, userId: req.userId } })
    if (!resume) return res.status(404).json({ ok: false, error: 'Resume not found' })
    if (!resume.rawText || resume.rawText.length < 50) {
      return res.status(422).json({ ok: false, error: 'Resume has no text to extract from.' })
    }

    const messages = buildCvExtractionMessages(resume.rawText)
    const response = await callAi(messages, undefined, 2000)

    if (response.modelUsed === 'mock') {
      return res.status(503).json({
        ok: false,
        error: 'AI not configured. Add OPENAI_API_KEY to backend/.env to enable CV profile extraction.',
      })
    }

    let extracted: ExtractedProfile
    try {
      extracted = JSON.parse(response.content) as ExtractedProfile
    } catch {
      return res.status(500).json({ ok: false, error: 'AI returned unparseable JSON. Try again.' })
    }

    res.json({ ok: true, extracted })
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
