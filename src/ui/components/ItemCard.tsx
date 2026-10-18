import type { CSSProperties, ReactNode } from 'react';
import type { IconName, Item } from '../../game/types';
import { RARITY_META } from '../../game/data/constants';
import { getItemDisplayStats, getItemFlavor, getItemPower, getItemTypeName } from '../../game/data/items';
import { PixelIcon } from './PixelIcon';

const ICONS: Record<string, IconName> = {
  chainsword: 'chain',
  thunder_hammer: 'hammer',
  storm_shield: 'shield',
  plasma_gun: 'bolt',
  melta_gun: 'flame',
  banner: 'aquila',
  carapace: 'shield',
  power_armor: 'helmet',
  robe: 'book',
  relic_armor: 'aquila',
};

export function ItemCard({
  item,
  equipped,
  selected,
  onClick,
  compact,
  footer,
  showFlavor,
}: {
  item: Item;
  equipped?: boolean;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
  footer?: ReactNode;
  showFlavor?: boolean;
}) {
  const rarity = RARITY_META[item.rarity];
  const stats = getItemDisplayStats(item);
  const icon = ICONS[item.baseType] ?? (item.slot === 'weapon' ? 'sword' : 'shield');
  const flavor = getItemFlavor(item);
  return (
    <div
      className={`item-card ${selected ? 'item-card--selected' : ''} ${compact ? 'item-card--compact' : ''} ${onClick ? 'item-card--clickable' : ''}`}
      style={{ '--rarity-color': rarity.color, '--rarity-glow': rarity.glow } as CSSProperties}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) onClick();
      }}
    >
      <div className="item-card__top">
        <div className="item-card__icon">
          <PixelIcon name={icon} size={compact ? 22 : 30} />
        </div>
        <div className="item-card__heading">
          <div className="item-card__name">{item.name}</div>
          <div className="item-card__meta">
            <span style={{ color: rarity.color }}>{rarity.name}</span>
            <span>·</span>
            <span>{getItemTypeName(item)}</span>
            <span>·</span>
            <span>等级 {item.ilvl}</span>
          </div>
        </div>
        {equipped ? <span className="equipped-mark">已装备</span> : null}
      </div>
      {!compact ? (
        <>
          <div className="item-card__base">
            {item.slot === 'weapon' ? (
              <span>
                武器伤害 <b>+{item.baseDamage}</b>
              </span>
            ) : (
              <span>
                基础生命 <b>+{item.baseHp}</b>
              </span>
            )}
            <span className="item-card__power">战力 {getItemPower(item)}</span>
          </div>
          <div className="item-card__affixes">
            {stats.slice(0, 6).map((stat, index) => (
              <div
                key={`${stat.label}-${index}`}
                className={`item-affix ${stat.sealed ? 'item-affix--sealed' : ''}`}
              >
                <span>{stat.label}</span>
                <span>{stat.value}</span>
              </div>
            ))}
            {stats.length > 6 ? <div className="item-affix item-affix--more">+{stats.length - 6} 条词条</div> : null}
            {stats.length === 0 ? <div className="item-affix item-affix--more">无附加词条</div> : null}
          </div>
          {item.seals.length > 0 ? (
            <div className="item-card__seals">
              {item.seals.map((seal) => (
                <span key={seal.uid} className="seal-pip" title={`${seal.name} — ${seal.flavor}`}>
                  <PixelIcon name="star" size={11} />
                  {seal.name}
                </span>
              ))}
            </div>
          ) : null}
          {showFlavor && flavor ? <p className="item-card__flavor">“{flavor}”</p> : null}
        </>
      ) : (
        <div className="item-card__compact-stats">
          {item.slot === 'weapon' ? `+${item.baseDamage} 武器伤害` : `+${item.baseHp} 生命`}
          <span>·</span>
          <span>{stats.length} 词条</span>
          {item.improvements > 0 ? <span className="item-upgrade">+{item.improvements}</span> : null}
        </div>
      )}
      {item.improvements > 0 ? (
        <div className="item-card__improvement">
          <span>祝圣</span>
          <div className="improvement-pips">
            {Array.from({ length: 10 }).map((_, index) => (
              <i key={index} className={index < item.improvements ? 'is-on' : ''} />
            ))}
          </div>
          <span>+{item.improvements}</span>
        </div>
      ) : null}
      {footer ? <div className="item-card__footer">{footer}</div> : null}
    </div>
  );
}
