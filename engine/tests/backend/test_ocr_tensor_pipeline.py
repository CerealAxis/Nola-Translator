from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from PIL import Image

from nola_translator_engine.backend.lumina_ppocrv6 import preprocess as rec
from nola_translator_engine.backend.lumina_ppocrv6.postprocess import ctc_decode
from nola_translator_engine.backend.lumina_paddleocr_vl.preprocess import preprocess_region


def test_recognition_resize_padding_and_ctc_blanks():
    result = rec.preprocess(np.full((24, 48, 3), 255, dtype=np.uint8))
    assert result.shape == (3, 48, 320) and result.dtype == np.float32
    np.testing.assert_allclose(result[:, :, :96], 1)
    assert not result[:, :, 96:].any()
    prediction = np.eye(3)[[1, 1, 0, 1, 2, 2]]
    assert ctc_decode(["", "A", "B"], prediction) == ("AAB", 1.0)
    assert ctc_decode(["", "A"], np.eye(2)[[0, 0]]) == ("", 0.0)
    with pytest.raises(ValueError, match="modelCorrupt"):
        ctc_decode([""], prediction)


def test_text_rows_and_rotated_columns():
    image = np.full((90, 60, 3), 255, dtype=np.uint8)
    for y in (10, 50):
        for x in (4, 24, 44):
            image[y:y + 12, x:x + 10] = 0
    lines, vertical = rec.split_lines(image)
    assert not vertical and len(lines) == 2
    upright = np.full((110, 44, 3), 255, dtype=np.uint8)
    for x in (4, 26):
        for y in (8, 28, 48, 68, 88):
            upright[y:y + 12, x:x + 10] = 0
    columns, vertical = rec.split_lines(upright)
    assert vertical and len(columns) == 2
    assert rec.preprocess(np.zeros((80, 20, 3), dtype=np.uint8)).shape == (3, 48, 320)


def test_patch_layout_normalization_and_rgb_conversion():
    image = np.zeros((28, 28, 3), dtype=np.uint8)
    image[:14, :14] = [255, 0, 128]
    batch, grid = preprocess_region(Image.fromarray(image), min_pixels=0)
    assert grid.tolist() == [[1, 2, 2]] and batch.shape == (1, 4, 3, 14, 14)
    np.testing.assert_allclose(batch[0, 0, :, 0, 0], [1, -1, 1 / 255], atol=1e-6)
    assert np.all(batch[0, 1:] == -1)
    gray, _ = preprocess_region(Image.new("L", (28, 28)), min_pixels=0)
    assert gray.shape[2] == 3


@pytest.mark.parametrize("size", [(1, 5000), (5000, 1), (20, 20), (300, 500)])
def test_patch_budget_is_respected_even_for_extreme_aspect_ratios(size):
    batch, grid = preprocess_region(Image.new("RGB", size), budget=16, max_pixels=16 * 196)
    assert batch.shape[1] <= 16
    assert grid[0, 1] % 2 == grid[0, 2] % 2 == 0
    assert int(np.prod(grid)) == batch.shape[1]
    with pytest.raises(ValueError, match="invalidImage"):
        preprocess_region(Image.new("RGB", size), budget=3)


def test_decoder_prompt_cache_and_zero_eos(tmp_path, monkeypatch):
    import tokenizers
    (tmp_path / "generation_config.json").write_text('{"eos_token_id": 0}', encoding="utf8")
    from nola_translator_engine.backend.lumina_paddleocr_vl import decoder

    class Tokenizer:
        @staticmethod
        def from_file(path):
            return Tokenizer()
        def encode(self, text):
            return SimpleNamespace(ids=[2])
        def token_to_id(self, text):
            return 2 if "sentence" in text else 1
        def decode(self, tokens, **kwargs):
            assert tokens == [4]
            return " result "

    class Embedding:
        def run(self, names, feed):
            return [np.zeros((*feed["input_ids"].shape, 3), dtype=np.float32)]

    calls = []
    class Session:
        def get_inputs(self):
            return [SimpleNamespace(name=name, type=kind, shape=shape) for name, kind, shape in [
                ("inputs_embeds", "tensor(float)", [1, None, 3]),
                ("attention_mask", "tensor(int64)", [1, None]),
                ("past_key_values.0.key", "tensor(float)", [1, 2, None, 3])]]
        def get_outputs(self):
            return [SimpleNamespace(name=name) for name in ("logits", "present.0.key")]
        def run(self, names, feed):
            calls.append(feed)
            scores = np.zeros((1, 1, 5), np.float32)
            scores[0, 0, 4 if len(calls) % 2 else 0] = 1
            return [scores, np.ones((1, 2, feed["attention_mask"].shape[1], 3))]

    monkeypatch.setattr(tokenizers, "Tokenizer", Tokenizer)
    monkeypatch.setattr(decoder, "make_session_options", lambda: None)
    monkeypatch.setattr(decoder, "create_session", lambda path, **kwargs:
                        Embedding() if path.name == "embedding.onnx" else Session())
    model = decoder.Decoder(tmp_path)
    assert model._stop_tokens == {0}
    for _ in range(2):
        assert model.decode(np.ones((2, 3))) == "result"
    assert calls[0]["attention_mask"].shape == (1, 4)
    np.testing.assert_array_equal(calls[0]["inputs_embeds"][0, 1:3], 1)
    assert calls[0]["past_key_values.0.key"].shape[2] == 0
    assert calls[1]["past_key_values.0.key"].shape[2] == 4
    assert calls[2]["past_key_values.0.key"].shape[2] == 0


