const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const centerMessage = document.getElementById('centerMessage');
const hitFlash = document.getElementById('hitFlash');
const damageVignette = document.getElementById('damageVignette');
const keys = new Set();

const state = {
  active: false,
  over: false,
  camera3d: false,
  firstPerson: false,
  elapsed: 0,
  lastTime: 0,
  player: { x: 0, z: 0, angle: 0, armor: 100, ammo: 12, shots: 0, hits: 0, cooldown: 0 },
  enemy: { x: 2.5, z: -6, angle: 0, armor: 100, cooldown: 2.5, strafe: 1 },
  sparks: [],
  tracers: []
};

const arena = { width: 16, depth: 20 };
const walls = [
  { x: -7.5, z: -3, w: 2.7, d: 1.2 }, { x: 5.2, z: -5, w: 2.4, d: 1.2 },
  { x: -3.5, z: -8, w: 1.3, d: 2.8 }, { x: 3.7, z: -10, w: 1.3, d: 2.5 },
  { x: 0, z: -4.5, w: 1.8, d: .8 }, { x: -5.5, z: -11.5, w: 2.6, d: .8 }
];

function resize() {
  const scale = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * scale);
  canvas.height = Math.floor(rect.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}
window.addEventListener('resize', resize);

function resetGame() {
  state.active = false; state.over = false; state.elapsed = 0; state.lastTime = 0;
  state.player = { x: 0, z: 0, angle: 0, armor: 100, ammo: 12, shots: 0, hits: 0, cooldown: 0 };
  state.enemy = { x: 2.5, z: -6, angle: 0, armor: 100, cooldown: 2.5, strafe: 1 };
  state.sparks = []; state.tracers = [];
  centerMessage.textContent = 'CLICK OR PRESS SPACE TO START'; centerMessage.style.display = 'block';
  updateHud(); draw();
}

document.getElementById('resetButton').addEventListener('click', resetGame);
function deploy() {
  if (state.over) resetGame();
  if (!state.active) { state.active = true; centerMessage.style.display = 'none'; state.lastTime = performance.now(); requestAnimationFrame(loop); }
}

function aimAtPointer(event) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min((rect.width - 44) / arena.width, (rect.height - 54) / arena.depth);
  const centerZ = (-arena.depth + 1 + 2.5) / 2;
  if (state.firstPerson) {
    const horizontalAim = (event.clientX - rect.left - rect.width / 2) / rect.width;
    state.player.angle = horizontalAim * 1.7;
    return;
  }
  const worldX = (event.clientX - rect.left - rect.width / 2) / scale;
  const depthFactor = state.camera3d ? .55 : 1;
  const worldZ = (event.clientY - rect.top - rect.height / 2) / (scale * depthFactor) + centerZ;
  state.player.angle = Math.atan2(worldX - state.player.x, -(worldZ - state.player.z));
}

canvas.addEventListener('pointermove', aimAtPointer);
canvas.addEventListener('pointerdown', (event) => { event.preventDefault(); aimAtPointer(event); deploy(); shoot(); });
window.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'KeyV' && !event.repeat) {
    if (!state.camera3d && !state.firstPerson) state.camera3d = true;
    else if (state.camera3d) { state.camera3d = false; state.firstPerson = true; }
    else state.firstPerson = false;
    const cameraLabel = state.firstPerson ? 'FIRST PERSON' : (state.camera3d ? '3D FIELD' : 'TACTICAL');
    document.getElementById('cameraMode').textContent = cameraLabel;
    document.getElementById('feedMessage').textContent = `CAMERA // ${cameraLabel}`;
    updateHud(); draw();
  }
  if (event.code === 'Space' && !event.repeat) {
    deploy();
    shoot();
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.code));

function shoot() {
  if (!state.active || state.over || state.player.cooldown > 0 || state.player.ammo <= 0) return;
  const player = state.player;
  player.cooldown = .28; player.ammo--; player.shots++;
  hitFlash.classList.remove('active'); void hitFlash.offsetWidth; hitFlash.classList.add('active');
  const dx = state.enemy.x - player.x; const dz = state.enemy.z - player.z;
  const distance = Math.hypot(dx, dz); const targetAngle = Math.atan2(dx, -dz);
  const angleDiff = Math.atan2(Math.sin(targetAngle - player.angle), Math.cos(targetAngle - player.angle));
  const hit = Math.abs(angleDiff) < .12 && distance < 14;
  state.tracers.push({ x: player.x, z: player.z, tx: hit ? state.enemy.x : player.x + Math.sin(player.angle) * 14, tz: hit ? state.enemy.z : player.z - Math.cos(player.angle) * 14, life: .16, good: hit });
  if (hit) {
    player.hits++; state.enemy.armor = Math.max(0, state.enemy.armor - 25); makeSparks(state.enemy.x, state.enemy.z, 8);
    document.getElementById('feedMessage').textContent = 'DIRECT HIT // -25 ARMOR';
    if (state.enemy.armor <= 0) endGame(true);
  } else document.getElementById('feedMessage').textContent = 'SHOT MISSED // RECALIBRATE';
  updateHud();
}

