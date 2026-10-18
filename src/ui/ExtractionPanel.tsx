import type { CSSProperties } from 'react';
import type { SaveData } from '../game/types';
import {
  EXTRACTION_MINES,
  EXTRACTION_OFFLINE_CAP_HOURS,
  RESOURCES,
} from '../game/data/constants';
import {
  getExtractionRates,
  getMineRate,
  getMineUpgradeCost,
  getTotalExtractionIncomePerMinute,
  getUnlockedSystems,
} from '../game/meta/save';
import { formatNumber, formatRate } from '../game/meta/format';
import { Meter, Panel, PixelButton, Tag } from './components/UI';
import { PixelIcon } from './components/PixelIcon';
import type { HubActions } from './types';

export function ExtractionPanel({ save, actions }: { save: SaveData; actions: HubActions }) {
  const unlocked = getUnlockedSystems(save).extraction;
  const rates = getExtractionRates(save);
  const income = getTotalExtractionIncomePerMinute(save);

  if (!unlocked) {
    return (
      <div className="panel-locked">
        <div className="panel-locked__mark"><PixelIcon name="pickaxe" size={42} /></div>
        <div className="eyebrow">EXTRACTION // OFFLINE</div>
        <h1 className="screen-title">开采场</h1>
        <p>单次无尽生存达到 5 分钟后，舰队会开放地表开采权限。钷素、塑钢、陶瓷钢与精金会持续产出，即使你离开战舰也不会停。</p>
        <PixelButton variant="primary" onClick={() => actions.onTab('endless')} icon={<PixelIcon name="chest" size={16} />}>
          前往无尽远征
        </PixelButton>
      </div>
    );
  }

  return (
    <div className="extraction-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">EXTRACTION // SURFACE OPERATIONS</div>
          <h1 className="screen-title">地表开采场</h1>
          <p className="screen-subtitle">战争需要燃料、钢铁与精金。舰船会在你战斗时继续挖掘这颗星球。</p>
        </div>
        <div className="panel-heading__stats">
          <div>
            <span>综合产出</span>
            <b>{formatNumber(income)} / 分</b>
          </div>
          <div>
            <span>离线上限</span>
            <b>{EXTRACTION_OFFLINE_CAP_HOURS} 小时</b>
          </div>
        </div>
      </div>

      <div className="extraction-banner">
        <div className="extraction-banner__icon"><PixelIcon name="pickaxe" size={28} /></div>
        <div>
          <b>机魂正在持续开采</b>
          <span>所有产出已实时汇入舰船库存。离线期间同样运转，最多累计 {EXTRACTION_OFFLINE_CAP_HOURS} 小时。</span>
        </div>
        <div className="extraction-banner__rate">
          <small>每分钟总产出</small>
          <b>{formatNumber(income, 1)}</b>
        </div>
      </div>

      <div className="mine-grid">
        {EXTRACTION_MINES.map((def, index) => {
          const level = save.extraction.levels[def.resource] ?? 1;
          const rate = getMineRate(def, level);
          const cost = getMineUpgradeCost(def, level);
          const affordable = save.resources.gelt >= cost;
          return (
            <article
              key={def.resource}
              className="mine-card"
              style={{ '--mine-color': def.color, '--mine-delay': `${index * 0.4}s` } as CSSProperties}
            >
              <div className="mine-card__top">
                <div className="mine-card__icon">
                  <PixelIcon name={def.icon} size={30} />
                </div>
                <div>
                  <div className="eyebrow">MINE {String(index + 1).padStart(2, '0')}</div>
                  <h3>{def.name}</h3>
                </div>
                <span className="mine-level">Lv.{level}</span>
              </div>
              <div className="mine-card__visual" aria-hidden>
                <div className="mine-rig">
                  <span className="mine-rig__beam" />
                  <span className="mine-rig__wheel" />
                  <span className="mine-rig__spark" />
                </div>
              </div>
              <div className="mine-card__stats">
                <div>
                  <span>实时产出</span>
                  <b>{formatRate(rate)}</b>
                </div>
                <div>
                  <span>当前库存</span>
                  <b>{formatNumber(save.resources[def.resource])}</b>
                </div>
                <div>
                  <span>离线 {EXTRACTION_OFFLINE_CAP_HOURS} 小时</span>
                  <b>{formatNumber(rate * 3600 * EXTRACTION_OFFLINE_CAP_HOURS)}</b>
                </div>
              </div>
              <Meter value={level % 5 || 5} max={5} color={def.color} height={4} />
              <div className="mine-card__footer">
                <div>
                  <span>升级至 Lv.{level + 1}</span>
                  <b className={affordable ? '' : 'is-short'}><PixelIcon name="gelt" size={13} />{formatNumber(cost)}</b>
                </div>
                <PixelButton
                  variant={affordable ? 'primary' : 'default'}
                  size="sm"
                  onClick={() => actions.onUpgradeMine(def.resource)}
                  disabled={!affordable}
                  icon={<PixelIcon name="wrench" size={14} />}
                >
                  升级
                </PixelButton>
              </div>
            </article>
          );
        })}
      </div>

      <div className="extraction-log">
        <Panel eyebrow="OPERATIONS LOG" title="开采场纪录" noPadding>
          <div className="extraction-log__rows">
            {EXTRACTION_MINES.map((def) => (
              <div key={def.resource} className="extraction-log__row">
                <span className="extraction-log__name"><PixelIcon name={def.icon} size={14} />{def.name}</span>
                <span>Lv.{save.extraction.levels[def.resource] ?? 1}</span>
                <span>{formatRate(rates[def.resource])}</span>
                <Tag color={def.color}>{save.resources[def.resource] > 0 ? '运转中' : '待产出'}</Tag>
              </div>
            ))}
          </div>
        </Panel>
        <div className="extraction-quote">
          <PixelIcon name="cog" size={18} />
          <p>
            “让钻头继续转。帝皇不需要休息，机魂也不需要。”
            <span>—— 技术神甫 奥克塔维亚·7</span>
          </p>
        </div>
      </div>
    </div>
  );
}