def test_vision_uses_graph_dtypes_and_rejects_bad_grid(tmp_path, monkeypatch):
    from nola_translator_engine.backend.lumina_paddleocr_vl import vision
    feeds = []
    class Session:
        def get_inputs(self):
            return [SimpleNamespace(name="pixel_values", type="tensor(float16)"),
                    SimpleNamespace(name="image_grid_thw", type="tensor(int64)")]
        def run(self, names, feed):
            feeds.append(feed)
            return [np.ones((1, 3))]
    monkeypatch.setattr(vision, "make_session_options", lambda: None)
    monkeypatch.setattr(vision, "create_session", lambda *args, **kwargs: Session())
    model = vision.VisionEncoder(tmp_path)
    patches = np.zeros((1, 4, 3, 14, 14))
    assert model.encode(patches, np.array([[1, 2, 2]])).shape == (1, 3)
    assert feeds[0]["pixel_values"].dtype == np.float16
    with pytest.raises(ValueError, match="invalidImage"):
        model.encode(patches, np.array([[1, 2, 4]]))


def test_detached_chinese_radicals_stay_on_two_text_rows():
    from PIL import ImageDraw, ImageFont
    font_path = Path(__file__).resolve().parents[3] / "src/renderer/assets/fonts/NotoSansCJK-SC-VF.otf"
    image = Image.new("RGB", (450, 160), "white")
    draw = ImageDraw.Draw(image)
    draw.multiline_text((20, 0), "第一行文字识别\n第二行功能正常",
                        font=ImageFont.truetype(str(font_path), 48), spacing=18, fill="black")
    lines, vertical = rec.split_lines(np.asarray(image)[:, :, ::-1])
    assert len(lines) == 2 and not vertical


def test_cpu_quantized_convolution_preserves_integer_weights(tmp_path):
    import onnx
    from onnx import helper, numpy_helper
    from nola_translator_engine.backend.lumina_paddleocr_vl.runtime import cpu_vision_model
    weights = np.asarray([[[[-128, -1], [0, 127]]]], dtype=np.int8)
    zero = np.asarray(-3, dtype=np.int8)
    node = helper.make_node("ConvInteger", ["x", "w", "xz", "wz"], ["out"], name="conv")
    graph = helper.make_graph([node], "test", [], [],
        [numpy_helper.from_array(weights, "w"), numpy_helper.from_array(zero, "wz")])
    source = tmp_path / "vision_encoder_q8.onnx"
    onnx.save(helper.make_model(graph), source)
    cached = cpu_vision_model(source)
    assert cpu_vision_model(source) == cached
    original = onnx.load(source)
    converted = onnx.load(cached)
    values = {item.name: numpy_helper.to_array(item) for item in converted.graph.initializer}
    inputs = converted.graph.node[0].input
    assert values[inputs[1]].dtype == values[inputs[3]].dtype == np.uint8
    np.testing.assert_array_equal(values[inputs[1]].astype(np.int16) - values[inputs[3]],
                                  weights.astype(np.int16) - zero)
    assert original.graph.node[0].input[1] == "w"


def test_vl_white_margins_do_not_change_text_patches():
    image = Image.new("RGB", (40, 120), "black")
    padded = Image.new("RGB", (100, 300), "white")
    padded.paste(image, (30, 60))
    expected, grid = preprocess_region(image)
    actual, padded_grid = preprocess_region(padded)
    np.testing.assert_array_equal(actual, expected)
    np.testing.assert_array_equal(padded_grid, grid)


def test_clipped_bubble_border_is_not_returned_as_a_text_line():
    image = np.full((500, 200, 3), 255, dtype=np.uint8)
    image[:310, :10] = 0
    image[380:, 5:15] = 0
    for y in (30, 100, 170, 240):
        image[y:y + 50, 110:160] = 0
    lines, vertical = rec.split_lines(image)
    assert vertical and len(lines) == 1
