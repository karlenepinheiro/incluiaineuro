import { useEffect, useState, useRef, useCallback } from 'react';

// ─── Conteúdo por fase ────────────────────────────────────────────────────────
const CONTENT = {
  dor: {
    headline: 'Quando foi seu último fim de semana livre?',
    highlight: 'Com o IncluiAI, você para de levar trabalho para casa.',
    sub: 'Documentos pedagógicos gerados em minutos. Com padrão profissional. Sem retrabalho.',
    bullets: [
      'Pronto em menos de 2 minutos',
      'PDF profissional, pronto para assinar',
    ],
    accentColor: '#2563EB',
    image: '/images/hero-dor.jpg',
  },
  leveza: {
    headline: 'Seus alunos merecem uma professora descansada.',
    highlight: 'Você merece tempo de volta.',
    sub: 'Mais de 1.800 professoras já economizam horas toda semana com o IncluiAI.',
    bullets: [
      'Sem domingo de trabalho',
      'Histórico real de cada aluno',
    ],
    accentColor: '#16A34A',
    image: '/images/hero-leveza.jpg',
  },
};

// ─── Timings ──────────────────────────────────────────────────────────────────
const DELAY_DOR_MS     = 4000;
const DELAY_LEVEZA_MS  = 6000;
const BG_FADE_MS       = 1000;
const TEXT_FADE_OUT_MS = 320;
const TEXT_FADE_IN_MS  = 480;

// ─── Helper: formata segundos em HH:MM:SS ────────────────────────────────────
const formatTime = (totalSeconds) => {
  const h   = Math.floor(totalSeconds / 3600);
  const m   = Math.floor((totalSeconds % 3600) / 60);
  const s   = totalSeconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
};

