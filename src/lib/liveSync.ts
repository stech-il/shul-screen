import type { SynagogueConfig } from '../types';
import {
  LIVE_BUMP_PREFIX,
  openLiveChannel,
  type LivePayload,
} from './liveBus';
import { compactConfigMedia, expandConfigMedia } from './mediaPersist';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { loadLocal, normalizeConfig, pullFromCloud, saveLocal } from './storage';

type LiveHandler = (config: SynagogueConfig, meta: { source: string }) => void;

/**
 * Listen for config changes and apply them without page refresh.
 * Channels: BroadcastChannel, storage events, Supabase Realtime, polling (4s).
 */
export function subscribeLiveUpdates(
  synagogueId: string,
  onUpdate: LiveHandler,
): () => void {
  let lastRevision = loadLocal(synagogueId)?.config.revision ?? 0;
  let stopped = false;

  const apply = (config: SynagogueConfig, source: string) => {
    const rev = config.revision ?? 0;
    if (rev <= lastRevision) return;
    lastRevision = rev;
    void (async () => {
      const normalized = normalizeConfig(config);
      let compact = normalized;
      try {
        compact = await compactConfigMedia(normalized);
        saveLocal({
          config: compact,
          syncedAt: new Date().toISOString(),
          pendingSync: false,
        });
      } catch {
        /* ignore quota on mirror write */
      }
      if (stopped) return;
      const expanded = await expandConfigMedia(compact);
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

  const poll = window.setInterval(() => {
    if (stopped || !navigator.onLine) return;
    void pullFromCloud(synagogueId).then((cloud) => {
      if (stopped || !cloud) return;
      if ((cloud.config.revision ?? 0) > lastRevision) {
        apply(cloud.config, 'poll');
      }
    });
  }, 4000);

  return () => {
    stopped = true;
    channel?.removeEventListener('message', onMessage);
    channel?.close();
    window.removeEventListener('shul-live-update', onCustom);
    window.removeEventListener('storage', onStorage);
    supabaseUnsub?.();
    clearInterval(poll);
  };
}
