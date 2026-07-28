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
    getConfig?: () => Promise<{
      shulId: string;
      serverUrl: string;
      registeredAt?: string | null;
      openAtLogin?: boolean;
    }>;
    saveConfig?: (body: {
      shulId: string;
      serverUrl: string;
    }) => Promise<{ ok: boolean; error?: string; config?: unknown }>;
    continueToSplash?: () => Promise<{ ok: boolean }>;
    openSetup?: () => Promise<{ ok: boolean }>;
    connectAndLoad?: () => Promise<{
      mode: string;
      url?: string;
      error?: string;
    }>;
  };
}
