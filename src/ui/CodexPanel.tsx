import type { CSSProperties } from 'react';
import type { CodexNodeDef, SaveData } from '../game/types';
import { CODEX_BRANCHES, CODEX_NODES, getCodexCost } from '../game/data/codex';
import { RESOURCES, STAT_META, formatStatValue } from '../game/data/constants';
import { canAfford, getUnlockedSystems } from '../game/meta/save';
import { formatNumber } from '../game/meta/format';
import { PixelButton, Meter, Tag } from './components/UI';
import { PixelIcon } from './components/PixelIcon';
import type { HubActions } from './types';

function effectPerRank(node: CodexNodeDef): string {
  const parts = Object.entries(node.effect)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      const meta = STAT_META[key as keyof typeof STAT_META];
      return `${meta.name} ${formatStatValue(key as keyof typeof STAT_META, value!)}`;
    });
  if (node.special === 'autoStrike') parts.push('解锁自动交战协议');
  return parts.join(' · ');
}

function Branch({ branch, save, actions }: { branch: CodexNodeDef['branch']; save: SaveData; actions: HubActions }) {
  const meta = CODEX_BRANCHES[branch];
  const nodes = CODEX_NODES.filter((node) => node.branch === branch);
  const total = nodes.reduce((sum, node) => sum + (save.codex[node.id] ?? 0), 0);
  const max = nodes.reduce((sum, node) => sum + node.maxRank, 0);
  return (
    <section className="codex-branch" style={{ '--branch-color': meta.color } as CSSProperties}>
      <header className="codex-branch__head">
        <div className="codex-branch__sigil">
          <PixelIcon name={branch === 'wrath' ? 'sword' : branch === 'aegis' ? 'shield' : 'cog'} size={22} />
        </div>
        <div>
          <div className="eyebrow">{meta.english}</div>
          <h3>{meta.name}</h3>
          <p>{meta.description}</p>
        </div>
        <span className="codex-branch__count">
          {total}/{max}
        </span>
      </header>
      <Meter value={total} max={max} color={meta.color} height={4} />
      <div className="codex-chain">
        {nodes.map((node, index) => {
          const rank = save.codex[node.id] ?? 0;
          const parentRank = node.requires ? save.codex[node.requires] ?? 0 : 1;
          const locked = parentRank < 1;
          const maxed = rank >= node.maxRank;
          const cost = getCodexCost(node, rank);
          const affordable =
            !maxed &&
            !locked &&
            canAfford(save.resources, {
              gelt: cost.gelt,
              ...(node.mat && cost.mat ? { [node.mat]: cost.mat } : {}),
            });
          return (
            <div key={node.id} className="codex-node-wrap">
              {index > 0 ? <div className={`codex-link ${parentRank > 0 ? 'is-open' : ''}`} /> : null}
              <button
                type="button"
                className={`codex-node ${rank > 0 ? 'is-owned' : ''} ${maxed ? 'is-maxed' : ''} ${locked ? 'is-locked' : ''} ${affordable ? 'is-affordable' : ''}`}
                onClick={() => actions.onBuyCodex(node.id)}
                disabled={locked || maxed}
              >
                <div className="codex-node__icon">
                  <PixelIcon name={node.icon} size={22} />
                  {locked ? <span className="codex-node__lock"><PixelIcon name="lock" size={14} /></span> : null}
                </div>
                <div className="codex-node__body">
                  <div className="codex-node__title">
                    <b>{node.name}</b>
                    <span className="rank-pips">
                      {Array.from({ length: node.maxRank }).map((_, i) => (
                        <i key={i} className={i < rank ? 'on' : ''} />
                      ))}
                    </span>
                  </div>
                  <div className="codex-node__desc">{node.desc}</div>
                  <div className="codex-node__effect">{effectPerRank(node)} / 级</div>
                  {!maxed ? (
                    <div className={`codex-node__cost ${affordable ? 'is-open' : ''}`}>
                      <PixelIcon name="gelt" size={12} />
                      <span>{formatNumber(cost.gelt)}</span>
                      {node.mat && cost.mat ? (
                        <>
                          <PixelIcon name={RESOURCES[node.mat].icon} size={12} />
                          <span>{formatNumber(cost.mat)}</span>
                        </>
                      ) : null}
                      <span className="codex-node__buy">{locked ? '前置未点亮' : affordable ? '点击点亮' : '资源不足'}</span>
                    </div>
                  ) : (
                    <div className="codex-node__cost is-maxed">
                      <PixelIcon name="check" size={12} />
                      <span>已满级</span>
                    </div>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CodexPanel({ save, actions }: { save: SaveData; actions: HubActions }) {
  const unlocked = getUnlockedSystems(save).codex;
  const totalRanks = Object.values(save.codex).reduce((sum, rank) => sum + rank, 0);
  const maxRanks = CODEX_NODES.reduce((sum, node) => sum + node.maxRank, 0);

  if (!unlocked) {
    return (
      <div className="panel-locked">
        <div className="panel-locked__mark">
          <PixelIcon name="book" size={42} />
        </div>
        <div className="eyebrow">ADEPTUS ASTARTES // CODEX</div>
        <h1 className="screen-title">《阿斯塔特圣典》</h1>
        <p>完成第一次无尽远征后，舰船会开放圣典的阅读权限。无论死亡还是撤收，你的战斗数据都会被写入经卷。</p>
        <PixelButton variant="primary" onClick={() => actions.onTab('endless')} icon={<PixelIcon name="chest" size={16} />}>
          前往无尽远征
        </PixelButton>
      </div>
    );
  }

  return (
    <div className="codex-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">CODEX ASTARTES // DOCTRINE STAMPS</div>
          <h1 className="screen-title">《阿斯塔特圣典》</h1>
          <p className="screen-subtitle">
            每一枚印章都是一段被验证过的战术。用王座币与战利品点亮它们，把审判官变成一件更精确的武器。
          </p>
        </div>
        <div className="panel-heading__stats">
          <div>
            <span>已点亮</span>
            <b>{totalRanks} / {maxRanks}</b>
          </div>
          <div>
            <span>分支</span>
            <b>3</b>
          </div>
          <Tag color="#d7b25e">永久生效</Tag>
        </div>
      </div>

      <div className="codex-guide">
        <PixelIcon name="info" size={16} />
        <span>
          节点沿分支顺序解锁。点亮前置节点后，下一枚印章才会显现。每个节点最多 3 级，部分特殊节点为 1–2 级。
        </span>
      </div>

      <div className="codex-grid">
        {(['wrath', 'aegis', 'machine'] as const).map((branch) => (
          <Branch key={branch} branch={branch} save={save} actions={actions} />
        ))}
      </div>

      <div className="codex-footer">
        <div>
          <b>战略提示</b>
          <span>前期优先点亮「怒火祷言」与「帝皇庇佑」，中期补上「火力配额」与「自动交战」，后期把乘区叠满。</span>
        </div>
        <div className="codex-footer__quote">“知识就是力量。但火力更直接。”</div>
      </div>
    </div>
  );
}
