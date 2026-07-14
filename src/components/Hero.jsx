import { useEffect, useRef, useState } from 'react';
import { ArrowRight, PlayCircle, CheckCircle, Users, FileText, Clock } from 'lucide-react';

// ─── Cores de marca (fonte: BrandLogo.tsx) ────────────────────────────────────
const T = {
  blue:     '#1F4E5F',   // "Inclui" — azul institucional
  blueDk:   '#17404F',
  blueLt:   '#EBF3F6',
  orange:   '#E07B2A',   // "AI"    — laranja CTA
  orangeDk: '#C4661E',
  orangeLt: '#FEF3E8',
  green:    '#10B981',
  white:    '#FFFFFF',
  ink:      '#0F172A',
  textSec:  '#475569',
  border:   '#E2E8F0',
  surface:  '#F8FAFC',
};

// ─── Palavra com destaque circular desenhado à mão ────────────────────────────
const CircleWord = ({ children }) => (
  <span style={{ position: 'relative', display: 'inline-block', color: T.orange }}>
    {children}
    <svg
      viewBox="0 0 220 90"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: 'absolute', left: '-10%', top: '-32%',
        width: '120%', height: '160%',
        pointerEvents: 'none',
      }}
    >
      <path
        d="M 18 46 C 14 20, 55 6, 110 7 C 168 8, 208 22, 204 46 C 200 74, 155 86, 108 85 C 55 84, 16 70, 18 46 Z"
        fill="none"
        stroke={T.orange}
        strokeWidth="5"
        strokeLinecap="round"
        className="hr3-circle-path"
      />
    </svg>
  </span>
);

// ─── Faixa em movimento (marquee) ──────────────────────────────────────────────
const MARQUEE_WORDS = [
  'PEI', 'PDI', 'Estudo de Caso', 'Relatórios', 'Adaptações',
  'Plano de AEE', 'Inclusão', 'Gestão de Alunos', 'IA na Educação',
  'Organização', 'Produtividade',
];

