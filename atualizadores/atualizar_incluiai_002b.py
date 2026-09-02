#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
IncluiAI Updater 002B
Correção para Windows + retomada segura do Updater 002.

- NÃO reaplica o patch se ele já estiver presente.
- Detecta npm.cmd / npm automaticamente no Windows.
- Valida StudentProfile.tsx.
- Roda npm test e npm run build.
- Mostra git diff.
- NÃO faz commit/push/deploy/migration.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

TARGET = Path("src/components/StudentProfile.tsx")
EXPECTED_BRANCH = "release/fases-1-2-3"

REQUIRED_PATCH_MARKERS = [
    "const [isOpen, setIsOpen] = React.useState(false);",
    "Análise IA disponível",
    "Ver análise ▼",
    "aria-expanded={isOpen}",
    "{isOpen && (",
]

def fail(msg: str, code: int = 1) -> None:
    print(f"\nERRO: {msg}")
    print("Nenhum commit, push, merge, deploy ou migration foi realizado.")
    sys.exit(code)

def find_executable(name: str) -> str | None:
    candidates = [name]
    if os.name == "nt":
        candidates = [f"{name}.cmd", f"{name}.exe", name]
    for candidate in candidates:
        found = shutil.which(candidate)
        if found:
            return found
    return None

def run(cmd: list[str], cwd: Path) -> tuple[int, str]:
    p = subprocess.run(
        cmd,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        shell=False,
    )
    return p.returncode, p.stdout

def main() -> None:
    root = Path.cwd().resolve()
    if not (root / "package.json").exists() or not (root / "src").exists():
        fail("Execute este script na raiz do INCLUIAI_2_0_OFICIAL.", 2)

    git = find_executable("git")
    npm = find_executable("npm")
    if not git:
        fail("Git não encontrado no PATH.", 3)
    if not npm:
        fail("npm não encontrado no PATH. Abra o terminal onde 'npm -v' funciona e rode novamente.", 4)

    code, branch_out = run([git, "branch", "--show-current"], root)
    if code != 0:
        fail("Não foi possível consultar a branch.", 5)
    branch = branch_out.strip()
    print(f"Branch atual: {branch}")
    if branch != EXPECTED_BRANCH:
        fail(f"Branch incorreta. Esperado: {EXPECTED_BRANCH}", 6)

    target = root / TARGET
    if not target.exists():
        fail(f"Arquivo alvo não encontrado: {TARGET}", 7)

    text = target.read_text(encoding="utf-8")
    missing = [m for m in REQUIRED_PATCH_MARKERS if m not in text]
    if missing:
        fail(
            "O patch do Updater 002 não está completo. Marcadores ausentes: "
            + ", ".join(missing),
            8,
        )

    print("\nPatch 002 detectado no arquivo. Não será reaplicado.")
    print(f"npm detectado em: {npm}")

    print("\nExecutando npm test -- --run ...")
    test_code, test_out = run([npm, "test", "--", "--run"], root)
    print(test_out)

    print("\nExecutando npm run build ...")
    build_code, build_out = run([npm, "run", "build"], root)
    print(build_out)

    _, diff_out = run([git, "diff", "--", str(TARGET).replace("\\", "/")], root)

    print("\n" + "=" * 78)
    print("DIFF DO STUDENTPROFILE")
    print("=" * 78)
    print(diff_out if diff_out.strip() else "(sem diff)")

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    audit_dir = root / "auditorias_atualizadores"
    audit_dir.mkdir(exist_ok=True)

    report_path = audit_dir / f"updater_002b_validacao_windows_{ts}.json"
    report = {
        "updater": "002B",
        "timestamp": ts,
        "branch": branch,
        "target": str(TARGET).replace("\\", "/"),
        "patch_detected": True,
        "npm_executable": npm,
        "tests_exit_code": test_code,
        "build_exit_code": build_code,
        "tests_passed": test_code == 0,
        "build_passed": build_code == 0,
        "commit": False,
        "push": False,
        "deploy": False,
        "migration": False,
    }
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("\n" + "=" * 78)
    if test_code == 0 and build_code == 0:
        print("VALIDAÇÃO CONCLUÍDA COM SUCESSO")
        print("✓ patch do accordion preservado")
        print("✓ testes passaram")
        print("✓ build passou")
    else:
        print("VALIDAÇÃO CONCLUÍDA COM FALHA")
        print(f"npm test exit code: {test_code}")
        print(f"npm run build exit code: {build_code}")
        print("NÃO faça commit/push até revisar.")
    print("=" * 78)
    print(f"Relatório: {report_path}")
    print("Nenhum commit, push, merge, deploy ou migration foi realizado.")

if __name__ == "__main__":
    main()
