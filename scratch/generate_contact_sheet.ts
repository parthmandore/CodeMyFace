import fs from 'fs';
import path from 'path';
import { ALL_BASELINE_FIXTURES } from '../src/engine/__fixtures__/baselineFixtures';
import { buildPortraitModel, renderPortraitSvg } from '../src/engine/svgRenderer';
import { CONSTRUCTION_STAGES, buildStagedPortraitModel } from '../src/engine/stagedConstruction';

const ARTIFACT_DIR = 'C:\\Users\\mando\\.gemini\\antigravity\\brain\\d9d5ccf3-6d4c-42c0-9841-dcf03c24594e';
const UPLOAD_DIR = path.join(ARTIFACT_DIR, '.user_uploaded');

// Reference photo mapping
const photoFiles = [
  'media_1791835086280.jpg',
  'media_1791835095224.jpg',
  'media_1791835108161.jpg',
  'media_1791835116619.jpg',
];

const results: Array<{
  name: string;
  requestId: string;
  description: string;
  svg: string;
  photoBase64?: string;
  stageSvgs: string[];
}> = [];

for (const fixture of ALL_BASELINE_FIXTURES) {
  const model = buildPortraitModel(fixture, 1000, 1000);
  const finalSvg = renderPortraitSvg(model);

  // Generate stage SVGs (stages 1, 2, 4, 7)
  const stageSvgs: string[] = [
    buildStagedPortraitModel(model, 1).stagedSvgString, // Face
    buildStagedPortraitModel(model, 2).stagedSvgString, // Hair
    buildStagedPortraitModel(model, 4).stagedSvgString, // Features
    finalSvg,                                           // Final
  ];

  let photoBase64: string | undefined;
  if (fixture.requestId === 'fixture-long-female') {
    const photoPath = path.join(UPLOAD_DIR, 'media_1791835086280.jpg');
    if (fs.existsSync(photoPath)) {
      photoBase64 = `data:image/jpeg;base64,${fs.readFileSync(photoPath).toString('base64')}`;
    }
  }

  results.push({
    name: fixture.requestId,
    requestId: fixture.requestId,
    description: `Shape: ${fixture.faceShape.toUpperCase()} · Hair: ${fixture.hairEstimate.length} (${fixture.hairEstimate.style}) · Beard: ${fixture.facialHairEstimate.hasBeard ? fixture.facialHairEstimate.density : 'clean-shaven'}`,
    svg: finalSvg,
    photoBase64,
    stageSvgs,
  });
}

// Generate HTML contact sheet
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CodeMyFace — Final Acceptance Contact Sheet (Phase 8)</title>
  <style>
    :root {
      --bg: #090b0e;
      --card-bg: #11141a;
      --border: #232936;
      --accent: #8b5cf6;
      --cyan: #06b6d4;
      --text: #f3f4f6;
      --muted: #9ca3af;
    }
    body {
      margin: 0;
      padding: 32px;
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    }
    h1 {
      font-size: 1.8rem;
      font-weight: 700;
      margin-bottom: 8px;
    }
    p.subtitle {
      color: var(--muted);
      margin-bottom: 32px;
      font-size: 0.95rem;
    }
    .grid {
      display: flex;
      flex-direction: column;
      gap: 32px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
    }
    .card-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--accent);
    }
    .card-meta {
      font-size: 0.8rem;
      color: var(--cyan);
      font-family: monospace;
    }
    .comparison-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      align-items: start;
    }
    .view-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .view-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .media-box {
      width: 100%;
      max-width: 260px;
      aspect-ratio: 1;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border);
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .media-box img, .media-box svg {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .staged-row {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px dashed var(--border);
      display: flex;
      gap: 12px;
      align-items: center;
      overflow-x: auto;
    }
    .staged-box {
      width: 100px;
      height: 100px;
      border-radius: 6px;
      border: 1px solid var(--border);
      overflow: hidden;
      flex-shrink: 0;
    }
    .staged-box svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .staged-label {
      font-size: 0.65rem;
      color: var(--muted);
      text-align: center;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <h1>CodeMyFace — Final Acceptance Contact Sheet</h1>
  <p class="subtitle">Phase 8: Staged SVG Generation and Studio Polish · Multi-Fixture Acceptance Report</p>

  <div class="grid">
    ${results.map((res) => `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${res.name}</span>
          <span class="card-meta">${res.description}</span>
        </div>
        <div class="comparison-row">
          ${res.photoBase64 ? `
            <div class="view-cell">
              <span class="view-label">Original Photograph</span>
              <div class="media-box">
                <img src="${res.photoBase64}" alt="Original Photograph" />
              </div>
            </div>
          ` : `
            <div class="view-cell">
              <span class="view-label">Parametric Reference</span>
              <div class="media-box" style="color: #666; font-size: 0.75rem; text-align: center; padding: 12px;">
                Synthetic Anatomical Mesh Calibration
              </div>
            </div>
          `}
          <div class="view-cell">
            <span class="view-label">Generated Vector Art (100% SVG)</span>
            <div class="media-box">
              ${res.svg}
            </div>
          </div>
        </div>

        <div class="staged-row">
          <div>
            <div class="staged-box">${res.stageSvgs[0]}</div>
            <div class="staged-label">Stage 2: Face</div>
          </div>
          <div>
            <div class="staged-box">${res.stageSvgs[1]}</div>
            <div class="staged-label">Stage 3: Hair</div>
          </div>
          <div>
            <div class="staged-box">${res.stageSvgs[2]}</div>
            <div class="staged-label">Stage 5: Features</div>
          </div>
          <div>
            <div class="staged-box">${res.stageSvgs[3]}</div>
            <div class="staged-label">Stage 8: Final</div>
          </div>
        </div>
      </div>
    `).join('')}
  </div>
</body>
</html>
`;

const outputPath = path.join(ARTIFACT_DIR, 'final_contact_sheet.html');
fs.writeFileSync(outputPath, htmlContent, 'utf-8');
console.log(`Generated contact sheet successfully at: ${outputPath}`);
