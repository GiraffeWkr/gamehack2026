import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BattleResult,
  BattleRewardSummary,
  InstitutionId,
  Item,
  ResourceKey,
  SaveData,
  SkillId,
} from './game/types';
import { audio } from './game/engine/audio';
import { ACHIEVEMENT_BY_ID } from './game/data/achievements';
import { RESOURCES } from './game/data/constants';
import { CODEX_NODES } from './game/data/codex';
import { STAR_PERKS } from './game/data/stars';
import { INSTITUTIONS } from './game/data/institutions';
import { createItem } from './game/data/items';
import {
  applyEndlessResult,
  checkAchievements,
  cloneSave,
  createNewSave,
  deleteSave,
  getUnlockedSystems,
  loadGame,
  persistGame,
  tickExtraction,
} from './game/meta/save';
import {
  buyCodexNode,
  buyLegacy,
  buyStarPerk,
  consecrateWeapon,
  equipItem,
  forgeItem,
  markTutorialSeen,
  removeSeal,
  renameInquisitor,
  rerollItem,
  salvageItem,
  setActiveInstitution,
  setDifficulty,
  unlockInstitution,
  upgradeItem,
  upgradeMine,
  unlockSkill,
  upgradeSkill,
  updateSettings,
  type Outcome,
} from './game/meta/actions';
import { formatNumber } from './game/meta/format';
import { TitleScreen } from './ui/TitleScreen';
import { Hub } from './ui/Hub';
import { BattleScreen } from './ui/BattleScreen';
import { AchievementsModal, CreditsModal, NewGameModal, SettingsModal } from './ui/Modals';
import { ConfirmDialog, PixelButton } from './ui/components/UI';
import { PixelIcon } from './ui/components/PixelIcon';
import type { HubActions, HubTab, Toast, ToastKind } from './ui/types';

type Screen = 'title' | 'hub' | 'battle';

const DEFAULT_NAME = '塞拉斯·沃尔';

function summarizeOffline(gained: Partial<Record<ResourceKey, number>>, seconds: number): string {
  const parts = Object.entries(gained)
    .filter(([, value]) => (value ?? 0) >= 1)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3)
    .map(([key, value]) => `${RESOURCES[key as ResourceKey].name} +${formatNumber(value ?? 0)}`);
  const duration = seconds >= 3600 ? `${Math.floor(seconds / 3600)} 小时` : `${Math.max(1, Math.floor(seconds / 60))} 分钟`;
  return `${duration}的离线开采已结算：${parts.join(' · ') || '无产出'}`;
}

