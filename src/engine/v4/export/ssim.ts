/**
 * Structural Similarity Index Measure (SSIM)
 *
 * Grounded in Wang et al. (2004) image quality assessment:
 * Measures luminance, contrast, and structural edge similarity between two images.
 * Returns a value between 0 (completely dissimilar) and 1 (identical).
 */

export function computeSSIM(
  imgDataA: { width: number; height: number; data: Uint8ClampedArray | Uint8Array },
  imgDataB: { width: number; height: number; data: Uint8ClampedArray | Uint8Array },
  blockSize = 8
): number {
  const w = imgDataA.width;
  const h = imgDataA.height;
  const a = imgDataA.data;
  const b = imgDataB.data;

  if (w !== imgDataB.width || h !== imgDataB.height) {
    throw new Error(`SSIM dimension mismatch: ${w}x${h} vs ${imgDataB.width}x${imgDataB.height}`);
  }

  const totalPixels = w * h;
  const lumA = new Float32Array(totalPixels);
  const lumB = new Float32Array(totalPixels);

  // Rec. 601 Luma
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    lumA[i] = 0.299 * a[idx] + 0.587 * a[idx + 1] + 0.114 * a[idx + 2];
    lumB[i] = 0.299 * b[idx] + 0.587 * b[idx + 1] + 0.114 * b[idx + 2];
  }

  const c1 = (0.01 * 255) ** 2; // 6.5025
  const c2 = (0.03 * 255) ** 2; // 58.5225

  const numBlocksX = Math.floor(w / blockSize);
  const numBlocksY = Math.floor(h / blockSize);
  const N = blockSize * blockSize;

  if (numBlocksX === 0 || numBlocksY === 0) return 1.0;

  let totalSSIM = 0;
  let blockCount = 0;

  for (let by = 0; by < numBlocksY; by++) {
    const yStart = by * blockSize;
    for (let bx = 0; bx < numBlocksX; bx++) {
      const xStart = bx * blockSize;

      let sumA = 0;
      let sumB = 0;

      for (let y = 0; y < blockSize; y++) {
        const rowOffset = (yStart + y) * w + xStart;
        for (let x = 0; x < blockSize; x++) {
          sumA += lumA[rowOffset + x];
          sumB += lumB[rowOffset + x];
        }
      }

      const meanA = sumA / N;
      const meanB = sumB / N;

      let varA = 0;
      let varB = 0;
      let covAB = 0;

      for (let y = 0; y < blockSize; y++) {
        const rowOffset = (yStart + y) * w + xStart;
        for (let x = 0; x < blockSize; x++) {
          const diffA = lumA[rowOffset + x] - meanA;
          const diffB = lumB[rowOffset + x] - meanB;
          varA += diffA * diffA;
          varB += diffB * diffB;
          covAB += diffA * diffB;
        }
      }

      varA /= (N - 1);
      varB /= (N - 1);
      covAB /= (N - 1);

      const numerator = (2 * meanA * meanB + c1) * (2 * covAB + c2);
      const denominator = (meanA * meanA + meanB * meanB + c1) * (varA + varB + c2);
      const blockSSIM = denominator !== 0 ? numerator / denominator : 1.0;

      totalSSIM += blockSSIM;
      blockCount++;
    }
  }

  return blockCount > 0 ? Math.max(0, Math.min(1, totalSSIM / blockCount)) : 1.0;
}
