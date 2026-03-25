/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional HTTPS endpoint with the same JSON contract as dev `/__career_fetch?url=` (for self-hosted proxy). */
  readonly VITE_CAREER_FETCH_URL?: string
  /** Set to `true` to skip the public CORS relay on production builds. */
  readonly VITE_DISABLE_PUBLIC_CORS_PROXY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
