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

export type WaterGLHandle = { drop: (xNorm: number, yNorm: number, isMove?: boolean) => void };

const MAX_DROPS = 8; // impactos inyectados por frame (rastro del arrastre)

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
uniform vec2 uDrops[8];
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
  for (int i = 0; i < 8; i++) {
    if (i >= uDropCount) break;
    vec2 diff = vUv - uDrops[i];
    diff.y *= uAspect;                            // corrige elongación en Y
    h -= uDropStrength * smoothstep(uDropRadius, 0.0, length(diff));
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
  vec3 a = vec3(0.039, 0.094, 0.188);
  vec3 b = vec3(0.169, 0.267, 0.455);
  float t = clamp(uv.x * 0.4 + (1.0 - uv.y) * 0.6, 0.0, 1.0);
  vec3 col = mix(a, b, t);
  float g = smoothstep(0.95, 0.0, distance(uv, vec2(0.85, 0.92)));
  col += vec3(0.20, 0.27, 0.40) * g * 0.5;
  return col;
}

void main(){
  float hL = texture2D(uState, vUv - vec2(uTexel.x, 0.0)).r;
  float hR = texture2D(uState, vUv + vec2(uTexel.x, 0.0)).r;
  float hD = texture2D(uState, vUv - vec2(0.0, uTexel.y)).r;
  float hU = texture2D(uState, vUv + vec2(0.0, uTexel.y)).r;
  vec3 normal = normalize(vec3(hL - hR, hD - hU, uNormalZ));
  vec2 ruv = vUv + normal.xy * uRefract;
  vec3 col = bgColor(ruv);
  vec3 lightDir = normalize(vec3(0.5, 0.8, 1.0));
  vec3 refl = reflect(-lightDir, normal);
  float spec = pow(max(dot(refl, vec3(0.0, 0.0, 1.0)), 0.0), 80.0);
  col += vec3(spec) * uSpec;
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
  const queue = useRef<number[]>([]);              // cola de impactos (x,y uv, y ya flippeado)
  const lastUv = useRef({ x: 0.5, y: 0.5 });

  const push = (x: number, y: number) => {
    queue.current.push(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)));
    if (queue.current.length > 128) queue.current.splice(0, queue.current.length - 128);
  };

  useImperativeHandle(ref, () => ({
    drop(xNorm: number, yNorm: number, isMove = false) {
      const x = xNorm, y = 1 - yNorm;             // flip Y (toque arriba-izq → uv abajo-izq)
      if (isMove) {
        // Interpola entre el último punto y el actual → rastro fluido (sin saltos).
        const d = Math.hypot(x - lastUv.current.x, y - lastUv.current.y);
        const steps = Math.min(10, Math.max(1, Math.floor(d / 0.012)));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          push(lastUv.current.x + (x - lastUv.current.x) * t, lastUv.current.y + (y - lastUv.current.y) * t);
        }
      } else {
        push(x, y);
      }
      lastUv.current = { x, y };
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
      const SIM_W = 240;
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

      const loop = () => {
        // Toma hasta MAX_DROPS de la cola para inyectar este frame.
        const flat: number[] = [];
        let count = 0;
        while (count < MAX_DROPS && queue.current.length >= 2) {
          flat.push(queue.current.shift()!, queue.current.shift()!);
          count++;
        }
        while (flat.length < MAX_DROPS * 2) flat.push(0, 0);

        // ── Simulación: lee `a`, escribe `b` ──
        gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
        gl.viewport(0, 0, SIM_W, SIM_H);
        gl.useProgram(simP);
        bindQuad(simP);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, a.tex);
        gl.uniform1i(gl.getUniformLocation(simP, 'uState'), 0);
        gl.uniform2f(gl.getUniformLocation(simP, 'uTexel'), texel[0], texel[1]);
        gl.uniform1f(gl.getUniformLocation(simP, 'uC2'), 0.5);
        gl.uniform1f(gl.getUniformLocation(simP, 'uDamp'), 0.985);
        gl.uniform1f(gl.getUniformLocation(simP, 'uAspect'), aspectHW);
        gl.uniform2fv(gl.getUniformLocation(simP, 'uDrops'), flat);
        gl.uniform1i(gl.getUniformLocation(simP, 'uDropCount'), count);
        gl.uniform1f(gl.getUniformLocation(simP, 'uDropRadius'), 0.06);
        gl.uniform1f(gl.getUniformLocation(simP, 'uDropStrength'), 0.42);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const tmp = a; a = b; b = tmp;

        // ── Render a pantalla desde `a` ──
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.useProgram(renP);
        bindQuad(renP);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, a.tex);
        gl.uniform1i(gl.getUniformLocation(renP, 'uState'), 0);
        gl.uniform2f(gl.getUniformLocation(renP, 'uTexel'), texel[0], texel[1]);
        gl.uniform1f(gl.getUniformLocation(renP, 'uNormalZ'), 0.14);   // normales más planas → menos sombra
        gl.uniform1f(gl.getUniformLocation(renP, 'uRefract'), 0.45);   // menos distorsión → menos sombra
        gl.uniform1f(gl.getUniformLocation(renP, 'uSpec'), 0.45);      // brillo más sutil
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
