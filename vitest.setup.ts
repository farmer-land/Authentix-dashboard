import '@testing-library/jest-dom';

// jsdom doesn't implement canvas — lottie-web (via ExportSection's success
// animation) and several table/field components call getContext('2d') at
// render/module-load time. Stub just enough of the 2D context surface that
// those call sites don't throw; none of our tests assert on actual pixel
// output, so no-op/return-self stubs are sufficient.
class MockCanvasRenderingContext2D {
  fillStyle = '';
  strokeStyle = '';
  font = '';
  globalAlpha = 1;
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  textAlign = 'start';
  textBaseline = 'alphabetic';

  fillRect() {}
  clearRect() {}
  strokeRect() {}
  fillText() {}
  strokeText() {}
  measureText() {
    return { width: 0 } as TextMetrics;
  }
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  arcTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  rect() {}
  fill() {}
  stroke() {}
  clip() {}
  save() {}
  restore() {}
  translate() {}
  scale() {}
  rotate() {}
  transform() {}
  setTransform() {}
  resetTransform() {}
  setLineDash() {}
  getLineDash() {
    return [];
  }
  drawImage() {}
  createLinearGradient() {
    return { addColorStop() {} };
  }
  createRadialGradient() {
    return { addColorStop() {} };
  }
  createPattern() {
    return null;
  }
  getImageData(_sx: number, _sy: number, sw: number, sh: number) {
    return { data: new Uint8ClampedArray(sw * sh * 4), width: sw, height: sh } as ImageData;
  }
  putImageData() {}
  createImageData(sw: number, sh: number) {
    return { data: new Uint8ClampedArray(sw * sh * 4), width: sw, height: sh } as ImageData;
  }
}

HTMLCanvasElement.prototype.getContext = ((contextId: string) => {
  if (contextId === '2d') return new MockCanvasRenderingContext2D() as unknown as CanvasRenderingContext2D;
  return null;
}) as typeof HTMLCanvasElement.prototype.getContext;
