import { ALL_BASELINE_FIXTURES } from '../src/engine/__fixtures__/baselineFixtures';
import { colorToHex, luminance, derivePerceptualSkinShadow, derivePerceptualSkinHighlight } from '../src/engine/geometry';

for (const f of ALL_BASELINE_FIXTURES) {
  const base = f.palette.skinBase;
  const shadow = derivePerceptualSkinShadow(base, 0.24);
  const hl = derivePerceptualSkinHighlight(base, 0.14);
  const bL = luminance(base).toFixed(3);
  const sL = luminance(shadow).toFixed(3);
  const hL = luminance(hl).toFixed(3);
  const sR = (luminance(shadow) / luminance(base)).toFixed(2);
  const hR = (luminance(hl) / luminance(base)).toFixed(2);
  console.log(`${f.requestId} | Base: ${colorToHex(base)} (L:${bL}) | Shadow: ${colorToHex(shadow)} (L:${sL}, ${sR}x) | HL: ${colorToHex(hl)} (L:${hL}, ${hR}x)`);
}
