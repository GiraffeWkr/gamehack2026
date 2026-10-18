import type {
  DifficultyId,
  InstitutionId,
  Item,
  LegacyKey,
  ResourceKey,
  Settings,
  SkillId,
} from '../game/types';

export type HubTab =
  | 'endless'
  | 'codex'
  | 'forge'
  | 'armory'
  | 'institutions'
  | 'extraction'
  | 'consecration'
  | 'star'
  | 'bestiary';

export type ToastKind = 'info' | 'success' | 'error' | 'achievement';

export interface Toast {
  id: number;
  title: string;
  description?: string;
  kind: ToastKind;
  icon?: string;
}

export interface HubActions {
  onStartEndless: () => void;
  onBuyLegacy: (key: LegacyKey) => void;
  onBuyCodex: (nodeId: string) => void;
  onBuyStar: (perkId: string) => void;
  onUnlockInstitution: (id: InstitutionId) => void;
  onSetInstitution: (id: InstitutionId) => void;
  onUnlockSkill: (id: SkillId) => void;
  onUpgradeSkill: (id: SkillId) => void;
  onForge: () => Item | null;
  onEquip: (itemUid: string) => void;
  onSalvage: (itemUid: string) => void;
  onUpgradeItem: (itemUid: string) => void;
  onReroll: (itemUid: string) => void;
  onConsecrate: () => void;
  onRemoveSeal: (sealUid: string) => void;
  onUpgradeMine: (resource: ResourceKey) => void;
  onSettings: (settings: Partial<Settings>) => void;
  onSetDifficulty: (id: DifficultyId) => void;
  onRename: (name: string) => void;
  onOpenSettings: () => void;
  onOpenAchievements: () => void;
  onOpenCredits: () => void;
  onOpenResources: () => void;
  onTab: (tab: HubTab) => void;
  onReset: () => void;
  notify: (title: string, description?: string, kind?: ToastKind) => void;
}
