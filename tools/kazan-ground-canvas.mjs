import { GEO } from '../js/kazan-runtime.js';
import { ROADS, landcoverAt } from '../js/kazan-config.js';

function landcoverCanvas(makeCanvas) {
  const c = GEO.landcover;
  const coverCanvas = makeCanvas(Math.ceil(c.cols / 2), Math.ceil(c.rows / 2));
  const ctx = coverCanvas.getContext('2d'), data = ctx.createImageData(coverCanvas.width, coverCanvas.height);
  const palette = { 10: [56, 83, 48], 20: [103, 119, 74], 30: [116, 135, 78], 40: [152, 145, 94],
    50: [132, 130, 111], 60: [174, 164, 133], 80: [102, 126, 111], 90: [92, 119, 78] };
  for (let row = 0; row < coverCanvas.height; row++) for (let col = 0; col < coverCanvas.width; col++) {
    const shade = palette[landcoverAt(c.x0 + col * c.step * 2, c.z0 + row * c.step * 2)] || [124, 127, 105];
    data.data.set([...shade, 255], (row * coverCanvas.width + col) * 4);
  }
  ctx.putImageData(data, 0, 0);
  return coverCanvas;
}


export function createGroundCanvas(b, resolution, makeCanvas) {
  const canvas = makeCanvas(resolution, resolution);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7c7f69';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cover = GEO.landcover, coverImage = landcoverCanvas(makeCanvas);
  ctx.drawImage(coverImage, (cover.x0 - b.minX) / (b.maxX - b.minX) * resolution,
    (cover.z0 - b.minZ) / (b.maxZ - b.minZ) * resolution, coverImage.width * cover.step * 2 / (b.maxX - b.minX) * resolution,
    coverImage.height * cover.step * 2 / (b.maxZ - b.minZ) * resolution);
  function paint(body) {
    ctx.beginPath();
    for (const ring of [...body.rings, ...(body.holes || [])]) {
      for (let i = 0; i < ring.length; i += 2) {
        const x = (ring[i] - b.minX) / (b.maxX - b.minX) * canvas.width;
        const y = (ring[i + 1] - b.minZ) / (b.maxZ - b.minZ) * canvas.height;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    ctx.fill('evenodd');
  }
  ctx.fillStyle = '#526b39';
  for (const park of GEO.parks) paint(park);
  ctx.fillStyle = '#455b3b';
  for (const forest of GEO.forests || []) paint(forest);
  ctx.fillStyle = '#74836a';
  for (const cemetery of GEO.cemeteries || []) paint(cemetery);
  ctx.fillStyle = '#66696b';
  for (const parking of GEO.parkings || []) paint(parking);
  ctx.fillStyle = '#8b795d';
  for (const building of GEO.buildings) if (building.construction?.excavationDepth) paint({ rings: [building.ring], holes: building.holes });
  ctx.save();
  ctx.setTransform(resolution / (b.maxX - b.minX), 0, 0, resolution / (b.maxZ - b.minZ),
    -b.minX * resolution / (b.maxX - b.minX), -b.minZ * resolution / (b.maxZ - b.minZ));
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'bevel';
  function roadPath(road, width, colour) {
    ctx.beginPath();
    for (let i = 0; i < road.pts.length; i++) {
      const p = road.pts[i];
      if (i) ctx.lineTo(p.x, p.z); else ctx.moveTo(p.x, p.z);
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.stroke();
  }
  for (const road of ROADS) {
    if (road.bridge || road.tunnel || road.pedestrianStructure) continue;
    roadPath(road, road.w + (road.walk || road.parking ? 0 : 5), '#818078');
  }
  for (const road of ROADS) {
    if (road.bridge || road.tunnel || road.walk || road.pedestrianStructure) continue;
    roadPath(road, road.w, '#383c42');
  }
  ctx.restore();
  return canvas;
}
