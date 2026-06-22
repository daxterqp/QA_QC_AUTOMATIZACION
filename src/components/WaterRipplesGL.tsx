import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { GLView } from 'expo-gl';

/**
 * WaterRipplesGL — agua refractiva por shaders (expo-gl / WebGL1 y WebGL2).
 * Heightmap ping-pong (altura+velocidad en RG, half-float): ecuación de onda con
 * vecinos en cruz, dampening ~0.985; impactos con radio/fuerza (gota), corregidos
 * por aspect ratio para que sean CIRCULARES en pantalla. Render: normales por
 * diferencias finitas → refracción UV del gradiente + specular sutil.
 *
 * Va DETRÁS del contenido (pointerEvents none). El login captura el toque y llama
 * `drop(xNorm, yNorm, isMove)`; en arrastre interpola puntos → rastro fluido.
 * Si el equipo no soporta FBO half-float → onUnsupported() → el login usa ripple JS.
 */

export type WaterGLHandle = {
  drop: (xNorm: number, yNorm: number, isMove?: boolean) => void;
  /** Ola fuerte que sube desde abajo (transición intro → login). */
  bigWave: () => void;
};

const MAX_DROPS = 16; // impactos inyectados por frame (rastro del arrastre/animación)
// Animación por defecto: dos "dedos" en la parte baja deslizándose borde↔centro en bucle.
const AUTO_SPEED = 0.15;    // rad/frame (más alto = más rápido). Regular a gusto.
const AUTO_STR = 0.55;     // intensidad del trazo sostenido
const AUTO_Y = 0.08;       // altura (cerca del borde inferior)
const AUTO_PHASE_OFF = 2.4; // desfase entre los dos dedos (no van en lockstep)
// "Twin": LÍNEA de puntos interpolados entre dos extremos aleatorios, REITERADA cada
// frame durante el hold → se acumula una cresta y la ola crece (como tocar a mano).
const TWIN_EVERY = 180;    // frames base entre apariciones (~3 s a 60fps)
const TWIN_HOLD = 45;      // frames sostenidos reiterando el trazo (~0.75 s)
const TWIN_STR = 0.3;      // intensidad por punto (se acumula → crece la ola)
const TWIN_PTS = 8;        // puntos interpolados entre los dos extremos
// Ajuste fino vertical del impacto (en fracción de pantalla). + = la onda baja.
// Si la onda aparece ARRIBA del toque, subí este número; si queda abajo, bajalo.
const Y_OFFSET = 0.045;

