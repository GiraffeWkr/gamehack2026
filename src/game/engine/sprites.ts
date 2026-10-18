// Pixel sprites are drawn with hard-edged rectangles on a 960x540 internal canvas.
// This keeps every unit readable at the game's 2x display scale.

type Ctx = CanvasRenderingContext2D;

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function shadow(ctx: Ctx, x: number, y: number, rx: number, alpha = 0.45): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function flashOverlay(ctx: Ctx, x: number, y: number, w: number, h: number, alpha: number): void {
  if (alpha <= 0) return;
  ctx.globalAlpha = Math.min(0.85, alpha);
  ctx.fillStyle = '#fff7df';
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.globalAlpha = 1;
}

export interface EnemyVisualState {
  flash: number;
  slow: number;
  elite: boolean;
  enraged?: boolean;
}

export function drawPlayer(
  ctx: Ctx,
  x: number,
  y: number,
  t: number,
  moving: boolean,
  aimAngle: number,
  muzzle: number,
  invuln: number,
  recoil = 0,
  weaponType = 'thunder_hammer',
): void {
  const bob = moving ? Math.sin(t * 13) * 1.5 : Math.sin(t * 3.4) * 0.7;
  const stride = moving ? Math.sin(t * 13) * 3 : 0;
  const facing = Math.cos(aimAngle) >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.globalAlpha = 0.32;
  ctx.strokeStyle = '#d7b25e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 7, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.scale(facing, 1);
  shadow(ctx, 0, 1, 16, 0.5);
  if (invuln > 0) {
    ctx.globalAlpha = 0.65 + Math.sin(t * 30) * 0.2;
  }

  // cloak behind
  ctx.fillStyle = '#421416';
  ctx.beginPath();
  ctx.moveTo(-13, -34 + bob);
  ctx.lineTo(9, -36 + bob);
  ctx.lineTo(17, -7);
  ctx.lineTo(9 + Math.sin(t * 5) * 2, 2);
  ctx.lineTo(-16 + Math.cos(t * 4) * 2, -2);
  ctx.closePath();
  ctx.fill();
  rect(ctx, -11, -30 + bob, 4, 26, '#5a1b1d');
  rect(ctx, 5, -30 + bob, 4, 25, '#5a1b1d');

  // legs
  rect(ctx, -8 + stride, -12, 6, 12, '#14181c');
  rect(ctx, 3 - stride, -12, 6, 12, '#14181c');
  rect(ctx, -9 + stride, -3, 8, 4, '#0a0c0e');
  rect(ctx, 2 - stride, -3, 8, 4, '#0a0c0e');

  // torso armor
  rect(ctx, -10, -33 + bob, 20, 21, '#202830');
  rect(ctx, -8, -32 + bob, 16, 17, '#2a333b');
  rect(ctx, -3, -31 + bob, 6, 15, '#3a444b');
  rect(ctx, -11, -27 + bob, 22, 3, '#a98245');
  rect(ctx, -10, -22 + bob, 20, 2, '#6e522e');
  // chest aquila
  rect(ctx, -4, -28 + bob, 2, 5, '#d8b56a');
  rect(ctx, 2, -28 + bob, 2, 5, '#d8b56a');
  rect(ctx, -2, -26 + bob, 4, 2, '#d8b56a');
  rect(ctx, -8, -29 + bob, 3, 4, '#d8b56a');
  rect(ctx, 5, -29 + bob, 3, 4, '#d8b56a');

  // shoulder pads
  rect(ctx, -15, -33 + bob, 7, 8, '#1a2026');
  rect(ctx, 8, -33 + bob, 7, 8, '#1a2026');
  rect(ctx, -15, -33 + bob, 7, 2, '#b08c4e');
  rect(ctx, 8, -33 + bob, 7, 2, '#b08c4e');

  // purity seals
  rect(ctx, -9, -19 + bob, 3, 7, '#c9be9b');
  rect(ctx, -8, -13 + bob, 2, 5, '#9b2f2b');
  rect(ctx, 6, -20 + bob, 3, 6, '#c9be9b');

  // head
  rect(ctx, -6, -44 + bob, 12, 12, '#c6a078');
  rect(ctx, -6, -44 + bob, 12, 3, '#8d6b4c');
  rect(ctx, -5, -38 + bob, 4, 2, '#77d6b7');
  rect(ctx, 2, -38 + bob, 3, 2, '#77d6b7');
  rect(ctx, -2, -35 + bob, 4, 1, '#5b4030');
  // peaked hat
  rect(ctx, -13, -49 + bob, 26, 4, '#111417');
  rect(ctx, -9, -55 + bob, 18, 7, '#181d21');
  rect(ctx, -9, -49 + bob, 18, 2, '#a98245');
  rect(ctx, -2, -58 + bob, 4, 4, '#b0894b');
  rect(ctx, -1, -60 + bob, 2, 3, '#e0c077');
  // rosary
  rect(ctx, -11, -36 + bob, 2, 14, '#8e7442');
  rect(ctx, -12, -25 + bob, 4, 4, '#d3b369');

  // free hand / sword hilt
  rect(ctx, -12, -27 + bob, 3, 16, '#1c242a');
  rect(ctx, -13, -12 + bob, 5, 3, '#c9a45c');

  ctx.restore();

  // The body is mirrored for left/right facing, but the gun arm lives in
  // screen space. That way the barrel can track a target in any direction
  // without the mirror transform flipping the angle back to the right.
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (invuln > 0) {
    ctx.globalAlpha = 0.65 + Math.sin(t * 30) * 0.2;
  }
  ctx.translate(facing * 6, -28 + bob);
  ctx.translate(-recoil * 2.5, 0);
  const swing = muzzle > 0 ? (1 - muzzle) * 1.25 - 0.62 : 0;
  const melee = weaponType === 'chainsword' || weaponType === 'thunder_hammer' || weaponType === 'storm_shield';
  ctx.rotate(aimAngle + (melee ? swing : 0));
  rect(ctx, -3, -1, 5, 7, '#1a2026');

  if (weaponType === 'chainsword') {
    rect(ctx, 0, -3, 8, 6, '#3a3025');
    rect(ctx, 8, -2, 28, 4, '#8f9697');
    for (let i = 0; i < 8; i++) {
      rect(ctx, 10 + i * 3.2, -5, 2, 3, '#d6d9d2');
      rect(ctx, 10 + i * 3.2, 2, 2, 3, '#b7b1a2');
    }
    rect(ctx, 34, -3, 3, 6, '#d7b25e');
    rect(ctx, 6, 2, 3, 5, '#7b5e36');
  } else if (weaponType === 'thunder_hammer') {
    rect(ctx, 0, -2, 32, 5, '#4b3a28');
    rect(ctx, 10, -4, 5, 9, '#a98245');
    rect(ctx, 28, -9, 16, 18, '#4d565c');
    rect(ctx, 30, -7, 12, 14, '#7c878c');
    rect(ctx, 33, -5, 6, 10, '#d7b25e');
    rect(ctx, 26, -11, 3, 22, '#b98d47');
    rect(ctx, 43, -7, 3, 14, '#c9a45c');
    rect(ctx, 2, 2, 4, 5, '#7b5e36');
  } else if (weaponType === 'storm_shield') {
    rect(ctx, 0, -2, 12, 5, '#3f4b50');
    ctx.fillStyle = '#6f8f9e';
    ctx.beginPath();
    ctx.moveTo(14, -16);
    ctx.lineTo(35, -11);
    ctx.lineTo(39, 0);
    ctx.lineTo(35, 12);
    ctx.lineTo(14, 16);
    ctx.lineTo(9, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d7b25e';
    ctx.lineWidth = 2;
    ctx.stroke();
    rect(ctx, 18, -3, 12, 3, '#d7b25e');
    rect(ctx, 22, -7, 3, 12, '#d7b25e');
    rect(ctx, 6, 2, 3, 5, '#7b5e36');
  } else if (weaponType === 'banner') {
    rect(ctx, 0, -2, 34, 4, '#4a3525');
    rect(ctx, 30, -5, 4, 11, '#d7b25e');
    ctx.fillStyle = '#7a2528';
    ctx.beginPath();
    ctx.moveTo(8, -3);
    ctx.lineTo(31, -3);
    ctx.lineTo(27, 13);
    ctx.lineTo(19, 9);
    ctx.lineTo(11, 14);
    ctx.closePath();
    ctx.fill();
    rect(ctx, 14, 1, 4, 4, '#d7b25e');
    rect(ctx, 20, 1, 4, 4, '#d7b25e');
    rect(ctx, 3, 2, 3, 5, '#7b5e36');
  } else {
    const plasma = weaponType === 'plasma_gun';
    const melta = weaponType === 'melta_gun';
    rect(ctx, 0, -3, 17, 7, plasma ? '#25343d' : melta ? '#3a2b22' : '#242b31');
    rect(ctx, 14, -2, melta ? 13 : 11, 4, '#0f1316');
    rect(ctx, 21, -1, melta ? 6 : 4, melta ? 4 : 2, plasma ? '#79d8ff' : melta ? '#ff9a52' : '#738089');
    rect(ctx, 2, 2, 5, 5, '#7b5e36');
    if (plasma) {
      rect(ctx, 9, -5, 7, 2, '#5fc9ee');
      rect(ctx, 16, -4, 2, 8, '#b9f4ff');
    }
    if (melta) {
      rect(ctx, 23, -4, 4, 8, '#ffb06a');
      rect(ctx, 27, -3, 3, 6, '#7a3a1e');
    }
    if (muzzle > 0) {
      ctx.globalAlpha = Math.min(1, muzzle);
      rect(ctx, 26, -3, 8, 6, plasma ? '#c9f7ff' : melta ? '#ffe0a8' : '#ffe6a1');
      rect(ctx, 32, -1, 6, 2, plasma ? '#5fc9ee' : melta ? '#ff8a3d' : '#ffb24a');
      rect(ctx, 25, -5, 4, 10, plasma ? 'rgba(120,220,255,0.35)' : 'rgba(255,225,160,0.35)');
    }
  }
  ctx.restore();
}

export function drawEnemy(
  ctx: Ctx,
  type: string,
  x: number,
  y: number,
  t: number,
  state: EnemyVisualState,
): void {
  const scale = state.elite ? 1.22 : 1;
  const bob = Math.sin(t * 7 + x * 0.03) * 1.2;
  shadow(ctx, x, y + 1, 12 * scale, 0.4);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale, scale);
  if (state.slow > 0) ctx.globalAlpha = 0.9;
  switch (type) {
    case 'ork_boy':
    case 'ork_nob':
      drawOrk(ctx, t, bob, state);
      break;
    case 'ork_shoota':
      drawOrk(ctx, t, bob, state, true);
      break;
    case 'chaos_marine':
    case 'chaos_havoc':
      drawChaos(ctx, t, bob, state);
      break;
    case 'tau_firewarrior':
    case 'tau_battlesuit':
      drawTau(ctx, t, bob, state);
      break;
    case 'thousand_rubric':
    case 'thousand_sorcerer':
      drawThousand(ctx, t, bob, state);
      break;
    case 'tyranid_gaunt':
    case 'tyranid_warrior':
    case 'tyranid_shrike':
      drawTyranid(ctx, t, bob, state);
      break;
    default:
      drawOrk(ctx, t, bob, state);
  }
  if (state.flash > 0) {
    flashOverlay(ctx, -18, -38, 36, 39, state.flash * 0.6);
  }
  ctx.restore();
}