// ─── Estilos ──────────────────────────────────────────────────────────────────
const STYLES = `
  /* Reset */
  .hr-root *, .hr-root *::before, .hr-root *::after { box-sizing: border-box; }

  /* ── Seção ── */
  .hr-root {
    position: relative;
    min-height: 100vh;
    min-height: 100svh; /* suporte a viewport real em mobile */
    display: flex;
    align-items: center;
    overflow: hidden;
    isolation: isolate;
  }

  /* ── Camadas de background ──
     inset: -10% -2% cria área extra para o parallax do desktop não
     mostrar borda branca quando translateY desloca a imagem.
     No mobile o parallax é desligado, então inset: 0 é suficiente.
  */
  .hr-bg {
    position: absolute;
    inset: -10% -2%;
    background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
    will-change: transform, opacity;
    transition: opacity ${BG_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
    z-index: 0;
  }

  /* ── Overlay gradiente — leitura sem esconder a imagem ── */
  .hr-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to right,
      rgba(255,255,255,0.92) 30%,
      rgba(255,255,255,0.50) 60%,
      rgba(255,255,255,0.15) 100%
    );
    z-index: 1;
    pointer-events: none;
  }

  /* ── Wrapper do conteúdo ── */
  .hr-content {
    position: relative;
    z-index: 2;
    width: 100%;
    max-width: 600px;
    padding: 128px 56px 96px 72px;
    opacity: 0;
    transform: translateY(32px);
    transition: opacity 0.8s cubic-bezier(0.22,1,0.36,1),
                transform 0.8s cubic-bezier(0.22,1,0.36,1);
  }

  .hr-content.hr-mounted {
    opacity: 1;
    transform: translateY(0);
  }

  /* ── Bloco de texto ── */
  .hr-text {
    animation: hr-text-in ${TEXT_FADE_IN_MS}ms cubic-bezier(0.22,1,0.36,1) both;
  }

  .hr-text.hr-text-out {
    animation: hr-text-out ${TEXT_FADE_OUT_MS}ms ease forwards;
  }

  @keyframes hr-text-in {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes hr-text-out {
    from { opacity: 1; transform: translateY(0); }
    to   { opacity: 0; transform: translateY(-12px); }
  }

  /* ── Tipografia ── */
  .hr-headline {
    font-size: clamp(26px, 4vw, 50px);
    font-weight: 900;
    color: #0F172A;
    line-height: 1.1;
    letter-spacing: -0.04em;
    margin: 0 0 16px 0;
  }

  .hr-highlight {
    display: block;
    font-size: clamp(18px, 2.8vw, 36px);
    font-weight: 800;
    line-height: 1.18;
    letter-spacing: -0.03em;
    margin-bottom: 22px;
    transition: color 0.6s ease;
  }

  .hr-sub {
    font-size: clamp(14px, 1.4vw, 17px);
    color: #475569;
    line-height: 1.78;
    max-width: 500px;
    margin: 0 0 14px 0;
  }

  /* ── Prova social ── */
  .hr-social-proof {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 20px 0;
    font-size: 13.5px;
    font-weight: 600;
    color: #64748B;
    animation: hr-text-in ${TEXT_FADE_IN_MS}ms cubic-bezier(0.22,1,0.36,1) both;
  }

  .hr-social-proof svg {
    flex-shrink: 0;
    color: #16A34A;
  }

  /* ── Contador ── */
  .hr-counter {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    margin: 0 0 28px 0;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }

  .hr-counter-label {
    color: #94A3B8;
  }

  .hr-counter-time {
    font-family: 'Courier New', Courier, monospace;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.04em;
    transition: color 0.6s ease;
  }

  .hr-counter-suffix {
    font-weight: 600;
    transition: color 0.6s ease;
  }

  /* ── Indicadores de fase ── */
  .hr-dots {
    display: flex;
    gap: 8px;
    margin-bottom: 32px;
  }

  .hr-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    padding: 0;
    background: #CBD5E1;
    transition: background 0.4s ease, transform 0.3s ease, width 0.4s ease;
  }

  .hr-dot.active {
    width: 24px;
    border-radius: 4px;
    background: #2563EB;
    transform: scale(1);
  }

  /* ── CTAs ── */
  .hr-ctas {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    align-items: center;
  }

  /* ── Botão primário ── */
  .hr-btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: #2563EB;
    color: #ffffff;
    font-size: 16px;
    font-weight: 700;
    padding: 16px 34px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    text-decoration: none;
    box-shadow: 0 8px 28px rgba(37,99,235,0.30);
    transition:
      background 0.2s ease,
      transform 0.2s cubic-bezier(0.34,1.56,0.64,1),
      box-shadow 0.2s ease;
    font-family: inherit;
    white-space: nowrap;
    letter-spacing: -0.01em;
    position: relative;
    overflow: hidden;
  }

  .hr-btn-primary::after {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(255,255,255,0);
    transition: background 0.15s ease;
  }

  .hr-btn-primary:hover {
    background: #1D4ED8;
    transform: translateY(-3px) scale(1.03);
    box-shadow: 0 18px 44px rgba(37,99,235,0.45);
    color: #ffffff;
  }

  .hr-btn-primary:active {
    transform: translateY(0) scale(0.97);
    box-shadow: 0 4px 16px rgba(37,99,235,0.25);
  }

  .hr-btn-primary:active::after {
    background: rgba(255,255,255,0.18);
  }

  @keyframes hr-btn-pulse {
    0%   { box-shadow: 0 8px 28px rgba(37,99,235,0.30); transform: scale(1); }
    40%  { box-shadow: 0 0 0 10px rgba(37,99,235,0.12); transform: scale(1.04); }
    70%  { box-shadow: 0 0 0 18px rgba(37,99,235,0.04); transform: scale(1.01); }
    100% { box-shadow: 0 8px 28px rgba(37,99,235,0.30); transform: scale(1); }
  }

  .hr-btn-primary.hr-btn-attract {
    animation: hr-btn-pulse 0.7s cubic-bezier(0.22,1,0.36,1);
  }

  .hr-btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    color: #2563EB;
    font-size: 15px;
    font-weight: 700;
    padding: 15px 26px;
    border-radius: 10px;
    border: 2px solid #2563EB;
    cursor: pointer;
    text-decoration: none;
    transition:
      background 0.2s ease,
      color 0.2s ease,
      transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
    font-family: inherit;
    white-space: nowrap;
  }

  .hr-btn-secondary:hover {
    background: #2563EB;
    color: #ffffff;
    transform: translateY(-2px) scale(1.01);
  }

  .hr-btn-secondary:active {
    transform: translateY(0) scale(0.98);
  }

  /* ── Badge A/B ── */
  .hr-ab-badge {
    position: absolute;
    top: 20px;
    right: 20px;
    z-index: 10;
    background: rgba(37,99,235,0.12);
    color: #2563EB;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    padding: 4px 10px;
    border-radius: 100px;
    border: 1px solid rgba(37,99,235,0.25);
    pointer-events: none;
    font-family: monospace;
  }

  /* ─── TABLET (769px – 1024px) ────────────────────────────────────────────── */
  @media (max-width: 1024px) {
    .hr-content {
      padding: 112px 48px 80px 56px;
      max-width: 520px;
    }
  }

  /* ─── MOBILE (≤ 768px) ───────────────────────────────────────────────────── */
  @media (max-width: 768px) {
    /* Altura: usar svh para descontar a barra do browser */
    .hr-root {
      min-height: 80vh;
      min-height: 80svh;
      align-items: flex-start;
    }

    /*
      No mobile o parallax JS está desligado, então a div .hr-bg
      não precisa de área extra — inset: 0 mantém a imagem exata.
      background-position: 65% center mantém o foco na pessoa/sujeito
      mesmo em telas estreitas (ajuste o valor conforme a composição
      real das suas imagens).
    */
    .hr-bg {
      inset: 0;
      background-position: 65% center;
      background-size: cover;
      /* transform vira "none" via prop JS — esta regra é fallback */
      transform: none !important;
    }

    /*
      Overlay mais opaco embaixo para texto ficar legível quando
      a imagem aparece na parte inferior da hero em mobile.
    */
    .hr-overlay {
      background: linear-gradient(
        to bottom,
        rgba(255,255,255,0.96) 45%,
        rgba(255,255,255,0.82) 70%,
        rgba(255,255,255,0.50) 100%
      );
    }

    .hr-content {
      padding: 80px 24px 56px 24px;
      max-width: 100%;
      text-align: center;
    }

    .hr-sub {
      max-width: 100%;
    }

    .hr-dots {
      justify-content: center;
    }

    .hr-social-proof {
      justify-content: center;
    }

    .hr-counter {
      justify-content: center;
    }

    .hr-ctas {
      flex-direction: column;
      align-items: stretch;
    }

    .hr-btn-primary,
    .hr-btn-secondary {
      width: 100%;
      justify-content: center;
      font-size: 15px;
    }

    .hr-ab-badge {
      display: none;
    }
  }

  /* ─── MOBILE PEQUENO (≤ 480px) ───────────────────────────────────────────── */
  @media (max-width: 480px) {
    .hr-root {
      min-height: 85vh;
      min-height: 85svh;
    }

    .hr-content {
      padding: 72px 18px 48px 18px;
    }

    /* Foco ainda mais à direita em telas muito estreitas */
    .hr-bg {
      background-position: 70% center;
    }
  }
`;

