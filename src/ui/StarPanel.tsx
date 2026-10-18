import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { SaveData, StarPerkDef } from '../game/types';
import { STAR_BY_ID, STAR_PERKS } from '../game/data/stars';
import { RESOURCES, STAT_META, formatStatValue } from '../game/data/constants';
import { canAfford, getUnlockedSystems } from '../game/meta/save';
import { formatNumber } from '../game/meta/format';
import { PixelButton, Tag } from './components/UI';
import { PixelIcon } from './components/PixelIcon';
import type { HubActions } from './types';

function perkEffect(perk: StarPerkDef): string {
  const parts = Object.entries(perk.effect)
    .filter(([, value]) => value)
    .map(([key, value]) => `${STAT_META[key as keyof typeof STAT_META].name} ${formatStatValue(key as keyof typeof STAT_META, value!)}`);
  if (perk.special === 'autoStrike') parts.push('解锁自动交战协议');
  return parts.join(' · ');
}

export function StarPanel({ save, actions }: { save: SaveData; actions: HubActions }) {
  const unlockedSystem = getUnlockedSystems(save).star;
  const [selected, setSelected] = useState<string>(() => {
    return save.starPerks[save.starPerks.length - 1] ?? STAR_PERKS[0].id;
  });
  const perk = STAR_BY_ID[selected] ?? STAR_PERKS[0];
  const owned = save.starPerks.includes(perk.id);
  const requirementMet = !perk.requires || save.starPerks.includes(perk.requires);
  const affordable = canAfford(save.resources, perk.cost);
  const bought = save.starPerks.length;
  const lines = useMemo(
    () =>
      STAR_PERKS.filter((p) => p.requires)
        .map((p) => {
          const from = STAR_BY_ID[p.requires!];
          return { from, to: p, owned: save.starPerks.includes(p.id) };
        })
        .filter((line) => line.from),
    [save.starPerks],
  );

  if (!unlockedSystem) {
    return (
      <div className="panel-locked">
        <div className="panel-locked__mark"><PixelIcon name="star" size={42} /></div>
        <div className="eyebrow">ASTRONOMICAN // DARK</div>
        <h1 className="screen-title">星炬祝福</h1>
        <p>单次无尽生存达到 15 分钟后，星炬的光会照进这片星域。购买祝福，让舰船调用本不该属于你的支援。</p>
        <PixelButton variant="primary" onClick={() => actions.onTab('endless')} icon={<PixelIcon name="chest" size={16} />}>
          前往无尽远征
        </PixelButton>
      </div>
    );
  }

  return (
    <div className="star-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">ASTRONOMICAN // BLESSINGS OF THE LIGHT</div>
          <h1 className="screen-title">星炬祝福</h1>
          <p className="screen-subtitle">星炬的光每照亮一颗星辰，舰船就能调用一条新的支援协议。</p>
        </div>
        <div className="panel-heading__stats">
          <div>
            <span>已点亮</span>
            <b>{bought} / {STAR_PERKS.length}</b>
          </div>
          <div>
            <span>祝福状态</span>
            <b>{bought ? '星炬燃烧中' : '等待第一束光'}</b>
          </div>
        </div>
      </div>

      <div className="star-layout">
        <div className="constellation">
          <div className="constellation__stars" aria-hidden />
          <svg className="constellation__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {lines.map((line) => (
              <line
                key={`${line.from.id}-${line.to.id}`}
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
                stroke={line.owned ? '#d7b25e' : 'rgba(201,164,92,0.2)'}
                strokeWidth={line.owned ? 0.65 : 0.35}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <div className="constellation__core">
            <PixelIcon name="aquila" size={30} />
            <span>星炬</span>
          </div>
          {STAR_PERKS.map((p) => {
            const isOwned = save.starPerks.includes(p.id);
            const isAvailable = !isOwned && (!p.requires || save.starPerks.includes(p.requires));
            const isSelected = p.id === selected;
            return (
              <button
                key={p.id}
                type="button"
                className={`star-node ${isOwned ? 'is-owned' : ''} ${isAvailable ? 'is-available' : ''} ${isSelected ? 'is-selected' : ''}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                onClick={() => setSelected(p.id)}
              >
                <span className="star-node__ring">
                  <span className="star-node__core">
                    <PixelIcon name={p.icon} size={18} />
                  </span>
                </span>
                <span className="star-node__label">{p.name}</span>
              </button>
            );
          })}
          <div className="constellation__caption">点击星点查看祝福 · 金色连线代表已点亮的路径</div>
        </div>

        <aside className="star-detail">
          <div className="star-detail__icon" style={{ '--star-color': owned ? '#d7b25e' : '#8a8a7c' } as CSSProperties}>
            <PixelIcon name={perk.icon} size={38} />
          </div>
          <div className="eyebrow">{owned ? 'BLESSING ACQUIRED' : requirementMet ? 'BLESSING AVAILABLE' : 'PATH LOCKED'}</div>
          <h2>{perk.name}</h2>
          <p className="star-detail__desc">{perk.desc}</p>
          <div className="star-effects">
            <div className="star-effects__label">永久效果</div>
            <div>{perkEffect(perk)}</div>
          </div>
          {perk.requires && !save.starPerks.includes(perk.requires) ? (
            <div className="star-requirement">
              <PixelIcon name="lock" size={14} />
              <span>需要先点亮「{STAR_BY_ID[perk.requires].name}」</span>
            </div>
          ) : null}
          {owned ? (
            <Tag color="#d7b25e" filled>已点亮</Tag>
          ) : (
            <>
              <div className="star-costs">
                {Object.entries(perk.cost).map(([key, value]) => {
                  const resource = RESOURCES[key as keyof typeof RESOURCES];
                  return (
                    <div key={key} className={(save.resources[key as keyof typeof save.resources] ?? 0) < (value ?? 0) ? 'is-short' : ''}>
                      <PixelIcon name={resource.icon} size={16} />
                      <span>{resource.name}</span>
                      <b>{formatNumber(value ?? 0)}</b>
                    </div>
                  );
                })}
              </div>
              <PixelButton
                variant="primary"
                size="lg"
                disabled={!requirementMet || !affordable}
                onClick={() => actions.onBuyStar(perk.id)}
                icon={<PixelIcon name="star" size={16} />}
              >
                {!requirementMet ? '前置祝福未点亮' : affordable ? '点亮祝福' : '资源不足'}
              </PixelButton>
            </>
          )}
          <div className="star-detail__footer">
            <PixelIcon name="info" size={14} />
            <span>星炬祝福是永久全局乘区，重置存档前不会丢失。</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
