/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the API lives. Empty on Pages, where there is no backend. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
