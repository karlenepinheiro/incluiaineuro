import React, { useEffect, useState } from 'react';
import { Globe, Sparkles, Plus, Star, Heart, TrendingUp, GraduationCap } from 'lucide-react';
import { resolveHeroCharacterAsset } from '../config/heroCharacterAssets';
import type { ProfileSex } from '../types';

// ── Gradiente do hero ────────────────────────────────────────────────────────
// Construído a partir dos tokens institucionais já existentes (petrol/dark,
// ver tailwind.config.ts), estendidos até um tom violeta para alcançar a
// sensação "premium" pedida, sem abandonar a identidade visual do produto.
const HERO_GRADIENT =
  'linear-gradient(120deg, #0F2E45 0%, #1F4E5F 32%, #2E3A59 62%, #4C2E7C 88%, #5B21B6 100%)';

interface StudentsHeroBannerProps {
  showCodeSearch: boolean;
  onSearchCode: () => void;
  onSmartRegistration: () => void;
  onCreateTriagem: () => void;
  onCreateComLaudo: () => void;
  /**
   * Sexo explicitamente cadastrado pelo assinante/professor. Quando ausente,
   * a personagem neutra é exibida (fallback seguro).
   */
  professorSexo?: ProfileSex | null;
  /** Permite sobrescrever diretamente o asset da ilustração, se necessário. */
  illustrationSrc?: string;
}

export const StudentsHeroBanner: React.FC<StudentsHeroBannerProps> = ({
  showCodeSearch,
  onSearchCode,
  onSmartRegistration,
  onCreateTriagem,
  onCreateComLaudo,
  professorSexo,
  illustrationSrc,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const src = illustrationSrc ?? resolveHeroCharacterAsset(professorSexo);

  // Se a variante/asset mudar (ex.: quando a troca por gênero for ligada no
  // futuro), tenta carregar a nova imagem em vez de manter o placeholder
  // de uma falha anterior.
  useEffect(() => { setImgFailed(false); }, [src]);

  return (
    <div
      className="relative overflow-hidden rounded-3xl shadow-sm pb-10 sm:pb-14"
      style={{ background: HERO_GRADIENT }}
    >
      {/* ── Elementos decorativos (puramente visuais) ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-10 w-56 h-56 rounded-full blur-3xl"
        style={{ background: 'rgba(139,92,246,0.35)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 left-1/3 w-72 h-72 rounded-full blur-3xl"
        style={{ background: 'rgba(31,78,95,0.35)' }}
      />
      <Star aria-hidden="true" className="hidden sm:block absolute top-6 right-1/3 text-white/25" size={18} />
      <Heart aria-hidden="true" className="hidden sm:block absolute bottom-24 right-10 text-white/20" size={16} />
      <TrendingUp aria-hidden="true" className="hidden lg:block absolute top-10 right-16 text-white/15" size={22} />

      {/* ── Conteúdo ── */}
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8 p-6 sm:p-8 lg:py-10">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white flex items-center gap-2">
            Meus Alunos <span aria-hidden="true">✨</span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-white/80 max-w-md">
            Acompanhe o progresso, fortaleça aprendizados e faça a diferença todos os dias.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {showCodeSearch && (
              <button
                onClick={onSearchCode}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition bg-white text-slate-700 hover:bg-white/90"
                title="Buscar aluno de outra escola pelo código único"
              >
                <Globe size={14} /> Buscar por Código
              </button>
            )}
            <button
              onClick={onSmartRegistration}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition"
              style={{ background: '#F5F3FF', color: '#7C3AED' }}
              title="Cadastrar vários alunos de uma vez via planilha"
            >
              <Sparkles size={14} /> Cadastro Inteligente ✨
            </button>
            <button
              onClick={onCreateTriagem}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white transition hover:bg-white/20"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)' }}
            >
              <Plus size={14} /> Novo Aluno em Triagem
            </button>
            <button
              onClick={onCreateComLaudo}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition hover:brightness-110"
              style={{ background: '#C69214', boxShadow: '0 2px 10px rgba(198,146,20,0.35)' }}
            >
              <Plus size={14} /> Novo Aluno com Laudo
            </button>
          </div>
        </div>

        {/* ── Ilustração ── */}
        <div className="hidden sm:flex shrink-0 items-center justify-center w-[190px] h-[190px] lg:w-[230px] lg:h-[230px] xl:w-[260px] xl:h-[260px] self-center">
          {!imgFailed ? (
            <img
              src={src}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              width={260}
              height={260}
              onError={() => setImgFailed(true)}
              className="w-full h-full object-contain drop-shadow-xl"
            />
          ) : (
            <div
              className="w-full h-full rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px dashed rgba(255,255,255,0.25)' }}
            >
              <GraduationCap aria-hidden="true" size={72} className="text-white/50" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
