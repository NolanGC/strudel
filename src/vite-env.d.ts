/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL?: string
  readonly VITE_AUTH_MODE?: 'convex' | 'template'
  readonly VITE_APP_VERSION?: string
  readonly VITE_OTEL_CONSOLE?: 'true' | 'false'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
