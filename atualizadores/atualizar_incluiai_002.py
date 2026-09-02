#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

TARGET = Path("src/components/StudentProfile.tsx")
EXPECTED_BRANCH = "release/fases-1-2-3"

NEW_COMPONENT = r'''// ── AnalysisCards: resultado da análise IA em accordion compacto ────────────────
const AnalysisCards: React.FC<{
  synthesis?: string | null;
  pedagogicalPoints?: string[] | null;
  suggestions?: string[] | null;
  impacts?: string[] | null;
  alerts?: string[] | null;
}> = ({ synthesis, pedagogicalPoints, suggestions, impacts, alerts }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const pedagogicalCount = Array.isArray(pedagogicalPoints) ? pedagogicalPoints.length : 0;
  const suggestionsCount = Array.isArray(suggestions) ? suggestions.length : 0;
  const impactsCount = Array.isArray(impacts) ? impacts.length : 0;
  const alertsCount = Array.isArray(alerts) ? alerts.length : 0;

  return (
    <div className="rounded-xl overflow-hidden border border-purple-100 bg-purple-50/40">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-purple-100/60 hover:bg-purple-100/80 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Brain size={13} className="text-purple-600 shrink-0"/>
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-purple-700">
              Análise IA disponível
            </span>
            <span className="block text-[10px] text-purple-600/80 truncate">
              Síntese, pontos pedagógicos e recomendações
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isOpen && (
            <span className="hidden sm:inline text-[10px] text-purple-600/80">
              {[
                pedagogicalCount ? `${pedagogicalCount} pontos` : '',
                suggestionsCount ? `${suggestionsCount} recomendações` : '',
                impactsCount ? `${impactsCount} impactos` : '',
                alertsCount ? `${alertsCount} alertas` : '',
              ].filter(Boolean).slice(0, 2).join(' · ')}
            </span>
          )}
          <span className="text-[11px] font-semibold text-purple-700">
            {isOpen ? 'Recolher ▲' : 'Ver análise ▼'}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="grid sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-purple-100 border-t border-purple-100">
          {synthesis && (
            <div className="p-3 sm:col-span-2 border-b border-purple-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 mb-1">Síntese da IA</p>
              <p className="text-xs text-gray-700 leading-relaxed">{synthesis}</p>
            </div>
          )}

          {Array.isArray(pedagogicalPoints) && pedagogicalPoints.length > 0 && (
            <div className="p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1.5 flex items-center gap-1">
                <BookOpen size={10}/> Pontos pedagógicos
              </p>
              <ul className="space-y-1">
                {pedagogicalPoints.slice(0, 4).map((p, i) => (
                  <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                    <span className="text-blue-400 mt-0.5 shrink-0">•</span>{p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(impacts) && impacts.length > 0 && (
            <div className="p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600 mb-1.5 flex items-center gap-1">
                <TrendingUp size={10}/> Impactos pedagógicos
              </p>
              <ul className="space-y-1">
                {impacts.slice(0, 4).map((p, i) => (
                  <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                    <span className="text-orange-400 mt-0.5 shrink-0">•</span>{p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(suggestions) && suggestions.length > 0 && (
            <div className="p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-green-600 mb-1.5 flex items-center gap-1">
                <CheckCircle size={10}/> Recomendações
              </p>
              <ul className="space-y-1">
                {suggestions.slice(0, 4).map((s, i) => (
                  <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                    <span className="text-green-500 mt-0.5 shrink-0">•</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(alerts) && alerts.length > 0 && (
            <div className="p-3 sm:col-span-2 border-t border-purple-100 bg-amber-50/60">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1.5 flex items-center gap-1">
                <AlertCircle size={10}/> Alertas / Observações
              </p>
              <ul className="space-y-1">
                {alerts.map((a, i) => (
                  <li key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                    <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>{a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

'''

def run(cmd, cwd):
    p = subprocess.run(cmd, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=False)
    return p.returncode, p.stdout

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def fail(msg, code=1):
    print("\nERRO:", msg)
    print("Nenhum commit, push, merge, deploy ou migration foi realizado.")
    sys.exit(code)

