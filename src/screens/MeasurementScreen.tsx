import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, ActivityIndicator,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { plansCollection } from '@db/index';
import { Colors, Radius, Shadow } from '../theme/colors';
import AppHeader from '@components/AppHeader';

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
let tool='pan'; // pan | calibrate | measure | editEndpoint | area
let lines=[]; // {id, ax,ay, bx,by, distPx, distReal, isCalibration}
let polygons=[]; // {id, points:[{x,y}], areaPx, areaReal, perimPx, perimReal, closed}
let activePolygon=null; // polígono en construcción (no cerrado aún)
let calibrationScale=0; // px per meter (at baseScale)
let nextId=1;
let selectedPolyId=null;

// Drawing state
let dragging=false;
let drawConfirmed=false; // true once drag exceeds threshold (then it's a line, not pan)
let dragStartPdf={x:0,y:0};
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
  // Draw canvas at higher resolution than PDF for crisp arrows at any zoom
  const drawScale=renderScale; // same as PDF — balanced quality vs performance
  drawCanvas.width=vp.width*baseScale*drawScale; drawCanvas.height=vp.height*baseScale*drawScale;
  drawCanvas.style.width=pdfW+'px'; drawCanvas.style.height=pdfH+'px';
  container.style.width=pdfW+'px'; container.style.height=pdfH+'px';

  await pdfPage.render({canvasContext:pdfCtx, viewport:sv}).promise;
  scale=1; tx=0; ty=0; clampTx(); applyTransform();
  redraw();

  // Extraer paths vectoriales del PDF para detección de polígonos
  extractVectorPaths(pdfPage);

  msg({type:'pageLoaded', pages:pdfDoc.numPages, page:pageNum});
}

// ── Extracción de paths vectoriales ─────────────────────────────────
let vectorPolygons=[]; // [{points:[{x,y}]}] — polígonos cerrados detectados
let hasVectorData=false;

async function extractVectorPaths(page){
  vectorPolygons=[];
  hasVectorData=false;
  try{
    const ops=await page.getOperatorList();
    const vp=page.getViewport({scale:baseScale});

    // Recorrer operaciones del PDF y extraer líneas/paths
    let currentPath=[];
    let allPaths=[];
    let moveX=0, moveY=0; // último moveTo

    for(let i=0;i<ops.fnArray.length;i++){
      const fn=ops.fnArray[i];
      const args=ops.argsArray[i];

      // OPS: moveTo=13, lineTo=14, curveTo=15, closePath=18, rectangle=19
      // Transform coords: PDF coords → screen coords
      if(fn===13){ // moveTo
        if(currentPath.length>0) allPaths.push([...currentPath]);
        currentPath=[{x:args[0], y:args[1]}];
        moveX=args[0]; moveY=args[1];
      }
      else if(fn===14){ // lineTo
        currentPath.push({x:args[0], y:args[1]});
      }
      else if(fn===18){ // closePath
        if(currentPath.length>=3){
          currentPath.push({x:moveX, y:moveY}); // close back to start
          allPaths.push([...currentPath]);
        }
        currentPath=[];
      }
      else if(fn===19){ // rectangle(x, y, w, h)
        const rx=args[0], ry=args[1], rw=args[2], rh=args[3];
        allPaths.push([
          {x:rx, y:ry}, {x:rx+rw, y:ry}, {x:rx+rw, y:ry+rh}, {x:rx, y:ry+rh}, {x:rx, y:ry}
        ]);
      }
      // stroke/fill operations indicate the path is being used
      else if(fn===16||fn===17||fn===20||fn===21||fn===22){
        if(currentPath.length>0){ allPaths.push([...currentPath]); currentPath=[]; }
      }
    }
    if(currentPath.length>0) allPaths.push(currentPath);

    // Convertir coordenadas PDF → coordenadas de pantalla (baseScale)
    // PDF coords: origin bottom-left, Y up. Screen: origin top-left, Y down.
    const pageH=page.getViewport({scale:1}).height;

    // Filtrar solo polígonos cerrados (primer punto ≈ último punto) con área significativa
    for(const path of allPaths){
      if(path.length<4) continue; // mínimo triángulo + cierre
      const first=path[0], last=path[path.length-1];
      const isClosed=Math.abs(first.x-last.x)<0.5 && Math.abs(first.y-last.y)<0.5;
      if(!isClosed) continue;

      // Convertir coords
      const pts=path.slice(0,-1).map(p=>({
        x: p.x * baseScale,
        y: (pageH - p.y) * baseScale // flip Y
      }));

      // Filtrar polígonos muy pequeños (ruido)
      const area=calcPolygonArea(pts);
      if(area < 100) continue; // menos de 100px² es ruido

      vectorPolygons.push({points:pts});
    }

    hasVectorData=vectorPolygons.length>0;
    msg({type:'vectorDataDetected', count:vectorPolygons.length, hasData:hasVectorData});
  }catch(e){
    hasVectorData=false;
    msg({type:'vectorDataDetected', count:0, hasData:false});
  }
}