function drawOrk(
  ctx: Ctx,
  t: number,
  bob: number,
  state: EnemyVisualState,
  shoota = false,
): void {
  const step = Math.sin(t * 8) * 2;
  rect(ctx, -7 + step, -10, 6, 11, '#3b4527');
  rect(ctx, 2 - step, -10, 6, 11, '#3b4527');
  rect(ctx, -8 + step, -2, 8, 3, '#171a14');
  rect(ctx, 1 - step, -2, 8, 3, '#171a14');
  rect(ctx, -11, -28 + bob, 22, 19, '#58412e');
  rect(ctx, -9, -27 + bob, 18, 14, '#6a4f35');
  rect(ctx, -12, -26 + bob, 6, 7, '#6f7f4c');
  rect(ctx, 6, -26 + bob, 6, 7, '#6f7f4c');
  rect(ctx, -13, -27 + bob, 6, 2, state.elite ? '#d9ad55' : '#7c5f3a');
  rect(ctx, 7, -27 + bob, 6, 2, state.elite ? '#d9ad55' : '#7c5f3a');
  // head
  rect(ctx, -8, -37 + bob, 16, 13, '#6b8f3d');
  rect(ctx, -7, -39 + bob, 14, 4, '#526f2d');
  rect(ctx, -7, -30 + bob, 4, 3, '#d9d4b4');
  rect(ctx, 3, -30 + bob, 4, 3, '#d9d4b4');
  rect(ctx, -4, -33 + bob, 3, 2, '#e7a04b');
  rect(ctx, 1, -33 + bob, 3, 2, '#e7a04b');
  rect(ctx, -1, -29 + bob, 2, 2, '#2e3b20');
  rect(ctx, -7, -25 + bob, 14, 2, '#3b5524');
  if (shoota) {
    // looted shoota: a crude, oversized automatic weapon
    rect(ctx, 8, -26 + bob, 5, 12, '#5e472f');
    rect(ctx, 11, -24 + bob, 13, 4, '#3c3e36');
    rect(ctx, 22, -24 + bob, 7, 2, '#a7b0ad');
    rect(ctx, 13, -21 + bob, 3, 6, '#23251f');
    rect(ctx, 14, -19 + bob, 6, 2, '#8a5c39');
    rect(ctx, 18, -21 + bob, 2, 3, '#d0a25f');
    // targeting squig-eye
    rect(ctx, 12, -30 + bob, 3, 3, '#d55b45');
    rect(ctx, 13, -29 + bob, 1, 1, '#ffd38a');
  } else {
    // axe
    rect(ctx, 10, -29 + bob, 3, 22, '#6a5436');
    rect(ctx, 12, -31 + bob, 8, 5, '#8d969b');
    rect(ctx, 12, -31 + bob, 2, 5, '#c3cbd0');
    rect(ctx, 9, -24 + bob, 3, 2, '#302a1e');
  }
  if (state.elite) {
    rect(ctx, -9, -43 + bob, 18, 2, '#d9ad55');
    rect(ctx, -2, -45 + bob, 4, 3, '#d9ad55');
  }
}

