import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { SaveData } from '../game/types';
import { ACHIEVEMENTS } from '../game/data/achievements';
import {
  GAME_TITLE,
  GAME_TITLE_EN,
  GAME_VERSION,
  RARITY_META,
  RESOURCES,
  SHIP_NAME,
} from '../game/data/constants';
import { INSTITUTIONS } from '../game/data/institutions';
import { getDifficulty } from '../game/data/difficulties';
import {
  calculateStats,
  getEquippedArmor,
  getEquippedWeapon,
  getUnlockHint,
  getUnlockedSystems,
} from '../game/meta/save';
import { formatDuration, formatNumber } from '../game/meta/format';
import { artUrl } from './art';
import { ArmoryPanel } from './ArmoryPanel';
import { BestiaryPanel } from './BestiaryPanel';
import { EndlessPanel } from './EndlessPanel';
import { CodexPanel } from './CodexPanel';
import { ConsecrationPanel } from './ConsecrationPanel';
import { ExtractionPanel } from './ExtractionPanel';
import { ForgePanel } from './ForgePanel';
import { InstitutionPanel } from './InstitutionPanel';
import { StarPanel } from './StarPanel';
import { Modal, PixelButton, ResourceChip, Tag, Meter } from './components/UI';
import { PixelIcon } from './components/PixelIcon';
import { AudioMeter } from './components/AudioMeter';
import type { HubActions, HubTab } from './types';

const TABS: Array<{ id: HubTab; label: string; icon: Parameters<typeof PixelIcon>[0]['name']; group?: string }> = [
  { id: 'endless', label: '远征', icon: 'chest', group: '作战' },
  { id: 'codex', label: '圣典', icon: 'book', group: '强化' },
  { id: 'forge', label: '锻造', icon: 'anvil' },
  { id: 'armory', label: '军械', icon: 'sword' },
  { id: 'institutions', label: '机构', icon: 'cog' },
  { id: 'extraction', label: '开采', icon: 'pickaxe', group: '后勤' },
  { id: 'consecration', label: '圣化', icon: 'star' },
  { id: 'star', label: '星炬', icon: 'star' },
  { id: 'bestiary', label: '图鉴', icon: 'skull', group: '档案' },
];

const LOCK_MESSAGES: Partial<Record<HubTab, string>> = {
  codex: '完成首次远征后解锁',
  forge: '单次无尽生存 2 分钟后解锁',
  extraction: '单次无尽生存 5 分钟后解锁',
  consecration: '单次无尽生存 10 分钟后解锁',
  star: '单次无尽生存 15 分钟后解锁',
};

