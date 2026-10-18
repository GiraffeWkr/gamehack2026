import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  BattleConfig,
  BattleResult,
  BattleRewardSummary,
  HudState,
  ResourceKey,
  SaveData,
  SkillId,
} from '../game/types';
import { audio } from '../game/engine/audio';
import { BattleScene } from '../game/engine/battle';
import { INSTITUTIONS } from '../game/data/institutions';
import { RESOURCES } from '../game/data/constants';
import { ACHIEVEMENT_BY_ID } from '../game/data/achievements';
import {
  calculateStats,
  getEquippedWeapon,
  getRuntimeSkills,
} from '../game/meta/save';
import { getDifficulty } from '../game/data/difficulties';
import { getWeaponStyle } from '../game/data/weaponStyles';
import { formatDuration, formatNumber } from '../game/meta/format';
import { artUrl } from './art';
import { PixelButton, Tag } from './components/UI';
import { ItemCard } from './components/ItemCard';
import { PixelIcon } from './components/PixelIcon';
import { MobileControls } from './MobileControls';
import type { IconName } from '../game/types';

interface Announcement {
  id: number;
  title: string;
  subtitle?: string;
  color?: string;
}


function skillIcon(id: string): IconName {
  const map: Record<string, IconName> = {
    bolt_volley: 'bolt',
    rapid_fire: 'boltPistol',
    melta_bomb: 'flame',
    mech_hound: 'hound',
    combat_servitor: 'servitor',
    servo_skull: 'skullSmall',
    deadshot: 'target',
    piercing_round: 'arrow',
    reapers_eye: 'skull',
    flame_verse: 'flame',
    lightning_verse: 'bolt',
    frost_verse: 'snow',
    scarab_swarm: 'scarab',
    entropy_field: 'warpDust',
    singularity: 'target',
  };
  return map[id] ?? 'spark';
}

