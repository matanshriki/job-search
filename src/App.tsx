import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Toaster } from '@/components/ui/toaster'
import { AppStateProvider } from '@/context/app-state-compat'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { ToastStateProvider } from '@/hooks/use-toast'
import { CompaniesPage } from '@/pages/CompaniesPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ImportExportPage } from '@/pages/ImportExportPage'
import { JobDetailPage } from '@/pages/JobDetailPage'
import { JobsFeedPage } from '@/pages/JobsFeedPage'
import { LoginPage } from '@/pages/LoginPage'
import { ManualIntakePage } from '@/pages/ManualIntakePage'
import { ProfilePage } from '@/pages/ProfilePage'
import { ResumesPage } from '@/pages/ResumesPage'
import { AgentRunsPage } from '@/pages/AgentRunsPage'
import { GeneratedAssetsPage } from '@/pages/GeneratedAssetsPage'
import { SourceHealthPage } from '@/pages/SourceHealthPage'
import { JobBoardsPage } from '@/pages/JobBoardsPage'
import { ApprovalQueuePage } from '@/pages/ApprovalQueuePage'
import { useEffect } from 'react'

function AppRoutes() {
  const { isAuthenticated, isLoading, logout } = useAuth()

  // Listen for 401 events emitted by the API client when a token expires
  useEffect(() => {
    const handler = () => logout()
    window.addEventListener('auth:expired', handler)
    return () => window.removeEventListener('auth:expired', handler)
  }, [logout])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="jobs" element={<JobsFeedPage />} />
        <Route path="jobs/:id" element={<JobDetailPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="intake" element={<ManualIntakePage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="resumes" element={<ResumesPage />} />
        <Route path="agent-runs" element={<AgentRunsPage />} />
        <Route path="assets" element={<GeneratedAssetsPage />} />
        <Route path="source-health" element={<SourceHealthPage />} />
        <Route path="job-boards" element={<JobBoardsPage />} />
        <Route path="queue" element={<ApprovalQueuePage />} />
        <Route path="data" element={<ImportExportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function AppShell() {
  return (
    <>
      <AppRoutes />
      <Toaster />
    </>
  )
}

/**
 * GitHub Pages: uses HashRouter in prod so deep-links work.
 * Local dev: BrowserRouter with basename from Vite.
 */
export default function App() {
  const isProd = import.meta.env.PROD
  return (
    <ToastStateProvider>
      <AuthProvider>
        <AppStateProvider>
          {isProd ? (
            <HashRouter>
              <AppShell />
            </HashRouter>
          ) : (
            <BrowserRouter
              basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}
            >
              <AppShell />
            </BrowserRouter>
          )}
        </AppStateProvider>
      </AuthProvider>
    </ToastStateProvider>
  )
}
