import { createCanvas } from '@napi-rs/canvas';
import { GEO } from '../js/kazan-runtime.js';
import { createGroundCanvas } from './kazan-ground-canvas.mjs';

/** Distant roads remain readable in the existing ground atlas while nearby geometry streams. */
export async function compileGround({ writeImage }) {
  for (const [id, bounds, resolution] of [['near', GEO.nearTerrainBounds, 4096], ['far', GEO.terrainBounds, 2048]]) {
    const canvas = createGroundCanvas(bounds, resolution, createCanvas);
    await writeImage({ system: 'ground', id }, await canvas.encode('webp', 100), 'webp');
  }
}
