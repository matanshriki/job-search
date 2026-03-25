import {
  Briefcase,
  Building2,
  ClipboardList,
  Database,
  LayoutDashboard,
  PlusCircle,
  UserRound,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/jobs', label: 'Jobs Feed', icon: Briefcase },
  { to: '/companies', label: 'Companies', icon: Building2 },
  { to: '/intake', label: 'Manual Intake', icon: PlusCircle },
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/data', label: 'Import / Export', icon: Database },
]

export function AppLayout() {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-white/[0.06] bg-card/25 shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.03)] backdrop-blur-xl lg:flex">
          <div className="flex h-16 items-center gap-2 border-b border-white/[0.06] px-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/25 to-primary/5 text-primary ring-1 ring-primary/20">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-sm font-semibold leading-tight tracking-tight">
                Job Search
              </p>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Command Center
              </p>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 p-3">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-primary/12 text-primary shadow-sm ring-1 ring-primary/15'
                      : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto border-t border-white/[0.06] p-4">
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-primary/35 bg-primary/[0.06] px-3 py-2">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                Local-first
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-xs text-muted-foreground">All data stays in this browser.</span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs bg-card text-card-foreground border-border">
                  Nothing is sent to a server. Export JSON regularly for backups.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col border-l border-white/[0.04] bg-background/30">
          <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-background/75 px-4 backdrop-blur-md lg:hidden">
            <span className="font-display text-sm font-semibold">Job Search Command Center</span>
            <Separator orientation="vertical" className="h-6" />
            <nav className="flex flex-1 gap-1 overflow-x-auto">
              {nav.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium',
                      isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
                    )
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </header>
          <main className="flex-1 overflow-auto">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