function enemyShoot() {
  const enemy = state.enemy; const player = state.player; const dx = player.x - enemy.x; const dz = player.z - enemy.z;
  const distance = Math.hypot(dx, dz); enemy.angle = Math.atan2(dx, -dz);
  state.tracers.push({ x: enemy.x, z: enemy.z, tx: player.x, tz: player.z, life: .18, good: false, enemy: true });
  if (distance < 12 && Math.random() < .58) {
    player.armor = Math.max(0, player.armor - 12); damageVignette.classList.remove('active'); void damageVignette.offsetWidth; damageVignette.classList.add('active');
    document.getElementById('feedMessage').textContent = 'INCOMING FIRE // -12 ARMOR';
    if (player.armor <= 0) endGame(false);
  }
}

function endGame(won) {
  state.over = true; state.active = false;
  centerMessage.textContent = won ? 'SIGNAL ELIMINATED // YOU WIN' : 'OPERATOR DOWN // PRESS SPACE'; centerMessage.style.display = 'block';
  document.getElementById('enemyStatus').textContent = won ? 'OFFLINE' : 'VICTORIOUS';
  document.getElementById('feedMessage').textContent = won ? 'MATCH COMPLETE // SECTOR CLEAR' : 'MATCH LOST // RESET REQUIRED';
}

function movePlayer(dt) {
  const player = state.player; const speed = 3.3 * dt;
  const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  player.x += strafe * speed;
  player.z -= forward * speed;
  player.x = Math.max(-arena.width / 2 + .7, Math.min(arena.width / 2 - .7, player.x));
  player.z = Math.max(-arena.depth + 1, Math.min(2.5, player.z));
}

function moveEnemy(dt) {
  const enemy = state.enemy; const player = state.player; const dx = player.x - enemy.x; const dz = player.z - enemy.z; const distance = Math.hypot(dx, dz);
  enemy.angle = Math.atan2(dx, -dz); enemy.cooldown -= dt;
  if (distance > 5) { enemy.x += (dx / distance) * dt * .55; enemy.z += (dz / distance) * dt * .55; }
  else { enemy.x += Math.cos(state.elapsed * 1.6) * enemy.strafe * dt * .65; if (Math.random() < .008) enemy.strafe *= -1; }
  enemy.x = Math.max(-arena.width / 2 + .8, Math.min(arena.width / 2 - .8, enemy.x)); enemy.z = Math.max(-arena.depth + 1, Math.min(-1.5, enemy.z));
  if (enemy.cooldown <= 0) { enemy.cooldown = 1.5 + Math.random() * 1.6; enemyShoot(); }
}

function makeSparks(x, z, amount) { for (let i = 0; i < amount; i++) state.sparks.push({ x, z, life: .35 + Math.random() * .3, dx: (Math.random() - .5) * 3, dz: (Math.random() - .5) * 3 }); }
function loop(time) { if (!state.active) return; const dt = Math.min(.04, (time - state.lastTime) / 1000); state.lastTime = time; state.elapsed += dt; state.player.cooldown -= dt; movePlayer(dt); moveEnemy(dt); updateParticles(dt); updateHud(); draw(); requestAnimationFrame(loop); }
function updateParticles(dt) { state.tracers.forEach(t => t.life -= dt); state.tracers = state.tracers.filter(t => t.life > 0); state.sparks.forEach(s => { s.life -= dt; s.x += s.dx * dt; s.z += s.dz * dt; }); state.sparks = state.sparks.filter(s => s.life > 0); }

