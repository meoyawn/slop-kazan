/** A smaller download retains every mapped building, road, destination and local hill patch. */
export function mobileGeodata(data) {
  function sampleGrid(grid, stride) {
    const cols = Math.ceil((grid.cols - 1) / stride) + 1;
    const rows = Math.ceil((grid.rows - 1) / stride) + 1;
    const elevations = [];
    for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
      elevations.push(grid.elevations[Math.min(z * stride, grid.rows - 1) * grid.cols + Math.min(x * stride, grid.cols - 1)]);
    }
    return { ...grid, cols, rows, step: grid.step * stride, elevations };
  }
  const cover = data.landcover;
  const cells = new Uint8Array(cover.cols * cover.rows);
  let offset = 0;
  for (let i = 0; i < cover.runs.length; i += 2) {
    cells.fill(cover.runs[i], offset, offset + cover.runs[i + 1]);
    offset += cover.runs[i + 1];
  }
  const runs = [];
  for (let z = 0; z < cover.rows; z += 4) for (let x = 0; x < cover.cols; x += 4) {
    const value = cells[z * cover.cols + x];
    if (runs.length && runs[runs.length - 2] === value) runs[runs.length - 1]++;
    else runs.push(value, 1);
  }
  const buildings = data.buildings.map((building) => {
    const { heightSource, levels, localName, name, colourSource, mappedColour, ...record } = building;
    for (const key of Object.keys(record)) if (record[key] === '' || record[key] === false) delete record[key];
    return record;
  });
  return { ...data, buildings, elevation: sampleGrid(data.elevation, 3),
    landcover: { ...cover, step: cover.step * 4, cols: Math.ceil(cover.cols / 4), rows: Math.ceil(cover.rows / 4), runs } };
}