function drawChaos(ctx: Ctx, t: number, bob: number, state: EnemyVisualState): void {
  const step = Math.sin(t * 6) * 1.5;
  rect(ctx, -8 + step, -12, 7, 12, '#2c2428');
  rect(ctx, 2 - step, -12, 7, 12, '#2c2428');
  // cape
  rect(ctx, -14, -36 + bob, 8, 28, '#491e20');
  rect(ctx, -15, -31 + bob, 5, 21, '#5f2628');
  // torso
  rect(ctx, -12, -35 + bob, 24, 23, '#542a2a');
  rect(ctx, -10, -34 + bob, 20, 18, '#713736');
  rect(ctx, -12, -29 + bob, 24, 3, '#ad8d54');
  rect(ctx, -3, -33 + bob, 6, 8, '#3b3339');
  rect(ctx, -4, -32 + bob, 8, 2, '#b18b4e');
  // shoulders + spikes
  rect(ctx, -18, -36 + bob, 7, 9, '#3f252a');
  rect(ctx, 11, -36 + bob, 7, 9, '#3f252a');
  rect(ctx, -19, -41 + bob, 3, 7, '#a9a19a');
  rect(ctx, 16, -41 + bob, 3, 7, '#a9a19a');
  // helm
  rect(ctx, -8, -48 + bob, 16, 13, '#64302f');
  rect(ctx, -7, -51 + bob, 14, 5, '#512527');
  rect(ctx, -10, -53 + bob, 4, 8, '#78716a');
  rect(ctx, 6, -53 + bob, 4, 8, '#78716a');
  rect(ctx, -6, -44 + bob, 4, 2, '#ff6b57');
  rect(ctx, 2, -44 + bob, 4, 2, '#ff6b57');
  rect(ctx, -2, -48 + bob, 4, 4, '#2a1b1d');
  // blade
  rect(ctx, 12, -32 + bob, 3, 20, '#3a2b2b');
  rect(ctx, 14, -36 + bob, 3, 25, '#9b3b35');
  rect(ctx, 16, -34 + bob, 2, 22, '#e56e58');
  if (state.elite) {
    rect(ctx, -10, -56 + bob, 20, 2, '#d9ad55');
  }
}

