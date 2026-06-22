import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { database, plansCollection, planMeasurementsCollection } from '@db/index';
import { pushProjectToSupabase } from '@services/SupabaseSyncService';
import { supabase } from '@config/supabase';
import { Q } from '@nozbe/watermelondb';
import { Colors, Radius, Shadow } from '../theme/colors';
import AppHeader from '@components/AppHeader';
import { useTourStep, useTourStepWithLayout } from '@hooks/useTourStep';
import { useTour } from '@context/TourContext';
import BrickCalculatorModal from '@components/BrickCalculatorModal';
import VolumeCalculatorModal from '@components/VolumeCalculatorModal';
import TileCalculatorModal from '@components/TileCalculatorModal';
import FloatingCalculator from '@components/FloatingCalculator';
import type { BrickCalcState, VolumeCalcState, TileCalcState } from '@services/MetradosService';
import { useI18n, tx } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'Measurement'>;

// ── HTML completo: pdf.js + canvas + lupa + drag + edición ──────────────
const buildHtml = (pdfBase64: string) => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#d0d0d0; overflow:hidden; touch-action:none; -webkit-user-select:none; user-select:none; }
#container { position:relative; transform-origin:0 0; }
canvas#pdf-canvas { display:block; }
canvas#draw-canvas { position:absolute; top:0; left:0; pointer-events:none; }
canvas#loupe-canvas { position:fixed; border-radius:50%; border:2px solid rgba(255,0,0,0.7); display:none;
  box-shadow:0 2px 12px rgba(0,0,0,0.4); pointer-events:none; z-index:100; }
#touch-layer { position:absolute; top:0; left:0; width:100%; height:100%; touch-action:none; }
</style>
</head>
<body>
<div id="wrapper" style="width:100vw;height:100vh;overflow:hidden;position:relative;">
  <div id="container">
    <canvas id="pdf-canvas"></canvas>
    <canvas id="hires-canvas" style="position:absolute;top:0;left:0;display:none;"></canvas>
    <canvas id="draw-canvas"></canvas>
    <div id="touch-layer"></div>
  </div>
</div>
<canvas id="loupe-canvas" width="160" height="160"></canvas>

<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const container=document.getElementById('container');
const wrapper=document.getElementById('wrapper');
const pdfCanvas=document.getElementById('pdf-canvas');
const hiresCanvas=document.getElementById('hires-canvas');
const hiresCtx=hiresCanvas.getContext('2d');
const drawCanvas=document.getElementById('draw-canvas');
const loupeCanvas=document.getElementById('loupe-canvas');
const touchLayer=document.getElementById('touch-layer');
const pdfCtx=pdfCanvas.getContext('2d');
const drawCtx=drawCanvas.getContext('2d');
const loupeCtx=loupeCanvas.getContext('2d');

let pdfDoc=null, pdfPage=null;
let baseScale=1, renderScale=6; // render at 6x for maximum quality
let pdfW=0, pdfH=0; // CSS dimensions at baseScale

// Transform
let scale=1, tx=0, ty=0;
const minScale=1, maxScale=20;

// Tool state
let tool='pan'; // pan | calibrate | measure | editEndpoint | polyline | sketch
let lines=[]; // {id, ax,ay, bx,by, distPx, distReal, isCalibration}
let polygons=[]; // {id, points:[{x,y}], areaPx, areaReal, perimPx, perimReal, closed}
let polylines=[]; // {id, points:[{x,y}], totalPx, totalReal, smooth?}
let activePolygon=null; // polígono en construcción
let activePolyline=null; // polilínea en construcción
let lastClosedPolylineId=null; // última polilínea cerrada (para undo: reabrir)
let deleteVertexMode=false; // modo: tocar vértice lo elimina
let addVertexMode=false;    // modo: tocar cerca del trazo inserta vértice; lejos lo agrega al final
let calibrationScale=0; // px per meter (at baseScale)
let nextId=1;
let selectedPolyId=null;
let selectedPolylineId=null;
let showAngles=false;
let showArea=false;
let sketchRawPoints=[]; // puntos crudos mientras se dibuja
let isSketchDrawing=false;

// Drawing state
let dragging=false;
let drawConfirmed=false; // true once drag exceeds threshold (then it's a line, not pan)
let dragStartPdf={x:0,y:0};
let stableEndPdf={x:0,y:0}; // penúltima posición estable (ignora micro-movimiento al soltar)
let dragStartScreen={x:0,y:0};
let dragCurrentPdf={x:0,y:0};
let editingLine=null; // {lineId, endpoint:'a'|'b'}
let prevToolBeforeEdit='pan'; // tool to return to after editing
const DRAW_THRESHOLD=12; // px on screen to distinguish draw from pan

// Touch tracking for pan/pinch
let touches={};
let lastPinchDist=0;
let isSingleTouch=false;
let touchMoved=false;

function applyTransform(){
  container.style.transform='translate('+tx+'px,'+ty+'px) scale('+scale+')';
}
function clampTx(){
  const sw=window.innerWidth, sh=window.innerHeight;
  const cw=pdfW*scale, ch=pdfH*scale;
  if(cw<=sw) tx=(sw-cw)/2; else tx=Math.min(0,Math.max(sw-cw,tx));
  if(ch<=sh) ty=(sh-ch)/2; else ty=Math.min(0,Math.max(sh-ch,ty));
}
function screenToPdf(sx,sy){
  return {x:(sx-tx)/scale, y:(sy-ty)/scale};
}
function pdfToScreen(px,py){
  return {x:px*scale+tx, y:py*scale+ty};
}

// ── Hi-res rendering ────────────────────────────────────────────────
const HIRES_THRESHOLD=3;
const DRAW_UPGRADE_THRESHOLD=15; // zoom > 15 → subir drawCanvas a 12x
let hiresTimer=null;
let hiresRendering=false;
let lastHiresScale=0;
let drawCanvasLevel='base'; // 'base' (9x) | 'high' (16x)

function scheduleHiresRender(){
  if(hiresTimer) clearTimeout(hiresTimer);

  // Upgrade/downgrade drawCanvas según zoom
  if(scale>DRAW_UPGRADE_THRESHOLD && drawCanvasLevel==='base'){
    drawCanvasLevel='high';
    const pageVp=pdfPage?pdfPage.getViewport({scale:1}):null;
    if(pageVp){
      const highScale=renderScale*2; // 12x
      drawCanvas.width=pageVp.width*baseScale*highScale;
      drawCanvas.height=pageVp.height*baseScale*highScale;
      redraw();
    }
  } else if(scale<=DRAW_UPGRADE_THRESHOLD && drawCanvasLevel==='high'){
    drawCanvasLevel='base';
    const pageVp=pdfPage?pdfPage.getViewport({scale:1}):null;
    if(pageVp){
      const baseDrawScale=renderScale*1.5; // 9x
      drawCanvas.width=pageVp.width*baseScale*baseDrawScale;
      drawCanvas.height=pageVp.height*baseScale*baseDrawScale;
      redraw();
    }
  }

  if(scale<=HIRES_THRESHOLD){ hiresCanvas.style.display='none'; lastHiresScale=0; return; }
  hiresTimer=setTimeout(()=>renderHires(), 400);
}

async function renderHires(){
  if(!pdfPage || hiresRendering || scale<=HIRES_THRESHOLD) return;
  if(Math.abs(scale-lastHiresScale)<0.5) return;
  hiresRendering=true;
  lastHiresScale=scale;

  try{
    // Limitar dimensión total del canvas para no crashear
    const pageVp=pdfPage.getViewport({scale:1});
    const maxDim=6000;
    const targetScale=Math.min(scale*baseScale, maxDim/Math.max(pageVp.width, pageVp.height));
    const vp=pdfPage.getViewport({scale:targetScale});

    // PDF hi-res
    hiresCanvas.width=vp.width;
    hiresCanvas.height=vp.height;
    hiresCanvas.style.width=pdfW+'px';
    hiresCanvas.style.height=pdfH+'px';
    hiresCanvas.style.left='0px';
    hiresCanvas.style.top='0px';

    await pdfPage.render({canvasContext:hiresCtx, viewport:vp}).promise;
    hiresCanvas.style.display='block';

    redraw();
  }catch(e){
    hiresCanvas.style.display='none';
  }
  hiresRendering=false;
}

// ── Render PDF ──────────────────────────────────────────────────────
async function renderPage(pageNum){
  pdfPage=await pdfDoc.getPage(pageNum);
  const vp=pdfPage.getViewport({scale:1});
  baseScale=window.innerWidth/vp.width;
  const sv=pdfPage.getViewport({scale:baseScale*renderScale});
  pdfW=vp.width*baseScale;
  pdfH=vp.height*baseScale;

  pdfCanvas.width=sv.width; pdfCanvas.height=sv.height;
  pdfCanvas.style.width=pdfW+'px'; pdfCanvas.style.height=pdfH+'px';
  // Draw canvas — resolución inicial 9x, se sube a 16x cuando zoom > 10
  const drawScale=renderScale*1.5;
  drawCanvas.width=vp.width*baseScale*drawScale; drawCanvas.height=vp.height*baseScale*drawScale;
  drawCanvas.style.width=pdfW+'px'; drawCanvas.style.height=pdfH+'px';
  container.style.width=pdfW+'px'; container.style.height=pdfH+'px';

  await pdfPage.render({canvasContext:pdfCtx, viewport:sv}).promise;
  scale=1; tx=0; ty=0; clampTx(); applyTransform();
  redraw();

  msg({type:'pageLoaded', pages:pdfDoc.numPages, page:pageNum});
}

// ── Extracción de paths vectoriales ─────────────────────────────────

// ── Draw overlay ────────────────────────────────────────────────────
function redraw(){
  const r=drawCanvas.width/pdfW;
  drawCtx.clearRect(0,0,drawCanvas.width,drawCanvas.height);

  // Draw all lines
  for(const ln of lines){
    drawDimensionLine(ln, r, false);
  }
  // Draw drag preview
  if(dragging && (tool==='calibrate'||tool==='measure')){
    const preview={ax:dragStartPdf.x, ay:dragStartPdf.y, bx:dragCurrentPdf.x, by:dragCurrentPdf.y,
      distPx:dist(dragStartPdf.x,dragStartPdf.y,dragCurrentPdf.x,dragCurrentPdf.y),
      distReal:0, isCalibration:tool==='calibrate'};
    if(calibrationScale>0 && tool==='measure'){
      preview.distReal=preview.distPx/calibrationScale;
    }
    drawDimensionLine(preview, r, true);
  }

  // Draw all closed polygons
  for(const poly of polygons){ drawPolygon(poly, r); }
  if(activePolygon){ drawPolygon(activePolygon, r); }

  // Draw all polylines
  for(const pl of polylines){ drawPolyline(pl, r); }
  if(activePolyline){ drawPolyline(activePolyline, r); }

  // Draw sketch preview
  if(isSketchDrawing) drawSketchPreview(r);
}

function drawDimensionLine(ln, r, isPreview){
  const ax=ln.ax*r, ay=ln.ay*r, bx=ln.bx*r, by=ln.by*r;
  const dx=bx-ax, dy=by-ay;
  const len=Math.sqrt(dx*dx+dy*dy);
  if(len<2) return;
  const angle=Math.atan2(dy,dx);
  // Tamaño base reducido 20%, escala con pow 0.75, mínimo 20% del original
  const s=Math.max(0.05, 0.8/Math.pow(scale, 0.75));
  const arrowSize=12*r*s;
  const arrowAngle=0.45;
  const color=isPreview
    ? (ln.isCalibration?'rgba(255,140,0,0.7)':'rgba(220,30,30,0.7)')
    : (ln.isCalibration?'rgba(255,140,0,0.85)':'rgba(220,30,30,0.9)');
  const lineW=1.8*r*s;

  drawCtx.save();
  drawCtx.strokeStyle=color;
  drawCtx.fillStyle=color;
  drawCtx.lineWidth=lineW;
  drawCtx.lineCap='round';
  drawCtx.lineJoin='round';

  // Main line (between arrow tips)
  const shortenA=arrowSize*0.7, shortenB=arrowSize*0.7;
  drawCtx.beginPath();
  drawCtx.moveTo(ax+shortenA*Math.cos(angle), ay+shortenA*Math.sin(angle));
  drawCtx.lineTo(bx-shortenB*Math.cos(angle), by-shortenB*Math.sin(angle));
  drawCtx.stroke();

  // Arrow at A (filled + stroked for crisp edges)
  drawCtx.beginPath();
  drawCtx.moveTo(ax,ay);
  drawCtx.lineTo(ax+arrowSize*Math.cos(angle-arrowAngle), ay+arrowSize*Math.sin(angle-arrowAngle));
  drawCtx.lineTo(ax+arrowSize*0.35*Math.cos(angle), ay+arrowSize*0.35*Math.sin(angle));
  drawCtx.lineTo(ax+arrowSize*Math.cos(angle+arrowAngle), ay+arrowSize*Math.sin(angle+arrowAngle));
  drawCtx.closePath(); drawCtx.fill(); drawCtx.stroke();

  // Arrow at B
  drawCtx.beginPath();
  drawCtx.moveTo(bx,by);
  drawCtx.lineTo(bx-arrowSize*Math.cos(angle-arrowAngle), by-arrowSize*Math.sin(angle-arrowAngle));
  drawCtx.lineTo(bx-arrowSize*0.35*Math.cos(angle), by-arrowSize*0.35*Math.sin(angle));
  drawCtx.lineTo(bx-arrowSize*Math.cos(angle+arrowAngle), by-arrowSize*Math.sin(angle+arrowAngle));
  drawCtx.closePath(); drawCtx.fill(); drawCtx.stroke();

  // Endpoint circles (only when this line is selected)
  if(!isPreview && selectedLineId===ln.id){
    for(const [px,py] of [[ax,ay],[bx,by]]){
      drawCtx.beginPath();
      drawCtx.arc(px,py,5*r*s,0,Math.PI*2);
      drawCtx.fillStyle='#fff';
      drawCtx.fill();
      drawCtx.strokeStyle=color;
      drawCtx.lineWidth=1.5*r*s;
      drawCtx.stroke();
    }
  }

  // Label
  const mx=(ax+bx)/2, my=(ay+by)/2;
  let label='';
  if(ln.isCalibration && ln.distReal>0){
    label=formatDist(ln.distReal)+' (ref)';
  } else if(ln.distReal>0){
    label=formatDist(ln.distReal);
  } else if(isPreview && tool==='measure' && calibrationScale>0){
    label=formatDist(ln.distPx/calibrationScale);
  }
  if(label){
    const fontSize=11*r*s;
    drawCtx.font='bold '+fontSize+'px sans-serif';
    const tw=drawCtx.measureText(label).width;
    const pad=4*r*s, halfH=9*r*s;
    const labelW=tw+pad*2;
    const segLen=Math.hypot(bx-ax, by-ay);
    // Si la etiqueta no cabe sobre el segmento (entre flechas), desplazarla perpendicular
    const shortLine = labelW > Math.max(0, segLen - arrowSize*2);
    const perpOffset = shortLine ? -(halfH*2 + 3*r*s) : 0;
    // Background
    drawCtx.save();
    drawCtx.translate(mx,my);
    drawCtx.rotate(angle>Math.PI/2||angle<-Math.PI/2 ? angle+Math.PI : angle);
    if(perpOffset!==0) drawCtx.translate(0, perpOffset);
    drawCtx.fillStyle='rgba(255,255,255,0.9)';
    drawCtx.fillRect(-tw/2-pad, -halfH, tw+pad*2, halfH*2);
    drawCtx.fillStyle=color;
    drawCtx.textAlign='center';
    drawCtx.textBaseline='middle';
    drawCtx.fillText(label,0,0);
    drawCtx.restore();
  }
  drawCtx.restore();
}

function formatDist(m){
  if(m>=1) return m.toFixed(2)+' m';
  return (m*100).toFixed(1)+' cm';
}
function dist(ax,ay,bx,by){ return Math.sqrt((bx-ax)**2+(by-ay)**2); }

function formatArea(m2){
  if(m2>=1) return m2.toFixed(2)+' m²';
  return (m2*10000).toFixed(0)+' cm²';
}

