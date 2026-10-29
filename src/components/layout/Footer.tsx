import React from 'react';
import { ShieldCheck, ExternalLink, ArrowUpRight } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="studio-footer" role="contentinfo">
      <div className="studio-footer__inner">
        {/* Brand & Purpose Column */}
        <div className="studio-footer__brand-col">
          <div className="studio-footer__wordmark">
            CodeMy<em className="v4-wordmark-face">Picture</em>
          </div>
          <p className="studio-footer__tagline">
            Photograph to Scalable Vector Graphics reconstruction studio. Converts portrait and scene
            photographs into genuine, editable SVG code directly inside local browser memory.
          </p>
          <div className="studio-footer__privacy-note mono">
            <ShieldCheck size={13} style={{ color: 'var(--moss)' }} />
            <span>100% In-Browser Execution · Zero Cloud Uploads</span>
          </div>
        </div>

        {/* Navigation & Live Deployment */}
        <div className="studio-footer__links-col">
          <div className="studio-footer__col-heading mono">DEPLOYMENT & REPO</div>
          <ul className="studio-footer__link-list">
            <li>
              <a
                href="https://codemypicture.netlify.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="studio-footer__link studio-footer__link--highlight"
                title="Open deployed live website at codemypicture.netlify.app"
              >
                <span>codemypicture.netlify.app</span>
                <ExternalLink size={12} />
              </a>
            </li>
            <li>
              <a
                href="https://github.com/parthmandore/CodeMyPicture"
                target="_blank"
                rel="noopener noreferrer"
                className="studio-footer__link"
                title="View repository on GitHub"
              >
                <span>GitHub Repository</span>
                <ArrowUpRight size={12} />
              </a>
            </li>
          </ul>
        </div>

        {/* Modes & Architecture Column */}
        <div className="studio-footer__links-col">
          <div className="studio-footer__col-heading mono">SYNTHESIS MODES</div>
          <ul className="studio-footer__link-list">
            <li className="studio-footer__item-static">
              <span className="mono">01 //</span> Painting Studio (Organic Planes)
            </li>
            <li className="studio-footer__item-static">
              <span className="mono">02 //</span> Photographic Recreation (High Fidelity)
            </li>
            <li className="studio-footer__item-static">
              <span className="mono">03 //</span> Dual Quality (High / Low Tiers)
            </li>
            <li className="studio-footer__item-static">
              <span className="mono">04 //</span> 11 Engineering Diagnostic Metrics
            </li>
          </ul>
        </div>

        {/* Technical Stack Column */}
        <div className="studio-footer__links-col">
          <div className="studio-footer__col-heading mono">SPECIFICATIONS</div>
          <ul className="studio-footer__link-list mono">
            <li className="studio-footer__item-static">Vite 8 · React 19 · TypeScript</li>
            <li className="studio-footer__item-static">MediaPipe Vision WASM</li>
            <li className="studio-footer__item-static">Web Workers Vector Tracing</li>
            <li className="studio-footer__item-static">CodeMirror 6 Atelier Theme</li>
          </ul>
        </div>
      </div>

      {/* Bottom Bar: Copyright & Restrained Note */}
      <div className="studio-footer__bottom mono">
        <div className="studio-footer__copy">
          © {new Date().getFullYear()} CodeMyPicture. All rights reserved.
        </div>
        <div className="studio-footer__meta">
          <span>LIVE ATELIER v4.0</span>
          <span className="studio-footer__bullet">·</span>
          <span>CLIENT-SIDE SYNTHESIS</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