function drawTau(ctx: Ctx, t: number, bob: number, state: EnemyVisualState): void {
  const step = Math.sin(t * 8) * 1.5;
  rect(ctx, -6 + step, -12, 5, 12, '#d8d5ca');
  rect(ctx, 2 - step, -12, 5, 12, '#d8d5ca');
  rect(ctx, -9, -31 + bob, 18, 20, '#d6d1c2');
  rect(ctx, -7, -30 + bob, 14, 16, '#eee8d8');
  rect(ctx, -3, -29 + bob, 6, 14, '#a9dbdc');
  rect(ctx, -10, -26 + bob, 20, 2, '#b08a52');
  rect(ctx, -11, -31 + bob, 5, 6, '#c9c3b4');
  rect(ctx, 6, -31 + bob, 5, 6, '#c9c3b4');
  // head
  rect(ctx, -7, -40 + bob, 14, 10, '#3c6a8b');
  rect(ctx, -6, -41 + bob, 12, 4, '#d9e3e4');
  rect(ctx, -5, -37 + bob, 10, 3, '#82e5ea');
  rect(ctx, -8, -35 + bob, 2, 7, '#e7d9bc');
  rect(ctx, 6, -35 + bob, 2, 7, '#e7d9bc');
  // rifle
  ctx.save();
  ctx.translate(9, -24 + bob);
  ctx.rotate(-0.1);
  rect(ctx, 0, -2, 22, 4, '#4c5d60');
  rect(ctx, 18, -1, 9, 2, '#95e7e7');
  rect(ctx, 5, 2, 5, 4, '#b08a52');
  ctx.restore();
  if (state.elite) {
    rect(ctx, -11, -45 + bob, 22, 2, '#e0c077');
    rect(ctx, 8, -42 + bob, 6, 5, '#6b8e91');
  }
}

function drawThousand(ctx: Ctx, t: number, bob: number, state: EnemyVisualState): void {
  const float = Math.sin(t * 2.4) * 3;
  rect(ctx, -12, -10 + float, 24, 4, '#3c3356');
  // robe
  ctx.fillStyle = '#3e3b73';
  ctx.beginPath();
  ctx.moveTo(-8, -35 + float);
  ctx.lineTo(8, -35 + float);
  ctx.lineTo(13, -7 + float);
  ctx.lineTo(-13, -7 + float);
  ctx.closePath();
  ctx.fill();
  rect(ctx, -6, -33 + float, 12, 24, '#57539a');
  rect(ctx, -2, -33 + float, 4, 25, '#d3aa4e');
  rect(ctx, -9, -25 + float, 18, 2, '#d3aa4e');
  // shoulders
  rect(ctx, -12, -36 + float, 6, 7, '#b28a3f');
  rect(ctx, 6, -36 + float, 6, 7, '#b28a3f');
  // head
  rect(ctx, -7, -48 + float, 14, 12, '#d4b45f');
  rect(ctx, -5, -50 + float, 10, 4, '#4c4386');
  rect(ctx, -4, -44 + float, 8, 3, '#8ee9f2');
  rect(ctx, -8, -52 + float, 3, 8, '#c8a34f');
  rect(ctx, 6, -52 + float, 3, 8, '#c8a34f');
  // floating scrolls
  rect(ctx, 12, -36 + float + Math.sin(t * 3) * 2, 7, 4, '#dbcfae');
  rect(ctx, -19, -28 + float + Math.cos(t * 3) * 2, 6, 3, '#dbcfae');
  // blue flame
  ctx.globalAlpha = 0.65;
  rect(ctx, -4, -58 + float + Math.sin(t * 5) * 2, 8, 7, '#5a8fe8');
  rect(ctx, -2, -63 + float + Math.sin(t * 5) * 2, 4, 6, '#9ad7ff');
  ctx.globalAlpha = 1;
  if (state.elite) {
    rect(ctx, -14, -54 + float, 28, 2, '#d9ad55');
  }
}

