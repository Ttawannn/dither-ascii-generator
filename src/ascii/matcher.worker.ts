import { buildGrid, type GridOptions } from './grid';
self.onmessage = (e: MessageEvent<{ data: Uint8Array; cols: number; rows: number; opts: GridOptions }>) => {
  const { data, cols, rows, opts } = e.data;
  const grid = buildGrid(data, cols, rows, opts);
  self.postMessage(grid, { transfer: [grid.cells.buffer, grid.glyphIds.buffer] });
};
