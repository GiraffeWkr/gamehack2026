import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { InstitutionId, SaveData, SkillId } from '../game/types';
import { INSTITUTIONS, INSTITUTION_LIST, SKILLS } from '../game/data/institutions';
import { RESOURCES } from '../game/data/constants';
import {
  calculateStats,
  canAfford,
  getSkillUnlockCost,
  getSkillUpgradeCost,
  getUnlockedSystems,
} from '../game/meta/save';
import { formatNumber, formatPercent } from '../game/meta/format';
import { Meter, Panel, PixelButton, Tag } from './components/UI';
import { PixelIcon } from './components/PixelIcon';
import type { HubActions } from './types';

function SkillCard({
  id,
  save,
  actions,
  institutionUnlocked,
}: {
  id: SkillId;
  save: SaveData;
  actions: HubActions;
  institutionUnlocked: boolean;
}) {
  const skill = SKILLS[id];
  const skillUnlocked = save.skillUnlocks.includes(id);
  const level = skillUnlocked ? (save.skillLevels[id] ?? 1) : 0;
  const cost = getSkillUpgradeCost(save, id, level || 1);
  const unlockCost = getSkillUnlockCost(id);
  const maxed = level >= 3;
  const affordable =
    skillUnlocked &&
    !maxed &&
    canAfford(save.resources, { gelt: cost.gelt, [cost.matKey]: cost.matAmount });
  const canUnlock =
    institutionUnlocked &&
    !skillUnlocked &&
    canAfford(save.resources, { gelt: unlockCost.gelt, [unlockCost.matKey]: unlockCost.matAmount });
  return (
    <div className={`skill-card ${institutionUnlocked && skillUnlocked ? '' : 'is-locked'}`} style={{ '--skill-color': skill.color } as CSSProperties}>
      <div className="skill-card__icon">
        <PixelIcon name={skill.icon} size={26} />
      </div>
      <div className="skill-card__body">
        <div className="skill-card__title">
          <div>
            <b>{skill.name}</b>
            <small>{skill.english}</small>
          </div>
          <div className="skill-level">
            {Array.from({ length: 3 }).map((_, index) => (
              <i key={index} className={index < level ? 'on' : ''} />
            ))}
            <span>{skillUnlocked ? `Lv.${level}` : '未学习'}</span>
          </div>
        </div>
        <p>{skill.description}</p>
        <div className="skill-card__detail">{skill.detail(Math.max(1, level))}</div>
        <div className="skill-card__footer">
          <span className="skill-cooldown"><PixelIcon name="clock" size={12} />{skill.cooldown}s</span>
          {!institutionUnlocked ? (
            <Tag color="#6c675d">机构未解锁</Tag>
          ) : !skillUnlocked ? (
            <button
              type="button"
              className={`skill-upgrade ${canUnlock ? 'is-ready' : ''}`}
              onClick={() => actions.onUnlockSkill(id)}
              disabled={!canUnlock}
            >
              <span>学习</span>
              <PixelIcon name="gelt" size={12} />{formatNumber(unlockCost.gelt)}
              {unlockCost.matAmount > 0 ? (
                <>
                  <PixelIcon name={RESOURCES[unlockCost.matKey].icon} size={12} />
                  {formatNumber(unlockCost.matAmount)}
                </>
              ) : null}
            </button>
          ) : maxed ? (
            <Tag color={skill.color}>已精通</Tag>
          ) : (
            <button
              type="button"
              className={`skill-upgrade ${affordable ? 'is-ready' : ''}`}
              onClick={() => actions.onUpgradeSkill(id)}
            >
              <span>升级</span>
              <PixelIcon name="gelt" size={12} />{formatNumber(cost.gelt)}
              <PixelIcon name={RESOURCES[cost.matKey].icon} size={12} />{formatNumber(cost.matAmount)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function InstitutionPanel({ save, actions }: { save: SaveData; actions: HubActions }) {
  const [selected, setSelected] = useState<InstitutionId>(save.activeInstitution);
  useEffect(() => {
    setSelected(save.activeInstitution);
  }, [save.activeInstitution]);
  const institution = INSTITUTIONS[selected];
  const progress = save.institutions[selected];
  const unlocked = progress?.unlocked;
  const active = save.activeInstitution === selected;
  const stats = calculateStats(save);
  const canUnlock = save.endless.bestTime >= institution.unlockMinutes * 60;
  const affordable = canAfford(save.resources, institution.unlockCost);

  return (
    <div className="institution-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">ADEPTA // COMBAT DOCTRINES</div>
          <h1 className="screen-title">帝国机构</h1>
          <p className="screen-subtitle">
            审判官不需要亲自掌握所有技艺。你只需要让正确的人站在正确的位置，然后替他们呼叫轨道火力。
          </p>
        </div>
        <div className="panel-heading__stats">
          <div>
            <span>已建立</span>
            <b>{INSTITUTION_LIST.filter((i) => save.institutions[i.id]?.unlocked).length} / 5</b>
          </div>
          <div>
            <span>当前效忠</span>
            <b style={{ color: INSTITUTIONS[save.activeInstitution].color }}>{INSTITUTIONS[save.activeInstitution].name}</b>
          </div>
        </div>
      </div>

      <div className="institution-layout">
        <div className="institution-list">
          {INSTITUTION_LIST.map((institution) => {
            const info = save.institutions[institution.id];
            const isActive = save.activeInstitution === institution.id;
            const isSelected = selected === institution.id;
            return (
              <button
                key={institution.id}
                type="button"
                className={`institution-row ${isSelected ? 'is-selected' : ''} ${info?.unlocked ? 'is-unlocked' : 'is-locked'}`}
                style={{ '--inst-color': institution.color } as CSSProperties}
                onClick={() => setSelected(institution.id)}
              >
                <span className="institution-row__crest">
                  <PixelIcon name={institution.icon} size={24} />
                </span>
                <span className="institution-row__body">
                  <span className="institution-row__title">
                    <b>{institution.name}</b>
                    {isActive ? <Tag color={institution.color} filled>效忠中</Tag> : null}
                  </span>
                  <small>{institution.english}</small>
                  <span className="institution-row__passive">{institution.passiveText}</span>
                </span>
                {!info?.unlocked ? <PixelIcon name="lock" size={15} /> : <PixelIcon name="check" size={15} />}
              </button>
            );
          })}
          <div className="institution-current">
            <div className="eyebrow">ACTIVE BONUS</div>
            <div>{INSTITUTIONS[save.activeInstitution].passiveText}</div>
            <Meter value={Math.log10(Math.max(1, stats.power))} max={9} color={INSTITUTIONS[save.activeInstitution].color} height={5} />
            <small>切换机构不会重置圣典或技能等级。</small>
          </div>
        </div>

        <div className="institution-detail" style={{ '--inst-color': institution.color } as CSSProperties}>
          <div className="institution-detail__hero">
            <div className="institution-detail__crest">
              <PixelIcon name={institution.icon} size={58} />
            </div>
            <div>
              <div className="eyebrow">{institution.english}</div>
              <h2>{institution.name}</h2>
              <p className="institution-motto">{institution.motto}</p>
            </div>
            <div className="institution-detail__status">
              {active ? (
                <Tag color={institution.color} filled>当前战斗机构</Tag>
              ) : unlocked ? (
                <PixelButton size="sm" variant="primary" onClick={() => actions.onSetInstitution(selected)}>
                  设为战斗机构
                </PixelButton>
              ) : (
                <PixelButton size="sm" variant="primary" onClick={() => actions.onUnlockInstitution(selected)} disabled={!canUnlock}>
                  建立机构
                </PixelButton>
              )}
            </div>
          </div>

          <div className="institution-passive">
            <div>
              <span>机构被动</span>
              <b>{institution.passiveText}</b>
            </div>
            <div className="institution-passive__note">
              {unlocked
                ? active
                  ? '该机构正在为你的下一次部署提供被动加成。'
                  : '设为战斗机构后生效。'
                : `需要单次生存 ${institution.unlockMinutes} 分钟。`}
            </div>
          </div>

          {!unlocked ? (
            <div className="unlock-panel">
              <div className="unlock-panel__head">
                <PixelIcon name="lock" size={18} />
                <div>
                  <b>建立机构</b>
                  <span>获得该机构的被动，并开放 3 个可学习技能。</span>
                </div>
              </div>
              <div className="unlock-costs">
                {Object.entries(institution.unlockCost).length ? (
                  Object.entries(institution.unlockCost).map(([key, value]) => {
                    const resource = RESOURCES[key as keyof typeof RESOURCES];
                    return (
                      <div key={key} className={(save.resources[key as keyof typeof save.resources] ?? 0) < (value ?? 0) ? 'is-short' : ''}>
                        <PixelIcon name={resource.icon} size={16} />
                        <span>{resource.name}</span>
                        <b>{formatNumber(value ?? 0)}</b>
                      </div>
                    );
                  })
                ) : (
                  <div><PixelIcon name="check" size={16} /><span>无需资源</span></div>
                )}
              </div>
              <PixelButton
                variant="primary"
                onClick={() => actions.onUnlockInstitution(selected)}
                disabled={!canUnlock || !affordable}
              >
                {canUnlock ? '建立机构' : `生存 ${institution.unlockMinutes} 分钟`}
              </PixelButton>
            </div>
          ) : (
            <>
              <div className="institution-skills-head">
                <div>
                  <div className="eyebrow">SIGNATURE SKILLS</div>
                  <h3>机构技能</h3>
                </div>
                <span>技能必须先用资源学习 · 战斗中自动释放，也可手动点击</span>
              </div>
              <div className="skill-list">
                {institution.skills.map((id) => (
                  <SkillCard key={id} id={id} save={save} actions={actions} institutionUnlocked={!!unlocked} />
                ))}
              </div>
            </>
          )}

          <div className="institution-footer">
            <div><PixelIcon name="info" size={15} />只有已学习且属于当前机构的技能会进入战斗。切换机构不会重置技能等级。</div>
            <span>{institution.english} // CLEARANCE VERMILION</span>
          </div>
        </div>
      </div>
    </div>
  );
}
