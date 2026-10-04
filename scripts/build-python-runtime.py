"""Build a relocatable private CPython + CPU model environment for the installer.

Run with the CPU build venv; runtime installation never needs system Python or pip.
"""
from __future__ import annotations

import hashlib
import csv
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import sys
import uuid


def flatten_license_paths(site_packages: Path) -> None:
    """Keep vendor notices while avoiding legacy installer path limits."""
    for metadata in site_packages.glob("*.dist-info"):
        licenses = metadata / "licenses"
        if not licenses.is_dir():
            continue
        replacements = {}
        index = {}
        for source in sorted(licenses.rglob("*")):
            if not source.is_file() or source.parent == licenses:
                continue
            original = source.relative_to(licenses).as_posix()
            filename = hashlib.sha256(original.encode()).hexdigest() + ".txt"
            target = licenses / filename
            if target.exists():
                raise RuntimeError(f"License destination collision: {target}")
            old_record_path = source.relative_to(site_packages).as_posix()
            source.rename(target)
            replacements[old_record_path] = target.relative_to(site_packages).as_posix()
            index[filename] = original
        if not index:
            continue
        for directory in sorted(licenses.rglob("*"), key=lambda p: len(p.parts), reverse=True):
            if directory.is_dir():
                directory.rmdir()
        (licenses / "original-paths.json").write_text(
            json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8")
        record = metadata / "RECORD"
        if record.is_file():
            with record.open(newline="", encoding="utf-8") as stream:
                rows = list(csv.reader(stream))
            for row in rows:
                if row and row[0] in replacements:
                    row[0] = replacements[row[0]]
            rows.append([(licenses / "original-paths.json").relative_to(site_packages).as_posix(), "", ""])
            with record.open("w", newline="", encoding="utf-8") as stream:
                csv.writer(stream).writerows(rows)


def main() -> None:
    if sys.platform != "win32" or sys.version_info[:2] != (3, 13):
        raise RuntimeError("The release runtime requires Windows x64 CPython 3.13")
    import struct
    import torch
    if struct.calcsize("P") != 8 or torch.version.cuda or torch.version.hip:
        raise RuntimeError("Build from the x64 CPU environment")
    root = Path(__file__).resolve().parents[1]
    output = (root / "engine" / "dist").resolve()
    output.mkdir(parents=True, exist_ok=True)
    destination = output / "NolaPythonEngine"
    staging = output / f"python-staging-{uuid.uuid4()}"
    backup = output / f"python-backup-{uuid.uuid4()}"
    # All recursive cleanup stays inside this repository's engine/dist directory.
    def remove_owned(path: Path) -> None:
        if path.resolve().parent != output:
            raise RuntimeError("Runtime cleanup path is outside engine/dist")
        if path.exists():
            shutil.rmtree(path)

    base = Path(sys.base_prefix)
    dependencies = Path(sys.prefix) / "Lib" / "site-packages"
    moved_old = False
    try:
        staging.mkdir()
        for pattern in ("python*.exe", "python*.dll", "vcruntime*.dll", "LICENSE*"):
            for source in base.glob(pattern):
                if source.is_file():
                    shutil.copy2(source, staging / source.name)
        if not (staging / "python.exe").exists() or not (staging / "python313.dll").exists():
            raise RuntimeError("The base Python installation is incomplete")
        shutil.copytree(base / "DLLs", staging / "DLLs", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(base / "Lib", staging / "Lib",
                        ignore=shutil.ignore_patterns("site-packages", "__pycache__", "test", "tests"))
        shutil.copytree(dependencies, staging / "Lib" / "site-packages",
                        ignore=shutil.ignore_patterns("__pycache__", "__editable__*"))
        flatten_license_paths(staging / "Lib" / "site-packages")
        engine = staging / "Lib" / "site-packages" / "nola_translator_engine"
        if engine.exists():
            shutil.rmtree(engine)  # Inside the new, uniquely named staging tree.
        shutil.copytree(root / "engine" / "nola_translator_engine", engine,
                        ignore=shutil.ignore_patterns("__pycache__"))
        system = Path(os.environ["SystemRoot"]) / "System32"
        for name in ("concrt140.dll", "msvcp140.dll", "msvcp140_1.dll", "msvcp140_2.dll",
                     "msvcp140_atomic_wait.dll", "msvcp140_codecvt_ids.dll", "vcruntime140.dll",
                     "vcruntime140_1.dll", "vcruntime140_threads.dll"):
            source = system / name
            if source.exists():
                shutil.copy2(source, staging / name)
        versions = sorted(f"{d.metadata['Name']}=={d.version}" for d in importlib.metadata.distributions())
        digest = hashlib.sha256(json.dumps({"python": sys.version, "dependencies": versions}, sort_keys=True).encode())
        for source in sorted(engine.rglob("*.py")):
            digest.update(source.relative_to(engine).as_posix().encode())
            digest.update(source.read_bytes())
        (staging / "runtime-base.json").write_text(json.dumps({
            "fingerprint": digest.hexdigest(), "pythonAbi": "cp313-win_amd64",
            "torchVersion": torch.__version__, "dependencies": versions,
        }, indent=2), encoding="utf-8")
        if destination.exists():
            if not (destination / "runtime-base.json").is_file():
                raise RuntimeError("Refusing to replace an unrecognized runtime directory")
            destination.rename(backup)
            moved_old = True
        try:
            staging.rename(destination)
        except BaseException:
            if moved_old:
                backup.rename(destination)
            raise
        if moved_old:
            remove_owned(backup)
        print(f"Private CPU Python runtime: {destination}")
    finally:
        remove_owned(staging)


if __name__ == "__main__":
    main()
