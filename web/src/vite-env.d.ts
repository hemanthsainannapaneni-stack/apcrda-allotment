/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Set to "false" to hide the demo-login quick-fill block on the sign-in screen. */
  readonly VITE_SHOW_DEMO_LOGINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
