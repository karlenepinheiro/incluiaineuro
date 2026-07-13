import { ArrowRight, CheckCircle, FileText, ClipboardList, GraduationCap } from 'lucide-react';

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

// ─── Product preview SVG (dados anonimizados) ─────────────────────────────────
const ProductPreview = () => (
  <svg
    viewBox="0 0 420 480"
    xmlns="http://www.w3.org/2000/svg"
    style={{ width: '100%', maxWidth: 420, height: 'auto', display: 'block' }}
    role="img"
    aria-label="Prévia da interface do IncluiAI mostrando documentos gerados"
  >
    <defs>
      <filter id="hr-shadow">
        <feDropShadow dx="0" dy="8" stdDeviation="18" floodColor="#1F4E5F" floodOpacity="0.12"/>
      </filter>
    </defs>
    <rect x="8" y="8" width="404" height="464" rx="16" fill="white" filter="url(#hr-shadow)"/>
    <rect x="8" y="8" width="404" height="52" rx="16" fill={T.blue}/>
    <rect x="8" y="34" width="404" height="26" fill={T.blue}/>
    <text x="28" y="39" fill="white" fontSize="13" fontWeight="700" fontFamily="system-ui">IncluiAI</text>
    <text x="394" y="39" fill="rgba(255,255,255,0.5)" fontSize="10" fontFamily="system-ui" textAnchor="end">Painel do Profissional</text>

    <rect x="24" y="72" width="372" height="56" rx="10" fill={T.surface} stroke={T.border} strokeWidth="1"/>
    <rect x="36" y="84" width="32" height="32" rx="8" fill={T.blueLt} stroke={T.blue} strokeWidth="1.5"/>
    <text x="52" y="104" textAnchor="middle" fill={T.blue} fontSize="14" fontWeight="700" fontFamily="system-ui">A</text>
    <text x="80" y="93" fill={T.textSec} fontSize="9" fontWeight="700" fontFamily="system-ui" letterSpacing="0.06em">ALUNO</text>
    <text x="80" y="109" fill={T.ink} fontSize="13" fontWeight="600" fontFamily="system-ui">Estudante · 3º ano · Ensino Fundamental</text>
    <rect x="355" y="84" width="38" height="18" rx="9" fill="#D1FAE5"/>
    <text x="374" y="96" textAnchor="middle" fill={T.green} fontSize="10" fontWeight="700" fontFamily="system-ui">Ativo</text>

    <text x="24" y="152" fill={T.textSec} fontSize="10" fontWeight="700" fontFamily="system-ui" letterSpacing="0.08em">DOCUMENTOS GERADOS</text>

    {/* Doc 1 - Protocolo */}
    <rect x="24" y="162" width="372" height="56" rx="10" fill="white" stroke={T.border} strokeWidth="1.5"/>
    <rect x="36" y="174" width="32" height="32" rx="8" fill={T.blueLt}/>
    <text x="52" y="194" textAnchor="middle" fill={T.blue} fontSize="18" fontFamily="system-ui">📄</text>
    <text x="80" y="185" fill={T.ink} fontSize="12" fontWeight="700" fontFamily="system-ui">Protocolo de Aprendizagem</text>
    <text x="80" y="200" fill={T.textSec} fontSize="11" fontFamily="system-ui">Gerado em 1 min 42s · PDF pronto</text>
    <rect x="330" y="176" width="54" height="20" rx="5" fill={T.orange}/>
    <text x="357" y="190" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="system-ui">Baixar</text>

    {/* Doc 2 - PEI */}
    <rect x="24" y="228" width="372" height="56" rx="10" fill="white" stroke={T.border} strokeWidth="1.5"/>
    <rect x="36" y="240" width="32" height="32" rx="8" fill={T.orangeLt}/>
    <text x="52" y="259" textAnchor="middle" fill={T.orange} fontSize="18" fontFamily="system-ui">📋</text>
    <text x="80" y="251" fill={T.ink} fontSize="12" fontWeight="700" fontFamily="system-ui">PEI — Plano Educacional Individualizado</text>
    <text x="80" y="266" fill={T.textSec} fontSize="11" fontFamily="system-ui">Gerado em 2 min 18s · SHA-256 · LGPD</text>
    <rect x="330" y="242" width="54" height="20" rx="5" fill={T.blueLt} stroke={T.blue} strokeWidth="1"/>
    <text x="357" y="256" textAnchor="middle" fill={T.blue} fontSize="10" fontWeight="700" fontFamily="system-ui">Baixar</text>

    {/* Doc 3 - PAEE */}
    <rect x="24" y="294" width="372" height="56" rx="10" fill="white" stroke={T.border} strokeWidth="1.5"/>
    <rect x="36" y="306" width="32" height="32" rx="8" fill="#D1FAE5"/>
    <text x="52" y="325" textAnchor="middle" fill={T.green} fontSize="18" fontFamily="system-ui">🎓</text>
    <text x="80" y="317" fill={T.ink} fontSize="12" fontWeight="700" fontFamily="system-ui">PAEE — Plano de AEE</text>
    <text x="80" y="332" fill={T.textSec} fontSize="11" fontFamily="system-ui">Gerado em 1 min 55s · Assinatura digital</text>
    <rect x="330" y="308" width="54" height="20" rx="5" fill="#D1FAE5" stroke={T.green} strokeWidth="1"/>
    <text x="357" y="322" textAnchor="middle" fill={T.green} fontSize="10" fontWeight="700" fontFamily="system-ui">Baixar</text>

    {/* Gerando */}
    <rect x="24" y="362" width="372" height="56" rx="10" fill={T.surface} stroke={T.border} strokeWidth="1" strokeDasharray="4,2"/>
    <rect x="36" y="374" width="32" height="32" rx="8" fill="white" stroke={T.border} strokeWidth="1"/>
    <rect x="80" y="379" width="140" height="10" rx="4" fill={T.border}/>
    <rect x="80" y="396" width="100" height="8" rx="4" fill={T.border}/>
    <text x="380" y="396" fill={T.orange} fontSize="11" fontWeight="600" fontFamily="system-ui" textAnchor="end">Gerando...</text>

    {/* Créditos */}
    <rect x="24" y="430" width="372" height="30" rx="8" fill={T.blueLt}/>
    <text x="36" y="449" fill={T.blue} fontSize="11" fontWeight="700" fontFamily="system-ui">Créditos disponíveis:</text>
    <text x="168" y="449" fill={T.blue} fontSize="11" fontWeight="900" fontFamily="system-ui">342 / 500</text>
    <rect x="264" y="440" width="120" height="8" rx="4" fill={T.blue} opacity="0.15"/>
    <rect x="264" y="440" width="82" height="8" rx="4" fill={T.blue} opacity="0.45"/>
  </svg>
);

