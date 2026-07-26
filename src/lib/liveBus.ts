import type { SynagogueConfig } from '../types';

const CHANNEL = 'shul-screen-live';
export const LIVE_BUMP_PREFIX = 'shul-screen:live-bump:';

export interface LivePayload {
  id: string;
  revision: number;
  config: SynagogueConfig;
  at: number;
}

/** Long-lived channel — creating a new one per publish can drop messages. */
let sharedChannel: BroadcastChannel | null | undefined;

function getSharedChannel(): BroadcastChannel | null {
  if (sharedChannel !== undefined) return sharedChannel;
  try {
    sharedChannel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  } catch {
    sharedChannel = null;
  }
  return sharedChannel;
}

/** Instant notify — same device / other tabs */
export function publishLiveUpdate(config: SynagogueConfig): void {
  const payload: LivePayload = {
    id: config.id,
    revision: config.revision ?? 0,
    config,
    at: Date.now(),
  };

  try {
    getSharedChannel()?.postMessage(payload);
  } catch {
    /* ignore */
  }

  try {
    localStorage.setItem(
      LIVE_BUMP_PREFIX + config.id,
      JSON.stringify({ revision: payload.revision, at: payload.at }),
    );
  } catch {
    /* ignore */
  }

  window.dispatchEvent(new CustomEvent('shul-live-update', { detail: payload }));
}

export function openLiveChannel(): BroadcastChannel | null {
  return getSharedChannel();
}
