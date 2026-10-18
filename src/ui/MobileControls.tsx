import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { HudSkill, HudState, IconName, SkillId } from '../game/types';
import { PixelIcon } from './components/PixelIcon';

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

function Joystick({
  label,
  side,
  onChange,
}: {
  label: string;
  side: 'left' | 'right';
  onChange: (x: number, y: number) => void;
}) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const active = useRef(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const radius = rect.width * 0.34;
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx = (dx / length) * radius;
      dy = (dy / length) * radius;
    }
    const nx = dx / radius;
    const ny = dy / radius;
    setKnob({ x: dx, y: dy });
    onChange(nx, ny);
  };

  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    active.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    update(event);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!active.current) return;
    event.preventDefault();
    update(event);
  };

  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    active.current = false;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div
      ref={baseRef}
      className={`mobile-stick mobile-stick--${side}`}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label={label}
    >
      <span className="mobile-stick__ring" />
      <span
        className="mobile-stick__knob"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
      <small>{label}</small>
    </div>
  );
}

export function MobileControls({
  hud,
  onMove,
  onAim,
  onOrbital,
  onDash,
  onSkill,
}: {
  hud: HudState | null;
  onMove: (x: number, y: number) => void;
  onAim: (x: number, y: number, active: boolean) => void;
  onOrbital: () => void;
  onDash: () => void;
  onSkill: (id: SkillId) => void;
}) {
  const hpRatio = hud ? Math.max(0, Math.min(1, hud.hp / Math.max(1, hud.maxHp))) : 0;
  const skills: HudSkill[] = hud?.skills ?? [];
  return (
    <div className="mobile-controls">
      <div className="mobile-status">
        <div className="mobile-status__top">
          <span><PixelIcon name="shield" size={13} />{hud ? Math.ceil(hud.hp) : 0}/{hud ? Math.ceil(hud.maxHp) : 0}</span>
          <span><PixelIcon name="target" size={13} />{hud?.charges ?? 0}/{hud?.maxCharges ?? 0}</span>
          <span><PixelIcon name="chest" size={13} />{hud?.chests ?? 0}</span>
        </div>
        <div className="mobile-status__bar"><i style={{ width: `${hpRatio * 100}%` }} /></div>
      </div>

      {skills.length > 0 ? (
        <div className="mobile-skills">
          {skills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              className={`mobile-skill ${skill.ready ? 'is-ready' : ''}`}
              style={{ '--skill-color': skill.color } as CSSProperties}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (skill.ready) onSkill(skill.id);
              }}
              disabled={!skill.ready}
              title={skill.name}
            >
              <PixelIcon name={skillIcon(skill.id)} size={20} />
              {!skill.ready ? <span>{Math.ceil(skill.cooldown)}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <Joystick label="移动" side="left" onChange={onMove} />
      <Joystick
        label="瞄准 / 攻击"
        side="right"
        onChange={(x, y) => onAim(x, y, Math.hypot(x, y) > 0.16)}
      />

      <button
        type="button"
        className={`mobile-action mobile-action--orbital ${(hud?.charges ?? 0) <= 0 ? 'is-empty' : ''}`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOrbital();
        }}
        aria-label="轨道打击"
      >
        <PixelIcon name="target" size={22} />
        <span>轨道</span>
        <b>{hud?.charges ?? 0}</b>
      </button>
      <button
        type="button"
        className="mobile-action mobile-action--dash"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDash();
        }}
        aria-label="战术闪避"
      >
        <PixelIcon name="arrow" size={20} />
        <span>闪避</span>
      </button>
    </div>
  );
}