// ─── Ícones inline ────────────────────────────────────────────────────────────
const ArrowIcon = () => (
  <svg
    width="17" height="17" viewBox="0 0 24 24"
    fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const CheckIcon = () => (
  <svg
    width="15" height="15" viewBox="0 0 24 24"
    fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

// ─── Componente ───────────────────────────────────────────────────────────────
const Hero = ({ onRegister }) => {

  // A/B test — persiste no localStorage
  const variant = useRef(null);
  if (!variant.current) {
    const stored = localStorage.getItem('heroVariant');
    if (stored === 'A' || stored === 'B') {
      variant.current = stored;
    } else {
      variant.current = Math.random() > 0.5 ? 'A' : 'B';
      localStorage.setItem('heroVariant', variant.current);
    }
  }

  // Estado da fase atual
  const [bgPhase, setBgPhase]           = useState('dor');
  const [textContent, setTextContent]   = useState(CONTENT.dor);
  const [textKey, setTextKey]           = useState(0);
  const [textOut, setTextOut]           = useState(false);
  const [mounted, setMounted]           = useState(false);
  const [parallaxY, setParallaxY]       = useState(0);

  // Controle do pulso de atenção no botão
  const [btnAttract, setBtnAttract] = useState(false);

  // Detecta mobile de forma reativa para desligar parallax
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 768
  );

  const sectionRef   = useRef(null);
  const cycleTimeout = useRef(null);
  const currentPhase = useRef('dor');

  // ─── Fade-in inicial ───────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  // ─── Pulso de atenção no botão após 3s ───────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setBtnAttract(true);
      // Remove a classe após a animação terminar para poder re-disparar se precisar
      setTimeout(() => setBtnAttract(false), 800);
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  // ─── Detecta resize para ligar/desligar parallax reativamente ───────────
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => {
      setIsMobile(e.matches);
      if (e.matches) setParallaxY(0); // zera ao entrar em mobile
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ─── Parallax suave no scroll (só desktop) ───────────────────────────────
  useEffect(() => {
    const onScroll = () => {
      if (!sectionRef.current) return;
      const { bottom } = sectionRef.current.getBoundingClientRect();
      if (bottom > 0) setParallaxY(window.scrollY);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ─── Ciclo automático DOR → LEVEZA → DOR (loop) ───────────────────────────
  const scheduleNext = useCallback(() => {
    const phase = currentPhase.current;
    const delay = phase === 'dor' ? DELAY_DOR_MS : DELAY_LEVEZA_MS;

    cycleTimeout.current = setTimeout(() => {
      const next = phase === 'dor' ? 'leveza' : 'dor';

      setTextOut(true);
      setBgPhase(next);

      setTimeout(() => {
        currentPhase.current = next;
        setTextContent(CONTENT[next]);
        setTextKey(k => k + 1);
        setTextOut(false);
        scheduleNext();
      }, TEXT_FADE_OUT_MS + 40);

    }, delay);
  }, []);

  useEffect(() => {
    scheduleNext();
    return () => { if (cycleTimeout.current) clearTimeout(cycleTimeout.current); };
  }, [scheduleNext]);

  // ─── Navegação manual pelos dots ─────────────────────────────────────────
  const goToPhase = (target) => {
    if (target === currentPhase.current) return;
    if (cycleTimeout.current) clearTimeout(cycleTimeout.current);

    setTextOut(true);
    setBgPhase(target);

    setTimeout(() => {
      currentPhase.current = target;
      setTextContent(CONTENT[target]);
      setTextKey(k => k + 1);
      setTextOut(false);
      scheduleNext();
    }, TEXT_FADE_OUT_MS + 40);
  };

  // ─── Botão primário por variante ─────────────────────────────────────────
  const kiwifyMaster = import.meta.env?.VITE_KIWIFY_CHECKOUT_MASTER_ANNUAL || '#';

  const handleRegister = (e) => {
    e.preventDefault();
    if (onRegister) onRegister();
    else window.location.href = '/cadastro';
  };

  const btnClass = `hr-btn-primary${btnAttract ? ' hr-btn-attract' : ''}`;

  const primaryBtn = variant.current === 'A' ? (
    <a
      href="/cadastro"
      className={btnClass}
      onClick={handleRegister}
    >
      Começar grátis agora <ArrowIcon />
    </a>
  ) : (
    <a
      href={kiwifyMaster}
      className={btnClass}
      target="_blank"
      rel="noopener noreferrer"
    >
      Começar grátis agora <ArrowIcon />
    </a>
  );

  // Parallax — desligado em mobile para evitar enquadramento errado da imagem
  const bgTransform = isMobile
    ? 'none'
    : `scale(1.1) translateY(${-(parallaxY * 0.18)}px)`;

  return (
    <>
      <style>{STYLES}</style>

      <section
        ref={sectionRef}
        className="hr-root"
        aria-label="Seção principal"
      >
        {/* ── Backgrounds com crossfade ── */}
        <div
          aria-hidden="true"
          className="hr-bg"
          style={{
            backgroundImage: `url(${CONTENT.dor.image})`,
            opacity: bgPhase === 'dor' ? 1 : 0,
            transform: bgTransform,
          }}
        />
        <div
          aria-hidden="true"
          className="hr-bg"
          style={{
            backgroundImage: `url(${CONTENT.leveza.image})`,
            opacity: bgPhase === 'leveza' ? 1 : 0,
            transform: bgTransform,
          }}
        />

        {/* ── Overlay ── */}
        <div className="hr-overlay" aria-hidden="true" />

        {/* ── Conteúdo ── */}
        <div className={`hr-content${mounted ? ' hr-mounted' : ''}`}>

          {/* Bloco de texto — key força re-mount e re-animação */}
          <div
            key={textKey}
            className={`hr-text${textOut ? ' hr-text-out' : ''}`}
          >
            <h1 className="hr-headline">{textContent.headline}</h1>

            <span
              className="hr-highlight"
              style={{ color: textContent.accentColor }}
            >
              {textContent.highlight}
            </span>

            <p className="hr-sub">{textContent.sub}</p>

            {/* Bullets */}
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(textContent.bullets || []).map(b => (
                <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600, color: '#1E293B' }}>
                  <span style={{ flexShrink: 0, color: '#16A34A' }}><CheckIcon /></span>
                  {b}
                </li>
              ))}
            </ul>

            {/* Prova social */}
            <div className="hr-social-proof">
              <CheckIcon />
              +1.800 professoras já usam o IncluiAI no dia a dia
            </div>
          </div>

          {/* Indicadores de fase (clicáveis) */}
          <div className="hr-dots" role="tablist" aria-label="Navegar entre fases">
            <button
              className={`hr-dot${bgPhase === 'dor' ? ' active' : ''}`}
              onClick={() => goToPhase('dor')}
              aria-label="Ver fase: dor"
              aria-selected={bgPhase === 'dor'}
              role="tab"
            />
            <button
              className={`hr-dot${bgPhase === 'leveza' ? ' active' : ''}`}
              onClick={() => goToPhase('leveza')}
              aria-label="Ver fase: leveza"
              aria-selected={bgPhase === 'leveza'}
              role="tab"
            />
          </div>

          {/* CTAs */}
          <div className="hr-ctas">
            {primaryBtn}
            <a
              href="#como-funciona"
              className="hr-btn-secondary"
              onClick={e => { e.preventDefault(); document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' }); }}
            >
              Ver como funciona
            </a>
          </div>
        </div>

        {/* Badge A/B — visível só em dev */}
        {import.meta.env?.DEV && (
          <div className="hr-ab-badge" aria-hidden="true">
            VARIANT {variant.current}
          </div>
        )}
      </section>
    </>
  );
};

export default Hero;
