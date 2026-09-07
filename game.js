const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const centerMessage = document.getElementById('centerMessage');
const hitFlash = document.getElementById('hitFlash');
const damageVignette = document.getElementById('damageVignette');
const keys = new Set();

const state = {
  active: false,
  over: false,
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
  centerMessage.textContent = 'PRESS SPACE TO DEPLOY'; centerMessage.style.display = 'block';
  updateHud(); draw();
}

document.getElementById('resetButton').addEventListener('click', resetGame);
window.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'Space' && !event.repeat) {
    if (state.over) resetGame();
    if (!state.active) { state.active = true; centerMessage.style.display = 'none'; state.lastTime = performance.now(); requestAnimationFrame(loop); }
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
  state.tracers.push({ x: player.x, z: player.z, tx: state.enemy.x, tz: state.enemy.z, life: .16, good: Math.abs(angleDiff) < .12 && distance < 14 });
  if (Math.abs(angleDiff) < .12 && distance < 14) {
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
  if (keys.has('ArrowLeft')) player.angle -= 2.5 * dt;
  if (keys.has('ArrowRight')) player.angle += 2.5 * dt;
  let forward = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
  player.x += Math.sin(player.angle) * forward * speed; player.z -= Math.cos(player.angle) * forward * speed;
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

function project(x, z, width, height) { const player = state.player; const dx = x - player.x; const dz = z - player.z; const sin = Math.sin(player.angle), cos = Math.cos(player.angle); const side = dx * cos - dz * sin; const depth = dx * sin + dz * cos; return { x: width / 2 + side * 47 / Math.max(.6, depth + 4) * 5, y: height * .55 - (depth + 5) * 2.6, depth }; }
function draw() { const width = canvas.clientWidth, height = canvas.clientHeight; ctx.clearRect(0, 0, width, height); drawBackground(width, height); drawGrid(width, height); [...walls].sort((a,b) => b.z - a.z).forEach(w => drawWall(w, width, height)); drawCharacter(state.enemy, true, width, height); drawCharacter(state.player, false, width, height); drawEffects(width, height); }
function drawBackground(width, height) { const gradient = ctx.createLinearGradient(0,0,0,height); gradient.addColorStop(0,'#0a1d26'); gradient.addColorStop(.52,'#0b2228'); gradient.addColorStop(1,'#061218'); ctx.fillStyle=gradient; ctx.fillRect(0,0,width,height); ctx.strokeStyle='rgba(108,246,223,.12)'; ctx.lineWidth=1; for(let y=height*.35;y<height*.7;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();} }
function drawGrid(width, height) { const horizon=height*.55; ctx.strokeStyle='rgba(108,246,223,.15)'; for(let x=-width;x<width*2;x+=55){ctx.beginPath();ctx.moveTo(width/2,horizon);ctx.lineTo(x,height);ctx.stroke();} ctx.fillStyle='#0d2b30'; ctx.fillRect(0,horizon,width,height-horizon); }
function drawWall(w,width,height) { const p=project(w.x,w.z,width,height); const depth=Math.max(10, 58/(p.depth+5)); const wallW=w.w*depth, wallH=w.d*depth*.8; if(p.depth<-.5)return; ctx.fillStyle='#15343a'; ctx.fillRect(p.x-wallW/2,p.y-wallH,wallW,wallH); ctx.strokeStyle='#3e8a86';ctx.strokeRect(p.x-wallW/2,p.y-wallH,wallW,wallH); ctx.fillStyle='#6cf6df';ctx.globalAlpha=.35;ctx.fillRect(p.x-wallW/2+4,p.y-wallH+4,3,wallH-8);ctx.globalAlpha=1; }
function drawCharacter(character, enemy, width, height) { const p=project(character.x,character.z,width,height); if(p.depth<.2)return; const size=Math.max(9, 280/(p.depth+5)); const color=enemy?'#ff866b':'#6cf6df'; ctx.save(); ctx.translate(p.x,p.y-size*.2); ctx.globalAlpha=Math.min(1, p.depth/2); ctx.shadowBlur=16;ctx.shadowColor=color;ctx.fillStyle=color; ctx.fillRect(-size*.18,-size*.48,size*.36,size*.48); ctx.fillStyle=enemy?'#522d31':'#15545a';ctx.fillRect(-size*.29,0,size*.58,size*.22);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(-size*.18,-size*.48,size*.36,size*.7);ctx.beginPath();ctx.arc(0,-size*.66,size*.17,0,Math.PI*2);ctx.fillStyle='#0a171e';ctx.fill();ctx.stroke();ctx.restore(); }
function drawEffects(width,height) { state.tracers.forEach(t=>{const a=project(t.x,t.z,width,height),b=project(t.tx,t.tz,width,height);ctx.strokeStyle=t.enemy?'#ff866b':'#f4db7c';ctx.globalAlpha=Math.min(1,t.life*8);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y-12);ctx.lineTo(b.x,b.y-12);ctx.stroke();ctx.globalAlpha=1;}); state.sparks.forEach(s=>{const p=project(s.x,s.z,width,height);ctx.fillStyle='#f4db7c';ctx.fillRect(p.x,p.y,s.life*8,s.life*8);}); }

function updateHud() { const p=state.player,e=state.enemy; document.getElementById('playerArmor').textContent=Math.ceil(p.armor);document.getElementById('playerArmorBar').style.width=`${p.armor}%`;document.getElementById('enemyArmor').textContent=Math.ceil(e.armor);document.getElementById('enemyArmorBar').style.width=`${e.armor}%`;document.getElementById('ammoCount').textContent=p.ammo;document.getElementById('ammoPips').innerHTML=Array.from({length:12},(_,i)=>`<i class="${i>=p.ammo?'empty':''}"></i>`).join(''); const distance=Math.hypot(e.x-p.x,e.z-p.z);document.getElementById('rangeValue').textContent=`${distance.toFixed(1)} M`;document.getElementById('accuracyValue').textContent=`${p.shots?Math.round(p.hits/p.shots*100):100}%`; if(!state.over) document.getElementById('enemyStatus').textContent=state.active?'HUNTING':'WAITING';document.getElementById('matchTime').textContent=`${String(Math.floor(state.elapsed/60)).padStart(2,'0')}:${String(Math.floor(state.elapsed%60)).padStart(2,'0')}`; }

resize(); resetGame();