function drawTyranid(ctx: Ctx, t: number, bob: number, state: EnemyVisualState): void {
  const step = Math.sin(t * 12) * 2;
  // legs
  rect(ctx, -12 + step, -8, 9, 3, '#5f3550');
  rect(ctx, 4 - step, -8, 9, 3, '#5f3550');
  rect(ctx, -10 + step, -4, 3, 5, '#7d4668');
  rect(ctx, 8 - step, -4, 3, 5, '#7d4668');
  // body
  ctx.fillStyle = '#7b4060';
  ctx.beginPath();
  ctx.moveTo(-11, -25 + bob);
  ctx.lineTo(9, -27 + bob);
  ctx.lineTo(15, -12 + bob);
  ctx.lineTo(-7, -10 + bob);
  ctx.closePath();
  ctx.fill();
  rect(ctx, -8, -24 + bob, 14, 10, '#98557a');
  rect(ctx, -2, -23 + bob, 4, 9, '#d6a7c0');
  // carapace
  rect(ctx, -7, -31 + bob, 14, 7, '#b18ac1');
  rect(ctx, -4, -35 + bob, 8, 5, '#d3b6dd');
  rect(ctx, 6, -27 + bob, 4, 4, '#4b2b41');
  // head
  rect(ctx, -12, -28 + bob, 8, 7, '#d2a9b8');
  rect(ctx, -15, -26 + bob, 4, 3, '#e8d3d4');
  rect(ctx, -11, -25 + bob, 2, 2, '#ffe08a');
  // scythes
  ctx.strokeStyle = '#e0c7d2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, -23 + bob);
  ctx.quadraticCurveTo(22, -30 + bob, 18, -40 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-9, -21 + bob);
  ctx.quadraticCurveTo(-22, -26 + bob, -19, -36 + bob);
  ctx.stroke();
  if (state.elite) {
    rect(ctx, -8, -38 + bob, 16, 2, '#d9ad55');
  }
}

