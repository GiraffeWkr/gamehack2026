import type {
  BattleConfig,
  BattleResult,
  BossDef,
  EnemyDef,
  FactionId,
  HudSkill,
  HudState,
  InstitutionDef,
  PlayerStats,
  ResourceKey,
  SkillDef,
  SkillId,
  StatBlock,
} from '../types';
import { BOSSES, ENEMIES_BY_FACTION, FACTIONS } from '../data/factions';
import { SKILLS } from '../data/institutions';
import { getEnemyDamage, getEnemyHp, getGeltPerKill } from '../meta/save';
import { getWeaponStyle, type WeaponStyle } from '../data/weaponStyles';
import { clamp, hashSeed, mulberry32, pick, randomRange } from '../meta/rng';
import { formatNumber } from '../meta/format';
import { audio } from './audio';
import {
  drawBoss,
  drawDropCrate,
  drawEnemy,
  drawHound,
  drawMedicae,
  drawPlayer,
  drawScarab,
  drawServoSkull,
  drawServitor,
} from './sprites';

const VIEW_W = 960;
const VIEW_H = 540;
const WORLD_W = 2200;
const WORLD_H = 1300;

interface Vec {
  x: number;
  y: number;
}

interface EnemyUnit {
  kind: 'enemy';
  id: number;
  def: EnemyDef;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  damage: number;
  attackCd: number;
  flash: number;
  slowTimer: number;
  elite: boolean;
  gold: boolean;
  anim: number;
  dead: boolean;
  vx: number;
  vy: number;
  spawnT: number;
}

interface BossAction {
  kind: 'slam' | 'volley' | 'charge' | 'summon';
  timer: number;
  total: number;
  dirx: number;
  diry: number;
  fired: boolean;
  charging: boolean;
}

interface BossUnit {
  kind: 'boss';
  id: number;
  bossDef: BossDef;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  damage: number;
  flash: number;
  slowTimer: number;
  anim: number;
  dead: boolean;
  vx: number;
  vy: number;
  action: BossAction | null;
  patternCd: number;
  patternIndex: number;
  enraged: boolean;
  contactCd: number;
}

type Target = EnemyUnit | BossUnit;

interface AllyUnit {
  kind: 'converted' | 'hound' | 'servitor' | 'skull' | 'scarab';
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  attackCd: number;
  life: number;
  maxLife: number;
  radius: number;
  ranged: boolean;
  flash: number;
  angle: number;
  orbitPhase: number;
  dead: boolean;
}

interface PlayerBolt {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  damage: number;
  crit: boolean;
  life: number;
  pierce: number;
  hits: Set<number>;
  color: string;
  radius: number;
  fromSkill: boolean;
  explodeRadius?: number;
  exploded?: boolean;
}

interface EnemyBolt {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  life: number;
  color: string;
  trail: boolean;
}

interface Strike {
  x: number;
  y: number;
  radius: number;
  time: number;
  total: number;
  color: string;
  shells: number;
  index: number;
}

interface Zone {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  tick: number;
  damage: number;
  color: string;
  slow: boolean;
  follow: boolean;
  kind: 'flame' | 'melta' | 'entropy';
}

interface Singularity {
  x: number;
  y: number;
  radius: number;
  time: number;
  duration: number;
  damage: number;
  exploded: boolean;
}

interface Beam {
  x: number;
  y: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
  orbital: boolean;
}

interface WeaponFx {
  x: number;
  y: number;
  angle: number;
  range: number;
  arc: number;
  life: number;
  maxLife: number;
  color: string;
  kind: 'slash' | 'slam' | 'bash' | 'pulse';
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  glow: boolean;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  size: number;
  vy: number;
  crit: boolean;
}

interface Scorch {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  seed: number;
  heavy: boolean;
}

interface Pickup {
  kind: 'medicae' | 'relic';
  x: number;
  y: number;
  life: number;
  bob: number;
  buffId?: string;
}

interface Buff {
  id: string;
  name: string;
  color: string;
  time: number;
  maxTime: number;
  damageMult: number;
  attackSpeedMult: number;
  chargeRateMult: number;
}

interface SkillRuntime {
  def: SkillDef;
  level: number;
  cooldown: number;
  total: number;
}

interface Braziers {
  x: number;
  y: number;
  size: number;
}

export interface BattleCallbacks {
  onHud: (state: HudState) => void;
  onAnnounce: (title: string, subtitle?: string, color?: string) => void;
  onEnd: (result: BattleResult) => void;
}

const MATERIAL_DROPS: Array<{ key: ResourceKey; chance: number; amount: number }> = [
  { key: 'promethium', chance: 0.06, amount: 1 },
  { key: 'plasteel', chance: 0.025, amount: 1 },
  { key: 'ceramite', chance: 0.009, amount: 1 },
  { key: 'adamantium', chance: 0.0018, amount: 1 },
];

