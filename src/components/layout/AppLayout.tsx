import {
  Activity,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  Database,
  FileText,
  Globe,
  Inbox,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Server,
  Sparkles,
  UserRound,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAppState } from '@/context/app-state-compat'
import { useAuth } from '@/context/AuthContext'
import { queueApi } from '@/services/api'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/jobs', label: 'Jobs Feed', icon: Briefcase },
  { to: '/companies', label: 'Companies', icon: Building2 },
  { to: '/job-boards', label: 'Job Boards', icon: Globe },
  { to: '/intake', label: 'Manual Intake', icon: PlusCircle },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

const agentNav = [
  { to: '/digest', label: 'Weekly Digest', icon: CalendarDays },
  { to: '/resumes', label: 'Resume Library', icon: FileText },
  { to: '/assets', label: 'Generated Assets', icon: Sparkles },
  { to: '/agent-runs', label: 'Agent Runs', icon: Activity },
  { to: '/source-health', label: 'Source Health', icon: Server },
]

const toolsNav = [
  { to: '/data', label: 'Import / Export', icon: Database },
]

export function AppLayout() {
  const { loading, backendAvailable } = useAppState()
  const { user, logout } = useAuth()
  const [pendingQueueCount, setPendingQueueCount] = useState(0)

  useEffect(() => {
    if (!backendAvailable) return
    queueApi.list({ limit: '1' })
      .then((d) => setPendingQueueCount(d.pendingCount))
      .catch(() => {/* non-fatal */})
  }, [backendAvailable])

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
                Agent Copilot
              </p>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
            {/* Main nav */}
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

            {/* Agent section */}
            <div className="mt-4 mb-1 px-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                Agent Layer
              </p>
            </div>

            {/* Inbox — special nav item with pending badge */}
            <NavLink
              to="/queue"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary/12 text-primary shadow-sm ring-1 ring-primary/15'
                    : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
                )
              }
            >
              <Inbox className="h-4 w-4 shrink-0" />
              <span className="flex-1">Inbox</span>
              {pendingQueueCount > 0 && (
                <Badge className="ml-auto h-5 px-1.5 text-[10px] font-bold">
                  {pendingQueueCount}
                </Badge>
              )}
            </NavLink>

            {agentNav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
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

            {/* Tools section */}
            <div className="mt-4 mb-1 px-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                Tools
              </p>
            </div>
            {toolsNav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
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

          {/* User info + logout */}
          {user && (
            <div className="border-t border-white/[0.06] px-4 py-3 flex items-center gap-2.5">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="h-7 w-7 rounded-full ring-1 ring-white/10 shrink-0"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                  {user.name.charAt(0).toUpperCase() || '?'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium leading-tight truncate">{user.name || user.email}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={logout}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                    aria-label="Sign out"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            </div>
          )}

          <div className="border-t border-white/[0.06] p-4 space-y-2">
            {loading ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-primary/50" />
                <span className="text-xs text-muted-foreground">Connecting to backend…</span>
              </div>
            ) : backendAvailable ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex cursor-help items-center gap-2 rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2">
                    <Wifi className="h-3.5 w-3.5 text-emerald-500/70" />
                    <span className="text-xs text-muted-foreground">Backend connected</span>
                    <Badge variant="outline" className="ml-auto text-[10px] uppercase tracking-wide text-emerald-500 border-emerald-500/30">
                      Live
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs bg-card text-card-foreground border-border">
                  Connected to local backend at localhost:3001. Data stored in SQLite.
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex cursor-help items-center gap-2 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/[0.06] px-3 py-2">
                    <WifiOff className="h-3.5 w-3.5 text-amber-500/70" />
                    <span className="text-xs text-muted-foreground">Backend offline</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs bg-card text-card-foreground border-border">
                  Backend not reachable. Run: cd backend && npm run dev
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col border-l border-white/[0.04] bg-background/30">
          <header className="sticky top-0 z-40 flex flex-col gap-2 border-b border-white/[0.06] bg-background/75 px-4 py-2 backdrop-blur-md lg:hidden">
            <div className="flex min-h-10 items-center justify-between gap-2">
              <span className="font-display min-w-0 truncate text-sm font-semibold">
                Job Search Copilot
              </span>
              {user && (
                <div className="flex shrink-0 items-center gap-2">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="h-8 w-8 rounded-full ring-1 ring-white/10"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                      {user.name.charAt(0).toUpperCase() || '?'}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={logout}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-white/[0.08] active:bg-white/[0.12]"
                  >
                    <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Sign out
                  </button>
                </div>
              )}
            </div>
            <nav className="flex gap-1 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch]">
              {[...nav, { to: '/queue', label: 'Inbox' }, ...agentNav, ...toolsNav].map(({ to, label }) => (
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
