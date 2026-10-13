/**
 * CodeMyFace — MediaPipe Landmark Index Map
 * 
 * Named indices into the 478-point MediaPipe Face Landmarker mesh.
 * These are the canonical landmark indices for facial feature extraction.
 * Reference: https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
 */

// === Face Oval / Silhouette ===
// The face oval contour in order (36 points, clockwise from right temple)
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const;

// === Jawline (subset of face oval — lower portion) ===
export const JAWLINE = [
  454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234,
] as const;

// === Left Eye (from viewer's perspective — person's right eye) ===
export const LEFT_EYE_CONTOUR = [
  33, 7, 163, 144, 145, 153, 154, 155, 133,
  173, 157, 158, 159, 160, 161, 246,
] as const;

export const LEFT_EYE_UPPER = [33, 246, 161, 160, 159, 158, 157, 173, 133] as const;
export const LEFT_EYE_LOWER = [33, 7, 163, 144, 145, 153, 154, 155, 133] as const;
export const LEFT_IRIS_CENTER = 468;
export const LEFT_IRIS = [468, 469, 470, 471, 472] as const;

// === Right Eye (from viewer's perspective — person's left eye) ===
export const RIGHT_EYE_CONTOUR = [
  362, 382, 381, 380, 374, 373, 390, 249,
  263, 466, 388, 387, 386, 385, 384, 398,
] as const;

export const RIGHT_EYE_UPPER = [362, 398, 384, 385, 386, 387, 388, 466, 263] as const;
export const RIGHT_EYE_LOWER = [362, 382, 381, 380, 374, 373, 390, 249, 263] as const;
export const RIGHT_IRIS_CENTER = 473;
export const RIGHT_IRIS = [473, 474, 475, 476, 477] as const;

// === Left Eyebrow ===
export const LEFT_EYEBROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46] as const;
export const LEFT_EYEBROW_UPPER = [70, 63, 105, 66, 107] as const;
export const LEFT_EYEBROW_LOWER = [46, 53, 52, 65, 55] as const;

// === Right Eyebrow ===
export const RIGHT_EYEBROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276] as const;
export const RIGHT_EYEBROW_UPPER = [300, 293, 334, 296, 336] as const;
export const RIGHT_EYEBROW_LOWER = [276, 283, 282, 295, 285] as const;

// === Nose ===
export const NOSE_BRIDGE = [6, 197, 195, 5, 4] as const;
export const NOSE_TIP = 4;
export const SUBNASALE = 2;
export const NASION = 168;
export const NOSE_BOTTOM = [97, 2, 326] as const;
export const NOSE_LEFT_WING = [48, 115, 220, 45, 4] as const;
export const NOSE_RIGHT_WING = [278, 344, 440, 275, 4] as const;
export const LEFT_NOSTRIL = 94;
export const RIGHT_NOSTRIL = 370;
export const LEFT_NOSTRIL_CONTOUR = [240, 97, 98, 2] as const;
export const RIGHT_NOSTRIL_CONTOUR = [460, 326, 327, 2] as const;
export const LEFT_NASAL_SIDEWALL = [197, 196, 236, 134] as const;
export const RIGHT_NASAL_SIDEWALL = [197, 419, 456, 363] as const;

// === Lips / Mouth ===
export const UPPER_LIP_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291] as const;
export const UPPER_LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308] as const;
export const LOWER_LIP_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291] as const;
export const LOWER_LIP_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308] as const;
export const MOUTH_CENTER = 13;

// === Forehead and Temples ===
export const FOREHEAD_TOP = 10;
export const TEMPLE_LEFT = 127;
export const TEMPLE_RIGHT = 356;
export const FOREHEAD_LEFT = 21;
export const FOREHEAD_RIGHT = 251;

// === Chin ===
export const CHIN_TIP = 152;

// === Cheeks ===
export const LEFT_CHEEK = 50;
export const RIGHT_CHEEK = 280;
export const LEFT_CHEEKBONE = 117;
export const RIGHT_CHEEKBONE = 346;

// === Key reference points ===
export const NOSE_ROOT = 6; // between the eyes at top of nose
export const GLABELLA = 9; // center between eyebrows
export const PHILTRUM = 164; // between nose and upper lip

// === Neck estimation anchors ===
// These are the lowest jaw points; neck is estimated below them
export const JAW_BOTTOM_LEFT = 172;
export const JAW_BOTTOM_RIGHT = 397;
export const JAW_CENTER = 152;

// === Ears (preauricular facial boundary anchors) ===
// In MediaPipe 468/478 mesh, indices 234 and 454 correspond to the lateral zygoma / preauricular sulcus
// on the facial boundary contour. MediaPipe Face Mesh does not track the outer pinna helix.
export const LEFT_PREAURICULAR_ANCHOR = 234;
export const RIGHT_PREAURICULAR_ANCHOR = 454;
export const LEFT_EAR_TIP = 234;
export const RIGHT_EAR_TIP = 454;

// === Shadow region references ===
// Points used for computing facial shadow regions
export const SHADOW_UNDER_LEFT_EYE = [111, 117, 118, 119, 120, 121, 128] as const;
export const SHADOW_UNDER_RIGHT_EYE = [340, 346, 347, 348, 349, 350, 357] as const;
export const SHADOW_NOSE_LEFT = [219, 218, 237, 44, 1] as const;
export const SHADOW_NOSE_RIGHT = [439, 438, 457, 274, 1] as const;

// === Forehead hairline landmarks ===
export const FOREHEAD_HAIRLINE = [109, 67, 103, 54, 21, 10, 251, 284, 332, 297, 338] as const;

// === Cheek structural planes ===
export const LEFT_CHEEK_PLANE = [116, 123, 147, 213, 192, 214] as const;
export const RIGHT_CHEEK_PLANE = [345, 352, 376, 433, 416, 434] as const;

// === Chin mental crest ===
export const CHIN_CREST = [176, 148, 152, 377, 400] as const;

// === Philtrum column ===
export const PHILTRUM_COLUMN = [2, 97, 164, 0, 326] as const;

// === Sideburns ===
export const LEFT_SIDEBURN = [234, 127, 162] as const;
export const RIGHT_SIDEBURN = [454, 356, 389] as const;

// === Eyelid superior crease / palpebral fold ===
export const LEFT_EYELID_CREASE = [226, 247, 30, 29, 27, 28, 56, 190, 243] as const;
export const RIGHT_EYELID_CREASE = [446, 467, 260, 259, 257, 258, 286, 414, 463] as const;

// === Nasolabial folds (smile lines framing mouth and cheek) ===
export const LEFT_NASOLABIAL = [205, 206, 207, 216, 212] as const;
export const RIGHT_NASOLABIAL = [425, 426, 427, 436, 432] as const;

// === Mental crease (groove between lower lip and chin) ===
export const MENTAL_CREASE = [18, 200, 199, 175, 152] as const;

