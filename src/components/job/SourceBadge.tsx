import {
  Building2,
  ClipboardPen,
  Globe,
  Headphones,
  Leaf,
  Linkedin,
  UserPlus,
} from 'lucide-react'
import type { JobSourceType } from '@/domain/types'
import { cn } from '@/lib/utils'

type StyleCfg = { className: string; icon: typeof Building2 }

/** Backend can emit ATS + job_board_* types not listed in JobSourceType — always resolve a style. */
const STYLES: Record<string, StyleCfg> = {
  greenhouse: {
    icon: Leaf,
    className:
      'border-emerald-500/40 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-emerald-100 shadow-[0_0_20px_-8px_rgba(52,211,153,0.5)]',
  },
  company_career_page: {
    icon: Building2,
    className:
      'border-sky-500/35 bg-gradient-to-br from-sky-500/15 to-cyan-500/5 text-sky-100',
  },
  linkedin_manual: {
    icon: Linkedin,
    className:
      'border-[#0a66c2]/50 bg-gradient-to-br from-[#0a66c2]/25 to-blue-900/20 text-blue-100',
  },
  referral: {
    icon: UserPlus,
    className:
      'border-amber-500/40 bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-100',
  },
  recruiter: {
    icon: Headphones,
    className:
      'border-violet-500/35 bg-gradient-to-br from-violet-500/20 to-purple-900/15 text-violet-100',
  },
  manual_entry: {
    icon: ClipboardPen,
    className:
      'border-border bg-muted/80 text-muted-foreground ring-1 ring-inset ring-white/5',
  },
  lever: {
    icon: Building2,
    className:
      'border-sky-500/35 bg-gradient-to-br from-sky-500/15 to-cyan-500/5 text-sky-100',
  },
  ashby: {
    icon: Building2,
    className:
      'border-violet-500/35 bg-gradient-to-br from-violet-500/15 to-purple-900/10 text-violet-100',
  },
  workable: {
    icon: Building2,
    className:
      'border-teal-500/35 bg-gradient-to-br from-teal-500/15 to-emerald-900/10 text-teal-100',
  },
  job_board_remotive: {
    icon: Globe,
    className:
      'border-cyan-500/40 bg-gradient-to-br from-cyan-500/20 to-blue-900/15 text-cyan-100',
  },
  job_board_arbeitnow: {
    icon: Globe,
    className:
      'border-cyan-500/40 bg-gradient-to-br from-cyan-500/20 to-blue-900/15 text-cyan-100',
  },
  job_board_adzuna: {
    icon: Globe,
    className:
      'border-cyan-500/40 bg-gradient-to-br from-cyan-500/20 to-blue-900/15 text-cyan-100',
  },
}

const FALLBACK_STYLE: StyleCfg = {
  icon: Globe,
  className:
    'border-border bg-muted/80 text-muted-foreground ring-1 ring-inset ring-white/5',
}

export function SourceBadge({
  sourceType,
  label,
  className,
  size = 'default',
}: {
  sourceType: JobSourceType | string
  label: string
  className?: string
  size?: 'default' | 'sm'
}) {
  const cfg = STYLES[sourceType] ?? (sourceType.startsWith('job_board_') ? STYLES.job_board_remotive : FALLBACK_STYLE)
  const Icon = cfg.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border font-medium backdrop-blur-sm',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        cfg.className,
        className,
      )}
      title={`Source: ${label}`}
    >
      <Icon className={cn('shrink-0 opacity-90', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      <span className="tracking-wide">{label}</span>
    </span>
  )
}