// Buscar el polígono vectorial que contiene un punto
function findVectorPolygonAt(px,py){
  // Buscar el polígono más pequeño que contenga el punto (más específico)
  let bestPoly=null;
  let bestArea=Infinity;
  for(const vp of vectorPolygons){
    if(pointInPolygon(px,py,vp.points)){
      const area=calcPolygonArea(vp.points);
      if(area<bestArea){ bestArea=area; bestPoly=vp; }
    }
  }
  return bestPoly;
}

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
  // Draw active (building) polygon
  if(activePolygon){ drawPolygon(activePolygon, r); }
}

function drawDimensionLine(ln, r, isPreview){
  const ax=ln.ax*r, ay=ln.ay*r, bx=ln.bx*r, by=ln.by*r;
  const dx=bx-ax, dy=by-ay;
  const len=Math.sqrt(dx*dx+dy*dy);
  if(len<2) return;
  const angle=Math.atan2(dy,dx);
  // Tamaño base reducido 20%, escala con pow 0.75, mínimo 20% del original
  const s=Math.max(0.2, 0.8/Math.pow(scale, 0.75));
  const arrowSize=12*r*s;
  const arrowAngle=0.45;
  const color=isPreview?'rgba(255,0,0,0.5)': (ln.isCalibration?'rgba(255,140,0,0.85)':'rgba(220,30,30,0.9)');
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
    // Background
    drawCtx.save();
    drawCtx.translate(mx,my);
    drawCtx.rotate(angle>Math.PI/2||angle<-Math.PI/2 ? angle+Math.PI : angle);
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
  const s=Math.max(0.2, 0.8/Math.pow(scale, 0.75));
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

// ── Lupa ────────────────────────────────────────────────────────────
const LOUPE_SIZE=140;
const LOUPE_ZOOM=3.6;
loupeCanvas.width=LOUPE_SIZE*2; loupeCanvas.height=LOUPE_SIZE*2;
loupeCanvas.style.width=LOUPE_SIZE+'px'; loupeCanvas.style.height=LOUPE_SIZE+'px';

function showLoupe(screenX, screenY, pdfPt){
  const lc=loupeCanvas;
  lc.style.display='block';
  // Position loupe above finger
  let lx=screenX-LOUPE_SIZE/2;
  let ly=screenY-LOUPE_SIZE-40;
  if(ly<10) ly=screenY+60; // flip below if too high
  if(lx<5) lx=5;
  if(lx+LOUPE_SIZE>window.innerWidth-5) lx=window.innerWidth-LOUPE_SIZE-5;
  lc.style.left=lx+'px'; lc.style.top=ly+'px';

  // Draw magnified portion from PDF canvas
  const r=pdfCanvas.width/pdfW; // ratio canvas px to CSS px
  const srcX=pdfPt.x*r - (LOUPE_SIZE)/(LOUPE_ZOOM);
  const srcY=pdfPt.y*r - (LOUPE_SIZE)/(LOUPE_ZOOM);
  const srcW=(LOUPE_SIZE*2)/LOUPE_ZOOM;
  const srcH=(LOUPE_SIZE*2)/LOUPE_ZOOM;

  loupeCtx.clearRect(0,0,LOUPE_SIZE*2,LOUPE_SIZE*2);

  // Clip to circle
  loupeCtx.save();
  loupeCtx.beginPath();
  loupeCtx.arc(LOUPE_SIZE,LOUPE_SIZE,LOUPE_SIZE-2,0,Math.PI*2);
  loupeCtx.clip();

  // Background
  loupeCtx.fillStyle='#fff';
  loupeCtx.fillRect(0,0,LOUPE_SIZE*2,LOUPE_SIZE*2);

  // PDF content magnified
  try{
    loupeCtx.drawImage(pdfCanvas, srcX,srcY,srcW,srcH, 0,0,LOUPE_SIZE*2,LOUPE_SIZE*2);
  }catch(e){}

  loupeCtx.restore();

  // Crosshair
  loupeCtx.strokeStyle='rgba(255,0,0,0.7)';
  loupeCtx.lineWidth=1;
  loupeCtx.beginPath();
  loupeCtx.moveTo(LOUPE_SIZE-15,LOUPE_SIZE); loupeCtx.lineTo(LOUPE_SIZE+15,LOUPE_SIZE);
  loupeCtx.moveTo(LOUPE_SIZE,LOUPE_SIZE-15); loupeCtx.lineTo(LOUPE_SIZE,LOUPE_SIZE+15);
  loupeCtx.stroke();

  // Center dot
  loupeCtx.beginPath();
  loupeCtx.arc(LOUPE_SIZE,LOUPE_SIZE,2.5,0,Math.PI*2);
  loupeCtx.fillStyle='red';
  loupeCtx.fill();

  // Border circle
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
  if(!selectedPolyId) return null;
  const poly=polygons.find(p=>p.id===selectedPolyId);
  if(!poly) return null;
  for(let i=0;i<poly.points.length;i++){
    if(dist(px,py,poly.points[i].x,poly.points[i].y)<threshold) return {polyId:poly.id, vertexIdx:i};
  }
  return null;
}
let editingVertex=null; // {polyId, vertexIdx}
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
    const pdfPt=screenToPdf(t.clientX,t.clientY);

    const hitThreshold=15/scale;

    // 1. Si hay polígono seleccionado, verificar si toca un vértice → editar
    if(selectedPolyId){
      const vt=findPolyVertexNear(pdfPt.x,pdfPt.y,hitThreshold);
      if(vt){
        editingVertex=vt;
        prevToolBeforeEdit=tool;
        tool='editEndpoint';
        dragging=true;
        drawConfirmed=true;
        dragCurrentPdf=pdfPt;
        showLoupe(t.clientX,t.clientY,pdfPt);
        return;
      }
    }

    // 2. Si hay línea seleccionada, verificar si toca un endpoint → editar
    if(selectedLineId){
      const ep=findEndpointNear(pdfPt.x,pdfPt.y,hitThreshold);
      if(ep){
        editingLine=ep;
        prevToolBeforeEdit=tool;
        tool='editEndpoint';
        dragging=true;
        drawConfirmed=true;
        dragCurrentPdf=pdfPt;
        showLoupe(t.clientX,t.clientY,pdfPt);
        return;
      }
    }

    if(tool==='calibrate'||tool==='measure'){
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
      dragCurrentPdf=pdfPt;
      showLoupe(t.clientX,t.clientY,pdfPt);
      redraw();
    } else if(dragging && tool==='editEndpoint' && editingLine){
      const ln=lines.find(l=>l.id===editingLine.lineId);
      if(ln){
        if(editingLine.endpoint==='a'){ln.ax=pdfPt.x; ln.ay=pdfPt.y;}
        else {ln.bx=pdfPt.x; ln.by=pdfPt.y;}
        ln.distPx=dist(ln.ax,ln.ay,ln.bx,ln.by);
        if(ln.isCalibration && ln.distReal>0){
          calibrationScale=ln.distPx/ln.distReal;
          recalcAllLines();
        } else if(calibrationScale>0){
          ln.distReal=ln.distPx/calibrationScale;
        }
        showLoupe(t.clientX,t.clientY,pdfPt);
        redraw();
      }
    } else if(dragging && tool==='editEndpoint' && editingVertex){
      const poly=polygons.find(p=>p.id===editingVertex.polyId);
      if(poly){
        poly.points[editingVertex.vertexIdx]={x:pdfPt.x, y:pdfPt.y};
        poly.areaPx=calcPolygonArea(poly.points);
        poly.perimPx=calcPolygonPerimeter(poly.points);
        if(calibrationScale>0){
          poly.areaReal=poly.areaPx/(calibrationScale*calibrationScale);
          poly.perimReal=poly.perimPx/calibrationScale;
        }
        showLoupe(t.clientX,t.clientY,pdfPt);
        redraw();
        msg({type:'areaUpdated', id:poly.id, area:poly.areaReal, perimeter:poly.perimReal});
      }
    } else if(tool==='pan' || tool==='area' || (!dragging && (tool==='calibrate'||tool==='measure'))){
      // Pan
      const p=prev[tList[0].identifier];
      if(p){ tx+=t.clientX-p.x; ty+=t.clientY-p.y; }
      clampTx(); applyTransform();
    }
  } else if(ids.length===2){
    // Pinch zoom
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

    if(tool==='calibrate'||tool==='measure'){
      if(!drawConfirmed){ dragging=false; hideLoupe(); for(let i=0;i<tList.length;i++) delete touches[tList[i].identifier]; return; }
      dragCurrentPdf=pdfPt;
      const d=dist(dragStartPdf.x,dragStartPdf.y,dragCurrentPdf.x,dragCurrentPdf.y);
      if(d>5/scale){ // Minimum line length
        const ln={
          id:nextId++,
          ax:dragStartPdf.x, ay:dragStartPdf.y,
          bx:dragCurrentPdf.x, by:dragCurrentPdf.y,
          distPx:d, distReal:0,
          isCalibration:tool==='calibrate'
        };
        if(tool==='calibrate'){
          lines=lines.filter(l=>!l.isCalibration);
          lines.push(ln);
          selectedLineId=ln.id; // Seleccionar la línea recién creada
          tool='pan';
          redraw();
          msg({type:'calibrationLineCreated', id:ln.id, distPx:ln.distPx});
        } else if(tool==='measure' && calibrationScale>0){
          ln.distReal=d/calibrationScale;
          lines.push(ln);
          selectedLineId=ln.id; // Seleccionar la línea recién creada
          tool='pan';
          redraw();
          msg({type:'measureLineCreated', id:ln.id, dist:ln.distReal});
        }
      }
      dragging=false;
    } else if(tool==='editEndpoint'){
      dragging=false;
      editingLine=null;
      editingVertex=null;
      tool=prevToolBeforeEdit;
      redraw();
      msg({type:'endpointEditDone'});
    }
    hideLoupe();
  } else if(isSingleTouch && !touchMoved && Object.keys(touches).length<=1){
    const t=tList[0];
    const pdfPt=screenToPdf(t.clientX,t.clientY);
    const tapThreshold=10/scale;

    if(tool==='area'){
      const now=Date.now();
      const isDoubleTap=now-lastTapTime<400 && dist(pdfPt.x,pdfPt.y,lastTapPos.x,lastTapPos.y)<20/scale;
      lastTapTime=now; lastTapPos={x:pdfPt.x,y:pdfPt.y};

      if(isDoubleTap && hasVectorData && !activePolygon){
        // Doble tap → buscar polígono vectorial en esa posición
        const vPoly=findVectorPolygonAt(pdfPt.x,pdfPt.y);
        if(vPoly){
          const poly={id:nextId++, points:[...vPoly.points], areaPx:0, areaReal:0, perimPx:0, perimReal:0, closed:true};
          poly.areaPx=calcPolygonArea(poly.points);
          poly.perimPx=calcPolygonPerimeter(poly.points);
          if(calibrationScale>0){
            poly.areaReal=poly.areaPx/(calibrationScale*calibrationScale);
            poly.perimReal=poly.perimPx/calibrationScale;
          }
          polygons.push(poly);
          selectedPolyId=poly.id;
          msg({type:'areaCreated', id:poly.id, area:poly.areaReal, perimeter:poly.perimReal});
          tool='pan';
          msg({type:'toolChanged', tool:'pan'});
        } else {
          msg({type:'vectorNotFound'});
        }
        redraw();
      } else if(!isDoubleTap){
        // Tap simple → agregar punto al polígono manual
        if(!activePolygon){
          activePolygon={id:nextId++, points:[{x:pdfPt.x,y:pdfPt.y}], areaPx:0, areaReal:0, perimPx:0, perimReal:0, closed:false};
        } else {
          const first=activePolygon.points[0];
          if(activePolygon.points.length>=3 && dist(pdfPt.x,pdfPt.y,first.x,first.y)<tapThreshold){
            activePolygon.closed=true;
            activePolygon.areaPx=calcPolygonArea(activePolygon.points);
            activePolygon.perimPx=calcPolygonPerimeter(activePolygon.points);
            if(calibrationScale>0){
              activePolygon.areaReal=activePolygon.areaPx/(calibrationScale*calibrationScale);
              activePolygon.perimReal=activePolygon.perimPx/calibrationScale;
            }
            polygons.push(activePolygon);
            selectedPolyId=activePolygon.id;
            msg({type:'areaCreated', id:activePolygon.id, area:activePolygon.areaReal, perimeter:activePolygon.perimReal});
            activePolygon=null;
            tool='pan';
            msg({type:'toolChanged', tool:'pan'});
          } else {
            activePolygon.points.push({x:pdfPt.x,y:pdfPt.y});
          }
        }
        redraw();
      }
    } else {
      // Tap sin movimiento → seleccionar/deseleccionar línea o polígono
      selectedLineId=null;
      selectedPolyId=null;

      const tappedLineId=findLineNear(pdfPt.x,pdfPt.y,tapThreshold);
      if(tappedLineId){
        selectedLineId=tappedLineId;
      } else {
        const tappedPolyId=findPolyNear(pdfPt.x,pdfPt.y);
        if(tappedPolyId) selectedPolyId=tappedPolyId;
      }
      redraw();
    }
  }

  for(let i=0;i<tList.length;i++) delete touches[tList[i].identifier];
  if(lastPinchDist>0) redraw();
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
      if(m.tool!=='area') activePolygon=null; // Cancel active polygon if switching away
      msg({type:'toolChanged', tool:tool});
      redraw();
    }
    if(m.cmd==='confirmCalibration'){
      const ln=lines.find(l=>l.id===m.lineId);
      if(ln){
        ln.distReal=m.realMeters;
        calibrationScale=ln.distPx/m.realMeters;
        recalcAllLines();
        redraw();
        tool='pan';
        msg({type:'calibrationDone', scale:calibrationScale});
      }
    }
    if(m.cmd==='deleteLine'){
      lines=lines.filter(l=>l.id!==m.lineId);
      if(m.lineId && lines.find(l=>l.isCalibration)===undefined){
        calibrationScale=0;
      }
      redraw();
    }
    if(m.cmd==='clearAll'){
      lines=[]; polygons=[]; activePolygon=null; calibrationScale=0; tool='pan';
      selectedLineId=null; selectedPolyId=null;
      dragging=false; editingLine=null; editingVertex=null; hideLoupe();
      redraw();
    }
    if(m.cmd==='clearMeasurements'){
      lines=lines.filter(l=>l.isCalibration);
      polygons=[]; activePolygon=null; selectedPolyId=null;
      redraw();
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

// ── React Native Component ──────────────────────────────────────────────
export default function MeasurementScreen({ navigation, route }: Props) {
  const { planId, planName } = route.params;

  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentScale, setCurrentScale] = useState(1);
  const webRef = useRef<WebView>(null);

  // Tool state
  const [activeTool, setActiveTool] = useState<'pan' | 'calibrate' | 'measure' | 'area'>('pan');
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [showCalibrationInput, setShowCalibrationInput] = useState(false);
  const [calibrationLineId, setCalibrationLineId] = useState<number | null>(null);
  const [calibrationInput, setCalibrationInput] = useState('');
  const [lastMeasure, setLastMeasure] = useState<number | null>(null);
  const [measureCount, setMeasureCount] = useState(0);
  const [totalDist, setTotalDist] = useState(0);
  const [lastArea, setLastArea] = useState<{ area: number; perimeter: number } | null>(null);
  const [hasVectorData, setHasVectorData] = useState(false);

  // Load PDF
  useEffect(() => {
    (async () => {
      try {
        const plan = await plansCollection.find(planId);
        if (!plan.fileUri) { setError('Sin archivo'); setLoading(false); return; }
        const info = await FileSystem.getInfoAsync(plan.fileUri);
        if (!info.exists) { setError('Archivo no encontrado'); setLoading(false); return; }
        const b64 = await FileSystem.readAsStringAsync(plan.fileUri, { encoding: FileSystem.EncodingType.Base64 });
        setPdfBase64(b64);
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [planId]);

  const sendCmd = useCallback((cmd: any) => {
    webRef.current?.postMessage(JSON.stringify(cmd));
  }, []);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      if (msg.type === 'scaleChanged') setCurrentScale(msg.scale);

      if (msg.type === 'calibrationLineCreated') {
        setCalibrationLineId(msg.id);
        setActiveTool('pan');
        // Mostrar input con un pequeño delay para que no salte el teclado inmediatamente
        setTimeout(() => setShowCalibrationInput(true), 300);
      }

      if (msg.type === 'calibrationDone') {
        setIsCalibrated(true);
        setShowCalibrationInput(false);
        setActiveTool('pan');
      }

      if (msg.type === 'measureLineCreated') {
        setLastMeasure(msg.dist);
        setMeasureCount((c) => c + 1);
        setTotalDist((t) => t + msg.dist);
        setActiveTool('pan');
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
      }

      if (msg.type === 'areaUpdated') {
        setLastArea({ area: msg.area, perimeter: msg.perimeter });
      }

      if (msg.type === 'vectorDataDetected') {
        setHasVectorData(msg.hasData);
      }

      if (msg.type === 'vectorNotFound') {
        Alert.alert('Sin polígono', 'No se reconoció un polígono vectorial en esta zona. Dibuja los puntos manualmente.');
      }

      if (msg.type === 'error') setError(msg.message);

    } catch {}
  }, []);

  // Tool actions
  const selectTool = (t: 'pan' | 'calibrate' | 'measure' | 'area') => {
    if ((t === 'measure' || t === 'area') && !isCalibrated) {
      Alert.alert('Sin calibración', 'Primero calibra con una medida de referencia.');
      return;
    }
    setActiveTool(t);
    sendCmd({ cmd: 'setTool', tool: t });
  };

  const confirmCalibration = () => {
    const val = parseFloat(calibrationInput.replace(',', '.'));
    if (isNaN(val) || val <= 0 || !calibrationLineId) {
      Alert.alert('Valor inválido', 'Ingresa una medida real positiva.');
      return;
    }
    sendCmd({ cmd: 'confirmCalibration', lineId: calibrationLineId, realMeters: val });
    setCalibrationInput('');
  };

  const cancelCalibration = () => {
    if (calibrationLineId) sendCmd({ cmd: 'deleteLine', lineId: calibrationLineId });
    setShowCalibrationInput(false);
    setCalibrationLineId(null);
    setActiveTool('pan');
    sendCmd({ cmd: 'setTool', tool: 'pan' });
  };

  const clearMeasurements = () => {
    sendCmd({ cmd: 'clearMeasurements' });
    setLastMeasure(null);
    setMeasureCount(0);
    setTotalDist(0);
  };

  // ── Render ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader title="Modo Medición" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Cargando plano...</Text>
        </View>
      </View>
    );
  }

  if (error || !pdfBase64) {
    return (
      <View style={styles.container}>
        <AppHeader title="Modo Medición" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error || 'No se pudo cargar el plano.'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader title={planName} subtitle="Modo Medición" onBack={() => navigation.goBack()} />

      {/* Toolbar */}
      <View style={styles.toolbar}>
        {showCalibrationInput ? (
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Medida real:</Text>
            <TextInput style={styles.input} placeholder="Ej: 5.2" placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad" value={calibrationInput} onChangeText={setCalibrationInput} />
            <Text style={styles.inputUnit}>m</Text>
            <TouchableOpacity style={styles.confirmBtn} onPress={confirmCalibration}>
              <Text style={styles.confirmBtnText}>OK</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={cancelCalibration}>
              <Ionicons name="close" size={20} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.toolbarRow}>
            {/* Pan */}
            <TouchableOpacity style={[styles.toolIcon, activeTool === 'pan' && styles.toolIconActive]}
              onPress={() => selectTool('pan')}>
              <Ionicons name="hand-left-outline" size={20} color={activeTool === 'pan' ? Colors.white : Colors.navy} />
            </TouchableOpacity>
            {/* Calibrate */}
            <TouchableOpacity style={[styles.toolIcon, activeTool === 'calibrate' && styles.toolIconActive, isCalibrated && styles.toolIconCalibrated]}
              onPress={() => selectTool('calibrate')}>
              <Ionicons name="options-outline" size={20} color={activeTool === 'calibrate' ? Colors.white : (isCalibrated ? Colors.success : Colors.navy)} />
            </TouchableOpacity>
            {/* Measure */}
            <TouchableOpacity style={[styles.toolIcon, activeTool === 'measure' && styles.toolIconActive, !isCalibrated && styles.toolDisabled]}
              onPress={() => selectTool('measure')} disabled={!isCalibrated}>
              <Ionicons name="analytics-outline" size={20} color={activeTool === 'measure' ? Colors.white : Colors.navy} />
            </TouchableOpacity>
            {/* Area */}
            <TouchableOpacity style={[styles.toolIcon, activeTool === 'area' && styles.toolIconActive, !isCalibrated && styles.toolDisabled]}
              onPress={() => selectTool('area')} disabled={!isCalibrated}>
              <Ionicons name="shapes-outline" size={20} color={activeTool === 'area' ? Colors.white : Colors.navy} />
            </TouchableOpacity>

            {/* Separator */}
            <View style={styles.separator} />

            {/* Clear measurements */}
            {measureCount > 0 && (
              <TouchableOpacity style={styles.toolIcon} onPress={clearMeasurements}>
                <Ionicons name="trash-outline" size={18} color={Colors.danger} />
              </TouchableOpacity>
            )}

            {/* Zoom badge */}
            <View style={styles.zoomBadge}>
              <Text style={styles.zoomBadgeText}>{currentScale.toFixed(1)}x</Text>
            </View>
          </View>
        )}
      </View>

      {/* Result bar */}
      {lastMeasure !== null && !showCalibrationInput && (
        <View style={styles.resultBar}>
          <Text style={styles.resultText}>
            {lastMeasure >= 1 ? lastMeasure.toFixed(2) + ' m' : (lastMeasure * 100).toFixed(1) + ' cm'}
          </Text>
          {measureCount > 1 && (
            <Text style={styles.totalText}>
              Total: {totalDist >= 1 ? totalDist.toFixed(2) + ' m' : (totalDist * 100).toFixed(1) + ' cm'}
              {' · '}{measureCount} líneas
            </Text>
          )}
        </View>
      )}

      {/* Area result */}
      {lastArea && !showCalibrationInput && (
        <View style={[styles.resultBar, { backgroundColor: '#e3f2fd', borderBottomColor: '#bbdefb' }]}>
          <Text style={[styles.resultText, { color: '#1565c0' }]}>
            {lastArea.area >= 1 ? lastArea.area.toFixed(2) + ' m²' : (lastArea.area * 10000).toFixed(0) + ' cm²'}
          </Text>
          <Text style={[styles.totalText, { color: '#1976d2' }]}>
            P: {lastArea.perimeter >= 1 ? lastArea.perimeter.toFixed(2) + ' m' : (lastArea.perimeter * 100).toFixed(1) + ' cm'}
          </Text>
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
      </View>

      {/* Instructions */}
      <View style={styles.instructionBar}>
        <Text style={styles.instructionText}>
          {activeTool === 'pan' && '✋ Arrastra para mover · Pellizca para zoom'}
          {activeTool === 'calibrate' && '📏 Arrastra una línea sobre una medida conocida'}
          {activeTool === 'measure' && '📐 Arrastra para medir · Toca un segmento para editar'}
          {activeTool === 'area' && (hasVectorData
            ? '⬡ Doble tap para detectar polígono · Tap simple para dibujar vértices'
            : '⬡ Toca para agregar vértices · Toca el primer punto para cerrar')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: Colors.textSecondary, fontSize: 13 },
  errorText: { color: Colors.danger, fontSize: 14, textAlign: 'center', padding: 24 },

  toolbar: { backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, ...Shadow.card },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolIcon: { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  toolIconActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  toolIconCalibrated: { borderColor: Colors.success, borderWidth: 2 },
  toolDisabled: { opacity: 0.3 },
  separator: { width: 1, height: 28, backgroundColor: Colors.border, marginHorizontal: 4 },
  zoomBadge: { backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 'auto' },
  zoomBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.navy },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  input: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary },
  inputUnit: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  confirmBtn: { backgroundColor: Colors.success, borderRadius: Radius.md, paddingHorizontal: 18, paddingVertical: 10 },
  confirmBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

  resultBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#e8f5e9', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#c8e6c9' },
  resultText: { fontSize: 16, fontWeight: '700', color: '#2e7d32' },
  totalText: { fontSize: 11, fontWeight: '600', color: '#558b2f' },

  webArea: { flex: 1, backgroundColor: '#d0d0d0' },

  instructionBar: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border },
  instructionText: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
});
