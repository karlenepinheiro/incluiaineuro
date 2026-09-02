#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IncluiAI Updater 001
Objetivo: localizar com segurança o componente que renderiza a seção
"ANÁLISE IA DO DOCUMENTO" e preparar diagnóstico para o patch de accordion.

Este script NÃO altera arquivos do projeto.
Ele:
1) confirma que está sendo executado na raiz do projeto;
2) identifica a branch atual;
3) procura padrões relacionados à análise IA em src/**/*.ts(x);
4) gera relatório com arquivos/linhas candidatas;
5) cria um snapshot de diagnóstico.

Uso:
    python atualizar_incluiai_001.py
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

PATTERNS = [
    "ANÁLISE IA DO DOCUMENTO",
    "Análise IA do Documento",
    "Análise IA",
    "PONTOS PEDAGÓGICOS",
    "Pontos Pedagógicos",
    "RECOMENDAÇÕES",
    "Recomendações",
    "Analisar com IA",
]

ALLOWED_BRANCH_PREFIXES = (
    "release/fases-1-2-3",
    "integracao/incluiai-2-0-oficial",
)

def run(cmd: list[str]) -> tuple[int, str]:
    p = subprocess.run(
        cmd,
        cwd=Path.cwd(),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        shell=False,
    )
    return p.returncode, p.stdout.strip()

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def ensure_project_root(root: Path) -> None:
    required = [root / "package.json", root / "src"]
    missing = [str(p) for p in required if not p.exists()]
    if missing:
        print("ERRO: execute este script na raiz do INCLUIAI_2_0_OFICIAL.")
        print("Ausentes:", ", ".join(missing))
        sys.exit(2)

def current_branch() -> str:
    code, out = run(["git", "branch", "--show-current"])
    if code != 0:
        print("ERRO ao consultar branch Git:")
        print(out)
        sys.exit(3)
    return out.strip()

def git_status() -> str:
    code, out = run(["git", "status", "--short"])
    if code != 0:
        return f"[falha ao consultar git status]\n{out}"
    return out

def search_sources(root: Path):
    matches = []
    for ext in ("*.tsx", "*.ts", "*.jsx", "*.js"):
        for path in (root / "src").rglob(ext):
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                text = path.read_text(encoding="utf-8", errors="replace")

            lines = text.splitlines()
            for idx, line in enumerate(lines, start=1):
                found = [p for p in PATTERNS if p.lower() in line.lower()]
                if found:
                    matches.append({
                        "file": str(path.relative_to(root)).replace("\\", "/"),
                        "line": idx,
                        "text": line.strip(),
                        "patterns": found,
                        "sha256": sha256(path),
                    })
    return matches

def main():
    root = Path.cwd().resolve()
    ensure_project_root(root)

    branch = current_branch()
    print(f"Branch atual: {branch}")

    if not branch.startswith(ALLOWED_BRANCH_PREFIXES):
        print("\nATENÇÃO: branch inesperada.")
        print("Esperado: release/fases-1-2-3 ou integracao/incluiai-2-0-oficial")
        print("Nenhuma alteração será feita de qualquer forma, pois este updater é apenas diagnóstico.")

    status = git_status()
    print("\nGit status --short:")
    print(status if status else "(working tree clean)")

    matches = search_sources(root)

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = root / "auditorias_atualizadores"
    out_dir.mkdir(exist_ok=True)
    report_path = out_dir / f"updater_001_diagnostico_{ts}.json"

    report = {
        "updater": "001",
        "mode": "diagnostic_only",
        "timestamp": ts,
        "root": str(root),
        "branch": branch,
        "git_status_short": status,
        "patterns": PATTERNS,
        "match_count": len(matches),
        "matches": matches,
    }
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("\n" + "=" * 78)
    print("RESULTADO")
    print("=" * 78)

    if not matches:
        print("Nenhuma ocorrência encontrada.")
        print("Não altere nada manualmente. Envie o relatório gerado para revisão.")
    else:
        by_file = {}
        for m in matches:
            by_file.setdefault(m["file"], []).append(m)

        for file, items in sorted(by_file.items()):
            print(f"\n{file}")
            for m in items:
                preview = m["text"]
                if len(preview) > 180:
                    preview = preview[:177] + "..."
                print(f"  L{m['line']}: {preview}")

        print(f"\nTotal: {len(matches)} ocorrência(s) em {len(by_file)} arquivo(s).")

    print(f"\nRelatório salvo em:\n{report_path}")
    print("\nNenhum arquivo do sistema foi alterado.")
    print("Próximo passo: envie o conteúdo do relatório/resultado para gerar o patch exato.")

if __name__ == "__main__":
    main()
