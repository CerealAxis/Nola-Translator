"""Pinned manga LaMA weights; explicit download through model management only."""
from .manager import FileEntry, ModelSpec

INPAINT_RESOURCE_ID = "lama-manga"
LAMA_MANGA = ModelSpec(
    model_id=INPAINT_RESOURCE_ID, directory=INPAINT_RESOURCE_ID,
    repo="mayocream/lama-manga", revision="f91c85b26913b3e83f9877867b4c336da3675238",
    files=(FileEntry("lama-manga.safetensors", 204332996,
        "a790515e9da839b8d89af7d565ceb110d908b7d6fbdb991f2acb2ec7d9b08bdb"),),
)
