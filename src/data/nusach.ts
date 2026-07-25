import type { NusachId, ScheduleBlock, SynagogueConfig, ZmanKey } from '../types';
import { DEFAULT_ENABLED_ZMANIM } from '../data/zmanim';

export interface NusachTemplate {
  id: NusachId;
  name: string;
  description: string;
  enabledZmanim: ZmanKey[];
  blocks: ScheduleBlock[];
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 7)}`;
}

export const NUSACH_TEMPLATES: NusachTemplate[] = [
  {
    id: 'ashkenaz',
    name: 'אשכנז',
    description: 'זמני תפילה בסגנון אשכנזי / גר״א',
    enabledZmanim: [...DEFAULT_ENABLED_ZMANIM],
    blocks: [
      {
        id: uid('ash-w'),
        title: 'תפילות חול',
        enabled: true,
        items: [
          { id: uid('i'), title: 'שחרית', time: '06:30' },
          { id: uid('i'), title: 'מנחה', time: '19:00', fromZman: 'sunset', offsetMinutes: -20 },
          { id: uid('i'), title: 'מעריב', time: '20:30', fromZman: 'tzeit7083deg', offsetMinutes: 10 },
        ],
      },
      {
        id: uid('ash-s'),
        title: 'תפילות שבת',
        enabled: true,
        items: [
          { id: uid('i'), title: 'קבלת שבת', time: '18:30', fromZman: 'sunset', offsetMinutes: -30 },
          { id: uid('i'), title: 'שחרית', time: '08:30' },
          { id: uid('i'), title: 'מנחה', time: '18:00', fromZman: 'sunset', offsetMinutes: -60 },
          { id: uid('i'), title: 'ערבית מוצ״ש', time: '20:00', fromZman: 'tzeit7083deg', offsetMinutes: 20 },
        ],
      },
    ],
  },
  {
    id: 'sephard',
    name: 'ספרד',
    description: 'נוסח ספרד — מנחה קרובה לשקיעה',
    enabledZmanim: [...DEFAULT_ENABLED_ZMANIM],
    blocks: [
      {
        id: uid('sef-w'),
        title: 'תפילות חול',
        enabled: true,
        items: [
          { id: uid('i'), title: 'שחרית', time: '06:15' },
          { id: uid('i'), title: 'מנחה', time: '19:10', fromZman: 'sunset', offsetMinutes: -15 },
          { id: uid('i'), title: 'ערבית', time: '20:20', fromZman: 'tzeit7083deg', offsetMinutes: 5 },
        ],
      },
      {
        id: uid('sef-s'),
        title: 'תפילות שבת',
        enabled: true,
        items: [
          { id: uid('i'), title: 'מנחה ערב שבת', time: '18:40', fromZman: 'sunset', offsetMinutes: -25 },
          { id: uid('i'), title: 'שחרית', time: '08:00' },
          { id: uid('i'), title: 'מנחה', time: '18:20', fromZman: 'sunset', offsetMinutes: -50 },
          { id: uid('i'), title: 'ערבית מוצ״ש', time: '20:10', fromZman: 'tzeit7083deg', offsetMinutes: 25 },
        ],
      },
    ],
  },
  {
    id: 'edot-hamizrach',
    name: 'עדות המזרח',
    description: 'נוסח עדות המזרח',
    enabledZmanim: [...DEFAULT_ENABLED_ZMANIM],
    blocks: [
      {
        id: uid('edm-w'),
        title: 'תפילות חול',
        enabled: true,
        items: [
          { id: uid('i'), title: 'שחרית', time: '06:00' },
          { id: uid('i'), title: 'מנחה', time: '19:05', fromZman: 'sunset', offsetMinutes: -10 },
          { id: uid('i'), title: 'ערבית', time: '20:15', fromZman: 'tzeit7083deg', offsetMinutes: 0 },
        ],
      },
      {
        id: uid('edm-s'),
        title: 'תפילות שבת',
        enabled: true,
        items: [
          { id: uid('i'), title: 'קבלת שבת', time: '18:45', fromZman: 'sunset', offsetMinutes: -20 },
          { id: uid('i'), title: 'שחרית', time: '07:45' },
          { id: uid('i'), title: 'מנחה', time: '18:30', fromZman: 'sunset', offsetMinutes: -40 },
          { id: uid('i'), title: 'ערבית מוצ״ש', time: '20:05', fromZman: 'tzeit7083deg', offsetMinutes: 15 },
        ],
      },
    ],
  },
  {
    id: 'chabad',
    name: 'חב״ד',
    description: 'זמנים לפי בעל התניא / חב״ד',
    enabledZmanim: [
      'alotHaShachar',
      'sunrise',
      'sofZmanShmaBaalHatanya',
      'sofZmanTfilaBaalHatanya',
      'chatzot',
      'minchaGedolaBaalHatanya',
      'plagHaminchaBaalHatanya',
      'sunset',
      'tzaisBaalHatanya',
    ],
    blocks: [
      {
        id: uid('ch-w'),
        title: 'תפילות חול',
        enabled: true,
        items: [
          { id: uid('i'), title: 'שחרית', time: '07:00' },
          { id: uid('i'), title: 'מנחה', time: '18:50', fromZman: 'sunset', offsetMinutes: -30 },
          { id: uid('i'), title: 'מעריב', time: '20:40', fromZman: 'tzaisBaalHatanya', offsetMinutes: 0 },
        ],
      },
      {
        id: uid('ch-s'),
        title: 'תפילות שבת',
        enabled: true,
        items: [
          { id: uid('i'), title: 'קבלת שבת', time: '18:20', fromZman: 'sunset', offsetMinutes: -40 },
          { id: uid('i'), title: 'שחרית', time: '10:00' },
          { id: uid('i'), title: 'מנחה', time: '17:45', fromZman: 'sunset', offsetMinutes: -70 },
          { id: uid('i'), title: 'מעריב מוצ״ש', time: '20:50', fromZman: 'tzaisBaalHatanya', offsetMinutes: 10 },
        ],
      },
    ],
  },
];

export function applyNusachTemplate(
  config: SynagogueConfig,
  nusachId: NusachId,
): SynagogueConfig {
  const t = NUSACH_TEMPLATES.find((x) => x.id === nusachId);
  if (!t) return { ...config, nusach: nusachId };
  return {
    ...config,
    nusach: nusachId,
    enabledZmanim: [...t.enabledZmanim],
    blocks: structuredClone(t.blocks),
  };
}
