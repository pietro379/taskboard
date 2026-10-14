import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { config } from './config.js'
import { authRouter } from './routes/auth.js'
import { workspacesRouter } from './routes/workspaces.js'
import { projectsRouter } from './routes/projects.js'
import { tasksRouter } from './routes/tasks.js'
import { errorHandler, notFound } from './middleware/error.js'

// Bağımlılıklar dışarıdan verilir; testlerde gerçek veritabanı yerine sahte repo kullanılabilir.
export function createApp({ users, db }) {
  const app = express()

  app.use(helmet())
  app.use(cors({ origin: config.corsOrigin }))
  app.use(express.json({ limit: '100kb' }))

  app.get('/health', (_req, res) => res.json({ status: 'ok' }))

  // Kaba kuvvet denemelerini yavaşlatmak için kimlik uçlarına sınır konur.
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false })
  app.use('/api/auth', authLimiter, authRouter({ users }))

  app.use('/api/workspaces', workspacesRouter({ db }))
  app.use('/api', projectsRouter({ db }))
  app.use('/api', tasksRouter({ db }))

  app.use(notFound)
  app.use(errorHandler)
  return app
}
