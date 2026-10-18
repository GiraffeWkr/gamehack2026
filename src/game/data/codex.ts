import type { CodexNodeDef, StatBlock } from '../types';

interface NodeSeed {
  id: string;
  tier: number;
  name: string;
  desc: string;
  icon: CodexNodeDef['icon'];
  effect: StatBlock;
  maxRank?: number;
  special?: CodexNodeDef['special'];
}

const RAW: Record<CodexNodeDef['branch'], NodeSeed[]> = {
  wrath: [
    {
      id: 'wrath_litany',
      tier: 1,
      name: '怒火祷言',
      desc: '审判官的每一次扣动扳机，都是一段祷告。',
      icon: 'flame',
      effect: { damagePct: 8 },
    },
    {
      id: 'wrath_bolt',
      tier: 2,
      name: '爆弹增幅',
      desc: '机魂解锁第二套供弹轨。多一发，就是多一条命。',
      icon: 'bolt',
      effect: { projectiles: 1 },
      maxRank: 2,
    },
    {
      id: 'wrath_rapid',
      tier: 3,
      name: '致命节奏',
      desc: '呼吸与枪机同步。别停，停了就会听见低语。',
      icon: 'boltPistol',
      effect: { attackSpeedPct: 7 },
    },
    {
      id: 'wrath_mark',
      tier: 4,
      name: '猎杀标记',
      desc: '在异形的颅骨上画一个只有你看得见的十字。',
      icon: 'target',
      effect: { critChance: 4 },
    },
    {
      id: 'wrath_execute',
      tier: 5,
      name: '处决协议',
      desc: '审判庭不要求俘虏。它只要求确认。',
      icon: 'skull',
      effect: { critDamagePct: 30 },
    },
    {
      id: 'wrath_double',
      tier: 6,
      name: '双重打击',
      desc: '第一发是警告。第二发才是审判。',
      icon: 'diamond',
      effect: { doubleChance: 5 },
    },
    {
      id: 'wrath_pierce',
      tier: 7,
      name: '穿甲弹头',
      desc: '把整条战线串在一起，只需要一颗正确的子弹。',
      icon: 'arrow',
      effect: { pierce: 1 },
    },
    {
      id: 'wrath_calibration',
      tier: 8,
      name: '轨道校准',
      desc: '舰炮的落点误差从十二米压到一米。足够了。',
      icon: 'beacon',
      effect: { orbitalDamagePct: 14 },
    },
    {
      id: 'wrath_saturation',
      tier: 9,
      name: '饱和轰击',
      desc: '一发不够，就再叫一发。帝皇从不吝啬火力。',
      icon: 'beacon',
      effect: { orbitalShells: 1 },
      maxRank: 2,
    },
    {
      id: 'wrath_exterminatus',
      tier: 10,
      name: '灭绝令',
      desc: '对首领级目标，圣典允许使用更彻底的措辞。',
      icon: 'skull',
      effect: { bossDamagePct: 10 },
    },
  ],
  aegis: [
    {
      id: 'aegis_emperor',
      tier: 1,
      name: '帝皇庇佑',
      desc: '帝皇保护那些保护帝国的人。至少经文是这么写的。',
      icon: 'aquila',
      effect: { hpPct: 10 },
    },
    {
      id: 'aegis_adamant',
      tier: 2,
      name: '精金甲胄',
      desc: '在盔甲内侧再焊一层甲。机械教说这很浪费。',
      icon: 'shield',
      effect: { armor: 8 },
    },
    {
      id: 'aegis_medicae',
      tier: 3,
      name: '战地医疗',
      desc: '一针兴奋剂，一段短祷，然后继续前进。',
      icon: 'drop',
      effect: { regen: 1.5 },
    },
    {
      id: 'aegis_evasion',
      tier: 4,
      name: '闪避本能',
      desc: '活下来的审判官都相信直觉。死掉的也是。',
      icon: 'eye',
      effect: { dodge: 3 },
    },
    {
      id: 'aegis_withdrawal',
      tier: 5,
      name: '快速撤离',
      desc: '战术转进。不是逃跑。',
      icon: 'arrow',
      effect: { moveSpeedPct: 5 },
    },
    {
      id: 'aegis_magnet',
      tier: 6,
      name: '磁力拾取',
      desc: '机仆伸出磁力臂，把战利品从尸体堆里拽出来。',
      icon: 'diamond',
      effect: { pickupRadius: 18 },
    },
    {
      id: 'aegis_conversion',
      tier: 7,
      name: '机仆化圣礼',
      desc: '死亡不是终点。只是转换成更有效率的劳动力。',
      icon: 'cog',
      effect: { tameChance: 2 },
    },
    {
      id: 'aegis_protocol',
      tier: 8,
      name: '机仆战斗协议',
      desc: '被改造的异形学会了一件事：替帝皇杀人。',
      icon: 'servitor',
      effect: { summonDamagePct: 14 },
    },
    {
      id: 'aegis_expansion',
      tier: 9,
      name: '机仆扩编',
      desc: '技术神甫增加了随行载具的挂载点。',
      icon: 'servitor',
      effect: { maxTames: 1 },
      maxRank: 2,
    },
    {
      id: 'aegis_unyielding',
      tier: 10,
      name: '不屈圣言',
      desc: '当疼痛达到某个阈值，信仰会替你关掉它。',
      icon: 'book',
      effect: { damageReduction: 4 },
    },
  ],
  machine: [
    {
      id: 'machine_spirit',
      tier: 1,
      name: '机魂祝祷',
      desc: '对机魂说正确的话，它就会给出正确的回应。',
      icon: 'cog',
      effect: { skillDamagePct: 8 },
    },
    {
      id: 'machine_cooldown',
      tier: 2,
      name: '冷却调度',
      desc: '把冷却管线接进舰船主循环。',
      icon: 'clock',
      effect: { skillCooldownPct: 6 },
    },
    {
      id: 'machine_quota',
      tier: 3,
      name: '火力配额',
      desc: '向舰桥申请额外的投送窗口。他们会骂你，然后给你。',
      icon: 'target',
      effect: { orbitalCharges: 1 },
      maxRank: 2,
    },
    {
      id: 'machine_logistics',
      tier: 4,
      name: '调度加速',
      desc: '把弹药从仓库到炮膛的时间压掉三秒。',
      icon: 'clock',
      effect: { orbitalRechargePct: 9 },
    },
    {
      id: 'machine_radius',
      tier: 5,
      name: '爆炸半径',
      desc: '舰炮的爆心投影扩大了一圈。别站在里面。',
      icon: 'target',
      effect: { orbitalRadiusPct: 9 },
    },
    {
      id: 'machine_gelt',
      tier: 6,
      name: '王座币红利',
      desc: '内政部终于承认了你的远征报销单。',
      icon: 'gelt',
      effect: { geltPct: 10 },
    },
    {
      id: 'machine_luck',
      tier: 7,
      name: '战利品鉴定',
      desc: '技术神甫能分辨“圣物”和“值钱的废铁”。',
      icon: 'star',
      effect: { luck: 4 },
    },
    {
      id: 'machine_find',
      tier: 8,
      name: '亚空间信标',
      desc: '每个战场都会留下可以重新标定的信标。',
      icon: 'beacon',
      effect: { dropChance: 6 },
    },
    {
      id: 'machine_auto',
      tier: 9,
      name: '自动交战',
      desc: '把瞄准回路交给舰船。你只需要活着。',
      icon: 'target',
      effect: {},
      maxRank: 1,
      special: 'autoStrike',
    },
    {
      id: 'machine_omnissiah',
      tier: 10,
      name: '万机神恩',
      desc: '万机神注视着你。祂的注视很重，但很有用。',
      icon: 'cog',
      effect: { damagePct: 6, hpPct: 6 },
    },
  ],
};

