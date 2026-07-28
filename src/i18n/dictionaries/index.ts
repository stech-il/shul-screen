import { en } from './en';
import { he } from './he';
import type { Locale } from '../types';

export const dictionaries = { he, en } as const;

export type { Locale };
