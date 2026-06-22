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
const AUTO_SPEED = 0.08;    // rad/frame (más alto = más rápido). Regular a gusto.
const AUTO_STR = 0.55;     // intensidad del trazo sostenido
const AUTO_Y = 0.08;       // altura (cerca del borde inferior)
const AUTO_PHASE_OFF = 2.4; // desfase entre los dos dedos (no van en lockstep)
// Orbital "círculos" en la esquina superior derecha (gesto grabado por el usuario).
const CIRCLE_SPEED = 0.32;   // rad/frame base (más veloz). Velocidad VARIABLE (acelera/frena).
const CIRCLE_CX = 0.85;      // centro X de la elipse
const CIRCLE_CY = 0.91;      // centro Y en espacio de sim (1 = arriba) → esquina superior
const CIRCLE_RX = 0.075;     // radio horizontal
const CIRCLE_RY = 0.05;      // radio vertical
const CIRCLE_STR = 0.5;      // intensidad del trazo
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
  // "Dedos virtuales" sostenidos: cada uno se re-emite en CADA frame (como un dedo apoyado).
  const emittersRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; str: number }[]>([]);
  const barridoRef = useRef({ active: false, y: 0 });   // una onda ancha que sube lento (entrada)

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
      // Una ÚNICA onda ancha que sube lento desde abajo.
      barridoRef.current = { active: true, y: 0.06 };
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
      let twinT = 180;    // cuenta regresiva para el próximo "twin" ambiental
      let autoPhaseL = 0, autoPhaseR = AUTO_PHASE_OFF;  // fases (el derecho irá más lento)
      let prevLX = 0.06, prevRX = 0.94;   // posición previa de cada dedo (para interpolar)
      // Aparición/desaparición de cada dedo (~1s) ALTERNADA: arrancan en anti-fase
      // (mientras uno está activo el otro descansa) con jitter aleatorio.
      let onL = true, onR = false, tL = 60, tR = 60;
      let circAngle = 0, prevCX = CIRCLE_CX + CIRCLE_RX, prevCY = CIRCLE_CY;  // orbital sup-derecha
      let onC = true, tC = 90;  // el orbital aparece/desaparece a intervalos aleatorios
      // Empuja un segmento horizontal interpolado (trazo continuo, suave a alta velocidad).
      const pushSeg = (x0: number, x1: number, y: number, str: number) => {
        const steps = Math.min(6, Math.max(1, Math.round(Math.abs(x1 - x0) / 0.02)));
        for (let i = 1; i <= steps; i++) push(x0 + (x1 - x0) * (i / steps), y, str);
      };
      // Segmento interpolado en 2D (para el orbital, que se mueve en X e Y a la vez).
      const pushSeg2 = (x0: number, y0: number, x1: number, y1: number, str: number) => {
        const d = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.min(6, Math.max(1, Math.round(d / 0.02)));
        for (let i = 1; i <= steps; i++) push(x0 + (x1 - x0) * (i / steps), y0 + (y1 - y0) * (i / steps), str);
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
        const em = emittersRef.current;
        if (barridoRef.current.active) {
          // BARRIDO: UN punto desde el centro, mucha masa, subiendo con velocidad NO uniforme
          // (acelera y frena) → la ola se forma más creíble.
          push(0.5, barridoRef.current.y, 2.2);
          const by = barridoRef.current.y;
          // Arranca rápido (nace la ola) y SIEMPRE desacelera, sin re-acelerar (monótona).
          const k = 1 - Math.min(1, (by - 0.06) / 0.84);   // 1 al inicio → 0 al final
          const v = 0.0008 + 0.012 * k * k;                // rápido al inicio, cada vez más lento
          barridoRef.current.y += v;
          if (barridoRef.current.y > 0.9) barridoRef.current.active = false;
        } else if (em.length > 0) {
          // Twin: puntos sostenidos re-emitidos cada frame.
          for (const f of em) { push(f.x, f.y, f.str); f.x += f.vx; f.y += f.vy; f.life--; }
          emittersRef.current = em.filter(f => f.life > 0);
        } else {
          // Dos dedos en la base que recorren TODA la pantalla (no solo su mitad), con
          // velocidad MUY variable (dos armónicos) → más creíble; el der. un poco más lento.
          autoPhaseL += AUTO_SPEED * (0.35 + 0.4 * Math.abs(Math.sin(autoPhaseL * 0.6)) + 0.15 * Math.abs(Math.sin(autoPhaseL * 1.7)));
          autoPhaseR += AUTO_SPEED * 0.78 * (0.35 + 0.4 * Math.abs(Math.sin(autoPhaseR * 0.55)) + 0.15 * Math.abs(Math.sin(autoPhaseR * 1.9)));
          const sL = (1 - Math.cos(autoPhaseL)) * 0.5;
          const sR = (1 - Math.cos(autoPhaseR)) * 0.5;
          const lx = 0.06 + 0.88 * sL;        // recorre toda la pantalla
          const rx = 0.94 - 0.88 * sR;        // arranca del otro borde
          // Vaivén en Y (visible) con frecuencias distintas → recorrido más orgánico.
          const lyy = AUTO_Y + 0.035 * Math.sin(autoPhaseL * 1.6);
          const ryy = AUTO_Y + 0.035 * Math.sin(autoPhaseR * 1.15 + 0.8);
          // Cada dedo prende/apaga ~1s (jitter); empiezan en anti-fase → alternan.
          if (--tL <= 0) { onL = !onL; tL = 50 + Math.floor(Math.random() * 30); }
          if (--tR <= 0) { onR = !onR; tR = 50 + Math.floor(Math.random() * 30); }
          if (onL) pushSeg(prevLX, lx, lyy, AUTO_STR);
          if (onR) pushSeg(prevRX, rx, ryy, AUTO_STR);
          prevLX = lx; prevRX = rx;   // sigue avanzando aunque esté apagado (reaparece más adelante)

          // Orbital "círculos" en la esquina superior derecha (re-emitido cada frame → trazo continuo).
          circAngle += CIRCLE_SPEED * (0.55 + 0.6 * Math.abs(Math.sin(circAngle * 1.3)) + 0.25 * Math.abs(Math.sin(circAngle * 2.7)));
          const cgx = CIRCLE_CX + CIRCLE_RX * Math.cos(circAngle);
          const cgy = CIRCLE_CY + CIRCLE_RY * Math.sin(circAngle);
          // Aparece/desaparece a intervalos aleatorios (más tiempo activo que en pausa).
          if (--tC <= 0) { onC = !onC; tC = onC ? 60 + Math.floor(Math.random() * 90) : 30 + Math.floor(Math.random() * 60); }
          if (onC) pushSeg2(prevCX, prevCY, cgx, cgy, CIRCLE_STR);
          prevCX = cgx; prevCY = cgy;   // sigue orbitando aunque esté apagado (reaparece en otro punto)

          // Gotita ambiental aleatoria.
          if (--ambient <= 0) {
            push(Math.random(), Math.random(), 0.4);
            ambient = 45 + Math.floor(Math.random() * 90);
          }

          // Twin ambiental: dos puntos MUY JUNTOS que solo APARECEN (sin hold) + mucha masa.
          // Más recurrentes (~1.3–2.5 s).
          if (--twinT <= 0) {
            const cx = 0.28 + Math.random() * 0.44;
            const cy = 0.42 + Math.random() * 0.34;     // zona media-alta (uv)
            const gap = 0.018;                           // muy muy juntos
            emittersRef.current.push(
              { x: cx - gap, y: cy, vx: 0, vy: 0, life: 3, str: 1.6 },
              { x: cx + gap, y: cy, vx: 0, vy: 0, life: 3, str: 1.6 },
            );
            twinT = 80 + Math.floor(Math.random() * 70);
          }
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
