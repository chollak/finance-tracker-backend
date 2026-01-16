/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TG_BOT_USERNAME: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
