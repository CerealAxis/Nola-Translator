"""KV-cache ERNIE decoder + token embedding."""
from __future__ import annotations

import re
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

import logging

log = logging.getLogger(__name__)
from .config import (
    DECODER_FILE,
    EMBEDDING_FILE,
    MAX_NEW_TOKENS,
    PREFER_EMBEDDING,
    TOKENIZER_FILE,
    _EOS_FALLBACK,
    _PLACEHOLDER_ID,
    _PREFIX,
    _SUFFIX,
)

if TYPE_CHECKING:
    from onnxruntime import InferenceSession


def _tensor_dtype(inp) -> np.dtype:
    t = getattr(inp, "type", "")  # e.g. "tensor(float16)"
    return {
        "tensor(float)": np.float32,
        "tensor(float16)": np.float16,
        "tensor(double)": np.float64,
        "tensor(int64)": np.int64,
        "tensor(int32)": np.int32,
        "tensor(int16)": np.int16,
        "tensor(int8)": np.int8,
        "tensor(uint8)": np.uint8,
        "tensor(bool)": np.bool_,
    }.get(t, np.float32)


class Decoder:
    """Embeds prompt tokens, then runs greedy decode with a KV cache."""

    def __init__(self, model_dir: Path, *, provider: str = "cpu") -> None:
        try:
            from tokenizers import Tokenizer as _Tk
        except ImportError as e:  # pragma: no cover
            raise RuntimeError(
                "PaddleOCR-VL needs the 'tokenizers' package — run: pip install tokenizers"
            ) from e
        from .runtime import create_session, make_session_options

        so = make_session_options()
        dec = create_session(
            model_dir / DECODER_FILE,
            prefer=provider,
            sess_options=so,
        )
        emb = create_session(
            model_dir / EMBEDDING_FILE,
            prefer=PREFER_EMBEDDING,
            sess_options=so,
        )
        tok = _Tk.from_file(str(model_dir / TOKENIZER_FILE))

        self._dec: InferenceSession = dec
        self._emb: InferenceSession = emb
        self._tok = tok
        self._prefix_ids = tok.encode(_PREFIX).ids
        self._suffix_ids = tok.encode(_SUFFIX).ids
        self._ph_id = tok.token_to_id("<|IMAGE_PLACEHOLDER|>") or _PLACEHOLDER_ID
        eos = tok.token_to_id("<|end_of_sentence|>")
        if eos is None:  # scan added vocabulary for the eos marker
            for name, tid in tok.get_added_vocabulary().items():
                if "end_of_sentence" in name or "eos" in name.lower():
                    eos = tid
                    break
        self._eos = eos or _EOS_FALLBACK

        # dtypes from the actual graphs
        dec_inputs = {i.name: i for i in dec.get_inputs()}
        self._emb_dtype = _tensor_dtype(dec_inputs["inputs_embeds"])
        self._mask_dtype = _tensor_dtype(dec_inputs["attention_mask"])
        past_names = [n for n in dec_inputs if n.startswith("past_")]
        kv = dec_inputs[past_names[0]]
        shp = kv.shape  # [batch, heads, past, head_dim] (ints may be dynamic)
        heads = shp[1] if isinstance(shp[1], int) else 2
        hdim = shp[3] if isinstance(shp[3], int) else 128
        self._kv_zero_shape = (1, heads, 0, hdim)
        self._kv_dtype = _tensor_dtype(kv)
        self._dec_out_names = [o.name for o in dec.get_outputs()]
        self._kv_feed: dict[str, str] = {}
        for on in self._dec_out_names:
            mo = re.match(r"present\.(\d+)\.(key|value)", on)
            if mo:
                self._kv_feed[f"past_key_values.{mo.group(1)}.{mo.group(2)}"] = on
        log.debug(
            f"PaddleOCR-VL prompt: prefix={len(self._prefix_ids)} suffix="
            f"{len(self._suffix_ids)} placeholder={self._ph_id} eos={self._eos}"
        )

    # ── decoding ─────────────────────────────────────────────────────────

    def decode(self, image_embeds: np.ndarray) -> str:
        """Greedy decode from vision embeddings -> decoded text."""
        n_ph = image_embeds.shape[0]
        input_ids = self._prefix_ids + [self._ph_id] * n_ph + self._suffix_ids
        in_emb = self._embed(input_ids)
        ph0 = len(self._prefix_ids)
        in_emb[0, ph0 : ph0 + n_ph] = image_embeds.astype(self._emb_dtype)

        seq_len = len(input_ids)
        zero_kv = {
            nm: np.zeros(self._kv_zero_shape, self._kv_dtype) for nm in self._kv_feed
        }
        logits, present = self._run(in_emb, seq_len, zero_kv)

        toks: list[int] = []
        for _ in range(MAX_NEW_TOKENS):
            nxt = int(np.argmax(logits))
            if nxt == self._eos:
                break
            toks.append(nxt)
            seq_len += 1
            logits, present = self._run(self._embed([nxt]), seq_len, present)
        return self._tok.decode(toks, skip_special_tokens=True).strip()

    def _embed(self, ids: list[int]) -> np.ndarray:
        out = self._emb.run(None, {"input_ids": np.array([ids], np.int64)})[0]
        return np.asarray(out).astype(self._emb_dtype)

    def _run(
        self, embeds: np.ndarray, seq_len: int, present: dict[str, np.ndarray]
    ) -> tuple[np.ndarray, dict[str, np.ndarray]]:
        """One decoder forward: next-token logits + updated KV cache."""
        out = self._dec.run(
            None,
            {
                "inputs_embeds": embeds,
                "attention_mask": np.ones((1, seq_len), self._mask_dtype),
                **present,
            },
        )
        out_map = dict(zip(self._dec_out_names, out))
        logits = np.asarray(out_map["logits"])[0, -1].astype(np.float64)
        present = {
            inp: np.asarray(out_map[oname]) for inp, oname in self._kv_feed.items()
        }
        return logits, present
