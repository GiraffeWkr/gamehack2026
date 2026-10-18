import type { CSSProperties } from 'react';
import type { SaveData } from '../game/types';
import { getDifficulty } from '../game/data/difficulties';
import { LEGACY_LIST, getLegacyCost } from '../game/data/legacy';
import { formatDuration, formatNumber } from '../game/meta/format';
import { artUrl } from './art';
import { PixelButton, Tag } from './components/UI';
import { PixelIcon } from './components/PixelIcon';
import type { HubActions } from './types';

export function EndlessPanel({ save, actions }: { save: SaveData; actions: HubActions }) {
  const difficulty = getDifficulty(save.difficulty);
  const endless = save.endless;
  const nextRun = endless.runs + 1;

  return (
    <div className="endless-panel">
      <section className="endless-hero">
        <div className="endless-hero__bg" style={{ backgroundImage: `url(${artUrl('planet_map')})` }} />
        <div className="endless-hero__shade" />
        <div className="endless-hero__scan" aria-hidden />
        <div className="endless-hero__body">
          <div className="eyebrow">ENDLESS EXPEDITION // LAST SURVIVOR</div>
          <h1 className="screen-title">无尽远征</h1>
          <p className="screen-subtitle">
            敌潮不会停止。时间越久，怪物越强、种类越多；直到你倒下。
            把遗产宝箱留给下一位幸存者，让他们替你走得更远。
          </p>
          <div className="endless-record">
            <div>
              <span>最深生存</span>
              <b>{formatDuration(endless.bestTime)}</b>
            </div>
            <div>
              <span>最高击杀</span>
              <b>{formatNumber(endless.bestKills)}</b>
            </div>
            <div>
              <span>首领击杀</span>
              <b>{endless.bestBosses}</b>
            </div>
            <div className="endless-record__chest">
              <span>遗产宝箱</span>
              <b><PixelIcon name="chest" size={16} />{endless.chests}</b>
            </div>
          </div>
          <div className="endless-actions">
            <PixelButton
              variant="primary"
              size="lg"
              onClick={actions.onStartEndless}
              icon={<PixelIcon name="play" size={18} />}
            >
              派遣第 {nextRun} 位幸存者
            </PixelButton>
            <button type="button" className="endless-protocol" onClick={actions.onOpenSettings}>
              <span className="endless-protocol__dot" style={{ background: difficulty.color }} />
              威胁协议 · {difficulty.name}
              <small>更改</small>
            </button>
          </div>
        </div>
        <div className="endless-hero__stamp">
          <span>RUN {String(nextRun).padStart(2, '0')}</span>
          <b>THE DEAD DO NOT STOP</b>
        </div>
      </section>

      <div className="endless-body">
        <section className="endless-legacy">
          <div className="endless-section-head">
            <div>
              <div className="eyebrow">LEGACY VAULT // CARRIED FORWARD</div>
              <h2>幸存者遗产</h2>
            </div>
            <div className="endless-chest-balance">
              <PixelIcon name="chest" size={20} />
              <div>
                <span>可用宝箱</span>
                <b>{endless.chests}</b>
              </div>
            </div>
          </div>
          <p className="endless-copy">
            每次远征结束，击杀首领、回收战场补给舱都会留下遗产宝箱。
            首个补给舱在 0:20 抵达，此后每 2 分钟一次；它会治疗伤势并留下一只宝箱。
            宝箱不会随幸存者死亡而消失，只会留给下一位继承者。
          </p>
          <div className="legacy-grid">
            {LEGACY_LIST.map((perk) => {
              const rank = endless.legacy[perk.id] ?? 0;
              const cost = getLegacyCost(perk, rank);
              const maxed = rank >= perk.maxRank;
              return (
                <div
                  key={perk.id}
                  className={`legacy-card ${maxed ? 'is-maxed' : ''}`}
                  style={{ '--legacy-color': perk.color } as CSSProperties}
                >
                  <div className="legacy-card__icon">
                    <PixelIcon name={perk.icon} size={25} />
                  </div>
                  <div className="legacy-card__body">
                    <div className="legacy-card__top">
                      <b>{perk.name}</b>
                      <Tag color={perk.color}>{rank} / {perk.maxRank}</Tag>
                    </div>
                    <small>{perk.perRank}</small>
                    <p>{perk.description}</p>
                  </div>
                  <div className="legacy-card__buy">
                    <span>{maxed ? '已满级' : `${cost} 宝箱`}</span>
                    <PixelButton
                      size="sm"
                      variant={maxed ? 'ghost' : 'default'}
                      disabled={maxed || endless.chests < cost}
                      onClick={() => actions.onBuyLegacy(perk.id)}
                    >
                      {maxed ? 'MAX' : '继承'}
                    </PixelButton>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="endless-rules">
          <div className="eyebrow">THREAT PROTOCOL</div>
          <h3>敌潮升级</h3>
          <div className="endless-rule">
            <span>00:00</span>
            <div><b>绿皮先遣</b><small>兽人小子与枪手。先学会移动。</small></div>
          </div>
          <div className="endless-rule">
            <span>02:00</span>
            <div><b>虫群与叛徒</b><small>远程压制与快速单位混编。</small></div>
          </div>
          <div className="endless-rule">
            <span>06:30</span>
            <div><b>异形联军</b><small>钛族、千子与混沌同时入场。</small></div>
          </div>
          <div className="endless-rule">
            <span>09:00</span>
            <div><b>全面灭绝</b><small>精英密度达到上限。开始祈祷。</small></div>
          </div>
          <div className="endless-rule endless-rule--boss">
            <span>01:30</span>
            <div><b>首领降临</b><small>每 2 分钟一位首领，击杀留下宝箱。</small></div>
          </div>
          <div className="endless-bonus">
            <span>战利品倍率</span>
            <b>×{difficulty.rewardMult.toFixed(2)}</b>
            <small>{difficulty.name}协议</small>
          </div>
          <div className="endless-warning">
            <PixelIcon name="warning" size={16} />
            <span>没有胜利条件。撤退或死亡都会结算，但只有死亡会记录为阵亡。</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
