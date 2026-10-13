# CodeMyFace — Manual Test Matrix & Quality Verification (Phase 2)

This document specifies the repeatable testing matrix for evaluating the Phase 2 Facial Geometry and Vector Recreation Engine across diverse real-world photographic inputs.

---

## 1. Quality Improvement Test Matrix

| Test Case ID | Test Category | Photo Characteristics | Expected Analysis & Quality Criteria |
| :--- | :--- | :--- | :--- |
| **TC-01** | **Standard Oval Face** | Balanced lighting, neutral expression, clean-shaven, medium-short hair. | • Classified as `OVAL`<br>• Balanced jawline and chin contour<br>• Clean Cupid's bow upper lip and dorsal nose plane<br>• Zero facial hair artifacts |
| **TC-02** | **Square Face & Jaw** | Strong angular jawline, wider cheek-to-jaw ratio. | • Classified as `SQUARE`<br>• Prominent mandibular corners (`leftMandibularCorner`, `rightMandibularCorner`)<br>• Flattened mental chin crest |
| **TC-03** | **Round Face** | Softer jaw curve, cheek width $\approx$ face height. | • Classified as `ROUND`<br>• Curvilinear lower jawline polygon<br>• Softer cheek transition planes |
| **TC-04** | **Oblong / Elongated** | High forehead, longer chin distance ($> 1.4\times$ cheek width). | • Classified as `OBLONG`<br>• Preserves individual vertical proportions and high temple placement |
| **TC-05** | **Heart-Shaped Face** | Wide forehead / temples tapering to a narrow chin. | • Classified as `HEART`<br>• Distinct tapered chin facet<br>• Wide temporal planes |
| **TC-06** | **Deep Skin Tone (Fitzpatrick V–VI)** | Darker complexions, warm/cool undertones. | • Multi-tone palette: deep espresso base `#5c3826`, rich shadow `#3d2316`, warm undertones<br>• High-contrast specular cheek and forehead planes<br>• Distinct limbal ring and catchlights |
| **TC-07** | **Fair Skin Tone (Fitzpatrick I–II)** | Pale / fair skin tone, pink/peach undertones. | • Delicate peach base `#f4d5c2`, warm rose shadows<br>• Crisp contrast against dark studio background |
| **TC-08** | **Full Beard & Moustache** | Substantial facial hair on chin, jaw, and upper lip. | • `hasMustache: true`, `hasFullBeard: true`<br>• Winged moustache framing philtrum without covering vermilion<br>• Two-tone beard: main face layer + under-jaw shadow layer<br>• Soul patch below lower lip + sideburn integration |
| **TC-09** | **Goatee / Chin Beard** | Facial hair confined to chin and mustache. | • `hasGoatee: true`, `hasFullBeard: false`<br>• Cheeks remain clean skin tone; beard confined to lower chin and soul patch |
| **TC-10** | **Clean-Shaven Face** | Zero facial hair. | • `hasBeard: false`, `hasMustache: false`<br>• Layer 9 remains empty / hidden<br>• Conservative fallback preserves bare skin without false stubble |
| **TC-11** | **Long Hair Drape** | Hair cascading past shoulders on both sides. | • Estimated as `long`<br>• Back hair drape polygon renders in Layer 2 (behind neck)<br>• Lateral locks frame jawline |
| **TC-12** | **Curly / Voluminous Hair** | High volume, texture above forehead. | • Estimated as `curly`<br>• Probed apex $> 0.25\times$ face height<br>• Multi-lock faceted strands and crown highlight polygons |
| **TC-13** | **Receding / Buzz Cut** | High forehead hairline exposure. | • Estimated as `receding`<br>• Hairline contour follows upper forehead landmarks<br>• Tightly cropped geometric crown volume |
| **TC-14** | **Directional Lighting (Left Key)** | Strong lighting on left side of face, right side in shadow. | • `lightDirection: 'left'` detected from cheek luminance<br>• Right cheek shadow facet, right nose sidewall shadow plane<br>• Left cheekbone and forehead highlight planes |
| **TC-15** | **Multi-Face Selfie** | Two people in frame. | • Detects multiple faces<br>• Deterministically ranks by area and center distance<br>• Primary face selected with user notice |
| **TC-16** | **No Face Detected** | Photo of landscape, pet, or abstract object. | • MediaPipe reports 0 faces<br>• UI displays `No Distinct Face Detected` warning<br>• Engine does not crash or generate spurious faces |

---

## 2. Verification Protocol for Each Test

1. **Upload & In-Memory Check**: Verify photo loads in under 1 second without server calls (`Network` tab confirms zero non-WASM network calls).
2. **Landmark Alignment**: Enable "Mesh" overlay in preview to confirm 478 MediaPipe 3D coordinates align with anatomical facial features.
3. **Generation**: Click "Generate Vector Portrait". Verify synthesis completes in $< 100$ ms.
4. **Visual Quality**:
   - Check that the portrait is clearly stylized flat-vector art (not a raster filter or blur).
   - Check that facial proportions (eye distance, jaw shape, nose size) reflect the user's individual characteristics.
   - Verify all 10 vector layers can be individually toggled using the "Layers" inspector.
5. **SVG Markup Validation**:
   - Inspect the left pane `portrait.svg` tab.
   - Verify valid XML, correct `viewBox="0 0 1000 1000"`, 10 semantic `<g>` groups, and zero `<image>` tags.
   - Test "Copy Code" and "Export SVG" downloads.
