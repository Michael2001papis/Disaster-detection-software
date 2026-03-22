/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional override for gate access code (build-time). If unset, built-in demo constant is used. */
  readonly VITE_HACHAL_ACCESS_CODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
