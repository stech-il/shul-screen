import type { SynagogueConfig } from '../types';
import {
  LIVE_BUMP_PREFIX,
  openLiveChannel,
  type LivePayload,
} from './liveBus';
import { expandConfigMedia } from './mediaPersist';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { loadLocal, normalizeConfig, pullFromCloud, saveLocal } from './storage';

type LiveHandler = (config: SynagogueConfig, meta: { source: string }) => void;

export interface LiveSubscription {
  stop: () => void;
  /** Call after Display finishes initial sync so poll doesn't replay the same rev */
  noteBaseline: (config: SynagogueConfig) => void;
}

/**
 * Listen for config changes and apply them without page refresh.
 * Channels: BroadcastChannel, storage events, Supabase Realtime, polling (2s).
 */
export function subscribeLiveUpdates(
  synagogueId: string,
  onUpdate: LiveHandler,
): LiveSubscription {
  let lastRevision = loadLocal(synagogueId)?.config.revision ?? 0;
  let lastUpdatedAt = loadLocal(synagogueId)?.config.updatedAt ?? '';
  let stopped = false;

  const isNewer = (config: SynagogueConfig) => {
    const rev = config.revision ?? 0;
    if (rev > lastRevision) return true;
    if (rev < lastRevision) return false;
    const at = config.updatedAt || '';
    return Boolean(at && at > lastUpdatedAt);
  };

  const noteBaseline = (config: SynagogueConfig) => {
    lastRevision = Math.max(lastRevision, config.revision ?? 0);
    if (config.updatedAt && config.updatedAt > lastUpdatedAt) {
      lastUpdatedAt = config.updatedAt;
    }
  };

  const apply = (config: SynagogueConfig, source: string) => {
    if (!isNewer(config)) return;
    lastRevision = Math.max(lastRevision, config.revision ?? 0);
    if (config.updatedAt) lastUpdatedAt = config.updatedAt;

    void (async () => {
      const normalized = normalizeConfig(config);
      // Cloud payloads are already compact — do not re-upload/compact on the display.
      try {
        saveLocal({
          config: normalized,
          syncedAt: new Date().toISOString(),
          pendingSync: false,
        });
      } catch {
        /* ignore quota */
      }
      if (stopped) return;
      const expanded = await expandConfigMedia(normalized);
      if (stopped) return;
      onUpdate(expanded, { source });
    })();
  };

  const channel = openLiveChannel();
  const onMessage = (ev: MessageEvent) => {
    const data = ev.data as LivePayload | null;
    if (!data || data.id !== synagogueId || !data.config) return;
    apply(data.config, 'broadcast');
  };
  channel?.addEventListener('message', onMessage);

  const onCustom = (ev: Event) => {
    const detail = (ev as CustomEvent<LivePayload>).detail;
    if (!detail || detail.id !== synagogueId || !detail.config) return;
    apply(detail.config, 'event');
  };
  window.addEventListener('shul-live-update', onCustom);

  const onStorage = (ev: StorageEvent) => {
    if (
      ev.key === LIVE_BUMP_PREFIX + synagogueId ||
      ev.key === `shul-screen-cloud:${synagogueId}`
    ) {
      void pullFromCloud(synagogueId).then((cloud) => {
        if (stopped) return;
        if (cloud) apply(cloud.config, 'storage');
        else {
          const local = loadLocal(synagogueId);
          if (local) apply(local.config, 'storage-local');
        }
      });
    }
    if (ev.key === `shul-screen:${synagogueId}` && ev.newValue) {
      try {
        const bundle = JSON.parse(ev.newValue) as { config: SynagogueConfig };
        apply(bundle.config, 'storage-local');
      } catch {
        /* ignore */
      }
    }
  };
  window.addEventListener('storage', onStorage);

  let supabaseUnsub: (() => void) | null = null;
  const sb = getSupabase();
  if (sb && isSupabaseConfigured) {
    const sub = sb
      .channel(`synagogue-${synagogueId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'synagogues',
          filter: `id=eq.${synagogueId}`,
        },
        (payload) => {
          const row = payload.new as { config?: SynagogueConfig } | null;
          if (row?.config) apply(row.config, 'supabase-realtime');
        },
      )
      .subscribe();
    supabaseUnsub = () => {
      void sb.removeChannel(sub);
    };
  }

  const pollOnce = () => {
    if (stopped || !navigator.onLine) return;
    void pullFromCloud(synagogueId).then((cloud) => {
      if (stopped || !cloud) return;
      apply(cloud.config, 'poll');
    });
  };

  pollOnce();
  // 10s is plenty for admin→screen updates and avoids constant cloud chatter.
  const poll = window.setInterval(pollOnce, 10_000);

  const onVisible = () => {
    if (document.visibilityState === 'visible') pollOnce();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', pollOnce);

  return {
    noteBaseline,
    stop: () => {
      stopped = true;
      channel?.removeEventListener('message', onMessage);
      window.removeEventListener('shul-live-update', onCustom);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', pollOnce);
      supabaseUnsub?.();
      clearInterval(poll);
    },
  };
}
