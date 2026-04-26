'use strict';

// Resolves the WebSocket server URL:
//   - local dev  → ws://localhost:8080
//   - production → update PROD_URL below after deploying to Render/Railway
const PROD_URL = 'wss://YOUR-APP.onrender.com'; // ← update this after deploying server
const SERVER_URL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'ws://localhost:8080'
  : PROD_URL;

class Network {
  constructor() {
    this.ws         = null;
    this.player     = -1;   // 0 = P1 (creator), 1 = P2 (joiner)
    this._handlers  = {};
  }

  on(type, fn) { this._handlers[type] = fn; }

  _emit(type, data) {
    if (this._handlers[type]) this._handlers[type](data);
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(SERVER_URL);
      this.ws.onopen    = () => resolve();
      this.ws.onerror   = () => reject(new Error('Cannot reach server'));
      this.ws.onclose   = () => this._emit('disconnect', {});
      this.ws.onmessage = ({ data }) => {
        let msg;
        try { msg = JSON.parse(data); } catch { return; }
        if (msg.type === 'room_created' || msg.type === 'room_joined') {
          this.player = msg.player;
        }
        this._emit(msg.type, msg);
      };
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  createRoom()              { this.send({ type: 'create_room' }); }
  joinRoom(code)            { this.send({ type: 'join_room', code }); }
  sendShot(ax, ay, vx, vy) { this.send({ type: 'shot', anchorX: ax, anchorY: ay, vx, vy }); }
  sendNewRound(resetScores) { this.send({ type: 'new_round', resetScores }); }
}
