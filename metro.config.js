// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Límite de workers de compilación: esta máquina tiene 16 núcleos pero RAM
// limitada — sin este tope, Metro intenta lanzar hasta 15 procesos paralelos
// (jest-worker) y agota la memoria disponible, tumbando cualquier build
// (dev o release) con "FATAL ERROR: Zone Allocation failed - out of memory".
config.maxWorkers = 2;

module.exports = config;
