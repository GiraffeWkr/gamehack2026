import { useEffect, useMemo, useState } from 'react';
import type { Item, SaveData } from '../game/types';
import {
  getItemPower,
  getRerollCost,
  getSalvageValue,
  getUpgradeCost,
} from '../game/data/items';
import {
  calculateStats,
  canAfford,
  MAX_INVENTORY,
} from '../game/meta/save';
import { formatNumber, formatPercent } from '../game/meta/format';
import { ConfirmDialog, Meter, Panel, PixelButton, StatRow, Tag } from './components/UI';
import { ItemCard } from './components/ItemCard';
import { PixelIcon } from './components/PixelIcon';
import type { HubActions } from './types';

type Filter = 'all' | 'weapon' | 'armor';

export function ArmoryPanel({ save, actions }: { save: SaveData; actions: HubActions }) {
  const stats = useMemo(() => calculateStats(save), [save]);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedUid, setSelectedUid] = useState<string | null>(
    save.equippedWeapon ?? save.inventory[0]?.uid ?? null,
  );
  const [salvageTarget, setSalvageTarget] = useState<Item | null>(null);

  useEffect(() => {
    if (!selectedUid || !save.inventory.some((item) => item.uid === selectedUid)) {
      setSelectedUid(save.equippedWeapon ?? save.inventory[0]?.uid ?? null);
    }
  }, [save.inventory, save.equippedWeapon, selectedUid]);

  const weapon = save.inventory.find((item) => item.uid === save.equippedWeapon);
  const armor = save.inventory.find((item) => item.uid === save.equippedArmor);
  const selected = save.inventory.find((item) => item.uid === selectedUid) ?? null;
  const filtered = useMemo(() => {
    return [...save.inventory]
      .filter((item) => filter === 'all' || item.slot === filter)
      .sort((a, b) => {
        const ea = a.uid === save.equippedWeapon || a.uid === save.equippedArmor ? 1 : 0;
        const eb = b.uid === save.equippedWeapon || b.uid === save.equippedArmor ? 1 : 0;
        if (ea !== eb) return eb - ea;
        if (a.rarity !== b.rarity) return b.rarity - a.rarity;
        return b.createdAt - a.createdAt;
      });
  }, [save.inventory, save.equippedWeapon, save.equippedArmor, filter]);

  const upgradeCost = selected ? getUpgradeCost(selected) : null;
  const rerollCost = selected ? getRerollCost(selected) : null;
  const upgradeChance = selected
    ? Math.max(0.1, Math.min(0.95, 0.6 - selected.improvements * 0.1 + selected.pity))
    : 0;
  const isEquipped =
    !!selected && (selected.uid === save.equippedWeapon || selected.uid === save.equippedArmor);

  return (
    <div className="armory-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">ARMOURY // LOADOUT & RELICS</div>
          <h1 className="screen-title">军械库</h1>
          <p className="screen-subtitle">装备决定你能活多久，词条决定你能杀多快。别对任何一件装备产生感情。</p>
        </div>
        <div className="panel-heading__stats">
          <div>
            <span>军械库</span>
            <b>{save.inventory.length}/{MAX_INVENTORY}</b>
          </div>
          <div>
            <span>总战力</span>
            <b>{formatNumber(stats.power)}</b>
          </div>
        </div>
      </div>

      <div className="armory-layout">
        <div className="armory-main">
          <div className="loadout-row">
            <div className="loadout-slot">
              <div className="loadout-slot__label"><PixelIcon name="sword" size={14} />主武器</div>
              {weapon ? (
                <ItemCard item={weapon} equipped showFlavor onClick={() => setSelectedUid(weapon.uid)} />
              ) : (
                <div className="loadout-empty">未装备武器</div>
              )}
            </div>
            <div className="loadout-slot">
              <div className="loadout-slot__label"><PixelIcon name="shield" size={14} />护甲</div>
              {armor ? (
                <ItemCard item={armor} equipped showFlavor onClick={() => setSelectedUid(armor.uid)} />
              ) : (
                <div className="loadout-empty">未装备护甲</div>
              )}
            </div>
          </div>

          <Panel
            className="inventory-panel"
            eyebrow="INVENTORY"
            title="库存"
            action={
              <div className="segmented">
                {(
                  [
                    ['all', '全部'],
                    ['weapon', '武器'],
                    ['armor', '护甲'],
                  ] as Array<[Filter, string]>
                ).map(([key, label]) => (
                  <button key={key} type="button" className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>
                    {label}
                  </button>
                ))}
              </div>
            }
          >
            <div className="item-grid">
              {filtered.map((item) => {
                const equipped = item.uid === save.equippedWeapon || item.uid === save.equippedArmor;
                return (
                  <ItemCard
                    key={item.uid}
                    item={item}
                    compact
                    equipped={equipped}
                    selected={item.uid === selectedUid}
                    onClick={() => setSelectedUid(item.uid)}
                  />
                );
              })}
              {filtered.length === 0 ? <div className="empty-inline">这个分类下还没有装备。</div> : null}
            </div>
          </Panel>

          <div className="armory-stats">
            <Panel eyebrow="COMBAT READOUT" title="战斗读数">
              <div className="stat-grid">
                <StatRow label="爆弹伤害" value={formatNumber(stats.damage)} icon={<PixelIcon name="sword" size={14} />} />
                <StatRow label="生命上限" value={formatNumber(stats.maxHp)} icon={<PixelIcon name="shield" size={14} />} />
                <StatRow label="暴击" value={`${formatPercent(stats.critChance)} / ×${stats.critDamage.toFixed(1)}`} icon={<PixelIcon name="target" size={14} />} />
                <StatRow label="攻击间隔" value={`${stats.attackInterval.toFixed(2)}s`} icon={<PixelIcon name="clock" size={14} />} />
                <StatRow label="火力配额" value={`${stats.orbitalCharges} 发 / ${stats.orbitalRecharge.toFixed(1)}s`} icon={<PixelIcon name="beacon" size={14} />} />
                <StatRow label="齐射弹数" value={`${stats.orbitalShells} 发`} icon={<PixelIcon name="beacon" size={14} />} />
                <StatRow label="机仆化" value={`${formatPercent(stats.tameChance)} / 上限 ${stats.maxTames}`} icon={<PixelIcon name="servitor" size={14} />} />
                <StatRow label="自动交战" value={stats.autoStrike ? '已启用' : '未启用'} icon={<PixelIcon name="target" size={14} />} />
              </div>
            </Panel>
            <Panel eyebrow="POWER SUMMARY" title="战力构成">
              <div className="power-summary">
                <div className="power-summary__big">{formatNumber(stats.power)}</div>
                <div className="power-summary__label">综合战力</div>
                <Meter value={Math.log10(Math.max(1, stats.power))} max={9} color="#c9a45c" height={6} />
                <div className="power-summary__note">
                  战力会随着幸存者遗产、装备与圣典同步增长。上一任幸存者的遗产加成已计入当前属性。
                </div>
              </div>
            </Panel>
          </div>
        </div>

        <aside className="item-inspector">
          <div className="eyebrow">ITEM INSPECTOR</div>
          <h2>{selected ? selected.name : '选择一件装备'}</h2>
          {selected ? (
            <>
              <ItemCard item={selected} equipped={isEquipped} showFlavor />
              <div className="item-inspector__actions">
                <PixelButton
                  variant="primary"
                  onClick={() => actions.onEquip(selected.uid)}
                  disabled={isEquipped}
                  icon={<PixelIcon name="check" size={15} />}
                >
                  {isEquipped ? '已装备' : '装备'}
                </PixelButton>
                <PixelButton
                  variant="default"
                  onClick={() => actions.onUpgradeItem(selected.uid)}
                  disabled={selected.improvements >= 10}
                  icon={<PixelIcon name="anvil" size={15} />}
                  title={upgradeCost ? `消耗 ${formatNumber(upgradeCost.gelt)} 王座币 / ${upgradeCost.promethium} 钷素` : undefined}
                >
                  {selected.improvements >= 10 ? '祝圣满级' : '涂油祝圣'}
                </PixelButton>
              </div>
              <div className="item-inspector__costs">
                <div>
                  <span>祝圣成功率</span>
                  <b>{Math.round(upgradeChance * 100)}%</b>
                </div>
                {upgradeCost ? (
                  <div>
                    <span>消耗</span>
                    <b>{formatNumber(upgradeCost.gelt)} <small>币</small> + {upgradeCost.promethium} <small>钷素</small></b>
                  </div>
                ) : null}
                {selected.pity > 0 ? (
                  <div className="is-warm">
                    <span>机魂保底</span>
                    <b>+{Math.round(selected.pity * 100)}%</b>
                  </div>
                ) : null}
              </div>
              <div className="item-inspector__meta">
                <span>战力 <b>{getItemPower(selected)}</b></span>
                <span>词条 <b>{selected.implicits.length + selected.explicits.length}</b></span>
                <span>圣印 <b>{selected.seals.length}/3</b></span>
              </div>
              <div className="item-inspector__actions item-inspector__actions--secondary">
                <PixelButton
                  variant="ghost"
                  size="sm"
                  disabled={!selected.explicits.length}
                  onClick={() => actions.onReroll(selected.uid)}
                  title={rerollCost ? `${formatNumber(rerollCost.gelt)} 王座币 / ${rerollCost.plasteel} 塑钢` : undefined}
                >
                  重铸词条
                </PixelButton>
                <PixelButton
                  variant="danger"
                  size="sm"
                  disabled={isEquipped}
                  onClick={() => setSalvageTarget(selected)}
                >
                  回收
                </PixelButton>
              </div>
              <div className="item-inspector__salvage-note">
                回收可得：{formatNumber(getSalvageValue(selected).gelt)} 王座币 · {getSalvageValue(selected).promethium} 钷素 · {getSalvageValue(selected).plasteel} 塑钢
              </div>
            </>
          ) : (
            <div className="empty-inline">从库存中选择一件装备以查看详情。</div>
          )}
        </aside>
      </div>

      {salvageTarget ? (
        <ConfirmDialog
          title="回收装备"
          description={
            <div>
              确认拆解 <b>{salvageTarget.name}</b>？装备上的词条与圣印将永久丢失，无法撤销。
              <div className="confirm-salvage">
                <Tag color="#d7b25e">+{formatNumber(getSalvageValue(salvageTarget).gelt)} 王座币</Tag>
                <Tag color="#e98d4d">+{getSalvageValue(salvageTarget).promethium} 钷素</Tag>
              </div>
            </div>
          }
          confirmLabel="拆解"
          danger
          onCancel={() => setSalvageTarget(null)}
          onConfirm={() => {
            actions.onSalvage(salvageTarget.uid);
            setSalvageTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