function project(x, z, width, height) {
  const scale = Math.min((width - 44) / arena.width, (height - 54) / arena.depth);
  const centerZ = (-arena.depth + 1 + 2.5) / 2;
  if (state.firstPerson) {
    const player = state.player;
    const dx = x - player.x; const dz = z - player.z;
    const sin = Math.sin(player.angle); const cos = Math.cos(player.angle);
    const side = dx * cos + dz * sin;
    const depth = dx * sin - dz * cos;
    const focal = Math.min(width, height) * .58;
    const safeDepth = Math.max(.25, depth);
    return { x: width / 2 + side * focal / safeDepth, y: height * .56 + focal * .9 / safeDepth, depth, scale: focal / safeDepth };
  }
  const depthFactor = state.camera3d ? .55 : 1;
  return { x: width / 2 + x * scale, y: height / 2 + (z - centerZ) * scale * depthFactor, depth: -z, scale };
}
function draw() { const width = canvas.clientWidth, height = canvas.clientHeight; ctx.clearRect(0, 0, width, height); drawBackground(width, height); drawGrid(width, height); [...walls].sort((a,b) => b.z - a.z).forEach(w => drawWall(w, width, height)); drawCharacter(state.enemy, true, width, height); drawCharacter(state.player, false, width, height); drawEffects(width, height); }
function drawBackground(width, height) { const gradient = ctx.createLinearGradient(0,0,0,height); gradient.addColorStop(0,'#0a1d26'); gradient.addColorStop(.52,'#0b2228'); gradient.addColorStop(1,'#061218'); ctx.fillStyle=gradient; ctx.fillRect(0,0,width,height); ctx.strokeStyle='rgba(108,246,223,.12)'; ctx.lineWidth=1; for(let y=height*.35;y<height*.7;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();} }
function drawGrid(width, height) {
  if (state.firstPerson) {
    const horizon = height * .52;
    ctx.fillStyle = '#0d2b30'; ctx.fillRect(0, horizon, width, height - horizon);
    ctx.strokeStyle = 'rgba(108,246,223,.2)'; ctx.lineWidth = 1;
    for (let x = -width; x <= width * 2; x += 70) { ctx.beginPath(); ctx.moveTo(width / 2, horizon); ctx.lineTo(x, height); ctx.stroke(); }
    for (let i = 1; i < 9; i++) { const y = horizon + (height - horizon) * (i / 9) ** .65; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    ctx.strokeStyle = '#3e8a86'; ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(width, horizon); ctx.stroke();
    return;
  }
  const left = project(-arena.width / 2, 0, width, height).x;
  const right = project(arena.width / 2, 0, width, height).x;
  const top = project(0, -arena.depth + 1, width, height).y;
  const bottom = project(0, 2.5, width, height).y;
  ctx.fillStyle = 'rgba(13,43,48,.72)'; ctx.fillRect(left, top, right - left, bottom - top);
  ctx.strokeStyle = 'rgba(108,246,223,.16)'; ctx.lineWidth = 1;
  for (let x = -arena.width / 2; x <= arena.width / 2; x += 2) { const p = project(x, 0, width, height); ctx.beginPath(); ctx.moveTo(p.x, top); ctx.lineTo(p.x, bottom); ctx.stroke(); }
  for (let z = -arena.depth + 1; z <= 2.5; z += 2) { const p = project(0, z, width, height); ctx.beginPath(); ctx.moveTo(left, p.y); ctx.lineTo(right, p.y); ctx.stroke(); }
  ctx.strokeStyle = '#3e8a86'; ctx.strokeRect(left, top, right - left, bottom - top);
}
function drawWall(w,width,height) {
  const p = project(w.x, w.z, width, height);
  if (state.firstPerson) {
    if (p.depth <= .25) return;
    const wallW = w.w * p.scale;
    const wallH = Math.max(18, 1.4 * p.scale);
    const left = p.x - wallW / 2;
    const top = p.y - wallH;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(left + 7, top + 8, wallW, wallH);
    ctx.fillStyle = '#15343a'; ctx.fillRect(left, top, wallW, wallH);
    ctx.strokeStyle = '#3e8a86'; ctx.strokeRect(left, top, wallW, wallH);
    ctx.fillStyle = '#6cf6df'; ctx.globalAlpha = .45; ctx.fillRect(left + 5, top + 5, 4, wallH - 10); ctx.globalAlpha = 1;
    return;
  }
  const wallW = w.w * p.scale;
  const wallD = w.d * p.scale * (state.camera3d ? .55 : 1);
  const wallH = state.camera3d ? Math.max(15, w.d * p.scale * .8) : wallD;
  const left = p.x - wallW / 2;
  const top = p.y - wallD / 2 - wallH;
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(left + 5, top + 6, wallW, wallH + wallD / 2);
  ctx.fillStyle = '#15343a'; ctx.fillRect(left, top, wallW, wallH);
  ctx.fillStyle = '#205057'; ctx.fillRect(left, p.y - wallD / 2, wallW, wallD / 2);
  ctx.strokeStyle = '#3e8a86'; ctx.strokeRect(left, top, wallW, wallH); ctx.strokeRect(left, p.y - wallD / 2, wallW, wallD / 2);
  ctx.fillStyle = '#6cf6df'; ctx.globalAlpha = .35; ctx.fillRect(left + 4, top + 4, 3, wallH - 8); ctx.globalAlpha = 1;
}
function drawCharacter(character, enemy, width, height) {
  const p = project(character.x, character.z, width, height);
  if (p.depth < .2) return;
  const size = state.firstPerson ? Math.max(24, Math.min(150, p.scale * .75)) : Math.max(22, Math.min(52, p.scale * .95));
  const color = enemy ? '#ff866b' : '#6cf6df';
  const dark = enemy ? '#522d31' : '#15545a';
  const groundY = p.y + size * .23;
  ctx.save();
  ctx.translate(p.x, p.y - size * .2);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 16;
  ctx.shadowColor = color;

  // Ground contact makes the perspective easier to read.
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath();
  ctx.ellipse(0, groundY - (p.y - size * .2), size * .34, size * .08, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs and boots.
  ctx.fillStyle = dark;
  ctx.fillRect(-size * .16, size * .02, size * .11, size * .25);
  ctx.fillRect(size * .05, size * .02, size * .11, size * .25);
  ctx.fillStyle = color;
  ctx.fillRect(-size * .19, size * .24, size * .16, size * .06);
  ctx.fillRect(size * .03, size * .24, size * .16, size * .06);

  // Armored torso with a bright center plate.
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-size * .25, -size * .43); ctx.lineTo(size * .25, -size * .43);
  ctx.lineTo(size * .2, size * .04); ctx.lineTo(-size * .2, size * .04); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, size * .025); ctx.stroke();
  ctx.fillStyle = color; ctx.globalAlpha *= .65;
  ctx.fillRect(-size * .06, -size * .35, size * .12, size * .25);
  ctx.globalAlpha = 1;

  // Head, visor and shoulder pads.
  ctx.fillStyle = '#0a171e';
  ctx.beginPath(); ctx.arc(0, -size * .61, size * .18, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(-size * .12, -size * .64, size * .24, size * .045);
  ctx.fillRect(-size * .31, -size * .38, size * .1, size * .13);
  ctx.fillRect(size * .21, -size * .38, size * .1, size * .13);

  // Weapon is angled toward the current facing direction.
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, size * .045);
  ctx.beginPath(); ctx.moveTo(size * .1, -size * .2); ctx.lineTo(size * .38, -size * .08); ctx.stroke();
  ctx.fillStyle = color; ctx.fillRect(size * .34, -size * .1, size * .16, size * .045);
  ctx.restore();
}
function drawEffects(width,height) { state.tracers.forEach(t=>{const a=project(t.x,t.z,width,height),b=project(t.tx,t.tz,width,height);ctx.strokeStyle=t.enemy?'#ff866b':'#f4db7c';ctx.globalAlpha=Math.min(1,t.life*8);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y-12);ctx.lineTo(b.x,b.y-12);ctx.stroke();ctx.globalAlpha=1;}); state.sparks.forEach(s=>{const p=project(s.x,s.z,width,height);ctx.fillStyle='#f4db7c';ctx.fillRect(p.x,p.y,s.life*8,s.life*8);}); }

