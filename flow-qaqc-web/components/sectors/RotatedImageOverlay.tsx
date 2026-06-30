'use client';

/**
 * RotatedImageOverlay — ImageOverlay de Leaflet que coloca la imagen por TRES
 * esquinas (rotada/sesgada), no por un bounding box axis-aligned. Replica el
 * algoritmo probado de `leaflet-imageoverlay-rotated` (matriz afín a partir de
 * los vectores de los lados), pero SELF-CONTAINED: extiende el `L` que ya usa
 * react-leaflet (sin depender de un `L` global, que rompe en bundlers).
 *
 * Para el Método 2 (sistema propio) las 3 esquinas forman un rectángulo rotado
 * (semejanza, sin shear) → coincide con el render móvil (bounds + bearing).
 */

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

type LL = [number, number]; // [lat, lng]

// La subclase se construye una sola vez (necesita `L`, disponible en cliente).
let RotatedClass: any = null;
function getRotatedClass() {
  if (RotatedClass) return RotatedClass;
  RotatedClass = (L.ImageOverlay as any).extend({
    initialize(this: any, url: string, topleft: any, topright: any, bottomleft: any, options: any) {
      this._url = url;
      this._topLeft = L.latLng(topleft);
      this._topRight = L.latLng(topright);
      this._bottomLeft = L.latLng(bottomleft);
      L.setOptions(this, options);
    },
    onAdd(this: any, map: any) {
      if (!this._image) this._initImage();
      if (this.options.opacity < 1) this._updateOpacity();
      // Sin animación de zoom (no marcamos zoom-animated): recomputamos al final.
      map.on('zoomend resetview', this._reset, this);
      this.getPane().appendChild(this._image);
      this._reset();
    },
    onRemove(this: any, map: any) {
      map.off('zoomend resetview', this._reset, this);
      (L.ImageOverlay as any).prototype.onRemove.call(this, map);
    },
    _initImage(this: any) {
      const img = L.DomUtil.create('img') as HTMLImageElement;
      img.style.display = 'none';
      img.src = this._url;
      this._rawImage = img;
      L.DomUtil.addClass(img, 'leaflet-image-layer');
      const div = this._image = L.DomUtil.create('div', 'leaflet-image-layer');
      this._updateZIndex();
      div.appendChild(img);
      (div as any).onselectstart = L.Util.falseFn;
      (div as any).onmousemove = L.Util.falseFn;
      img.onload = () => { this._reset(); img.style.display = 'block'; this.fire('load'); };
    },
    _reset(this: any) {
      const div = this._image;
      if (!this._map) return;
      const pxTopLeft = this._map.latLngToLayerPoint(this._topLeft);
      const pxTopRight = this._map.latLngToLayerPoint(this._topRight);
      const pxBottomLeft = this._map.latLngToLayerPoint(this._bottomLeft);
      const pxBottomRight = pxTopRight.subtract(pxTopLeft).add(pxBottomLeft);
      const pxBounds = L.bounds([pxTopLeft, pxTopRight, pxBottomLeft, pxBottomRight]);
      const size = pxBounds.getSize();
      const pxMin = pxBounds.min!, pxMax = pxBounds.max!;
      const pxTopLeftInDiv = pxTopLeft.subtract(pxMin);
      this._bounds = L.latLngBounds(this._map.layerPointToLatLng(pxMin), this._map.layerPointToLatLng(pxMax));
      L.DomUtil.setPosition(div, pxMin);
      div.style.width = size.x + 'px';
      div.style.height = size.y + 'px';
      const imgW = this._rawImage.width, imgH = this._rawImage.height;
      if (!imgW || !imgH) return; // la imagen aún no cargó
      const vX = pxTopRight.subtract(pxTopLeft);
      const vY = pxBottomLeft.subtract(pxTopLeft);
      this._rawImage.style.transformOrigin = '0 0';
      this._rawImage.style.transform = `matrix(${vX.x / imgW}, ${vX.y / imgW}, ${vY.x / imgH}, ${vY.y / imgH}, ${pxTopLeftInDiv.x}, ${pxTopLeftInDiv.y})`;
    },
    reposition(this: any, topleft: any, topright: any, bottomleft: any) {
      this._topLeft = L.latLng(topleft);
      this._topRight = L.latLng(topright);
      this._bottomLeft = L.latLng(bottomleft);
      this._reset();
    },
  });
  return RotatedClass;
}

export interface RotatedImageOverlayProps {
  url: string;
  topLeft: LL;
  topRight: LL;
  bottomLeft: LL;
  opacity?: number;
  paneName?: string;
}

export default function RotatedImageOverlay({ url, topLeft, topRight, bottomLeft, opacity = 1, paneName = 'tilePane' }: RotatedImageOverlayProps) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  // Crear/destruir la capa cuando cambia la URL o el pane.
  useEffect(() => {
    const Cls = getRotatedClass();
    const layer = new Cls(url, topLeft, topRight, bottomLeft, { opacity, pane: paneName, interactive: false });
    layer.addTo(map);
    layerRef.current = layer;
    return () => { try { map.removeLayer(layer); } catch { /* ignore */ } layerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, paneName]);

  // Reposicionar / opacidad cuando cambian las esquinas.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.reposition(topLeft, topRight, bottomLeft);
    if (layer.setOpacity) layer.setOpacity(opacity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topLeft[0], topLeft[1], topRight[0], topRight[1], bottomLeft[0], bottomLeft[1], opacity]);

  return null;
}
