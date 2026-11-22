"""Autoregressive ONNX text generation with graph-described KV state."""
from pathlib import Path
import json
import re
import numpy as np
from .config import (DECODER_FILE, EMBEDDING_FILE, TOKENIZER_FILE, MAX_NEW_TOKENS,
                     PREFER_EMBEDDING, _PLACEHOLDER_ID, _PREFIX, _SUFFIX)
from .runtime import create_session, make_session_options, tensor_dtype


class Decoder:
    def __init__(self, model_dir: Path, *, provider: str = "cpu") -> None:
        from tokenizers import Tokenizer

        options = make_session_options()
        self._dec = create_session(model_dir / DECODER_FILE, prefer=provider, sess_options=options)
        self._emb = create_session(model_dir / EMBEDDING_FILE, prefer=PREFER_EMBEDDING,
                                   sess_options=options)
        self._tok = Tokenizer.from_file(str(model_dir / TOKENIZER_FILE))
        self._prefix_ids, self._suffix_ids = [self._tok.encode(text).ids for text in (_PREFIX, _SUFFIX)]
        placeholder = self._tok.token_to_id("<|IMAGE_PLACEHOLDER|>")
        self._ph_id = _PLACEHOLDER_ID if placeholder is None else placeholder
        generation = json.loads((model_dir / "generation_config.json").read_text(encoding="utf8"))
        end = generation.get("eos_token_id")
        self._stop_tokens = {end} if isinstance(end, int) else set(end or [])
        if not self._stop_tokens or any(type(token) is not int or token < 0 for token in self._stop_tokens):
            raise ValueError("modelCorrupt")
        inputs = {item.name: item for item in self._dec.get_inputs()}
        self._emb_dtype = tensor_dtype(inputs["inputs_embeds"])
        self._mask_dtype = tensor_dtype(inputs["attention_mask"])
        self._output_names = [item.name for item in self._dec.get_outputs()]
        self._cache_outputs = {}
        self._empty_cache = {}
        for output in self._output_names:
            match = re.fullmatch(r"present\.(\d+)\.(key|value)", output)
            if match is None:
                continue
            input_name = f"past_key_values.{match[1]}.{match[2]}"
            if input_name not in inputs:
                raise ValueError("modelCorrupt")
            item = inputs[input_name]
            if len(item.shape) != 4:
                raise ValueError("modelCorrupt")
            heads = item.shape[1] if isinstance(item.shape[1], int) else 2
            dimension = item.shape[3] if isinstance(item.shape[3], int) else 128
            self._empty_cache[input_name] = np.zeros((1, heads, 0, dimension), dtype=tensor_dtype(item))
            self._cache_outputs[input_name] = output
        if not self._cache_outputs or "logits" not in self._output_names:
            raise ValueError("modelCorrupt")

    def _embed(self, ids: list[int]) -> np.ndarray:
        tokens = np.asarray(ids, dtype=np.int64).reshape(1, -1)
        return np.asarray(self._emb.run(None, {"input_ids": tokens})[0], dtype=self._emb_dtype)

    def _run(self, embeds: np.ndarray, seq_len: int, present: dict[str, np.ndarray]):
        feed = dict(present)
        feed["attention_mask"] = np.full((1, seq_len), 1, dtype=self._mask_dtype)
        feed["inputs_embeds"] = embeds
        results = dict(zip(self._output_names, self._dec.run(None, feed)))
        scores = np.asarray(results["logits"])[0, -1]
        if not np.isfinite(scores).all():
            raise ValueError("modelCorrupt")
        state = {key: np.asarray(results[value]) for key, value in self._cache_outputs.items()}
        return scores, state

    def decode(self, image_embeds: np.ndarray) -> str:
        image = np.asarray(image_embeds, dtype=self._emb_dtype)
        if image.ndim != 2 or not image.shape[0] or not np.isfinite(image).all():
            raise ValueError("modelCorrupt")
        ids = [*self._prefix_ids, *([self._ph_id] * len(image)), *self._suffix_ids]
        prompt = self._embed(ids)
        start = len(self._prefix_ids)
        prompt[:, start:start + len(image), :] = image[None]
        state = {name: value.copy() for name, value in self._empty_cache.items()}
        length, generated = len(ids), []
        for step in range(MAX_NEW_TOKENS):
            scores, state = self._run(prompt, length, state)
            token = int(scores.argmax())
            if token in self._stop_tokens:
                break
            generated.append(token)
            if step + 1 < MAX_NEW_TOKENS:
                prompt = self._embed([token])
                length += 1
        return self._tok.decode(generated, skip_special_tokens=True).strip()