function updateHud() { const p=state.player,e=state.enemy; const distance=Math.hypot(e.x-p.x,e.z-p.z); const status=state.over?document.getElementById('enemyStatus').textContent:(state.active?'HUNTING':'WAITING'); document.getElementById('playerArmor').textContent=Math.ceil(p.armor);document.getElementById('playerArmorBar').style.width=`${p.armor}%`;document.getElementById('enemyArmor').textContent=Math.ceil(e.armor);document.getElementById('enemyArmorBar').style.width=`${e.armor}%`;document.getElementById('ammoCount').textContent=p.ammo;document.getElementById('ammoPips').innerHTML=Array.from({length:12},(_,i)=>`<i class="${i>=p.ammo?'empty':''}"></i>`).join(''); document.getElementById('rangeValue').textContent=`${distance.toFixed(1)} M`;document.getElementById('accuracyValue').textContent=`${p.shots?Math.round(p.hits/p.shots*100):100}%`; if(!state.over) document.getElementById('enemyStatus').textContent=status; document.getElementById('hudPlayerArmor').textContent=Math.ceil(p.armor);document.getElementById('hudPlayerArmorBar').style.width=`${p.armor}%`;document.getElementById('hudEnemyArmor').textContent=Math.ceil(e.armor);document.getElementById('hudEnemyArmorBar').style.width=`${e.armor}%`;document.getElementById('hudAmmo').textContent=`${p.ammo} RDS`;document.getElementById('hudRange').textContent=`${distance.toFixed(1)} M`;document.getElementById('hudStatus').textContent=status; document.getElementById('matchTime').textContent=`${String(Math.floor(state.elapsed/60)).padStart(2,'0')}:${String(Math.floor(state.elapsed%60)).padStart(2,'0')}`; }

resize(); resetGame();
