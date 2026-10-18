import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { FactionId, SaveData } from '../game/types';
import {
  BOSSES,
  ENEMIES_BY_FACTION,
  FACTION_LIST,
  FACTIONS,
} from '../game/data/factions';
import {
  getEndlessTier,
  getEnemyDamage,
  getEnemyHp,
} from '../game/meta/save';
import { formatNumber } from '../game/meta/format';
import { artUrl } from './art';
import { Panel, Tag } from './components/UI';
import { PixelIcon } from './components/PixelIcon';

const FACTION_ICON: Record<FactionId, 'skull' | 'eye' | 'bolt' | 'flame' | 'tentacle'> = {
  orks: 'skull',
  chaos: 'flame',
  tau: 'bolt',
  thousand: 'eye',
  tyranids: 'tentacle',
};

export function BestiaryPanel({ save }: { save: SaveData }) {
  const [selected, setSelected] = useState<FactionId>('orks');
  const faction = FACTIONS[selected];
  const enemies = ENEMIES_BY_FACTION[selected];
  const displayTier = getEndlessTier(save);
  const bossEntries = Object.values(BOSSES);

  return (
    <div className="bestiary-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">XENOS BESTIARY // THREAT ARCHIVE</div>
          <h1 className="screen-title">异形图鉴</h1>
          <p className="screen-subtitle">
            你对敌人的了解，决定了轨道打击落在哪里。以下记录来自无尽远征中回收的残骸分析。
          </p>
        </div>
        <div className="panel-heading__stats">
          <div>
            <span>已记录阵营</span>
            <b>5 / 5</b>
          </div>
          <div>
            <span>首领档案</span>
            <b>{bossEntries.length} 份</b>
          </div>
        </div>
      </div>

      <div className="faction-tabs">
        {FACTION_LIST.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`faction-tab ${selected === entry.id ? 'is-selected' : ''}`}
            style={{ '--faction-color': entry.color } as CSSProperties}
            onClick={() => setSelected(entry.id)}
          >
            <img src={artUrl(entry.portrait)} alt="" />
            <span>
              <b>{entry.name}</b>
              <small>{entry.english}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="bestiary-layout">
        <section className="bestiary-hero" style={{ '--faction-color': faction.color } as CSSProperties}>
          <img src={artUrl(faction.portrait)} alt={`${faction.name}图鉴肖像`} />
          <div className="bestiary-hero__shade" />
          <div className="bestiary-hero__caption">
            <div className="eyebrow">SPECIES DOSSIER</div>
            <h2>{faction.epithet}</h2>
            <div className="bestiary-hero__meta">
              <Tag color={faction.color}>{faction.name}</Tag>
              <Tag color={faction.color}>{faction.english}</Tag>
              <Tag color="#c33f3a">威胁等级 {faction.id === 'orks' ? 'I' : faction.id === 'chaos' ? 'II' : faction.id === 'tau' ? 'III' : faction.id === 'thousand' ? 'IV' : 'V'}</Tag>
            </div>
            <p>{faction.lore}</p>
          </div>
          <div className="bestiary-hero__side">
            <PixelIcon name={FACTION_ICON[selected]} size={40} />
            <span className="threat-stamp">XENOS</span>
          </div>
        </section>

        <div className="bestiary-side">
          <Panel eyebrow="FIELD DATA" title={`威胁阶段 ${displayTier} 读数`}>
            <div className="bestiary-faction-stats">
              <div><span>主要威胁</span><b>{faction.threat}</b></div>
              <div><span>战利品货币</span><b>{faction.id === 'orks' ? '兽人牙齿' : faction.id === 'chaos' ? '混沌遗物' : faction.id === 'tau' ? '钛族合金' : faction.id === 'thousand' ? '灵能尘埃' : '虫族生物质'}</b></div>
              <div><span>机仆化</span><b>可改造</b></div>
            </div>
            <div className="bestiary-note">
              <PixelIcon name="servitor" size={16} />
              <span>击杀该阵营单位时，技术神甫有概率将残骸改造为友方机仆。首领无法被改造。</span>
            </div>
          </Panel>
          <Panel eyebrow="UNIT ROSTER" title="单位档案">
            <div className="enemy-roster">
              {enemies.map((enemy) => (
                <div key={enemy.id} className="enemy-row">
                  <span className="enemy-row__mark" style={{ color: faction.color }}>
                    <PixelIcon name={enemy.ranged ? 'bolt' : FACTION_ICON[selected]} size={18} />
                  </span>
                  <div className="enemy-row__name">
                    <b>{enemy.name}</b>
                    <small>{enemy.ranged ? '远程' : '近战'} · {enemy.elite ? '精英' : '常规'} · {String(Math.round(enemy.speed))} 移速</small>
                  </div>
                  <div className="enemy-row__stats">
                    <span>HP {formatNumber(getEnemyHp(enemy.hpMult * (1 + (displayTier - 1) * 0.35)))}</span>
                    <span>伤害 {formatNumber(getEnemyDamage(enemy.damageMult * (1 + (displayTier - 1) * 0.12)))}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel eyebrow="GUARDIAN CLASS // BOSS ARCHIVE" title="首领档案" className="boss-panel">
        <div className="boss-grid">
          {bossEntries.map((boss) => {
            return (
              <article key={boss.id} className="boss-card" style={{ '--boss-color': boss.color } as CSSProperties}>
                <div className="boss-card__image">
                  <img src={artUrl(boss.portrait)} alt={boss.name} />
                  <span className="boss-card__tag">限时首领</span>
                </div>
                <div className="boss-card__body">
                  <div className="eyebrow">{boss.title}</div>
                  <h3>{boss.name}</h3>
                  <div className="boss-card__tags">
                    <Tag color={FACTIONS[boss.faction].color}>{FACTIONS[boss.faction].name}</Tag>
                    <Tag color={boss.color}>首领</Tag>
                  </div>
                  <p>“{boss.quote.replace(/[“”]/g, '')}”</p>
                  <div className="boss-card__stats">
                    <span>HP倍率 ×{boss.hpMult}</span>
                    <span>伤害倍率 ×{boss.damageMult}</span>
                    <span>移速 {boss.speed}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
