// The camcorder look: one WebGL pass over the low-resolution frame.
// Scanlines, a slight curve, colour bleed, grain, vignette and tracking wobble.
// If WebGL is unavailable it falls back to a plain nearest-neighbour upscale.

const VERT = `
attribute vec2 p;
varying vec2 uv;
void main() { uv = p * 0.5 + 0.5; uv.y = 1.0 - uv.y; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 src;
uniform float time;
uniform float glitch;
uniform float soft;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  // barrel curve
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + dot(c, c) * mix(0.045, 0.02, soft);
  vec2 q = c * 0.5 + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  // tape wobble: a slow sway on every line, and a tear band when hurt
  float line = floor(q.y * src.y);
  float g = glitch * (1.0 - soft * 0.8);
  float sway = sin(line * 0.21 + time * 3.1) * 0.0009 + (hash(vec2(line, floor(time * 24.0))) - 0.5) * 0.0012;
  float band = fract(time * 0.11);
  float tear = smoothstep(0.035, 0.0, abs(q.y - band)) * (0.004 + g * 0.05);
  float jolt = (hash(vec2(floor(q.y * 18.0), floor(time * 30.0))) - 0.5) * g * 0.06;
  q.x += sway + tear + jolt;

  // colour bleed
  float ab = (0.8 + g * 3.5) / src.x;
  vec3 col;
  col.r = texture2D(tex, q + vec2(ab, 0.0)).r;
  col.g = texture2D(tex, q).g;
  col.b = texture2D(tex, q - vec2(ab, 0.0)).b;

  // scanlines, one per source row
  float s = 0.78 + 0.22 * sin(q.y * src.y * 6.28318);
  col *= mix(s, 1.0, soft * 0.5);

  // lifted tape blacks, grain and a flicker
  col = col * 0.94 + vec3(0.018, 0.016, 0.014);
  float n = hash(uv * 900.0 + time * 61.0) - 0.5;
  col += n * mix(0.075, 0.035, soft);
  col *= 1.0 + sin(time * 47.0) * 0.012 * (1.0 - soft);
  col += vec3(0.25, 0.27, 0.3) * tear * 6.0;

  // vignette
  float v = pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.28);
  col *= v;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createPostFx(canvas) {
  let gl = null;
  try { gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false }); } catch (e) { gl = null; }
  if (!gl) return fallback(canvas);

  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
  } catch (e) {
    return fallback(canvas);
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const u = {
    src: gl.getUniformLocation(prog, 'src'), time: gl.getUniformLocation(prog, 'time'),
    glitch: gl.getUniformLocation(prog, 'glitch'), soft: gl.getUniformLocation(prog, 'soft'),
  };

  return {
    webgl: true,
    draw(source, { time, glitch, soft }) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.uniform2f(u.src, source.width, source.height);
      gl.uniform1f(u.time, time);
      gl.uniform1f(u.glitch, glitch);
      gl.uniform1f(u.soft, soft ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

function fallback(canvas) {
  const x = canvas.getContext('2d');
  return {
    webgl: false,
    draw(source) {
      x.imageSmoothingEnabled = false;
      x.drawImage(source, 0, 0, canvas.width, canvas.height);
      x.fillStyle = 'rgba(0,0,0,0.18)';
      const step = canvas.height / source.height;
      for (let y = 0; y < canvas.height; y += step) x.fillRect(0, y + step * 0.5, canvas.width, step * 0.45);
    },
  };
}