export function Hub({
  save,
  tab,
  actions,
}: {
  save: SaveData;
  tab: HubTab;
  actions: HubActions;
}) {
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const stats = calculateStats(save);
  const unlocks = getUnlockedSystems(save);
  const weapon = getEquippedWeapon(save);
  const armor = getEquippedArmor(save);
  const endless = save.endless;
  const difficulty = getDifficulty(save.difficulty);
  const currentMeta = (() => {
    const systemLocked: Partial<Record<HubTab, boolean>> = {
      codex: !unlocks.codex,
      forge: !unlocks.forge,
      extraction: !unlocks.extraction,
      consecration: !unlocks.consecration,
      star: !unlocks.star,
    };
    return systemLocked;
  })();

  const renderPanel = () => {
    switch (tab) {
      case 'endless':
        return <EndlessPanel save={save} actions={actions} />;
      case 'codex':
        return <CodexPanel save={save} actions={actions} />;
      case 'forge':
        return <ForgePanel save={save} actions={actions} />;
      case 'armory':
        return <ArmoryPanel save={save} actions={actions} />;
      case 'institutions':
        return <InstitutionPanel save={save} actions={actions} />;
      case 'extraction':
        return <ExtractionPanel save={save} actions={actions} />;
      case 'consecration':
        return <ConsecrationPanel save={save} actions={actions} />;
      case 'star':
        return <StarPanel save={save} actions={actions} />;
      case 'bestiary':
        return <BestiaryPanel save={save} />;
      default:
        return null;
    }
  };

  return (
    <div className="hub-screen">
      <div className="hub-screen__bg" style={{ backgroundImage: `url(${artUrl('hub_bridge')})` }} />
      <div className="hub-screen__shade" />

      <header className="hub-header">
        <div className="hub-brand">
          <div className="hub-brand__sigil"><PixelIcon name="aquila" size={30} /></div>
          <div>
            <div className="hub-brand__title">{GAME_TITLE}</div>
            <div className="hub-brand__sub">{SHIP_NAME} // {GAME_TITLE_EN}</div>
          </div>
        </div>

        <div className="hub-resources">
          {(['gelt', 'promethium', 'plasteel', 'ceramite', 'adamantium', 'beacon'] as const).map((key) => (
            <ResourceChip key={key} resource={key} amount={save.resources[key]} compact />
          ))}
          <button type="button" className="resource-more" onClick={() => setResourcesOpen(true)}>
            <PixelIcon name="diamond" size={14} />
            <span>全部</span>
          </button>
        </div>

        <div className="hub-header__actions">
          <button className="hub-icon-action" onClick={actions.onOpenAchievements} title="成就">
            <PixelIcon name="trophy" size={19} />
            <span>{save.achievements.length}/{ACHIEVEMENTS.length}</span>
          </button>
          <button className="hub-icon-action" onClick={actions.onOpenSettings} title="设置">
            <PixelIcon name="settings" size={19} />
          </button>
        </div>
      </header>

      <div className="hub-body">
        <nav className="hub-rail" aria-label="舰载系统">
          <div className="hub-rail__marker">SYS</div>
          {TABS.map((item, index) => {
            const previousGroup = index > 0 ? TABS[index - 1].group : undefined;
            const showGroup = item.group && item.group !== previousGroup;
            const locked = currentMeta[item.id];
            return (
              <div key={item.id} className="hub-rail__item-wrap">
                {showGroup ? <div className="hub-rail__group">{item.group}</div> : null}
                <button
                  type="button"
                  className={`hub-rail__item ${tab === item.id ? 'is-active' : ''} ${locked ? 'is-locked' : ''}`}
                  onClick={() => {
                    if (locked) {
                      actions.notify('系统未解锁', LOCK_MESSAGES[item.id] ?? '继续无尽远征。', 'info');
                    }
                    actions.onTab(item.id);
                  }}
                  title={locked ? LOCK_MESSAGES[item.id] : item.label}
                >
                  <span className="hub-rail__icon"><PixelIcon name={item.icon} size={21} /></span>
                  <span className="hub-rail__label">{item.label}</span>
                  {locked ? <span className="hub-rail__lock"><PixelIcon name="lock" size={10} /></span> : null}
                </button>
              </div>
            );
          })}
          <div className="hub-rail__bottom">
            <span>v{GAME_VERSION}</span>
            <i />
          </div>
        </nav>

        <main className={`hub-main hub-main--${tab}`}>{renderPanel()}</main>

        <aside className="hub-aside">
          <div className="commander-card">
            <div className="commander-card__portrait">
              <img src={artUrl('player_portrait')} alt="审判官肖像" />
              <div className="commander-card__scan" aria-hidden />
              <div className="commander-card__frame" aria-hidden />
              <span className="commander-card__rank">INQUISITOR</span>
            </div>
            <div className="commander-card__name">
              <span>审判官</span>
              <h2>{save.inquisitorName}</h2>
              <small>ORDO XENOS · 帝皇之锤持有者</small>
            </div>
            <div className="commander-card__power">
              <span>综合战力</span>
              <b>{formatNumber(stats.power)}</b>
              <Meter value={Math.log10(Math.max(1, stats.power))} max={9} color="#c9a45c" height={5} />
            </div>

            <div className="commander-card__row">
              <span>战斗机构</span>
              <b style={{ color: INSTITUTIONS[save.activeInstitution].color }}>
                <PixelIcon name="cog" size={13} />
                {INSTITUTIONS[save.activeInstitution].name}
              </b>
            </div>

            <div className="commander-loadout">
              <div>
                <span className="commander-loadout__label"><PixelIcon name="sword" size={13} />主武器</span>
                {weapon ? (
                  <>
                    <b style={{ color: RARITY_META[weapon.rarity].color }}>{weapon.name}</b>
                    <small>+{weapon.improvements} 祝圣 · 伤害 {formatNumber(stats.damage)}</small>
                  </>
                ) : (
                  <b className="muted-text">未装备</b>
                )}
              </div>
              <div>
                <span className="commander-loadout__label"><PixelIcon name="shield" size={13} />护甲</span>
                {armor ? (
                  <>
                    <b style={{ color: RARITY_META[armor.rarity].color }}>{armor.name}</b>
                    <small>生命 {formatNumber(stats.maxHp)} · 护甲 {Math.round(stats.armor)}</small>
                  </>
                ) : (
                  <b className="muted-text">未装备</b>
                )}
              </div>
            </div>

            <div className="commander-progress">
              <div className="commander-progress__label">
                <span>无尽生存纪录</span>
                <b>{formatDuration(endless.bestTime)}</b>
              </div>
              <Meter value={Math.min(endless.bestTime, 900)} max={900} color="#8e3b37" height={7} />
              <div className="commander-progress__next">
                <span>下一任幸存者</span>
                <b>第 {endless.runs + 1} 次远征 · {difficulty.name}</b>
              </div>
            </div>

            <div className="commander-card__missions">
              <div>
                <span>遗产宝箱</span>
                <b>{endless.chests}</b>
              </div>
              <div>
                <span>最高击杀</span>
                <b>{formatNumber(endless.bestKills)}</b>
              </div>
              <div>
                <span>首领击杀</span>
                <b>{save.stats.bossKills}</b>
              </div>
            </div>

            <div className="commander-card__unlock">
              <div className="eyebrow">NEXT UNLOCK</div>
              <p>{getUnlockHint(save)}</p>
            </div>

            <PixelButton
              variant="primary"
              size="lg"
              className="commander-card__launch"
              onClick={actions.onStartEndless}
              icon={<PixelIcon name="play" size={18} />}
            >
              出击 · 无尽远征
            </PixelButton>

            <div className="commander-card__footer">
              <span>本地存档 · 自动同步</span>
              <span>{save.stats.totalWins} 胜 / {save.stats.totalDeaths} 负</span>
            </div>
          </div>

          <div className="aside-quote">
            <span>每日祷文</span>
            <p>“不允许失败。只允许在失败前杀得足够多。”</p>
            <small>— 《审判庭战地手册》第 XLI 版</small>
          </div>
        </aside>
      </div>

      <footer className="hub-footer">
        <div className="hub-footer__left">
          <Tag color="#c33f3a">非官方同人作品</Tag>
          <span>非商业 · Fan-made · Warhammer 40,000 归 Games Workshop 所有</span>
        </div>
        <div className="hub-footer__right">
          <AudioMeter compact />
          <span><PixelIcon name="clock" size={12} />自动保存</span>
          <button type="button" onClick={actions.onOpenCredits}>制作名单</button>
        </div>
      </footer>

      {resourcesOpen ? (
        <Modal title="舰船库存" eyebrow="ALL RESOURCES" onClose={() => setResourcesOpen(false)} wide>
          <div className="resource-ledger">
            {Object.entries(RESOURCES).map(([key, meta]) => (
              <div key={key} className="resource-ledger__row" style={{ '--resource-color': meta.color } as CSSProperties}>
                <div className="resource-ledger__icon"><PixelIcon name={meta.icon} size={22} /></div>
                <div className="resource-ledger__name">
                  <b>{meta.name}</b>
                  <small>{meta.english}</small>
                </div>
                <div className="resource-ledger__desc">{meta.description}</div>
                <div className="resource-ledger__amount">
                  {formatNumber(save.resources[key as keyof typeof save.resources])}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
