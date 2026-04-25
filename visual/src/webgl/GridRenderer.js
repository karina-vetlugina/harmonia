import { GRID, MAX_RIPPLES } from '../config.js';
import { VS, FS } from './shaders.js';

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(err || 'shader compile failed');
  }
  return sh;
}

function link(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const err = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(err || 'program link failed');
  }
  return p;
}

export class GridRenderer {
  /** @param {WebGL2RenderingContext} gl */
  constructor(gl) {
    this.gl = gl;
    const vsh = compile(gl, gl.VERTEX_SHADER, VS);
    const fsh = compile(gl, gl.FRAGMENT_SHADER, FS);
    this.program = link(gl, vsh, fsh);
    gl.deleteShader(vsh);
    gl.deleteShader(fsh);

    this.uWorldToClip = gl.getUniformLocation(this.program, 'u_worldToClip');
    this.uDotR = gl.getUniformLocation(this.program, 'u_dotR');
    this.uRippleTex = gl.getUniformLocation(this.program, 'u_rippleTex');
    this.uRippleCount = gl.getUniformLocation(this.program, 'u_rippleCount');
    this.uSigma = gl.getUniformLocation(this.program, 'u_sigma');

    this.quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    const q = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    gl.bufferData(gl.ARRAY_BUFFER, q, gl.STATIC_DRAW);

    this.instanceVbo = gl.createBuffer();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);

    this.rippleTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.rippleTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const zeros = new Float32Array(MAX_RIPPLES * 4 * 2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MAX_RIPPLES, 2, 0, gl.RGBA, gl.FLOAT, zeros);

    this.instanceCount = 0;
    this.rippleData = new Float32Array(MAX_RIPPLES * 4 * 2);
  }

  setDotPositions(positions) {
    const gl = this.gl;
    this.instanceCount = positions.length / 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
  }

  /** @param {import('../rippleModel.js').Ripple[]} ripples */
  uploadRipples(ripples) {
    const gl = this.gl;
    const d = this.rippleData;
    d.fill(0);
    const n = Math.min(ripples.length, MAX_RIPPLES);
    const rowStride = MAX_RIPPLES * 4;
    for (let i = 0; i < n; i++) {
      const r = ripples[i];
      const o0 = i * 4;
      d[o0 + 0] = r.x;
      d[o0 + 1] = r.y;
      d[o0 + 2] = r.r;
      d[o0 + 3] = r.g;
      const o1 = rowStride + i * 4;
      d[o1 + 0] = r.b;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.rippleTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_RIPPLES, 2, gl.RGBA, gl.FLOAT, d);
    return n;
  }

  draw(worldToClip, ripples) {
    const gl = this.gl;
    const count = this.uploadRipples(ripples);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uWorldToClip, false, worldToClip);
    gl.uniform1f(this.uDotR, GRID.DOT_R);
    gl.uniform1f(this.uSigma, GRID.RIPPLE_SIGMA);
    gl.uniform1i(this.uRippleCount, count);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.rippleTex);
    gl.uniform1i(this.uRippleTex, 0);

    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);
    gl.bindVertexArray(null);
  }
}