def main():
    root = Path.cwd().resolve()
    if not (root / "package.json").exists() or not (root / "src").exists():
        fail("Execute na raiz do INCLUIAI_2_0_OFICIAL.", 2)

    code, out = run(["git", "branch", "--show-current"], root)
    if code != 0:
        fail("Não foi possível consultar a branch.", 3)
    branch = out.strip()
    print("Branch atual:", branch)
    if branch != EXPECTED_BRANCH:
        fail(f"Branch incorreta. Esperado: {EXPECTED_BRANCH}", 4)

    target = root / TARGET
    if not target.exists():
        fail(f"Arquivo não encontrado: {TARGET}", 5)

    raw = target.read_text(encoding="utf-8")
    if "Análise IA disponível" in raw and "Ver análise ▼" in raw:
        fail("O accordion já parece estar aplicado; abortando para evitar duplicação.", 6)

    start = raw.find("const AnalysisCards: React.FC<{")
    if start == -1:
        fail("Não encontrei o componente AnalysisCards.", 7)

    props = raw.find("// ── Props", start)
    if props == -1:
        props = raw.find("// â", start)
    if props == -1:
        fail("Não encontrei a âncora segura de fim do componente.", 8)

    comment_start = raw.rfind("//", max(0, start - 300), start)
    replace_start = comment_start if comment_start != -1 else start

    old_block = raw[replace_start:props]
    required = ["AnalysisCards", "synthesis", "pedagogicalPoints", "suggestions", "<Brain", "<BookOpen", "<CheckCircle"]
    missing = [x for x in required if x not in old_block]
    if missing:
        fail("Validação do bloco falhou. Faltam: " + ", ".join(missing), 9)

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = root.parent / "IncluiAI_Backups" / f"python_updater_002_{ts}"
    backup_file = backup_dir / TARGET
    backup_file.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target, backup_file)

    before_hash = sha256(target)
    new_raw = raw[:replace_start] + NEW_COMPONENT + raw[props:]
    target.write_text(new_raw, encoding="utf-8", newline="\n")
    after_hash = sha256(target)

    patched = target.read_text(encoding="utf-8")
    post = [
        "const [isOpen, setIsOpen] = React.useState(false);",
        "Análise IA disponível",
        "Ver análise ▼",
        "aria-expanded={isOpen}",
        "{isOpen && (",
    ]
    if any(x not in patched for x in post):
        shutil.copy2(backup_file, target)
        fail("Validação pós-patch falhou; backup restaurado.", 10)

    print("\nBackup:", backup_file)
    print("SHA256 antes :", before_hash)
    print("SHA256 depois:", after_hash)

    print("\nExecutando npm test...")
    test_code, test_out = run(["npm", "test", "--", "--run"], root)
    print(test_out)

    print("\nExecutando npm run build...")
    build_code, build_out = run(["npm", "run", "build"], root)
    print(build_out)

    _, diff_out = run(["git", "diff", "--", str(TARGET).replace("\\", "/")], root)

    audit_dir = root / "auditorias_atualizadores"
    audit_dir.mkdir(exist_ok=True)
    report_path = audit_dir / f"updater_002_accordion_analise_ia_{ts}.json"
    report = {
        "updater": "002",
        "timestamp": ts,
        "branch": branch,
        "target": str(TARGET).replace("\\", "/"),
        "backup": str(backup_file),
        "sha256_before": before_hash,
        "sha256_after": after_hash,
        "tests_exit_code": test_code,
        "build_exit_code": build_code,
        "tests_passed": test_code == 0,
        "build_passed": build_code == 0,
        "commit": False,
        "push": False,
        "deploy": False,
        "migration": False,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n" + "="*78)
    print("DIFF")
    print("="*78)
    print(diff_out)

    print("\n" + "="*78)
    if test_code == 0 and build_code == 0:
        print("ATUALIZAÇÃO 002 APLICADA COM SUCESSO")
        print("✓ análise recolhida por padrão")
        print("✓ clique expande/recolhe")
        print("✓ conteúdo preservado")
        print("✓ testes passaram")
        print("✓ build passou")
    else:
        print("ATUALIZAÇÃO APLICADA, MAS HÁ VALIDAÇÕES COM FALHA")
        print("NÃO faça commit/push ainda.")
    print("="*78)
    print("Relatório:", report_path)
    print("Nenhum commit, push, merge, deploy ou migration foi realizado.")

if __name__ == "__main__":
    main()
