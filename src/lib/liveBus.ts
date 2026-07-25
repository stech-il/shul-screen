import type { SynagogueConfig } from '../types';

const CHANNEL = 'shul-screen-live';
export const LIVE_BUMP_PREFIX = 'shul-screen:live-bump:';

export interface LivePayload {
  id: string;
  revision: number;
  config: SynagogueConfig;
  at: number;
}

function getChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  } catch {
    return null;
  }
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
    getChannel()?.postMessage(payload);
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
  return getChannel();
}
