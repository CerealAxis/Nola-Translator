"""Add the pinned Windows Vulkan libraries beside the CPU CrispASR wheel in the base runtime."""
from __future__ import annotations

from hashlib import sha256
from importlib.metadata import version
import json
from pathlib import Path
import sysconfig
from tempfile import TemporaryDirectory
from urllib.request import urlopen
from zipfile import ZipFile


RUNTIME_CATALOG = Path(__file__).resolve().parents[1] / "src" / "shared" / "crisp-runtime-wheels.json"
LIBRARIES = {
    "crispasr.dll", "ggml-base.dll", "ggml-cpu.dll", "ggml-vulkan.dll",
    "ggml.dll", "whisper.dll",
}


def main() -> None:
    # On Windows, site.getsitepackages()[0] is the venv root; purelib is the actual package directory.
    package = Path(sysconfig.get_path("purelib")) / "crispasr"
    if not (package / "__init__.py").is_file():
        raise RuntimeError("Install the pinned CPU CrispASR wheel first")
    installed_version = version("crispasr")
    catalog = json.loads(RUNTIME_CATALOG.read_text(encoding="utf-8"))
    release = next((item for item in catalog if item["version"] == installed_version), None)
    if not release:
        raise RuntimeError(f"No pinned Vulkan wheel for CrispASR {installed_version}")
    artifact = release["vulkan"]
    destination = package / "vulkan"
    with TemporaryDirectory() as directory:
        wheel = Path(directory) / "crispasr-vulkan.whl"
        digest = sha256()
        with urlopen(artifact["url"], timeout=90) as response, wheel.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest() != artifact["sha256"]:
            raise RuntimeError("CrispASR Vulkan wheel digest mismatch")
        with ZipFile(wheel) as archive:
            members = {Path(name).name: name for name in archive.namelist()
                       if name.startswith("crispasr/") and name.lower().endswith(".dll")}
            if members.keys() != LIBRARIES:
                raise RuntimeError("CrispASR Vulkan wheel library list changed")
            destination.mkdir(exist_ok=True)
            for filename, member in members.items():
                (destination / filename).write_bytes(archive.read(member))


if __name__ == "__main__":
    main()
