/**
 * CodeMyFace V4 — Lossless SVG Code Cleaner & Formatter
 *
 * Requirements:
 * - Strips internal comments (e.g. <!-- CodeMyFace V4... -->)
 * - Strips v4- names and layer IDs (id="layer-428", id="v4-c-base-vector", etc.)
 * - Strips unused <defs> (gradients or filters that no path references)
 * - Strips <?xml ... ?> declaration in snippets/clean outputs
 * - Collapses single-path <g><path/></g> into a single <path/> hoisting attributes
 * - Toggle: "Include comments and ids (for editing)" (off by default)
 * - Lossless verification: 0 or <= 1 max pixel difference across all channels.
 */

export interface SvgCleanerOptions {
  includeCommentsAndIds?: boolean;
}

/**
 * Losslessly cleans an SVG document according to options.
 */
export function cleanSvgDocument(
  svgString: string,
  options: SvgCleanerOptions = {}
): string {
  if (!svgString || options.includeCommentsAndIds) {
    return svgString;
  }

  let result = svgString;

  // 1. Strip XML declaration
  result = result.replace(/<\?xml\b[^>]*\?>\s*/gi, '');

  // 2. Strip internal comments
  result = result.replace(/<!--[\s\S]*?-->/gi, '');

  // 3. Rename referenced v4- definitions to clean generic names
  result = result
    .replace(/\bid="v4-studio-bg"/g, 'id="studio-bg"')
    .replace(/url\(#v4-studio-bg\)/g, 'url(#studio-bg)')
    .replace(/\bid="v4-skin-soft-edge"/g, 'id="soft-skin"')
    .replace(/url\(#v4-skin-soft-edge\)/g, 'url(#soft-skin)');

  // 4. Prune unused <defs>
  result = pruneUnusedDefs(result);

  // 5. Collapse single-path <g><path/></g> into <path/>
  result = collapseSinglePathGroups(result);

  // 6. Strip internal layer IDs and grouping v4- IDs
  result = result.replace(/\s+id="(?:layer-\d+|v4-c-[^"]*|v4-layer-[^"]*)"/gi, '');

  // 7. Strip redundant empty groups
  result = result.replace(/<g\b[^>]*>\s*<\/g>/gi, '');

  // 8. Strip empty defs
  result = result.replace(/<defs\b[^>]*>\s*<\/defs>/gi, '');

  // 9. Clean up whitespace between tags
  result = result.replace(/>\s+</g, '><').trim();

  return result;
}

/**
 * Removes definitions from <defs> that are not referenced anywhere in the SVG.
 */
function pruneUnusedDefs(svg: string): string {
  const defsMatch = svg.match(/<defs\b[^>]*>([\s\S]*?)<\/defs>/i);
  if (!defsMatch) return svg;

  const defsContent = defsMatch[1];
  const outsideDefs = svg.replace(/<defs\b[^>]*>[\s\S]*?<\/defs>/gi, '');

  const defTagRegex = /<(radialGradient|linearGradient|filter|pattern|clipPath|mask)\b([^>]*)>([\s\S]*?)<\/\1>|<(radialGradient|linearGradient|filter|pattern|clipPath|mask)\b([^>]*)\/>/gi;

  const preservedDefs: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = defTagRegex.exec(defsContent)) !== null) {
    const fullTag = match[0];
    const attrs = match[2] || match[5] || '';
    const idMatch = attrs.match(/\bid="([^"]+)"/i);

    if (idMatch) {
      const id = idMatch[1];
      const isReferenced =
        outsideDefs.includes(`url(#${id})`) ||
        outsideDefs.includes(`href="#${id}"`) ||
        outsideDefs.includes(`href='#${id}'`);

      if (isReferenced) {
        preservedDefs.push(fullTag);
      }
    } else {
      preservedDefs.push(fullTag);
    }
  }

  if (preservedDefs.length === 0) {
    return svg.replace(/<defs\b[^>]*>[\s\S]*?<\/defs>\s*/gi, '');
  }

  return svg.replace(
    /<defs\b[^>]*>[\s\S]*?<\/defs>/i,
    `<defs>${preservedDefs.join('')}</defs>`
  );
}

/**
 * Collapses single-path groups into a single <path ... /> by hoisting group attributes.
 */
function collapseSinglePathGroups(svg: string): string {
  let prev = '';
  let current = svg;

  while (prev !== current) {
    prev = current;
    current = current.replace(
      /<g\b([^>]*)>\s*(<path\b[^>]*\/?>)\s*<\/g>/gi,
      (_match, gAttrsStr, pathTag) => {
        const gAttrs = parseAttributes(gAttrsStr);
        const pAttrsMatch = pathTag.match(/<path\b([^>]*)\/?>/i);
        const pAttrs = pAttrsMatch ? parseAttributes(pAttrsMatch[1]) : {};

        // Drop internal layer- and v4- IDs
        delete gAttrs.id;
        delete pAttrs.id;

        // Merge attributes: path attributes take precedence, group attributes fill in
        const merged: Record<string, string> = { ...gAttrs, ...pAttrs };

        // Remove stroke-width="0" and matching stroke if stroke-width is 0
        if (merged['stroke-width'] === '0') {
          delete merged['stroke-width'];
          delete merged.stroke;
        }

        const attrsString = Object.entries(merged)
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ');

        return `<path ${attrsString} />`;
      }
    );
  }

  return current;
}

/**
 * Simple XML attribute parser for SVG tags.
 */
function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(attrString)) !== null) {
    const key = match[1];
    const val = match[2] !== undefined ? match[2] : match[3];
    attrs[key] = val;
  }

  return attrs;
}
