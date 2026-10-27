/**
 * Atelier Feature Flags
 *
 * Essential runtime feature flags for CodeMyFace V4.
 */

export interface FeatureFlags {
  paintingMix: boolean;
  sketchIntro: boolean;
  sizeOptimizer: boolean;
  debugMagentaBase: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  paintingMix: false,
  sketchIntro: false,
  sizeOptimizer: false,
  debugMagentaBase: false,
};

function getFlagValue(flagName: keyof FeatureFlags): boolean {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const urlVal = params.get(`flag_${flagName}`) ?? params.get(flagName);
    if (urlVal !== null) {
      return urlVal === '1' || urlVal === 'true' || urlVal === '';
    }

    try {
      const stored = localStorage.getItem(`codemyface_flag_${flagName}`);
      if (stored !== null) {
        return stored === '1' || stored === 'true';
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  return DEFAULT_FLAGS[flagName];
}

export const flags: FeatureFlags = {
  get paintingMix() {
    return getFlagValue('paintingMix');
  },
  get sketchIntro() {
    return getFlagValue('sketchIntro');
  },
  get sizeOptimizer() {
    return getFlagValue('sizeOptimizer');
  },
  get debugMagentaBase() {
    return getFlagValue('debugMagentaBase');
  },
};

export default flags;
