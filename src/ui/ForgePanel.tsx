import { useMemo, useState } from 'react';
import type { Item, SaveData } from '../game/types';
import { RARITY_META } from '../game/data/constants';
import {
  getWeaponForgeCost,
  getItemPower,
} from '../game/data/items';
import {
  calculateStats,
  getEndlessTier,
  getUnlockedSystems,
  MAX_INVENTORY,
} from '../game/meta/save';
import { formatNumber, formatPercent } from '../game/meta/format';
import { ItemCard } from './components/ItemCard';
import { Meter, Panel, PixelButton, Tag } from './components/UI';
import { PixelIcon } from './components/PixelIcon';
import type { HubActions } from './types';

export function ForgePanel({ save, actions }: { save: SaveData; actions: HubActions }) {
  const [lastItem, setLastItem] = useState<Item | null>(null);
  const stats = useMemo(() => calculateStats(save), [save]);
  const unlocked = getUnlockedSystems(save).forge;
  const ilvl = getEndlessTier(save);
  const cost = getWeaponForgeCost(ilvl, stats.luck);
  const recent = [...save.inventory].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  const canForge =
    unlocked &&
    save.resources.gelt >= cost.gelt &&
    save.resources.promethium >= cost.promethium &&
    save.inventory.length < MAX_INVENTORY;

  if (!unlocked) {
    return (
      <div className="panel-locked">
        <div className="panel-locked__mark"><PixelIcon name="anvil" size={42} /></div>
        <div className="eyebrow">FABRICATION // OFFLINE</div>
        <h1 className="screen-title">锻造台</h1>
        <p>单次无尽生存达到 2 分钟后，舰船上的机魂会启动锻造台。你可以用钷素与王座币铸造新的武器和护甲。</p>
        <PixelButton variant="primary" onClick={() => actions.onTab('endless')} icon={<PixelIcon name="chest" size={16} />}>
          前往无尽远征
        </PixelButton>
      </div>
    );
  }

  const forge = () => {
    const item = actions.onForge();
    if (item) setLastItem(item);
  };

  return (
    <div className="forge-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">FABRICATION // MACHINE SPIRIT FORGE</div>
          <h1 className="screen-title">锻造台</h1>
          <p className="screen-subtitle">向机魂祈祷，然后给它一块足够好的钢。它会还你一件能杀人的东西。</p>
        </div>
        <div className="panel-heading__stats">
          <div>
            <span>锻造幸运</span>
            <b>+{stats.luck.toFixed(1)}%</b>
          </div>
          <div>
            <span>军械库</span>
            <b>{save.inventory.length}/{MAX_INVENTORY}</b>
          </div>
        </div>
      </div>

      <div className="forge-layout">
        <Panel className="forge-console" eyebrow="FORGE CONTROL" title="铸造一件装备">
          <div className="forge-console__visual">
            <div className="forge-anvil">
              <div className="forge-anvil__sparks" aria-hidden>
                {Array.from({ length: 8 }).map((_, index) => <i key={index} />)}
              </div>
              <PixelIcon name="anvil" size={58} />
              <span className="forge-anvil__level">等级 {ilvl}</span>
            </div>
            <div className="forge-console__odds">
              <span className="forge-odds-caption">基础概率 · 幸运后再判定</span>
              {RARITY_META.map((rarity) => (
                <div key={rarity.name}>
                  <span style={{ color: rarity.color }}>{rarity.name}</span>
                  <b>
                    {rarity.name === '普通'
                      ? '58%'
                      : rarity.name === '精良'
                        ? '28%'
                        : rarity.name === '史诗'
                          ? '11%'
                          : '3%'}
                  </b>
                </div>
              ))}
            </div>
          </div>
          <div className="forge-console__costs">
            <div>
              <span><PixelIcon name="gelt" size={14} />王座币</span>
              <b className={save.resources.gelt < cost.gelt ? 'is-short' : ''}>{formatNumber(cost.gelt)}</b>
            </div>
            <div>
              <span><PixelIcon name="promethium" size={14} />钷素</span>
              <b className={save.resources.promethium < cost.promethium ? 'is-short' : ''}>{formatNumber(cost.promethium)}</b>
            </div>
          </div>
          <PixelButton
            variant="primary"
            size="lg"
            disabled={!canForge}
            onClick={forge}
            icon={<PixelIcon name="hammer" size={18} />}
            title={!unlocked ? '尚未解锁' : save.inventory.length >= MAX_INVENTORY ? '军械库已满' : undefined}
          >
            {save.inventory.length >= MAX_INVENTORY ? '军械库已满' : '启动锻造'}
          </PixelButton>
          <p className="forge-console__hint">
            锻造会随机产出一把武器或一件护甲。装备等级为 <b>{ilvl}</b>，与最深生存纪录同步。
          </p>
        </Panel>

        <Panel className="forge-output" eyebrow="RECENT OUTPUT" title={lastItem ? '本次铸造结果' : '等待铸造命令'}>
          {lastItem ? (
            <div className="forge-output__result">
              <ItemCard
                item={lastItem}
                showFlavor
                footer={
                  <div className="inline-actions">
                    <PixelButton size="sm" variant="primary" onClick={() => actions.onEquip(lastItem.uid)}>
                      装备
                    </PixelButton>
                    <span className="muted-text">战力 {getItemPower(lastItem)}</span>
                  </div>
                }
              />
              <div className="forge-output__stamp">
                <PixelIcon name="aquila" size={15} />
                <span>机魂已验收</span>
              </div>
            </div>
          ) : (
            <div className="forge-idle">
              <div className="forge-idle__glyph"><PixelIcon name="anvil" size={38} /></div>
              <p>锻造台已就绪。投入材料，机魂会决定这次它是否愿意合作。</p>
              <div className="forge-rules">
                <div><span>01</span><p>武器与护甲共享锻造池，稀有度由幸运与生存阶段决定。</p></div>
                <div><span>02</span><p>传说装备可能附带配额、弹数或齐射等稀有词条。</p></div>
                <div><span>03</span><p>重复装备可以回收，转化为钷素、塑钢与陶瓷钢。</p></div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        className="forge-recent"
        eyebrow="RECENTLY FORGED"
        title="最近产出"
        action={
          <PixelButton size="sm" variant="ghost" onClick={() => actions.onTab('armory')} icon={<PixelIcon name="sword" size={14} />}>
            打开军械库
          </PixelButton>
        }
      >
        <div className="item-grid item-grid--compact">
          {recent.map((item) => (
            <ItemCard key={item.uid} item={item} compact onClick={() => actions.onTab('armory')} />
          ))}
        </div>
        {recent.length === 0 ? <div className="muted-text">还没有锻造记录。</div> : null}
      </Panel>

      <div className="forge-footer">
        <div><PixelIcon name="cog" size={16} /><span>机魂对重复的祈祷没有耐心。保持锻造台清洁。</span></div>
        <div className="forge-footer__warning">“未经祝圣的武器，只是一块形状可疑的铁。”</div>
      </div>
    </div>
  );
}
