import * as THREE from "three";
import { Network } from "./network.js";

// ---------------------------------------------------------------------------
// STAGE 1 SCOPE:
//   - Minimal 3D ground + sky so players have something to stand on.
//   - Third-person controlled local player (WASD + mouse look, jump/sprint/crouch).
//   - Remote players rendered + smoothly interpolated from server snapshots.
//   - Title screen -> connecting -> waiting -> countdown -> in-game flow.
//   - Debug overlay (F3) with fps/ping/player count/tick/position/connection.
// City geometry, events, health, inventory etc. are later stages.
// ---------------------------------------------------------------------------

// ---------- DOM ----------
const screenTitle = document.getElementById("screen-title");
const screenHowto = document.getElementById("screen-howto");
const screenStatus = document.getElementById("screen-status");
const statusText = document.getElementById("status-text");
const hud = document.getElementById("hud");
const hudPlayerCount = document.getElementById("hud-player-count");
const hudHint = document.getElementById("hud-hint");
const debugPanel = document.getElementById("debug-panel");
const dbgFps = document.getElementById("dbg-fps");
const dbgPing = document.getElementById("dbg-ping");
const dbgPlayers = document.getElementById("dbg-players");
const dbgPos = document.getElementById("dbg-pos");
const dbgConn = document.getElementById("dbg-conn");

document.getElementById("btn-howto").onclick = () => {
  screenTitle.classList.add("hidden");
  screenHowto.classList.remove("hidden");
};
document.getElementById("btn-howto-back").onclick = () => {
  screenHowto.classList.add("hidden");
  screenTitle.classList.remove("hidden");
};
document.getElementById("btn-play").onclick = startConnecting;

let debugVisible = false;
window.addEventListener("keydown", (e) => {
  if (e.code === "F3") {
    debugVisible = !debugVisible;
    debugPanel.classList.toggle("hidden", !debugVisible);
  }
});

// ---------- Networking ----------
const net = new Network();
let waitingCountdownStarted = false;

function startConnecting() {
  screenTitle.classList.add("hidden");
  screenStatus.classList.remove("hidden");
  statusText.textContent = "CONNECTING...";
  net.connect();
}

net.on("connect", () => {
  statusText.textContent = "WAITING FOR PLAYERS...";
  dbgConn.textContent = "connected";
  // Stage 1: no real lobby gate yet — drop straight into the world after a
  // short beat so you can visually confirm the connect flow. The lobby/
  // countdown-to-match-start system (2-10 players) lands in Stage 3.
  if (!waitingCountdownStarted) {
    waitingCountdownStarted = true;
    setTimeout(enterGame, 700);
  }
});

net.on("disconnect", () => {
  dbgConn.textContent = "disconnected";
  statusText.textContent = "DISCONNECTED — RETRYING...";
  screenStatus.classList.remove("hidden");
  hud.classList.add("hidden");
});

net.on("pong", (ms) => {
  dbgPing.textContent = String(ms);
});

// ---------- Three.js scene ----------
const canvas = document.getElementById("game-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e13);
scene.fog = new THREE.Fog(0x0b0e13, 40, 160);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);

// Lighting — placeholder "night city" atmosphere for Stage 1.
const hemi = new THREE.HemisphereLight(0x8fa5c9, 0x1a1d22, 0.6);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xbcd0ff, 0.9);
moon.position.set(30, 50, -20);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = -60;
moon.shadow.camera.right = 60;
moon.shadow.camera.top = 60;
moon.shadow.camera.bottom = -60;
scene.add(moon);

// Ground — flat plane with a grid so movement is readable; real streets come later.
const groundGeo = new THREE.PlaneGeometry(220, 220);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x1c2027, roughness: 1 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(220, 44, 0x333844, 0x22262e);
grid.position.y = 0.01;
scene.add(grid);

