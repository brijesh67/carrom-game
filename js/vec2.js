'use strict';

class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }

  add(v)    { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v)    { return new Vec2(this.x - v.x, this.y - v.y); }
  scale(s)  { return new Vec2(this.x * s, this.y * s); }
  dot(v)    { return this.x * v.x + this.y * v.y; }
  lenSq()   { return this.x * this.x + this.y * this.y; }
  len()     { return Math.sqrt(this.lenSq()); }
  norm()    { const l = this.len(); return l > 0 ? this.scale(1 / l) : new Vec2(); }
  clone()   { return new Vec2(this.x, this.y); }
  neg()     { return new Vec2(-this.x, -this.y); }

  static fromAngle(a, len = 1) { return new Vec2(Math.cos(a) * len, Math.sin(a) * len); }
  static dist(a, b) { return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2); }
}