const BASE_GELT = [45, 72, 108, 162, 240, 352, 517, 750, 1080, 1530];
const BASE_MAT = [0, 0, 8, 12, 18, 27, 42, 60, 90, 135];

const BRANCH_MAT: Record<CodexNodeDef['branch'], CodexNodeDef['mat']> = {
  wrath: 'teef',
  aegis: 'plasteel',
  machine: 'warpDust',
};

function buildBranch(branch: CodexNodeDef['branch']): CodexNodeDef[] {
  return RAW[branch].map((seed, index) => {
    const baseGelt = Math.round(BASE_GELT[index] * (branch === 'machine' ? 1.12 : 1));
    const baseMat = BASE_MAT[index];
    return {
      ...seed,
      branch,
      baseGelt,
      mat: baseMat > 0 ? BRANCH_MAT[branch] : undefined,
      baseMat: baseMat > 0 ? Math.round(baseMat * (branch === 'machine' ? 1.2 : 1)) : undefined,
      requires: index > 0 ? RAW[branch][index - 1].id : undefined,
      maxRank: seed.maxRank ?? 3,
      effect: seed.effect,
    };
  });
}

export const CODEX_NODES: CodexNodeDef[] = [
  ...buildBranch('wrath'),
  ...buildBranch('aegis'),
  ...buildBranch('machine'),
];

export const CODEX_BY_ID: Record<string, CodexNodeDef> = Object.fromEntries(
  CODEX_NODES.map((node) => [node.id, node]),
);

export const CODEX_BRANCHES: Record<
  CodexNodeDef['branch'],
  { name: string; english: string; color: string; description: string }
> = {
  wrath: {
    name: '怒火',
    english: 'WRATH',
    color: '#c35f4f',
    description: '爆弹、暴击与轨道火力。把每一次打击都变成处决。',
  },
  aegis: {
    name: '壁垒',
    english: 'AEGIS',
    color: '#c9a45c',
    description: '生存、机仆化与战场续航。活着的人才能继续净化。',
  },
  machine: {
    name: '机魂',
    english: 'MACHINE',
    color: '#5fb7ad',
    description: '技能、配额与经济。让舰船替你做更多的事。',
  },
};

export function getCodexCost(node: CodexNodeDef, currentRank: number): { gelt: number; mat?: number } {
  const gelt = Math.round(node.baseGelt * Math.pow(1.85, currentRank));
  const mat =
    node.baseMat !== undefined ? Math.round(node.baseMat * Math.pow(1.55, currentRank)) : undefined;
  return { gelt, mat };
}