// A handful of placeholder "building" boxes so the world doesn't feel empty
// while the real city (Stage 2) is being built.
const buildingMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 });
for (let i = 0; i < 18; i++) {
  const w = 4 + Math.random() * 6;
  const d = 4 + Math.random() * 6;
  const h = 6 + Math.random() * 22;
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
  const angle = Math.random() * Math.PI * 2;
  const radius = 25 + Math.random() * 70;
  box.position.set(Math.cos(angle) * radius, h / 2, Math.sin(angle) * radius);
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
renderer.setSize(window.innerWidth, window.innerHeight);

// ---------- Name tag helper ----------
function makeNameSprite(text, colorHex) {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 256;
  canvasEl.height = 64;
  const ctx = canvasEl.getContext("2d");
  ctx.font = "bold 32px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 8, 256, 40);
  ctx.fillStyle = `#${colorHex.toString(16).padStart(6, "0")}`;
  ctx.fillText(text, 128, 36);
  const tex = new THREE.CanvasTexture(canvasEl);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.2, 0.55, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function makeCharacterMesh(colorHex) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 1.1, 4, 8),
    new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6 })
  );
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);
  return group;
}

// ---------- Local player ----------
const PLAYER_HEIGHT = 0.95;
const WALK_SPEED = 4.2;
const SPRINT_SPEED = 7.2;
const CROUCH_SPEED = 2.1;
const JUMP_VELOCITY = 6.0;
const GRAVITY = -16;

const local = {
  mesh: null,
  position: new THREE.Vector3(0, 0, 0),
  velocityY: 0,
  yaw: 0,
  pitch: -0.15,
  grounded: true,
  crouching: false,
};

const keys = new Set();
window.addEventListener("keydown", (e) => keys.add(e.code));
window.addEventListener("keyup", (e) => keys.delete(e.code));

let pointerLocked = false;
canvas.addEventListener("click", () => {
  if (hud.classList.contains("hidden")) return; // only lock once in-game
  canvas.requestPointerLock();
});
document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === canvas;
  hudHint.classList.toggle("hidden", pointerLocked);
});
document.addEventListener("mousemove", (e) => {
  if (!pointerLocked) return;
  local.yaw -= e.movementX * 0.0022;
  local.pitch -= e.movementY * 0.0022;
  local.pitch = Math.max(-1.1, Math.min(0.9, local.pitch));
});
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" && pointerLocked) document.exitPointerLock();
});

// ---------- Remote players ----------
/** @type {Map<string, {mesh:THREE.Group, nameSprite:THREE.Sprite, target:THREE.Vector3, targetRotY:number, current:THREE.Vector3, currentRotY:number}>} */
const remotePlayers = new Map();

function addRemotePlayer(p) {
  if (remotePlayers.has(p.id)) return;
  const mesh = makeCharacterMesh(p.color ?? 0x40c4ff);
  const nameSprite = makeNameSprite(p.name ?? p.id.slice(0, 4), p.color ?? 0x40c4ff);
  nameSprite.position.set(0, 2.1, 0);
  mesh.add(nameSprite);
  mesh.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
  scene.add(mesh);
  remotePlayers.set(p.id, {
    mesh,
    target: new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0),
    targetRotY: p.rotY ?? 0,
    current: new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0),
    currentRotY: p.rotY ?? 0,
  });
}

function removeRemotePlayer(id) {
  const rp = remotePlayers.get(id);
  if (!rp) return;
  scene.remove(rp.mesh);
  remotePlayers.delete(id);
}

net.on("welcome", (data) => {
  local.position.set(0, 0, 0);
  data.players.forEach((p) => {
    if (p.id === data.selfId) return;
    addRemotePlayer(p);
  });
});

net.on("playerJoined", (p) => {
  if (p.id === net.selfId) return;
  addRemotePlayer(p);
});

net.on("playerLeft", ({ id }) => removeRemotePlayer(id));

net.on("state", (snapshot) => {
  dbgPlayers.textContent = String(snapshot.players.length);
  hudPlayerCount.textContent = String(snapshot.players.length);
  snapshot.players.forEach((p) => {
    if (p.id === net.selfId) return; // server echoes us too — ignore for local (client-predicted)
    let rp = remotePlayers.get(p.id);
    if (!rp) {
      addRemotePlayer(p);
      rp = remotePlayers.get(p.id);
    }
    rp.target.set(p.x, p.y, p.z);
    rp.targetRotY = p.rotY;
  });
});

