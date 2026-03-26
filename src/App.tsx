import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Toaster } from '@/components/ui/toaster'
import { AppStateProvider } from '@/context/app-state'
import { ToastStateProvider } from '@/hooks/use-toast'
import { CompaniesPage } from '@/pages/CompaniesPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ImportExportPage } from '@/pages/ImportExportPage'
import { JobDetailPage } from '@/pages/JobDetailPage'
import { JobsFeedPage } from '@/pages/JobsFeedPage'
import { ManualIntakePage } from '@/pages/ManualIntakePage'
import { ProfilePage } from '@/pages/ProfilePage'

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
 * GitHub Pages has no static files for `/job-search/profile` etc., so path-based URLs 404 on
 * refresh. Hash routes (`/job-search/#/profile`) only request `/job-search/`, which exists.
 * Dev keeps BrowserRouter + basename for normal `/job-search/...` paths.
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
