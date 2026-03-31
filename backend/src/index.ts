import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { startScheduler } from './services/scheduler'
import profileRouter from './routes/profile'
import companiesRouter from './routes/companies'
import jobsRouter from './routes/jobs'
import resumesRouter from './routes/resumes'
import dashboardRouter from './routes/dashboard'
import agentsRouter from './routes/agents'
import importExportRouter from './routes/importExport'
import prisma from './db/client'

const app = express()
const PORT = parseInt(process.env.PORT ?? '3001', 10)

// Security & parsing
app.use(helmet({ crossOriginEmbedderPolicy: false }))
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
    ...(process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) ?? []),
  ],
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    const aiEnabled = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'mock')
    res.json({
      ok: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      ai: aiEnabled ? 'enabled' : 'mock',
      model: aiEnabled ? (process.env.AI_MODEL || 'gpt-4o-mini') : null,
    })
  } catch (e) {
    res.status(503).json({ ok: false, status: 'unhealthy', error: String(e) })
  }
})

// API routes
app.use('/api/profile', profileRouter)
app.use('/api/companies', companiesRouter)
app.use('/api/jobs', jobsRouter)
app.use('/api/resumes', resumesRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/agents', agentsRouter)
app.use('/api/export', importExportRouter)
app.use('/api/import', importExportRouter)

// 404 for unmatched API routes
app.use('/api/*', (_req, res) => {
  res.status(404).json({ ok: false, error: 'API route not found' })
})

// Start server — bind to 0.0.0.0 so Railway/containers can expose the port
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Job Search Backend running at http://localhost:${PORT}`)
  console.log(`   Health: http://localhost:${PORT}/api/health`)
  console.log(`   DB: ${process.env.DATABASE_URL ?? 'file:./data/job-search.db'}`)
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'mock') {
    console.log('\n   ⚠  AI mock mode — set OPENAI_API_KEY in backend/.env to enable real agents')
  } else {
    console.log(`\n   ✓ AI enabled — model: ${process.env.AI_MODEL ?? 'gpt-4o-mini'}`)
  }
  console.log()

  startScheduler()
})

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
})

export default app