const QUAD_VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const SIM_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uC2;
uniform float uDamp;
uniform float uAspect;     // H/W → gota circular en pantalla
uniform vec2 uDrops[16];
uniform float uDropStr[16];  // intensidad por gota (toque=1.0, ambiente<1)
uniform int uDropCount;
uniform float uDropRadius;
uniform float uDropStrength;
void main(){
  vec2 c = texture2D(uState, vUv).rg;            // r=altura, g=velocidad
  float n = texture2D(uState, vUv + vec2(0.0, uTexel.y)).r;
  float s = texture2D(uState, vUv - vec2(0.0, uTexel.y)).r;
  float e = texture2D(uState, vUv + vec2(uTexel.x, 0.0)).r;
  float w = texture2D(uState, vUv - vec2(uTexel.x, 0.0)).r;
  float lap = (n + s + e + w) - 4.0 * c.r;
  float vel = (c.g + lap * uC2) * uDamp;
  float h = c.r + vel;
  for (int i = 0; i < 16; i++) {
    if (i >= uDropCount) break;
    vec2 diff = vUv - uDrops[i];
    diff.y *= uAspect;                            // corrige elongación en Y
    h -= uDropStrength * uDropStr[i] * smoothstep(uDropRadius, 0.0, length(diff));
  }
  gl_FragColor = vec4(h, vel, 0.0, 1.0);
}
`;

const RENDER_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uNormalZ;
uniform float uRefract;
uniform float uSpec;

vec3 bgColor(vec2 uv){
  vec3 a = vec3(0.07, 0.14, 0.27);    // navy más claro (más iluminado)
  vec3 b = vec3(0.26, 0.38, 0.58);    // azul más claro
  float t = clamp(uv.x * 0.4 + (1.0 - uv.y) * 0.6, 0.0, 1.0);   // navy arriba-izq → azul abajo-der
  vec3 col = mix(a, b, t);
  float g = smoothstep(0.95, 0.0, distance(uv, vec2(0.85, 0.92)));  // glow arriba-derecha
  col += vec3(0.22, 0.30, 0.45) * g * 0.55;
  return col;
}

void main(){
  float hL = texture2D(uState, vUv - vec2(uTexel.x, 0.0)).r;
  float hR = texture2D(uState, vUv + vec2(uTexel.x, 0.0)).r;
  float hD = texture2D(uState, vUv - vec2(0.0, uTexel.y)).r;
  float hU = texture2D(uState, vUv + vec2(0.0, uTexel.y)).r;
  vec3 normal = normalize(vec3(hL - hR, hD - hU, uNormalZ));
  // Refracción sutil (se ve a través, como agua, no como pintura).
  vec2 ruv = vUv + normal.xy * uRefract;
  vec3 col = bgColor(ruv);
  // Specular nítido (destellos en las crestas) — aspecto líquido.
  vec3 lightDir = normalize(vec3(0.5, 0.8, 1.0));
  vec3 refl = reflect(-lightDir, normal);
  float spec = pow(max(dot(refl, vec3(0.0, 0.0, 1.0)), 0.0), 220.0);
  col += vec3(0.85, 0.92, 1.0) * spec * uSpec;
  // Fresnel: brillo glassy donde la onda se inclina (bordes húmedos).
  float fres = pow(1.0 - clamp(normal.z, 0.0, 1.0), 4.0);
  col += vec3(0.45, 0.6, 0.85) * fres * 0.35;
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: any, type: number, src: string) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(sh));
  return sh;
}
function program(gl: any, vs: string, fs: string) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  return p;
}

const WaterRipplesGL = forwardRef<WaterGLHandle, { onUnsupported?: () => void }>(({ onUnsupported }, ref) => {
  const queue = useRef<number[]>([]);              // cola de impactos en triplets (x, y, intensidad)
  const lastUv = useRef({ x: 0.5, y: 0.5 });
  const sweep = useRef({ active: false, y: 0 });   // barrido fuerte abajo→arriba (entrar al login)

  const push = (x: number, y: number, str: number) => {
    queue.current.push(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)), str);
    if (queue.current.length > 192) queue.current.splice(0, queue.current.length - 192);
  };

  useImperativeHandle(ref, () => ({
    drop(xNorm: number, yNorm: number, isMove = false) {
      const x = xNorm, y = (1 - yNorm) - Y_OFFSET; // flip-Y + bajamos un poco el impacto
      if (isMove) {
        // Interpola entre el último punto y el actual → rastro fluido (sin saltos).
        const d = Math.hypot(x - lastUv.current.x, y - lastUv.current.y);
        const steps = Math.min(10, Math.max(1, Math.floor(d / 0.012)));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          push(lastUv.current.x + (x - lastUv.current.x) * t, lastUv.current.y + (y - lastUv.current.y) * t, 1.0);
        }
      } else {
        push(x, y, 1.0);
      }
      lastUv.current = { x, y };
    },
    bigWave() {
      // Arranca un BARRIDO de mucha masa que sube (como deslizar la pantalla hacia arriba).
      sweep.current = { active: true, y: 0.0 };
    },
  }));

  const onContextCreate = (gl: any) => {
    try {
      const isGL2 = typeof (gl as any).RGBA16F !== 'undefined' && typeof (gl as any).HALF_FLOAT !== 'undefined';
      let internalFormat: number; let texType: number;
      if (isGL2) {
        gl.getExtension('EXT_color_buffer_float');
        internalFormat = (gl as any).RGBA16F;
        texType = (gl as any).HALF_FLOAT;
      } else {
        const ext = gl.getExtension('OES_texture_half_float');
        if (!ext) { onUnsupported?.(); return; }
        internalFormat = gl.RGBA;
        texType = ext.HALF_FLOAT_OES;
      }

      // Grilla isotrópica: celdas cuadradas en pantalla (propagación pareja en x/y).
      const aspectHW = gl.drawingBufferHeight / Math.max(1, gl.drawingBufferWidth);
      const SIM_W = 320;   // más resolución → ondas más finas (agua, no pintura)
      const SIM_H = Math.max(120, Math.min(700, Math.round(SIM_W * aspectHW)));
      const texel: [number, number] = [1 / SIM_W, 1 / SIM_H];

      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

      const makeTarget = () => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, SIM_W, SIM_H, 0, gl.RGBA, texType, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fb };
      };
      let a = makeTarget();
      let b = makeTarget();
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { onUnsupported?.(); return; }

      const simP = program(gl, QUAD_VS, SIM_FS);
      const renP = program(gl, QUAD_VS, RENDER_FS);
      const bindQuad = (p: any) => {
        const loc = gl.getAttribLocation(p, 'aPos');
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      };

      const EMPTY = new Array(MAX_DROPS * 2).fill(0);
      const EMPTY_STR = new Array(MAX_DROPS).fill(0);
      let ambient = 60;   // cuenta regresiva para la próxima gotita ambiental
      let autoPhase = 0;  // fase de la animación por defecto (dos dedos abajo)
      let prevLX = 0.06, prevRX = 0.94;   // posición previa de cada dedo (para interpolar)
      let twinTimer = TWIN_EVERY;         // cuenta regresiva a la próxima aparición "twin"
      let twinHold = 0;                   // frames restantes sosteniendo los dos puntos
      let twinA = { x: 0.4, y: 0.5 }, twinB = { x: 0.6, y: 0.5 };
      // Empuja un segmento horizontal interpolado (trazo continuo, suave a alta velocidad).
      const pushSeg = (x0: number, x1: number, y: number, str: number) => {
        const steps = Math.min(6, Math.max(1, Math.round(Math.abs(x1 - x0) / 0.02)));
        for (let i = 1; i <= steps; i++) push(x0 + (x1 - x0) * (i / steps), y, str);
      };
      // Línea de puntos interpolados entre A y B (para el efecto twin reiterado).
      const pushLine = (ax: number, ay: number, bx: number, by: number, str: number, n: number) => {
        for (let i = 0; i <= n; i++) { const t = i / n; push(ax + (bx - ax) * t, ay + (by - ay) * t, str); }
      };

      // Un paso de simulación: lee `a`, escribe `b`, swap. (Inyecta gotas si count>0.)
      const simStep = (flat: number[], strs: number[], count: number) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
        gl.viewport(0, 0, SIM_W, SIM_H);
        gl.useProgram(simP);
        bindQuad(simP);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, a.tex);
        gl.uniform1i(gl.getUniformLocation(simP, 'uState'), 0);
        gl.uniform2f(gl.getUniformLocation(simP, 'uTexel'), texel[0], texel[1]);
        gl.uniform1f(gl.getUniformLocation(simP, 'uC2'), 0.5);
        gl.uniform1f(gl.getUniformLocation(simP, 'uDamp'), 0.99);   // ondas vibran más (agua)
        gl.uniform1f(gl.getUniformLocation(simP, 'uAspect'), aspectHW);
        gl.uniform2fv(gl.getUniformLocation(simP, 'uDrops'), flat);
        gl.uniform1fv(gl.getUniformLocation(simP, 'uDropStr'), strs);
        gl.uniform1i(gl.getUniformLocation(simP, 'uDropCount'), count);
        gl.uniform1f(gl.getUniformLocation(simP, 'uDropRadius'), 0.04);
        gl.uniform1f(gl.getUniformLocation(simP, 'uDropStrength'), 0.68);  // más masa en la ola
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const tmp = a; a = b; b = tmp;
      };

      const loop = () => {
        // Animación por defecto: dos dedos en la parte baja, borde↔centro, sostenido y en bucle.
        autoPhase += AUTO_SPEED;
        const sL = (1 - Math.cos(autoPhase)) * 0.5;                  // izquierdo 0→1→0
        const sR = (1 - Math.cos(autoPhase + AUTO_PHASE_OFF)) * 0.5; // derecho desfasado
        const lx = 0.06 + 0.44 * sL;                     // izquierdo: borde izq → centro
        const rx = 0.94 - 0.44 * sR;                     // derecho: borde der → centro
        if (twinHold <= 0) {                             // pausa los dedos durante el twin
          pushSeg(prevLX, lx, AUTO_Y, AUTO_STR);         // interpolado → trazo continuo
          pushSeg(prevRX, rx, AUTO_Y, AUTO_STR);
        }
        prevLX = lx; prevRX = rx;

        // Movimiento ambiental: gotita suave aleatoria cada ~0.8–2.5 s (agua viva).
        if (--ambient <= 0) {
          push(Math.random(), Math.random(), 0.4);    // más marcadas pero menos que el toque
          ambient = 45 + Math.floor(Math.random() * 90);
        }

        // Barrido de entrada: 2 puntos FUERTES al centro que suben MUY lento (sostenido).
        if (sweep.current.active) {
          const sy = sweep.current.y;
          const cxs = [0.46, 0.54];   // dos puntos pegados al centro
          for (let i = 0; i < 2; i++) push(cxs[i], sy, 3.0);
          sweep.current.y += 0.012;                                    // mucho más lento
          if (sweep.current.y > 1.2) sweep.current.active = false;
        }

        // Twin: REITERA una línea de puntos interpolados entre A y B → la ola crece.
        if (twinHold > 0) {
          pushLine(twinA.x, twinA.y, twinB.x, twinB.y, TWIN_STR, TWIN_PTS);
          twinHold--;
        } else if (--twinTimer <= 0) {
          const cx = 0.30 + Math.random() * 0.40;   // centro (evita bordes)
          const cy = 0.30 + Math.random() * 0.45;   // zona media
          const half = 0.07 + Math.random() * 0.08; // separación variable (pueden estar más lejos)
          twinA = { x: cx - half, y: cy };
          twinB = { x: cx + half, y: cy };
          twinHold = TWIN_HOLD;
          twinTimer = TWIN_EVERY + Math.floor(Math.random() * 90);
        }

        const flat: number[] = [];
        const strs: number[] = [];
        let count = 0;
        while (count < MAX_DROPS && queue.current.length >= 3) {
          flat.push(queue.current.shift()!, queue.current.shift()!);
          strs.push(queue.current.shift()!);
          count++;
        }
        while (flat.length < MAX_DROPS * 2) flat.push(0, 0);
        while (strs.length < MAX_DROPS) strs.push(0);

        // 3 sub-pasos por frame → menos carga de GPU = framerate más fluido.
        simStep(flat, strs, count);
        simStep(EMPTY, EMPTY_STR, 0);
        simStep(EMPTY, EMPTY_STR, 0);

        // ── Render a pantalla desde `a` ──
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.useProgram(renP);
        bindQuad(renP);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, a.tex);
        gl.uniform1i(gl.getUniformLocation(renP, 'uState'), 0);
        gl.uniform2f(gl.getUniformLocation(renP, 'uTexel'), texel[0], texel[1]);
        gl.uniform1f(gl.getUniformLocation(renP, 'uNormalZ'), 0.16);
        gl.uniform1f(gl.getUniformLocation(renP, 'uRefract'), 0.18);   // refracción sutil → ve a través (agua)
        gl.uniform1f(gl.getUniformLocation(renP, 'uSpec'), 0.9);       // destellos nítidos
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.flush();
        gl.endFrameEXP();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (err) {
      console.warn('[WaterGL] no soportado / error:', (err as Error)?.message ?? err);
      onUnsupported?.();
    }
  };

  return <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} pointerEvents="none" />;
});
WaterRipplesGL.displayName = 'WaterRipplesGL';

export default WaterRipplesGL;
