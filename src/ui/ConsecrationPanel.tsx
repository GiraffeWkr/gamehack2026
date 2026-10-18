import type { CSSProperties } from 'react';
import type { SaveData } from '../game/types';
import { STAT_META, RESOURCES } from '../game/data/constants';
import { getEquippedWeapon, getUnlockedSystems, canAfford } from '../game/meta/save';
import { getSealCost } from '../game/data/items';
import { formatNumber } from '../game/meta/format';
import { ItemCard } from './components/ItemCard';
import { Panel, PixelButton, Tag } from './components/UI';
import { PixelIcon } from './components/PixelIcon';
import type { HubActions } from './types';

const TIER_COLORS = ['#9a958a', '#62c4b6', '#b58ae8', '#e3b960'];

export function ConsecrationPanel({ save, actions }: { save: SaveData; actions: HubActions }) {
  const unlocked = getUnlockedSystems(save).consecration;
  const weapon = getEquippedWeapon(save);

  if (!unlocked) {
    return (
      <div className="panel-locked">
        <div className="panel-locked__mark"><PixelIcon name="star" size={42} /></div>
        <div className="eyebrow">CONSECRATION // SEALED</div>
        <h1 className="screen-title">圣化祭坛</h1>
        <p>单次无尽生存达到 10 分钟后，舰船会开放圣化权限。把帝皇的祷文刻进武器，让机魂在扣动扳机时听见。</p>
        <PixelButton variant="primary" onClick={() => actions.onTab('endless')} icon={<PixelIcon name="chest" size={16} />}>
          前往无尽远征
        </PixelButton>
      </div>
    );
  }

  const nextCost = getSealCost(weapon?.seals.length ?? 0);
  const affordable =
    !!weapon &&
    weapon.seals.length < 3 &&
    canAfford(save.resources, nextCost);

  return (
    <div className="consecration-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">CONSECRATION // LITANY OF SEALS</div>
          <h1 className="screen-title">圣化祭坛</h1>
          <p className="screen-subtitle">武器是铁。圣印是让它相信自己应该杀人的东西。</p>
        </div>
        <div className="panel-heading__stats">
          <div>
            <span>武器圣印</span>
            <b>{weapon?.seals.length ?? 0} / 3</b>
          </div>
          <div>
            <span>圣化状态</span>
            <b>{weapon?.seals.length ? '已受祝圣' : '未刻印'}</b>
          </div>
        </div>
      </div>

      <div className="consecration-layout">
        <div className="consecration-weapon">
          <div className="eyebrow">BOUND WEAPON</div>
          {weapon ? (
            <ItemCard item={weapon} equipped showFlavor />
          ) : (
            <div className="empty-inline">请先在军械库装备一把武器。</div>
          )}
          <div className="seal-slots">
            {Array.from({ length: 3 }).map((_, index) => {
              const seal = weapon?.seals[index];
              return (
                <div key={index} className={`seal-slot ${seal ? 'is-filled' : ''}`}>
                  <div className="seal-slot__number">SLOT 0{index + 1}</div>
                  {seal ? (
                    <>
                      <div className="seal-slot__head">
                        <div className="seal-slot__sigil" style={{ color: TIER_COLORS[seal.tier] }}>
                          <PixelIcon name="star" size={22} />
                        </div>
                        <div>
                          <b>{seal.name}</b>
                          <small style={{ color: TIER_COLORS[seal.tier] }}>圣印阶级 {seal.tier}</small>
                        </div>
                      </div>
                      <div className="seal-slot__stats">
                        {seal.stats.map((affix, i) => (
                          <div key={i}>
                            <span>{STAT_META[affix.key].name}</span>
                            <b>
                              +{affix.value}
                              {STAT_META[affix.key].suffix === 'pct' ? '%' : ''}
                            </b>
                          </div>
                        ))}
                      </div>
                      <p className="seal-slot__flavor">{seal.flavor}</p>
                      <button type="button" className="seal-remove" onClick={() => actions.onRemoveSeal(seal.uid)}>
                        剥离圣印
                      </button>
                    </>
                  ) : (
                    <div className="seal-slot__empty">
                      <PixelIcon name="lock" size={22} />
                      <span>空圣印槽</span>
                      <small>在祭坛刻入一枚圣印</small>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="consecration-ritual">
          <div className="ritual-mark">
            <PixelIcon name="aquila" size={46} />
          </div>
          <div className="eyebrow">RITUAL OF SEALING</div>
          <h2>刻印圣印</h2>
          <p>
            将祷文、圣油与灵能尘埃压进武器表层。每次刻印会随机产生一枚 I–III 阶圣印，
            阶级越高，词条越多，数值越强。
          </p>
          <div className="ritual-costs">
            {Object.entries(nextCost).map(([key, value]) => {
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
            disabled={!affordable}
            onClick={actions.onConsecrate}
            icon={<PixelIcon name="star" size={17} />}
          >
            {weapon && weapon.seals.length >= 3 ? '圣印槽已满' : '刻入圣印'}
          </PixelButton>
          <div className="ritual-note">
            <PixelIcon name="info" size={14} />
            <span>圣印绑定在当前武器上。剥离圣印不会返还材料，也无法转移到其他武器。</span>
          </div>

          <div className="ritual-legend">
            <div className="eyebrow">SEAL TIERS</div>
            {[1, 2, 3].map((tier) => (
              <div key={tier} className="ritual-legend__row" style={{ '--tier-color': TIER_COLORS[tier] } as CSSProperties}>
                <span className="tier-pip" />
                <b>阶级 {['I', 'II', 'III'][tier - 1]}</b>
                <span>{tier === 1 ? '1 条词条' : tier === 2 ? '2 条词条' : '2 条强化词条'}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
