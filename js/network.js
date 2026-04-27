'use strict';

// Resolves the WebSocket server URL:
//   - local dev  → ws://localhost:8080
//   - production → update PROD_URL below after deploying to Render/Railway
const PROD_URL = 'wss://carrom-server.onrender.com';
const SERVER_URL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'ws://localhost:8080'
  : PROD_URL;

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 15;   // 15 * 2s = 30s window — matches server grace period

class Network {
  constructor() {
    this.ws         = null;
    this.player     = -1;   // 0 = P1 (creator), 1 = P2 (joiner)
    this._handlers  = {};
    this._roomCode  = null;
    this._token     = null;
    this._closed    = false;
    this._reconnecting = false;
    this._reconnectAttempts = 0;
    this._initialResolve = null;
    this._initialReject  = null;
    this._pingTimer = null;
  }

  on(type, fn) { this._handlers[type] = fn; }

  _emit(type, data) {
    if (this._handlers[type]) this._handlers[type](data);
  }

  connect() {
    return new Promise((resolve, reject) => {
      this._initialResolve = resolve;
      this._initialReject  = reject;
      this._openSocket();
    });
  }

  _openSocket() {
    this.ws = new WebSocket(SERVER_URL);

    this.ws.onopen = () => {
      clearInterval(this._pingTimer);
      // Send a keepalive ping every 20s so Render's proxy doesn't drop the connection
      this._pingTimer = setInterval(() => {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 20000);

      if (this._reconnecting) {
        // Reattach to the existing room on the server
        this.ws.send(JSON.stringify({
          type: 'rejoin_room',
          code: this._roomCode,
          token: this._token,
          player: this.player,
        }));
      } else if (this._initialResolve) {
        this._initialResolve();
        this._initialResolve = this._initialReject = null;
      }
    };

    this.ws.onerror = () => {
      if (this._initialReject) {
        this._initialReject(new Error('Cannot reach server'));
        this._initialResolve = this._initialReject = null;
      }
    };

    this.ws.onclose = () => {
      clearInterval(this._pingTimer);
      if (this._closed) return;
      // Try to reconnect if we were in a room — covers backgrounded apps,
      // dropped wifi, Render proxy timeouts, etc.
      if (this._roomCode && this._token && this._reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        if (!this._reconnecting) {
          this._reconnecting = true;
          this._emit('reconnecting', {});
        }
        this._reconnectAttempts++;
        setTimeout(() => this._openSocket(), RECONNECT_DELAY);
      } else {
        this._reconnecting = false;
        this._emit('disconnect', {});
      }
    };

    this.ws.onmessage = ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      if (msg.type === 'room_created' || msg.type === 'room_joined') {
        this.player = msg.player;
        if (msg.code)  this._roomCode = msg.code;
        if (msg.token) this._token    = msg.token;
      }
      if (msg.type === 'rejoin_ok') {
        this._reconnecting      = false;
        this._reconnectAttempts = 0;
        this._emit('reconnected', {});
        return;
      }
      if (msg.type === 'rejoin_failed') {
        // Room expired on the server — give up, surface as a normal disconnect
        this._closed = true;
        this._reconnecting = false;
        this._emit('disconnect', {});
        return;
      }

      this._emit(msg.type, msg);
    };
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  createRoom() { this.send({ type: 'create_room' }); }
  joinRoom(code) {
    const c = (code || '').toUpperCase().trim();
    this._roomCode = c;
    this.send({ type: 'join_room', code: c });
  }
  sendShot(ax, ay, vx, vy) { this.send({ type: 'shot', anchorX: ax, anchorY: ay, vx, vy }); }
  sendNewRound(resetScores) { this.send({ type: 'new_round', resetScores }); }
  sendPlacing(x)            { this.send({ type: 'placing', x }); }
}
