// ONE CITY: SURVIVAL — Server (Stage 1)
//
// Responsibilities (server-authoritative):
//   - Track connected players (id, position, rotation, color, name)
//   - Validate incoming movement (basic anti-cheat: clamp speed + world bounds)
//   - Broadcast world state to all clients on a fixed tick rate
//   - Handle connect / disconnect
//
// Later stages will add: health, elimination, match/event state, etc.
// Keeping this file focused on "can multiple browsers connect and see
// each other move" — Stage 1's only job.

const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

// ---- Config (will move to /shared once more systems need it) ----
const TICK_RATE_HZ = 20; // server state broadcast rate
const TICK_MS = 1000 / TICK_RATE_HZ;
const WORLD_HALF_SIZE = 100; // world is a square from -100..100 on x/z
const MAX_SPEED_PER_TICK = 0.6; // max distance a player may move between updates (anti-cheat)
const PLAYER_COLORS = [
  0xff5252, 0x40c4ff, 0x69f0ae, 0xffd740, 0xff6e40, 0xb388ff, 0x64ffda, 0xff80ab,
  0xeeff41, 0x18ffff, 0xffab40, 0x7c4dff,
];

const app = express();
app.use(express.static(path.join(__dirname, "..", "client")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }, // fine for local/dev; tighten before real deployment
});

/** @type {Map<string, {id:string, name:string, color:number, x:number, y:number, z:number, rotY:number, lastUpdate:number}>} */
const players = new Map();
let colorCursor = 0;

function nextColor() {
  const c = PLAYER_COLORS[colorCursor % PLAYER_COLORS.length];
  colorCursor++;
  return c;
}

function randomSpawn() {
  // Spawn players loosely spread near the center so they can see each other immediately.
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * 6;
  return {
    x: Math.cos(angle) * radius,
    y: 0,
    z: Math.sin(angle) * radius,
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

io.on("connection", (socket) => {
  const spawn = randomSpawn();
  const player = {
    id: socket.id,
    name: `Player-${socket.id.slice(0, 4)}`,
    color: nextColor(),
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    rotY: 0,
    lastUpdate: Date.now(),
  };
  players.set(socket.id, player);

  console.log(`[connect] ${socket.id} (${players.size} online)`);

  // Tell the new player who they are and who's already here.
  socket.emit("welcome", {
    selfId: socket.id,
    players: Array.from(players.values()),
    world: { halfSize: WORLD_HALF_SIZE },
  });

  // Tell everyone else a new player joined.
  socket.broadcast.emit("playerJoined", player);

  // Client reports desired movement; server validates and stores it.
  // We do NOT trust the client's position blindly — we clamp both the
  // per-tick delta (max speed) and the world bounds server-side.
  socket.on("move", (msg) => {
    const p = players.get(socket.id);
    if (!p) return;
    if (
      typeof msg !== "object" ||
      typeof msg.x !== "number" ||
      typeof msg.y !== "number" ||
      typeof msg.z !== "number" ||
      typeof msg.rotY !== "number" ||
      !Number.isFinite(msg.x) ||
      !Number.isFinite(msg.y) ||
      !Number.isFinite(msg.z) ||
      !Number.isFinite(msg.rotY)
    ) {
      return; // reject malformed input
    }

    const dx = msg.x - p.x;
    const dz = msg.z - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Anti-cheat: reject/clip movement that's impossibly fast for one tick
    // (e.g. a spoofed teleport). Legit movement is client-predicted between
    // network sends, so we allow a generous but bounded step.
    if (dist > MAX_SPEED_PER_TICK * 4) {
      // Clip to max allowed distance along the same direction instead of
      // outright rejecting, so a laggy-but-honest client doesn't get stuck.
      const scale = (MAX_SPEED_PER_TICK * 4) / dist;
      p.x += dx * scale;
      p.z += dz * scale;
    } else {
      p.x = msg.x;
      p.z = msg.z;
    }

    p.x = clamp(p.x, -WORLD_HALF_SIZE, WORLD_HALF_SIZE);
    p.z = clamp(p.z, -WORLD_HALF_SIZE, WORLD_HALF_SIZE);
    p.y = clamp(msg.y, -5, 50); // rough vertical sanity bound (jump/fall) for Stage 1
    p.rotY = msg.rotY;
    p.lastUpdate = Date.now();
  });

  // Simple round-trip ping for the client's debug overlay.
  socket.on("ping-custom", (sentAt) => {
    socket.emit("pong-custom", sentAt);
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("playerLeft", { id: socket.id });
    console.log(`[disconnect] ${socket.id} (${players.size} online)`);
  });
});

// Fixed-rate authoritative broadcast — this is the ONLY place full world
// state goes out, so we're not spamming a broadcast per move event.
setInterval(() => {
  if (players.size === 0) return;
  const snapshot = Array.from(players.values()).map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    z: p.z,
    rotY: p.rotY,
  }));
  io.emit("state", { t: Date.now(), players: snapshot });
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`ONE CITY: SURVIVAL server listening on http://localhost:${PORT}`);
});
