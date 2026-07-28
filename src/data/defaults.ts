import { DEFAULT_ENABLED_ZMANIM } from './zmanim';
import { DEFAULT_DESIGN } from './designPresets';
import { defaultCanvas } from '../components/canvas/widgets';
import { getDefaultModes } from '../lib/modes';
import { hashPassword } from '../lib/auth';
import type { MediaSettings, SynagogueConfig } from '../types';

export function defaultMedia(): MediaSettings {
  return {
    logoDataUrl: '',
    backgroundDataUrl: '',
    eventImageUrl: '',
    loopVideoUrl: '',
    gallery: [],
    customFonts: [],
  };
}

export function createDefaultConfigSync(
  id: string,
  name: string,
  cityId = 'petah-tikva',
  ownerPasswordHash = '',
  ownerUsername = 'admin',
): SynagogueConfig {
  return {
    id,
    name,
    cityId,
    dedication: '',
    theme: 'dark',
    layout: 'elegant',
    nusach: 'ashkenaz',
    design: { ...DEFAULT_DESIGN },
    media: defaultMedia(),
    canvas: defaultCanvas(),
    branding: {
      primaryColor: DEFAULT_DESIGN.primaryColor,
      accentColor: DEFAULT_DESIGN.accentColor,
      logoUrl: '',
    },
    enabledZmanim: [...DEFAULT_ENABLED_ZMANIM],
    showWeather: true,
    showDafYomi: true,
    showParasha: true,
    showHebrewDate: true,
    showClock: true,
    showStatus: true,
    showOrefAlerts: true,
    showYahrzeit: true,
    showCalendarExtras: true,
    showOmer: true,
    orefAreaExtra: '',
    modes: getDefaultModes(),
    emergency: { active: false, message: '', updatedAt: new Date().toISOString() },
    announcements: [],
    yahrzeits: [],
    members: ownerPasswordHash
      ? [
          {
            id: 'owner-1',
            name: 'מנהל',
            username: ownerUsername.trim().toLowerCase() || 'admin',
            role: 'owner',
            passwordHash: ownerPasswordHash,
          },
        ]
      : [],
    updatedAt: new Date().toISOString(),
    revision: 1,
    blocks: [
      {
        id: 'weekday',
        title: 'זמני תפילות חול',
        enabled: true,
        items: [
          { id: 'w1', title: 'שחרית', time: '06:30' },
          { id: 'w2', title: 'מנחה', time: '19:00', fromZman: 'sunset', offsetMinutes: -20 },
          { id: 'w3', title: 'מעריב', time: '20:30', fromZman: 'tzeit7083deg', offsetMinutes: 15 },
        ],
      },
      {
        id: 'shabbat',
        title: 'זמני תפילות שבת',
        enabled: true,
        items: [
          { id: 's1', title: 'מנחה ערב שבת', time: '19:00', fromZman: 'sunset', offsetMinutes: -20 },
          { id: 's2', title: 'שחרית', time: '08:30' },
          { id: 's3', title: 'מנחה', time: '18:30', fromZman: 'sunset', offsetMinutes: -45 },
          { id: 's4', title: 'מעריב מוצ״ש', time: '20:15', fromZman: 'tzeit7083deg', offsetMinutes: 30 },
        ],
      },
      {
        id: 'shiurim',
        title: 'שיעורי תורה',
        enabled: true,
        items: [{ id: 'sh1', title: 'הדף היומי', time: '19:30', note: 'בימי חול' }],
      },
    ],
  };
}

export async function createDefaultConfig(
  id: string,
  name: string,
  cityId = 'petah-tikva',
  ownerPassword = 'admin123',
  ownerUsername = 'admin',
): Promise<SynagogueConfig> {
  const passwordHash = await hashPassword(ownerPassword);
  return createDefaultConfigSync(id, name, cityId, passwordHash, ownerUsername);
}

export const DEMO_CONFIG = createDefaultConfigSync('amishav', 'קהילת עמישב', 'petah-tikva');