export default function App() {
  const [save, setSave] = useState<SaveData | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<Screen>('title');
  const [tab, setTab] = useState<HubTab>('endless');
  const [battleKey, setBattleKey] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [pendingOffline, setPendingOffline] = useState<{ gained: Partial<Record<ResourceKey, number>>; seconds: number } | null>(null);
  const saveRef = useRef<SaveData | null>(null);
  const screenRef = useRef<Screen>('title');
  const toastCounter = useRef(1);
  const isDev = new URLSearchParams(window.location.search).get('dev') === '1';

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  // Audio must be unlocked by a user gesture. This is deliberately attached to
  // the whole document so the title theme can start on the first click anywhere.
  useEffect(() => {
    const unlock = () => {
      audio.unlock();
      audio.setVolumes(
        saveRef.current?.settings.music ?? 0.6,
        saveRef.current?.settings.sfx ?? 0.78,
      );
      if (screenRef.current === 'title') {
        audio.startMusic('menu');
      } else if (screenRef.current === 'hub') {
        audio.startMusic('hub');
      }
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button');
      if (!button || (button as HTMLButtonElement).disabled) return;
      audio.play('ui_click');
    };
    const onPointerOver = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button');
      if (!button || (button as HTMLButtonElement).disabled) return;
      if (button.contains(event.relatedTarget as Node | null)) return;
      audio.play('ui_hover');
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    document.addEventListener('click', onClick);
    document.addEventListener('pointerover', onPointerOver);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerover', onPointerOver);
    };
  }, []);

  useEffect(() => {
    if (!audio.getStatus().initialized) return;
    if (screen === 'title') audio.startMusic('menu');
    else if (screen === 'hub') audio.startMusic('hub');
  }, [screen]);

  useEffect(() => {
    const loaded = loadGame();
    if (loaded) {
      setSave(loaded.save);
      saveRef.current = loaded.save;
      if (loaded.offlineSeconds > 60 && Object.keys(loaded.offlineGained).length) {
        setPendingOffline({ gained: loaded.offlineGained, seconds: loaded.offlineSeconds });
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (!save) return;
    const timer = window.setTimeout(() => persistGame(save), 280);
    return () => window.clearTimeout(timer);
  }, [save]);

  useEffect(() => {
    if (!save) return;
    audio.setVolumes(save.settings.music, save.settings.sfx);
  }, [save?.settings.music, save?.settings.sfx]);

  useEffect(() => {
    if (!save || screen !== 'hub' || !getUnlockedSystems(save).extraction) return;
    const timer = window.setInterval(() => {
      setSave((previous) => {
        if (!previous || !getUnlockedSystems(previous).extraction) return previous;
        const next = cloneSave(previous);
        tickExtraction(next);
        saveRef.current = next;
        return next;
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [screen, save?.endless.bestTime, save?.endless.runs]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && saveRef.current) persistGame(saveRef.current);
    };
    window.addEventListener('visibilitychange', onVisibility);
    return () => window.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const notify = useCallback((title: string, description?: string, kind: ToastKind = 'info') => {
    const id = toastCounter.current++;
    setToasts((current) => [...current.slice(-4), { id, title, description, kind }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4400);
  }, []);

  const announceAchievement = useCallback((id: string) => {
    const achievement = ACHIEVEMENT_BY_ID[id];
    if (!achievement) return;
    notify(`成就 · ${achievement.name}`, achievement.desc, 'achievement');
    audio.play('achievement');
  }, [notify]);

  const showOfflineReport = useCallback(() => {
    if (!pendingOffline) return;
    notify('离舰期间开采结算', summarizeOffline(pendingOffline.gained, pendingOffline.seconds), 'success');
    setPendingOffline(null);
  }, [pendingOffline, notify]);

  const enableAudio = useCallback(() => {
    audio.unlock();
    if (saveRef.current) audio.setVolumes(saveRef.current.settings.music, saveRef.current.settings.sfx);
    audio.startMusic('hub');
  }, []);

  const applyOutcome = useCallback(
    <T,>(outcome: Outcome<T>): T | undefined => {
      if (!outcome.ok) {
        notify('命令被拒绝', outcome.message, 'error');
        audio.play('ui_error');
        return undefined;
      }
      const next = outcome.save;
      const unlocked = checkAchievements(next);
      setSave(next);
      saveRef.current = next;
      notify('舰桥确认', outcome.message, 'success');
      unlocked.forEach((id) => announceAchievement(id));
      audio.play('ui_confirm');
      return outcome.data;
    },
    [announceAchievement, notify],
  );

  const handleContinue = () => {
    if (!save) return;
    enableAudio();
    setScreen('hub');
    setTab('endless');
    audio.setIntensity('hub');
    showOfflineReport();
  };

  const startNewGame = (name: string) => {
    const next = createNewSave(name || DEFAULT_NAME);
    setSave(next);
    saveRef.current = next;
    setScreen('hub');
    setTab('endless');
    setNewGameOpen(false);
    setPendingOffline(null);
    enableAudio();
    notify('远征开始', `审判官 ${next.inquisitorName} 已抵达轨道。愿帝皇保佑你的准星。`, 'success');
  };

  const handleBattleComplete = (result: BattleResult): BattleRewardSummary => {
    const current = saveRef.current;
    if (!current) {
      throw new Error('No save while finishing battle');
    }
    const { save: next, summary } = applyEndlessResult(current, result);
    setSave(next);
    saveRef.current = next;
    // Battle notifications are consolidated in the after-action report so they
    // do not stack on top of the result panel.
    return summary;
  };

  const startEndless = () => {
    const current = saveRef.current;
    if (!current) return;
    setBattleKey((key) => key + 1);
    setScreen('battle');
    audio.setIntensity('battle');
  };

  const handleExitBattle = () => {
    setScreen('hub');
    setTab('endless');
    audio.startMusic('hub');
    audio.setIntensity('hub');
    showOfflineReport();
  };

  const handleTutorialDone = () => {
    const current = saveRef.current;
    if (!current) return;
    const next = markTutorialSeen(current);
    setSave(next);
    saveRef.current = next;
  };

  const resetGame = () => {
    deleteSave();
    setSave(null);
    saveRef.current = null;
    setResetOpen(false);
    setSettingsOpen(false);
    setAchievementsOpen(false);
    setScreen('title');
    setTab('endless');
    audio.stopMusic();
    audio.setVolumes(0.6, 0.78);
    audio.startMusic('menu');
  };

  const actions: HubActions = useMemo(
    () => ({
      onStartEndless: startEndless,
      onBuyLegacy: (key) => {
        audio.play('achievement');
        if (saveRef.current) applyOutcome(buyLegacy(saveRef.current, key));
      },
      onBuyCodex: (nodeId) => {
        if (saveRef.current) applyOutcome(buyCodexNode(saveRef.current, nodeId));
      },
      onBuyStar: (perkId) => {
        audio.play('achievement');
        if (saveRef.current) applyOutcome(buyStarPerk(saveRef.current, perkId));
      },
      onUnlockInstitution: (id: InstitutionId) => {
        audio.play('unlock');
        if (saveRef.current) applyOutcome(unlockInstitution(saveRef.current, id));
      },
      onSetInstitution: (id: InstitutionId) => {
        if (saveRef.current) applyOutcome(setActiveInstitution(saveRef.current, id));
      },
      onUnlockSkill: (id: SkillId) => {
        audio.play('upgrade');
        if (saveRef.current) applyOutcome(unlockSkill(saveRef.current, id));
      },
      onUpgradeSkill: (id: SkillId) => {
        audio.play('upgrade');
        if (saveRef.current) applyOutcome(upgradeSkill(saveRef.current, id));
      },
      onForge: () => {
        if (!saveRef.current) return null;
        audio.play('forge');
        const item = applyOutcome(forgeItem(saveRef.current));
        if (item) audio.play('forge_success');
        return item ?? null;
      },
      onEquip: (itemUid) => {
        audio.play('equip');
        if (saveRef.current) applyOutcome(equipItem(saveRef.current, itemUid));
      },
      onSalvage: (itemUid) => {
        audio.play('salvage');
        if (saveRef.current) applyOutcome(salvageItem(saveRef.current, itemUid));
      },
      onUpgradeItem: (itemUid) => {
        audio.play('upgrade');
        if (saveRef.current) applyOutcome(upgradeItem(saveRef.current, itemUid));
      },
      onReroll: (itemUid) => {
        audio.play('upgrade');
        if (saveRef.current) applyOutcome(rerollItem(saveRef.current, itemUid));
      },
      onConsecrate: () => {
        audio.play('consecrate');
        if (saveRef.current) applyOutcome(consecrateWeapon(saveRef.current));
      },
      onRemoveSeal: (sealUid) => {
        audio.play('upgrade');
        if (saveRef.current) applyOutcome(removeSeal(saveRef.current, sealUid));
      },
      onUpgradeMine: (resource) => {
        audio.play('mine_upgrade');
        if (saveRef.current) applyOutcome(upgradeMine(saveRef.current, resource));
      },
      onSettings: (partial) => {
        if (saveRef.current) applyOutcome(updateSettings(saveRef.current, partial));
      },
      onSetDifficulty: (id) => {
        audio.play('ui_confirm');
        if (saveRef.current) applyOutcome(setDifficulty(saveRef.current, id));
      },
      onRename: (name) => {
        if (saveRef.current) applyOutcome(renameInquisitor(saveRef.current, name));
      },
      onOpenSettings: () => setSettingsOpen(true),
      onOpenAchievements: () => setAchievementsOpen(true),
      onOpenCredits: () => setCreditsOpen(true),
      onOpenResources: () => undefined,
      onTab: (nextTab) => {
        setTab(nextTab);
      },
      onReset: () => setResetOpen(true),
      notify,
    }),
    [applyOutcome, notify, save?.endless.bestTime, save?.endless.runs],
  );

  useEffect(() => {
    if (!isDev) return;
    const target = window as unknown as { __EMPEROR_DEV?: Record<string, unknown> };
    target.__EMPEROR_DEV = {
      grant: () => {
        const current = saveRef.current;
        if (!current) return;
        const next = cloneSave(current);
        for (const key of Object.keys(next.resources) as ResourceKey[]) {
          next.resources[key] += 1000000;
        }
        setSave(next);
        saveRef.current = next;
        notify('DEV', '所有资源 +1,000,000', 'success');
      },
      setSurvivalTime: (minutes: number) => {
        const current = saveRef.current;
        if (!current) return;
        const next = cloneSave(current);
        next.endless.bestTime = Math.max(next.endless.bestTime, minutes * 60);
        next.endless.chests += 3;
        setSave(next);
        saveRef.current = next;
        notify('DEV', `bestTime = ${Math.round(next.endless.bestTime / 60)} 分钟，宝箱 +3`, 'success');
      },
      allAchievements: () => {
        const current = saveRef.current;
        if (!current) return;
        const next = cloneSave(current);
        next.achievements = Object.keys(ACHIEVEMENT_BY_ID);
        setSave(next);
        saveRef.current = next;
      },
      boost: () => {
        const current = saveRef.current;
        if (!current) return;
        const next = cloneSave(current);
        for (const node of CODEX_NODES) next.codex[node.id] = node.maxRank;
        next.starPerks = STAR_PERKS.map((perk) => perk.id);
        for (const institution of Object.values(INSTITUTIONS)) {
          next.institutions[institution.id] = { unlocked: true, level: 1 };
        }
        next.skillUnlocks = Object.keys(next.skillLevels) as SkillId[];
        for (const skillId of Object.keys(next.skillLevels) as SkillId[]) {
          next.skillLevels[skillId] = 3;
        }
        const ilvl = 40;
        const weapon = createItem('weapon', ilvl, 80, 3);
        const armor = createItem('armor', ilvl, 80, 3);
        weapon.improvements = 8;
        armor.improvements = 8;
        next.inventory = [...next.inventory, weapon, armor];
        next.equippedWeapon = weapon.uid;
        next.equippedArmor = armor.uid;
        setSave(next);
        saveRef.current = next;
        notify('DEV', `圣典、星炬、机构与 ${ilvl} 级传说装备已注入`, 'success');
      },
    };
    return () => {
      delete target.__EMPEROR_DEV;
    };
  }, [isDev, notify]);

  if (!hydrated) {
    return (
      <div className="boot-screen">
        <div className="boot-mark"><PixelIcon name="aquila" size={54} /></div>
        <div className="boot-title">帝皇之锤</div>
        <div className="boot-bar"><i /></div>
        <span>正在连接轨道舰船...</span>
      </div>
    );
  }

  return (
    <div className={`app ${save?.settings.scanlines ?? true ? 'app--scanlines' : ''}`}>
      {screen === 'title' || !save ? (
        <TitleScreen
          save={save}
          onContinue={handleContinue}
          onNew={() => setNewGameOpen(true)}
          onSettings={() => {
            if (save) {
              setSettingsOpen(true);
            } else {
              notify('舰桥未连接', '开始远征后即可在舰桥调整设置。', 'info');
            }
          }}
          onCredits={() => setCreditsOpen(true)}
        />
      ) : screen === 'hub' ? (
        <Hub save={save} tab={tab} actions={actions} />
      ) : (
        <BattleScreen
          key={battleKey}
          save={save}
          onComplete={handleBattleComplete}
          onExit={handleExitBattle}
          onRestart={startEndless}
          onTutorialDone={handleTutorialDone}
        />
      )}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`pixel-toast pixel-toast--${toast.kind}`}>
            <div className="pixel-toast__mark">
              <PixelIcon
                name={toast.kind === 'achievement' ? 'trophy' : toast.kind === 'error' ? 'warning' : toast.kind === 'success' ? 'check' : 'info'}
                size={18}
              />
            </div>
            <div>
              <b>{toast.title}</b>
              {toast.description ? <span>{toast.description}</span> : null}
            </div>
          </div>
        ))}
      </div>

      {newGameOpen ? (
        <NewGameModal
          hasSave={!!save}
          defaultName={save?.inquisitorName ? DEFAULT_NAME : DEFAULT_NAME}
          onStart={startNewGame}
          onCancel={() => setNewGameOpen(false)}
        />
      ) : null}
      {settingsOpen && save ? (
        <SettingsModal
          save={save}
          actions={actions}
          onClose={() => setSettingsOpen(false)}
          onResetRequest={() => setResetOpen(true)}
        />
      ) : null}
      {achievementsOpen && save ? (
        <AchievementsModal save={save} onClose={() => setAchievementsOpen(false)} />
      ) : null}
      {creditsOpen ? <CreditsModal onClose={() => setCreditsOpen(false)} /> : null}
      {resetOpen ? (
        <ConfirmDialog
          title="清除远征存档"
          description="这将删除本地存档中的全部资源、装备、圣典、机构、星炬祝福与成就。没有备份，也无法恢复。"
          confirmLabel="确认清除"
          danger
          onCancel={() => setResetOpen(false)}
          onConfirm={resetGame}
        />
      ) : null}

      {isDev ? (
        <div className="dev-toolbar">
          <span>DEV</span>
          <PixelButton size="sm" variant="ghost" onClick={() => (window as unknown as { __EMPEROR_DEV: { grant: () => void } }).__EMPEROR_DEV?.grant()}>
            +资源
          </PixelButton>
          <PixelButton size="sm" variant="ghost" onClick={() => (window as unknown as { __EMPEROR_DEV: { setSurvivalTime: (n: number) => void } }).__EMPEROR_DEV?.setSurvivalTime(10)}>
            生存10
          </PixelButton>
          <PixelButton size="sm" variant="ghost" onClick={() => (window as unknown as { __EMPEROR_DEV: { setSurvivalTime: (n: number) => void } }).__EMPEROR_DEV?.setSurvivalTime(30)}>
            生存30
          </PixelButton>
          <PixelButton size="sm" variant="ghost" onClick={() => (window as unknown as { __EMPEROR_DEV: { setSurvivalTime: (n: number) => void } }).__EMPEROR_DEV?.setSurvivalTime(40)}>
            生存40
          </PixelButton>
          <PixelButton size="sm" variant="ghost" onClick={() => (window as unknown as { __EMPEROR_DEV: { boost: () => void } }).__EMPEROR_DEV?.boost()}>
            满配
          </PixelButton>
        </div>
      ) : null}
    </div>
  );
}
