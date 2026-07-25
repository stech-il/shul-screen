/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  shulKiosk?: {
    isElectron: boolean;
    requestExit?: () => void;
    onExitRequest?: (cb: () => void) => void;
    fetchOrefAlerts?: () => Promise<string>;
    log?: (msg: string) => Promise<boolean> | void;
  };
}