export function drawBoss(
  ctx: Ctx,
  bossId: string,
  x: number,
  y: number,
  t: number,
  state: EnemyVisualState,
  hpFraction: number,
): void {
  const bob = Math.sin(t * 3) * 2;
  shadow(ctx, x, y + 1, 36, 0.6);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (state.enraged) {
    ctx.globalAlpha = 0.95 + Math.sin(t * 14) * 0.05;
  }
  if (bossId === 'warboss') drawBossWarboss(ctx, t, bob);
  else if (bossId === 'chaos_lord') drawBossChaosLord(ctx, t, bob);
  else if (bossId === 'hive_tyrant') drawBossHiveTyrant(ctx, t, bob);
  else drawBossDaemon(ctx, t, bob);
  if (state.flash > 0) {
    flashOverlay(ctx, -48, -112, 96, 113, state.flash * 0.55);
  }
  // enrage aura
  if (state.enraged && hpFraction < 0.5) {
    ctx.globalAlpha = 0.16 + Math.sin(t * 9) * 0.05;
    ctx.fillStyle = '#ff4b3e';
    ctx.beginPath();
    ctx.arc(0, -50, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawBossWarboss(ctx: Ctx, t: number, bob: number): void {
  const step = Math.sin(t * 5) * 2;
  rect(ctx, -28 + step, -22, 20, 24, '#334029');
  rect(ctx, 9 - step, -22, 20, 24, '#334029');
  rect(ctx, -31 + step, -4, 25, 6, '#12160f');
  rect(ctx, 7 - step, -4, 25, 6, '#12160f');
  // body
  rect(ctx, -34, -72 + bob, 68, 52, '#3f4e2b');
  rect(ctx, -27, -68 + bob, 54, 42, '#59673a');
  rect(ctx, -20, -65 + bob, 40, 33, '#6f7c47');
  rect(ctx, -34, -55 + bob, 68, 5, '#8b7042');
  // mega armor plates
  rect(ctx, -40, -74 + bob, 18, 24, '#5d4e3f');
  rect(ctx, 22, -74 + bob, 18, 24, '#5d4e3f');
  rect(ctx, -44, -76 + bob, 12, 5, '#998a6c');
  rect(ctx, 32, -76 + bob, 12, 5, '#998a6c');
  // power claw
  rect(ctx, 33, -65 + bob, 15, 34, '#4e5557');
  rect(ctx, 43, -60 + bob, 9, 6, '#b7c0bd');
  rect(ctx, 45, -51 + bob, 8, 5, '#b7c0bd');
  rect(ctx, 43, -42 + bob, 10, 5, '#b7c0bd');
  // head
  rect(ctx, -18, -98 + bob, 36, 27, '#668b39');
  rect(ctx, -15, -105 + bob, 30, 9, '#4e6b2d');
  rect(ctx, -12, -96 + bob, 6, 5, '#ffb24a');
  rect(ctx, 6, -96 + bob, 6, 5, '#ffb24a');
  rect(ctx, -4, -88 + bob, 8, 5, '#3b241b');
  rect(ctx, -18, -92 + bob, 7, 4, '#e9dfbe');
  rect(ctx, 11, -92 + bob, 7, 4, '#e9dfbe');
  rect(ctx, 20, -106 + bob, 5, 12, '#d9c07d');
  rect(ctx, -25, -106 + bob, 5, 12, '#d9c07d');
  // axe
  rect(ctx, -38, -105 + bob, 7, 48, '#5f4d37');
  rect(ctx, -49, -111 + bob, 18, 16, '#8a9694');
  rect(ctx, -49, -111 + bob, 5, 16, '#b9c2bd');
  // smoke
  ctx.globalAlpha = 0.4;
  rect(ctx, -20, -116 + bob + Math.sin(t * 2) * 3, 8, 5, '#5d5a52');
  rect(ctx, 8, -121 + bob + Math.cos(t * 2) * 4, 6, 4, '#6f6b61');
  ctx.globalAlpha = 1;
}

function drawBossChaosLord(ctx: Ctx, t: number, bob: number): void {
  const step = Math.sin(t * 5) * 2;
  // cape
  rect(ctx, -42, -92 + bob, 20, 72, '#3a171a');
  rect(ctx, 22, -92 + bob, 20, 72, '#3a171a');
  rect(ctx, -44, -82 + bob, 10, 55, '#4f1c20');
  // legs
  rect(ctx, -25 + step, -26, 18, 27, '#281f24');
  rect(ctx, 8 - step, -26, 18, 27, '#281f24');
  // torso
  rect(ctx, -30, -78 + bob, 60, 54, '#4e2325');
  rect(ctx, -24, -74 + bob, 48, 44, '#6e3030');
  rect(ctx, -8, -72 + bob, 16, 38, '#3e3237');
  rect(ctx, -30, -60 + bob, 60, 6, '#b89350');
  // skulls & spikes
  rect(ctx, -30, -70 + bob, 7, 7, '#d8c8a5');
  rect(ctx, 23, -64 + bob, 7, 7, '#d8c8a5');
  rect(ctx, -38, -84 + bob, 8, 9, '#5e3334');
  rect(ctx, 30, -84 + bob, 8, 9, '#5e3334');
  rect(ctx, -42, -96 + bob, 5, 18, '#b4aaa0');
  rect(ctx, 37, -96 + bob, 5, 18, '#b4aaa0');
  // head
  rect(ctx, -19, -108 + bob, 38, 31, '#702f2e');
  rect(ctx, -17, -115 + bob, 34, 12, '#4d2427');
  rect(ctx, -28, -119 + bob, 8, 23, '#a39a8e');
  rect(ctx, 20, -119 + bob, 8, 23, '#a39a8e');
  rect(ctx, -14, -100 + bob, 9, 4, '#ff5e4c');
  rect(ctx, 5, -100 + bob, 9, 4, '#ff5e4c');
  rect(ctx, -5, -93 + bob, 10, 3, '#241a1c');
  // sword
  ctx.save();
  ctx.translate(32, -60 + bob);
  ctx.rotate(-0.25);
  rect(ctx, 0, 0, 6, 43, '#3b2a2a');
  rect(ctx, 5, -4, 6, 51, '#9c3a32');
  rect(ctx, 9, -6, 3, 53, '#ff8a58');
  ctx.globalAlpha = 0.4;
  rect(ctx, 7, -10, 8, 60, '#ff5a3c');
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawBossHiveTyrant(ctx: Ctx, t: number, bob: number): void {
  const step = Math.sin(t * 6) * 2;
  // legs / lower body
  rect(ctx, -32 + step, -20, 20, 18, '#572f4b');
  rect(ctx, 12 - step, -20, 20, 18, '#572f4b');
  rect(ctx, -24 + step, -8, 8, 10, '#7d4668');
  rect(ctx, 16 - step, -8, 8, 10, '#7d4668');
  // tail
  ctx.strokeStyle = '#70405e';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -34 + bob);
  ctx.quadraticCurveTo(35, -45 + bob, 55, -22 + bob);
  ctx.stroke();
  // torso
  ctx.fillStyle = '#653b58';
  ctx.beginPath();
  ctx.moveTo(-28, -78 + bob);
  ctx.lineTo(25, -81 + bob);
  ctx.lineTo(38, -30 + bob);
  ctx.lineTo(-35, -28 + bob);
  ctx.closePath();
  ctx.fill();
  rect(ctx, -20, -70 + bob, 39, 33, '#854b6d');
  rect(ctx, -5, -72 + bob, 12, 38, '#b58ac1');
  // rib carapace
  for (let i = 0; i < 5; i++) {
    rect(ctx, -22 + i * 9, -75 + bob, 5, 9, '#d8b9df');
  }
  // head
  rect(ctx, -17, -98 + bob, 34, 24, '#d0a9b9');
  rect(ctx, -13, -106 + bob, 26, 10, '#b38ac4');
  rect(ctx, -9, -95 + bob, 5, 4, '#ffe07d');
  rect(ctx, 4, -95 + bob, 5, 4, '#ffe07d');
  rect(ctx, -7, -88 + bob, 14, 4, '#472336');
  rect(ctx, -23, -103 + bob, 6, 12, '#e5d0d8');
  rect(ctx, 17, -103 + bob, 6, 12, '#e5d0d8');
  // scythe arms
  ctx.strokeStyle = '#e0c7d2';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(28, -68 + bob);
  ctx.quadraticCurveTo(65, -82 + bob, 49, -116 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-29, -68 + bob);
  ctx.quadraticCurveTo(-66, -80 + bob, -51, -112 + bob);
  ctx.stroke();
  ctx.strokeStyle = '#8e5e83';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-45, -106 + bob);
  ctx.quadraticCurveTo(-32, -93 + bob, -29, -68 + bob);
  ctx.stroke();
  // spore glow
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#c27ba3';
  ctx.beginPath();
  ctx.arc(0, -50 + bob, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBossDaemon(ctx: Ctx, t: number, bob: number): void {
  const step = Math.sin(t * 4) * 2;
  // wings
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#4e1a1a';
  ctx.beginPath();
  ctx.moveTo(-20, -88 + bob);
  ctx.quadraticCurveTo(-92, -130 + bob, -78, -44 + bob);
  ctx.quadraticCurveTo(-55, -70 + bob, -30, -54 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(20, -88 + bob);
  ctx.quadraticCurveTo(92, -130 + bob, 78, -44 + bob);
  ctx.quadraticCurveTo(55, -70 + bob, 30, -54 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#9b3d32';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-26, -88 + bob);
  ctx.quadraticCurveTo(-70, -116 + bob, -68, -55 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(26, -88 + bob);
  ctx.quadraticCurveTo(70, -116 + bob, 68, -55 + bob);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // legs
  rect(ctx, -28 + step, -28, 17, 28, '#7b221f');
  rect(ctx, 11 - step, -28, 17, 28, '#7b221f');
  rect(ctx, -32 + step, -4, 23, 6, '#3c1714');
  rect(ctx, 9 - step, -4, 23, 6, '#3c1714');
  // torso
  rect(ctx, -32, -85 + bob, 64, 60, '#8c2924');
  rect(ctx, -24, -80 + bob, 48, 49, '#b53a30');
  rect(ctx, -10, -77 + bob, 20, 39, '#d05745');
  rect(ctx, -32, -67 + bob, 64, 7, '#a8824a');
  // brass armor
  rect(ctx, -36, -88 + bob, 10, 34, '#8f6a3c');
  rect(ctx, 26, -88 + bob, 10, 34, '#8f6a3c');
  rect(ctx, -36, -88 + bob, 10, 4, '#d4ad63');
  rect(ctx, 26, -88 + bob, 10, 4, '#d4ad63');
  // head
  rect(ctx, -20, -112 + bob, 40, 29, '#a6322b');
  rect(ctx, -15, -120 + bob, 30, 10, '#7d2623');
  rect(ctx, -13, -102 + bob, 8, 4, '#ffd35e');
  rect(ctx, 5, -102 + bob, 8, 4, '#ffd35e');
  rect(ctx, -5, -96 + bob, 10, 3, '#311615');
  // horns
  ctx.strokeStyle = '#d6c19d';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-18, -112 + bob);
  ctx.quadraticCurveTo(-48, -137 + bob, -36, -150 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(18, -112 + bob);
  ctx.quadraticCurveTo(48, -137 + bob, 36, -150 + bob);
  ctx.stroke();
  // burning sword
  ctx.save();
  ctx.translate(35, -70 + bob);
  ctx.rotate(0.28);
  rect(ctx, 0, 0, 7, 50, '#4a2d28');
  rect(ctx, 5, -8, 9, 65, '#a83a29');
  ctx.globalAlpha = 0.55;
  rect(ctx, 8, -14, 10, 76, '#ff8f3f');
  ctx.globalAlpha = 1;
  ctx.restore();
  // warp glow
  ctx.globalAlpha = 0.18 + Math.sin(t * 5) * 0.04;
  ctx.fillStyle = '#ff543f';
  ctx.beginPath();
  ctx.arc(0, -66, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawServitor(
  ctx: Ctx,
  x: number,
  y: number,
  t: number,
  ranged: boolean,
): void {
  const bob = Math.sin(t * 6) * 1;
  shadow(ctx, x, y + 1, 12, 0.35);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  rect(ctx, -7, -12, 6, 12, '#3e4547');
  rect(ctx, 2, -12, 6, 12, '#3e4547');
  rect(ctx, -9, -31 + bob, 18, 20, '#555d5c');
  rect(ctx, -7, -30 + bob, 14, 16, '#6d7470');
  rect(ctx, -5, -29 + bob, 10, 2, '#a83f36');
  rect(ctx, -9, -25 + bob, 18, 2, '#a98a55');
  rect(ctx, -8, -39 + bob, 16, 11, '#7b817b');
  rect(ctx, -7, -38 + bob, 14, 4, '#4a5250');
  rect(ctx, -5, -34 + bob, 4, 2, '#ff4c3d');
  rect(ctx, 2, -34 + bob, 3, 2, '#ff4c3d');
  // mech arm
  rect(ctx, 8, -29 + bob, 8, 4, '#777f7b');
  rect(ctx, 14, -31 + bob, 4, 9, '#9b6b45');
  if (ranged) {
    rect(ctx, 9, -25 + bob, 17, 5, '#394345');
    rect(ctx, 24, -24 + bob, 7, 3, '#aeb9b6');
  } else {
    rect(ctx, 12, -22 + bob, 3, 14, '#c1c8c3');
    rect(ctx, 9, -25 + bob, 7, 4, '#8e9893');
  }
  // cable
  ctx.strokeStyle = '#8b5a42';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, -29 + bob);
  ctx.quadraticCurveTo(-18, -18 + bob, -11, -10);
  ctx.stroke();
  ctx.restore();
}

export function drawHound(ctx: Ctx, x: number, y: number, t: number): void {
  shadow(ctx, x, y + 1, 14, 0.35);
  const step = Math.sin(t * 12) * 3;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  rect(ctx, -13 + step, -7, 4, 8, '#3d4647');
  rect(ctx, 5 - step, -7, 4, 8, '#3d4647');
  rect(ctx, -15, -18, 27, 12, '#5b6564');
  rect(ctx, -8, -23, 20, 9, '#6d7772');
  rect(ctx, 10, -25, 9, 9, '#7d877f');
  rect(ctx, 16, -22, 5, 4, '#a98a55');
  rect(ctx, 10, -24, 4, 2, '#ff5a43');
  rect(ctx, -14, -21, 8, 3, '#8a5a3f');
  rect(ctx, 19, -20, 5, 2, '#c8cec6');
  ctx.restore();
}

export function drawServoSkull(ctx: Ctx, x: number, y: number, t: number): void {
  const bob = Math.sin(t * 5) * 3;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + bob));
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#79e3d8';
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  rect(ctx, -7, -7, 14, 11, '#d5c9a8');
  rect(ctx, -5, -3, 4, 4, '#171b1c');
  rect(ctx, 2, -3, 4, 4, '#171b1c');
  rect(ctx, -2, 3, 5, 3, '#8d7d63');
  rect(ctx, -8, -9, 16, 3, '#8d7448');
  rect(ctx, 7, -6, 5, 3, '#7a8585');
  rect(ctx, -3, 10, 6, 3, '#e87240');
  rect(ctx, -1, 13, 2, 4, '#ffb248');
  ctx.restore();
}

export function drawScarab(ctx: Ctx, x: number, y: number, t: number): void {
  const bob = Math.sin(t * 14) * 1.5;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + bob));
  rect(ctx, -5, -3, 10, 6, '#5cc7a3');
  rect(ctx, -3, -5, 6, 3, '#8ce8c6');
  rect(ctx, -8, -2, 4, 2, '#3d8e76');
  rect(ctx, 4, -2, 4, 2, '#3d8e76');
  rect(ctx, -4, 2, 2, 4, '#2d5f54');
  rect(ctx, 2, 2, 2, 4, '#2d5f54');
  ctx.restore();
}

export function drawDropCrate(ctx: Ctx, x: number, y: number, t: number, glow: string): void {
  const bob = Math.sin(t * 4) * 2;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + bob));
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, -10, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  rect(ctx, -13, -20, 26, 20, '#4b4b3f');
  rect(ctx, -11, -18, 22, 15, '#68644f');
  rect(ctx, -13, -14, 26, 3, '#c19d54');
  rect(ctx, -2, -22, 4, 24, '#c19d54');
  rect(ctx, -6, -17, 12, 3, '#31352f');
  rect(ctx, -4, -11, 8, 6, '#d6b96e');
  rect(ctx, -2, -9, 4, 3, '#4b2f26');
  ctx.restore();
}

export function drawMedicae(ctx: Ctx, x: number, y: number, t: number): void {
  const bob = Math.sin(t * 5) * 2;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + bob));
  rect(ctx, -10, -15, 20, 15, '#d5cfb8');
  rect(ctx, -8, -13, 16, 11, '#f0ead4');
  rect(ctx, -10, -10, 20, 2, '#a83f37');
  rect(ctx, -2, -13, 4, 10, '#a83f37');
  rect(ctx, -7, -13, 14, 2, '#a83f37');
  rect(ctx, -3, -16, 6, 2, '#7a765e');
  ctx.restore();
}