export class BattleScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly config: BattleConfig;
  private readonly callbacks: BattleCallbacks;
  private readonly stats: PlayerStats;
  private readonly weaponStyle: WeaponStyle;
  private readonly weaponName: string;
  private readonly rng: () => number;
  private readonly world = { w: WORLD_W, h: WORLD_H };
  private readonly player = {
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    hp: 100,
    maxHp: 100,
    aimAngle: 0,
    moveAngle: 0,
    muzzle: 0,
    recoil: 0,
    dashTime: 0,
    dashCd: 0,
    invuln: 0,
    regenTick: 0,
    lastSpeed: 0,
  };
  private readonly camera = { x: 0, y: 0 };
  private readonly keys = new Set<string>();
  private pointer = { x: VIEW_W / 2, y: VIEW_H / 2 };
  private readonly pointerInside = { value: false };
  private leftDown = false;
  private readonly mobileMove = { x: 0, y: 0 };
  private readonly mobileAim = { x: 1, y: 0 };
  private mobileAimActive = false;
  private mobileAttack = false;
  private weaponFx: WeaponFx[] = [];
  private ground: HTMLCanvasElement | null = null;
  private braziers: Braziers[] = [];
  private smokeVents: Array<{ x: number; y: number; scale: number }> = [];
  private enemies: EnemyUnit[] = [];
  private boss: BossUnit | null = null;
  private allies: AllyUnit[] = [];
  private bolts: PlayerBolt[] = [];
  private enemyBolts: EnemyBolt[] = [];
  private strikes: Strike[] = [];
  private zones: Zone[] = [];
  private singularities: Singularity[] = [];
  private beams: Beam[] = [];
  private shockwaves: Shockwave[] = [];
  private particles: Particle[] = [];
  private floats: FloatText[] = [];
  private scorches: Scorch[] = [];
  private pickups: Pickup[] = [];
  private buffs: Buff[] = [];
  private skills: SkillRuntime[] = [];
  private nextId = 1;
  private charges = 1;
  private chargeAccum = 0;
  private attackTimer = 0;
  private skillTimer = 0;
  private autoStrikeTimer = 0;
  private spawnTimer = 0.25;
  private spawnInterval = 3.6;
  private kills = 0;
  private combo = 0;
  private comboTimer = 0;
  private maxCombo = 0;
  private elapsed = 0;
  private strikesUsed = 0;
  private servitorConversions = 0;
  private damageDealt = 0;
  private eliteKills = 0;
  private goldKills = 0;
  private bossSpawned = false;
  private bossKilled = false;
  private endlessBossAt = 90;
  private endlessBossIndex = 0;
  private endlessBossKills = 0;
  private endlessChests = 0;
  private endlessNextChestAt = 20;
  private ending = false;
  private retreating = false;
  private endTimer = 0;
  private ended = false;
  private paused = false;
  private started = false;
  private raf = 0;
  private lastFrame = 0;
  private hitStop = 0;
  private shake = 0;
  private flash = 0;
  private redFlash = 0;
  private hudTimer = 0;
  private lowHpWarned = false;
  private noAmmoFlash = 0;
  private readonly saveSeed: number;
  private readonly ashMotes = Array.from({ length: 34 }, () => ({
    x: Math.random(),
    y: Math.random(),
    speed: 2 + Math.random() * 8,
    drift: -3 + Math.random() * 6,
    size: Math.random() < 0.72 ? 1 : 2,
    alpha: 0.1 + Math.random() * 0.24,
  }));
  private loot: Partial<Record<ResourceKey, number>> = {};
  private audioIntensity: 'battle' | 'boss' = 'battle';
  private readonly enemyHpMult: number;
  private readonly enemyDamageMult: number;
  private readonly spawnMult: number;

  constructor(canvas: HTMLCanvasElement, config: BattleConfig, callbacks: BattleCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
    this.config = config;
    this.callbacks = callbacks;
    this.stats = config.stats;
    this.weaponStyle = getWeaponStyle(config.weaponType);
    this.weaponName = config.weaponName ?? this.weaponStyle.label;
    this.enemyHpMult = config.enemyHpMult ?? 1;
    this.enemyDamageMult = config.enemyDamageMult ?? 1;
    this.spawnMult = config.spawnMult ?? 1;
    this.charges = this.stats.orbitalCharges;
    this.player.hp = this.stats.maxHp;
    this.player.maxHp = this.stats.maxHp;
    this.saveSeed = config.seed ?? hashSeed(`${config.arenaName}_${Date.now()}`);
    this.rng = mulberry32(this.saveSeed);
    this.skills = config.skills.map((skill, index) => {
      const def = SKILLS[skill.id];
      const total = def.cooldown * this.stats.skillCooldownMult;
      return { def, level: skill.level, cooldown: 1.2 + index * 1.1, total };
    });
    this.buildGround(this.saveSeed);
    this.camera.x = clamp(this.player.x - VIEW_W / 2, 0, this.world.w - VIEW_W);
    this.camera.y = clamp(this.player.y - VIEW_H / 2, 0, this.world.h - VIEW_H);
    this.spawnInterval = Math.max(1.4, 3.2 / this.spawnMult);
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    ctx.imageSmoothingEnabled = false;
    this.lastFrame = performance.now();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.bindEvents();
    audio.startMusic('battle');
    audio.play('battle_start');
    this.audioIntensity = 'battle';
    this.callbacks.onAnnounce(
      `无尽远征 · ${this.config.arenaName}`,
      '敌潮不会停止。活到最后一刻，把遗产宝箱留给下一位幸存者。',
      '#d7b25e',
    );
    this.spawnPack(Math.max(6, Math.round(8 * this.spawnMult)));
    this.raf = requestAnimationFrame(this.frame);
    this.pushHud();
  }

  stop(): void {
    this.started = false;
    cancelAnimationFrame(this.raf);
    this.unbindEvents();
  }

  setPaused(paused: boolean): void {
    if (this.ending) return;
    this.paused = paused;
    this.leftDown = false;
    this.mobileAttack = false;
    this.lastFrame = performance.now();
    this.pushHud();
  }

  isPaused(): boolean {
    return this.paused;
  }

  setMobileMove(x: number, y: number): void {
    const length = Math.hypot(x, y);
    if (length > 1) {
      this.mobileMove.x = x / length;
      this.mobileMove.y = y / length;
    } else {
      this.mobileMove.x = x;
      this.mobileMove.y = y;
    }
  }

  setMobileAim(x: number, y: number, active: boolean): void {
    const length = Math.hypot(x, y);
    if (length > 0.001) {
      this.mobileAim.x = x / length;
      this.mobileAim.y = y / length;
    }
    this.mobileAimActive = active;
    this.mobileAttack = active;
  }

  setMobileAttack(active: boolean): void {
    this.mobileAttack = active;
  }

  castMobileOrbital(): boolean {
    if (this.paused || this.ending) return false;
    const angle = this.mobileAimActive
      ? Math.atan2(this.mobileAim.y, this.mobileAim.x)
      : this.player.aimAngle;
    const distance = 240;
    return this.callStrike(
      this.player.x + Math.cos(angle) * distance,
      this.player.y + Math.sin(angle) * distance,
    );
  }

  triggerDash(): void {
    this.tryDash();
  }

  retreat(): void {
    if (this.ending) return;
    this.paused = false;
    this.leftDown = false;
    this.mobileAttack = false;
    this.lastFrame = performance.now();
    this.retreating = true;
    this.ending = true;
    this.endTimer = 0.45;
    this.strikes = [];
    this.callbacks.onAnnounce('战术撤收', '舰船正在回收你的信标。已收集的补给不会丢失。', '#d7b25e');
    this.pushHud();
  }

  castSkillById(id: SkillId): void {
    if (this.paused || this.ending) return;
    const skill = this.skills.find((s) => s.def.id === id);
    if (!skill) return;
    if (skill.cooldown > 0) {
      audio.play('ui_error');
      return;
    }
    if (this.castSkill(skill)) {
      skill.cooldown = skill.total;
      audio.play(this.skillSound(skill.def.id));
      this.pushHud();
    }
  }

  private skillSound(id: SkillId): string {
    const map: Record<SkillId, string> = {
      bolt_volley: 'skill_volley',
      rapid_fire: 'skill_buff',
      melta_bomb: 'skill_bomb',
      mech_hound: 'skill_summon',
      combat_servitor: 'skill_summon',
      servo_skull: 'summon',
      deadshot: 'skill_sniper',
      piercing_round: 'skill_piercing',
      reapers_eye: 'skill_execute',
      flame_verse: 'skill_flame',
      lightning_verse: 'skill_chain',
      frost_verse: 'skill_frost',
      scarab_swarm: 'skill_scarab',
      entropy_field: 'skill_entropy',
      singularity: 'skill_singularity',
    };
    return map[id] ?? 'skill';
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  private unbindEvents(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }

  private onContextMenu = (event: Event) => {
    event.preventDefault();
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (this.paused || this.ending) return;
    const code = event.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      event.preventDefault();
      this.keys.add(code);
    }
    if (code === 'Space' || code === 'ShiftLeft') {
      event.preventDefault();
      this.tryDash();
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private onPointerMove = (event: PointerEvent) => {
    this.updatePointer(event);
    this.pointerInside.value = true;
  };

  private onPointerLeave = () => {
    this.pointerInside.value = false;
    this.leftDown = false;
  };

  private onPointerUp = (event: PointerEvent) => {
    if (event.button === 0) this.leftDown = false;
  };

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    this.updatePointer(event);
    if (this.paused || this.ending) return;
    if (event.button === 1) {
      const world = this.screenToWorld(this.pointer.x, this.pointer.y);
      this.callStrike(world.x, world.y);
      return;
    }
    this.leftDown = true;
    this.tryBasicAttack();
  };

  private updatePointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointer.x = clamp(((event.clientX - rect.left) / rect.width) * VIEW_W, 0, VIEW_W);
    this.pointer.y = clamp(((event.clientY - rect.top) / rect.height) * VIEW_H, 0, VIEW_H);
  }

  private screenToWorld(x: number, y: number): Vec {
    return { x: x + this.camera.x, y: y + this.camera.y };
  }

  private frame = (now: number) => {
    if (!this.started) return;
    const rawDt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (!this.paused) {
      if (this.hitStop > 0) {
        this.hitStop = Math.max(0, this.hitStop - rawDt);
        this.updateEffects(rawDt * 0.35);
      } else if (this.ending) {
        this.updateEnding(rawDt);
      } else {
        this.update(rawDt);
      }
    }
    this.render();
    this.hudTimer += rawDt;
    if (this.hudTimer >= 0.1) {
      this.hudTimer = 0;
      this.pushHud();
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  // ============================================================
  // Update
  // ============================================================

  private update(dt: number): void {
    this.elapsed += dt;
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.combo = 0;
    this.autoStrikeTimer = Math.max(0, this.autoStrikeTimer - dt);
    this.player.muzzle = Math.max(0, this.player.muzzle - dt * 8);
    this.player.recoil = Math.max(0, this.player.recoil - dt * 14);
    this.player.dashCd = Math.max(0, this.player.dashCd - dt);
    this.player.dashTime = Math.max(0, this.player.dashTime - dt);
    this.player.invuln = Math.max(0, this.player.invuln - dt);
    this.player.regenTick += dt;
    this.noAmmoFlash = Math.max(0, this.noAmmoFlash - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.redFlash = Math.max(0, this.redFlash - dt * 4);
    this.shake = Math.max(0, this.shake - dt * 30);

    this.updateBuffs(dt);
    this.updatePlayerMovement(dt);
    this.updatePlayerAim(dt);
    this.updateBasicAttack(dt);
    this.updateCharge(dt);
    this.updateSkills(dt);
    this.updateSpawns(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateAllies(dt);
    this.updatePlayerBolts(dt);
    this.updateEnemyBolts(dt);
    this.updateStrikes(dt);
    this.updateZones(dt);
    this.updateSingularities(dt);
    this.updatePickups(dt);
    this.updateEffects(dt);
    this.updateCamera(dt);
    this.checkProgress();
    if (this.player.hp < this.player.maxHp * 0.25 && !this.lowHpWarned && !this.ending) {
      this.lowHpWarned = true;
      this.callbacks.onAnnounce('生命维持临界', '建议立即使用闪避，或呼叫一次轨道打击清场。', '#e15a4e');
      audio.play('warning');
    }
    if (this.player.hp <= 0 && !this.ending) {
      this.beginDefeat();
    }
  }

  private updateEnding(dt: number): void {
    this.endTimer -= dt;
    this.shake = Math.max(0, this.shake - dt * 22);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.redFlash = Math.max(0, this.redFlash - dt * 3);
    this.updateEffects(dt * 0.55);
    this.updateCamera(dt);
    this.updateBuffs(dt);
    if (this.endTimer <= 0 && !this.ended) this.finish();
  }

  private updateBuffs(dt: number): void {
    for (const buff of this.buffs) buff.time -= dt;
    this.buffs = this.buffs.filter((buff) => buff.time > 0);
    if (this.hasBuff('entropy')) {
      this.entropyTick -= dt;
      if (this.entropyTick <= 0) {
        this.entropyTick = 0.5;
        this.damageArea(
          this.player.x,
          this.player.y,
          170 * this.stats.areaMult,
          this.stats.damage * 1.8 * this.stats.skillDamageMult,
          { color: '#6ad6b0', slow: true, source: 'entropy' },
        );
        this.spawnRing(this.player.x, this.player.y, 170 * this.stats.areaMult, '#6ad6b0', 0.3);
      }
    }
  }

  private entropyTick = 0;

  private updatePlayerMovement(dt: number): void {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    dx += this.mobileMove.x;
    dy += this.mobileMove.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
      this.player.moveAngle = Math.atan2(dy, dx);
    }
    const dashing = this.player.dashTime > 0;
    const speed = this.stats.moveSpeed * (dashing ? 3.3 : 1);
    this.player.lastSpeed = len > 0 ? speed : 0;
    this.player.x = clamp(this.player.x + dx * speed * dt, 80, this.world.w - 80);
    this.player.y = clamp(this.player.y + dy * speed * dt, 80, this.world.h - 80);

    if (dashing) {
      if (Math.random() < 0.65) {
        this.addParticle(this.player.x, this.player.y - 20, randomRange(-20, 20), randomRange(-30, 10), 0.35, 2, '#6b7d82', false);
      }
      this.player.invuln = Math.max(this.player.invuln, 0.12);
    }

    this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.stats.regen * dt);
  }

  private updatePlayerAim(dt: number): void {
    const target = this.findNearestTarget(
      this.player.x,
      this.player.y,
      this.stats.range + 12,
      true,
    );
    let desired = this.player.aimAngle;
    if (this.mobileAimActive) {
      desired = Math.atan2(this.mobileAim.y, this.mobileAim.x);
    } else if (this.pointerInside.value) {
      const worldPointer = this.screenToWorld(this.pointer.x, this.pointer.y);
      if (Math.hypot(worldPointer.x - this.player.x, worldPointer.y - this.player.y) > 20) {
        desired = Math.atan2(
          worldPointer.y - this.player.y,
          worldPointer.x - this.player.x,
        );
      }
    } else if (target) {
      desired = Math.atan2(target.y - this.player.y, target.x - this.player.x);
    } else if (this.player.lastSpeed > 0) {
      desired = this.player.moveAngle;
    }
    const delta = Math.atan2(
      Math.sin(desired - this.player.aimAngle),
      Math.cos(desired - this.player.aimAngle),
    );
    const turnRate = this.mobileAimActive
      ? 24
      : this.pointerInside.value
        ? 18
        : target
          ? 12
          : 8;
    this.player.aimAngle += clamp(delta, -turnRate * dt, turnRate * dt);
  }

  private tryDash(): void {
    if (this.player.dashCd > 0 || this.ending) return;
    this.player.dashCd = 2.15;
    this.player.dashTime = 0.17;
    this.player.invuln = Math.max(this.player.invuln, 0.3);
    audio.play('dash');
    this.spawnBurst(this.player.x, this.player.y - 12, '#7d9194', 8, 45, 2);
    this.pushHud();
  }

  private getDamageMult(): number {
    return this.buffs.reduce((mult, buff) => mult * buff.damageMult, 1);
  }

  private getAttackSpeedMult(): number {
    return this.buffs.reduce((mult, buff) => mult * buff.attackSpeedMult, 1);
  }

  private getChargeRateMult(): number {
    return this.buffs.reduce((mult, buff) => mult * buff.chargeRateMult, 1);
  }

  private updateBasicAttack(dt: number): void {
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    if ((this.leftDown || this.mobileAttack) && this.attackTimer <= 0) this.performWeaponAttack();
  }

  private aimPoint(): Vec {
    if (this.mobileAimActive) {
      return {
        x: this.player.x + this.mobileAim.x * 240,
        y: this.player.y + this.mobileAim.y * 240,
      };
    }
    if (this.pointerInside.value) {
      return this.screenToWorld(this.pointer.x, this.pointer.y);
    }
    const target = this.findNearestTarget(this.player.x, this.player.y, 420, true);
    if (target) return { x: target.x, y: target.y };
    return {
      x: this.player.x + Math.cos(this.player.aimAngle) * 120,
      y: this.player.y + Math.sin(this.player.aimAngle) * 120,
    };
  }

  private rollWeaponDamage(mult = 1): { damage: number; crit: boolean } {
    let damage = this.stats.damage * this.weaponStyle.damageMult * mult * this.getDamageMult();
    const crit = Math.random() < this.stats.critChance;
    const double = !crit && Math.random() < this.stats.doubleChance;
    const triple = !crit && !double && Math.random() < this.stats.tripleChance;
    if (crit) damage *= this.stats.critDamage;
    if (double) damage *= 2;
    if (triple) damage *= 3;
    return { damage, crit };
  }

  private damageCone(
    angle: number,
    range: number,
    arc: number,
    color: string,
    knockback = 0,
  ): number {
    let hits = 0;
    const targets: Target[] = [...this.enemies];
    if (this.boss && !this.boss.dead) targets.push(this.boss);
    for (const target of targets) {
      if (target.dead) continue;
      const dx = target.x - this.player.x;
      const dy = target.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist - target.radius > range) continue;
      const diff = Math.abs(
        Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle)),
      );
      if (diff > arc / 2 + Math.atan2(target.radius, Math.max(1, dist))) continue;
      const roll = this.rollWeaponDamage(1);
      this.damageTarget(target, roll.damage, {
        crit: roll.crit,
        source: 'weapon',
        color,
        showText: true,
      });
      if (knockback > 0 && target.kind === 'enemy') {
        target.vx += Math.cos(angle) * knockback;
        target.vy += Math.sin(angle) * knockback;
      }
      this.spawnBurst(target.x, target.y - target.radius * 0.4, color, 5, 75, 2);
      hits += 1;
    }
    return hits;
  }

  private tryBasicAttack(): void {
    if (this.attackTimer <= 0) this.performWeaponAttack();
  }

  private performWeaponAttack(): boolean {
    if (this.paused || this.ending || this.attackTimer > 0) return false;
    const aim = this.aimPoint();
    const aimDistance = Math.hypot(aim.x - this.player.x, aim.y - this.player.y);
    const angle = aimDistance < 24
      ? this.player.aimAngle
      : Math.atan2(aim.y - this.player.y, aim.x - this.player.x);
    const style = this.weaponStyle;
    const interval =
      (this.stats.attackInterval * style.cooldownMult) /
      Math.max(0.25, this.getAttackSpeedMult());
    this.attackTimer = interval;
    this.player.aimAngle = angle;
    this.player.recoil = 1;
    this.player.muzzle = 1;

    const facing = Math.cos(angle) >= 0 ? 1 : -1;
    const muzzleX = this.player.x + facing * 6 + Math.cos(angle) * 32;
    const muzzleY = this.player.y - 28 + Math.sin(angle) * 32;

    switch (style.id) {
      case 'chainsword': {
        this.damageCone(angle, 112, Math.PI * 0.92, style.color, 55);
        this.weaponFx.push({
          x: this.player.x,
          y: this.player.y - 24,
          angle,
          range: 112,
          arc: Math.PI * 0.92,
          life: 0.22,
          maxLife: 0.22,
          color: style.color,
          kind: 'slash',
        });
        this.shake = Math.max(this.shake, 1.8);
        audio.play('chainsword');
        break;
      }
      case 'thunder_hammer': {
        const impactDist = clamp(Math.hypot(aim.x - this.player.x, aim.y - this.player.y), 30, 120);
        const impactX = this.player.x + Math.cos(angle) * impactDist;
        const impactY = this.player.y - 18 + Math.sin(angle) * impactDist;
        this.damageArea(
          impactX,
          impactY,
          68,
          this.stats.damage * style.damageMult * this.getDamageMult(),
          { color: style.color, slow: false, source: 'weapon' },
        );
        this.weaponFx.push({
          x: impactX,
          y: impactY,
          angle,
          range: 68,
          arc: Math.PI * 2,
          life: 0.34,
          maxLife: 0.34,
          color: style.color,
          kind: 'slam',
        });
        this.shockwaves.push({
          x: impactX,
          y: impactY,
          radius: 8,
          maxRadius: 88,
          life: 0.4,
          maxLife: 0.4,
          color: style.color,
          width: 5,
        });
        this.spawnBurst(impactX, impactY, style.color, 22, 150, 3);
        this.shake = Math.max(this.shake, 5);
        this.hitStop = 0.04;
        audio.play('hammer');
        break;
      }
      case 'storm_shield': {
        this.damageCone(angle, 96, Math.PI * 0.7, style.color, 190);
        this.player.invuln = Math.max(this.player.invuln, 0.22);
        this.weaponFx.push({
          x: this.player.x,
          y: this.player.y - 22,
          angle,
          range: 96,
          arc: Math.PI * 0.7,
          life: 0.28,
          maxLife: 0.28,
          color: style.color,
          kind: 'bash',
        });
        this.addFloat(this.player.x, this.player.y - 70, '格挡', style.color, 12, 0.8, false);
        this.shake = Math.max(this.shake, 2.5);
        audio.play('shield');
        break;
      }
      case 'plasma_gun': {
        const roll = this.rollWeaponDamage(1);
        this.bolts.push({
          x: muzzleX,
          y: muzzleY,
          px: muzzleX - Math.cos(angle) * 24,
          py: muzzleY - Math.sin(angle) * 24,
          vx: Math.cos(angle) * 540,
          vy: Math.sin(angle) * 540,
          damage: roll.damage,
          crit: roll.crit,
          life: 1.5,
          pierce: 0,
          hits: new Set(),
          color: style.color,
          radius: 5,
          fromSkill: false,
          explodeRadius: 68,
        });
        this.shake = Math.max(this.shake, 2.2);
        audio.play('plasma');
        break;
      }
      case 'melta_gun': {
        const endX = this.player.x + Math.cos(angle) * 205;
        const endY = this.player.y - 24 + Math.sin(angle) * 205;
        this.beams.push({
          x: muzzleX,
          y: muzzleY,
          x2: endX,
          y2: endY,
          life: 0.18,
          maxLife: 0.18,
          color: style.color,
          width: 4,
          orbital: false,
        });
        this.damageCone(angle, 205, Math.PI * 0.34, style.color, 30);
        this.spawnBurst(endX, endY, style.color, 16, 110, 3);
        this.shake = Math.max(this.shake, 3.2);
        audio.play('melta');
        break;
      }
      case 'banner': {
        this.damageArea(
          this.player.x,
          this.player.y,
          118,
          this.stats.damage * style.damageMult * this.getDamageMult(),
          { color: style.color, slow: false, source: 'weapon' },
        );
        this.addBuff('banner', '战旗鼓舞', style.color, 3, 1.22, 1.15, 1);
        this.weaponFx.push({
          x: this.player.x,
          y: this.player.y - 20,
          angle,
          range: 118,
          arc: Math.PI * 2,
          life: 0.45,
          maxLife: 0.45,
          color: style.color,
          kind: 'pulse',
        });
        this.shockwaves.push({
          x: this.player.x,
          y: this.player.y,
          radius: 6,
          maxRadius: 126,
          life: 0.45,
          maxLife: 0.45,
          color: style.color,
          width: 4,
        });
        this.addFloat(this.player.x, this.player.y - 78, '鼓舞', style.color, 13, 1, false);
        audio.play('banner');
        break;
      }
      default:
        break;
    }
    return true;
  }

  private updateCharge(dt: number): void {
    const max = this.stats.orbitalCharges;
    if (this.charges < max) {
      this.chargeAccum += (dt / this.stats.orbitalRecharge) * this.getChargeRateMult();
      let gained = false;
      while (this.chargeAccum >= 1 && this.charges < max) {
        this.charges += 1;
        this.chargeAccum -= 1;
        gained = true;
      }
      if (gained && this.charges >= max) {
        audio.play('strike_ready', { volume: 0.55, pan: -0.25 });
      }
    } else {
      this.chargeAccum = 0;
    }
    if (this.stats.autoStrike && this.charges >= 1 && this.autoStrikeTimer <= 0) {
      const cluster = this.findDensestCluster(320, this.boss ? 1 : 3);
      if (cluster) {
        this.callStrike(cluster.x, cluster.y, true);
        this.autoStrikeTimer = 1.1;
      }
    }
  }

  private callStrike(x: number, y: number, automatic = false): boolean {
    if (this.ending || this.paused) return false;
    if (this.charges < 1) {
      this.noAmmoFlash = 1;
      audio.play('ui_error');
      return false;
    }
    this.charges -= 1;
    if (this.charges >= this.stats.orbitalCharges) this.chargeAccum = 0;
    this.strikesUsed += 1;
    const shells = this.stats.orbitalShells;
    for (let i = 0; i < shells; i++) {
      const spread = shells > 1 ? 36 : 0;
      const angle = (i / Math.max(1, shells)) * Math.PI * 2;
      const offset = i === 0 ? 0 : randomRange(10, spread);
      this.strikes.push({
        x: clamp(x + Math.cos(angle) * offset, 20, this.world.w - 20),
        y: clamp(y + Math.sin(angle) * offset, 20, this.world.h - 20),
        radius: this.stats.orbitalRadius,
        time: 0.82 + i * 0.13,
        total: 0.82 + i * 0.13,
        color: this.weaponStrikeColor(),
        shells,
        index: i,
      });
    }
    const pan = clamp((x - this.player.x) / 480, -1, 1);
    audio.play('orbital_call', { volume: automatic ? 0.55 : 0.9, pan });
    window.setTimeout(() => audio.play('orbital_incoming', { volume: 0.65, pan }), 420);
    this.spawnBurst(x, y, this.weaponStrikeColor(), 8, 25, 2);
    if (!automatic) this.playerInvoke();
    this.pushHud();
    return true;
  }

  private playerInvoke(): void {
    // a tiny feedback pulse at the player; deliberately subtle
    this.addParticle(this.player.x, this.player.y - 28, 0, -20, 0.3, 2, '#e7c27a', true);
  }

  private weaponStrikeColor(): string {
    const type = this.config.weaponType ?? this.equippedWeaponTypeName();
    switch (type) {
      case 'chainsword':
        return '#e06b52';
      case 'thunder_hammer':
        return '#ffb24a';
      case 'storm_shield':
        return '#d8c06b';
      case 'plasma_gun':
        return '#63d6e3';
      case 'melta_gun':
        return '#f08a55';
      case 'banner':
        return '#c08ae8';
      default:
        return '#ffb24a';
    }
  }

  private equippedWeaponTypeName(): string {
    // The engine only receives combat stats, so derive a stable visual colour from the institution.
    return this.config.institution.id === 'telepathica'
      ? 'banner'
      : this.config.institution.id === 'necron'
        ? 'plasma_gun'
        : this.config.institution.id === 'mechanicus'
          ? 'melta_gun'
          : 'thunder_hammer';
  }

  private updateStrikes(dt: number): void {
    for (const strike of this.strikes) strike.time -= dt;
    const landed = this.strikes.filter((strike) => strike.time <= 0);
    if (landed.length) {
      this.strikes = this.strikes.filter((strike) => strike.time > 0);
      for (const strike of landed) this.detonateStrike(strike);
    }
  }

  private detonateStrike(strike: Strike): void {
    this.beams.push({
      x: strike.x,
      y: strike.y,
      x2: strike.x,
      y2: strike.y,
      life: 0.58,
      maxLife: 0.58,
      color: strike.color,
      width: strike.radius * 0.15,
      orbital: true,
    });
    this.shockwaves.push({
      x: strike.x,
      y: strike.y,
      radius: 8,
      maxRadius: strike.radius * 2.6,
      life: 0.5,
      maxLife: 0.5,
      color: strike.color,
      width: 8,
    });
    this.shockwaves.push({
      x: strike.x,
      y: strike.y,
      radius: 4,
      maxRadius: strike.radius * 1.25,
      life: 0.3,
      maxLife: 0.3,
      color: '#fff4c9',
      width: 3,
    });
    this.scorches.push({
      x: strike.x,
      y: strike.y,
      radius: strike.radius * 0.95,
      life: 7,
      maxLife: 7,
      seed: Math.floor(this.rng() * 10000),
      heavy: true,
    });
    this.spawnBurst(strike.x, strike.y, strike.color, 30, 220, 3);
    this.spawnBurst(strike.x, strike.y, '#fff2c4', 12, 120, 2);
    for (let i = 0; i < 8; i++) {
      this.addParticle(
        strike.x + randomRange(-strike.radius, strike.radius),
        strike.y + randomRange(-strike.radius, strike.radius),
        randomRange(-15, 15),
        randomRange(-50, -15),
        randomRange(0.5, 1.2),
        randomRange(2, 4),
        '#4d4a42',
        true,
      );
    }
    const targets = this.getTargetsInRadius(strike.x, strike.y, strike.radius, true);
    const limited = targets.slice(0, this.stats.orbitalHits);
    let hit = 0;
    for (const target of limited) {
      const base = this.stats.damage * this.stats.orbitalDamageMult * this.getDamageMult() * randomRange(0.94, 1.06);
      const isCrit = Math.random() < this.stats.critChance;
      let amount = base;
      if (isCrit) amount *= this.stats.critDamage;
      if (Math.random() < this.stats.doubleChance) amount *= 2;
      if (Math.random() < this.stats.tripleChance) amount *= 3;
      this.damageTarget(target, amount, { crit: isCrit, source: 'orbital', color: strike.color, showText: hit < 10 });
      hit++;
    }
    this.shake = Math.max(this.shake, 11);
    this.flash = Math.max(this.flash, 0.22);
    this.hitStop = Math.max(this.hitStop, 0.052);
    this.redFlash = Math.max(this.redFlash, 0.05);
    audio.play('orbital_hit', { volume: 0.95, pan: clamp((strike.x - this.player.x) / 480, -1, 1) });
    if (hit >= 6) {
      this.addFloat(strike.x, strike.y - 30, `净化 ×${hit}`, '#ffd37e', 14, 0.8, false);
    }
    this.pushHud();
  }

  private updateSpawns(dt: number): void {
    if (this.ending) return;
    this.updateEndlessSpawns(dt);
  }

  private updateEndlessSpawns(dt: number): void {
    this.spawnTimer -= dt;
    const minutes = this.elapsed / 60;
    const maxEnemies = Math.min(190, Math.round((58 + minutes * 13) * this.spawnMult));
    this.spawnInterval = Math.max(0.5, (3.0 - minutes * 0.2) / this.spawnMult);
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval + randomRange(-0.18, 0.26);
      if (this.enemies.length < maxEnemies) {
        const count = Math.min(
          maxEnemies - this.enemies.length,
          Math.max(
            5,
            Math.round((5.2 + minutes * 1.6 + randomRange(0, 2.3)) * this.spawnMult),
          ),
        );
        this.spawnPack(count);
      }
    }
    if (this.boss && !this.boss.dead) {
      if (this.enemies.length < maxEnemies * 0.5 && this.spawnTimer < 0.3) {
        this.spawnPack(2);
        this.spawnTimer = 1.1;
      }
    }
    if (this.elapsed >= this.endlessNextChestAt) {
      this.endlessNextChestAt += 120;
      this.endlessChests += 1;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.15);
      this.callbacks.onAnnounce('补给舱已回收', '舰队打捞出一只遗产宝箱，并注入一剂急救合剂。', '#d7b25e');
      audio.play('achievement', { volume: 0.6 });
      this.addFloat(this.player.x, this.player.y - 70, '遗产宝箱 +1 · 生命恢复', '#ffd37e', 13, 1.1, false);
      this.spawnBurst(this.player.x, this.player.y - 20, '#8fe0a0', 20, 80, 2);
      this.pushHud();
    }
  }

  private endlessHpScale(): number {
    return 1 + this.elapsed / 110 + Math.pow(this.elapsed / 420, 2) * 0.6;
  }

  private endlessDamageScale(): number {
    return 1 + this.elapsed / 220;
  }

  private endlessFactions(): FactionId[] {
    const minutes = this.elapsed / 60;
    if (minutes < 2) return ['orks'];
    if (minutes < 4) return ['orks', 'tyranids'];
    if (minutes < 6.5) return ['orks', 'chaos', 'tyranids'];
    if (minutes < 9) return ['chaos', 'tau', 'tyranids'];
    return ['chaos', 'tau', 'thousand', 'tyranids'];
  }

  private spawnPack(count: number): void {
    for (let i = 0; i < count; i++) {
      const def = this.pickEnemyDef();
      const angle = randomRange(0, Math.PI * 2);
      const distance = randomRange(330, 580);
      let x = this.player.x + Math.cos(angle) * distance;
      let y = this.player.y + Math.sin(angle) * distance;
      x = clamp(x, 70, this.world.w - 70);
      y = clamp(y, 70, this.world.h - 70);
      if (Math.hypot(x - this.player.x, y - this.player.y) < 220) {
        x = clamp(this.player.x + Math.cos(angle + Math.PI) * 420, 70, this.world.w - 70);
        y = clamp(this.player.y + Math.sin(angle + Math.PI) * 420, 70, this.world.h - 70);
      }
      this.spawnEnemy(def, x, y);
    }
  }

  private pickEnemyDef(): EnemyDef {
    const factions = this.endlessFactions();
    const faction = factions[Math.floor(this.rng() * factions.length)];
    const pool = ENEMIES_BY_FACTION[faction] ?? ENEMIES_BY_FACTION.orks;
    const eliteChance = Math.min(0.3, 0.05 + (this.elapsed / 60) * 0.014);
    const elites = pool.filter((e) => e.elite);
    let basics = pool.filter((e) => !e.elite);
    // Give the first minute a melee-only grace period: the player needs room to
    // learn movement before looted shootas start cross-firing.
    if (this.elapsed < 60) {
      const melee = basics.filter((e) => !e.ranged);
      if (melee.length) basics = melee;
    }
    if (this.rng() < eliteChance && elites.length) return pick(elites);
    return pick(basics.length ? basics : pool);
  }

  private spawnEnemy(def: EnemyDef, x: number, y: number, bossAdd = false): EnemyUnit {
    const gold =
      !bossAdd &&
      this.rng() < Math.min(0.08, 0.026 + (this.elapsed / 60) * 0.0018);
    const hpMult =
      def.hpMult *
      (gold ? 2.4 : 1) *
      this.enemyHpMult *
      this.endlessHpScale();
    const hp = getEnemyHp(hpMult);
    const enemy: EnemyUnit = {
      kind: 'enemy',
      id: this.nextId++,
      def,
      x,
      y,
      hp,
      maxHp: hp,
      radius: def.radius * (gold ? 1.15 : 1),
      speed: def.speed,
      damage:
        getEnemyDamage(def.damageMult) *
        (gold ? 1.15 : 1) *
        this.enemyDamageMult *
        this.endlessDamageScale(),
      attackCd: randomRange(0.4, 1.4),
      flash: 0,
      slowTimer: 0,
      elite: !!def.elite,
      gold,
      anim: this.rng() * 100,
      dead: false,
      vx: 0,
      vy: 0,
      spawnT: 0.5,
    };
    this.enemies.push(enemy);
    this.spawnBurst(x, y, gold ? '#ffd36b' : FACTIONS[def.faction].color, 7, 40, 2);
    if (gold) {
      this.addFloat(x, y - 38, '混沌赐福', '#ffd36b', 11, 0.9, false);
    }
    return enemy;
  }

  private updateEnemies(dt: number): void {
    const player = this.player;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.flash = Math.max(0, enemy.flash - dt * 8);
      enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
      enemy.attackCd -= dt;
      enemy.anim += dt;
      enemy.spawnT = Math.max(0, enemy.spawnT - dt);
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      const slowFactor = enemy.slowTimer > 0 ? 0.58 : 1;
      let moveX = 0;
      let moveY = 0;
      if (enemy.def.ranged) {
        const preferred = enemy.def.attackRange * 0.72;
        if (dist > enemy.def.attackRange * 0.95) {
          moveX = dx / dist;
          moveY = dy / dist;
        } else if (dist < preferred * 0.62) {
          moveX = -dx / dist;
          moveY = -dy / dist;
        } else {
          moveX = (-dy / dist) * 0.35;
          moveY = (dx / dist) * 0.35;
        }
        if (dist < enemy.def.attackRange && enemy.attackCd <= 0) {
          enemy.attackCd = enemy.def.attackCooldown;
          this.fireEnemyBolt(enemy.x, enemy.y - 16, player.x, player.y - 18, enemy.damage, enemy.def);
        }
      } else {
        if (dist > enemy.def.attackRange + 10) {
          moveX = dx / dist;
          moveY = dy / dist;
        }
        if (dist < enemy.def.attackRange + playerRadius() + enemy.radius && enemy.attackCd <= 0) {
          enemy.attackCd = enemy.def.attackCooldown;
          this.damagePlayer(enemy.damage);
          this.spawnBurst(player.x, player.y - 20, '#b9433f', 4, 30, 2);
        }
      }
      enemy.vx += moveX * enemy.speed * slowFactor * dt * 2.5;
      enemy.vy += moveY * enemy.speed * slowFactor * dt * 2.5;
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.x = clamp(enemy.x, 30, this.world.w - 30);
      enemy.y = clamp(enemy.y, 30, this.world.h - 30);
    }
    this.separateEnemies();
    this.enemies = this.enemies.filter((enemy) => !enemy.dead);
  }

  private separateEnemies(): void {
    const enemies = this.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = (a.radius + b.radius) * 0.85;
        const distSq = dx * dx + dy * dy;
        if (distSq > 0.01 && distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const push = ((minDist - dist) / dist) * 0.45;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
  }

  private fireEnemyBolt(x: number, y: number, tx: number, ty: number, damage: number, def: EnemyDef): void {
    const angle = Math.atan2(ty - y, tx - x);
    const speed = def.projectileSpeed || 190;
    this.enemyBolts.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage,
      radius: 5,
      life: 4,
      color: def.faction === 'tau' ? '#8ce7f0' : def.faction === 'thousand' ? '#cb9bff' : '#e57858',
      trail: true,
    });
    audio.play('enemy_bolt', { volume: 0.45 });
  }

  private updateEnemyBolts(dt: number): void {
    for (const bolt of this.enemyBolts) {
      bolt.life -= dt;
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      if (
        bolt.life > 0 &&
        this.player.invuln <= 0 &&
        Math.hypot(bolt.x - this.player.x, bolt.y - (this.player.y - 18)) <
          bolt.radius + playerRadius() + 2
      ) {
        this.damagePlayer(bolt.damage);
        this.spawnBurst(bolt.x, bolt.y, bolt.color, 8, 55, 2);
        bolt.life = 0;
        continue;
      }
      for (const ally of this.allies) {
        if (bolt.life <= 0) break;
        if (Math.hypot(bolt.x - ally.x, bolt.y - (ally.y - 12)) < ally.radius + bolt.radius) {
          this.damageAlly(ally, bolt.damage);
          this.spawnBurst(bolt.x, bolt.y, '#6b9f94', 5, 30, 2);
          bolt.life = 0;
        }
      }
    }
    this.enemyBolts = this.enemyBolts.filter(
      (bolt) =>
        bolt.life > 0 &&
        bolt.x > -100 &&
        bolt.x < this.world.w + 100 &&
        bolt.y > -100 &&
        bolt.y < this.world.h + 100,
    );
  }

  private updatePlayerBolts(dt: number): void {
    const boss = this.boss;
    for (const bolt of this.bolts) {
      bolt.life -= dt;
      bolt.px = bolt.x;
      bolt.py = bolt.y;
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      for (const enemy of this.enemies) {
        if (enemy.dead || bolt.hits.has(enemy.id)) continue;
        if (Math.hypot(bolt.x - enemy.x, bolt.y - (enemy.y - enemy.radius * 0.55)) < enemy.radius + bolt.radius) {
          bolt.hits.add(enemy.id);
          this.damageTarget(enemy, bolt.damage, {
            crit: bolt.crit,
            source: 'bolter',
            showText: true,
          });
          this.spawnBurst(bolt.x, bolt.y, bolt.color, 4, 40, 1.5);
          this.explodePlayerBolt(bolt);
          if (bolt.hits.size > bolt.pierce) {
            bolt.life = 0;
            break;
          }
        }
      }
      if (bolt.life <= 0) continue;
      if (boss && !boss.dead && !bolt.hits.has(boss.id)) {
        if (Math.hypot(bolt.x - boss.x, bolt.y - (boss.y - boss.radius * 0.45)) < boss.radius + bolt.radius) {
          bolt.hits.add(boss.id);
          this.damageTarget(boss, bolt.damage, {
            crit: bolt.crit,
            source: 'bolter',
            showText: true,
          });
          this.spawnBurst(bolt.x, bolt.y, bolt.color, 4, 40, 1.5);
          this.explodePlayerBolt(bolt);
          if (bolt.hits.size > bolt.pierce) bolt.life = 0;
        }
      }
    }
    this.bolts = this.bolts.filter((bolt) => bolt.life > 0);
  }

  private explodePlayerBolt(bolt: PlayerBolt): void {
    if (!bolt.explodeRadius || bolt.exploded) return;
    bolt.exploded = true;
    const radius = bolt.explodeRadius;
    this.damageArea(bolt.x, bolt.y, radius, bolt.damage * 0.72, {
      color: bolt.color,
      slow: false,
      source: 'weapon',
    });
    this.shockwaves.push({
      x: bolt.x,
      y: bolt.y,
      radius: 5,
      maxRadius: radius,
      life: 0.28,
      maxLife: 0.28,
      color: bolt.color,
      width: 4,
    });
    this.spawnBurst(bolt.x, bolt.y, bolt.color, 18, 120, 3);
    this.shake = Math.max(this.shake, 2.5);
    audio.play('plasma_burst');
  }

  private updateAllies(dt: number): void {
    for (const ally of this.allies) {
      if (ally.dead) continue;
      ally.life -= dt;
      ally.flash = Math.max(0, ally.flash - dt * 8);
      if (ally.life <= 0 || ally.hp <= 0) {
        this.explodeAlly(ally);
        continue;
      }
      ally.attackCd -= dt;
      const target = this.findNearestTarget(ally.x, ally.y, ally.kind === 'skull' ? 250 : 330, true);
      if (ally.kind === 'skull') {
        ally.orbitPhase += dt * 1.4;
        const tx = this.player.x + Math.cos(ally.orbitPhase) * 62;
        const ty = this.player.y - 35 + Math.sin(ally.orbitPhase) * 30;
        ally.x += (tx - ally.x) * Math.min(1, dt * 4);
        ally.y += (ty - ally.y) * Math.min(1, dt * 4);
      } else if (target) {
        const dx = target.x - ally.x;
        const dy = target.y - ally.y;
        const dist = Math.hypot(dx, dy) || 1;
        const desired = ally.ranged ? 230 : ally.radius + target.radius + 4;
        if (dist > desired) {
          ally.x += (dx / dist) * Math.min(190, dist * 3) * dt;
          ally.y += (dy / dist) * Math.min(190, dist * 3) * dt;
        }
        if (ally.attackCd <= 0 && dist < (ally.ranged ? 330 : ally.radius + target.radius + 18)) {
          ally.attackCd = ally.kind === 'scarab' ? 0.55 : ally.kind === 'hound' ? 0.75 : 0.95;
          this.damageTarget(target, ally.damage, { crit: false, source: 'ally', showText: false });
          this.beams.push({
            x: ally.x,
            y: ally.y - 14,
            x2: target.x,
            y2: target.y - 18,
            life: 0.1,
            maxLife: 0.1,
            color: '#8fe0cc',
            width: 1.5,
            orbital: false,
          });
          if (ally.kind === 'servitor' || ally.kind === 'converted') audio.play('bolter');
        }
      }
      ally.x = clamp(ally.x, 20, this.world.w - 20);
      ally.y = clamp(ally.y, 20, this.world.h - 20);
    }
    this.allies = this.allies.filter((ally) => !ally.dead && ally.life > 0 && ally.hp > 0);
  }

  private explodeAlly(ally: AllyUnit): void {
    if (ally.dead) return;
    ally.dead = true;
    this.damageArea(ally.x, ally.y, 75, this.stats.damage * 1.7 * this.stats.summonDamageMult, {
      color: '#6fd1b6',
      slow: false,
      source: 'ally-explosion',
    });
    this.spawnBurst(ally.x, ally.y, '#8fe0cc', 18, 100, 3);
    this.shockwaves.push({
      x: ally.x,
      y: ally.y,
      radius: 4,
      maxRadius: 75,
      life: 0.28,
      maxLife: 0.28,
      color: '#8fe0cc',
      width: 4,
    });
    audio.play('elite_die', { volume: 0.55 });
  }

  private damageAlly(ally: AllyUnit, amount: number): void {
    if (ally.dead) return;
    ally.hp -= amount;
    ally.flash = 1;
    if (ally.hp <= 0) this.explodeAlly(ally);
  }

  private updateSkills(dt: number): void {
    for (const skill of this.skills) {
      skill.cooldown = Math.max(0, skill.cooldown - dt);
      if (skill.cooldown > 0) continue;
      if (!this.shouldAutoCast(skill)) continue;
      if (this.castSkill(skill)) {
        skill.cooldown = skill.total;
        audio.play(this.skillSound(skill.def.id));
      }
    }
  }

  private shouldAutoCast(skill: SkillRuntime): boolean {
    const hasBoss = !!this.boss;
    if (this.enemies.length === 0 && !hasBoss) return false;
    if (skill.def.effect === 'buff') {
      return this.enemies.some(
        (enemy) => Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) < 420,
      ) || hasBoss;
    }
    if (skill.def.effect === 'execute') {
      return (
        hasBoss ||
        this.enemies.some((enemy) => {
          const dist = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
          return dist < 280 && enemy.hp < enemy.maxHp * 0.25;
        }) ||
        this.enemies.length >= 5
      );
    }
    if (skill.def.effect === 'summon_hound' && this.allies.some((a) => a.kind === 'hound' && a.life > 4)) return false;
    if (
      skill.def.effect === 'summon_servitor' &&
      this.allies.some((a) => a.kind === 'servitor' && a.life > 4)
    ) {
      return false;
    }
    if (skill.def.effect === 'servo_skull' && this.allies.some((a) => a.kind === 'skull' && a.life > 4)) return false;
    if (skill.def.effect === 'scarab' && this.allies.some((a) => a.kind === 'scarab' && a.life > 4)) return false;
    return true;
  }

  private castSkill(skill: SkillRuntime): boolean {
    const def = skill.def;
    const level = skill.level;
    const mult = def.multipliers[level - 1];
    const base = this.stats.damage * this.stats.skillDamageMult * this.getDamageMult() * mult;
    switch (def.effect) {
      case 'volley': {
        const targets = this.findNearestTargets(4, this.stats.range + 80);
        if (!targets.length) return false;
        const count = 8 + level * 2;
        for (let i = 0; i < count; i++) {
          const target = targets[i % targets.length];
          const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x) + randomRange(-0.12, 0.12);
          const crit = Math.random() < this.stats.critChance;
          this.bolts.push({
            x: this.player.x + Math.cos(angle) * 18,
            y: this.player.y - 28 + Math.sin(angle) * 18,
            px: this.player.x,
            py: this.player.y - 28,
            vx: Math.cos(angle) * 860,
            vy: Math.sin(angle) * 860,
            damage: base * (crit ? this.stats.critDamage : 1),
            crit,
            life: 1.2,
            pierce: this.stats.pierce,
            hits: new Set(),
            color: '#ffd98a',
            radius: 3.5,
            fromSkill: true,
          });
        }
        this.player.muzzle = 1;
        this.spawnBurst(targets[0].x, targets[0].y, '#ffd98a', 12, 90, 2);
        return true;
      }
      case 'buff': {
        this.addBuff('rapid_fire', '速射协议', '#e2bf70', 8, 1, 2.2, 1);
        this.addFloat(this.player.x, this.player.y - 52, '速射协议', '#e2bf70', 12, 1.1, false);
        this.spawnRing(this.player.x, this.player.y, 70, '#e2bf70', 0.5);
        return true;
      }
      case 'bomb': {
        const cluster = this.findDensestCluster(260, 1);
        if (!cluster) return false;
        const radius = 110 * this.stats.areaMult;
        this.damageArea(cluster.x, cluster.y, radius, base, { color: '#f08a55', slow: false, source: 'melta' });
        this.zones.push({
          x: cluster.x,
          y: cluster.y,
          radius: radius * 0.75,
          life: 4,
          maxLife: 4,
          tick: 0.5,
          damage: this.stats.damage * this.stats.skillDamageMult * 0.7,
          color: '#f08a55',
          slow: false,
          follow: false,
          kind: 'melta',
        });
        this.beams.push({
          x: this.player.x,
          y: this.player.y - 24,
          x2: cluster.x,
          y2: cluster.y,
          life: 0.2,
          maxLife: 0.2,
          color: '#f08a55',
          width: 4,
          orbital: false,
        });
        this.shockwaves.push({
          x: cluster.x,
          y: cluster.y,
          radius: 12,
          maxRadius: radius * 1.5,
          life: 0.5,
          maxLife: 0.5,
          color: '#f08a55',
          width: 7,
        });
        this.spawnBurst(cluster.x, cluster.y, '#f08a55', 28, 120, 3);
        this.shake = Math.max(this.shake, 7);
        return true;
      }
      case 'summon_hound':
        this.summonAlly('hound', mult * 1.25, 20, 0.22, false);
        this.callbacks.onAnnounce('机械猎犬已部署', '机魂正在寻找最近的猎物。', '#d97b56');
        return true;
      case 'summon_servitor':
        this.summonAlly('servitor', mult, 24, 0.28, true);
        this.callbacks.onAnnounce('战斗机仆已上线', '“肉体是脆弱的。机魂是永恒的。”', '#c96a50');
        return true;
      case 'servo_skull':
        this.summonSkull(mult);
        return true;
      case 'deadshot': {
        const target = this.findHighestHpTarget();
        if (!target) return false;
        const amount = base * this.stats.critDamage;
        this.damageTarget(target, amount, { crit: true, source: 'skill', color: '#9bc7b7', showText: true });
        this.beams.push({
          x: this.player.x,
          y: this.player.y - 28,
          x2: target.x,
          y2: target.y - 18,
          life: 0.22,
          maxLife: 0.22,
          color: '#b9e7d6',
          width: 3,
          orbital: false,
        });
        this.spawnBurst(target.x, target.y, '#b9e7d6', 14, 100, 2);
        return true;
      }
      case 'piercing': {
        const target = this.findNearestTarget(this.player.x, this.player.y, 760, true);
        if (!target) return false;
        const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x);
        const x2 = this.player.x + Math.cos(angle) * 700;
        const y2 = this.player.y + Math.sin(angle) * 700;
        this.damageLine(this.player.x, this.player.y, x2, y2, 34, base, '#b3d9c6');
        this.beams.push({
          x: this.player.x,
          y: this.player.y - 22,
          x2,
          y2,
          life: 0.3,
          maxLife: 0.3,
          color: '#d8f5e7',
          width: 5,
          orbital: false,
        });
        this.shake = Math.max(this.shake, 4);
        return true;
      }
      case 'execute': {
        const radius = (260 + level * 30) * this.stats.areaMult;
        const targets = this.getTargetsInRadius(this.player.x, this.player.y, radius, true);
        if (!targets.length) return false;
        const threshold = (15 + level * 5) / 100;
        let count = 0;
        for (const target of targets) {
          const isBoss = target.kind === 'boss';
          if (target.hp / target.maxHp <= threshold) {
            this.damageTarget(target, target.hp + 1, {
              crit: true,
              source: 'execute',
              color: '#e7c27a',
              showText: false,
            });
            count++;
          } else if (isBoss || (target.kind === 'enemy' && target.elite)) {
            this.damageTarget(target, base, {
              crit: false,
              source: 'execute',
              color: '#e7c27a',
              showText: true,
            });
            count++;
          }
        }
        this.shockwaves.push({
          x: this.player.x,
          y: this.player.y,
          radius: 10,
          maxRadius: radius,
          life: 0.55,
          maxLife: 0.55,
          color: '#e7c27a',
          width: 6,
        });
        this.addFloat(this.player.x, this.player.y - 55, count ? `处决 ${count}` : '死神之眼', '#e7c27a', 13, 0.9, false);
        return count > 0 || targets.length > 0;
      }
      case 'flame': {
        const clusters = this.findTargetsForZones(3);
        if (!clusters.length) return false;
        for (const cluster of clusters) {
          this.zones.push({
            x: cluster.x,
            y: cluster.y,
            radius: (60 + level * 8) * this.stats.areaMult,
            life: 5,
            maxLife: 5,
            tick: 0.5,
            damage: this.stats.damage * this.stats.skillDamageMult * mult,
            color: '#e77a51',
            slow: false,
            follow: false,
            kind: 'flame',
          });
        }
        this.spawnBurst(clusters[0].x, clusters[0].y, '#e77a51', 24, 80, 3);
        return true;
      }
      case 'chain': {
        const first = this.findNearestTarget(this.player.x, this.player.y, 430, true);
        if (!first) return false;
        let current: Target | null = first;
        let damage = base;
        const hitIds = new Set<number>();
        for (let i = 0; i < 6 + level && current; i++) {
          const source: Target = current;
          hitIds.add(source.id);
          this.damageTarget(source, damage, {
            crit: false,
            source: 'chain',
            color: '#8dbce8',
            showText: i < 4,
          });
          this.beams.push({
            x: i === 0 ? this.player.x : source.x,
            y: i === 0 ? this.player.y - 28 : source.y - 18,
            x2: source.x,
            y2: source.y - 18,
            life: 0.18,
            maxLife: 0.18,
            color: '#b9d9ff',
            width: 2.5,
            orbital: false,
          });
          const nearby: Target[] = this.getTargetsInRadius(source.x, source.y, 230, true).filter(
            (target) => !hitIds.has(target.id),
          );
          current = nearby.length ? nearby[0] : null;
          damage *= 0.82;
        }
        this.spawnBurst(first.x, first.y, '#8dbce8', 16, 100, 2);
        return true;
      }
      case 'frost': {
        const radius = 185 * this.stats.areaMult;
        this.damageArea(this.player.x, this.player.y, radius, base, {
          color: '#8fdfe3',
          slow: true,
          slowTime: 4,
          source: 'frost',
        });
        this.shockwaves.push({
          x: this.player.x,
          y: this.player.y,
          radius: 8,
          maxRadius: radius,
          life: 0.6,
          maxLife: 0.6,
          color: '#bff6f7',
          width: 7,
        });
        this.flash = Math.max(this.flash, 0.12);
        this.addFloat(this.player.x, this.player.y - 55, '霜寒圣典', '#bff6f7', 12, 0.8, false);
        return true;
      }
      case 'scarab': {
        const count = 4 + level;
        for (let i = 0; i < count; i++) {
          this.summonAlly('scarab', mult, 18, 0.07, false);
        }
        return true;
      }
      case 'entropy': {
        this.addBuff('entropy', '熵力场', '#6ad6b0', 8, 1, 1, 1);
        this.entropyTick = 0;
        this.addFloat(this.player.x, this.player.y - 55, '熵力场', '#6ad6b0', 12, 0.9, false);
        return true;
      }
      case 'singularity': {
        const cluster = this.findDensestCluster(300, 1);
        if (!cluster) return false;
        this.singularities.push({
          x: cluster.x,
          y: cluster.y,
          radius: 105 * this.stats.areaMult,
          time: 1.25,
          duration: 1.25,
          damage: base,
          exploded: false,
        });
        return true;
      }
      default:
        return false;
    }
  }

  private addBuff(
    id: string,
    name: string,
    color: string,
    time: number,
    damageMult: number,
    attackSpeedMult: number,
    chargeRateMult: number,
  ): void {
    const existing = this.buffs.find((buff) => buff.id === id);
    if (existing) {
      existing.time = Math.max(existing.time, time);
      existing.maxTime = Math.max(existing.maxTime, time);
      return;
    }
    this.buffs.push({
      id,
      name,
      color,
      time,
      maxTime: time,
      damageMult,
      attackSpeedMult,
      chargeRateMult,
    });
  }

  private hasBuff(id: string): boolean {
    return this.buffs.some((buff) => buff.id === id);
  }

  private summonAlly(
    kind: AllyUnit['kind'],
    damageMult: number,
    duration: number,
    hpFraction: number,
    ranged: boolean,
  ): void {
    if (this.allies.length >= 14) return;
    const angle = randomRange(0, Math.PI * 2);
    const ally: AllyUnit = {
      kind,
      id: this.nextId++,
      x: clamp(this.player.x + Math.cos(angle) * 48, 20, this.world.w - 20),
      y: clamp(this.player.y + Math.sin(angle) * 48, 20, this.world.h - 20),
      hp: Math.max(1, this.player.maxHp * hpFraction),
      maxHp: Math.max(1, this.player.maxHp * hpFraction),
      damage: this.stats.damage * damageMult * this.stats.summonDamageMult,
      attackCd: randomRange(0.2, 0.8),
      life: duration,
      maxLife: duration,
      radius: kind === 'scarab' ? 7 : kind === 'hound' ? 14 : 12,
      ranged,
      flash: 0,
      angle,
      orbitPhase: kind === 'skull' ? angle : 0,
      dead: false,
    };
    this.allies.push(ally);
    this.spawnBurst(ally.x, ally.y, '#8fe0cc', 10, 45, 2);
    audio.play('summon');
  }

  private summonSkull(mult: number): void {
    if (this.allies.length >= 14) return;
    const ally: AllyUnit = {
      kind: 'skull',
      id: this.nextId++,
      x: this.player.x + 50,
      y: this.player.y - 40,
      hp: this.player.maxHp * 0.25,
      maxHp: this.player.maxHp * 0.25,
      damage: this.stats.damage * mult * this.stats.summonDamageMult,
      attackCd: 0.2,
      life: 16,
      maxLife: 16,
      radius: 10,
      ranged: true,
      flash: 0,
      angle: 0,
      orbitPhase: 0,
      dead: false,
    };
    this.allies.push(ally);
    this.spawnBurst(ally.x, ally.y, '#79e3d8', 14, 50, 2);
    audio.play('summon');
  }

  private updateBoss(dt: number): void {
    if (!this.boss || this.boss.dead) return;
    const boss = this.boss;
    boss.flash = Math.max(0, boss.flash - dt * 7);
    boss.slowTimer = Math.max(0, boss.slowTimer - dt);
    boss.anim += dt;
    boss.contactCd = Math.max(0, boss.contactCd - dt);
    const dx = this.player.x - boss.x;
    const dy = this.player.y - boss.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (!boss.enraged && boss.hp / boss.maxHp <= 0.5) {
      boss.enraged = true;
      boss.speed *= 1.25;
      this.callbacks.onAnnounce(`${boss.bossDef.title} · 狂暴`, '首领正在撕开自己的装甲。别让它靠近。', '#e15a4e');
      audio.play('boss_roar_phase');
      this.shake = Math.max(this.shake, 8);
      this.redFlash = 0.35;
    }
    if (boss.action) {
      this.updateBossAction(boss, dt, dx, dy, dist);
    } else {
      boss.patternCd -= dt;
      if (boss.patternCd <= 0) {
        this.beginBossPattern(boss, dx, dy, dist);
      } else if (dist > boss.radius + 70) {
        boss.x += (dx / dist) * boss.speed * dt;
        boss.y += (dy / dist) * boss.speed * dt;
      }
      if (dist < boss.radius + playerRadius() + 8 && boss.contactCd <= 0) {
        boss.contactCd = 0.9;
        this.damagePlayer(boss.damage * 0.85);
      }
    }
    boss.x = clamp(boss.x, 60, this.world.w - 60);
    boss.y = clamp(boss.y, 60, this.world.h - 60);
  }

  private beginBossPattern(boss: BossUnit, dx: number, dy: number, dist: number): void {
    const patterns = boss.bossDef.patterns;
    const kind = patterns[boss.patternIndex % patterns.length];
    boss.patternIndex++;
    const dirx = dx / (dist || 1);
    const diry = dy / (dist || 1);
    let total = 0.9;
    if (kind === 'volley') total = 0.72;
    if (kind === 'charge') total = 0.78;
    if (kind === 'summon') total = 0.62;
    boss.action = { kind, timer: total, total, dirx, diry, fired: false, charging: false };
    audio.play('boss_telegraph', { volume: 0.8 });
  }

  private updateBossAction(boss: BossUnit, dt: number, dx: number, dy: number, dist: number): void {
    const action = boss.action!;
    action.timer -= dt;
    if (action.kind === 'charge') {
      if (!action.fired && action.timer <= 0) {
        action.fired = true;
        action.charging = true;
        action.timer = 0.42;
        audio.play('boss_charge');
        this.shake = Math.max(this.shake, 5);
      }
      if (action.charging) {
        boss.x += action.dirx * 560 * dt;
        boss.y += action.diry * 560 * dt;
        if (Math.random() < 0.7) {
          this.addParticle(boss.x, boss.y - 30, randomRange(-30, 30), randomRange(-40, 0), 0.4, 3, '#8f3b32', false);
        }
        if (dist < boss.radius + playerRadius() + 20 && boss.contactCd <= 0) {
          boss.contactCd = 0.8;
          this.damagePlayer(boss.damage * 1.15);
        }
        if (action.timer <= 0) {
          boss.action = null;
          boss.patternCd = 2.3;
          this.shake = Math.max(this.shake, 7);
        }
      }
      return;
    }
    if (action.timer > 0) return;
    if (action.kind === 'slam') {
      const radius = 150;
      if (Math.hypot(this.player.x - boss.x, this.player.y - boss.y) < radius + playerRadius()) {
        this.damagePlayer(boss.damage * 1.5);
      }
      this.shockwaves.push({
        x: boss.x,
        y: boss.y,
        radius: 10,
        maxRadius: radius * 1.5,
        life: 0.5,
        maxLife: 0.5,
        color: '#e15a4e',
        width: 9,
      });
      this.scorches.push({
        x: boss.x,
        y: boss.y,
        radius: 95,
        life: 6,
        maxLife: 6,
        seed: Math.floor(this.rng() * 10000),
        heavy: true,
      });
      this.spawnBurst(boss.x, boss.y, '#e15a4e', 30, 150, 3);
      this.shake = Math.max(this.shake, 12);
      this.flash = 0.18;
      audio.play('boss_slam');
      boss.action = null;
      boss.patternCd = 2.4;
      return;
    }
    if (action.kind === 'volley') {
      const count = 12 + Math.floor(this.elapsed / 120) + (boss.enraged ? 4 : 0);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + this.elapsed * 0.2;
        this.enemyBolts.push({
          x: boss.x,
          y: boss.y - 45,
          vx: Math.cos(angle) * 160,
          vy: Math.sin(angle) * 160,
          damage: boss.damage * 0.5,
          radius: 7,
          life: 5,
          color: boss.bossDef.color,
          trail: true,
        });
      }
      this.spawnBurst(boss.x, boss.y - 45, boss.bossDef.color, 24, 100, 3);
      audio.play('boss_volley');
      boss.action = null;
      boss.patternCd = 2.8;
      return;
    }
    if (action.kind === 'summon') {
      for (let i = 0; i < 5; i++) {
        const angle = randomRange(0, Math.PI * 2);
        const def = this.pickEnemyDef();
        this.spawnEnemy(
          def,
          clamp(boss.x + Math.cos(angle) * randomRange(60, 140), 40, this.world.w - 40),
          clamp(boss.y + Math.sin(angle) * randomRange(60, 140), 40, this.world.h - 40),
          true,
        );
      }
      this.spawnBurst(boss.x, boss.y, '#b06d92', 26, 90, 3);
      this.addFloat(boss.x, boss.y - 100, '巢群增援', boss.bossDef.color, 12, 1, false);
      audio.play('boss_summon');
      boss.action = null;
      boss.patternCd = 3.3;
    }
  }

  private spawnEndlessBoss(): void {
    const defs = Object.values(BOSSES);
    const def = defs[this.endlessBossIndex % defs.length];
    const cycle = Math.floor(this.endlessBossIndex / defs.length);
    const angle = randomRange(0, Math.PI * 2);
    const x = clamp(this.player.x + Math.cos(angle) * 340, 90, this.world.w - 90);
    const y = clamp(this.player.y + Math.sin(angle) * 310, 90, this.world.h - 90);
    const hp = Math.round(
      getEnemyHp(def.hpMult * (1 + cycle * 0.75) * this.endlessHpScale()) *
        this.enemyHpMult,
    );
    this.boss = {
      kind: 'boss',
      id: this.nextId++,
      bossDef: def,
      x,
      y,
      hp,
      maxHp: hp,
      radius: def.radius,
      speed: def.speed,
      damage:
        getEnemyDamage(def.damageMult) *
        this.enemyDamageMult *
        this.endlessDamageScale(),
      flash: 0,
      slowTimer: 0,
      anim: 0,
      dead: false,
      vx: 0,
      vy: 0,
      action: null,
      patternCd: 1.5,
      patternIndex: 0,
      enraged: false,
      contactCd: 0,
    };
    this.bossSpawned = true;
    this.bossKilled = false;
    this.endlessBossIndex += 1;
    this.endlessBossAt = this.elapsed + 120;
    this.callbacks.onAnnounce(
      `威胁升级 · ${def.title} ${def.name}`,
      `${def.intro} 击败它，夺走遗产宝箱。`,
      def.color,
    );
    audio.play('boss_roar');
    this.audioIntensity = 'boss';
    audio.setIntensity('boss');
    this.shake = Math.max(this.shake, 12);
    this.redFlash = 0.4;
    this.spawnBurst(x, y, def.color, 60, 200, 4);
    this.shockwaves.push({
      x,
      y,
      radius: 10,
      maxRadius: 240,
      life: 0.9,
      maxLife: 0.9,
      color: def.color,
      width: 12,
    });
    this.spawnSupply(
      this.player.x + randomRange(-150, 150),
      this.player.y + randomRange(-130, 130),
    );
    this.pushHud();
  }

  private checkProgress(): void {
    if (this.ending) return;
    if ((!this.boss || this.boss.dead) && this.elapsed >= this.endlessBossAt) {
      this.spawnEndlessBoss();
    }
  }

  private beginDefeat(): void {
    if (this.ending) return;
    this.ending = true;
    this.endTimer = 2.0;
    this.strikes = [];
    this.callbacks.onAnnounce('审判官阵亡', '舰船记录了你的生命信号终止。净化协议将自动重试。', '#c33f3a');
    audio.play('defeat');
    this.redFlash = 0.8;
    this.shake = Math.max(this.shake, 16);
    this.spawnBurst(this.player.x, this.player.y - 20, '#b9433f', 40, 160, 4);
    this.pushHud();
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    audio.setIntensity('hub');
    const salvage = 15 + Math.floor(this.elapsed / 30) * 4 + Math.floor(this.kills / 30);
    this.loot.gelt = (this.loot.gelt ?? 0) + salvage;
    const result: BattleResult = {
      victory: false,
      kills: this.kills,
      eliteKills: this.eliteKills,
      goldKills: this.goldKills,
      servitors: this.servitorConversions,
      strikes: this.strikesUsed,
      maxCombo: this.maxCombo,
      damageDealt: Math.round(this.damageDealt),
      bossKilled: this.bossKilled,
      time: this.elapsed,
      hpLeft: Math.max(0, Math.round(this.player.hp)),
      retreat: this.retreating,
      resources: this.loot,
      endless: true,
      chests: this.endlessChests,
      bossKills: this.endlessBossKills,
    };
    this.callbacks.onHud(this.buildHud());
    this.callbacks.onEnd(result);
    this.stop();
  }

  // ============================================================
  // Combat helpers
  // ============================================================

  private damageTarget(
    target: Target,
    amount: number,
    opts: { crit: boolean; source: string; color?: string; showText?: boolean },
  ): void {
    if (target.dead) return;
    let adjusted = amount;
    if (target.kind === 'boss') adjusted *= this.stats.bossDamageMult;
    const dealt = Math.max(1, Math.round(adjusted));
    target.hp -= dealt;
    this.damageDealt += dealt;
    target.flash = 1;
    if (opts.showText && this.config.options.damageNumbers) {
      const color = opts.crit ? '#ffe6a1' : opts.color ?? '#f0d8a0';
      this.addFloat(
        target.x + randomRange(-10, 10),
        target.y - (target.kind === 'boss' ? target.radius * 1.4 : target.radius * 1.2),
        `${opts.crit ? '暴击 ' : ''}${formatNumber(dealt)}`,
        color,
        opts.crit ? 14 : 11,
        0.65,
        opts.crit,
      );
    }
    audio.play('hit', {
      volume: opts.crit ? 0.55 : 0.35,
      pan: clamp((target.x - this.player.x) / 520, -1, 1),
    });
    if (target.hp <= 0) {
      if (target.kind === 'boss') this.killBoss(target);
      else this.killEnemy(target);
    }
  }

  private damageArea(
    x: number,
    y: number,
    radius: number,
    baseDamage: number,
    opts: { color: string; slow: boolean; slowTime?: number; source: string },
  ): void {
    for (const target of this.getTargetsInRadius(x, y, radius, true)) {
      const amount = baseDamage;
      this.damageTarget(target, amount, {
        crit: false,
        source: opts.source,
        color: opts.color,
        showText: false,
      });
      if (opts.slow && target.kind === 'enemy') target.slowTimer = Math.max(target.slowTimer, opts.slowTime ?? 3);
    }
    this.spawnRing(x, y, radius, opts.color, 0.3);
  }

  private damageLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    width: number,
    damage: number,
    color: string,
  ): void {
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    const dx = (x2 - x1) / length;
    const dy = (y2 - y1) / length;
    for (const target of this.getTargetsInRadius((x1 + x2) / 2, (y1 + y2) / 2, length / 2 + 40, true)) {
      const t = (target.x - x1) * dx + (target.y - y1) * dy;
      if (t < -20 || t > length) continue;
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      if (Math.hypot(target.x - px, target.y - py) < width + target.radius) {
        this.damageTarget(target, damage, { crit: false, source: 'piercing', color, showText: true });
      }
    }
  }

  private damagePlayer(amount: number): void {
    if (this.ending || this.player.invuln > 0) return;
    if (Math.random() < this.stats.dodge) {
      this.addFloat(this.player.x + randomRange(-12, 12), this.player.y - 55, '闪避', '#8ee0d4', 11, 0.6, false);
      this.player.invuln = 0.18;
      return;
    }
    const reduced = Math.max(1, amount * (1 - this.stats.damageReduction));
    this.player.hp -= reduced;
    this.player.invuln = 0.42;
    this.redFlash = Math.min(1, this.redFlash + 0.32);
    this.shake = Math.max(this.shake, 5);
    if (this.config.options.damageNumbers) {
      this.addFloat(
        this.player.x + randomRange(-8, 8),
        this.player.y - 52,
        `-${formatNumber(reduced)}`,
        '#ff7466',
        12,
        0.7,
        false,
      );
    }
    audio.play('hurt');
    if (this.player.hp <= 0) this.beginDefeat();
  }

  private killEnemy(enemy: EnemyUnit): void {
    if (enemy.dead) return;
    enemy.dead = true;
    this.kills++;
    this.combo++;
    this.comboTimer = 2.4;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (enemy.elite) this.eliteKills++;
    if (enemy.gold) this.goldKills++;
    this.dropLoot(enemy);
    this.spawnBurst(enemy.x, enemy.y, enemy.gold ? '#ffd36b' : FACTIONS[enemy.def.faction].color, 14, 90, 2.5);
    for (let i = 0; i < 5; i++) {
      this.addParticle(
        enemy.x + randomRange(-12, 12),
        enemy.y - randomRange(6, 25),
        randomRange(-35, 35),
        randomRange(-55, -10),
        randomRange(0.3, 0.7),
        randomRange(1, 3),
        enemy.def.color,
        false,
      );
    }
    this.scorches.push({
      x: enemy.x,
      y: enemy.y,
      radius: 14 + enemy.radius * 0.5,
      life: 1.8,
      maxLife: 1.8,
      seed: Math.floor(this.rng() * 10000),
      heavy: false,
    });
    if (this.combo > 0 && this.combo % 25 === 0) {
      this.addFloat(this.player.x, this.player.y - 65, `连杀 ×${this.combo}`, '#ffd36b', 15, 1.2, false);
      audio.play('pickup');
    }
    audio.play(enemy.gold || enemy.elite ? 'elite_die' : 'enemy_die', {
      pan: clamp((enemy.x - this.player.x) / 520, -1, 1),
      volume: enemy.gold ? 0.9 : enemy.elite ? 0.7 : 0.45,
    });
    if (!enemy.gold && this.rng() < this.stats.tameChance && this.countConverted() < this.stats.maxTames) {
      this.convertEnemy(enemy);
    }
    if (this.rng() < 0.06) {
      this.addPickup(enemy.x, enemy.y, 'medicae');
    }
  }

  private convertEnemy(enemy: EnemyUnit): void {
    this.servitorConversions++;
    const ally: AllyUnit = {
      kind: 'converted',
      id: this.nextId++,
      x: enemy.x,
      y: enemy.y,
      hp: Math.max(1, enemy.maxHp * 0.55),
      maxHp: Math.max(1, enemy.maxHp * 0.55),
      damage: this.stats.damage * 0.55 * this.stats.summonDamageMult,
      attackCd: 0.5,
      life: 999,
      maxLife: 999,
      radius: enemy.radius * 0.9,
      ranged: enemy.def.ranged,
      flash: 0,
      angle: 0,
      orbitPhase: 0,
      dead: false,
    };
    this.allies.push(ally);
    this.beams.push({
      x: enemy.x,
      y: enemy.y,
      x2: enemy.x,
      y2: enemy.y - 200,
      life: 0.5,
      maxLife: 0.5,
      color: '#6fd1b6',
      width: 6,
      orbital: false,
    });
    this.shockwaves.push({
      x: enemy.x,
      y: enemy.y,
      radius: 4,
      maxRadius: 50,
      life: 0.35,
      maxLife: 0.35,
      color: '#6fd1b6',
      width: 3,
    });
    this.addFloat(enemy.x, enemy.y - 25, '机仆化', '#8fe0cc', 13, 1.1, false);
    this.spawnBurst(enemy.x, enemy.y, '#8fe0cc', 16, 75, 2);
    audio.play('servitor');
  }

  private countConverted(): number {
    return this.allies.filter((ally) => ally.kind === 'converted').length;
  }

  private dropLoot(enemy: EnemyUnit): void {
    const faction = FACTIONS[enemy.def.faction];
    const rewardMult = this.config.rewardMultiplier;
    const gelt = Math.max(
      1,
      Math.round(
        getGeltPerKill(enemy.def.rewardMult) *
          this.stats.geltMult *
          (enemy.gold ? 2.5 : 1) *
          randomRange(0.9, 1.1) *
          rewardMult,
      ),
    );
    this.addLoot('gelt', gelt);
    const currency = faction.currency;
    const dropBonus = Math.min(0.2, this.stats.dropChance);
    if (this.rng() < 0.12 + dropBonus * 0.4) {
      const amount = Math.max(1, Math.round(gelt * 0.18));
      this.addLoot(currency, amount);
    }
    for (const material of MATERIAL_DROPS) {
      if (this.rng() < material.chance + dropBonus * 0.18) {
        const amount = Math.max(1, Math.round(material.amount * rewardMult));
        this.addLoot(material.key, amount);
      }
    }
    if (this.rng() < 0.0008 + dropBonus * 0.02) {
      this.addLoot('beacon', 1);
      this.addFloat(enemy.x, enemy.y - 35, '亚空间信标', '#e06456', 12, 1, false);
    }
    if (this.rng() < 0.25 || enemy.gold) {
      this.spawnBurst(enemy.x, enemy.y - 10, '#e2bd68', 4, 45, 1.5);
      audio.play('coin');
    }
  }

  private addLoot(key: ResourceKey, amount: number): void {
    this.loot[key] = (this.loot[key] ?? 0) + amount;
  }

  private killBoss(boss: BossUnit): void {
    if (boss.dead) return;
    boss.dead = true;
    this.bossKilled = true;
    this.kills++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const rewardMult = this.config.rewardMultiplier;
    const reward = Math.max(
      15,
      Math.round(90 * (1 + this.elapsed / 240) * rewardMult),
    );
    this.addLoot('gelt', reward);
    const faction = FACTIONS[boss.bossDef.faction];
    this.addLoot(
      faction.currency,
      Math.max(1, Math.round(12 * (1 + this.elapsed / 300) * rewardMult)),
    );
    this.addLoot('beacon', 1);
    this.addLoot('ceramite', Math.max(1, Math.round(5 * (1 + this.elapsed / 240) * rewardMult)));
    if (boss.bossDef.id === 'daemon') this.addLoot('daemonBlood', 2);
    else if (this.elapsed >= 900) this.addLoot('daemonBlood', 1);
    this.spawnBurst(boss.x, boss.y, boss.bossDef.color, 80, 260, 5);
    this.spawnBurst(boss.x, boss.y, '#ffe4a6', 40, 180, 4);
    for (let i = 0; i < 8; i++) {
      this.shockwaves.push({
        x: boss.x,
        y: boss.y,
        radius: 10 + i * 12,
        maxRadius: 220 + i * 40,
        life: 0.7 + i * 0.08,
        maxLife: 0.7 + i * 0.08,
        color: i % 2 ? '#fff0c0' : boss.bossDef.color,
        width: 5,
      });
    }
    this.scorches.push({
      x: boss.x,
      y: boss.y,
      radius: 160,
      life: 14,
      maxLife: 14,
      seed: Math.floor(this.rng() * 10000),
      heavy: true,
    });
    this.shake = Math.max(this.shake, 18);
    this.flash = 0.6;
    this.hitStop = 0.16;
    audio.play('boss_die');
    this.boss = boss;
    this.endlessBossKills += 1;
    this.endlessChests += 1;
    this.bossKilled = true;
    this.endlessBossAt = this.elapsed + 120;
    this.addFloat(boss.x, boss.y - 120, '遗产宝箱 +1', '#ffe4a6', 16, 1.8, false);
    this.callbacks.onAnnounce(
      '威胁已清除',
      '首领被击倒，一只遗产宝箱已封存。敌潮还在继续。',
      '#d7b25e',
    );
    audio.play('achievement');
    audio.setIntensity('battle');
    this.pushHud();
  }

  private damageTargetOverTime(target: Target, amount: number, color: string): void {
    this.damageTarget(target, amount, { crit: false, source: 'dot', color, showText: false });
  }

  private updateZones(dt: number): void {
    for (const zone of this.zones) {
      zone.life -= dt;
      zone.tick -= dt;
      if (zone.follow) {
        zone.x = this.player.x;
        zone.y = this.player.y;
      }
      if (zone.tick <= 0) {
        zone.tick += 0.5;
        for (const target of this.getTargetsInRadius(zone.x, zone.y, zone.radius, true)) {
          this.damageTargetOverTime(target, zone.damage * 0.5, zone.color);
          if (zone.slow && target.kind === 'enemy') target.slowTimer = Math.max(target.slowTimer, 1.5);
        }
        if (Math.random() < 0.65) {
          const angle = randomRange(0, Math.PI * 2);
          this.addParticle(
            zone.x + Math.cos(angle) * randomRange(0, zone.radius),
            zone.y + Math.sin(angle) * randomRange(0, zone.radius * 0.5),
            randomRange(-8, 8),
            randomRange(-35, -10),
            randomRange(0.3, 0.8),
            randomRange(1, 3),
            zone.color,
            true,
          );
        }
      }
    }
    this.zones = this.zones.filter((zone) => zone.life > 0);
  }

  private updateSingularities(dt: number): void {
    for (const sing of this.singularities) {
      sing.time -= dt;
      const pull = sing.time > 0 ? 1 : 0;
      if (pull) {
        for (const target of this.getTargetsInRadius(sing.x, sing.y, sing.radius * 2.2, true)) {
          if (target.kind === 'boss') continue;
          const dx = sing.x - target.x;
          const dy = sing.y - target.y;
          const dist = Math.hypot(dx, dy) || 1;
          target.x += (dx / dist) * 75 * dt;
          target.y += (dy / dist) * 75 * dt;
        }
        if (Math.random() < 0.5) {
          const angle = randomRange(0, Math.PI * 2);
          this.addParticle(
            sing.x + Math.cos(angle) * sing.radius * 1.5,
            sing.y + Math.sin(angle) * sing.radius * 1.5,
            -Math.cos(angle) * 120,
            -Math.sin(angle) * 120,
            0.4,
            2,
            '#8ff0d4',
            true,
          );
        }
      } else if (!sing.exploded) {
        sing.exploded = true;
        this.damageArea(sing.x, sing.y, sing.radius * 1.4, sing.damage, {
          color: '#8ff0d4',
          slow: true,
          slowTime: 3,
          source: 'singularity',
        });
        this.shockwaves.push({
          x: sing.x,
          y: sing.y,
          radius: 8,
          maxRadius: sing.radius * 2,
          life: 0.6,
          maxLife: 0.6,
          color: '#c7fff0',
          width: 8,
        });
        this.spawnBurst(sing.x, sing.y, '#8ff0d4', 36, 160, 3);
        this.flash = 0.2;
        this.shake = Math.max(this.shake, 7);
        audio.play('orbital_hit');
      }
    }
    this.singularities = this.singularities.filter((sing) => sing.time > -0.3);
  }

  private updatePickups(dt: number): void {
    for (const pickup of this.pickups) {
      pickup.life -= dt;
      pickup.bob += dt;
      const dist = Math.hypot(pickup.x - this.player.x, pickup.y - this.player.y);
      if (dist < this.stats.pickupRadius + 40) {
        const speed = dist < 40 ? 400 : 160;
        pickup.x += ((this.player.x - pickup.x) / (dist || 1)) * speed * dt;
        pickup.y += ((this.player.y - pickup.y) / (dist || 1)) * speed * dt;
      }
      if (dist < 28) {
        this.collectPickup(pickup);
        pickup.life = 0;
      }
    }
    this.pickups = this.pickups.filter((pickup) => pickup.life > 0);
  }

  private addPickup(x: number, y: number, kind: Pickup['kind'], buffId?: string): void {
    this.pickups.push({ kind, x, y, life: 24, bob: Math.random() * 10, buffId });
  }

  private spawnSupply(x: number, y: number): void {
    const buffs = ['relic_wrath', 'relic_haste', 'relic_charge', 'relic_heal', 'relic_shield'];
    this.addPickup(
      clamp(x, 70, this.world.w - 70),
      clamp(y, 70, this.world.h - 70),
      'relic',
      pick(buffs),
    );
  }

  private collectPickup(pickup: Pickup): void {
    if (pickup.kind === 'medicae') {
      const amount = this.player.maxHp * 0.24;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
      this.addFloat(this.player.x, this.player.y - 50, `+${formatNumber(amount)}`, '#8fe0a0', 12, 0.8, false);
      audio.play('heal');
      this.spawnBurst(this.player.x, this.player.y - 20, '#8fe0a0', 14, 60, 2);
      return;
    }
    const buffId = pickup.buffId;
    if (buffId === 'relic_wrath') {
      this.addBuff('relic_wrath', '帝皇之怒', '#e8874f', 20, 1.8, 1, 1);
      this.callbacks.onAnnounce('圣物 · 帝皇之怒', '伤害提高 80%，持续 20 秒。', '#e8874f');
    } else if (buffId === 'relic_haste') {
      this.addBuff('relic_haste', '机魂加速', '#8ee0d4', 20, 1, 2, 1);
      this.callbacks.onAnnounce('圣物 · 机魂加速', '攻击速度提高 100%，持续 20 秒。', '#8ee0d4');
    } else if (buffId === 'relic_charge') {
      this.charges = Math.min(this.stats.orbitalCharges, this.charges + 2);
      this.addBuff('relic_charge', '轨道超载', '#ffb24a', 18, 1, 1, 2);
      this.callbacks.onAnnounce('圣物 · 轨道超载', '火力配额回复速度翻倍，立即补充 2 发。', '#ffb24a');
    } else if (buffId === 'relic_heal') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.45);
      this.addBuff('relic_heal', '圣髑医疗', '#8fe0a0', 15, 1, 1, 1);
      this.addFloat(this.player.x, this.player.y - 50, '大幅治疗', '#8fe0a0', 13, 1, false);
    } else if (buffId === 'relic_shield') {
      this.player.invuln = Math.max(this.player.invuln, 8);
      this.addBuff('relic_shield', '虚空护盾', '#b58ae8', 8, 1, 1, 1);
      this.callbacks.onAnnounce('圣物 · 虚空护盾', '8 秒内免疫所有伤害。', '#b58ae8');
    }
    audio.play('pickup');
    this.spawnBurst(this.player.x, this.player.y - 20, '#ffd36b', 20, 90, 2);
    this.pushHud();
  }

  // ============================================================
  // Query helpers
  // ============================================================

  private getTargets(): Target[] {
    const targets: Target[] = [...this.enemies];
    if (this.boss && !this.boss.dead) targets.push(this.boss);
    return targets;
  }

  private getTargetsInRadius(x: number, y: number, radius: number, includeBoss = false): Target[] {
    const targets = this.enemies.filter(
      (enemy) => !enemy.dead && Math.hypot(enemy.x - x, enemy.y - y) <= radius + enemy.radius,
    ) as Target[];
    if (includeBoss && this.boss && !this.boss.dead) {
      if (Math.hypot(this.boss.x - x, this.boss.y - y) <= radius + this.boss.radius) targets.push(this.boss);
    }
    return targets;
  }

  private findNearestTarget(x: number, y: number, range: number, includeBoss = false): Target | null {
    let nearest: Target | null = null;
    let best = range;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dist = Math.hypot(enemy.x - x, enemy.y - y);
      if (dist < best) {
        best = dist;
        nearest = enemy;
      }
    }
    if (includeBoss && this.boss && !this.boss.dead) {
      const dist = Math.hypot(this.boss.x - x, this.boss.y - y);
      if (dist < best) nearest = this.boss;
    }
    return nearest;
  }

  private findNearestTargets(count: number, range: number): Target[] {
    return this.getTargets()
      .filter((target) => Math.hypot(target.x - this.player.x, target.y - this.player.y) < range)
      .sort(
        (a, b) =>
          Math.hypot(a.x - this.player.x, a.y - this.player.y) -
          Math.hypot(b.x - this.player.x, b.y - this.player.y),
      )
      .slice(0, count);
  }

  private findHighestHpTarget(): Target | null {
    const targets = this.getTargets();
    if (!targets.length) return null;
    return targets.sort((a, b) => b.hp - a.hp)[0];
  }

  private findDensestCluster(radius: number, minCount: number): Vec | null {
    const points = this.getTargets().filter(
      (target) => Math.hypot(target.x - this.player.x, target.y - this.player.y) < 650,
    );
    if (!points.length) return null;
    let best = points[0];
    let bestCount = 0;
    for (const p of points) {
      let count = 0;
      for (const q of points) {
        if (Math.hypot(p.x - q.x, p.y - q.y) < radius) count++;
      }
      if (count > bestCount) {
        bestCount = count;
        best = p;
      }
    }
    if (bestCount < minCount) return null;
    return { x: best.x, y: best.y };
  }

  private findTargetsForZones(count: number): Vec[] {
    const targets = this.getTargets().filter(
      (target) => Math.hypot(target.x - this.player.x, target.y - this.player.y) < 600,
    );
    if (!targets.length) return [];
    const result: Vec[] = [];
    const candidates = [...targets].sort(() => this.rng() - 0.5);
    for (const target of candidates) {
      if (result.every((p) => Math.hypot(p.x - target.x, p.y - target.y) > 100)) {
        result.push({ x: target.x, y: target.y });
      }
      if (result.length >= count) break;
    }
    return result;
  }

  // ============================================================
  // Effects
  // ============================================================

  private addParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    glow: boolean,
    gravity = 0,
  ): void {
    if (this.particles.length > 520) return;
    this.particles.push({
      x,
      y,
      vx,
      vy,
      life,
      maxLife: life,
      size,
      color,
      gravity,
      drag: 0.92,
      glow,
    });
  }

  private spawnBurst(x: number, y: number, color: string, count: number, speed: number, size: number): void {
    for (let i = 0; i < count; i++) {
      const angle = randomRange(0, Math.PI * 2);
      const velocity = randomRange(speed * 0.2, speed);
      this.addParticle(
        x,
        y,
        Math.cos(angle) * velocity,
        Math.sin(angle) * velocity - randomRange(0, speed * 0.3),
        randomRange(0.3, 0.8),
        randomRange(1, size),
        color,
        true,
        randomRange(20, 90),
      );
    }
  }

  private spawnRing(x: number, y: number, radius: number, color: string, life: number): void {
    this.shockwaves.push({
      x,
      y,
      radius: 4,
      maxRadius: radius,
      life,
      maxLife: life,
      color,
      width: 3,
    });
  }

  private addFloat(
    x: number,
    y: number,
    text: string,
    color: string,
    size: number,
    life: number,
    crit: boolean,
  ): void {
    if (this.floats.length > 90) return;
    this.floats.push({
      x,
      y,
      text,
      color,
      life,
      maxLife: life,
      size,
      vy: crit ? -50 : -32,
      crit,
    });
  }

  private updateEffects(dt: number): void {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.vx *= particle.drag;
      particle.vy *= particle.drag;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    for (const float of this.floats) {
      float.life -= dt;
      float.y += float.vy * dt;
      float.vy *= 0.91;
    }
    this.floats = this.floats.filter((float) => float.life > 0);
    for (const beam of this.beams) beam.life -= dt;
    this.beams = this.beams.filter((beam) => beam.life > 0);
    for (const fx of this.weaponFx) fx.life -= dt;
    this.weaponFx = this.weaponFx.filter((fx) => fx.life > 0);
    for (const wave of this.shockwaves) {
      wave.life -= dt;
      const t = 1 - wave.life / wave.maxLife;
      wave.radius = 4 + (wave.maxRadius - 4) * (1 - Math.pow(1 - t, 2));
    }
    this.shockwaves = this.shockwaves.filter((wave) => wave.life > 0);
    for (const scorch of this.scorches) scorch.life -= dt;
    this.scorches = this.scorches.filter((scorch) => scorch.life > 0);
    this.enemyBolts = this.enemyBolts.filter((bolt) => bolt.life > 0);
  }

  private updateCamera(dt: number): void {
    const targetX = clamp(this.player.x - VIEW_W / 2, 0, this.world.w - VIEW_W);
    const targetY = clamp(this.player.y - VIEW_H / 2, 0, this.world.h - VIEW_H);
    const t = 1 - Math.exp(-dt * 9);
    this.camera.x += (targetX - this.camera.x) * t;
    this.camera.y += (targetY - this.camera.y) * t;
  }

  // ============================================================
  // Render
  // ============================================================

  private render(): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#080a0b';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const shakeAmp = this.config.options.screenshake ? this.shake : 0;
    const shakeX = Math.sin(this.elapsed * 83) * shakeAmp + Math.sin(this.elapsed * 41) * shakeAmp * 0.4;
    const shakeY = Math.cos(this.elapsed * 71) * shakeAmp * 0.7;
    ctx.save();
    ctx.translate(-Math.round(this.camera.x + shakeX), -Math.round(this.camera.y + shakeY));
    if (this.ground) ctx.drawImage(this.ground, 0, 0);
    this.drawBraziers();
    this.drawSmoke();
    this.drawScorches();
    this.drawZones();
    this.drawPickupMarkers();
    this.drawStrikeMarkers();
    this.drawBossTelegraphs();
    this.drawPickups();
    this.drawAllies();
    this.drawEnemies();
    this.drawPlayer();
    this.drawWeaponFx();
    this.drawBolts();
    this.drawEnemyBolts();
    this.drawSingularities();
    this.drawBeams();
    this.drawShockwaves();
    this.drawParticles();
    this.drawFloats();
    ctx.restore();
    this.drawScreenOverlay();
    this.drawCrosshair();
  }

  private drawBraziers(): void {
    const flicker = 0.8 + Math.sin(this.elapsed * 7) * 0.1;
    for (const brazier of this.braziers) {
      const gradient = this.ctx.createRadialGradient(brazier.x, brazier.y, 0, brazier.x, brazier.y, 150);
      gradient.addColorStop(0, `rgba(240,150,65,${0.08 * flicker})`);
      gradient.addColorStop(0.5, `rgba(240,110,45,${0.035 * flicker})`);
      gradient.addColorStop(1, 'rgba(240,100,40,0)');
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(brazier.x - 150, brazier.y - 150, 300, 300);
      this.ctx.fillStyle = '#2b2118';
      this.ctx.fillRect(brazier.x - 7, brazier.y - 12, 14, 16);
      this.ctx.fillStyle = '#b05a33';
      this.ctx.fillRect(brazier.x - 5, brazier.y - 16, 10, 6);
      this.ctx.fillStyle = '#f0a24e';
      this.ctx.fillRect(brazier.x - 3, brazier.y - 22 + Math.sin(this.elapsed * 9) * 2, 4, 8);
      this.ctx.fillStyle = '#ffe0a0';
      this.ctx.fillRect(brazier.x - 1, brazier.y - 19 + Math.sin(this.elapsed * 13) * 2, 2, 5);
    }
  }

  private drawSmoke(): void {
    const ctx = this.ctx;
    for (const vent of this.smokeVents) {
      for (let i = 0; i < 3; i++) {
        const phase =
          ((this.elapsed * 0.22 + i * 0.37 + vent.x * 0.0004) % 1 + 1) % 1;
        const x = vent.x + Math.sin(phase * 7 + i) * 12 * vent.scale;
        const y = vent.y - phase * 52 * vent.scale;
        ctx.globalAlpha = (1 - phase) * 0.13;
        ctx.fillStyle = i % 2 ? '#5d5950' : '#48443c';
        ctx.beginPath();
        ctx.arc(x, y, (5 + phase * 15) * vent.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawScorches(): void {
    for (const scorch of this.scorches) {
      const alpha = Math.min(0.6, scorch.life / scorch.maxLife + 0.15);
      const ctx = this.ctx;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#0a0a08';
      ctx.beginPath();
      ctx.ellipse(scorch.x, scorch.y, scorch.radius, scorch.radius * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha * 0.55;
      ctx.strokeStyle = scorch.heavy ? '#a36333' : '#3a332b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(scorch.x, scorch.y, scorch.radius * 0.8, scorch.radius * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (scorch.heavy && scorch.life > 1) {
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 + scorch.seed;
          ctx.fillStyle = i % 2 ? '#e9823e' : '#8b3e22';
          ctx.fillRect(
            scorch.x + Math.cos(angle) * scorch.radius * (0.35 + (i % 3) * 0.15) - 1,
            scorch.y + Math.sin(angle) * scorch.radius * 0.4 - 1,
            2,
            2,
          );
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawZones(): void {
    const ctx = this.ctx;
    for (const zone of this.zones) {
      const alpha = Math.min(0.22, zone.life / zone.maxLife * 0.2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = zone.color;
      ctx.beginPath();
      ctx.ellipse(zone.x, zone.y, zone.radius, zone.radius * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = Math.min(0.55, alpha * 2.2);
      ctx.strokeStyle = zone.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(zone.x, zone.y, zone.radius * 0.92, zone.radius * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const embers = Math.floor(zone.radius / 10);
      for (let i = 0; i < embers; i++) {
        const angle = (i / embers) * Math.PI * 2 + this.elapsed * 1.5;
        const rr = zone.radius * (0.3 + ((i * 37) % 60) / 100);
        ctx.fillStyle = i % 2 ? '#ffd38a' : zone.color;
        ctx.fillRect(
          zone.x + Math.cos(angle) * rr,
          zone.y + Math.sin(angle) * rr * 0.55 - ((this.elapsed * 20 + i * 17) % 25),
          2,
          2,
        );
      }
    }
  }

  private drawStrikeMarkers(): void {
    const ctx = this.ctx;
    for (const strike of this.strikes) {
      const progress = 1 - strike.time / strike.total;
      ctx.save();
      ctx.translate(strike.x, strike.y);
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = strike.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, strike.radius * (0.55 + progress * 0.45), strike.radius * 0.33, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.35 + Math.sin(this.elapsed * 20) * 0.15;
      ctx.beginPath();
      ctx.ellipse(0, 0, strike.radius * 0.22, strike.radius * 0.13, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.rotate(this.elapsed * 1.2 + strike.index);
      ctx.globalAlpha = 0.9;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = strike.color;
        ctx.fillRect(-1, -strike.radius * 0.55, 3, 12);
      }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#fff2c4';
      ctx.fillRect(-2, -2, 4, 4);
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#f2d58d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 10);
      ctx.stroke();
      ctx.restore();
      // incoming shaft
      if (strike.time < 0.25) {
        ctx.globalAlpha = 0.2 + (0.25 - strike.time) * 2;
        ctx.fillStyle = strike.color;
        ctx.fillRect(
          strike.x - strike.radius * 0.06,
          this.camera.y - 20,
          strike.radius * 0.12,
          Math.max(0, strike.y - this.camera.y + 20),
        );
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawBossTelegraphs(): void {
    const boss = this.boss;
    if (!boss || !boss.action) return;
    const action = boss.action;
    const progress = 1 - action.timer / action.total;
    const ctx = this.ctx;
    if (action.kind === 'slam') {
      ctx.save();
      ctx.globalAlpha = 0.22 + Math.sin(this.elapsed * 12) * 0.05;
      ctx.fillStyle = '#e15a4e';
      ctx.beginPath();
      ctx.ellipse(boss.x, boss.y, 150, 90, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ff8a72';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(boss.x, boss.y, 150 * Math.min(1, progress + 0.15), 90 * Math.min(1, progress + 0.15), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (action.kind === 'charge') {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#ff715c';
      ctx.lineWidth = 6;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(boss.x, boss.y);
      ctx.lineTo(boss.x + action.dirx * 560, boss.y + action.diry * 560);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = '#ffb09a';
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.moveTo(boss.x, boss.y);
      ctx.lineTo(boss.x + action.dirx * 560, boss.y + action.diry * 560);
      ctx.stroke();
      ctx.restore();
    } else if (action.kind === 'volley') {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = boss.bossDef.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y - 40, 70 + progress * 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawPickupMarkers(): void {
    // reserved for future beacon markers; pickups draw their own light
  }

  private drawPickups(): void {
    for (const pickup of this.pickups) {
      const bob = Math.sin(pickup.bob * 3) * 2;
      if (pickup.kind === 'medicae') {
        drawMedicae(this.ctx, pickup.x, pickup.y + bob, this.elapsed);
      } else {
        const color = pickup.buffId === 'relic_shield' ? '#b58ae8' : '#8fe0cc';
        drawDropCrate(this.ctx, pickup.x, pickup.y + bob, this.elapsed, color);
        const ctx = this.ctx;
        ctx.globalAlpha = 0.24 + Math.sin(this.elapsed * 6) * 0.07;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 9]);
        ctx.beginPath();
        ctx.moveTo(pickup.x, this.camera.y + 24);
        ctx.lineTo(pickup.x, pickup.y - 24);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = color;
        ctx.font = '9px "Zpix", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('补给', pickup.x, pickup.y - 42 + Math.sin(this.elapsed * 4) * 2);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawAllies(): void {
    for (const ally of this.allies) {
      if (ally.kind === 'converted') {
        drawServitor(this.ctx, ally.x, ally.y, this.elapsed + ally.id, ally.ranged);
        this.ctx.globalAlpha = 0.7;
        this.ctx.fillStyle = '#6fd1b6';
        this.ctx.fillRect(ally.x - 8, ally.y - 43, 16, 2);
        this.ctx.globalAlpha = 1;
      } else if (ally.kind === 'hound') {
        drawHound(this.ctx, ally.x, ally.y, this.elapsed + ally.id);
      } else if (ally.kind === 'servitor') {
        drawServitor(this.ctx, ally.x, ally.y, this.elapsed + ally.id, true);
      } else if (ally.kind === 'skull') {
        drawServoSkull(this.ctx, ally.x, ally.y, this.elapsed);
      } else {
        drawScarab(this.ctx, ally.x, ally.y, this.elapsed + ally.id);
      }
      if (ally.flash > 0) {
        this.ctx.globalAlpha = ally.flash * 0.5;
        this.ctx.fillStyle = '#dff';
        this.ctx.beginPath();
        this.ctx.arc(ally.x, ally.y - 15, ally.radius + 4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
      }
      if (ally.kind === 'converted' && ally.hp < ally.maxHp) {
        this.drawHealthBar(ally.x, ally.y - 40, ally.hp / ally.maxHp, '#6fd1b6', 22);
      }
    }
  }

  private drawEnemies(): void {
    const sorted = [...this.enemies].sort((a, b) => a.y - b.y);
    for (const enemy of sorted) {
      if (enemy.dead) continue;
      if (enemy.spawnT > 0) {
        this.ctx.globalAlpha = 1 - enemy.spawnT / 0.5;
        this.ctx.fillStyle = '#e15a4e';
        this.ctx.beginPath();
        this.ctx.arc(enemy.x, enemy.y, enemy.radius * (1.7 - enemy.spawnT), 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
      }
      drawEnemy(this.ctx, enemy.def.id, enemy.x, enemy.y, enemy.anim, {
        flash: enemy.flash,
        slow: enemy.slowTimer,
        elite: enemy.elite || enemy.gold,
      });
      if (enemy.gold) {
        this.ctx.globalAlpha = 0.35 + Math.sin(this.elapsed * 6) * 0.1;
        this.ctx.fillStyle = '#ffd36b';
        this.ctx.beginPath();
        this.ctx.arc(enemy.x, enemy.y - 20, enemy.radius + 8, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
      }
      if (enemy.slowTimer > 0) {
        this.ctx.globalAlpha = 0.45;
        this.ctx.fillStyle = '#9de7e9';
        this.ctx.fillRect(enemy.x - enemy.radius * 0.7, enemy.y - 5, enemy.radius * 1.4, 2);
        this.ctx.globalAlpha = 1;
      }
      if (enemy.elite || enemy.gold || enemy.hp < enemy.maxHp) {
        this.drawHealthBar(
          enemy.x,
          enemy.y - enemy.radius * 2 - 14,
          enemy.hp / enemy.maxHp,
          enemy.gold ? '#ffd36b' : enemy.elite ? '#c9a45c' : '#b9433f',
          enemy.elite || enemy.gold ? 28 : 20,
        );
      }
    }
    if (this.boss && !this.boss.dead) {
      drawBoss(
        this.ctx,
        this.boss.bossDef.id,
        this.boss.x,
        this.boss.y,
        this.elapsed,
        { flash: this.boss.flash, slow: this.boss.slowTimer, elite: true, enraged: this.boss.enraged },
        this.boss.hp / this.boss.maxHp,
      );
      if (this.boss.slowTimer > 0) {
        this.ctx.globalAlpha = 0.4;
        this.ctx.fillStyle = '#9de7e9';
        this.ctx.fillRect(this.boss.x - 38, this.boss.y - 8, 76, 3);
        this.ctx.globalAlpha = 1;
      }
    }
  }

  private drawHealthBar(x: number, y: number, fraction: number, color: string, width: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#080a0b';
    ctx.fillRect(Math.round(x - width / 2) - 1, Math.round(y) - 1, width + 2, 4);
    ctx.fillStyle = '#2d2924';
    ctx.fillRect(Math.round(x - width / 2), Math.round(y), width, 2);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - width / 2), Math.round(y), Math.max(0, width * fraction), 2);
  }

  private drawPlayer(): void {
    if (this.ending) {
      this.ctx.globalAlpha = Math.min(0.35, this.endTimer / 2);
    }
    drawPlayer(
      this.ctx,
      this.player.x,
      this.player.y,
      this.elapsed,
      this.player.lastSpeed > 0,
      this.player.aimAngle,
      this.player.muzzle,
      this.player.invuln,
      this.player.recoil,
      this.weaponStyle.id,
    );
    if (this.player.invuln > 0 && !this.ending) {
      this.ctx.globalAlpha = 0.22;
      this.ctx.strokeStyle = '#8ee0d4';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(this.player.x, this.player.y - 22, 28, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.globalAlpha = 1;
    }
    this.ctx.globalAlpha = 1;
  }

  private drawBolts(): void {
    const ctx = this.ctx;
    for (const bolt of this.bolts) {
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = bolt.color;
      ctx.lineWidth = bolt.fromSkill ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(bolt.px, bolt.py);
      ctx.lineTo(bolt.x, bolt.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = bolt.color;
      ctx.fillRect(Math.round(bolt.x) - 2, Math.round(bolt.y) - 2, 4, 4);
      ctx.fillStyle = '#fff7dc';
      ctx.fillRect(Math.round(bolt.x) - 1, Math.round(bolt.y) - 1, 2, 2);
    }
  }

  private drawEnemyBolts(): void {
    const ctx = this.ctx;
    for (const bolt of this.enemyBolts) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = bolt.color;
      ctx.beginPath();
      ctx.arc(bolt.x, bolt.y, bolt.radius * 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = bolt.color;
      ctx.beginPath();
      ctx.arc(bolt.x, bolt.y, bolt.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(bolt.x) - 1, Math.round(bolt.y) - 1, 2, 2);
    }
  }

  private drawSingularities(): void {
    const ctx = this.ctx;
    for (const sing of this.singularities) {
      const pulse = sing.time > 0 ? 1 + Math.sin(this.elapsed * 15) * 0.08 : 1;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#050806';
      ctx.beginPath();
      ctx.arc(sing.x, sing.y, sing.radius * 0.55 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#8ff0d4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sing.x, sing.y, sing.radius * 0.7 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#c7fff0';
      ctx.beginPath();
      ctx.arc(sing.x, sing.y, sing.radius * 1.45, this.elapsed, this.elapsed + Math.PI * 1.3);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawWeaponFx(): void {
    const ctx = this.ctx;
    for (const fx of this.weaponFx) {
      const alpha = Math.max(0, fx.life / fx.maxLife);
      ctx.save();
      ctx.translate(fx.x, fx.y);
      ctx.rotate(fx.angle);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = fx.color;
      ctx.lineCap = 'round';
      if (fx.kind === 'slash' || fx.kind === 'bash') {
        const width = fx.kind === 'bash' ? 8 : 5;
        ctx.lineWidth = width;
        ctx.globalAlpha = alpha * 0.35;
        ctx.beginPath();
        ctx.arc(0, 0, fx.range * 0.82, -fx.arc / 2, fx.arc / 2);
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, fx.range * 0.82, -fx.arc * 0.42, fx.arc * 0.42);
        ctx.stroke();
        if (fx.kind === 'bash') {
          ctx.globalAlpha = alpha * 0.7;
          ctx.fillStyle = fx.color;
          ctx.beginPath();
          ctx.moveTo(18, -20);
          ctx.lineTo(58, -32);
          ctx.lineTo(76, 0);
          ctx.lineTo(58, 32);
          ctx.lineTo(18, 20);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.globalAlpha = alpha * 0.55;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, fx.range * (1 - alpha * 0.45), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, fx.range * (1 - alpha * 0.45) + 6, 0, Math.PI * 2);
        ctx.stroke();
        if (fx.kind === 'slam') {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 16);
            ctx.lineTo(Math.cos(a) * fx.range * 0.7, Math.sin(a) * fx.range * 0.7);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawBeams(): void {
    const ctx = this.ctx;
    for (const beam of this.beams) {
      const alpha = Math.max(0, beam.life / beam.maxLife);
      if (beam.orbital) {
        const top = this.camera.y - 20;
        const gradient = ctx.createLinearGradient(beam.x, top, beam.x, beam.y);
        gradient.addColorStop(0, `rgba(255,246,210,${0.05 * alpha})`);
        gradient.addColorStop(0.65, `rgba(255,196,94,${0.65 * alpha})`);
        gradient.addColorStop(1, `rgba(255,255,255,${0.95 * alpha})`);
        ctx.globalAlpha = 1;
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.36;
        ctx.fillRect(beam.x - beam.width * 2.8, top, beam.width * 5.6, beam.y - top);
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(255,180,70,${0.55 * alpha})`;
        ctx.fillRect(beam.x - beam.width * 1.05, top, beam.width * 2.1, beam.y - top);
        ctx.fillStyle = `rgba(255,247,214,${0.98 * alpha})`;
        ctx.fillRect(beam.x - beam.width * 0.36, top, beam.width * 0.72, beam.y - top);
        const base = ctx.createRadialGradient(beam.x, beam.y, 0, beam.x, beam.y, beam.width * 5);
        base.addColorStop(0, `rgba(255,255,240,${0.9 * alpha})`);
        base.addColorStop(0.35, `rgba(255,186,82,${0.42 * alpha})`);
        base.addColorStop(1, 'rgba(255,150,50,0)');
        ctx.fillStyle = base;
        ctx.fillRect(beam.x - beam.width * 5, beam.y - beam.width * 5, beam.width * 10, beam.width * 10);
      } else {
        ctx.globalAlpha = alpha * 0.35;
        ctx.strokeStyle = beam.color;
        ctx.lineWidth = beam.width * 3;
        ctx.beginPath();
        ctx.moveTo(beam.x, beam.y);
        ctx.lineTo(beam.x2, beam.y2);
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#f4fff8';
        ctx.lineWidth = Math.max(1, beam.width * 0.5);
        ctx.beginPath();
        ctx.moveTo(beam.x, beam.y);
        ctx.lineTo(beam.x2, beam.y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawShockwaves(): void {
    const ctx = this.ctx;
    for (const wave of this.shockwaves) {
      const alpha = Math.max(0, wave.life / wave.maxLife);
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = wave.width * alpha;
      ctx.beginPath();
      ctx.ellipse(wave.x, wave.y, wave.radius, wave.radius * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.25;
      ctx.lineWidth = wave.width * 2;
      ctx.beginPath();
      ctx.ellipse(wave.x, wave.y, wave.radius * 0.9, wave.radius * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const particle of this.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      ctx.globalAlpha = alpha * (particle.glow ? 0.95 : 0.75);
      ctx.fillStyle = particle.color;
      const size = Math.max(1, particle.size * (0.5 + alpha * 0.5));
      ctx.fillRect(Math.round(particle.x), Math.round(particle.y), Math.round(size), Math.round(size));
    }
    ctx.globalAlpha = 1;
  }

  private drawFloats(): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const float of this.floats) {
      const alpha = Math.max(0, Math.min(1, float.life / float.maxLife));
      const scale = float.crit ? 1.15 : 1;
      ctx.globalAlpha = alpha;
      ctx.font = `${Math.round(float.size * scale)}px "Zpix", "Microsoft YaHei", monospace`;
      ctx.fillStyle = '#0b0c0d';
      ctx.fillText(float.text, float.x + 2, float.y + 2);
      ctx.fillStyle = float.color;
      ctx.fillText(float.text, float.x, float.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  private drawScreenOverlay(): void {
    const ctx = this.ctx;
    const screenX = this.player.x - this.camera.x;
    const screenY = this.player.y - this.camera.y;
    const light = ctx.createRadialGradient(screenX, screenY, 18, screenX, screenY, 330);
    light.addColorStop(0, 'rgba(255, 208, 138, 0.115)');
    light.addColorStop(0.42, 'rgba(255, 174, 92, 0.045)');
    light.addColorStop(1, 'rgba(255, 150, 70, 0)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // drifting ash motes, rendered in screen space
    for (const mote of this.ashMotes) {
      const x = (mote.x * VIEW_W + this.elapsed * mote.speed * 0.7) % VIEW_W;
      const y = (mote.y * VIEW_H + this.elapsed * mote.drift + VIEW_H) % VIEW_H;
      ctx.globalAlpha = mote.alpha * (0.65 + Math.sin(this.elapsed * 2 + mote.x * 9) * 0.35);
      ctx.fillStyle = mote.size > 1 ? '#a99575' : '#8a7e68';
      ctx.fillRect(Math.round(x), Math.round(y), mote.size, mote.size);
    }
    ctx.globalAlpha = 1;

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,225,170,${Math.min(0.45, this.flash)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.redFlash > 0) {
      const gradient = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 180, VIEW_W / 2, VIEW_H / 2, 570);
      gradient.addColorStop(0, 'rgba(190,40,35,0)');
      gradient.addColorStop(1, `rgba(190,40,35,${Math.min(0.65, this.redFlash)})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    const hpRatio = this.player.hp / this.player.maxHp;
    if (hpRatio < 0.35 && !this.ending) {
      const pulse = 0.12 + Math.sin(this.elapsed * 5) * 0.05;
      const gradient = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 220, VIEW_W / 2, VIEW_H / 2, 560);
      gradient.addColorStop(1, `rgba(180,30,25,${(0.35 - hpRatio) * 0.8 + pulse})`);
      gradient.addColorStop(0, 'rgba(180,30,25,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    const vignette = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 260, VIEW_W / 2, VIEW_H / 2, 640);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.52)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (this.hitStop > 0) {
      ctx.globalAlpha = this.hitStop * 1.8;
      ctx.fillStyle = '#fff4ce';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
  }

  private drawCrosshair(): void {
    if (this.paused || this.ending || !this.pointerInside.value) return;
    const ctx = this.ctx;
    const x = Math.round(this.pointer.x);
    const y = Math.round(this.pointer.y);
    const ready = this.charges >= 1;
    const color = ready ? '#f2d58d' : '#c45a4e';
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(x - 1, y - 1, 2, 2);
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + this.elapsed * 0.7;
      ctx.fillRect(x + Math.cos(angle) * 18 - 1, y + Math.sin(angle) * 18 - 1, 3, 3);
    }
    ctx.globalAlpha = 0.38;
    ctx.beginPath();
    ctx.arc(x, y, 23, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (!ready) {
      ctx.fillStyle = 'rgba(196,90,78,0.9)';
      ctx.font = '10px "Zpix", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('调度中', x, y + 35);
      ctx.textAlign = 'left';
    }
    if (this.noAmmoFlash > 0) {
      ctx.globalAlpha = this.noAmmoFlash * 0.5;
      ctx.strokeStyle = '#ff6c56';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 22 + (1 - this.noAmmoFlash) * 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ============================================================
  // HUD
  // ============================================================

  private buildHud(): HudState {
    const skillHuds: HudSkill[] = this.skills.map((skill) => ({
      id: skill.def.id,
      name: skill.def.name,
      icon: skill.def.icon,
      color: skill.def.color,
      level: skill.level,
      cooldown: Math.max(0, skill.cooldown),
      total: skill.total,
      ready: skill.cooldown <= 0,
    }));
    const boss = this.boss;
    return {
      hp: Math.max(0, this.player.hp),
      maxHp: this.player.maxHp,
      kills: this.kills,
      quota: 0,
      time: this.elapsed,
      combo: this.combo,
      comboTimer: this.comboTimer,
      charges: Math.floor(this.charges),
      maxCharges: this.stats.orbitalCharges,
      rechargeProgress: this.charges >= this.stats.orbitalCharges ? 1 : this.chargeAccum,
      bossActive: !!boss && (!boss.dead || this.ending),
      bossName: boss?.bossDef.name ?? '',
      bossTitle: boss?.bossDef.title ?? '',
      bossPortrait: boss?.bossDef.portrait,
      bossColor: boss?.bossDef.color,
      bossHp: boss ? Math.max(0, boss.hp) : 0,
      bossMaxHp: boss?.maxHp ?? 0,
      bossPhase: boss ? Math.max(0, boss.hp / boss.maxHp) : 0,
      bossKilled: this.bossKilled,
      bossSpawned: this.bossSpawned,
      ending: this.ending,
      victory: false,
      paused: this.paused,
      skills: skillHuds,
      buffs: this.buffs.map((buff) => ({
        id: buff.id,
        name: buff.name,
        color: buff.color,
        time: Math.max(0, buff.time),
        maxTime: buff.maxTime,
      })),
      allies: this.countConverted(),
      maxAllies: this.stats.maxTames,
      totalAllies: this.allies.length,
      lootGelt: Math.floor(this.loot.gelt ?? 0),
      objective:
        this.boss && !this.boss.dead
          ? '首领威胁中 · 击杀可获得遗产宝箱'
          : `下一首领 ${Math.floor(Math.max(0, this.endlessBossAt - this.elapsed) / 60)}:${String(
              Math.floor(Math.max(0, this.endlessBossAt - this.elapsed) % 60),
            ).padStart(2, '0')}`,
      endless: true,
      nextBossIn: Math.max(0, this.endlessBossAt - this.elapsed),
      bossCount: this.endlessBossKills,
      chests: this.endlessChests,
      autoStrike: this.stats.autoStrike,
      noAmmo: this.noAmmoFlash > 0,
      strikes: this.strikesUsed,
      institution: this.config.institution.id,
      institutionName: this.config.institution.name,
      threat: 0,
      weaponName: this.weaponName,
      weaponMode: this.weaponStyle.label,
    };
  }

  private pushHud(): void {
    const energy = Math.min(1, this.elapsed / 300);
    audio.setBattleEnergy(energy);
    this.callbacks.onHud(this.buildHud());
  }

  // ============================================================
  // Ground
  // ============================================================

  private buildGround(seed: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = this.world.w;
    canvas.height = this.world.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rand = mulberry32(seed);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1b1c17';
    ctx.fillRect(0, 0, this.world.w, this.world.h);
    // stone tiles
    const tile = 56;
    for (let y = 0; y < this.world.h; y += tile) {
      for (let x = 0; x < this.world.w; x += tile) {
        const variation = Math.floor(rand() * 19);
        ctx.fillStyle = `rgb(${31 + variation},${32 + variation},${26 + Math.floor(variation * 0.8)})`;
        ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
        if (rand() < 0.55) {
          ctx.fillStyle = 'rgba(7,8,6,0.34)';
          ctx.fillRect(x, y, tile, 1);
        }
        if (rand() < 0.32) {
          ctx.fillStyle = 'rgba(130,118,88,0.13)';
          ctx.fillRect(x + 6 + rand() * 30, y + 8 + rand() * 30, 6 + rand() * 12, 1);
        }
        if (rand() < 0.18) {
          ctx.fillStyle = 'rgba(82,75,55,0.12)';
          ctx.fillRect(x + 4 + rand() * 40, y + 4 + rand() * 40, 2, 2 + rand() * 4);
        }
      }
    }
    // central cathedral plaza
    const cx = this.world.w / 2;
    const cy = this.world.h / 2;
    ctx.fillStyle = '#1c1c17';
    ctx.beginPath();
    ctx.arc(cx, cy, 330, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,150,90,0.14)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 300, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(180,150,90,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 225, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      ctx.strokeStyle = 'rgba(160,145,105,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * 70, cy + Math.sin(angle) * 70);
      ctx.lineTo(cx + Math.cos(angle) * 300, cy + Math.sin(angle) * 300);
      ctx.stroke();
    }
    // aquila inlay
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#c9a45c';
    ctx.fillRect(-5, -72, 10, 144);
    ctx.fillRect(-54, -28, 108, 7);
    ctx.fillRect(-84, -48, 34, 5);
    ctx.fillRect(50, -48, 34, 5);
    ctx.fillRect(-70, 22, 52, 5);
    ctx.fillRect(18, 22, 52, 5);
    ctx.fillRect(-7, -78, 14, 4);
    ctx.fillRect(-3, -86, 6, 8);
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = '#d9c58f';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 110 + i * 42, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // cracks
    for (let i = 0; i < 85; i++) {
      let x = rand() * this.world.w;
      let y = rand() * this.world.h;
      ctx.strokeStyle = `rgba(5,6,5,${0.25 + rand() * 0.3})`;
      ctx.lineWidth = 1 + rand() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 4 + rand() * 7; j++) {
        x += (rand() - 0.5) * 38;
        y += rand() * 20 - 8;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // craters
    for (let i = 0; i < 22; i++) {
      const x = rand() * this.world.w;
      const y = rand() * this.world.h;
      const r = 18 + rand() * 54;
      ctx.fillStyle = `rgba(6,7,6,${0.24 + rand() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,105,75,0.09)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.85, r * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // rubble clusters
    for (let i = 0; i < 380; i++) {
      const x = rand() * this.world.w;
      const y = rand() * this.world.h;
      if (Math.hypot(x - cx, y - cy) < 110) continue;
      const s = 1 + rand() * 4;
      ctx.fillStyle = rand() < 0.5 ? '#33342e' : '#25261f';
      ctx.fillRect(x, y, s, s);
      if (rand() < 0.25) {
        ctx.fillStyle = 'rgba(160,140,100,0.14)';
        ctx.fillRect(x, y - 1, s * 1.4, 1);
      }
    }
    // pillars/ruin bases
    const pillarPositions = [
      [cx - 390, cy - 190],
      [cx + 380, cy - 210],
      [cx - 355, cy + 240],
      [cx + 365, cy + 210],
      [cx - 760, cy - 380],
      [cx + 740, cy + 330],
    ];
    for (const [px, py] of pillarPositions) {
      ctx.fillStyle = 'rgba(7,8,7,0.5)';
      ctx.beginPath();
      ctx.ellipse(px + 22, py + 17, 72, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#25251f';
      ctx.fillRect(px - 40, py - 26, 80, 56);
      ctx.fillStyle = '#34342b';
      ctx.fillRect(px - 31, py - 34, 62, 15);
      ctx.fillStyle = '#1b1b16';
      ctx.fillRect(px - 20, py - 10, 40, 38);
      ctx.strokeStyle = 'rgba(168,143,92,0.16)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - 31, py - 34, 62, 64);
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = 'rgba(70,66,50,0.6)';
        ctx.fillRect(px - 35 + rand() * 65, py + 25 + rand() * 15, 5 + rand() * 14, 4);
      }
    }
    // candles / bones / skulls
    for (let i = 0; i < 120; i++) {
      const x = rand() * this.world.w;
      const y = rand() * this.world.h;
      if (rand() < 0.55) {
        ctx.fillStyle = '#b9a77f';
        ctx.fillRect(x, y, 2, 4);
        ctx.fillStyle = '#d98e45';
        ctx.fillRect(x, y - 2, 2, 2);
      } else {
        ctx.fillStyle = '#9c9072';
        ctx.fillRect(x, y, 5, 3);
        ctx.fillRect(x + 1, y + 2, 3, 1);
        ctx.fillStyle = '#151611';
        ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x + 3, y, 1, 1);
      }
    }
    // large dark gothic motifs near edges
    for (let i = 0; i < 18; i++) {
      const x = rand() * this.world.w;
      const y = rand() < 0.5 ? rand() * 80 : this.world.h - rand() * 80;
      ctx.strokeStyle = 'rgba(140,120,80,0.1)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 30);
      ctx.lineTo(x + 20, y);
      ctx.lineTo(x, y + 30);
      ctx.lineTo(x - 20, y);
      ctx.closePath();
      ctx.stroke();
    }

    // ruined barricades and sandbags
    for (let i = 0; i < 14; i++) {
      const x = 140 + rand() * (this.world.w - 280);
      const y = 140 + rand() * (this.world.h - 280);
      if (Math.hypot(x - cx, y - cy) < 160) continue;
      const horizontal = rand() < 0.5;
      const length = 42 + rand() * 54;
      for (let j = 0; j < 7; j++) {
        const bx = x + (horizontal ? j * (length / 7) : (rand() - 0.5) * 8);
        const by = y + (horizontal ? (rand() - 0.5) * 8 : j * (length / 7));
        ctx.fillStyle = j % 2 ? '#47453a' : '#39382f';
        ctx.fillRect(bx, by, 9, 6);
        ctx.fillStyle = 'rgba(150,130,90,0.1)';
        ctx.fillRect(bx + 1, by, 6, 1);
      }
    }

    // puddles with a faint reflective edge
    for (let i = 0; i < 18; i++) {
      const x = 90 + rand() * (this.world.w - 180);
      const y = 90 + rand() * (this.world.h - 180);
      const rx = 12 + rand() * 34;
      ctx.fillStyle = 'rgba(9,14,14,0.45)';
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rx * 0.35, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(99,124,115,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, rx * 0.9, rx * 0.31, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // bone piles and small skulls
    for (let i = 0; i < 44; i++) {
      const x = 80 + rand() * (this.world.w - 160);
      const y = 80 + rand() * (this.world.h - 160);
      ctx.fillStyle = 'rgba(154,143,114,0.42)';
      const bones = 2 + Math.floor(rand() * 4);
      for (let j = 0; j < bones; j++) {
        const angle = rand() * Math.PI;
        const bx = x + Math.cos(angle) * (rand() * 13);
        const by = y + Math.sin(angle) * (rand() * 7);
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(angle);
        ctx.fillRect(0, 0, 7, 2);
        ctx.fillStyle = '#1a1a14';
        ctx.fillRect(0, 0, 2, 1);
        ctx.restore();
        ctx.fillStyle = 'rgba(154,143,114,0.42)';
      }
      if (rand() < 0.5) {
        ctx.fillStyle = 'rgba(184,171,139,0.6)';
        ctx.fillRect(x + 4, y - 3, 5, 4);
        ctx.fillStyle = '#1a1a14';
        ctx.fillRect(x + 5, y - 2, 1, 1);
        ctx.fillRect(x + 7, y - 2, 1, 1);
      }
    }

    // clusters of candles around the plaza and ruins
    for (let i = 0; i < 26; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = 120 + rand() * 430;
      const x = clamp(cx + Math.cos(angle) * radius, 70, this.world.w - 70);
      const y = clamp(cy + Math.sin(angle) * radius, 70, this.world.h - 70);
      for (let j = 0; j < 3 + Math.floor(rand() * 4); j++) {
        const cxp = x + (rand() - 0.5) * 22;
        const cyp = y + (rand() - 0.5) * 14;
        ctx.fillStyle = '#c4b48c';
        ctx.fillRect(cxp, cyp, 2, 5);
        ctx.fillStyle = '#eaa44e';
        ctx.fillRect(cxp, cyp - 2, 2, 2);
        ctx.fillStyle = 'rgba(234,164,78,0.07)';
        ctx.beginPath();
        ctx.arc(cxp + 1, cyp - 1, 9 + rand() * 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // broken aquila statues on plinths
    const statueSpots = [
      [cx - 430, cy - 270],
      [cx + 440, cy - 220],
      [cx - 390, cy + 320],
      [cx + 460, cy + 290],
    ];
    for (const [sx, sy] of statueSpots) {
      ctx.fillStyle = 'rgba(7,8,7,0.55)';
      ctx.beginPath();
      ctx.ellipse(sx + 18, sy + 18, 58, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#30302a';
      ctx.fillRect(sx - 30, sy - 12, 60, 36);
      ctx.fillStyle = '#424137';
      ctx.fillRect(sx - 24, sy - 18, 48, 12);
      ctx.fillStyle = '#1b1c17';
      ctx.fillRect(sx - 16, sy - 10, 32, 22);
      ctx.strokeStyle = 'rgba(201,164,92,0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 3, sy - 54);
      ctx.lineTo(sx - 3, sy - 14);
      ctx.moveTo(sx - 22, sy - 42);
      ctx.lineTo(sx + 16, sy - 42);
      ctx.moveTo(sx - 26, sy - 50);
      ctx.lineTo(sx - 8, sy - 44);
      ctx.moveTo(sx + 20, sy - 50);
      ctx.lineTo(sx + 2, sy - 44);
      ctx.stroke();
      ctx.fillStyle = 'rgba(180,151,89,0.16)';
      ctx.fillRect(sx - 7, sy - 59, 8, 5);
    }

    // scorched pavement patches
    for (let i = 0; i < 30; i++) {
      const x = 80 + rand() * (this.world.w - 160);
      const y = 80 + rand() * (this.world.h - 160);
      const r = 18 + rand() * 60;
      ctx.fillStyle = `rgba(4,5,4,${0.12 + rand() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.5, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // wrecked armoured vehicles: burned-out anchors for the battlefield
    const wrecks: Array<[number, number, number, string]> = [
      [cx - 520, cy + 155, 0.28, '#3b4437'],
      [cx + 500, cy - 145, -0.42, '#472a29'],
      [cx + 130, cy - 430, 1.1, '#3b3d38'],
      [cx - 310, cy + 425, -0.72, '#33382f'],
    ];
    for (const [wx, wy, angle, color] of wrecks) {
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(angle);
      ctx.fillStyle = 'rgba(4,5,4,0.58)';
      ctx.beginPath();
      ctx.ellipse(12, 15, 74, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1c17';
      ctx.fillRect(-55, -28, 105, 9);
      ctx.fillRect(-55, 18, 105, 9);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-50, -24);
      ctx.lineTo(37, -24);
      ctx.lineTo(55, -10);
      ctx.lineTo(55, 17);
      ctx.lineTo(38, 26);
      ctx.lineTo(-50, 26);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(190,170,125,0.16)';
      ctx.fillRect(-46, -20, 82, 3);
      ctx.fillRect(-46, 18, 82, 3);
      ctx.fillStyle = '#2d302b';
      ctx.beginPath();
      ctx.arc(2, 0, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#464a40';
      ctx.fillRect(1, -4, 28, 7);
      ctx.fillRect(-8, -10, 17, 19);
      ctx.fillStyle = 'rgba(143,49,42,0.38)';
      ctx.fillRect(-43, -14, 22, 2);
      ctx.fillStyle = 'rgba(29,25,20,0.65)';
      ctx.fillRect(-20, -18, 30, 9);
      ctx.fillRect(30, 6, 17, 8);
      ctx.restore();
    }
    this.smokeVents = wrecks.map(([wx, wy, ,], index) => ({
      x: wx + (index % 2 ? 25 : -20),
      y: wy - 8,
      scale: 0.85 + (index % 3) * 0.12,
    }));

    // fallen banners and cloth
    const bannerSpots: Array<[number, number, string]> = [
      [cx - 620, cy - 250, '#6b2a28'],
      [cx + 620, cy + 170, '#5a2422'],
      [cx - 120, cy - 520, '#44312a'],
      [cx + 320, cy + 500, '#52231f'],
    ];
    for (const [bx, by, color] of bannerSpots) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate((rand() - 0.5) * 0.5);
      ctx.fillStyle = '#201b16';
      ctx.fillRect(-2, -48, 4, 52);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(2, -46);
      ctx.lineTo(42, -34);
      ctx.lineTo(34, 2);
      ctx.lineTo(6, -8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(201,164,92,0.32)';
      ctx.fillRect(9, -34, 15, 2);
      ctx.fillRect(16, -39, 2, 13);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(22, -22, 12, 3);
      ctx.restore();
    }

    // border walls
    ctx.fillStyle = 'rgba(5,6,5,0.92)';
    ctx.fillRect(0, 0, this.world.w, 54);
    ctx.fillRect(0, this.world.h - 54, this.world.w, 54);
    ctx.fillRect(0, 0, 54, this.world.h);
    ctx.fillRect(this.world.w - 54, 0, 54, this.world.h);
    ctx.fillStyle = 'rgba(110,90,55,0.12)';
    for (let i = 0; i < 40; i++) {
      const x = (i / 40) * this.world.w;
      ctx.fillRect(x, 54, 4, 18 + (i % 4) * 8);
      ctx.fillRect(x, this.world.h - 54 - (18 + (i % 3) * 6), 4, 18 + (i % 3) * 6);
    }
    this.ground = canvas;
    // braziers placed around the plaza
    this.braziers = [
      { x: cx - 280, y: cy - 150, size: 1 },
      { x: cx + 280, y: cy - 140, size: 1 },
      { x: cx - 275, y: cy + 170, size: 1 },
      { x: cx + 300, y: cy + 160, size: 1 },
      { x: cx - 690, y: cy - 360, size: 1 },
      { x: cx + 680, y: cy + 350, size: 1 },
      { x: cx - 510, y: cy + 185, size: 1 },
      { x: cx + 510, y: cy - 115, size: 1 },
      { x: cx + 150, y: cy - 390, size: 1 },
    ];
  }
}

function playerRadius(): number {
  return 12;
}