export function BattleScreen({
  save,
  onComplete,
  onExit,
  onRestart,
  onTutorialDone,
}: {
  save: SaveData;
  onComplete: (result: BattleResult) => BattleRewardSummary;
  onExit: () => void;
  onRestart: () => void;
  onTutorialDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<BattleScene | null>(null);
  const completeCalled = useRef(false);
  const announcementTimer = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [showTutorial, setShowTutorial] = useState(!save.tutorialSeen);
  const tutorialActiveRef = useRef(!save.tutorialSeen);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [summary, setSummary] = useState<BattleRewardSummary | null>(null);
  const [isTouch] = useState(
    () => typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window),
  );
  const [portrait, setPortrait] = useState(
    () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth,
  );
  const [rotateDismissed, setRotateDismissed] = useState(false);

  const endless = true;
  const equippedWeapon = getEquippedWeapon(save);
  const weaponStyle = getWeaponStyle(equippedWeapon?.baseType);
  const config = useMemo<BattleConfig>(() => {
    const stats = calculateStats(save);
    return {
      arenaName: '灰烬登陆场',
      stats,
      institution: INSTITUTIONS[save.activeInstitution],
      skills: getRuntimeSkills(save),
      inquisitorName: save.inquisitorName,
      musicIntensity: 'battle',
      tutorial: !save.tutorialSeen,
      rewardMultiplier: getDifficulty(save.difficulty).rewardMult,
      enemyHpMult: getDifficulty(save.difficulty).enemyHpMult,
      enemyDamageMult: getDifficulty(save.difficulty).enemyDamageMult,
      spawnMult: getDifficulty(save.difficulty).spawnMult,
      weaponType: equippedWeapon?.baseType,
      weaponName: equippedWeapon?.name,
      seed: Math.floor(Math.random() * 0xffffffff),
      options: {
        damageNumbers: save.settings.damageNumbers,
        screenshake: save.settings.screenshake,
      },
    };
    // Only the launch snapshot should define this battle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latestCallbacks = useRef({ onComplete, onExit, onRestart, onTutorialDone });
  useEffect(() => {
    latestCallbacks.current = { onComplete, onExit, onRestart, onTutorialDone };
  }, [onComplete, onExit, onRestart, onTutorialDone]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const showAnnouncement = (title: string, subtitle?: string, color?: string) => {
      const next = { id: Date.now() + Math.random(), title, subtitle, color };
      setAnnouncement(next);
      if (announcementTimer.current) window.clearTimeout(announcementTimer.current);
      announcementTimer.current = window.setTimeout(() => {
        setAnnouncement((current) => (current?.id === next.id ? null : current));
      }, 5000);
    };
    const scene = new BattleScene(canvas, config, {
      onHud: (state) => setHud(state),
      onAnnounce: showAnnouncement,
      onEnd: (battleResult) => {
        if (completeCalled.current) return;
        completeCalled.current = true;
        audio.setIntensity('hub');
        setResult(battleResult);
        setPaused(false);
        pausedRef.current = false;
        const reward = latestCallbacks.current.onComplete(battleResult);
        setSummary(reward);
      },
    });
    sceneRef.current = scene;
    scene.start();
    if (!save.tutorialSeen) {
      scene.setPaused(true);
      pausedRef.current = true;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key.toLowerCase() !== 'p') return;
      if (completeCalled.current || tutorialActiveRef.current) return;
      event.preventDefault();
      const next = !pausedRef.current;
      pausedRef.current = next;
      setPaused(next);
      scene.setPaused(next);
      audio.play(next ? 'ui_back' : 'ui_confirm');
    };
    const onBlur = () => {
      if (completeCalled.current || pausedRef.current || tutorialActiveRef.current) return;
      pausedRef.current = true;
      setPaused(true);
      scene.setPaused(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
      if (announcementTimer.current) window.clearTimeout(announcementTimer.current);
      scene.stop();
      sceneRef.current = null;
    };
    // Scene is intentionally created once per battle mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resume = () => {
    pausedRef.current = false;
    setPaused(false);
    sceneRef.current?.setPaused(false);
    audio.play('ui_confirm');
  };

  useEffect(() => {
    const updateViewport = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  const needsRotate = isTouch && portrait && !rotateDismissed;
  const orientationPaused = useRef(false);
  useEffect(() => {
    if (!isTouch) return;
    if (needsRotate && !pausedRef.current) {
      orientationPaused.current = true;
      pausedRef.current = true;
      setPaused(true);
      sceneRef.current?.setPaused(true);
    } else if (!needsRotate && orientationPaused.current) {
      orientationPaused.current = false;
      pausedRef.current = false;
      setPaused(false);
      sceneRef.current?.setPaused(false);
    }
  }, [needsRotate, isTouch]);

  const enterLandscape = async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (mode: string) => Promise<void>;
      };
      await orientation.lock?.('landscape');
    } catch {
      // iOS Safari and some embedded browsers do not expose orientation lock.
    }
    setRotateDismissed(true);
  };

  const togglePause = () => {
    if (!sceneRef.current || result || showTutorial) return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    sceneRef.current.setPaused(next);
    audio.play(next ? 'ui_back' : 'ui_confirm');
  };

  const retire = () => {
    setPaused(false);
    pausedRef.current = false;
    sceneRef.current?.setPaused(false);
    audio.play('ui_back');
    sceneRef.current?.retreat();
  };

  const startFromTutorial = () => {
    tutorialActiveRef.current = false;
    setShowTutorial(false);
    pausedRef.current = false;
    sceneRef.current?.setPaused(false);
    latestCallbacks.current.onTutorialDone();
    audio.play('ui_confirm');
  };

  const skillClick = (id: string) => {
    sceneRef.current?.castSkillById(id as SkillId);
  };

  const hpRatio = hud ? Math.max(0, Math.min(1, hud.hp / hud.maxHp)) : 1;
  const quotaRatio = hud ? Math.min(1, hud.kills / Math.max(1, hud.quota)) : 0;

  return (
    <div className={`battle-screen ${isTouch ? 'battle-screen--touch' : ''}`}>
      <div className="battle-frame">
        <canvas ref={canvasRef} className="battle-canvas" aria-label="战场" />
        <div className="battle-scanlines" aria-hidden />
        <div className="battle-vignette" aria-hidden />

        <div className="battle-hud">
          <div className="battle-top">
            <div className="battle-arena">
              <div className="battle-arena__id">
                ENDLESS EXPEDITION
              </div>
              <div className="battle-arena__name">
                灰烬登陆场 · 无尽
              </div>
              <div className="battle-arena__weapon">
                {hud?.weaponName ?? '制式武器'} · {hud?.weaponMode ?? '武器攻击'}
              </div>
              <div className="battle-arena__threat">
                <span>压力</span>
                <div className="threat-pips threat-pips--small">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <i
                      key={index}
                      className={index < Math.min(5, 1 + Math.floor((hud?.time ?? 0) / 120)) ? 'is-on' : ''}
                    />
                  ))}
                </div>
                <span>递增</span>
              </div>
              <div className="battle-objective">
                <div className="battle-objective__row">
                  <span>{hud?.objective ?? '正在部署'}</span>
                  <b>
                    {hud?.endless
                      ? `${hud.chests ?? 0} 箱`
                      : hud
                        ? `${Math.min(hud.kills, hud.quota)} / ${hud.quota}`
                        : '—'}
                  </b>
                </div>
                <div className="battle-objective__bar">
                  <div
                    style={{
                      width: `${
                        hud?.endless
                          ? hud.bossActive
                            ? Math.max(0, hud.bossPhase) * 100
                            : Math.max(0, Math.min(1, 1 - (hud.nextBossIn ?? 0) / 120)) * 100
                          : quotaRatio * 100
                      }%`,
                    }}
                  />
                  <i />
                </div>
                {hud?.endless ? (
                  <div className="battle-endless-meta">
                    击杀 {formatNumber(hud.kills)} · 首领 {hud.bossCount ?? 0}
                  </div>
                ) : null}
              </div>
              {hud?.buffs.length ? (
                <div className="battle-buffs">
                  {hud.buffs.map((buff) => (
                    <div key={buff.id} className="battle-buff" style={{ '--buff-color': buff.color } as CSSProperties}>
                      <span>{buff.name}</span>
                      <i style={{ width: `${(buff.time / buff.maxTime) * 100}%` }} />
                      <b>{Math.ceil(buff.time)}s</b>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="battle-utility">
              <div className="battle-timer">
                <PixelIcon name="clock" size={13} />
                <span>{hud ? formatDuration(hud.time) : '00:00'}</span>
              </div>
              <button type="button" className="battle-icon-btn" onClick={togglePause} title="暂停 (Esc)">
                <PixelIcon name="pause" size={18} />
              </button>
            </div>
          </div>

          {hud?.bossActive ? (
            <div className="boss-bar" style={{ '--boss-color': hud.bossColor ?? '#c33f3a' } as CSSProperties}>
              <div className="boss-bar__portrait">
                {hud.bossPortrait ? <img src={artUrl(hud.bossPortrait)} alt="" /> : <PixelIcon name="skull" size={26} />}
              </div>
              <div className="boss-bar__body">
                <div className="boss-bar__title">
                  <span>{hud.bossTitle}</span>
                  <b>{hud.bossName}</b>
                  <small>首领级信号</small>
                </div>
                <div className="boss-bar__track">
                  <div className="boss-bar__fill" style={{ width: `${Math.max(0, hud.bossPhase) * 100}%` }} />
                  <div className="boss-bar__notches" />
                </div>
              </div>
              <div className="boss-bar__percent">{Math.ceil(hud.bossPhase * 100)}%</div>
            </div>
          ) : null}

          {hud && hud.combo >= 5 ? (
            <div className="combo-counter">
              <span>连杀</span>
              <b>×{hud.combo}</b>
              <div className="combo-counter__timer">
                <i style={{ width: `${Math.min(100, (hud.comboTimer / 2.4) * 100)}%` }} />
              </div>
            </div>
          ) : null}

          <div className="battle-bottom">
            <div className="vitals">
              <div className="vitals__head">
                <span><PixelIcon name="shield" size={15} />生命</span>
                <b>{hud ? `${formatNumber(hud.hp)} / ${formatNumber(hud.maxHp)}` : '—'}</b>
              </div>
              <div className="vitals__bar">
                <div className={`vitals__fill ${hpRatio < 0.3 ? 'is-critical' : ''}`} style={{ width: `${hpRatio * 100}%` }} />
                <div className="vitals__segments" />
              </div>
              <div className="vitals__meta">
                <span><PixelIcon name="servitor" size={12} />机仆 {hud?.allies ?? 0}/{hud?.maxAllies ?? 0}</span>
                <span><PixelIcon name="sword" size={12} />{hud?.weaponMode ?? '武器攻击'}</span>
                <span><PixelIcon name="target" size={12} />中键 轨道</span>
              </div>
            </div>

            <div className={`quota-hud ${hud?.noAmmo ? 'is-empty' : ''}`}>
              <div className="quota-hud__label">
                <span>火力配额</span>
                <b>{hud ? `${hud.charges} / ${hud.maxCharges}` : '— / —'}</b>
              </div>
              <div className="quota-pips">
                {Array.from({ length: hud?.maxCharges ?? 2 }).map((_, index) => (
                  <i key={index} className={index < (hud?.charges ?? 0) ? 'is-ready' : ''}>
                    <span />
                  </i>
                ))}
              </div>
              <div className="quota-recharge">
                <i style={{ width: `${(hud?.rechargeProgress ?? 0) * 100}%` }} />
              </div>
              <div className="quota-hud__hint">
                <span className="keycap">左键</span>
                <span>武器攻击</span>
                <span className="keycap">中键</span>
                <span>轨道打击</span>
              </div>
            </div>

            <div className="skill-dock">
              {(hud?.skills ?? []).map((skill) => {
                const ratio = skill.total > 0 ? skill.cooldown / skill.total : 0;
                return (
                  <button
                    key={skill.id}
                    type="button"
                    className={`battle-skill ${skill.ready ? 'is-ready' : ''}`}
                    style={{ '--skill-color': skill.color } as CSSProperties}
                    onClick={() => skillClick(skill.id)}
                    title={`${skill.name} Lv.${skill.level}`}
                  >
                    <span className="battle-skill__icon">
                      <PixelIcon name={skillIcon(skill.id)} size={24} />
                    </span>
                    <span className="battle-skill__name">{skill.name}</span>
                    <span className="battle-skill__level">LV.{skill.level}</span>
                    {!skill.ready ? (
                      <span className="battle-skill__cooldown">
                        <i style={{ height: `${ratio * 100}%` }} />
                        <b>{Math.ceil(skill.cooldown)}</b>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="battle-bottom-hint">
            <span><span className="keycap">WASD</span> 移动</span>
            <span><span className="keycap">左键</span> 武器攻击</span>
            <span><span className="keycap">中键</span> 轨道打击</span>
            <span><span className="keycap">空格</span> 闪避</span>
            <span><span className="keycap">ESC</span> 暂停</span>
            <span className="battle-bottom-hint__right">{hud?.institutionName} · 已收集 <b>{formatNumber(hud?.lootGelt ?? 0)}</b> 王座币</span>
          </div>
        </div>

        {isTouch && !result && !showTutorial ? (
          <MobileControls
            hud={hud}
            onMove={(x, y) => sceneRef.current?.setMobileMove(x, y)}
            onAim={(x, y, active) => sceneRef.current?.setMobileAim(x, y, active)}
            onOrbital={() => sceneRef.current?.castMobileOrbital()}
            onDash={() => sceneRef.current?.triggerDash()}
            onSkill={(id) => skillClick(id)}
          />
        ) : null}

        {announcement ? (
          <div
            key={announcement.id}
            className="battle-announcement"
            style={{ '--announce-color': announcement.color ?? '#c9a45c' } as CSSProperties}
          >
            <div className="battle-announcement__line" />
            <div>
              <div className="battle-announcement__title">{announcement.title}</div>
              {announcement.subtitle ? <div className="battle-announcement__subtitle">{announcement.subtitle}</div> : null}
            </div>
          </div>
        ) : null}

        {showTutorial ? (
          <div className="battle-overlay battle-overlay--tutorial">
            <div className="protocol-card">
              <div className="protocol-card__mark"><PixelIcon name="aquila" size={34} /></div>
              <div className="eyebrow">FIELD PROTOCOL // FIRST DEPLOYMENT</div>
              <h2>审判官，欢迎来到地表</h2>
              <p>
                {isTouch
                  ? '左摇杆移动，右摇杆瞄准并持续攻击。轨道与闪避按钮在屏幕两侧，活下来，然后让帝皇之锤落下。'
                  : '你手上的武器决定攻击方式。鼠标左键挥出武器，鼠标中键呼叫轨道打击。移动、活下来，然后让帝皇之锤落下。'}
              </p>
              <div className="control-grid">
                {isTouch ? (
                  <>
                    <div><span className="keycap">左摇杆</span><b>移动</b><small>按住并拖动，在战场上重新站位。</small></div>
                    <div><span className="keycap">右摇杆</span><b>瞄准 / 攻击 · {weaponStyle.label}</b><small>拖动方向即瞄准方向，推住即持续攻击。</small></div>
                    <div><span className="keycap">轨道按钮</span><b>轨道打击</b><small>朝当前瞄准方向呼叫轨道火力，消耗 1 发配额。</small></div>
                    <div><span className="keycap">闪避按钮</span><b>战术闪避</b><small>短暂无敌。用来穿过弹幕，不是用来赶路。</small></div>
                  </>
                ) : (
                  <>
                    <div><span className="keycap">W A S D</span><b>移动</b><small>在战场上重新站位。别站在光标旁边。</small></div>
                    <div><span className="keycap">鼠标左键</span><b>武器攻击 · {weaponStyle.label}</b><small>{weaponStyle.description}</small></div>
                    <div><span className="keycap">鼠标中键</span><b>轨道打击</b><small>消耗 1 发火力配额。落点有延迟，预判敌群。</small></div>
                    <div><span className="keycap">空格</span><b>战术闪避</b><small>短暂无敌。用来穿过弹幕，不是用来赶路。</small></div>
                    <div><span className="keycap">ESC</span><b>暂停</b><small>随时暂停。撤收会保留已收集的战利品。</small></div>
                  </>
                )}
              </div>
              <div className="protocol-card__note">
                <PixelIcon name="info" size={14} />
                <span>
                  {endless
                    ? '击杀有概率触发「机仆化」。首个补给舱在 0:20 抵达，之后每 2 分钟一次；它会治疗并留下遗产宝箱。'
                    : '击杀有概率触发「机仆化」。被改造的异形会替你战斗，死亡时爆炸。'}
                </span>
              </div>
              <PixelButton variant="primary" size="lg" onClick={startFromTutorial} icon={<PixelIcon name="target" size={17} />}>
                {endless ? '进入无尽战场' : '开始净化'}
              </PixelButton>
            </div>
          </div>
        ) : null}

        {paused && !result && !showTutorial ? (
          <div className="battle-overlay">
            <div className="pause-card">
              <div className="eyebrow">TACTICAL HOLD</div>
              <h2>战斗暂停</h2>
              <p>舰船正在等待你的下一个坐标。</p>
              <div className="pause-stats">
                <div>
                  <span>已击杀</span>
                  <b>{endless ? (hud?.kills ?? 0) : `${hud?.kills ?? 0} / ${hud?.quota ?? 0}`}</b>
                </div>
                <div><span>用时</span><b>{formatDuration(hud?.time ?? 0)}</b></div>
                <div>
                  <span>{endless ? '遗产宝箱' : '连杀'}</span>
                  <b>{endless ? hud?.chests ?? 0 : `×${hud?.combo ?? 0}`}</b>
                </div>
              </div>
              <div className="pause-actions">
                <PixelButton variant="primary" size="lg" onClick={resume} icon={<PixelIcon name="play" size={16} />}>
                  继续战斗
                </PixelButton>
                <PixelButton variant="danger" onClick={retire} icon={<PixelIcon name="arrow" size={15} />}>
                  战术撤收
                </PixelButton>
              </div>
              <div className="pause-note">
                撤收会结算当前遗产宝箱与资源，但本次生存纪录只计算到撤收时刻。
              </div>
            </div>
          </div>
        ) : null}

        {result ? (
          <ResultOverlay
            result={result}
            summary={summary}
            onExit={onExit}
            onRestart={onRestart}
          />
        ) : null}

        {needsRotate && !result && !showTutorial ? (
          <div className="rotate-overlay">
            <div className="rotate-card">
              <div className="rotate-card__icon"><PixelIcon name="target" size={40} /></div>
              <div className="eyebrow">TACTICAL DISPLAY // ROTATE</div>
              <h2>请横屏游玩</h2>
              <p>横屏能获得完整的战场视野，并显示左右双摇杆、轨道与闪避按钮。</p>
              <PixelButton variant="primary" size="lg" onClick={enterLandscape}>
                进入横屏
              </PixelButton>
              <button type="button" className="rotate-skip" onClick={() => setRotateDismissed(true)}>
                仍然竖屏继续
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ResultOverlay({
  result,
  summary,
  onExit,
  onRestart,
}: {
  result: BattleResult;
  summary: BattleRewardSummary | null;
  onExit: () => void;
  onRestart: () => void;
}) {
  const title = result.retreat ? '远征撤收' : '远征终止';
  const accent = '#d7b25e';
  const lootEntries = Object.entries(summary?.resources ?? {}).filter(([, value]) => (value ?? 0) > 0) as Array<
    [ResourceKey, number]
  >;
  return (
    <div className="battle-overlay battle-overlay--result">
      <div className="result-panel" style={{ '--result-accent': accent } as CSSProperties}>
        <div className="result-panel__banner">
          <div className="result-panel__crest">
            <PixelIcon name="chest" size={38} />
          </div>
          <div className="eyebrow">AFTER ACTION REPORT // ENDLESS EXPEDITION</div>
          <h2>{title}</h2>
          <p>
            {result.retreat
              ? '你主动结束了这次远征。舰船回收了所有遗产宝箱，下一位幸存者会继承它们。'
              : '生命信号终止。敌潮仍在继续，但你留下的遗产宝箱已经被舰船封存，等待下一位幸存者。'}
          </p>
        </div>

        <div className="result-panel__body">
          <div className="result-stats">
            <div><span>生存时间</span><b>{formatDuration(result.time)}</b></div>
            <div><span>击杀</span><b>{formatNumber(result.kills)}</b></div>
            <div><span>首领击杀</span><b>{result.bossKills ?? 0}</b></div>
            <div><span>遗产宝箱</span><b>{result.chests ?? 0}</b></div>
            <div><span>轨道打击</span><b>{result.strikes}</b></div>
            <div><span>最高连杀</span><b>×{result.maxCombo}</b></div>
            <div><span>造成伤害</span><b>{formatNumber(result.damageDealt)}</b></div>
            <div><span>机仆化</span><b>{result.servitors}</b></div>
          </div>

          <div className="result-loot">
            <div className="result-section-title">
              <span>战利品</span>
              <Tag color="#d7b25e" filled>遗产宝箱 ×{summary?.chests ?? 0}</Tag>
            </div>
            {summary ? (
              lootEntries.length ? (
                <div className="result-loot__grid">
                  <div className="result-loot__row" style={{ '--resource-color': '#d7b25e' } as CSSProperties}>
                    <PixelIcon name="chest" size={16} />
                    <span>遗产宝箱</span>
                    <b>+{summary.chests ?? 0}</b>
                  </div>
                  {lootEntries.map(([key, value]) => {
                    const meta = RESOURCES[key];
                    return (
                      <div key={key} className="result-loot__row" style={{ '--resource-color': meta.color } as CSSProperties}>
                        <PixelIcon name={meta.icon} size={16} />
                        <span>{meta.name}</span>
                        <b>+{formatNumber(value)}</b>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="muted-text">本次没有带回资源。</div>
              )
            ) : (
              <div className="muted-text">舰船正在清点战利品...</div>
            )}
            {summary?.unlocks.length ? (
              <div className="result-unlocks">
                <PixelIcon name="star" size={15} />
                <span>新系统上线：{summary.unlocks.join('、')}</span>
              </div>
            ) : null}
            {summary?.newAchievements.length ? (
              <div className="result-achievements">
                <PixelIcon name="trophy" size={15} />
                <div>
                  <span>成就达成 ×{summary.newAchievements.length} · 奖励已入库</span>
                  <small>
                    {summary.newAchievements
                      .map((id) => ACHIEVEMENT_BY_ID[id]?.name ?? id)
                      .join(' · ')}
                  </small>
                </div>
              </div>
            ) : null}
          </div>

          <div className="result-items">
            <div className="result-section-title">
              <span>本次回收装备</span>
              <small>{summary?.items.length ?? 0} 件</small>
            </div>
            {summary?.items.length ? (
              <div className="result-item-grid">
                {summary.items.map((item) => (
                  <ItemCard key={item.uid} item={item} compact />
                ))}
              </div>
            ) : (
              <div className="muted-text">本次没有回收到完整装备。</div>
            )}
          </div>
        </div>

        <div className="result-panel__footer">
          <PixelButton variant="ghost" onClick={onExit} icon={<PixelIcon name="arrow" size={15} />}>
            返回战舰
          </PixelButton>
          <div className="result-panel__footer-right">
            <PixelButton
              variant="primary"
              onClick={onRestart}
              icon={<PixelIcon name="play" size={15} />}
            >
              再次挑战
            </PixelButton>
          </div>
        </div>
      </div>
    </div>
  );
}