export const MarqueeBand = () => {
  const track = [...MARQUEE_WORDS, ...MARQUEE_WORDS];
  return (
    <div className="hr3-marquee" role="presentation" aria-hidden="true">
      <div className="hr3-marquee-track">
        {track.map((word, i) => (
          <span className="hr3-marquee-item" key={`${word}-${i}`}>
            {word}
            <span className="hr3-marquee-dot">•</span>
          </span>
        ))}
      </div>
    </div>
  );
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const STYLES = `
  .hr3-root {
    background: linear-gradient(180deg, ${T.surface} 0%, ${T.white} 62%);
    padding: 108px 0 64px;
    overflow: hidden;
    position: relative;
  }

  .hr3-blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(4px);
    pointer-events: none;
    opacity: 0.5;
  }

  .hr3-container {
    max-width: 1160px;
    margin: 0 auto;
    padding: 0 28px;
    display: grid;
    grid-template-columns: 1.05fr 0.95fr;
    gap: 56px;
    align-items: center;
    position: relative;
  }

  .hr3-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: ${T.blueLt};
    color: ${T.blue};
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.10em;
    padding: 6px 16px;
    border-radius: 100px;
    margin-bottom: 22px;
    border: 1px solid rgba(31,78,95,0.15);
  }

  .hr3-headline {
    font-size: clamp(32px, 4.4vw, 56px);
    font-weight: 800;
    color: ${T.ink};
    letter-spacing: -0.04em;
    line-height: 1.08;
    margin: 0 0 22px;
  }

  .hr3-sub {
    font-size: 18px;
    color: ${T.textSec};
    line-height: 1.72;
    margin: 0 0 34px;
    max-width: 520px;
  }

  .hr3-cta-group {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 32px;
  }

  .hr3-btn-primary {
    background: ${T.orange};
    color: white;
    border: none;
    cursor: pointer;
    font-weight: 700;
    font-family: inherit;
    font-size: 16px;
    padding: 15px 30px;
    border-radius: 10px;
    min-height: 50px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
    text-decoration: none;
    touch-action: manipulation;
    box-shadow: 0 8px 24px rgba(224,123,42,0.30);
  }
  .hr3-btn-primary:hover  { background: ${T.orangeDk}; transform: translateY(-1px); box-shadow: 0 10px 28px rgba(224,123,42,0.38); }
  .hr3-btn-primary:active { transform: translateY(0); }
  .hr3-btn-primary:focus-visible { outline: 3px solid ${T.blue}; outline-offset: 2px; }

  .hr3-btn-secondary {
    background: transparent;
    color: ${T.blue};
    border: 2px solid ${T.blue};
    cursor: pointer;
    font-weight: 700;
    font-family: inherit;
    font-size: 16px;
    padding: 13px 26px;
    border-radius: 10px;
    min-height: 50px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: background 0.2s, color 0.2s;
    touch-action: manipulation;
  }
  .hr3-btn-secondary:hover { background: ${T.blue}; color: white; }
  .hr3-btn-secondary:focus-visible { outline: 3px solid ${T.orange}; outline-offset: 2px; }

  .hr3-trust {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 26px;
    align-items: center;
  }

  .hr3-trust-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
    color: ${T.textSec};
    font-weight: 600;
  }

  .hr3-trust-item b {
    color: ${T.ink};
    font-weight: 800;
  }

  /* ── Visual ── */
  .hr3-visual {
    position: relative;
    display: flex;
    justify-content: center;
  }

  .hr3-photo-card {
    position: relative;
    width: 100%;
    max-width: 480px;
    height: 420px;
    border-radius: 28px;
    background:
      radial-gradient(circle at 28% 18%, rgba(31,78,95,0.10), transparent 55%),
      linear-gradient(160deg, ${T.blueLt} 0%, ${T.white} 52%, ${T.orangeLt} 100%);
    box-shadow: 0 30px 70px rgba(31,78,95,0.16), 0 4px 16px rgba(31,78,95,0.08);
    overflow: visible;
    will-change: transform;
  }

  .hr3-photo-ground {
    position: absolute;
    bottom: 18px;
    left: 50%;
    transform: translateX(-50%);
    width: 62%;
    height: 26px;
    background: rgba(31,78,95,0.16);
    filter: blur(14px);
    border-radius: 50%;
  }

  .hr3-photo-card img {
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    width: auto;
    height: 122%;
    max-width: none;
    object-fit: contain;
    display: block;
    filter: drop-shadow(0 26px 34px rgba(31,78,95,0.22));
  }

  .hr3-photo-badge {
    position: absolute;
    left: -20px;
    bottom: 26px;
    background: white;
    border-radius: 14px;
    padding: 14px 18px;
    box-shadow: 0 14px 36px rgba(15,42,61,0.18);
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 240px;
    z-index: 2;
  }

  .hr3-photo-badge-icon {
    width: 38px; height: 38px; border-radius: 10px;
    background: #D1FAE5;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  /* ── Marquee ── */
  .hr3-marquee {
    background: ${T.blue};
    overflow: hidden;
    padding: 16px 0;
    position: relative;
  }
  .hr3-marquee-track {
    display: flex;
    width: max-content;
    animation: hr3-scroll 32s linear infinite;
  }
  .hr3-marquee-item {
    display: inline-flex;
    align-items: center;
    gap: 20px;
    font-size: 15px;
    font-weight: 700;
    color: rgba(255,255,255,0.92);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0 20px;
    white-space: nowrap;
  }
  .hr3-marquee-dot {
    color: ${T.orange};
    margin-left: 20px;
  }
  @keyframes hr3-scroll {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }

  @media (max-width: 900px) {
    .hr3-container {
      grid-template-columns: 1fr;
      gap: 44px;
      text-align: center;
    }
    .hr3-cta-group { justify-content: center; }
    .hr3-trust { justify-content: center; }
    .hr3-sub { margin-left: auto; margin-right: auto; }
    .hr3-visual { max-width: 380px; margin: 0 auto; }
    .hr3-photo-card { height: 340px; }
    .hr3-photo-badge { left: 12px; }
  }

  @media (max-width: 480px) {
    .hr3-root { padding: 96px 0 48px; }
    .hr3-cta-group { flex-direction: column; }
    .hr3-btn-primary, .hr3-btn-secondary { justify-content: center; width: 100%; }
    .hr3-photo-card { height: 300px; max-width: 320px; }
    .hr3-photo-badge { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .hr3-btn-primary, .hr3-btn-secondary, .hr3-photo-card { transition: none !important; transform: none !important; }
    .hr3-marquee-track { animation: none; }
    .hr3-circle-path { stroke-dasharray: none !important; }
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────
export default function Hero({ onRegister }) {
  const photoRef = useRef(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);

    if (mq.matches || window.innerWidth < 900) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (photoRef.current) {
          const offset = Math.min(window.scrollY * 0.06, 28);
          photoRef.current.style.transform = `translateY(${offset}px)`;
        }
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <section className="hr3-root" aria-labelledby="hero-headline">
        <style>{STYLES}</style>

        <div className="hr3-blob" style={{ width: 420, height: 420, background: T.orangeLt, top: -140, right: -80 }} />
        <div className="hr3-blob" style={{ width: 320, height: 320, background: T.blueLt, bottom: -100, left: -100 }} />

        <div className="hr3-container">
          {/* ── Texto ── */}
          <div>
            <div className="hr3-pill">
              <FileText size={13} aria-hidden="true" />
              Educação Inclusiva · Documentação com IA
            </div>

            <h1 id="hero-headline" className="hr3-headline">
              Menos burocracia.<br />
              Mais <CircleWord>tempo</CircleWord> com o aluno.
            </h1>

            <p className="hr3-sub">
              O IncluiAI ajuda professores, profissionais do AEE, coordenadores e equipes
              pedagógicas a criar PEI, PDI, relatórios, estudos de caso e documentos
              pedagógicos com mais rapidez, organização e inteligência.
            </p>

            <div className="hr3-cta-group">
              <button className="hr3-btn-primary" onClick={onRegister}>
                Quero conhecer o IncluiAI <ArrowRight size={17} aria-hidden="true" />
              </button>
              <button className="hr3-btn-secondary" onClick={() => scrollTo('como-funciona')}>
                <PlayCircle size={18} aria-hidden="true" /> Ver como funciona
              </button>
            </div>

            <div className="hr3-trust" role="list" aria-label="Números do IncluiAI">
              <div className="hr3-trust-item" role="listitem">
                <Users size={15} color={T.blue} aria-hidden="true" />
                <span><b>+1.800</b> profissionais ativos</span>
              </div>
              <div className="hr3-trust-item" role="listitem">
                <FileText size={15} color={T.blue} aria-hidden="true" />
                <span><b>+12.000</b> documentos gerados</span>
              </div>
              <div className="hr3-trust-item" role="listitem">
                <Clock size={15} color={T.blue} aria-hidden="true" />
                <span><b>&lt; 2 min</b> por documento</span>
              </div>
            </div>
          </div>

          {/* ── Visual ── */}
          <div className="hr3-visual">
            <div className="hr3-photo-card" ref={photoRef}>
              <div className="hr3-photo-ground" aria-hidden="true" />
              <img
                src="/images/hero-leveza.png"
                alt="Professora sorridente segurando um livro aberto, simbolizando mais leveza e tempo para o aluno"
                loading="eager"
              />
            </div>
            <div className="hr3-photo-badge" aria-hidden="true">
              <div className="hr3-photo-badge-icon">
                <CheckCircle size={20} color={T.green} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, lineHeight: 1.3 }}>Documento pronto</div>
                <div style={{ fontSize: 12, color: T.textSec }}>em menos de 2 minutos</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarqueeBand />
    </>
  );
}