// ─── CSS ──────────────────────────────────────────────────────────────────────
const STYLES = `
  .hr2-root {
    background: ${T.white};
    padding: 120px 0 80px;
    overflow: hidden;
    position: relative;
    border-bottom: 1px solid ${T.border};
  }

  .hr2-container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 28px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 64px;
    align-items: center;
  }

  .hr2-headline {
    font-size: clamp(30px, 4.2vw, 52px);
    font-weight: 800;
    color: ${T.ink};
    letter-spacing: -0.04em;
    line-height: 1.1;
    margin: 0 0 20px;
  }

  .hr2-headline span {
    color: ${T.blue};
  }

  .hr2-sub {
    font-size: 17px;
    color: ${T.textSec};
    line-height: 1.72;
    margin: 0 0 32px;
    max-width: 520px;
  }

  .hr2-cta-group {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 28px;
  }

  /* ── CTA principal: laranja ── */
  .hr2-btn-primary {
    background: ${T.orange};
    color: white;
    border: none;
    cursor: pointer;
    font-weight: 700;
    font-family: inherit;
    font-size: 16px;
    padding: 14px 30px;
    border-radius: 10px;
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: background 0.2s, transform 0.15s;
    text-decoration: none;
    touch-action: manipulation;
  }
  .hr2-btn-primary:hover  { background: ${T.orangeDk}; transform: translateY(-1px); }
  .hr2-btn-primary:active { transform: translateY(0); }
  .hr2-btn-primary:focus-visible { outline: 3px solid ${T.blue}; outline-offset: 2px; }

  /* ── CTA secundário: azul ── */
  .hr2-btn-secondary {
    background: transparent;
    color: ${T.blue};
    border: 2px solid ${T.blue};
    cursor: pointer;
    font-weight: 600;
    font-family: inherit;
    font-size: 16px;
    padding: 14px 28px;
    border-radius: 10px;
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: background 0.2s, color 0.2s;
    touch-action: manipulation;
  }
  .hr2-btn-secondary:hover { background: ${T.blue}; color: white; }
  .hr2-btn-secondary:focus-visible { outline: 3px solid ${T.orange}; outline-offset: 2px; }

  .hr2-trust {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    align-items: center;
  }

  .hr2-trust-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: ${T.textSec};
    font-weight: 500;
  }

  .hr2-pill {
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
    margin-bottom: 20px;
    border: 1px solid rgba(31,78,95,0.15);
  }

  .hr2-audience {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 28px;
  }

  .hr2-audience-tag {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: ${T.blue};
    background: white;
    border: 1.5px solid ${T.border};
    padding: 6px 14px;
    border-radius: 8px;
  }

  @media (max-width: 900px) {
    .hr2-container {
      grid-template-columns: 1fr;
      gap: 48px;
      text-align: center;
    }
    .hr2-cta-group { justify-content: center; }
    .hr2-trust { justify-content: center; }
    .hr2-audience { justify-content: center; }
    .hr2-sub { margin-left: auto; margin-right: auto; }
    .hr2-visual { max-width: 420px; margin: 0 auto; }
  }

  @media (max-width: 480px) {
    .hr2-root { padding: 100px 0 60px; }
    .hr2-cta-group { flex-direction: column; }
    .hr2-btn-primary, .hr2-btn-secondary { justify-content: center; width: 100%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .hr2-btn-primary, .hr2-btn-secondary { transition: none; }
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────
export default function Hero({ onRegister }) {
  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="hr2-root" aria-labelledby="hero-headline">
      <style>{STYLES}</style>
      <div className="hr2-container">

        {/* ── Texto ── */}
        <div>
          <div className="hr2-pill">
            <FileText size={13} aria-hidden="true" />
            Educação Inclusiva · Documentação com IA
          </div>

          <div className="hr2-audience" aria-label="Para quem é o IncluiAI">
            <span className="hr2-audience-tag">
              <GraduationCap size={14} aria-hidden="true" />
              Professor de AEE
            </span>
            <span className="hr2-audience-tag">
              <ClipboardList size={14} aria-hidden="true" />
              Psicopedagogo
            </span>
            <span className="hr2-audience-tag">
              <FileText size={14} aria-hidden="true" />
              Coordenador pedagógico
            </span>
          </div>

          <h1 id="hero-headline" className="hr2-headline">
            Documentação pedagógica profissional,{' '}
            <span>gerada em minutos</span>{' '}
            para cada aluno.
          </h1>

          <p className="hr2-sub">
            PEI, PAEE, PDI, Protocolo de Aprendizagem e Estudo de Caso com o histórico
            real do seu aluno, assinatura digital e conformidade LGPD — sem horas de burocracia.
          </p>

          <div className="hr2-cta-group">
            <button className="hr2-btn-primary" onClick={() => scrollTo('pricing')}>
              Ver planos <ArrowRight size={17} aria-hidden="true" />
            </button>
            <button className="hr2-btn-secondary" onClick={() => scrollTo('como-funciona')}>
              Ver como funciona
            </button>
          </div>

          <div className="hr2-trust" role="list" aria-label="Garantias">
            {[
              'Pagamento seguro via Kiwify',
              'Suporte pedagógico incluído',
              'LGPD conforme',
            ].map(item => (
              <div key={item} className="hr2-trust-item" role="listitem">
                <CheckCircle size={14} color={T.green} aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Visual ── */}
        <div className="hr2-visual" aria-hidden="true">
          <ProductPreview />
        </div>

      </div>
    </section>
  );
}