// ---------- Game state flow ----------
function enterGame() {
  screenStatus.classList.add("hidden");
  hud.classList.remove("hidden");
  local.mesh = makeCharacterMesh(0xffffff);
  local.mesh.visible = false; // third-person but we hide our own body from clipping the camera for now
  scene.add(local.mesh);
  animate();
}

// ---------- Movement + camera ----------
const clock = new THREE.Clock();
let lastNetSend = 0;
const NET_SEND_INTERVAL = 50; // ms — matches ~20Hz server tick

function updateLocalPlayer(dt) {
  const forward = new THREE.Vector3(Math.sin(local.yaw), 0, Math.cos(local.yaw));
  const right = new THREE.Vector3(Math.cos(local.yaw), 0, -Math.sin(local.yaw));

  let speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? SPRINT_SPEED : WALK_SPEED;
  local.crouching = keys.has("KeyC");
  if (local.crouching) speed = CROUCH_SPEED;

  const move = new THREE.Vector3();
  if (keys.has("KeyW")) move.add(forward);
  if (keys.has("KeyS")) move.sub(forward);
  if (keys.has("KeyD")) move.add(right);
  if (keys.has("KeyA")) move.sub(right);
  if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);

  local.position.add(move);

  // Very simple gravity/jump for Stage 1 (flat ground only).
  if (keys.has("Space") && local.grounded) {
    local.velocityY = JUMP_VELOCITY;
    local.grounded = false;
  }
  local.velocityY += GRAVITY * dt;
  local.position.y += local.velocityY * dt;
  if (local.position.y <= 0) {
    local.position.y = 0;
    local.velocityY = 0;
    local.grounded = true;
  }

  // World bounds (keep in sync with server WORLD_HALF_SIZE for stage 1 sanity)
  const bound = net.worldHalfSize;
  local.position.x = Math.max(-bound, Math.min(bound, local.position.x));
  local.position.z = Math.max(-bound, Math.min(bound, local.position.z));

  if (local.mesh) {
    local.mesh.position.copy(local.position);
    local.mesh.rotation.y = local.yaw;
  }

  // Third-person camera: orbit behind the player based on yaw/pitch.
  const camDistance = local.crouching ? 4.2 : 5.2;
  const camHeight = 1.6 + local.pitch * 2.2;
  const camOffset = new THREE.Vector3(
    -Math.sin(local.yaw) * camDistance,
    camHeight,
    -Math.cos(local.yaw) * camDistance
  );
  const desiredCamPos = local.position.clone().add(camOffset).add(new THREE.Vector3(0, 1.2, 0));
  camera.position.lerp(desiredCamPos, 1 - Math.pow(0.001, dt));
  const lookTarget = local.position.clone().add(new THREE.Vector3(0, PLAYER_HEIGHT, 0));
  camera.lookAt(lookTarget);
}

function sendNetworkUpdate(now) {
  if (now - lastNetSend < NET_SEND_INTERVAL) return;
  lastNetSend = now;
  net.sendMove(local.position.x, local.position.y, local.position.z, local.yaw);
}

function updateRemoteInterpolation(dt) {
  remotePlayers.forEach((rp) => {
    // Smooth toward the last server snapshot rather than snapping —
    // avoids remote players teleporting on every network update.
    rp.current.lerp(rp.target, Math.min(1, dt * 10));
    let dRot = rp.targetRotY - rp.currentRotY;
    dRot = Math.atan2(Math.sin(dRot), Math.cos(dRot));
    rp.currentRotY += dRot * Math.min(1, dt * 10);
    rp.mesh.position.copy(rp.current);
    rp.mesh.rotation.y = rp.currentRotY;
  });
}

// ---------- FPS counter ----------
let frames = 0;
let fpsAccum = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  updateLocalPlayer(dt);
  updateRemoteInterpolation(dt);
  sendNetworkUpdate(performance.now());

  renderer.render(scene, camera);

  frames++;
  fpsAccum += dt;
  if (fpsAccum >= 0.5) {
    dbgFps.textContent = String(Math.round(frames / fpsAccum));
    frames = 0;
    fpsAccum = 0;
    dbgPos.textContent = `${local.position.x.toFixed(1)}, ${local.position.y.toFixed(1)}, ${local.position.z.toFixed(1)}`;
  }
}
