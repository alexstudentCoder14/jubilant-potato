// Thin wrapper around the socket.io client so main.js doesn't need to know
// about socket.io directly. `io` is loaded globally via /socket.io/socket.io.js.

export class Network {
  constructor() {
    this.socket = null;
    this.selfId = null;
    this.worldHalfSize = 100;
    this.listeners = {
      welcome: [],
      playerJoined: [],
      playerLeft: [],
      state: [],
      connect: [],
      disconnect: [],
      pong: [],
    };
    this._lastPingSent = 0;
    this.pingMs = 0;
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  _emit(event, payload) {
    (this.listeners[event] || []).forEach((cb) => cb(payload));
  }

  connect() {
    // eslint-disable-next-line no-undef
    this.socket = io({ transports: ["websocket", "polling"] });

    this.socket.on("connect", () => {
      this._emit("connect", { id: this.socket.id });
      this._startPingLoop();
    });

    this.socket.on("disconnect", (reason) => {
      this._emit("disconnect", { reason });
    });

    this.socket.on("welcome", (data) => {
      this.selfId = data.selfId;
      if (data.world?.halfSize) this.worldHalfSize = data.world.halfSize;
      this._emit("welcome", data);
    });

    this.socket.on("playerJoined", (player) => this._emit("playerJoined", player));
    this.socket.on("playerLeft", (data) => this._emit("playerLeft", data));
    this.socket.on("state", (snapshot) => this._emit("state", snapshot));

    this.socket.on("pong-custom", (sentAt) => {
      this.pingMs = Math.round(performance.now() - sentAt);
      this._emit("pong", this.pingMs);
    });
  }

  _startPingLoop() {
    setInterval(() => {
      if (!this.socket?.connected) return;
      this.socket.emit("ping-custom", performance.now());
    }, 1000);
  }

  sendMove(x, y, z, rotY) {
    if (!this.socket?.connected) return;
    this.socket.emit("move", { x, y, z, rotY });
  }
}
