// ee-crm/lib/polyfills.js
// Polyfills for DOMMatrix, DOMPoint, DOMRect, ImageData, and Path2D in Node.js serverless environments (Vercel Lambda)
// Required by pdfjs-dist / pdf-parse when running without native canvas bindings.

if (typeof globalThis.DOMPoint === 'undefined') {
  globalThis.DOMPoint = class DOMPoint {
    constructor(x = 0, y = 0, z = 0, w = 1) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    }
    static fromPoint(otherPoint) {
      return new DOMPoint(
        otherPoint.x,
        otherPoint.y,
        otherPoint.z !== undefined ? otherPoint.z : 0,
        otherPoint.w !== undefined ? otherPoint.w : 1
      );
    }
    matrixTransform(matrix) {
      return new DOMPoint(
        this.x * (matrix.a ?? 1) + this.y * (matrix.c ?? 0) + (matrix.e ?? 0),
        this.x * (matrix.b ?? 0) + this.y * (matrix.d ?? 1) + (matrix.f ?? 0),
        0,
        1
      );
    }
    toJSON() {
      return { x: this.x, y: this.y, z: this.z, w: this.w };
    }
  };
}

if (typeof globalThis.DOMRect === 'undefined') {
  globalThis.DOMRect = class DOMRect {
    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }
    static fromRect(otherRect) {
      return new DOMRect(otherRect.x, otherRect.y, otherRect.width, otherRect.height);
    }
    get top() { return this.y; }
    get left() { return this.x; }
    get right() { return this.x + this.width; }
    get bottom() { return this.y + this.height; }
    toJSON() {
      return { x: this.x, y: this.y, width: this.width, height: this.height, top: this.top, left: this.left, right: this.right, bottom: this.bottom };
    }
  };
}

if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init) {
      if (Array.isArray(init) && init.length === 6) {
        this.a = init[0]; this.b = init[1]; this.c = init[2]; this.d = init[3]; this.e = init[4]; this.f = init[5];
      } else if (Array.isArray(init) && init.length === 16) {
        this.a = init[0]; this.b = init[1]; this.c = init[4]; this.d = init[5]; this.e = init[12]; this.f = init[13];
      } else if (init && typeof init === 'object') {
        this.a = init.a ?? 1; this.b = init.b ?? 0; this.c = init.c ?? 0; this.d = init.d ?? 1; this.e = init.e ?? 0; this.f = init.f ?? 0;
      } else {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      }
      this.m11 = this.a; this.m12 = this.b; this.m13 = 0; this.m14 = 0;
      this.m21 = this.c; this.m22 = this.d; this.m23 = 0; this.m24 = 0;
      this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
      this.m41 = this.e; this.m42 = this.f; this.m43 = 0; this.m44 = 1;
      this.is2D = true;
      this.isIdentity = (this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0);
    }

    scaleSelf(scaleX = 1, scaleY = scaleX) {
      this.a *= scaleX;
      this.b *= scaleX;
      this.c *= scaleY;
      this.d *= scaleY;
      this.m11 = this.a; this.m12 = this.b;
      this.m21 = this.c; this.m22 = this.d;
      return this;
    }

    translateSelf(tx = 0, ty = 0) {
      this.e += this.a * tx + this.c * ty;
      this.f += this.b * tx + this.d * ty;
      this.m41 = this.e;
      this.m42 = this.f;
      return this;
    }

    preMultiplySelf(other) {
      const o = other instanceof DOMMatrix ? other : new DOMMatrix(other);
      const a = o.a * this.a + o.b * this.c;
      const b = o.a * this.b + o.b * this.d;
      const c = o.c * this.a + o.d * this.c;
      const d = o.c * this.b + o.d * this.d;
      const e = o.e * this.a + o.f * this.c + this.e;
      const f = o.e * this.b + o.f * this.d + this.f;
      this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
      return this;
    }

    multiplySelf(other) {
      const o = other instanceof DOMMatrix ? other : new DOMMatrix(other);
      const a = this.a * o.a + this.b * o.c;
      const b = this.a * o.b + this.b * o.d;
      const c = this.c * o.a + this.d * o.c;
      const d = this.c * o.b + this.d * o.d;
      const e = this.e * o.a + this.f * o.c + o.e;
      const f = this.e * o.b + this.f * o.d + o.f;
      this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
      return this;
    }

    invertSelf() {
      const det = this.a * this.d - this.b * this.c;
      if (!det) return this;
      const a = this.d / det;
      const b = -this.b / det;
      const c = -this.c / det;
      const d = this.a / det;
      const e = (this.c * this.f - this.d * this.e) / det;
      const f = (this.b * this.e - this.a * this.f) / det;
      this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
      return this;
    }

    translate(tx, ty) {
      return new DOMMatrix(this).translateSelf(tx, ty);
    }
    scale(scaleX, scaleY) {
      return new DOMMatrix(this).scaleSelf(scaleX, scaleY);
    }
    multiply(other) {
      return new DOMMatrix(this).multiplySelf(other);
    }
    transformPoint(point) {
      return new DOMPoint(point.x, point.y).matrixTransform(this);
    }
  };
}

if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(width = 1, height = 1) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  };
}

if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D {
    constructor() {}
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    rect() {}
  };
}
