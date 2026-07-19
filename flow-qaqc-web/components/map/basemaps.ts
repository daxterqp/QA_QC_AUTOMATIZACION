/**
 * basemaps — Estilos de capa base del mapa GL (v94) + fuente de terreno 3D.
 * Todo SIN API key:
 *  - CARTO GL styles públicos (dark-matter / positron). Requisito: atribución
 *    "© OpenStreetMap contributors © CARTO" (viene embebida en el estilo y la
 *    muestra el AttributionControl). Si CARTO restringiera estos estilos algún
 *    día, basta swappear la constante aquí (p. ej. a un dark de OpenFreeMap).
 *  - Satélite = raster de Esri World Imagery (misma URL que usa el mapa Leaflet).
 *  - Terreno = AWS Open Data (Mapzen/Tilezen terrarium), maxzoom 15: a zoom de
 *    obra (16-18) se ve suavizado — esperado, no es bug.
 */
import type { StyleSpecification, RasterDEMSourceSpecification } from 'maplibre-gl';

export type BasemapId = 'dark' | 'satellite' | 'light';

export const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
export const CARTO_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export const ESRI_SATELLITE: StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
};

export const BASEMAPS: Record<BasemapId, string | StyleSpecification> = {
  dark: CARTO_DARK,
  satellite: ESRI_SATELLITE,
  light: CARTO_LIGHT,
};

/** Fuente DEM para el modo 3D. Se monta siempre (no descarga tiles hasta
 *  activar `terrain`). */
export const TERRAIN_SOURCE: RasterDEMSourceSpecification = {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 15,
  attribution: 'Terrain: Mapzen/Tilezen, AWS Open Data',
};
