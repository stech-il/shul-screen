import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import './AppNotice.css';

export type NoticeKind = 'info' | 'success' | 'warn' | 'error';

type ConfirmRequest = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type NoticeContextValue = {
  toast: (message: string, kind?: NoticeKind) => void;
  confirm: (req: ConfirmRequest | string) => Promise<boolean>;
};

const NoticeContext = createContext<NoticeContextValue | null>(null);

export function useAppNotice(): NoticeContextValue {
  const ctx = useContext(NoticeContext);
  if (!ctx) {
    return {
      toast: (message) => {
        /* fallback outside provider */
        console.info(message);
      },
      confirm: async (req) => {
        const message = typeof req === 'string' ? req : req.message;
        return window.confirm(message);
      },
    };
  }
  return ctx;
}

type Props = {
  children: ReactNode;
  labels?: {
    confirm?: string;
    cancel?: string;
    title?: string;
  };
};

/**
 * In-app toast + confirm dialog — replaces browser alert/confirm chrome.
 */
export function AppNoticeProvider({ children, labels }: Props) {
  const [toastState, setToastState] = useState<{ message: string; kind: NoticeKind } | null>(
    null,
  );
  const [confirmState, setConfirmState] = useState<
    (ConfirmRequest & { resolve: (ok: boolean) => void }) | null
  >(null);

  const toast = useCallback((message: string, kind: NoticeKind = 'info') => {
    setToastState({ message, kind });
    window.setTimeout(() => {
      setToastState((cur) => (cur?.message === message ? null : cur));
    }, 3400);
  }, []);

  const confirm = useCallback((req: ConfirmRequest | string) => {
    const normalized: ConfirmRequest = typeof req === 'string' ? { message: req } : req;
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...normalized, resolve });
    });
  }, []);

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  function closeConfirm(ok: boolean) {
    confirmState?.resolve(ok);
    setConfirmState(null);
  }

  return (
    <NoticeContext.Provider value={value}>
      {children}
      {toastState ? (
        <div className={`app-toast app-toast--${toastState.kind}`} role="status">
          {toastState.message}
        </div>
      ) : null}
      {confirmState ? (
        <div
          className="app-confirm-backdrop"
          role="presentation"
          onClick={() => closeConfirm(false)}
        >
          <div
            className="app-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-confirm-title"
            aria-describedby="app-confirm-msg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="app-confirm-kicker">{labels?.title || 'אישור'}</p>
            <h2 id="app-confirm-title">{confirmState.title || 'אישור פעולה'}</h2>
            <p id="app-confirm-msg" className="app-confirm-message">
              {confirmState.message}
            </p>
            <div className="app-confirm-actions">
              <button
                type="button"
                className="app-confirm-btn ghost"
                onClick={() => closeConfirm(false)}
              >
                {confirmState.cancelLabel || labels?.cancel || 'ביטול'}
              </button>
              <button
                type="button"
                className={`app-confirm-btn primary${confirmState.danger ? ' danger' : ''}`}
                onClick={() => closeConfirm(true)}
                autoFocus
              >
                {confirmState.confirmLabel || labels?.confirm || 'אישור'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </NoticeContext.Provider>
  );
}
