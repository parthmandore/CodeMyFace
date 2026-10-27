/**
 * Fast Connected Component Speck Counter
 *
 * Scans an image/SVG raster to detect isolated color components under `maxArea` pixels.
 * Uses 4-connected BFS with Euclidean color distance and early exit:
 * Components that exceed `maxArea` are immediately pruned from traversal.
 */

export function countSpecks(
  imgData: { width: number; height: number; data: Uint8ClampedArray | Uint8Array },
  maxArea = 10,
  colorDistThreshold = 18
): { speckCount: number; speckPixels: number } {
  const w = imgData.width;
  const h = imgData.height;
  const d = imgData.data;
  const total = w * h;

  const visited = new Uint8Array(total);
  let speckCount = 0;
  let speckPixels = 0;

  function dist(i1: number, i2: number): number {
    const dr = d[i1 * 4] - d[i2 * 4];
    const dg = d[i1 * 4 + 1] - d[i2 * 4 + 1];
    const db = d[i1 * 4 + 2] - d[i2 * 4 + 2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // Preallocated queue for fast BFS without allocations
  const queue = new Int32Array(maxArea + 8);

  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const startIdx = y * w + x;
      if (visited[startIdx]) continue;

      queue[0] = startIdx;
      visited[startIdx] = 1;
      let qHead = 0;
      let qTail = 1;
      let exceedsLimit = false;

      while (qHead < qTail) {
        const cur = queue[qHead++];
        const cx = cur % w;
        const cy = Math.floor(cur / w);

        const neighbors = [
          cy > 0 ? (cy - 1) * w + cx : -1,
          cy < h - 1 ? (cy + 1) * w + cx : -1,
          cx > 0 ? cy * w + (cx - 1) : -1,
          cx < w - 1 ? cy * w + (cx + 1) : -1,
        ];

        for (const n of neighbors) {
          if (n !== -1 && !visited[n]) {
            if (dist(startIdx, n) < colorDistThreshold) {
              visited[n] = 1;
              if (qTail < maxArea) {
                queue[qTail++] = n;
              } else {
                exceedsLimit = true;
                break;
              }
            }
          }
        }
        if (exceedsLimit) break;
      }

      if (!exceedsLimit && qTail > 0 && qTail < maxArea) {
        speckCount++;
        speckPixels += qTail;
      }
    }
  }

  return { speckCount, speckPixels };
}
