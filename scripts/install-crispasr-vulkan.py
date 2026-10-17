"""Add the pinned Windows Vulkan libraries beside the CPU CrispASR wheel in the base runtime."""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
import site
from tempfile import TemporaryDirectory
from urllib.request import urlopen
from zipfile import ZipFile


WHEEL_URL = (
    "https://github.com/CrispStrobe/CrispASR/releases/download/v0.8.43/"
    "crispasr-0.8.43%2Bvulkan-py3-none-win_amd64.whl"
)
WHEEL_SHA256 = "08854cc005537d925ea3191e63b3dc840191a58a961844dc61403f64e5904678"
LIBRARIES = {
    "crispasr.dll", "ggml-base.dll", "ggml-cpu.dll", "ggml-vulkan.dll",
    "ggml.dll", "whisper.dll",
}


def main() -> None:
    package = Path(site.getsitepackages()[0]) / "crispasr"
    if not (package / "__init__.py").is_file():
        raise RuntimeError("Install the pinned CPU CrispASR wheel first")
    destination = package / "vulkan"
    with TemporaryDirectory() as directory:
        wheel = Path(directory) / "crispasr-vulkan.whl"
        digest = sha256()
        with urlopen(WHEEL_URL, timeout=90) as response, wheel.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest() != WHEEL_SHA256:
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