// ── Polígonos ───────────────────────────────────────────────────────
function calcPolygonArea(pts){
  let area=0;
  const n=pts.length;
  for(let i=0;i<n;i++){ const j=(i+1)%n; area+=pts[i].x*pts[j].y; area-=pts[j].x*pts[i].y; }
  return Math.abs(area)/2;
}
// Área en m² implícita de una polilínea (cerrada o abierta).
// Para curvas suaves (sketch) muestrea la curva Catmull-Rom antes de Shoelace,
// igual que la etiqueta "Área" del toggle.
function polylineAreaReal(pl){
  if(!pl || !pl.points || pl.points.length<3 || !calibrationScale) return 0;
  const pts=pl.points;
  let areaPts=pts;
  if(pl.smooth && pts.length>2){
    areaPts=[];
    const steps2=30;
    for(let i=0;i<pts.length-1;i++){
      const p0=pts[Math.max(i-1,0)], p1=pts[i], p2=pts[i+1], p3=pts[Math.min(i+2,pts.length-1)];
      for(let s2=0;s2<steps2;s2++){
        const t4=s2/steps2, t42=t4*t4, t43=t42*t4;
        areaPts.push({
          x:0.5*((2*p1.x)+(-p0.x+p2.x)*t4+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t42+(-p0.x+3*p1.x-3*p2.x+p3.x)*t43),
          y:0.5*((2*p1.y)+(-p0.y+p2.y)*t4+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t42+(-p0.y+3*p1.y-3*p2.y+p3.y)*t43)
        });
      }
    }
    areaPts.push(pts[pts.length-1]);
  }
  const areaPx=calcPolygonArea(areaPts);
  return areaPx/(calibrationScale*calibrationScale);
}
function calcPolygonPerimeter(pts){
  let perim=0;
  for(let i=0;i<pts.length;i++){ const j=(i+1)%pts.length; perim+=dist(pts[i].x,pts[i].y,pts[j].x,pts[j].y); }
  return perim;
}
function polygonCentroid(pts){
  let cx=0,cy=0;
  for(const p of pts){cx+=p.x;cy+=p.y;}
  return {x:cx/pts.length, y:cy/pts.length};
}
function pointInPolygon(px,py,pts){
  let inside=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const xi=pts[i].x,yi=pts[i].y,xj=pts[j].x,yj=pts[j].y;
    if(((yi>py)!==(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}

function drawPolygon(poly, r){
  const s=Math.max(0.05, 0.8/Math.pow(scale, 0.75));
  const pts=poly.points;
  if(pts.length<2) {
    if(pts.length===1){
      const px=pts[0].x*r, py=pts[0].y*r;
      drawCtx.beginPath(); drawCtx.arc(px,py,4*r*s,0,Math.PI*2);
      drawCtx.fillStyle='rgba(0,100,220,0.8)'; drawCtx.fill();
    }
    return;
  }

  drawCtx.save();
  drawCtx.lineWidth=1.5*r*s;
  drawCtx.lineCap='round'; drawCtx.lineJoin='round';

  // Fill (solo si cerrado)
  if(poly.closed){
    drawCtx.beginPath();
    drawCtx.moveTo(pts[0].x*r, pts[0].y*r);
    for(let i=1;i<pts.length;i++) drawCtx.lineTo(pts[i].x*r, pts[i].y*r);
    drawCtx.closePath();
    drawCtx.fillStyle='rgba(0,100,220,0.12)';
    drawCtx.fill();
  }

  // Outline
  drawCtx.beginPath();
  drawCtx.moveTo(pts[0].x*r, pts[0].y*r);
  for(let i=1;i<pts.length;i++) drawCtx.lineTo(pts[i].x*r, pts[i].y*r);
  if(poly.closed) drawCtx.closePath();
  drawCtx.strokeStyle='rgba(0,100,220,0.8)';
  drawCtx.stroke();

  // Vertices
  const showVerts=!poly.closed || selectedPolyId===poly.id;
  if(showVerts){
    for(const p of pts){
      drawCtx.beginPath(); drawCtx.arc(p.x*r, p.y*r, 4*r*s, 0, Math.PI*2);
      drawCtx.fillStyle='#fff'; drawCtx.fill();
      drawCtx.strokeStyle='rgba(0,100,220,0.8)'; drawCtx.lineWidth=1.5*r*s; drawCtx.stroke();
    }
  }

  // First point highlight (close target) when building
  if(!poly.closed && pts.length>=3){
    drawCtx.beginPath(); drawCtx.arc(pts[0].x*r, pts[0].y*r, 8*r*s, 0, Math.PI*2);
    drawCtx.strokeStyle='rgba(0,200,0,0.6)'; drawCtx.lineWidth=2*r*s;
    drawCtx.setLineDash([4*r*s,4*r*s]); drawCtx.stroke(); drawCtx.setLineDash([]);
  }

  // Label (area + perimeter)
  if(poly.closed && calibrationScale>0){
    const c=polygonCentroid(pts);
    const areaLabel=formatArea(poly.areaReal);
    const perimLabel='P: '+formatDist(poly.perimReal);
    const fontSize=11*r*s;
    drawCtx.font='bold '+fontSize+'px sans-serif';
    const tw=Math.max(drawCtx.measureText(areaLabel).width, drawCtx.measureText(perimLabel).width);
    const pad=5*r*s, lineH=fontSize*1.3;
    // Background
    drawCtx.fillStyle='rgba(255,255,255,0.9)';
    drawCtx.fillRect(c.x*r-tw/2-pad, c.y*r-lineH, tw+pad*2, lineH*2.2);
    drawCtx.strokeStyle='rgba(0,100,220,0.4)'; drawCtx.lineWidth=1*r*s;
    drawCtx.strokeRect(c.x*r-tw/2-pad, c.y*r-lineH, tw+pad*2, lineH*2.2);
    // Text
    drawCtx.fillStyle='rgba(0,80,180,0.9)';
    drawCtx.textAlign='center'; drawCtx.textBaseline='middle';
    drawCtx.fillText(areaLabel, c.x*r, c.y*r-lineH*0.25);
    drawCtx.font=fontSize*0.85+'px sans-serif';
    drawCtx.fillStyle='rgba(0,80,180,0.6)';
    drawCtx.fillText(perimLabel, c.x*r, c.y*r+lineH*0.55);
  }
  drawCtx.restore();
}

function calcPolylineTotalDist(pts,smooth,closed){
  if(!smooth || pts.length<=2){
    let total=0;
    for(let i=0;i<pts.length-1;i++) total+=dist(pts[i].x,pts[i].y,pts[i+1].x,pts[i+1].y);
    if(closed && pts.length>=3){
      total+=dist(pts[pts.length-1].x,pts[pts.length-1].y,pts[0].x,pts[0].y);
    }
    return total;
  }
  // Para curvas smooth: samplear la curva Catmull-Rom y sumar distancias
  let total=0;
  const steps=50; // samples por segmento para mayor precisión
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[Math.max(i-1,0)];
    const p1=pts[i];
    const p2=pts[i+1];
    const p3=pts[Math.min(i+2,pts.length-1)];
    let prevX=p1.x, prevY=p1.y;
    for(let s=1;s<=steps;s++){
      const t=s/steps;
      const t2=t*t, t3=t2*t;
      // Catmull-Rom interpolation
      const x=0.5*((2*p1.x)+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3);
      const y=0.5*((2*p1.y)+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3);
      total+=dist(prevX,prevY,x,y);
      prevX=x; prevY=y;
    }
  }
  // Segmento de cierre (recto) si closed
  if(closed && pts.length>=3){
    total+=dist(pts[pts.length-1].x,pts[pts.length-1].y,pts[0].x,pts[0].y);
  }
  return total;
}

function drawPolyline(pl, r){
  const s=Math.max(0.05, 0.8/Math.pow(scale, 0.75));
  const pts=pl.points;
  if(pts.length<1) return;

  if(pts.length===1){
    const px=pts[0].x*r, py=pts[0].y*r;
    drawCtx.beginPath(); drawCtx.arc(px,py,4*r*s,0,Math.PI*2);
    drawCtx.fillStyle='rgba(156,39,176,0.8)'; drawCtx.fill();
    return;
  }

  drawCtx.save();
  drawCtx.lineWidth=2*r*s;
  drawCtx.strokeStyle='rgba(156,39,176,0.85)';
  drawCtx.lineCap='round'; drawCtx.lineJoin='round';

  const isSmooth=!!pl.smooth;

  // Helper: dibujar la curva (recta o suavizada)
  function tracePath(close){
    drawCtx.beginPath();
    drawCtx.moveTo(pts[0].x*r, pts[0].y*r);
    if(isSmooth && pts.length>2){
      // Catmull-Rom → Bézier cúbico para curva suave
      for(let i=0;i<pts.length-1;i++){
        const p0=pts[Math.max(i-1,0)];
        const p1=pts[i];
        const p2=pts[i+1];
        const p3=pts[Math.min(i+2,pts.length-1)];
        const cp1x=(p1.x+((p2.x-p0.x)/6))*r;
        const cp1y=(p1.y+((p2.y-p0.y)/6))*r;
        const cp2x=(p2.x-((p3.x-p1.x)/6))*r;
        const cp2y=(p2.y-((p3.y-p1.y)/6))*r;
        drawCtx.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,p2.x*r,p2.y*r);
      }
    } else {
      for(let i=1;i<pts.length;i++) drawCtx.lineTo(pts[i].x*r, pts[i].y*r);
    }
    if(close) drawCtx.closePath();
  }

  const isClosed=!!pl.closed;

  // Relleno de área (solo si toggle showArea activo)
  if(showArea && pts.length>=3){
    tracePath(true);
    drawCtx.fillStyle='rgba(0,100,220,0.12)';
    drawCtx.fill();
    if(!isClosed){
      drawCtx.beginPath();
      drawCtx.moveTo(pts[pts.length-1].x*r, pts[pts.length-1].y*r);
      drawCtx.lineTo(pts[0].x*r, pts[0].y*r);
      drawCtx.setLineDash([6*r*s, 4*r*s]);
      drawCtx.strokeStyle='rgba(0,100,220,0.5)';
      drawCtx.stroke();
      drawCtx.setLineDash([]);
    }
    drawCtx.strokeStyle='rgba(156,39,176,0.85)';
  }

  // Trazo principal
  tracePath(isClosed);
  drawCtx.stroke();

  // Distancia por segmento (no para curvas suavizadas).
  // Si isClosed e isSmooth=false, también etiquetar el segmento de cierre last→first.
  if(!isSmooth){
    const segCount=(isClosed && pts.length>=3)?pts.length:pts.length-1;
    for(let i=0;i<segCount;i++){
      const a=pts[i], b=pts[(i+1)%pts.length];
      const ax=a.x*r, ay=a.y*r, bx=b.x*r, by=b.y*r;
      const segDist=dist(a.x,a.y,b.x,b.y);
      if(calibrationScale>0){
        const realDist=segDist/calibrationScale;
        const mx=(ax+bx)/2, my=(ay+by)/2;
        const angle=Math.atan2(by-ay,bx-ax);
        const fontSize=9*r*s;
        drawCtx.font=fontSize+'px sans-serif';
        const label=formatDist(realDist);
        const tw=drawCtx.measureText(label).width;
        const pad=3*r*s, halfH=7*r*s;
        drawCtx.save();
        drawCtx.translate(mx,my);
        drawCtx.rotate(angle>Math.PI/2||angle<-Math.PI/2 ? angle+Math.PI : angle);
        drawCtx.fillStyle='rgba(255,255,255,0.85)';
        drawCtx.fillRect(-tw/2-pad, -halfH, tw+pad*2, halfH*2);
        drawCtx.fillStyle='rgba(120,40,150,0.9)';
        drawCtx.textAlign='center'; drawCtx.textBaseline='middle';
        drawCtx.fillText(label,0,0);
        drawCtx.restore();
      }
    }
  }

  // Ángulos entre segmentos (no para curvas suavizadas)
  if(showAngles && !isSmooth && pts.length>=3){
    const n=pts.length;
    // Para trazos cerrados se incluyen los ángulos del primer y último vértice;
    // para abiertos, sólo los internos (i=1..n-2).
    const startI = isClosed ? 0 : 1;
    const endI   = isClosed ? n : n-1; // exclusivo
    for(let i=startI; i<endI; i++){
      const prev2=pts[(i-1+n)%n], curr=pts[i], next2=pts[(i+1)%n];
      const a1=Math.atan2(prev2.y-curr.y, prev2.x-curr.x);
      const a2=Math.atan2(next2.y-curr.y, next2.x-curr.x);
      // Barrido firmado más corto entre los dos vectores (rango (-π, π])
      let sweep=a2-a1;
      while(sweep> Math.PI) sweep-=2*Math.PI;
      while(sweep<=-Math.PI) sweep+=2*Math.PI;
      const angleDeg=Math.abs(sweep*180/Math.PI);
      const cx2=curr.x*r, cy2=curr.y*r;
      const arcR=18*r*s;
      // Dibujar arco barriendo SIEMPRE el ángulo interior (el más corto)
      drawCtx.beginPath();
      drawCtx.arc(cx2,cy2,arcR,a1,a2,sweep<0);
      drawCtx.strokeStyle='rgba(255,140,0,0.7)';
      drawCtx.lineWidth=1.5*r*s;
      drawCtx.stroke();
      // Etiqueta en la bisectriz del ángulo interior
      const midA=a1+sweep/2;
      const labelR=arcR+10*r*s;
      const lx2=cx2+labelR*Math.cos(midA);
      const ly2=cy2+labelR*Math.sin(midA);
      const fontSize2=8*r*s;
      drawCtx.font='bold '+fontSize2+'px sans-serif';
      const angleLabel=angleDeg.toFixed(1)+'°';
      const tw2=drawCtx.measureText(angleLabel).width;
      drawCtx.fillStyle='rgba(255,255,255,0.85)';
      drawCtx.fillRect(lx2-tw2/2-2*r*s, ly2-fontSize2/2-1*r*s, tw2+4*r*s, fontSize2+2*r*s);
      drawCtx.fillStyle='rgba(200,100,0,0.9)';
      drawCtx.textAlign='center'; drawCtx.textBaseline='middle';
      drawCtx.fillText(angleLabel, lx2, ly2);
    }
  }

  // Vértices (si seleccionado o en construcción)
  const showVerts=selectedPolylineId===pl.id || !pl.totalReal;
  if(showVerts){
    for(const p of pts){
      drawCtx.beginPath(); drawCtx.arc(p.x*r, p.y*r, 4*r*s, 0, Math.PI*2);
      drawCtx.fillStyle='#fff'; drawCtx.fill();
      drawCtx.strokeStyle='rgba(156,39,176,0.8)'; drawCtx.lineWidth=1.5*r*s; drawCtx.stroke();
    }
  }

  // Etiqueta total
  if(pts.length>=2 && calibrationScale>0){
    const lastPt=pts[pts.length-1];
    const totalReal=pl.totalReal||(calcPolylineTotalDist(pts,!!pl.smooth,!!pl.closed)/calibrationScale);
    const fontSize=11*r*s;
    drawCtx.font='bold '+fontSize+'px sans-serif';
    const label='Total: '+formatDist(totalReal);
    const tw=drawCtx.measureText(label).width;
    const pad=5*r*s, halfH=9*r*s;
    const lx=lastPt.x*r+10*r*s, ly=lastPt.y*r-10*r*s;
    drawCtx.fillStyle='rgba(120,40,150,0.9)';
    drawCtx.fillRect(lx-pad, ly-halfH, tw+pad*2, halfH*2);
    drawCtx.fillStyle='#fff';
    drawCtx.textAlign='left'; drawCtx.textBaseline='middle';
    drawCtx.fillText(label, lx, ly);
  }

  // Etiqueta de área (solo si toggle showArea activo)
  if(showArea && pts.length>=3 && calibrationScale>0){
    // Para curvas smooth: samplear la curva para calcular área precisa
    let areaPts=pts;
    if(isSmooth && pts.length>2){
      areaPts=[];
      const steps2=30;
      for(let i=0;i<pts.length-1;i++){
        const p0=pts[Math.max(i-1,0)], p1=pts[i], p2=pts[i+1], p3=pts[Math.min(i+2,pts.length-1)];
        for(let s2=0;s2<steps2;s2++){
          const t4=s2/steps2, t42=t4*t4, t43=t42*t4;
          areaPts.push({
            x:0.5*((2*p1.x)+(-p0.x+p2.x)*t4+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t42+(-p0.x+3*p1.x-3*p2.x+p3.x)*t43),
            y:0.5*((2*p1.y)+(-p0.y+p2.y)*t4+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t42+(-p0.y+3*p1.y-3*p2.y+p3.y)*t43)
          });
        }
      }
      areaPts.push(pts[pts.length-1]);
    }
    const areaPx=calcPolygonArea(areaPts);
    const areaReal=areaPx/(calibrationScale*calibrationScale);
    const c=polygonCentroid(pts);
    const fontSize3=11*r*s;
    drawCtx.font='bold '+fontSize3+'px sans-serif';
    const areaLabel=formatArea(areaReal);
    const tw3=drawCtx.measureText(areaLabel).width;
    const pad3=5*r*s, halfH3=9*r*s;
    drawCtx.fillStyle='rgba(0,100,220,0.85)';
    drawCtx.fillRect(c.x*r-tw3/2-pad3, c.y*r-halfH3, tw3+pad3*2, halfH3*2);
    drawCtx.fillStyle='#fff';
    drawCtx.textAlign='center'; drawCtx.textBaseline='middle';
    drawCtx.fillText(areaLabel, c.x*r, c.y*r);
  }

  drawCtx.restore();
}

// ── Douglas-Peucker simplification ──────────────────────────────────
function perpDist(pt,a,b){
  const dx=b.x-a.x, dy=b.y-a.y;
  const lenSq=dx*dx+dy*dy;
  if(lenSq===0) return dist(pt.x,pt.y,a.x,a.y);
  let t=((pt.x-a.x)*dx+(pt.y-a.y)*dy)/lenSq;
  t=Math.max(0,Math.min(1,t));
  return dist(pt.x,pt.y,a.x+t*dx,a.y+t*dy);
}
function douglasPeucker(pts,epsilon){
  if(pts.length<=2) return pts;
  let maxDist=0, maxIdx=0;
  for(let i=1;i<pts.length-1;i++){
    const d=perpDist(pts[i],pts[0],pts[pts.length-1]);
    if(d>maxDist){maxDist=d;maxIdx=i;}
  }
  if(maxDist>epsilon){
    const left=douglasPeucker(pts.slice(0,maxIdx+1),epsilon);
    const right=douglasPeucker(pts.slice(maxIdx),epsilon);
    return left.slice(0,-1).concat(right);
  }
  return [pts[0],pts[pts.length-1]];
}

// Dibujar el trazo crudo mientras se dibuja (preview)
function drawSketchPreview(r){
  if(sketchRawPoints.length<2) return;
  const s=Math.max(0.05, 0.8/Math.pow(scale, 0.75));
  drawCtx.save();
  drawCtx.beginPath();
  drawCtx.moveTo(sketchRawPoints[0].x*r, sketchRawPoints[0].y*r);
  for(let i=1;i<sketchRawPoints.length;i++){
    drawCtx.lineTo(sketchRawPoints[i].x*r, sketchRawPoints[i].y*r);
  }
  drawCtx.strokeStyle='rgba(156,39,176,0.4)';
  drawCtx.lineWidth=2*r*s;
  drawCtx.lineCap='round'; drawCtx.lineJoin='round';
  drawCtx.setLineDash([4*r*s,4*r*s]);
  drawCtx.stroke();
  drawCtx.setLineDash([]);
  drawCtx.restore();
}

// ── Snap to dark pixels ─────────────────────────────────────────────
let snapEnabled=true;
const SNAP_SCREEN_RADIUS=12; // radio de búsqueda en píxeles de PANTALLA (constante visual)
const SNAP_BRIGHTNESS_THRESHOLD=80; // 0=negro, 255=blanco — menor = más oscuro

function snapToNearestDark(pdfX, pdfY){
  if(!snapEnabled) return {x:pdfX, y:pdfY};
  const canvasR=pdfCanvas.width/pdfW;
  const cx=Math.round(pdfX*canvasR);
  const cy=Math.round(pdfY*canvasR);
  // Radio constante en pantalla: siempre busca 8px visuales sin importar zoom
  const pdfRadius=SNAP_SCREEN_RADIUS/scale; // convertir px de pantalla a px del PDF
  const searchR=Math.round(pdfRadius*canvasR);

  // Leer área de píxeles del PDF canvas
  const x0=Math.max(0, cx-searchR);
  const y0=Math.max(0, cy-searchR);
  const x1=Math.min(pdfCanvas.width-1, cx+searchR);
  const y1=Math.min(pdfCanvas.height-1, cy+searchR);
  const w=x1-x0+1, h=y1-y0+1;
  if(w<=0||h<=0) return {x:pdfX, y:pdfY};

  let imgData;
  try{ imgData=pdfCtx.getImageData(x0,y0,w,h); }catch(e){ return {x:pdfX, y:pdfY}; }
  const data=imgData.data;

  // Buscar el mejor píxel oscuro: priorizar cercanía sobre oscuridad
  // Score = distancia + (brightness * 0.1) → distancia pesa mucho más
  let bestScore=Infinity;
  let bestX=pdfX, bestY=pdfY;
  let foundSnap=false;

  for(let py2=0;py2<h;py2++){
    for(let px2=0;px2<w;px2++){
      const idx=(py2*w+px2)*4;
      const r2=data[idx], g=data[idx+1], b=data[idx+2];
      const brightness=(r2+g+b)/3;

      if(brightness<SNAP_BRIGHTNESS_THRESHOLD){
        const absX=x0+px2, absY=y0+py2;
        const d=Math.sqrt((absX-cx)**2+(absY-cy)**2);
        // Score: distancia es 90% del peso, oscuridad 10%
        const score=d + (brightness/255)*searchR*0.3;
        if(score<bestScore){
          bestScore=score;
          foundSnap=true;
          bestX=(x0+px2)/canvasR;
          bestY=(y0+py2)/canvasR;
        }
      }
    }
  }

  if(foundSnap) return {x:bestX, y:bestY};
  return {x:pdfX, y:pdfY};
}

// ── Lupa ────────────────────────────────────────────────────────────
const LOUPE_SIZE=140;
const BASE_LOUPE_ZOOM=3.6;
loupeCanvas.width=LOUPE_SIZE*2; loupeCanvas.height=LOUPE_SIZE*2;
loupeCanvas.style.width=LOUPE_SIZE+'px'; loupeCanvas.style.height=LOUPE_SIZE+'px';

function showLoupe(screenX, screenY, pdfPt){
  const lc=loupeCanvas;
  lc.style.display='block';
  let lx=screenX-LOUPE_SIZE/2;
  let ly=screenY-LOUPE_SIZE-40;
  if(ly<10) ly=screenY+60;
  if(lx<5) lx=5;
  if(lx+LOUPE_SIZE>window.innerWidth-5) lx=window.innerWidth-LOUPE_SIZE-5;
  lc.style.left=lx+'px'; lc.style.top=ly+'px';

  // Usar hi-res canvas si disponible, sino el PDF base
  const useHires=hiresCanvas.style.display==='block' && hiresCanvas.width>10;
  const srcCanvas=useHires?hiresCanvas:pdfCanvas;
  const r=srcCanvas.width/pdfW;

  // Zoom de la lupa aumenta con el zoom del PDF para siempre dar detalle extra
  const loupeZoom=BASE_LOUPE_ZOOM;
  const srcX=pdfPt.x*r - (LOUPE_SIZE)/loupeZoom;
  const srcY=pdfPt.y*r - (LOUPE_SIZE)/loupeZoom;
  const srcW=(LOUPE_SIZE*2)/loupeZoom;
  const srcH=(LOUPE_SIZE*2)/loupeZoom;

  loupeCtx.clearRect(0,0,LOUPE_SIZE*2,LOUPE_SIZE*2);

  loupeCtx.save();
  loupeCtx.beginPath();
  loupeCtx.arc(LOUPE_SIZE,LOUPE_SIZE,LOUPE_SIZE-2,0,Math.PI*2);
  loupeCtx.clip();

  loupeCtx.fillStyle='#fff';
  loupeCtx.fillRect(0,0,LOUPE_SIZE*2,LOUPE_SIZE*2);

  try{
    loupeCtx.drawImage(srcCanvas, srcX,srcY,srcW,srcH, 0,0,LOUPE_SIZE*2,LOUPE_SIZE*2);
  }catch(e){}

  loupeCtx.restore();

  // Crosshair
  loupeCtx.strokeStyle='rgba(255,0,0,0.8)';
  loupeCtx.lineWidth=3;
  loupeCtx.lineCap='round';
  loupeCtx.beginPath();
  loupeCtx.moveTo(LOUPE_SIZE-45,LOUPE_SIZE); loupeCtx.lineTo(LOUPE_SIZE+45,LOUPE_SIZE);
  loupeCtx.moveTo(LOUPE_SIZE,LOUPE_SIZE-45); loupeCtx.lineTo(LOUPE_SIZE,LOUPE_SIZE+45);
  loupeCtx.stroke();

  loupeCtx.beginPath();
  loupeCtx.arc(LOUPE_SIZE,LOUPE_SIZE,2.5,0,Math.PI*2);
  loupeCtx.fillStyle='red';
  loupeCtx.fill();

  loupeCtx.beginPath();
  loupeCtx.arc(LOUPE_SIZE,LOUPE_SIZE,LOUPE_SIZE-2,0,Math.PI*2);
  loupeCtx.strokeStyle='rgba(255,0,0,0.6)';
  loupeCtx.lineWidth=2;
  loupeCtx.stroke();
}
function hideLoupe(){ loupeCanvas.style.display='none'; }

let selectedLineId=null; // línea seleccionada para edición

// ── Find line endpoint near a point (solo de la línea seleccionada) ──
function findEndpointNear(px,py,threshold){
  if(!selectedLineId) return null;
  const ln=lines.find(l=>l.id===selectedLineId);
  if(!ln) return null;
  if(dist(px,py,ln.ax,ln.ay)<threshold) return {lineId:ln.id, endpoint:'a'};
  if(dist(px,py,ln.bx,ln.by)<threshold) return {lineId:ln.id, endpoint:'b'};
  return null;
}

// ── Find if a point is near any line segment ────────────────────────
function findLineNear(px,py,threshold){
  for(const ln of lines){
    // Distancia del punto al segmento de línea
    const dx=ln.bx-ln.ax, dy=ln.by-ln.ay;
    const lenSq=dx*dx+dy*dy;
    if(lenSq===0){ if(dist(px,py,ln.ax,ln.ay)<threshold) return ln.id; continue; }
    let t=((px-ln.ax)*dx+(py-ln.ay)*dy)/lenSq;
    t=Math.max(0,Math.min(1,t));
    const projX=ln.ax+t*dx, projY=ln.ay+t*dy;
    if(dist(px,py,projX,projY)<threshold) return ln.id;
  }
  return null;
}

function findPolyNear(px,py){
  for(const p of polygons){
    if(p.closed && pointInPolygon(px,py,p.points)) return p.id;
  }
  return null;
}
function findPolyVertexNear(px,py,threshold){
  // Buscar en polígono seleccionado
  if(selectedPolyId){
    const poly=polygons.find(p=>p.id===selectedPolyId);
    if(poly){
      for(let i=0;i<poly.points.length;i++){
        if(dist(px,py,poly.points[i].x,poly.points[i].y)<threshold) return {polyId:poly.id, vertexIdx:i, source:'polygon'};
      }
    }
  }
  // Buscar en polilínea seleccionada
  if(selectedPolylineId){
    const pl=polylines.find(p=>p.id===selectedPolylineId);
    if(pl){
      for(let i=0;i<pl.points.length;i++){
        if(dist(px,py,pl.points[i].x,pl.points[i].y)<threshold) return {polyId:pl.id, vertexIdx:i, source:'polyline'};
      }
    }
  }
  return null;
}
let editingVertex=null; // {polyId, vertexIdx}
let editOriginalPos={x:0,y:0}; // posición original del punto antes de editar
let editStartScreen={x:0,y:0}; // posición del dedo al iniciar edición
let lastTapTime=0;
let lastTapPos={x:0,y:0};

// ── Touch handling ──────────────────────────────────────────────────
touchLayer.addEventListener('touchstart',(e)=>{
  e.preventDefault();
  const tList=e.changedTouches;
  for(let i=0;i<tList.length;i++){
    touches[tList[i].identifier]={x:tList[i].clientX, y:tList[i].clientY};
  }
  const ids=Object.keys(touches);
  touchMoved=false;

  if(ids.length===1){
    isSingleTouch=true;
    const t=tList[0];
    dragStartScreen={x:t.clientX, y:t.clientY}; // siempre guardar para detección de tap
    const pdfPt=screenToPdf(t.clientX,t.clientY);

    const hitThreshold=15/scale;

    // 1. Si hay polígono o polilínea seleccionada, verificar si toca un vértice → preparar edición
    //    (mientras addVertexMode esté activo, saltamos la edición para que todo tap sea
    //     interpretado como "añadir/cerrar" en el handler de touchend)
    if((selectedPolyId || selectedPolylineId) && !addVertexMode){
      const vt=findPolyVertexNear(pdfPt.x,pdfPt.y,hitThreshold);
      if(vt){
        // Modo eliminar nodo: pedir confirmación al RN y salir
        if(deleteVertexMode && vt.source==='polyline'){
          const pl=polylines.find(p=>p.id===vt.polyId);
          const canDelete=!!pl && pl.points.length>2;
          msg({type:'vertexTappedForDelete', polyId:vt.polyId, index:vt.vertexIdx, canDelete});
          // prevenir inicio de drag
          for(let i=0;i<tList.length;i++) delete touches[tList[i].identifier];
          return;
        }
        editingVertex=vt;
        prevToolBeforeEdit=tool;
        tool='editEndpoint';
        dragging=true;
        drawConfirmed=false;
        dragStartScreen={x:t.clientX, y:t.clientY};
        editStartScreen={x:t.clientX, y:t.clientY};
        // Obtener posición original del vértice
        let origPt={x:0,y:0};
        if(vt.source==='polyline'){
          const pl=polylines.find(p=>p.id===vt.polyId);
          if(pl) origPt={x:pl.points[vt.vertexIdx].x, y:pl.points[vt.vertexIdx].y};
        } else {
          const poly=polygons.find(p=>p.id===vt.polyId);
          if(poly) origPt={x:poly.points[vt.vertexIdx].x, y:poly.points[vt.vertexIdx].y};
        }
        editOriginalPos=origPt;
        dragCurrentPdf=pdfPt;
        showLoupe(t.clientX,t.clientY,editOriginalPos);
        return;
      }
    }

    // 2. Si hay línea seleccionada, verificar si toca un endpoint → preparar edición
    if(selectedLineId){
      const ep=findEndpointNear(pdfPt.x,pdfPt.y,hitThreshold);
      if(ep){
        editingLine=ep;
        prevToolBeforeEdit=tool;
        tool='editEndpoint';
        dragging=true;
        drawConfirmed=false;
        dragStartScreen={x:t.clientX, y:t.clientY};
        editStartScreen={x:t.clientX, y:t.clientY};
        const ln=lines.find(l=>l.id===ep.lineId);
        editOriginalPos=ln?(ep.endpoint==='a'?{x:ln.ax,y:ln.ay}:{x:ln.bx,y:ln.by}):{x:0,y:0};
        dragCurrentPdf=pdfPt;
        showLoupe(t.clientX,t.clientY,editOriginalPos);
        return;
      }
    }

    if(tool==='sketch'){
      // Iniciar dibujo libre — bloquear pan/zoom
      isSketchDrawing=true;
      const snapped0=snapToNearestDark(pdfPt.x,pdfPt.y);
      sketchRawPoints=[snapped0];
      dragging=true;
      drawConfirmed=true;
    } else if(tool==='calibrate'||tool==='measure'){
      // Prepare for potential line — but don't confirm yet (could be pan)
      dragging=true;
      drawConfirmed=false;
      dragStartPdf=pdfPt;
      dragStartScreen={x:t.clientX, y:t.clientY};
      dragCurrentPdf=pdfPt;
    }
  } else if(ids.length===2){
    isSingleTouch=false;
    dragging=false;
    hideLoupe();
    const t1=touches[ids[0]], t2=touches[ids[1]];
    lastPinchDist=dist(t1.x,t1.y,t2.x,t2.y);
  }
},{passive:false});

touchLayer.addEventListener('touchmove',(e)=>{
  e.preventDefault();
  const tList=e.changedTouches;
  // Save previous positions BEFORE updating
  const prev={};
  for(let i=0;i<tList.length;i++) prev[tList[i].identifier]={...touches[tList[i].identifier]};
  for(let i=0;i<tList.length;i++) touches[tList[i].identifier]={x:tList[i].clientX, y:tList[i].clientY};
  touchMoved=true;
  const ids=Object.keys(touches);

  if(ids.length===1 && isSingleTouch){
    const t=tList[0];
    const pdfPt=screenToPdf(t.clientX,t.clientY);

    if(dragging && !drawConfirmed && (tool==='calibrate'||tool==='measure')){
      // Check if moved enough to confirm drawing vs pan
      const screenDist=Math.sqrt((t.clientX-dragStartScreen.x)**2+(t.clientY-dragStartScreen.y)**2);
      if(screenDist>=DRAW_THRESHOLD){
        drawConfirmed=true; // Now it's definitely a line draw
      } else {
        // Still under threshold — treat as pan
        const p=prev[tList[0].identifier];
        if(p){ tx+=t.clientX-p.x; ty+=t.clientY-p.y; }
        clampTx(); applyTransform();
        return;
      }
    }

    if(dragging && drawConfirmed && (tool==='calibrate'||tool==='measure')){
      stableEndPdf={x:dragCurrentPdf.x, y:dragCurrentPdf.y};
      dragCurrentPdf=pdfPt;
      showLoupe(t.clientX,t.clientY,pdfPt);
      redraw();
    } else if(dragging && tool==='editEndpoint' && !drawConfirmed && (editingLine||editingVertex)){
      const screenDist=Math.sqrt((t.clientX-editStartScreen.x)**2+(t.clientY-editStartScreen.y)**2);
      if(screenDist<DRAW_THRESHOLD){
        showLoupe(t.clientX,t.clientY,editOriginalPos);
        return;
      }
      drawConfirmed=true;
      // Resetear inicio al punto actual para que el delta empiece desde 0 (sin salto)
      editStartScreen={x:t.clientX, y:t.clientY};
    } else if(dragging && drawConfirmed && tool==='editEndpoint' && editingLine){
      // Mover con delta desde posición original, sensibilidad reducida 20%
      const editSens=0.5;
      const deltaX=(t.clientX-editStartScreen.x)/scale*editSens;
      const deltaY=(t.clientY-editStartScreen.y)/scale*editSens;
      const newX=editOriginalPos.x+deltaX;
      const newY=editOriginalPos.y+deltaY;
      stableEndPdf={x:dragCurrentPdf.x, y:dragCurrentPdf.y};
      dragCurrentPdf={x:newX, y:newY};
      const ln=lines.find(l=>l.id===editingLine.lineId);
      if(ln){
        if(editingLine.endpoint==='a'){ln.ax=newX; ln.ay=newY;}
        else {ln.bx=newX; ln.by=newY;}
        ln.distPx=dist(ln.ax,ln.ay,ln.bx,ln.by);
        if(ln.isCalibration && ln.distReal>0){
          calibrationScale=ln.distPx/ln.distReal;
          recalcAllLines();
        } else if(calibrationScale>0){
          ln.distReal=ln.distPx/calibrationScale;
        }
        showLoupe(t.clientX,t.clientY,{x:newX,y:newY});
        redraw();
      }
    } else if(dragging && drawConfirmed && tool==='editEndpoint' && editingVertex){
      const editSens=0.5;
      const deltaX=(t.clientX-editStartScreen.x)/scale*editSens;
      const deltaY=(t.clientY-editStartScreen.y)/scale*editSens;
      const newX=editOriginalPos.x+deltaX;
      const newY=editOriginalPos.y+deltaY;
      stableEndPdf={x:dragCurrentPdf.x, y:dragCurrentPdf.y};
      dragCurrentPdf={x:newX, y:newY};
      if(editingVertex.source==='polyline'){
        const pl=polylines.find(p=>p.id===editingVertex.polyId);
        if(pl){
          pl.points[editingVertex.vertexIdx]={x:newX, y:newY};
          pl.totalPx=calcPolylineTotalDist(pl.points,!!pl.smooth,!!pl.closed);
          if(calibrationScale>0) pl.totalReal=pl.totalPx/calibrationScale;
          showLoupe(t.clientX,t.clientY,{x:newX,y:newY});
          redraw();
          msg({type:'polylineUpdated', id:pl.id, dist:pl.totalReal});
        }
      } else {
        const poly=polygons.find(p=>p.id===editingVertex.polyId);
        if(poly){
          poly.points[editingVertex.vertexIdx]={x:newX, y:newY};
          poly.areaPx=calcPolygonArea(poly.points);
          poly.perimPx=calcPolygonPerimeter(poly.points);
          if(calibrationScale>0){
            poly.areaReal=poly.areaPx/(calibrationScale*calibrationScale);
            poly.perimReal=poly.perimPx/calibrationScale;
          }
          showLoupe(t.clientX,t.clientY,{x:newX,y:newY});
          redraw();
          msg({type:'areaUpdated', id:poly.id, area:poly.areaReal, perimeter:poly.perimReal});
        }
      }
    } else if(tool==='sketch' && isSketchDrawing){
      const snapped=snapToNearestDark(pdfPt.x,pdfPt.y);
      sketchRawPoints.push(snapped);
      // Auto-cerrar si pasa cerca del punto inicial
      if(sketchRawPoints.length>=10){
        const first=sketchRawPoints[0];
        const closeThreshold=15/scale;
        if(dist(snapped.x,snapped.y,first.x,first.y)<closeThreshold){
          // Cerrar: finalizar sketch como figura cerrada
          isSketchDrawing=false;
          dragging=false;
          const epsilon=2.5/scale;
          const simplified=douglasPeucker(sketchRawPoints, epsilon);
          if(simplified.length>=3){
            simplified[simplified.length-1]={x:first.x, y:first.y};
            const pl={id:nextId++, points:simplified, totalPx:0, totalReal:0, smooth:true, closed:true};
            pl.totalPx=calcPolylineTotalDist(pl.points,true,!!pl.closed);
            if(calibrationScale>0) pl.totalReal=pl.totalPx/calibrationScale;
            polylines.push(pl);
            selectedPolylineId=pl.id;
            msg({type:'polylineCreated', id:pl.id, dist:pl.totalReal, area:polylineAreaReal(pl), points:pl.points, totalPx:pl.totalPx, closed:true});
            tool='pan';
            msg({type:'toolChanged', tool:'pan'});
          }
          sketchRawPoints=[];
          redraw();
          return;
        }
      }
      redraw();
    } else if(tool==='pan' || tool==='polyline' || (!dragging && (tool==='calibrate'||tool==='measure'))){
      // Pan
      const p=prev[tList[0].identifier];
      if(p){ tx+=t.clientX-p.x; ty+=t.clientY-p.y; }
      clampTx(); applyTransform();
    }
  } else if(ids.length===2){
    // Pinch zoom — ocultar hi-res durante el gesto
    hiresCanvas.style.display='none'; lastHiresScale=0;
    const t1=touches[ids[0]], t2=touches[ids[1]];
    const d=dist(t1.x,t1.y,t2.x,t2.y);
    const center={x:(t1.x+t2.x)/2, y:(t1.y+t2.y)/2};
    if(lastPinchDist>0){
      const ds=d/lastPinchDist;
      const ns=Math.min(maxScale,Math.max(minScale,scale*ds));
      const cx=(center.x-tx)/scale, cy=(center.y-ty)/scale;
      scale=ns;
      tx=center.x-cx*scale; ty=center.y-cy*scale;
      clampTx(); applyTransform();
      msg({type:'scaleChanged', scale:scale});
    }
    lastPinchDist=d;
  }
},{passive:false});

touchLayer.addEventListener('touchend',(e)=>{
  e.preventDefault();
  const tList=e.changedTouches;

  if(dragging && isSingleTouch && Object.keys(touches).length<=1){
    const t=tList[0];
    const pdfPt=screenToPdf(t.clientX,t.clientY);

    if(tool==='sketch' && isSketchDrawing){
      // Finalizar sketch: simplificar con Douglas-Peucker y crear polilínea
      isSketchDrawing=false;
      dragging=false;
      if(sketchRawPoints.length>=3){
        // Epsilon proporcional al zoom para simplificación consistente
        const epsilon=2.5/scale;
        const simplified=douglasPeucker(sketchRawPoints, epsilon);
        if(simplified.length>=2){
          // Detectar si el trazo se cerró (último punto cerca del primero)
          const first=simplified[0], last=simplified[simplified.length-1];
          const closeThreshold=15/scale;
          const isClosed=simplified.length>=3 && dist(first.x,first.y,last.x,last.y)<closeThreshold;
          if(isClosed){
            // Reemplazar último punto por el primero para cerrar exacto
            simplified[simplified.length-1]={x:first.x, y:first.y};
          }
          const pl={id:nextId++, points:simplified, totalPx:0, totalReal:0, smooth:true, closed:isClosed};
          pl.totalPx=calcPolylineTotalDist(pl.points,!!pl.smooth,!!pl.closed);
          if(calibrationScale>0) pl.totalReal=pl.totalPx/calibrationScale;
          polylines.push(pl);
          selectedPolylineId=pl.id;
          if(isClosed) lastClosedPolylineId=pl.id;
          msg({type:'polylineCreated', id:pl.id, dist:pl.totalReal, area:polylineAreaReal(pl), points:pl.points, totalPx:pl.totalPx, closed:isClosed});
          tool='pan';
          msg({type:'toolChanged', tool:'pan'});
        }
      }
      sketchRawPoints=[];
      redraw();
      for(let i=0;i<tList.length;i++) delete touches[tList[i].identifier];
      lastPinchDist=0; isSingleTouch=Object.keys(touches).length<=1;
      return;
    }

    if(tool==='calibrate'||tool==='measure'){
      if(!drawConfirmed){ dragging=false; hideLoupe(); for(let i=0;i<tList.length;i++) delete touches[tList[i].identifier]; return; }
      // Usar posición estable (un frame antes) para evitar micro-movimiento al soltar
      const endPt=stableEndPdf.x!==0||stableEndPdf.y!==0 ? stableEndPdf : pdfPt;
      const d=dist(dragStartPdf.x,dragStartPdf.y,endPt.x,endPt.y);
      if(d>5/scale){ // Minimum line length
        const ln={
          id:nextId++,
          ax:dragStartPdf.x, ay:dragStartPdf.y,
          bx:endPt.x, by:endPt.y,
          distPx:d, distReal:0,
          isCalibration:tool==='calibrate'
        };
        if(tool==='calibrate'){
          lines=lines.filter(l=>!l.isCalibration);
          lines.push(ln);
          selectedLineId=ln.id;
          tool='pan';
          redraw();
          msg({type:'calibrationLineCreated', id:ln.id, distPx:ln.distPx});
        } else if(tool==='measure' && calibrationScale>0){
          ln.distReal=d/calibrationScale;
          lines.push(ln);
          selectedLineId=ln.id;
          tool='pan';
          redraw();
          msg({type:'measureLineCreated', id:ln.id, dist:ln.distReal, ax:ln.ax, ay:ln.ay, bx:ln.bx, by:ln.by, distPx:ln.distPx});
        }
      }
      dragging=false;
      stableEndPdf={x:0,y:0};
    } else if(tool==='editEndpoint'){
      // Si no se confirmó el movimiento, no cambiar nada (restaurar original)
      if(!drawConfirmed){
        if(editingLine){
          const ln=lines.find(l=>l.id===editingLine.lineId);
          if(ln){
            if(editingLine.endpoint==='a'){ln.ax=editOriginalPos.x;ln.ay=editOriginalPos.y;}
            else{ln.bx=editOriginalPos.x;ln.by=editOriginalPos.y;}
            ln.distPx=dist(ln.ax,ln.ay,ln.bx,ln.by);
            if(calibrationScale>0) ln.distReal=ln.distPx/calibrationScale;
          }
        }
        if(editingVertex){
          if(editingVertex.source==='polyline'){
            const pl=polylines.find(p=>p.id===editingVertex.polyId);
            if(pl) pl.points[editingVertex.vertexIdx]={x:editOriginalPos.x,y:editOriginalPos.y};
          } else {
            const poly=polygons.find(p=>p.id===editingVertex.polyId);
            if(poly) poly.points[editingVertex.vertexIdx]={x:editOriginalPos.x,y:editOriginalPos.y};
          }
        }
      } else {
        const sp=stableEndPdf.x!==0||stableEndPdf.y!==0 ? stableEndPdf : dragCurrentPdf;
        if(editingLine){
          const ln=lines.find(l=>l.id===editingLine.lineId);
          if(ln){
            if(editingLine.endpoint==='a'){ln.ax=sp.x;ln.ay=sp.y;} else{ln.bx=sp.x;ln.by=sp.y;}
            ln.distPx=dist(ln.ax,ln.ay,ln.bx,ln.by);
            if(ln.isCalibration&&ln.distReal>0){calibrationScale=ln.distPx/ln.distReal;recalcAllLines();}
            else if(calibrationScale>0){ln.distReal=ln.distPx/calibrationScale;}
          }
        }
        if(editingVertex){
          if(editingVertex.source==='polyline'){
            const pl=polylines.find(p=>p.id===editingVertex.polyId);
            if(pl){
              pl.points[editingVertex.vertexIdx]={x:sp.x,y:sp.y};
              pl.totalPx=calcPolylineTotalDist(pl.points,!!pl.smooth,!!pl.closed);
              if(calibrationScale>0) pl.totalReal=pl.totalPx/calibrationScale;
            }
          } else {
            const poly=polygons.find(p=>p.id===editingVertex.polyId);
            if(poly){
              poly.points[editingVertex.vertexIdx]={x:sp.x,y:sp.y};
              poly.areaPx=calcPolygonArea(poly.points);
              poly.perimPx=calcPolygonPerimeter(poly.points);
              if(calibrationScale>0){poly.areaReal=poly.areaPx/(calibrationScale*calibrationScale);poly.perimReal=poly.perimPx/calibrationScale;}
            }
          }
        }
      }
      dragging=false;
      editingLine=null;
      editingVertex=null;
      tool=prevToolBeforeEdit;
      stableEndPdf={x:0,y:0};
      redraw();
      msg({type:'endpointEditDone'});
    }
    hideLoupe();
  } else if(isSingleTouch && Object.keys(touches).length<=1){
    // Verificar si fue un tap (movimiento menor al threshold)
    const t0=tList[0];
    const tapDist=dragStartScreen.x?Math.sqrt((t0.clientX-dragStartScreen.x)**2+(t0.clientY-dragStartScreen.y)**2):0;
    if(tapDist>DRAW_THRESHOLD){ for(let i=0;i<tList.length;i++) delete touches[tList[i].identifier]; lastPinchDist=0; isSingleTouch=Object.keys(touches).length<=1; return; }
    const t=tList[0];
    const pdfPt=screenToPdf(t.clientX,t.clientY);
    const tapThreshold=10/scale;

    if(tool==='polyline'){
      if(!activePolyline){
        activePolyline={id:nextId++, points:[{x:pdfPt.x,y:pdfPt.y}], totalPx:0, totalReal:0};
      } else {
        // Si hay 3+ puntos y el tap cae cerca del punto inicial → cerrar trazo
        const closeThreshold=16/scale;
        const p0=activePolyline.points[0];
        if(activePolyline.points.length>=3 && dist(pdfPt.x,pdfPt.y,p0.x,p0.y)<closeThreshold){
          activePolyline.closed=true;
          // No duplicar el punto inicial: el flag closed lo maneja el renderer
          activePolyline.totalPx=calcPolylineTotalDist(activePolyline.points,false,!!activePolyline.closed);
          if(calibrationScale>0) activePolyline.totalReal=activePolyline.totalPx/calibrationScale;
          polylines.push(activePolyline);
          selectedPolylineId=activePolyline.id;
          lastClosedPolylineId=activePolyline.id;
          msg({type:'polylineCreated', id:activePolyline.id, dist:activePolyline.totalReal, area:polylineAreaReal(activePolyline), points:activePolyline.points, totalPx:activePolyline.totalPx, closed:true});
          activePolyline=null;
          tool='pan';
          msg({type:'toolChanged', tool:'pan'});
          redraw();
          return;
        }
        activePolyline.points.push({x:pdfPt.x,y:pdfPt.y});
        activePolyline.totalPx=calcPolylineTotalDist(activePolyline.points,false,!!activePolyline.closed);
        if(calibrationScale>0) activePolyline.totalReal=activePolyline.totalPx/calibrationScale;
      }
      redraw();
    } else {
      // Modo "Añadir vértice" activo + polilínea seleccionada:
      //   • tap cerca del PRIMER punto (≥3 vértices, no cerrada) → cerrar polígono
      //   • tap cerca del trazo → insertar vértice en el segmento
      //   • tap lejos del trazo → añadir vértice al final
      if(addVertexMode && selectedPolylineId){
        const pl=polylines.find(p=>p.id===selectedPolylineId);
        if(pl){
          // 1) Cierre por proximidad al primer punto (prioridad máxima — ~30 px en pantalla
          //     para ganarle al chequeo de segmento, incluso si el tap cae sobre el segmento p0-p1).
          const closeThreshold=30/scale;
          if(!pl.closed && pl.points.length>=3){
            const p0=pl.points[0];
            if(dist(pdfPt.x,pdfPt.y,p0.x,p0.y)<closeThreshold){
              pl.closed=true;
              pl.totalPx=calcPolylineTotalDist(pl.points,!!pl.smooth,!!pl.closed);
              if(calibrationScale>0) pl.totalReal=pl.totalPx/calibrationScale;
              lastClosedPolylineId=pl.id;
              // Tras cerrar, apagar el modo "Añadir vértice"
              addVertexMode=false;
              msg({type:'addVertexModeChanged', enabled:false});
              redraw();
              msg({type:'elementSelected', kind:'polyline', dist:pl.totalReal, area:polylineAreaReal(pl), elemType:'polyline', elemId:pl.id, dbId:pl.dbId||null});
              msg({type:'polylineClosedFromSelection', id:pl.id, dbId:pl.dbId||null, totalReal:pl.totalReal, area:polylineAreaReal(pl), totalPx:pl.totalPx, points:pl.points});
              return;
            }
          }
          // 2) Insertar en segmento
          let insertIdx=-1;
          for(let i=0;i<pl.points.length-1;i++){
            const a=pl.points[i], b=pl.points[i+1];
            const dx2=b.x-a.x, dy2=b.y-a.y, lenSq=dx2*dx2+dy2*dy2;
            if(lenSq===0) continue;
            let t2=((pdfPt.x-a.x)*dx2+(pdfPt.y-a.y)*dy2)/lenSq;
            t2=Math.max(0,Math.min(1,t2));
            if(dist(pdfPt.x,pdfPt.y,a.x+t2*dx2,a.y+t2*dy2)<tapThreshold){insertIdx=i+1; break;}
          }
          if(insertIdx>0){
            pl.points.splice(insertIdx,0,{x:pdfPt.x,y:pdfPt.y});
            pl.totalPx=calcPolylineTotalDist(pl.points,!!pl.smooth,!!pl.closed);
            if(calibrationScale>0) pl.totalReal=pl.totalPx/calibrationScale;
            // Tras añadir, apagar el modo "Añadir vértice" (un vértice por activación)
            addVertexMode=false;
            msg({type:'addVertexModeChanged', enabled:false});
            redraw();
            msg({type:'elementSelected', kind:'polyline', dist:pl.totalReal, area:polylineAreaReal(pl), elemType:'polyline', elemId:pl.id, dbId:pl.dbId||null});
            msg({type:'polylineVertexInserted', id:pl.id, dbId:pl.dbId||null, totalReal:pl.totalReal, area:polylineAreaReal(pl), totalPx:pl.totalPx, points:pl.points});
            return;
          }
          // Tap lejos → añadir al final; si estaba cerrada, abrir
          if(pl.closed){ pl.closed=false; if(lastClosedPolylineId===pl.id) lastClosedPolylineId=null; }
          pl.points.push({x:pdfPt.x,y:pdfPt.y});
          pl.totalPx=calcPolylineTotalDist(pl.points,!!pl.smooth,!!pl.closed);
          if(calibrationScale>0) pl.totalReal=pl.totalPx/calibrationScale;
          // Tras añadir, apagar el modo "Añadir vértice"
          addVertexMode=false;
          msg({type:'addVertexModeChanged', enabled:false});
          redraw();
          msg({type:'elementSelected', kind:'polyline', dist:pl.totalReal, area:polylineAreaReal(pl), elemType:'polyline', elemId:pl.id, dbId:pl.dbId||null});
          msg({type:'polylineVertexAppended', id:pl.id, dbId:pl.dbId||null, totalReal:pl.totalReal, area:polylineAreaReal(pl), totalPx:pl.totalPx, points:pl.points, closed:pl.closed});
          return;
        }
      }

      // Tap → seleccionar/deseleccionar
      selectedLineId=null;
      selectedPolyId=null;
      selectedPolylineId=null;

      const tappedLineId=findLineNear(pdfPt.x,pdfPt.y,tapThreshold);
      if(tappedLineId){
        selectedLineId=tappedLineId;
        const ln=lines.find(l=>l.id===tappedLineId);
        if(ln) msg({type:'elementSelected', kind:ln.isCalibration?'calibration':'line', dist:ln.distReal, elemType:'line', elemId:ln.id, dbId:ln.dbId||null});
      } else {
        let foundPl=null;
        for(const pl of polylines){
          for(let i=0;i<pl.points.length-1;i++){
            const a=pl.points[i], b=pl.points[i+1];
            const dx2=b.x-a.x, dy2=b.y-a.y, lenSq=dx2*dx2+dy2*dy2;
            if(lenSq===0) continue;
            let t2=((pdfPt.x-a.x)*dx2+(pdfPt.y-a.y)*dy2)/lenSq;
            t2=Math.max(0,Math.min(1,t2));
            if(dist(pdfPt.x,pdfPt.y,a.x+t2*dx2,a.y+t2*dy2)<tapThreshold){foundPl=pl; break;}
          }
          if(foundPl) break;
        }
        if(foundPl){
          selectedPolylineId=foundPl.id;
          msg({type:'elementSelected', kind:'polyline', dist:foundPl.totalReal, area:polylineAreaReal(foundPl), elemType:'polyline', elemId:foundPl.id, dbId:foundPl.dbId||null});
        } else {
          const tappedPolyId=findPolyNear(pdfPt.x,pdfPt.y);
          if(tappedPolyId){
            selectedPolyId=tappedPolyId;
            const poly=polygons.find(p=>p.id===tappedPolyId);
            if(poly) msg({type:'elementSelected', kind:'polygon', area:poly.areaReal, perimeter:poly.perimReal, elemType:'polygon', elemId:poly.id, dbId:poly.dbId||null});
          } else {
            msg({type:'elementDeselected'});
          }
        }
      }
      redraw();
    }
  }

  for(let i=0;i<tList.length;i++) delete touches[tList[i].identifier];
  if(lastPinchDist>0){ redraw(); }
  scheduleHiresRender(); // siempre intentar hi-res al soltar
  lastPinchDist=0;
  isSingleTouch=Object.keys(touches).length<=1;
},{passive:false});

function recalcAllLines(){
  for(const ln of lines){
    if(!ln.isCalibration && calibrationScale>0){
      ln.distReal=ln.distPx/calibrationScale;
    }
  }
}

// ── Messages ────────────────────────────────────────────────────────
function msg(obj){ window.ReactNativeWebView.postMessage(JSON.stringify(obj)); }

window.addEventListener('message',(e)=>{
  try{
    const m=JSON.parse(e.data);
    if(m.cmd==='setTool'){
      tool=m.tool;
      dragging=false; editingLine=null; editingVertex=null; hideLoupe();
      if(m.tool!=='area') activePolygon=null;
      if(m.tool!=='polyline') activePolyline=null;
      if(m.tool!=='sketch'){ sketchRawPoints=[]; isSketchDrawing=false; }
      // Deseleccionar todo al cambiar de herramienta
      selectedLineId=null; selectedPolyId=null; selectedPolylineId=null;
      msg({type:'elementDeselected'});
      msg({type:'toolChanged', tool:tool});
      redraw();
    }
    if(m.cmd==='confirmCalibration'){
      const ln=lines.find(l=>l.id===m.lineId);
      if(ln){
        ln.distReal=m.realMeters;
        calibrationScale=ln.distPx/m.realMeters;
        recalcAllLines();
        selectedLineId=null;
        tool='pan';
        redraw();
        msg({type:'calibrationDone', calScale:calibrationScale, ax:ln.ax, ay:ln.ay, bx:ln.bx, by:ln.by, distPx:ln.distPx, distReal:ln.distReal});
      }
    }
    if(m.cmd==='deleteLine'){
      lines=lines.filter(l=>l.id!==m.lineId);
      if(m.lineId && lines.find(l=>l.isCalibration)===undefined){
        calibrationScale=0;
      }
      redraw();
    }
    if(m.cmd==='deleteSelected'){
      if(selectedLineId){
        const ln=lines.find(l=>l.id===selectedLineId);
        const wasCal=ln&&ln.isCalibration;
        lines=lines.filter(l=>l.id!==selectedLineId);
        selectedLineId=null;
        if(wasCal){ calibrationScale=0; msg({type:'calibrationLost'}); }
      }
      if(selectedPolyId){
        polygons=polygons.filter(p=>p.id!==selectedPolyId);
        selectedPolyId=null;
      }
      if(selectedPolylineId){
        polylines=polylines.filter(p=>p.id!==selectedPolylineId);
        selectedPolylineId=null;
      }
      redraw();
      msg({type:'elementDeselected'});
    }
    if(m.cmd==='clearAll'){
      lines=[]; polygons=[]; polylines=[]; activePolygon=null; activePolyline=null; calibrationScale=0; tool='pan';
      selectedLineId=null; selectedPolyId=null; selectedPolylineId=null;
      dragging=false; editingLine=null; editingVertex=null; hideLoupe();
      redraw();
    }
    if(m.cmd==='clearMeasurements'){
      lines=lines.filter(l=>l.isCalibration);
      polygons=[]; polylines=[]; activePolygon=null; activePolyline=null;
      selectedPolyId=null; selectedPolylineId=null;
      redraw();
    }
    if(m.cmd==='loadLine'){
      lines.push({id:nextId++, dbId:m.dbId||null, ax:m.ax, ay:m.ay, bx:m.bx, by:m.by,
        distPx:m.distPx||dist(m.ax,m.ay,m.bx,m.by),
        distReal:m.distReal||0, isCalibration:!!m.isCalibration});
    }
    if(m.cmd==='loadPolygon'){
      const poly={id:nextId++, dbId:m.dbId||null, points:m.points, areaPx:m.areaPx||0, areaReal:m.areaReal||0,
        perimPx:m.perimPx||0, perimReal:m.perimReal||0, closed:true};
      polygons.push(poly);
    }
    if(m.cmd==='loadPolyline'){
      const pl={id:nextId++, dbId:m.dbId||null, points:m.points,
        totalPx:m.totalPx||calcPolylineTotalDist(m.points,!!m.smooth,!!m.closed),
        totalReal:m.totalReal||0, smooth:!!m.smooth, closed:!!m.closed};
      polylines.push(pl);
    }
    if(m.cmd==='setDbId'){
      // Asocia dbId al último elemento creado según kind+webId
      if(m.kind==='polyline'){
        const pl=polylines.find(p=>p.id===m.webId); if(pl) pl.dbId=m.dbId;
      } else if(m.kind==='polygon'){
        const p=polygons.find(g=>g.id===m.webId); if(p) p.dbId=m.dbId;
      } else if(m.kind==='line' || m.kind==='calibration'){
        const l=lines.find(ln=>ln.id===m.webId); if(l) l.dbId=m.dbId;
      }
    }
    if(m.cmd==='setCalibrationScale'){
      calibrationScale=m.scale;
    }
    if(m.cmd==='redraw'){
      redraw();
    }
    if(m.cmd==='exportPlanImage'){
      try {
        // Forzar scale=8 internamente para que las etiquetas se dibujen pequeñas
        // (las flechas/labels se dimensionan con s = 0.8 / scale^0.75).
        // No cambia el transform visible, sólo el valor lógico usado por redraw().
        const prevScale=scale;
        scale=8;
        redraw();
        // Componer pdfCanvas + drawCanvas en un canvas off-screen a la resolución nativa
        const off=document.createElement('canvas');
        off.width=pdfCanvas.width;
        off.height=pdfCanvas.height;
        const ctx=off.getContext('2d');
        ctx.fillStyle='#ffffff';
        ctx.fillRect(0,0,off.width,off.height);
        ctx.drawImage(pdfCanvas,0,0);
        ctx.drawImage(drawCanvas,0,0);
        const dataURL=off.toDataURL('image/png');
        // Restaurar scale real y repintar para que el usuario no vea cambios visuales
        scale=prevScale;
        redraw();
        msg({type:'exportedImage', dataURL, width:off.width, height:off.height});
      } catch(e){
        // Intentar restaurar scale aunque haya error
        try { redraw(); } catch(_){}
        msg({type:'exportError', message:String(e)});
      }
    }
    if(m.cmd==='toggleAngles'){
      showAngles=!showAngles;
      redraw();
      msg({type:'anglesToggled', show:showAngles});
    }
    if(m.cmd==='toggleArea'){
      showArea=!showArea;
      redraw();
      msg({type:'areaToggled', show:showArea});
    }
    if(m.cmd==='toggleSnap'){
      snapEnabled=!snapEnabled;
      msg({type:'snapToggled', show:snapEnabled});
    }
    if(m.cmd==='finishPolyline'){
      if(activePolyline && activePolyline.points.length>=2){
        activePolyline.totalPx=calcPolylineTotalDist(activePolyline.points,false,!!activePolyline.closed);
        if(calibrationScale>0) activePolyline.totalReal=activePolyline.totalPx/calibrationScale;
        polylines.push(activePolyline);
        selectedPolylineId=activePolyline.id;
        msg({type:'polylineCreated', id:activePolyline.id, dist:activePolyline.totalReal, area:polylineAreaReal(activePolyline), points:activePolyline.points, totalPx:activePolyline.totalPx});
        activePolyline=null;
        tool='pan';
        msg({type:'toolChanged', tool:'pan'});
        redraw();
      }
    }
    if(m.cmd==='toggleDeleteVertexMode'){
      deleteVertexMode=!!m.enabled;
      if(deleteVertexMode) addVertexMode=false;
      redraw();
      msg({type:'deleteVertexModeChanged', enabled:deleteVertexMode});
      if(!addVertexMode) msg({type:'addVertexModeChanged', enabled:false});
    }
    if(m.cmd==='toggleAddVertexMode'){
      addVertexMode=!!m.enabled;
      if(addVertexMode) deleteVertexMode=false;
      redraw();
      msg({type:'addVertexModeChanged', enabled:addVertexMode});
      if(!deleteVertexMode) msg({type:'deleteVertexModeChanged', enabled:false});
    }
    if(m.cmd==='removeVertexAt'){
      if(selectedPolylineId && typeof m.index==='number'){
        const pl=polylines.find(p=>p.id===selectedPolylineId);
        if(pl && pl.points.length>2){
          pl.points.splice(m.index,1);
          pl.totalPx=calcPolylineTotalDist(pl.points,!!pl.smooth,!!pl.closed);
          if(calibrationScale>0) pl.totalReal=pl.totalPx/calibrationScale;
          redraw();
          msg({type:'elementSelected', kind:'polyline', dist:pl.totalReal, area:polylineAreaReal(pl), elemType:'polyline', elemId:pl.id, dbId:pl.dbId||null});
          msg({type:'polylineVertexRemoved', id:pl.id, dbId:pl.dbId||null, totalReal:pl.totalReal, area:polylineAreaReal(pl), points:pl.points, totalPx:pl.totalPx});
        }
      }
    }
    if(m.cmd==='extendPolyline'){
      if(selectedPolylineId){
        const pl=polylines.find(p=>p.id===selectedPolylineId);
        if(pl){
          // Pasar a modo polyline con esta polilínea como activa
          polylines=polylines.filter(p=>p.id!==selectedPolylineId);
          activePolyline=pl;
          // Recordar el tamaño inicial para que undo sólo pope vértices añadidos en esta sesión
          activePolyline.extendStartLen=pl.points.length;
          // Si estaba cerrada, re-abrirla al extender
          activePolyline.closed=false;
          selectedPolylineId=null;
          tool='polyline';
          msg({type:'toolChanged', tool:'polyline'});
          redraw();
        }
      }
    }
    if(m.cmd==='removeLastVertex'){
      // Caso 1: polilínea en construcción → pop último vértice, respetando extendStartLen
      if(activePolyline){
        const minLen=(activePolyline.extendStartLen!=null)?Math.max(activePolyline.extendStartLen,1):1;
        if(activePolyline.points.length>minLen){
          activePolyline.points.pop();
          activePolyline.totalPx=calcPolylineTotalDist(activePolyline.points,false,!!activePolyline.closed);
          if(calibrationScale>0) activePolyline.totalReal=activePolyline.totalPx/calibrationScale;
          redraw();
        }
        return;
      }
      // Caso 2: hay una polilínea seleccionada. Si está cerrada y fue la última cerrada,
      //   el primer "atrás" la REABRE sin tocar vértices. Los siguientes "atrás" ya
      //   proceden a eliminar su último vértice.
      if(selectedPolylineId){
        const pl=polylines.find(p=>p.id===selectedPolylineId);
        if(!pl) return;
        // 2a) ¿Cerrada y fue la última cerrada? → reabrir
        if(pl.closed && lastClosedPolylineId===pl.id){
          pl.closed=false;
          pl.totalPx=calcPolylineTotalDist(pl.points,!!pl.smooth,!!pl.closed);
          if(calibrationScale>0) pl.totalReal=pl.totalPx/calibrationScale;
          lastClosedPolylineId=null;
          redraw();
          msg({type:'elementSelected', kind:'polyline', dist:pl.totalReal, area:polylineAreaReal(pl), elemType:'polyline', elemId:pl.id, dbId:pl.dbId||null});
          msg({type:'polylineReopened', id:pl.id, dbId:pl.dbId||null, totalReal:pl.totalReal, area:polylineAreaReal(pl), totalPx:pl.totalPx, points:pl.points});
          return;
        }
        // 2b) Abierta (ya sea porque nunca se cerró o porque recién se reabrió) → pop
        if(!pl.closed && pl.points.length>2){
          pl.points.pop();
          pl.totalPx=calcPolylineTotalDist(pl.points,!!pl.smooth,!!pl.closed);
          if(calibrationScale>0) pl.totalReal=pl.totalPx/calibrationScale;
          redraw();
          msg({type:'elementSelected', kind:'polyline', dist:pl.totalReal, area:polylineAreaReal(pl), elemType:'polyline', elemId:pl.id, dbId:pl.dbId||null});
          msg({type:'polylineVertexRemoved', id:pl.id, dbId:pl.dbId||null, totalReal:pl.totalReal, area:polylineAreaReal(pl), points:pl.points, totalPx:pl.totalPx});
          return;
        }
      }
      // Caso 3: no hay selección pero sí una polilínea recién cerrada → reabrir
      if(lastClosedPolylineId){
        const pl=polylines.find(p=>p.id===lastClosedPolylineId);
        lastClosedPolylineId=null;
        if(pl && pl.closed){
          pl.closed=false;
          pl.totalPx=calcPolylineTotalDist(pl.points,!!pl.smooth,!!pl.closed);
          if(calibrationScale>0) pl.totalReal=pl.totalPx/calibrationScale;
          redraw();
          msg({type:'polylineReopened', id:pl.id, dbId:pl.dbId||null, totalReal:pl.totalReal, area:polylineAreaReal(pl), totalPx:pl.totalPx, points:pl.points});
        }
      }
    }
  }catch(ex){}
});
document.addEventListener('message',(e)=>{
  try{window.dispatchEvent(new MessageEvent('message',{data:e.data}));}catch(ex){}
});

// ── Load PDF ────────────────────────────────────────────────────────
(async()=>{
  try{
    const raw=atob('${pdfBase64}');
    const bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
    pdfDoc=await pdfjsLib.getDocument({data:bytes}).promise;
    await renderPage(1);
  }catch(err){
    msg({type:'error', message:err.message||'Error loading PDF'});
  }
})();
</script>
</body>
</html>
`;

// ── Carrusel informativo de la barra de selección ──────────────────────
type InfoItem = { key: string; icon: React.ReactNode; label: string; value: string; color: string };

function buildInfoItems(sel: any): InfoItem[] {
  if (!sel) return [];
  const fmtM = (v: number) => (v >= 1 ? `${v.toFixed(2)} m` : `${(v * 100).toFixed(1)} cm`);
  const fmtArea = (v: number) => (v >= 1 ? `${v.toFixed(2)} m²` : `${(v * 10000).toFixed(0)} cm²`);
  const items: InfoItem[] = [];
  if (sel.kind === 'line' && sel.dist != null) {
    items.push({
      key: 'line-dist',
      icon: <MaterialCommunityIcons name="vector-line" size={16} color="#2e7d32" />,
      label: tx('measurement.info.measure'),
      value: fmtM(sel.dist),
      color: '#2e7d32',
    });
  }
  if (sel.kind === 'calibration' && sel.dist != null) {
    items.push({
      key: 'cal-dist',
      icon: <MaterialCommunityIcons name="scale-balance" size={16} color="#e65100" />,
      label: tx('measurement.info.reference'),
      value: fmtM(sel.dist),
      color: '#e65100',
    });
  }
  if (sel.kind === 'polygon') {
    if (sel.area != null) {
      items.push({
        key: 'poly-area',
        icon: <MaterialCommunityIcons name="vector-square" size={16} color="#1565c0" />,
        label: tx('measurement.info.area'),
        value: fmtArea(sel.area),
        color: '#1565c0',
      });
    }
    if (sel.perimeter != null) {
      items.push({
        key: 'poly-perim',
        icon: <MaterialCommunityIcons name="vector-polyline" size={16} color="#1565c0" />,
        label: tx('measurement.info.perimeter'),
        value: fmtM(sel.perimeter),
        color: '#1565c0',
      });
    }
  }
  if (sel.kind === 'polyline') {
    if (sel.dist != null) {
      items.push({
        key: 'pl-dist',
        icon: <MaterialCommunityIcons name="chart-timeline-variant" size={16} color="#7b1fa2" />,
        label: tx('measurement.info.path'),
        value: fmtM(sel.dist),
        color: '#7b1fa2',
      });
    }
    if (sel.area != null && sel.area > 0) {
      items.push({
        key: 'pl-area',
        icon: <MaterialCommunityIcons name="vector-square" size={16} color="#7b1fa2" />,
        label: tx('measurement.info.area'),
        value: fmtArea(sel.area),
        color: '#7b1fa2',
      });
    }
  }
  const cs = sel.calcState;
  if (cs?.bricks) {
    items.push({
      key: 'cs-bricks',
      icon: <MaterialCommunityIcons name="wall" size={16} color="#c0392b" />,
      label: tx('measurement.info.bricks'),
      value: tx('measurement.info.units', { count: cs.bricks.totalBricks }),
      color: '#c0392b',
    });
  }
  if (cs?.volume) {
    items.push({
      key: 'cs-volume',
      icon: <MaterialCommunityIcons name="cube-outline" size={16} color="#1565c0" />,
      label: tx('measurement.info.volume'),
      value: `${cs.volume.totalM3.toFixed(2)} m³`,
      color: '#1565c0',
    });
  }
  if (cs?.tiles) {
    items.push({
      key: 'cs-tiles',
      icon: <MaterialCommunityIcons name="checkerboard" size={16} color="#e67e22" />,
      label: tx('measurement.info.tiles'),
      value: tx('measurement.info.units', { count: cs.tiles.totalTiles }),
      color: '#e67e22',
    });
  }
  return items;
}

function SelectionInfoCarousel({ selectedElement }: { selectedElement: any }) {
  const items = React.useMemo(() => buildInfoItems(selectedElement), [selectedElement]);
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);
  const dirRef = useRef<1 | -1>(1); // 1 = izq→der, -1 = der→izq (rebote)
  const pausedRef = useRef(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentWidthRef = useRef(0);
  const viewportWidthRef = useRef(0);

  const pauseNow = () => {
    pausedRef.current = true;
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  };
  const resumeAfterDelay = () => {
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => {
      pausedRef.current = false;
      pauseTimerRef.current = null;
    }, 5000);
  };

  useEffect(() => () => { if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current); }, []);

  useEffect(() => {
    // Reset al cambiar los items
    offsetRef.current = 0;
    dirRef.current = 1;
    try { scrollRef.current?.scrollTo({ x: 0, animated: false }); } catch {}
  }, [items]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      const cw = contentWidthRef.current;
      const vw = viewportWidthRef.current;
      const maxOffset = cw - vw;
      if (maxOffset <= 4) return; // no hay suficiente contenido para scrollear
      offsetRef.current += 0.6 * dirRef.current;
      // Rebote al llegar al final o al inicio
      if (offsetRef.current >= maxOffset) {
        offsetRef.current = maxOffset;
        dirRef.current = -1;
      } else if (offsetRef.current <= 0) {
        offsetRef.current = 0;
        dirRef.current = 1;
      }
      try { scrollRef.current?.scrollTo({ x: offsetRef.current, animated: false }); } catch {}
    }, 40);
    return () => clearInterval(interval);
  }, [items.length]);

  if (items.length === 0) return <View style={{ flex: 1 }} />;

  return (
    <View
      style={{ flex: 1, overflow: 'hidden' }}
      onLayout={(e) => { viewportWidthRef.current = e.nativeEvent.layout.width; }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={(w) => { contentWidthRef.current = w; }}
        onScrollBeginDrag={pauseNow}
        onScrollEndDrag={resumeAfterDelay}
        onMomentumScrollEnd={resumeAfterDelay}
        onTouchStart={pauseNow}
        onTouchEnd={resumeAfterDelay}
        onScroll={(e) => { offsetRef.current = e.nativeEvent.contentOffset.x; }}
        scrollEventThrottle={16}
        contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingRight: 4 }}
      >
        {items.map((it) => (
          <View key={it.key} style={infoItemStyles.pill}>
            {it.icon}
            <Text style={[infoItemStyles.label, { color: it.color }]}>{it.label}:</Text>
            <Text style={[infoItemStyles.value, { color: it.color }]}>{it.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const infoItemStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: Colors.surface, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  label: { fontSize: 12, fontWeight: '700' },
  value: { fontSize: 13, fontWeight: '800' },
});

// ── React Native Component ──────────────────────────────────────────────
export default function MeasurementScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const { planId: routePlanId, planName } = route.params;

  // Canonical planId: si hay varios Plan con el mismo nombre en el mismo proyecto,
  // usamos siempre el más antiguo para que todas las mediciones sean compartidas.
  const [planId, setPlanId] = useState<string>(routePlanId);

  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentScale, setCurrentScale] = useState(1);
  const webRef = useRef<WebView>(null);

  // Tool state
  const [activeTool, setActiveTool] = useState<'pan' | 'calibrate' | 'measure' | 'polyline' | 'sketch'>('pan');
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [showCalibrationInput, setShowCalibrationInput] = useState(false);
  const [calibrationLineId, setCalibrationLineId] = useState<number | null>(null);
  const [calibrationInput, setCalibrationInput] = useState('');
  const [calibrationUnit, setCalibrationUnit] = useState<'m' | 'cm' | 'mm'>('m');
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);
  const [lastMeasure, setLastMeasure] = useState<number | null>(null);
  const [measureCount, setMeasureCount] = useState(0);
  const [totalDist, setTotalDist] = useState(0);
  const [lastArea, setLastArea] = useState<{ area: number; perimeter: number } | null>(null);
  const [anglesVisible, setAnglesVisible] = useState(false);
  const [areaVisible, setAreaVisible] = useState(false);
  const [snapVisible, setSnapVisible] = useState(false);
  const [showToggles, setShowToggles] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{ kind: string; dist?: number; area?: number; perimeter?: number; elemType?: string; elemId?: number; dbId?: string | null; calcState?: { bricks?: any; volume?: any; tiles?: any } | null } | null>(null);
  const [showBrickModal, setShowBrickModal] = useState(false);
  const [showVolumeModal, setShowVolumeModal] = useState(false);
  const [showTileModal, setShowTileModal] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [recentCalcValues, setRecentCalcValues] = useState<Array<{ id: string; value: number; label: string }>>([]);

  const addRecentCalc = useCallback((value: number, label: string) => {
    if (!isFinite(value) || value <= 0) return;
    setRecentCalcValues((prev) => {
      const next = [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, value, label }, ...prev];
      return next.slice(0, 5);
    });
  }, []);

  const fmtM = (v: number) => (v >= 1 ? `${v.toFixed(2)} m` : `${(v * 100).toFixed(1)} cm`);
  const fmtArea = (v: number) => (v >= 1 ? `${v.toFixed(2)} m²` : `${(v * 10000).toFixed(0)} cm²`);
  const [deleteVertexMode, setDeleteVertexMode] = useState(false);
  const [addVertexMode, setAddVertexMode] = useState(false);

  // Desactivar modos cuando se deselecciona o cambia a otro tipo
  useEffect(() => {
    const isPolylineSelected = !!(selectedElement && selectedElement.kind === 'polyline');
    if (!isPolylineSelected) {
      if (deleteVertexMode) {
        setDeleteVertexMode(false);
        sendCmd({ cmd: 'toggleDeleteVertexMode', enabled: false });
      }
      if (addVertexMode) {
        setAddVertexMode(false);
        sendCmd({ cmd: 'toggleAddVertexMode', enabled: false });
      }
    }
  }, [selectedElement]);
  const [webReady, setWebReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const savedCalibrationScale = useRef(0);

  // Tour refs (tutorial guiado)
  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();
  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);
  const pan = useTourStepWithLayout('measurement_pan');
  const calibrate = useTourStepWithLayout('measurement_calibrate');
  const measure = useTourStepWithLayout('measurement_measure');
  const polyline = useTourStepWithLayout('measurement_polyline');
  const sketch = useTourStepWithLayout('measurement_sketch');
  const printStep = useTourStepWithLayout('measurement_print');
  const fabCalcRef = useTourStep('measurement_fab_calc');
  const fabBricksRef = useTourStep('measurement_fab_bricks');
  const fabVolumeRef = useTourStep('measurement_fab_volume');
  const fabTilesRef = useTourStep('measurement_fab_tiles');
  const areaToggleRef = useTourStep('measurement_toggle_area');
  const anglesToggleRef = useTourStep('measurement_toggle_angles');

  // Resolver planId canónico (mismo nombre en mismo proyecto → plan más antiguo)
  useEffect(() => {
    (async () => {
      try {
        const current = await plansCollection.find(routePlanId);
        const siblings = await plansCollection
          .query(Q.where('project_id', current.projectId), Q.where('name', current.name))
          .fetch();
        if (siblings.length <= 1) {
          setPlanId(routePlanId);
          return;
        }
        // El más antiguo (menor createdAt) es el canónico
        const canonical = siblings.reduce((acc, p) => (p.createdAt < acc.createdAt ? p : acc));
        setPlanId(canonical.id);
      } catch {
        setPlanId(routePlanId);
      }
    })();
  }, [routePlanId]);

  // Load PDF (usa planId canónico)
  useEffect(() => {
    (async () => {
      try {
        const plan = await plansCollection.find(planId);
        if (!plan.fileUri) { setError(t('measurement.error.noFile')); setLoading(false); return; }
        const info = await FileSystem.getInfoAsync(plan.fileUri);
        if (!info.exists) { setError(t('measurement.error.fileNotFound')); setLoading(false); return; }
        const b64 = await FileSystem.readAsStringAsync(plan.fileUri, { encoding: FileSystem.EncodingType.Base64 });
        setPdfBase64(b64);
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [planId]);

  const sendCmd = useCallback((cmd: any) => {
    webRef.current?.postMessage(JSON.stringify(cmd));
  }, []);

  // Cargar mediciones guardadas cuando el WebView esté listo
  useEffect(() => {
    if (!webReady) return;
    (async () => {
      try {
        const saved = await planMeasurementsCollection
          .query(Q.where('plan_id', planId))
          .fetch();
        if (saved.length === 0) return;

        for (const m of saved) {
          const d = JSON.parse(m.data);
          if (m.type === 'calibration') {
            sendCmd({ cmd: 'loadLine', ...d, isCalibration: true, dbId: m.id });
            if (m.calibrationScale > 0) {
              sendCmd({ cmd: 'setCalibrationScale', scale: m.calibrationScale });
              savedCalibrationScale.current = m.calibrationScale;
              setIsCalibrated(true);
            }
          } else if (m.type === 'line') {
            sendCmd({ cmd: 'loadLine', ...d, isCalibration: false, dbId: m.id });
          } else if (m.type === 'polygon') {
            sendCmd({ cmd: 'loadPolygon', ...d, dbId: m.id });
          } else if (m.type === 'polyline') {
            sendCmd({ cmd: 'loadPolyline', ...d, dbId: m.id });
          }
        }
        sendCmd({ cmd: 'redraw' });
      } catch {}
    })();
  }, [webReady, planId, sendCmd]);

  // Guardar medición en WatermelonDB → retorna el id del registro
  // Sube las mediciones del plano a Supabase. Se invoca después de cada mutación
  // (crear/actualizar/borrar). Resuelve el projectId desde el plano y dispara
  // pushProjectToSupabase, que ya incluye plan_measurements en su scope.
  const pushMeasurementsToCloud = useCallback(async () => {
    try {
      const plan = await plansCollection.find(planId);
      const pid = (plan as any).projectId;
      if (pid) pushProjectToSupabase(pid).catch(() => {});
    } catch { /* sin red, ignorar */ }
  }, [planId]);

  const saveMeasurement = useCallback(async (type: string, data: any, calScale: number): Promise<string | null> => {
    try {
      let createdId: string | null = null;
      await database.write(async () => {
        const rec = await planMeasurementsCollection.create((m) => {
          m.planId = planId;
          m.type = type;
          m.data = JSON.stringify(data);
          m.calibrationScale = calScale;
          m.page = 1;
        });
        createdId = rec.id;
      });
      pushMeasurementsToCloud();
      return createdId;
    } catch (e) { console.warn('[Measurement] save error:', e); return null; }
  }, [planId, pushMeasurementsToCloud]);

  // Actualizar calcState dentro del JSON data de un registro existente
  const updateMeasurementCalcState = useCallback(async (dbId: string, patch: { bricks?: any; volume?: any; tiles?: any }) => {
    try {
      const rec = await planMeasurementsCollection.find(dbId);
      const currentData = JSON.parse(rec.data || '{}');
      const calcState = { ...(currentData.calcState || {}), ...patch };
      const newData = { ...currentData, calcState };
      await database.write(async () => {
        await rec.update((m) => { m.data = JSON.stringify(newData); });
      });
      pushMeasurementsToCloud();
    } catch (e) { console.warn('[Measurement] calcState update error:', e); }
  }, [pushMeasurementsToCloud]);

  // Actualizar campos genéricos de data (points, totalPx, totalReal, closed) — persiste cambios de edición
  const updateMeasurementData = useCallback(async (dbId: string, patch: Record<string, any>) => {
    try {
      const rec = await planMeasurementsCollection.find(dbId);
      const currentData = JSON.parse(rec.data || '{}');
      const newData = { ...currentData, ...patch };
      await database.write(async () => {
        await rec.update((m) => { m.data = JSON.stringify(newData); });
      });
      pushMeasurementsToCloud();
    } catch (e) { console.warn('[Measurement] data update error:', e); }
  }, [pushMeasurementsToCloud]);

  // Leer calcState guardado dado un dbId
  const loadCalcState = useCallback(async (dbId: string): Promise<{ bricks?: any; volume?: any } | null> => {
    try {
      const rec = await planMeasurementsCollection.find(dbId);
      const d = JSON.parse(rec.data || '{}');
      return d.calcState || null;
    } catch { return null; }
  }, []);

  // ── Imprimir / exportar plano con anotaciones como PDF ──
  const startPrint = useCallback(() => {
    if (exporting) return;
    setExporting(true);
    sendCmd({ cmd: 'exportPlanImage' });
  }, [exporting, sendCmd]);

  const handleExportedImage = useCallback(async (dataURL: string, width: number, height: number) => {
    try {
      // Página A4 landscape si el plano es horizontal, portrait si es vertical
      const isLandscape = width >= height;
      const pageCss = isLandscape ? '@page { size: A4 landscape; margin: 0 }' : '@page { size: A4 portrait; margin: 0 }';
      const html = `
        <html>
        <head>
          <meta charset="utf-8" />
          <style>
            ${pageCss}
            html, body { margin:0; padding:0; background:#fff; }
            .wrap { width:100vw; height:100vh; display:flex; align-items:center; justify-content:center; }
            img { max-width:100%; max-height:100%; display:block; }
            .footer { position:fixed; bottom:6px; left:12px; font-family:sans-serif; font-size:10px; color:#555; }
          </style>
        </head>
        <body>
          <div class="wrap"><img src="${dataURL}" /></div>
          <div class="footer">${planName} · ${new Date().toLocaleString('es-PE')}</div>
        </body>
        </html>
      `;
      const safeName = planName.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'plano';
      const result = await Print.printToFileAsync({ html, base64: false });
      // Mover a un nombre más amigable
      const finalUri = `${FileSystem.cacheDirectory}${safeName}_${Date.now()}.pdf`;
      await FileSystem.moveAsync({ from: result.uri, to: finalUri }).catch(() => {});
      const outUri = finalUri;
      setExporting(false);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(outUri, { mimeType: 'application/pdf', dialogTitle: t('measurement.print.shareTitle') });
      } else {
        Alert.alert(t('measurement.print.generatedTitle'), outUri);
      }
    } catch (e: any) {
      setExporting(false);
      Alert.alert(t('measurement.print.errorTitle'), e?.message || t('measurement.print.errorMsg'));
    }
  }, [planName]);

  // Eliminar medición de la DB (además del WebView)
  const deleteMeasurementById = useCallback(async (dbId: string) => {
    try {
      const rec = await planMeasurementsCollection.find(dbId);
      // Propagar el delete a Supabase ANTES del destroyPermanently local. Si no hay red,
      // el delete remoto fallará silenciosamente — al menos no quedará huérfano en local.
      supabase.from('plan_measurements').delete().eq('id', dbId)
        .then(({ error }) => { if (error) console.warn('[Measurement] remote delete failed:', error); });
      await database.write(async () => {
        await rec.destroyPermanently();
      });
    } catch (e) { console.warn('[Measurement] delete error:', e); }
  }, []);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      if (msg.type === 'pageLoaded') {
        setWebReady(true);
      }

      if (msg.type === 'scaleChanged') setCurrentScale(msg.scale);

      if (msg.type === 'calibrationLineCreated') {
        setCalibrationLineId(msg.id);
        setActiveTool('pan');
        setTimeout(() => setShowCalibrationInput(true), 300);
      }

      if (msg.type === 'calibrationDone') {
        setIsCalibrated(true);
        setShowCalibrationInput(false);
        setActiveTool('pan');
        savedCalibrationScale.current = msg.calScale;
        // Guardar calibración en DB
        saveMeasurement('calibration', { ax: msg.ax, ay: msg.ay, bx: msg.bx, by: msg.by, distPx: msg.distPx, distReal: msg.distReal }, msg.calScale)
          .then((dbId) => { if (dbId && msg.id) sendCmd({ cmd: 'setDbId', kind: 'calibration', webId: msg.id, dbId }); });
      }

      if (msg.type === 'measureLineCreated') {
        setLastMeasure(msg.dist);
        setMeasureCount((c) => c + 1);
        setTotalDist((t) => t + msg.dist);
        setActiveTool('pan');
        if (typeof msg.dist === 'number') addRecentCalc(msg.dist, fmtM(msg.dist));
        // Guardar línea en DB
        saveMeasurement('line', { ax: msg.ax, ay: msg.ay, bx: msg.bx, by: msg.by, distPx: msg.distPx, distReal: msg.dist }, savedCalibrationScale.current)
          .then((dbId) => { if (dbId && msg.id) sendCmd({ cmd: 'setDbId', kind: 'line', webId: msg.id, dbId }); });
      }

      if (msg.type === 'endpointEditDone') {
        setActiveTool('pan');
      }

      if (msg.type === 'toolChanged') {
        setActiveTool(msg.tool as any);
      }

      if (msg.type === 'areaCreated') {
        setLastArea({ area: msg.area, perimeter: msg.perimeter });
        setActiveTool('pan');
        if (typeof msg.area === 'number') addRecentCalc(msg.area, fmtArea(msg.area));
        // Guardar polígono en DB
        saveMeasurement('polygon', { points: msg.points, areaPx: msg.areaPx, areaReal: msg.area, perimPx: msg.perimPx, perimReal: msg.perimeter }, savedCalibrationScale.current)
          .then((dbId) => { if (dbId && msg.id) sendCmd({ cmd: 'setDbId', kind: 'polygon', webId: msg.id, dbId }); });
      }

      if (msg.type === 'areaUpdated') {
        setLastArea({ area: msg.area, perimeter: msg.perimeter });
      }

      if (msg.type === 'polylineCreated') {
        setSelectedElement({ kind: 'polyline', dist: msg.dist, area: msg.area });
        setActiveTool('pan');
        if (typeof msg.dist === 'number') addRecentCalc(msg.dist, fmtM(msg.dist));
        if (msg.closed && typeof msg.area === 'number' && msg.area > 0) addRecentCalc(msg.area, fmtArea(msg.area));
        saveMeasurement('polyline', { points: msg.points, totalPx: msg.totalPx, totalReal: msg.dist, closed: !!msg.closed }, savedCalibrationScale.current)
          .then((dbId) => {
            if (dbId && msg.id) {
              sendCmd({ cmd: 'setDbId', kind: 'polyline', webId: msg.id, dbId });
              // Actualizar selectedElement con el dbId nuevo para habilitar Ladrillos/Volumen al toque
              setSelectedElement((prev) => prev && prev.kind === 'polyline' ? { ...prev, dbId } as any : prev);
            }
          });
      }

      if (msg.type === 'anglesToggled') {
        setAnglesVisible(msg.show);
      }

      if (msg.type === 'areaToggled') {
        setAreaVisible(msg.show);
      }

      if (msg.type === 'snapToggled') {
        setSnapVisible(msg.show);
      }

      if (msg.type === 'exportedImage') {
        handleExportedImage(msg.dataURL, msg.width, msg.height);
      }

      if (msg.type === 'deleteVertexModeChanged') {
        setDeleteVertexMode(!!msg.enabled);
      }

      if (msg.type === 'addVertexModeChanged') {
        setAddVertexMode(!!msg.enabled);
      }

      if (
        msg.type === 'polylineVertexRemoved' ||
        msg.type === 'polylineReopened' ||
        msg.type === 'polylineVertexInserted' ||
        msg.type === 'polylineVertexAppended' ||
        msg.type === 'polylineClosedFromSelection'
      ) {
        const newArea: number | undefined = typeof msg.area === 'number' ? msg.area : undefined;
        const newPerim: number | undefined = typeof msg.totalReal === 'number' ? msg.totalReal : undefined;
        const closedOverride =
          msg.type === 'polylineReopened' ? false :
          msg.type === 'polylineVertexAppended' ? !!msg.closed :
          msg.type === 'polylineClosedFromSelection' ? true :
          undefined;

        // Recalcular calcStates guardados (ladrillos, volumen, locetas) con el nuevo area/perímetro
        setSelectedElement((prev) => {
          if (!prev || prev.kind !== 'polyline') return prev;
          const nextElem: typeof prev = { ...prev, dist: msg.totalReal, area: newArea };
          const cs = prev.calcState;
          if (cs) {
            const updated: any = {};
            if (cs.bricks) {
              const b = cs.bricks;
              const wallArea = b.heightM != null ? (newPerim ?? 0) * b.heightM : (newArea ?? 0);
              const base = wallArea * (b.perM2 || 0);
              const totalBricks = Math.ceil(base * (1 + (b.wastePct || 0) / 100));
              updated.bricks = { ...b, wallArea, totalBricks };
            }
            if (cs.volume) {
              const v = cs.volume;
              const totalM3 = (newArea ?? 0) * (v.heightM || 0);
              updated.volume = { ...v, totalM3 };
            }
            if (cs.tiles) {
              const t = cs.tiles;
              const floorArea = newArea ?? 0;
              const base = floorArea * (t.perM2 || 0);
              const totalTiles = Math.ceil(base * (1 + (t.wastePct || 0) / 100));
              updated.tiles = { ...t, floorArea, totalTiles };
            }
            nextElem.calcState = { ...cs, ...updated };
          }
          return nextElem;
        });

        // Persistir cambios (puntos + totales + calcStates recalculados)
        if (msg.dbId) {
          // Lee el calcState guardado y reescribe con los recálculos
          (async () => {
            try {
              const rec = await planMeasurementsCollection.find(msg.dbId);
              const currentData = JSON.parse(rec.data || '{}');
              const cs = currentData.calcState;
              let newCalcState = cs;
              if (cs) {
                newCalcState = { ...cs };
                if (cs.bricks) {
                  const b = cs.bricks;
                  const wallArea = b.heightM != null ? (newPerim ?? 0) * b.heightM : (newArea ?? 0);
                  const base = wallArea * (b.perM2 || 0);
                  newCalcState.bricks = { ...b, wallArea, totalBricks: Math.ceil(base * (1 + (b.wastePct || 0) / 100)) };
                }
                if (cs.volume) {
                  newCalcState.volume = { ...cs.volume, totalM3: (newArea ?? 0) * (cs.volume.heightM || 0) };
                }
                if (cs.tiles) {
                  const t = cs.tiles;
                  const floorArea = newArea ?? 0;
                  const base = floorArea * (t.perM2 || 0);
                  newCalcState.tiles = { ...t, floorArea, totalTiles: Math.ceil(base * (1 + (t.wastePct || 0) / 100)) };
                }
              }
              const newData = {
                ...currentData,
                points: msg.points,
                totalPx: msg.totalPx,
                totalReal: msg.totalReal,
                ...(closedOverride !== undefined ? { closed: closedOverride } : {}),
                ...(newCalcState ? { calcState: newCalcState } : {}),
              };
              await database.write(async () => {
                await rec.update((m) => { m.data = JSON.stringify(newData); });
              });
            } catch (e) { console.warn('[Measurement] recalc update error:', e); }
          })();
        }
      }

      if (msg.type === 'vertexTappedForDelete') {
        if (!msg.canDelete) {
          Alert.alert(t('measurement.deleteNode.cannotTitle'), t('measurement.deleteNode.cannotMsg'));
          return;
        }
        Alert.alert(
          t('measurement.deleteNode.title'),
          t('measurement.deleteNode.msg'),
          [
            { text: t('measurement.common.cancel'), style: 'cancel' },
            {
              text: t('measurement.common.delete'),
              style: 'destructive',
              onPress: () => sendCmd({ cmd: 'removeVertexAt', index: msg.index }),
            },
          ]
        );
      }

      if (msg.type === 'exportError') {
        setExporting(false);
        Alert.alert(t('measurement.export.errorTitle'), msg.message || t('measurement.export.errorMsg'));
      }

      if (msg.type === 'elementSelected') {
        setSelectedElement({ kind: msg.kind, dist: msg.dist, area: msg.area, perimeter: msg.perimeter, elemType: msg.elemType, elemId: msg.elemId, dbId: msg.dbId || null, calcState: null });
        if (msg.dbId) {
          loadCalcState(msg.dbId).then((cs) => {
            setSelectedElement((prev) => prev && prev.elemId === msg.elemId ? { ...prev, calcState: cs } : prev);
          });
        }
      }

      if (msg.type === 'calibrationLost') {
        setIsCalibrated(false);
      }

      if (msg.type === 'elementDeselected') {
        setSelectedElement(null);
      }

      if (msg.type === 'error') setError(msg.message);

    } catch {}
  }, []);

  // Tool actions
  const selectTool = (t: 'pan' | 'calibrate' | 'measure' | 'polyline' | 'sketch') => {
    if ((t === 'measure' || t === 'polyline' || t === 'sketch') && !isCalibrated) {
      Alert.alert(tx('measurement.noCal.title'), tx('measurement.noCal.msg'));
      return;
    }
    setActiveTool(t);
    setSelectedElement(null);
    sendCmd({ cmd: 'setTool', tool: t });
  };

  const confirmCalibration = () => {
    const val = parseFloat(calibrationInput.replace(',', '.'));
    if (isNaN(val) || val <= 0 || !calibrationLineId) {
      Alert.alert(t('measurement.invalid.title'), t('measurement.invalid.msg'));
      return;
    }
    const factor = calibrationUnit === 'mm' ? 0.001 : calibrationUnit === 'cm' ? 0.01 : 1;
    const realMeters = val * factor;
    sendCmd({ cmd: 'confirmCalibration', lineId: calibrationLineId, realMeters });
    setCalibrationInput('');
  };

  const cancelCalibration = () => {
    if (calibrationLineId) sendCmd({ cmd: 'deleteLine', lineId: calibrationLineId });
    setShowCalibrationInput(false);
    setCalibrationLineId(null);
    setActiveTool('pan');
    sendCmd({ cmd: 'setTool', tool: 'pan' });
  };

  const clearMeasurements = async () => {
    sendCmd({ cmd: 'clearMeasurements' });
    setLastMeasure(null);
    setMeasureCount(0);
    setTotalDist(0);
    setLastArea(null);
    // Borrar mediciones (no calibración) de la DB
    try {
      const toDelete = await planMeasurementsCollection
        .query(Q.where('plan_id', planId), Q.where('type', Q.notEq('calibration')))
        .fetch();
      if (toDelete.length > 0) {
        await database.write(async () => {
          await database.batch(toDelete.map((m) => m.prepareDestroyPermanently()));
        });
      }
    } catch {}
  };

  // ── Render ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader title={t('measurement.header.title')} onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{t('measurement.loading')}</Text>
        </View>
      </View>
    );
  }

  if (error || !pdfBase64) {
    return (
      <View style={styles.container}>
        <AppHeader title={t('measurement.header.title')} onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error || t('measurement.loadError')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader
        title={planName}
        subtitle={t('measurement.header.title')}
        onBack={() => navigation.goBack()}
        rightContent={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <TouchableOpacity
              ref={printStep.ref}
              onLayout={printStep.onLayout}
              onPress={startPrint}
              disabled={exporting}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {exporting
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Ionicons name="print-outline" size={22} color={Colors.white} />}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => jumpToStep('measurement_pan')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Toolbar */}
      <View style={styles.toolbar}>
        {showCalibrationInput ? (
          <View style={styles.calRow}>
            <Text style={styles.calLabel}>{t('measurement.cal.realMeasure')}</Text>
            <TextInput
              style={styles.calInput}
              placeholder={t('measurement.cal.placeholder')}
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              maxLength={6}
              value={calibrationInput}
              onChangeText={setCalibrationInput}
            />
            <View style={styles.unitDropdownWrap}>
              <TouchableOpacity
                style={styles.unitDropdown}
                onPress={() => setShowUnitDropdown((v) => !v)}
                activeOpacity={0.7}
              >
                <Text style={styles.unitDropdownText}>{calibrationUnit}</Text>
                <Ionicons name={showUnitDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textSecondary} />
              </TouchableOpacity>
              {showUnitDropdown && (
                <View style={styles.unitDropdownMenu}>
                  {(['m', 'cm', 'mm'] as const).map((u) => (
                    <TouchableOpacity
                      key={u}
                      style={[styles.unitDropdownItem, calibrationUnit === u && styles.unitDropdownItemActive]}
                      onPress={() => { setCalibrationUnit(u); setShowUnitDropdown(false); }}
                    >
                      <Text style={[styles.unitDropdownItemText, calibrationUnit === u && styles.unitDropdownItemTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            <View style={styles.calSeparator} />
            <TouchableOpacity style={styles.okBtn} onPress={confirmCalibration}>
              <Ionicons name="checkmark" size={18} color={Colors.success} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtnBox} onPress={cancelCalibration}>
              <Ionicons name="close" size={16} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.toolbarRow}>
            {/* Pan */}
            <View ref={pan.ref} onLayout={pan.onLayout} style={styles.toolSlot}>
              <TouchableOpacity style={[styles.toolIcon, activeTool === 'pan' && styles.toolIconActive]}
                onPress={() => selectTool('pan')}>
                <Ionicons name="hand-left-outline" size={20} color={activeTool === 'pan' ? Colors.white : Colors.navy} />
              </TouchableOpacity>
              <Text style={styles.toolLabel}>{t('measurement.tool.pan')}</Text>
            </View>
            {/* Calibrate */}
            <View ref={calibrate.ref} onLayout={calibrate.onLayout} style={styles.toolSlot}>
              <TouchableOpacity style={[styles.toolIcon, activeTool === 'calibrate' && styles.toolIconActive, isCalibrated && styles.toolIconCalibrated]}
                onPress={() => selectTool('calibrate')}>
                <MaterialCommunityIcons name="scale-balance" size={20} color={activeTool === 'calibrate' ? Colors.white : (isCalibrated ? Colors.success : Colors.navy)} />
              </TouchableOpacity>
              <Text style={styles.toolLabel}>{t('measurement.tool.calibrate')}</Text>
            </View>
            {/* Measure */}
            <View ref={measure.ref} onLayout={measure.onLayout} style={styles.toolSlot}>
              <TouchableOpacity style={[styles.toolIcon, activeTool === 'measure' && styles.toolIconActive, !isCalibrated && styles.toolDisabled]}
                onPress={() => selectTool('measure')} disabled={!isCalibrated}>
                <MaterialCommunityIcons name="vector-line" size={20} color={activeTool === 'measure' ? Colors.white : Colors.navy} />
              </TouchableOpacity>
              <Text style={styles.toolLabel}>{t('measurement.tool.measure')}</Text>
            </View>
            {/* Polyline */}
            <View ref={polyline.ref} onLayout={polyline.onLayout} style={styles.toolSlot}>
              <TouchableOpacity style={[styles.toolIcon, activeTool === 'polyline' && styles.toolIconActive, !isCalibrated && styles.toolDisabled]}
                onPress={() => selectTool('polyline')} disabled={!isCalibrated}>
                <MaterialCommunityIcons name="chart-timeline-variant" size={20} color={activeTool === 'polyline' ? Colors.white : Colors.navy} />
              </TouchableOpacity>
              <Text style={styles.toolLabel}>{t('measurement.tool.path')}</Text>
            </View>
            {/* Sketch (dibujo libre) */}
            <View ref={sketch.ref} onLayout={sketch.onLayout} style={styles.toolSlot}>
              <TouchableOpacity style={[styles.toolIcon, activeTool === 'sketch' && styles.toolIconActive, !isCalibrated && styles.toolDisabled]}
                onPress={() => selectTool('sketch')} disabled={!isCalibrated}>
                <MaterialCommunityIcons name="draw" size={20} color={activeTool === 'sketch' ? Colors.white : Colors.navy} />
              </TouchableOpacity>
              <Text style={styles.toolLabel}>{t('measurement.tool.sketch')}</Text>
            </View>

            {/* Separador + Toggles Área/Ángulos (derecha) */}
            <View style={[styles.separator, { marginLeft: 'auto' }]} />

            <View style={styles.toolSlot}>
              <TouchableOpacity
                ref={areaToggleRef}
                style={[styles.toolIcon, areaVisible && styles.toolIconActive]}
                onPress={() => sendCmd({ cmd: 'toggleArea' })}
              >
                <View style={styles.areaIconWrap}>
                  <MaterialCommunityIcons name="vector-square" size={22} color={areaVisible ? Colors.white : Colors.navy} />
                  <Text style={[styles.areaIconLetter, { color: areaVisible ? Colors.white : Colors.navy, fontSize: 9 }]}>A</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.toolLabel}>{t('measurement.tool.area')}</Text>
            </View>
            <View style={styles.toolSlot}>
              <TouchableOpacity
                ref={anglesToggleRef}
                style={[styles.toolIcon, anglesVisible && styles.toolIconActive]}
                onPress={() => sendCmd({ cmd: 'toggleAngles' })}
              >
                <View style={styles.areaIconWrap}>
                  <MaterialCommunityIcons name="angle-acute" size={22} color={anglesVisible ? Colors.white : Colors.navy} />
                  <Text style={[styles.angleIconDeg, { color: anglesVisible ? Colors.white : Colors.navy }]}>°</Text>
                  <Text style={[styles.angleIconTheta, { color: anglesVisible ? Colors.white : Colors.navy }]}>θ</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.toolLabel}>{t('measurement.tool.angles')}</Text>
            </View>
          </View>
        )}
      </View>


      {/* Info del elemento seleccionado */}
      {selectedElement && !showCalibrationInput && (
        <View style={styles.selectionBar}>
          {/* ── Carrusel informativo (izquierda) ─────────────────────── */}
          <SelectionInfoCarousel selectedElement={selectedElement} />

          {/* ── Acciones fijas (derecha) ─────────────────────────────── */}
          <View style={styles.selectionActions}>
            {selectedElement.kind === 'polyline' && (
              <>
                {/* Toggle añadir vértice */}
                <TouchableOpacity
                  style={[
                    styles.actionBtnSuccess,
                    { borderColor: '#7b1fa2' },
                    addVertexMode && { backgroundColor: '#7b1fa2' },
                  ]}
                  onPress={() => {
                    const next = !addVertexMode;
                    setAddVertexMode(next);
                    sendCmd({ cmd: 'toggleAddVertexMode', enabled: next });
                    if (next && deleteVertexMode) setDeleteVertexMode(false);
                  }}
                >
                  <View style={styles.vertexPlusWrap}>
                    <View style={[styles.vertexCircle, { borderColor: addVertexMode ? Colors.white : '#7b1fa2' }]} />
                    <Ionicons name="add" size={13} color={addVertexMode ? Colors.white : '#7b1fa2'} style={styles.vertexPlusSup} />
                  </View>
                </TouchableOpacity>
                {/* Toggle eliminar nodo */}
                <TouchableOpacity
                  style={[
                    styles.actionBtnSuccess,
                    { borderColor: Colors.danger },
                    deleteVertexMode && { backgroundColor: Colors.danger },
                  ]}
                  onPress={() => {
                    const next = !deleteVertexMode;
                    setDeleteVertexMode(next);
                    sendCmd({ cmd: 'toggleDeleteVertexMode', enabled: next });
                  }}
                >
                  <View style={styles.vertexPlusWrap}>
                    <View style={[styles.vertexCircle, { borderColor: deleteVertexMode ? Colors.white : Colors.danger }]} />
                    <Ionicons name="remove" size={13} color={deleteVertexMode ? Colors.white : Colors.danger} style={styles.vertexPlusSup} />
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtnWarning} onPress={() => sendCmd({ cmd: 'removeLastVertex' })}>
                  <MaterialCommunityIcons name="undo-variant" size={16} color={Colors.warning} />
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.cancelBtnBox} onPress={() => {
              const doDelete = () => {
                const dbIdToDelete = selectedElement.dbId;
                sendCmd({ cmd: 'deleteSelected' });
                setSelectedElement(null);
                if (dbIdToDelete) deleteMeasurementById(dbIdToDelete);
              };
              if (selectedElement.kind === 'polyline') {
                Alert.alert(
                  t('measurement.deletePath.title'),
                  t('measurement.deletePath.msg'),
                  [
                    { text: t('measurement.common.cancel'), style: 'cancel' },
                    { text: t('measurement.common.delete'), style: 'destructive', onPress: doDelete },
                  ]
                );
              } else {
                doDelete();
              }
            }}>
              <Ionicons name="trash-outline" size={15} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        </View>
      )}


      {/* WebView */}
      <View style={styles.webArea}>
        <WebView
          ref={webRef}
          source={{ html: buildHtml(pdfBase64) }}
          style={StyleSheet.absoluteFill}
          onMessage={handleMessage}
          javaScriptEnabled domStorageEnabled allowFileAccess
          originWhitelist={['*']}
          scrollEnabled={false} bounces={false}
          overScrollMode="never"
          setBuiltInZoomControls={false}
          setDisplayZoomControls={false}
        />
        {/* FABs: cálculo de ladrillos, volumen y locetas (ocultos cuando la calculadora está abierta) */}
        {!calcOpen && (
          <>
            <TouchableOpacity
              ref={fabBricksRef}
              style={[styles.calcFab, styles.calcFabBricks]}
              onPress={() => {
                if (!selectedElement || (selectedElement.kind !== 'polyline' && selectedElement.kind !== 'polygon')) {
                  Alert.alert(t('measurement.selectFirst.title'), t('measurement.selectFirst.bricks'));
                  return;
                }
                setShowBrickModal(true);
              }}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="wall" size={22} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity
              ref={fabVolumeRef}
              style={[styles.calcFab, styles.calcFabVolume]}
              onPress={() => {
                if (!selectedElement || (selectedElement.kind !== 'polyline' && selectedElement.kind !== 'polygon')) {
                  Alert.alert(t('measurement.selectFirst.title'), t('measurement.selectFirst.volume'));
                  return;
                }
                setShowVolumeModal(true);
              }}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="cube-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity
              ref={fabTilesRef}
              style={[styles.calcFab, styles.calcFabTiles]}
              onPress={() => {
                if (!selectedElement || (selectedElement.kind !== 'polyline' && selectedElement.kind !== 'polygon')) {
                  Alert.alert(t('measurement.selectFirst.title'), t('measurement.selectFirst.tiles'));
                  return;
                }
                setShowTileModal(true);
              }}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="checkerboard" size={22} color={Colors.white} />
            </TouchableOpacity>
          </>
        )}

        {/* Calculadora flotante (renderizada al final para quedar por encima) */}
        <FloatingCalculator fabRef={fabCalcRef} onOpenChange={setCalcOpen} recentValues={recentCalcValues} />
        {/* Acciones de polilínea flotantes sobre el plano */}
        {!showCalibrationInput && activeTool === 'polyline' && (
          <View style={styles.secondaryPillFloat} pointerEvents="box-none">
            <View style={styles.secondaryPill}>
              <View style={styles.toolSlot}>
                <TouchableOpacity style={styles.actionBtnWarning} onPress={() => sendCmd({ cmd: 'removeLastVertex' })}>
                  <MaterialCommunityIcons name="undo-variant" size={18} color={Colors.warning} />
                </TouchableOpacity>
                <Text style={styles.toolLabel}>{t('measurement.polyline.back')}</Text>
              </View>
              <View style={styles.toolSlot}>
                <TouchableOpacity style={styles.actionBtnSuccess} onPress={() => sendCmd({ cmd: 'finishPolyline' })}>
                  <Ionicons name="checkmark" size={18} color={Colors.success} />
                </TouchableOpacity>
                <Text style={styles.toolLabel}>{t('measurement.polyline.done')}</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Instructions */}
      <View style={styles.instructionBar}>
        <Text style={styles.instructionText}>
          {activeTool === 'pan' && t('measurement.instr.pan')}
          {activeTool === 'calibrate' && t('measurement.instr.calibrate')}
          {activeTool === 'measure' && t('measurement.instr.measure')}
          {activeTool === 'polyline' && t('measurement.instr.polyline')}
          {activeTool === 'sketch' && t('measurement.instr.sketch')}
        </Text>
      </View>

      {/* Modal: Ladrillos */}
      {selectedElement && (selectedElement.kind === 'polyline' || selectedElement.kind === 'polygon') && (
        <BrickCalculatorModal
          visible={showBrickModal}
          kind={selectedElement.kind as 'polyline' | 'polygon'}
          perimeter={selectedElement.kind === 'polyline' ? selectedElement.dist : selectedElement.perimeter}
          area={selectedElement.kind === 'polygon' ? selectedElement.area : undefined}
          initialState={selectedElement.calcState?.bricks as BrickCalcState | undefined}
          onClose={() => setShowBrickModal(false)}
          onSave={async (state) => {
            if (selectedElement.dbId) {
              await updateMeasurementCalcState(selectedElement.dbId, { bricks: state });
              setSelectedElement((prev) => prev ? { ...prev, calcState: { ...(prev.calcState || {}), bricks: state } } : prev);
            }
            addRecentCalc(state.totalBricks, t('measurement.recent.bricks', { count: state.totalBricks }));
            setShowBrickModal(false);
          }}
        />
      )}

      {/* Modal: Volumen */}
      {selectedElement && (selectedElement.kind === 'polyline' || selectedElement.kind === 'polygon') && (
        <VolumeCalculatorModal
          visible={showVolumeModal}
          kind={selectedElement.kind as 'polyline' | 'polygon'}
          perimeter={selectedElement.kind === 'polyline' ? selectedElement.dist : undefined}
          area={selectedElement.area}
          initialState={selectedElement.calcState?.volume as VolumeCalcState | undefined}
          onClose={() => setShowVolumeModal(false)}
          onSave={async (state) => {
            if (selectedElement.dbId) {
              await updateMeasurementCalcState(selectedElement.dbId, { volume: state });
              setSelectedElement((prev) => prev ? { ...prev, calcState: { ...(prev.calcState || {}), volume: state } } : prev);
            }
            addRecentCalc(state.totalM3, `${state.totalM3.toFixed(2)} m³`);
            setShowVolumeModal(false);
          }}
        />
      )}

      {/* Modal: Locetas */}
      {selectedElement && (selectedElement.kind === 'polyline' || selectedElement.kind === 'polygon') && (
        <TileCalculatorModal
          visible={showTileModal}
          area={selectedElement.area}
          initialState={selectedElement.calcState?.tiles as TileCalcState | undefined}
          onClose={() => setShowTileModal(false)}
          onSave={async (state) => {
            if (selectedElement.dbId) {
              await updateMeasurementCalcState(selectedElement.dbId, { tiles: state });
              setSelectedElement((prev) => prev ? { ...prev, calcState: { ...(prev.calcState || {}), tiles: state } } : prev);
            }
            addRecentCalc(state.totalTiles, t('measurement.recent.tiles', { count: state.totalTiles }));
            setShowTileModal(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: Colors.textSecondary, fontSize: 13 },
  errorText: { color: Colors.danger, fontSize: 14, textAlign: 'center', padding: 24 },

  toolbar: { backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, ...Shadow.card, zIndex: 50, overflow: 'visible' },
  toolbarRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  secondaryPillFloat: {
    position: 'absolute', top: 8, right: 12, zIndex: 40,
  },
  secondaryPill: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.white, borderRadius: Radius.md,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.card,
  },
  toolSlot: { alignItems: 'center', gap: 2 },
  toolLabel: { fontSize: 9, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' },
  toolIcon: { width: 30, height: 30, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  toolIconActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  toolIconCalibrated: { borderColor: Colors.success, borderWidth: 2 },
  toolDisabled: { opacity: 0.3 },
  separator: { width: 1, height: 26, backgroundColor: Colors.border, marginHorizontal: 4, marginTop: 2 },
  zoomBadge: { backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 'auto' },
  zoomBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.navy },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  calRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  calLabel: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  calInput: {
    width: 90, height: 30, backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingHorizontal: 8, paddingVertical: 0, fontSize: 14, fontWeight: '700',
    borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
    textAlign: 'center',
  },
  unitDropdownWrap: { position: 'relative', zIndex: 100 },
  unitDropdown: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, height: 30, minWidth: 72,
  },
  unitDropdownText: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  unitDropdownMenu: {
    position: 'absolute', top: 34, left: 0, right: 0,
    backgroundColor: Colors.white, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.card,
    zIndex: 200, elevation: 20,
  },
  unitDropdownItem: { paddingHorizontal: 12, paddingVertical: 9 },
  unitDropdownItemActive: { backgroundColor: Colors.surface },
  unitDropdownItemText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  unitDropdownItemTextActive: { color: Colors.primary, fontWeight: '700' },
  calSeparator: { width: 1, height: 22, backgroundColor: Colors.border, marginLeft: 'auto', marginHorizontal: 4 },
  okBtn: {
    borderWidth: 1.5, borderColor: Colors.success, borderRadius: Radius.md,
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
  },
  okBtnText: { color: Colors.success, fontWeight: '700', fontSize: 13 },
  cancelBtnBox: {
    borderWidth: 1.5, borderColor: Colors.danger, borderRadius: Radius.md,
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
  },

  selectionBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: Colors.border, ...Shadow.card,
  },
  selectionActions: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    flexShrink: 0, // nunca se recorta con el carrusel
  },
  selectionValue: { fontSize: 14, fontWeight: '700', color: '#2e7d32' },
  areaIconWrap: { alignItems: 'center', justifyContent: 'center' },
  areaIconLetter: {
    position: 'absolute', fontSize: 9, fontWeight: '900',
    textAlign: 'center', includeFontPadding: false,
  },
  angleIconTheta: {
    position: 'absolute', fontSize: 8, fontWeight: '700',
    includeFontPadding: false, right: 3, bottom: 7,
  },
  angleIconDeg: {
    position: 'absolute', fontSize: 8, fontWeight: '900',
    includeFontPadding: false, right: 0, bottom: 10,
  },
  selectionSubtext: { fontSize: 13, fontWeight: '600', color: '#1976d2' },
  vertexPlusWrap: { width: 18, height: 18, position: 'relative' },
  vertexCircle: {
    position: 'absolute', left: 2, bottom: 2,
    width: 9, height: 9, borderRadius: 5,
    borderWidth: 1.5, borderColor: '#7b1fa2', backgroundColor: 'transparent',
  },
  vertexPlusSup: { position: 'absolute', top: -2, right: -2 },
  calcChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: Radius.sm, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  calcChipText: { fontSize: 11, fontWeight: '700' },
  calcFab: {
    position: 'absolute', right: 12,
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    ...Shadow.card, zIndex: 60,
  },
  calcFabBricks: { bottom: 198, backgroundColor: Colors.danger },
  calcFabVolume: { bottom: 140, backgroundColor: '#1565c0' },
  calcFabTiles: { bottom: 82, backgroundColor: '#e67e22' },
  actionBtnSuccess: {
    borderWidth: 1.5, borderColor: Colors.success, borderRadius: Radius.md,
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
  },
  actionBtnWarning: {
    borderWidth: 1.5, borderColor: Colors.warning, borderRadius: Radius.md,
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
  },

  webArea: { flex: 1, backgroundColor: '#d0d0d0' },

  instructionBar: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  instructionText: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
});
