/* eslint-disable react-refresh/only-export-components */
/**
 * Re-exports the API-backed compat layer so existing pages that import from
 * '@/context/app-state' automatically use the backend-wired implementation.
 * Do not add any logic here — all logic lives in app-state-compat.tsx.
 */
export {
  AppStateProvider,
  useAppState,
  useApiState,
} from './app-state-compat'
