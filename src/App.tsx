import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Toaster } from '@/components/ui/toaster'
import { AppStateProvider } from '@/context/app-state-compat'
import { ToastStateProvider } from '@/hooks/use-toast'
import { CompaniesPage } from '@/pages/CompaniesPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ImportExportPage } from '@/pages/ImportExportPage'
import { JobDetailPage } from '@/pages/JobDetailPage'
import { JobsFeedPage } from '@/pages/JobsFeedPage'
import { ManualIntakePage } from '@/pages/ManualIntakePage'
import { ProfilePage } from '@/pages/ProfilePage'
import { ResumesPage } from '@/pages/ResumesPage'
import { AgentRunsPage } from '@/pages/AgentRunsPage'
import { GeneratedAssetsPage } from '@/pages/GeneratedAssetsPage'
import { SourceHealthPage } from '@/pages/SourceHealthPage'

function AppRoutes() {
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
 * When running with the backend, the app is served at http://localhost:5173.
 */
export default function App() {
  const isProd = import.meta.env.PROD
  return (
    <ToastStateProvider>
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
    </ToastStateProvider>
  )
}
