/**
 * CodeFace V4 — SVG Path Geometry Optimizer
 *
 * Implements:
 * - Step 1: Relative path commands, no repeated command letters, compact delimiters, drop leading zeros.
 * - Step 3: 2x coordinate scaling for exact integer representation of half-pixel coordinates.
 * - Step 4: Exact collinear point removal (lossless).
 * - Step 5: Nearly-straight point removal (tolerance 0.25px / 0.4px).
 */

export interface Point2D {
  x: number;
  y: number;
}

export type CommandType = 'M' | 'L' | 'Q' | 'C' | 'Z';

export interface PathSegment {
  type: CommandType;
  points: Point2D[]; // M: 1 point, L: 1 point, Q: 2 points (control, end), C: 3 points, Z: 0 points
}

export interface SubPath {
  segments: PathSegment[];
  closed: boolean;
}

/**
 * Tokenizes and parses an SVG path 'd' string into a list of SubPaths.
 */
export function parsePath(d: string): SubPath[] {
  const subpaths: SubPath[] = [];
  let currentSubPath: SubPath = { segments: [], closed: false };

  // Regex to extract SVG command letters and numbers
  const tokenRegex = /([MLHVCSQTAZmlhvcsqtaz])|([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/g;
  let match: RegExpExecArray | null;

  let currentCmd = '';
  const numbers: number[] = [];

  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;

  function flushCommand() {
    if (!currentCmd) return;
    const isRel = currentCmd === currentCmd.toLowerCase();
    const upper = currentCmd.toUpperCase();

    if (upper === 'M') {
      for (let i = 0; i < numbers.length; i += 2) {
        let x = numbers[i];
        let y = numbers[i + 1];
        if (isRel) {
          x += curX;
          y += curY;
        }
        if (i === 0) {
          if (currentSubPath.segments.length > 0) {
            subpaths.push(currentSubPath);
            currentSubPath = { segments: [], closed: false };
          }
          currentSubPath.segments.push({ type: 'M', points: [{ x, y }] });
          startX = x;
          startY = y;
        } else {
          // Subsequent coordinate pairs after M are treated as L
          currentSubPath.segments.push({ type: 'L', points: [{ x, y }] });
        }
        curX = x;
        curY = y;
      }
    } else if (upper === 'L') {
      for (let i = 0; i < numbers.length; i += 2) {
        let x = numbers[i];
        let y = numbers[i + 1];
        if (isRel) {
          x += curX;
          y += curY;
        }
        currentSubPath.segments.push({ type: 'L', points: [{ x, y }] });
        curX = x;
        curY = y;
      }
    } else if (upper === 'H') {
      for (let i = 0; i < numbers.length; i++) {
        let x = numbers[i];
        if (isRel) x += curX;
        currentSubPath.segments.push({ type: 'L', points: [{ x, y: curY }] });
        curX = x;
      }
    } else if (upper === 'V') {
      for (let i = 0; i < numbers.length; i++) {
        let y = numbers[i];
        if (isRel) y += curY;
        currentSubPath.segments.push({ type: 'L', points: [{ x: curX, y }] });
        curY = y;
      }
    } else if (upper === 'Q') {
      for (let i = 0; i < numbers.length; i += 4) {
        let cx = numbers[i];
        let cy = numbers[i + 1];
        let x = numbers[i + 2];
        let y = numbers[i + 3];
        if (isRel) {
          cx += curX;
          cy += curY;
          x += curX;
          y += curY;
        }
        currentSubPath.segments.push({
          type: 'Q',
          points: [{ x: cx, y: cy }, { x, y }],
        });
        curX = x;
        curY = y;
      }
    } else if (upper === 'C') {
      for (let i = 0; i < numbers.length; i += 6) {
        let c1x = numbers[i];
        let c1y = numbers[i + 1];
        let c2x = numbers[i + 2];
        let c2y = numbers[i + 3];
        let x = numbers[i + 4];
        let y = numbers[i + 5];
        if (isRel) {
          c1x += curX;
          c1y += curY;
          c2x += curX;
          c2y += curY;
          x += curX;
          y += curY;
        }
        currentSubPath.segments.push({
          type: 'C',
          points: [{ x: c1x, y: c1y }, { x: c2x, y: c2y }, { x, y }],
        });
        curX = x;
        curY = y;
      }
    } else if (upper === 'Z') {
      currentSubPath.segments.push({ type: 'Z', points: [] });
      currentSubPath.closed = true;
      curX = startX;
      curY = startY;
      subpaths.push(currentSubPath);
      currentSubPath = { segments: [], closed: false };
    }

    numbers.length = 0;
  }

  while ((match = tokenRegex.exec(d)) !== null) {
    const letter = match[1];
    const num = match[2];
    if (letter) {
      flushCommand();
      currentCmd = letter;
    } else if (num !== undefined) {
      numbers.push(parseFloat(num));
    }
  }
  flushCommand();

  if (currentSubPath.segments.length > 0) {
    subpaths.push(currentSubPath);
  }

  return subpaths;
}

/**
 * Removes points that lie exactly on a straight line (Lossless Step 4).
 * Cross product of (P2 - P1) and (P3 - P1) must be strictly 0,
 * and P2 must be strictly between P1 and P3.
 */
export function removeCollinearPoints(subpaths: SubPath[]): SubPath[] {
  return subpaths.map((sp) => {
    const segs = sp.segments;
    if (segs.length <= 2) return sp;

    const newSegs: PathSegment[] = [];

    // Always preserve initial moveto
    newSegs.push(segs[0]);

    for (let i = 1; i < segs.length; i++) {
      const prev = newSegs[newSegs.length - 1];
      const curr = segs[i];
      const next = i + 1 < segs.length ? segs[i + 1] : (sp.closed ? segs[0] : null);

      if (
        curr.type === 'L' &&
        prev.type !== 'Z' &&
        next &&
        next.type === 'L'
      ) {
        const p1 = prev.points[prev.points.length - 1];
        const p2 = curr.points[0];
        const p3 = next.points[0];

        // Vectors
        const dx1 = p2.x - p1.x;
        const dy1 = p2.y - p1.y;
        const dx2 = p3.x - p2.x;
        const dy2 = p3.y - p2.y;

        // Cross product: dx1 * dy2 - dy1 * dx2
        const cross = dx1 * dy2 - dy1 * dx2;
        // Dot product: must be in same direction (not turning 180 degrees back)
        const dot = dx1 * dx2 + dy1 * dy2;

        // Exact collinear check
        if (Math.abs(cross) < 1e-9 && dot >= 0) {
          // p2 is redundant, skip adding curr
          continue;
        }
      }

      newSegs.push(curr);
    }

    return { segments: newSegs, closed: sp.closed };
  });
}

/**
 * Douglas-Peucker / perpendicular distance threshold simplification (Tested Step 5).
 * tolerance: max perpendicular distance in pixels from chord to point (e.g. 0.25px or 0.4px).
 */
export function removeNearlyStraightPoints(
  subpaths: SubPath[],
  tolerancePx: number
): SubPath[] {
  if (tolerancePx <= 0) return subpaths;

  return subpaths.map((sp) => {
    const segs = sp.segments;
    if (segs.length <= 2) return sp;

    const newSegs: PathSegment[] = [];
    newSegs.push(segs[0]);

    for (let i = 1; i < segs.length; i++) {
      const prev = newSegs[newSegs.length - 1];
      const curr = segs[i];
      const next = i + 1 < segs.length ? segs[i + 1] : (sp.closed ? segs[0] : null);

      if (
        curr.type === 'L' &&
        prev.type !== 'Z' &&
        next &&
        next.type === 'L'
      ) {
        const p1 = prev.points[prev.points.length - 1];
        const p2 = curr.points[0];
        const p3 = next.points[0];

        const lineLenSq = (p3.x - p1.x) ** 2 + (p3.y - p1.y) ** 2;
        if (lineLenSq > 1e-8) {
          // Perpendicular distance from p2 to line p1-p3
          const cross = Math.abs((p3.y - p1.y) * p2.x - (p3.x - p1.x) * p2.y + p3.x * p1.y - p3.y * p1.x);
          const dist = cross / Math.sqrt(lineLenSq);

          // Dot product to ensure p2 projects within p1-p3 segment
          const dot = (p2.x - p1.x) * (p3.x - p1.x) + (p2.y - p1.y) * (p3.y - p1.y);
          if (dist <= tolerancePx && dot >= 0 && dot <= lineLenSq) {
            // Point is within tolerance of straight line, can be pruned
            continue;
          }
        }
      }

      newSegs.push(curr);
    }

    return { segments: newSegs, closed: sp.closed };
  });
}

/**
 * Scales all points by multiplier (e.g. 2x for Step 3).
 */
export function scaleSubPaths(subpaths: SubPath[], scale: number): SubPath[] {
  if (scale === 1) return subpaths;
  return subpaths.map((sp) => ({
    closed: sp.closed,
    segments: sp.segments.map((seg) => ({
      type: seg.type,
      points: seg.points.map((p) => ({
        x: Math.round(p.x * scale * 10) / 10,
        y: Math.round(p.y * scale * 10) / 10,
      })),
    })),
  }));
}

/**
 * Formats a number compactly:
 * - Drops trailing zeros after decimal point
 * - Drops leading zero for decimals: '0.5' -> '.5', '-0.5' -> '-.5'
 */
export function formatCompactNum(n: number, isInteger = false): string {
  let val = isInteger ? Math.round(n) : Math.round(n * 100) / 100;
  if (Object.is(val, -0) || Math.abs(val) < 1e-9) val = 0;

  let s = val.toString();
  if (s.startsWith('0.')) {
    return s.slice(1);
  }
  if (s.startsWith('-0.')) {
    return '-' + s.slice(2);
  }
  return s;
}

/**
 * Serializes SubPaths to ultra-compact relative SVG path data string:
 * - Relative commands ('m', 'l', 'h', 'v', 'q', 'z')
 * - No repeated command letters ('l1 2 3 4' instead of 'l1 2l3 4')
 * - Minus sign as separator ('10-5' instead of '10 -5')
 * - 'h' / 'v' for pure horizontal / vertical steps
 */
export function serializeToRelativePath(
  subpaths: SubPath[],
  isWholeNumber = false
): string {
  let result = '';
  let curX = 0;
  let curY = 0;

  for (const sp of subpaths) {
    let lastCmd = '';

    for (let i = 0; i < sp.segments.length; i++) {
      const seg = sp.segments[i];

      if (seg.type === 'M') {
        const p = seg.points[0];
        const px = formatCompactNum(p.x, isWholeNumber);
        const py = formatCompactNum(p.y, isWholeNumber);

        // Absolute 'M' at start of subpath for absolute renderer safety
        result += `M${px} ${py}`;
        curX = p.x;
        curY = p.y;
        lastCmd = 'M';
      } else if (seg.type === 'L') {
        const p = seg.points[0];
        const dx = p.x - curX;
        const dy = p.y - curY;

        // Check if pure horizontal or vertical step
        const isH = Math.abs(dy) < 1e-6;
        const isV = Math.abs(dx) < 1e-6;

        if (isH && !isV) {
          const dxStr = formatCompactNum(dx, isWholeNumber);
          if (lastCmd === 'h') {
            result += (dxStr.startsWith('-') ? '' : ' ') + dxStr;
          } else {
            result += `h${dxStr}`;
            lastCmd = 'h';
          }
        } else if (isV && !isH) {
          const dyStr = formatCompactNum(dy, isWholeNumber);
          if (lastCmd === 'v') {
            result += (dyStr.startsWith('-') ? '' : ' ') + dyStr;
          } else {
            result += `v${dyStr}`;
            lastCmd = 'v';
          }
        } else {
          const dxStr = formatCompactNum(dx, isWholeNumber);
          const dyStr = formatCompactNum(dy, isWholeNumber);
          const sep = dyStr.startsWith('-') ? '' : ' ';

          if (lastCmd === 'l') {
            const prefix = dxStr.startsWith('-') ? '' : ' ';
            result += `${prefix}${dxStr}${sep}${dyStr}`;
          } else {
            result += `l${dxStr}${sep}${dyStr}`;
            lastCmd = 'l';
          }
        }

        curX = p.x;
        curY = p.y;
      } else if (seg.type === 'Q') {
        const cp = seg.points[0];
        const ep = seg.points[1];

        const dcxStr = formatCompactNum(cp.x - curX, isWholeNumber);
        const dcyStr = formatCompactNum(cp.y - curY, isWholeNumber);
        const dxStr = formatCompactNum(ep.x - curX, isWholeNumber);
        const dyStr = formatCompactNum(ep.y - curY, isWholeNumber);

        const s1 = dcyStr.startsWith('-') ? '' : ' ';
        const s2 = dxStr.startsWith('-') ? '' : ' ';
        const s3 = dyStr.startsWith('-') ? '' : ' ';

        if (lastCmd === 'q') {
          const s0 = dcxStr.startsWith('-') ? '' : ' ';
          result += `${s0}${dcxStr}${s1}${dcyStr}${s2}${dxStr}${s3}${dyStr}`;
        } else {
          result += `q${dcxStr}${s1}${dcyStr}${s2}${dxStr}${s3}${dyStr}`;
          lastCmd = 'q';
        }

        curX = ep.x;
        curY = ep.y;
      } else if (seg.type === 'Z') {
        result += 'z';
        lastCmd = 'z';
      }
    }
  }

  return result;
}

/**
 * Serializes SubPaths to ultra-compact absolute SVG path data string:
 * - Absolute commands ('M', 'L', 'Q', 'Z')
 * - No repeated command letters ('L1 2 3 4' instead of 'L1 2L3 4')
 * - Negative sign as natural separator
 */
export function serializeToAbsolutePath(
  subpaths: SubPath[],
  isWholeNumber = false
): string {
  let result = '';

  for (const sp of subpaths) {
    let lastCmd = '';

    for (let i = 0; i < sp.segments.length; i++) {
      const seg = sp.segments[i];

      if (seg.type === 'M') {
        const p = seg.points[0];
        const px = formatCompactNum(p.x, isWholeNumber);
        const py = formatCompactNum(p.y, isWholeNumber);
        result += `M${px} ${py}`;
        lastCmd = 'M';
      } else if (seg.type === 'L') {
        const p = seg.points[0];
        const px = formatCompactNum(p.x, isWholeNumber);
        const py = formatCompactNum(p.y, isWholeNumber);
        const sep = py.startsWith('-') ? '' : ' ';

        if (lastCmd === 'L') {
          const prefix = px.startsWith('-') ? '' : ' ';
          result += `${prefix}${px}${sep}${py}`;
        } else {
          result += `L${px}${sep}${py}`;
          lastCmd = 'L';
        }
      } else if (seg.type === 'Q') {
        const cp = seg.points[0];
        const ep = seg.points[1];
        const cpx = formatCompactNum(cp.x, isWholeNumber);
        const cpy = formatCompactNum(cp.y, isWholeNumber);
        const epx = formatCompactNum(ep.x, isWholeNumber);
        const epy = formatCompactNum(ep.y, isWholeNumber);

        const s1 = cpy.startsWith('-') ? '' : ' ';
        const s2 = epx.startsWith('-') ? '' : ' ';
        const s3 = epy.startsWith('-') ? '' : ' ';

        if (lastCmd === 'Q') {
          const s0 = cpx.startsWith('-') ? '' : ' ';
          result += `${s0}${cpx}${s1}${cpy}${s2}${epx}${s3}${epy}`;
        } else {
          result += `Q${cpx}${s1}${cpy}${s2}${epx}${s3}${epy}`;
          lastCmd = 'Q';
        }
      } else if (seg.type === 'Z') {
        result += 'Z';
        lastCmd = 'Z';
      }
    }
  }

  return result;
}

/**
 * Optimizes an individual path 'd' string based on the given configuration.
 */
export function optimizePathData(
  d: string,
  options: {
    relativeCommands?: boolean;
    scale2x?: boolean;
    removeCollinear?: boolean;
    simplifyTolerancePx?: number;
  }
): string {
  let subpaths = parsePath(d);
  if (subpaths.length === 0) return d;

  // Step 4: Remove exact collinear points (Lossless)
  if (options.removeCollinear !== false) {
    subpaths = removeCollinearPoints(subpaths);
  }

  // Step 5: Remove nearly-straight points (Tested)
  if (options.simplifyTolerancePx && options.simplifyTolerancePx > 0) {
    subpaths = removeNearlyStraightPoints(subpaths, options.simplifyTolerancePx);
  }

  // Step 3: Scale by 2x for whole-number coordinates
  const scale = options.scale2x ? 2 : 1;
  if (scale !== 1) {
    subpaths = scaleSubPaths(subpaths, scale);
  }

  // Step 1: Serialize to compact relative or absolute commands
  if (options.relativeCommands !== false) {
    return serializeToRelativePath(subpaths, options.scale2x);
  }

  return serializeToAbsolutePath(subpaths, options.scale2x);
}
