import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { SaveData, Settings } from '../game/types';
import { ACHIEVEMENTS } from '../game/data/achievements';
import { DIFFICULTY_LIST, DIFFICULTIES } from '../game/data/difficulties';
import {
  GAME_VERSION,
  RESOURCES,
} from '../game/data/constants';
import { audio } from '../game/engine/audio';
import { formatNumber } from '../game/meta/format';
import { ART_CREDITS } from './art';
import { Modal, PixelButton, Tag } from './components/UI';
import { AudioMeter } from './components/AudioMeter';
import { PixelIcon } from './components/PixelIcon';
import type { HubActions } from './types';

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <button type="button" className={`toggle-row ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span>
        <b>{label}</b>
        <small>{description}</small>
      </span>
      <i className="toggle-switch"><i /></i>
    </button>
  );
}

export function SettingsModal({
  save,
  actions,
  onClose,
  onResetRequest,
}: {
  save: SaveData;
  actions: HubActions;
  onClose: () => void;
  onResetRequest: () => void;
}) {
  const [name, setName] = useState(save.inquisitorName);
  const settings = save.settings;
  const update = (partial: Partial<Settings>) => actions.onSettings(partial);

  return (
    <Modal
      title="舰桥设置"
      eyebrow="SYSTEM CONFIGURATION"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="modal-footnote">设置会立即保存到本地存档。</span>
          <PixelButton variant="primary" onClick={onClose}>完成</PixelButton>
        </>
      }
    >
      <div className="settings-layout">
        <section className="settings-section">
          <h3>音频</h3>
          <label className="slider-row">
            <span><PixelIcon name="music" size={16} />环境音乐 <b>{Math.round(settings.music * 100)}%</b></span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(settings.music * 100)}
              onChange={(event) => update({ music: Number(event.target.value) / 100 })}
            />
          </label>
          <label className="slider-row">
            <span><PixelIcon name="sound" size={16} />战斗音效 <b>{Math.round(settings.sfx * 100)}%</b></span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(settings.sfx * 100)}
              onChange={(event) => update({ sfx: Number(event.target.value) / 100 })}
            />
          </label>
          <p className="settings-hint">所有音乐与音效均由 WebAudio 实时合成，不加载外部音频文件。</p>
          <AudioMeter className="settings-audio-meter" />
          <div className="audio-test-row">
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => {
                audio.unlock();
                audio.play('ui_confirm');
              }}
              icon={<PixelIcon name="music" size={13} />}
            >
              界面音
            </PixelButton>
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => {
                audio.unlock();
                audio.play('orbital_call');
                window.setTimeout(() => audio.play('orbital_hit'), 330);
              }}
              icon={<PixelIcon name="beacon" size={13} />}
            >
              轨道打击
            </PixelButton>
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => {
                audio.unlock();
                audio.play('achievement');
              }}
              icon={<PixelIcon name="trophy" size={13} />}
            >
              圣歌
            </PixelButton>
          </div>
          <p className="settings-hint">
            如果听不到声音，请点击上面的试听按钮，或确认浏览器标签页未被静音。浏览器要求一次用户交互才能启用音频。
          </p>
        </section>

        <section className="settings-section">
          <h3>画面与反馈</h3>
          <Toggle
            checked={settings.screenshake}
            onChange={(value) => update({ screenshake: value })}
            label="屏幕震动"
            description="轨道打击、首领技能与受击反馈。"
          />
          <Toggle
            checked={settings.scanlines}
            onChange={(value) => update({ scanlines: value })}
            label="CRT 扫描线"
            description="为界面与战场增加一层像素 CRT 质感。"
          />
          <Toggle
            checked={settings.damageNumbers}
            onChange={(value) => update({ damageNumbers: value })}
            label="伤害数字"
            description="显示爆弹与轨道打击的浮动伤害。"
          />
        </section>

        <section className="settings-section">
          <h3>威胁协议</h3>
          <p className="settings-hint">
            当前：{DIFFICULTIES[save.difficulty]?.name ?? '标准'}。下一场战斗生效；战利品倍率按协议结算。
          </p>
          <div className="difficulty-grid">
            {DIFFICULTY_LIST.map((difficulty) => (
              <button
                type="button"
                key={difficulty.id}
                className={`difficulty-card ${save.difficulty === difficulty.id ? 'is-active' : ''}`}
                style={{ '--diff-color': difficulty.color } as CSSProperties}
                aria-pressed={save.difficulty === difficulty.id}
                onClick={() => actions.onSetDifficulty(difficulty.id)}
              >
                <span className="difficulty-card__top">
                  <b>{difficulty.name}</b>
                  <em>{difficulty.english}</em>
                  {difficulty.recommended ? <Tag color={difficulty.color}>基准</Tag> : null}
                </span>
                <small>{difficulty.tagline}</small>
                <span className="difficulty-card__mods">
                  敌 HP ×{difficulty.enemyHpMult.toFixed(2)} · 伤害 ×{difficulty.enemyDamageMult.toFixed(2)}
                  <br />
                  密度 ×{difficulty.spawnMult.toFixed(2)} · 回收 ×{difficulty.rewardMult.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
          <p className="settings-hint">
            {DIFFICULTIES[save.difficulty]?.description ?? ''}
          </p>
        </section>

        <section className="settings-section">
          <h3>审判官名号</h3>
          <div className="name-edit">
            <input
              value={name}
              maxLength={18}
              onChange={(event) => setName(event.target.value)}
              placeholder="输入名号"
            />
            <PixelButton
              variant="default"
              onClick={() => actions.onRename(name)}
              disabled={!name.trim() || name.trim() === save.inquisitorName}
            >
              更新
            </PixelButton>
          </div>
          <p className="settings-hint">名号会显示在标题页、舰桥与战斗记录中。</p>
          <div className="settings-meta">
            <span>存档创建</span>
            <b>{new Date(save.createdAt).toLocaleDateString('zh-CN')}</b>
          </div>
          <div className="settings-meta">
            <span>版本</span>
            <b>v{GAME_VERSION}</b>
          </div>
        </section>

        <section className="settings-section settings-section--danger">
          <h3>危险操作</h3>
          <p>重置会删除本地远征存档、所有装备、圣典进度与成就。此操作无法撤销。</p>
          <PixelButton variant="danger" size="sm" onClick={onResetRequest} icon={<PixelIcon name="close" size={14} />}>
            清除远征存档
          </PixelButton>
        </section>
      </div>
    </Modal>
  );
}

export function AchievementsModal({ save, onClose }: { save: SaveData; onClose: () => void }) {
  const unlocked = save.achievements.length;
  return (
    <Modal
      title="远征成就"
      eyebrow={`ACHIEVEMENTS // ${unlocked}/${ACHIEVEMENTS.length}`}
      onClose={onClose}
      wide
      footer={<PixelButton variant="primary" onClick={onClose}>返回舰桥</PixelButton>}
    >
      <div className="achievement-summary">
        <div className="achievement-summary__ring">
          <span>{Math.round((unlocked / ACHIEVEMENTS.length) * 100)}%</span>
        </div>
        <div>
          <b>已解锁 {unlocked} 项成就</b>
          <p>系统解锁与战斗里程碑会在这里留下记录。成就奖励会自动发放到舰船库存。</p>
        </div>
      </div>
      <div className="achievement-list">
        {ACHIEVEMENTS.map((achievement) => {
          const isUnlocked = save.achievements.includes(achievement.id);
          return (
            <div key={achievement.id} className={`achievement-row ${isUnlocked ? 'is-unlocked' : ''}`}>
              <div className="achievement-row__icon">
                <PixelIcon name={isUnlocked ? achievement.icon : 'lock'} size={24} />
              </div>
              <div className="achievement-row__body">
                <div>
                  <b>{achievement.name}</b>
                  {isUnlocked ? <Tag color="#d7b25e" filled>已达成</Tag> : null}
                </div>
                <p>{achievement.desc}</p>
                <div className="achievement-row__reward">
                  <span>奖励</span>
                  {Object.entries(achievement.reward).map(([key, value]) => {
                    const resource = RESOURCES[key as keyof typeof RESOURCES];
                    return (
                      <span key={key} className="reward-chip" style={{ '--resource-color': resource.color } as CSSProperties}>
                        <PixelIcon name={resource.icon} size={12} />{formatNumber(value ?? 0)} {resource.name}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="achievement-row__status">
                {isUnlocked ? <PixelIcon name="check" size={20} /> : <span>未达成</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function NewGameModal({
  hasSave,
  defaultName,
  onStart,
  onCancel,
}: {
  hasSave: boolean;
  defaultName: string;
  onStart: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const names = ['塞拉斯·沃尔', '凯恩·瓦伦丁', '奥蕾莉亚·维斯', '格里高利·泰恩', '伊莎多拉·费恩'];
  return (
    <Modal
      title="新的远征"
      eyebrow={hasSave ? 'WARNING // EXISTING SAVE' : 'INQUISITOR REGISTRATION'}
      onClose={onCancel}
      footer={
        <>
          <PixelButton variant="ghost" onClick={onCancel}>取消</PixelButton>
          <PixelButton
            variant="primary"
            disabled={!name.trim()}
            onClick={() => onStart(name.trim())}
            icon={<PixelIcon name="aquila" size={16} />}
          >
            确认部署
          </PixelButton>
        </>
      }
    >
      <div className="newgame-intro">
        <div className="newgame-mark"><PixelIcon name="aquila" size={46} /></div>
        <p>
          第 41 个千年。你的打击巡洋舰偏离了亚空间航线，抵达一颗被标注为“已净化”的星球。
          地表上挤满了兽人、混沌军团、钛族前哨与泰伦虫潮。
        </p>
        <p>
          你不需要求援，也不允许撤退。你只需要移动、活下来，
          <b>然后把死亡从轨道上叫下来。</b>
        </p>
        {hasSave ? (
          <div className="newgame-warning">
            <PixelIcon name="info" size={16} />
            <span>已有一份远征存档。开始新的远征将覆盖旧存档，且无法恢复。</span>
          </div>
        ) : null}
      </div>
      <label className="name-field">
        <span>审判官名号</span>
        <input
          autoFocus
          value={name}
          maxLength={18}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && name.trim()) onStart(name.trim());
          }}
          placeholder="输入名号"
        />
      </label>
      <div className="name-suggestions">
        {names.map((entry) => (
          <button key={entry} type="button" className={name === entry ? 'is-active' : ''} onClick={() => setName(entry)}>
            {entry}
          </button>
        ))}
      </div>
      <div className="newgame-rules">
        <div><span>01</span><p>没有角色等级。成长来自装备、《圣典》、机构、技能学习与幸存者遗产。</p></div>
        <div><span>02</span><p>敌潮不会停止。生存越久，敌人越强，直到你倒下。</p></div>
        <div><span>03</span><p>阵亡不会失去遗产宝箱。下一位幸存者会继承它们。</p></div>
      </div>
    </Modal>
  );
}

export function CreditsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="制作名单"
      eyebrow="CREDITS // FAN PROJECT"
      onClose={onClose}
      wide
      footer={<PixelButton variant="primary" onClick={onClose}>关闭</PixelButton>}
    >
      <div className="credits-layout">
        <div className="credits-block">
          <div className="credits-mark"><PixelIcon name="aquila" size={42} /></div>
          <h3>帝皇之锤</h3>
          <p>一款非商业、非官方的战锤 40,000 同人像素增量游戏。</p>
          <p className="credits-warning">
            Warhammer 40,000、相关名称、设定与标志归 Games Workshop 所有。
            本项目不使用官方美术、音频或文本素材，不以任何形式收费。
          </p>
        </div>
        <div className="credits-block">
          <h3>美术资源</h3>
          <p>{ART_CREDITS}</p>
          <p>
            场景、阵营肖像与首领肖像由 <b>gpt-image-2.5</b> 通过项目内的统一
            <code>curl</code> 管线生成。提示词与生成脚本位于 <code>scripts/</code>，可复现。
          </p>
          <p>战斗中的角色、异形、炮火、焦痕与粒子均由 Canvas 程序化绘制。</p>
        </div>
        <div className="credits-block">
          <h3>字体与工具</h3>
          <p>
            像素字体：<b>Zpix（最像素）</b>，作者 SolidZORO。本项目按照个人非商业项目许可使用。
          </p>
          <p>技术栈：React、TypeScript、Vite、Canvas 2D、WebAudio API、localStorage。</p>
          <p>音频全部由 WebAudio 实时合成，无外部音频素材。</p>
        </div>
        <div className="credits-block">
          <h3>设计参考</h3>
          <p>
            核心循环与数值框架参考《Zad Archery》的逆向分析资料，系统结构与成长曲线见
            <code>note/战锤40K_游戏策划案.md</code>。
          </p>
          <p>本作是献给帝皇的粗糙手工艺品。愿祂的星炬继续燃烧。</p>
        </div>
      </div>
    </Modal>
  );
}
