import React, { useRef, useState, useCallback } from 'react';

interface Props {
  imageSrc: string;
  initialPosition?: number;
}

export const BeforeAfterSlider: React.FC<Props> = ({ imageSrc, initialPosition = 50 }) => {
  const [pos, setPos] = useState(initialPosition);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const move = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.min(Math.max(((clientX - rect.left) / rect.width) * 100, 0), 100);
    setPos(pct);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    move(e.clientX);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging.current) move(e.clientX);
  };
  const onMouseUp = () => { dragging.current = false; };

  const onTouchMove = (e: React.TouchEvent) => {
    move(e.touches[0].clientX);
  };

  const sharedBg: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundImage: `url(${imageSrc})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: '200% 100%',
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchMove={onTouchMove}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        overflow: 'hidden',
        borderRadius: 20,
        boxShadow: '0 16px 56px rgba(15,23,42,0.18)',
        cursor: 'ew-resize',
        userSelect: 'none',
      }}
    >
      {/* Lado ANTES — metade esquerda da imagem composta */}
      <div style={{ ...sharedBg, backgroundPosition: '0% center' }} />

      {/* Lado DEPOIS — metade direita, revelada progressivamente */}
      <div style={{
        ...sharedBg,
        backgroundPosition: '100% center',
        width: `${pos}%`,
        overflow: 'hidden',
      }} />

      {/* Linha divisória */}
      <div style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: `${pos}%`,
        width: 3,
        background: 'rgba(255,255,255,0.95)',
        transform: 'translateX(-50%)',
        zIndex: 10,
        pointerEvents: 'none',
        boxShadow: '0 0 14px rgba(0,0,0,0.3)',
      }}>
        {/* Botão handle */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 52,
          height: 52,
          background: 'white',
          borderRadius: '50%',
          boxShadow: '0 4px 20px rgba(0,0,0,0.28)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
            stroke="#555" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="11 5 4 12 11 19" />
            <polyline points="13 5 20 12 13 19" />
          </svg>
        </div>
      </div>

      {/* Rótulo ANTES */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 20,
        background: 'rgba(255,255,255,0.9)',
        padding: '5px 14px',
        borderRadius: 7,
        fontSize: 'clamp(0.5rem, 1.1vw, 0.75rem)',
        fontWeight: 800,
        color: '#B91C1C',
        letterSpacing: '0.04em',
        boxShadow: '0 1px 6px rgba(0,0,0,0.12)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}>
        ANTES: PROCESSOS FÍSICOS E CAÓTICOS
      </div>

      {/* Rótulo DEPOIS */}
      <div style={{
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 20,
        background: 'rgba(255,255,255,0.9)',
        padding: '5px 14px',
        borderRadius: 7,
        fontSize: 'clamp(0.5rem, 1.1vw, 0.75rem)',
        fontWeight: 800,
        color: '#166534',
        letterSpacing: '0.04em',
        boxShadow: '0 1px 6px rgba(0,0,0,0.12)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}>
        DEPOIS: ORGANIZAÇÃO DIGITAL E EFICIENTE
      </div>

      {/* Hint inicial (desaparece quando o usuário arrasta) */}
      {pos === initialPosition && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          background: 'rgba(0,0,0,0.52)',
          color: 'white',
          padding: '5px 16px',
          borderRadius: 100,
          fontSize: 12,
          fontWeight: 600,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          letterSpacing: '0.03em',
        }}>
          ← arraste para comparar →
        </div>
      )}
    </div>
  );
};
