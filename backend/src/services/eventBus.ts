/**
 * Event Bus — typed, in-process pub/sub for agent pipeline coordination.
 * Uses Node's built-in EventEmitter so no external broker is needed.
 * All events are also observable via AgentRun + ActivityLog DB records.
 */

import { EventEmitter } from 'node:events'

// ─── Event payloads ───────────────────────────────────────────────────────────

export interface JobCreatedEvent {
  jobPostingId: number
  fitScore: number
  userId: number
  source: 'scout' | 'job_board' | 'manual'
}

export interface FitAnalysisCompletedEvent {
  jobPostingId: number
  fitScore: number
  fitLabel: string
  userId: number
  fitSummary?: string
}

export interface CrawlCompletedEvent {
  sourceId: number
  boardType: string
  userId: number
  jobsFound: number
  jobsCreated: number
}

export interface PipelineEventMap {
  'job.created': [JobCreatedEvent]
  'fit_analysis.completed': [FitAnalysisCompletedEvent]
  'crawl.completed': [CrawlCompletedEvent]
}

// ─── Typed emitter ────────────────────────────────────────────────────────────

class TypedEventBus extends EventEmitter {
  emit<K extends keyof PipelineEventMap>(event: K, ...args: PipelineEventMap[K]): boolean {
    return super.emit(event, ...args)
  }

  on<K extends keyof PipelineEventMap>(
    event: K,
    listener: (...args: PipelineEventMap[K]) => void,
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void)
  }

  once<K extends keyof PipelineEventMap>(
    event: K,
    listener: (...args: PipelineEventMap[K]) => void,
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void)
  }
}

// Singleton — shared across all modules that import this file
export const eventBus = new TypedEventBus()
// Prevent Node from warning about too many listeners (many agents may subscribe)
eventBus.setMaxListeners(50)
