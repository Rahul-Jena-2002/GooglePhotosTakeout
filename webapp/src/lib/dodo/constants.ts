import type { RegionCode, PlanCode } from './types';

export interface RegionDefinition {
  key: RegionCode;
  name: string;
  currency: string;
  symbol: string;
  flag: string;
  keywords: string[];
}

export const REGIONS_CONFIG: Record<RegionCode, RegionDefinition> = {
  in: { key: 'in', name: 'India', currency: 'INR', symbol: '₹', flag: '🇮🇳', keywords: ['india', ' in ', 'in-', '🇮🇳'] },
  cn: { key: 'cn', name: 'China', currency: 'CNY', symbol: '¥', flag: '🇨🇳', keywords: ['china', ' cn ', 'cn-', '🇨🇳'] },
  jp: { key: 'jp', name: 'Japan', currency: 'JPY', symbol: '¥', flag: '🇯🇵', keywords: ['japan', ' jp ', 'jp-', '🇯🇵'] },
  eu: { key: 'eu', name: 'Europe', currency: 'EUR', symbol: '€', flag: '🇪🇺', keywords: ['europe', ' eu ', 'eu-', 'eur', '🇪🇺'] },
  t1: { key: 't1', name: 'Tier 1', currency: 'USD', symbol: '$', flag: '🌐', keywords: ['tier 1', 'tier1', 't1'] },
  t2: { key: 't2', name: 'Tier 2', currency: 'USD', symbol: '$', flag: '🌐', keywords: ['tier 2', 'tier2', 't2'] },
  t3: { key: 't3', name: 'US (Tier 3)', currency: 'USD', symbol: '$', flag: '🇺🇸', keywords: ['tier 3', 'tier3', 't3', 'united states', 'usa', ' us '] },
  t4: { key: 't4', name: 'Tier 4', currency: 'USD', symbol: '$', flag: '🌐', keywords: ['tier 4', 'tier4', 't4'] }
};

export interface PlanDefinition {
  key: PlanCode;
  name: string;
  desc: string;
  badge: string;
  keywords: string[];
}

export const PLANS_CONFIG: PlanDefinition[] = [
  {
    key: 'recovery_pass',
    name: 'Recovery Pass',
    desc: '24-hour unlimited restoration pass',
    badge: '24h Pass',
    keywords: ['recovery', 'pass', '24h', '24 hour']
  },
  {
    key: 'super',
    name: 'Super Lifetime',
    desc: 'Pro benefits + metadata inspector and duplicate scanner',
    badge: 'Best Value',
    keywords: ['super', 'ultimate', 'max']
  },
  {
    key: 'pro',
    name: 'Pro Lifetime',
    desc: 'Unlimited lifetime processing and priority queue',
    badge: 'Most Popular',
    keywords: ['pro', 'lifetime']
  }
];

export const REGION_DOC_IDS: Record<string, string> = {
  in: 'India',
  cn: 'China',
  jp: 'Japan',
  eu: 'Europe',
  t1: 'Tier 1',
  t2: 'Tier 2',
  t3: 'US (Tier 3)',
  t4: 'Tier 4'
};
