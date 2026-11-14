from types import SimpleNamespace

import numpy as np
import pytest

from nola_translator_engine.backend.comic_angle import angle_from_logits
from nola_translator_engine.backend.comic_inpaint import inpaint_onnx


class InpaintSession:
    def __init__(self, value):
        self.value = value
        self.feed = None

    def get_inputs(self):
        return [SimpleNamespace(name='image'), SimpleNamespace(name='mask')]

    def run(self, _, feed):
        self.feed = feed
        return [np.full((1, 3, 512, 512), self.value, np.float32)]


@pytest.mark.parametrize('manga,value', [(True, .5), (False, 127)])
def test_onnx_lama_uses_bgr_letterbox_and_keeps_unmasked_pixels(manga, value):
    image = np.full((48, 140, 3), (30, 90, 180), np.uint8)
    mask = np.zeros((48, 140), np.uint8)
    mask[14:34, 25:80] = 255
    session = InpaintSession(value)
    rendered = inpaint_onnx(session, image, mask, manga=manga)
    assert np.array_equal(rendered[mask == 0], image[mask == 0])
    assert np.max(np.abs(rendered[mask > 0].astype(int) - 127)) <= 1
    assert session.feed['image'].shape == (1, 3, 512, 512)
    assert np.allclose(session.feed['image'][0, :, 0, 0], np.array([30, 90, 180]) / 255)
    assert set(np.unique(session.feed['mask'])) == {0, 1}


def test_empty_masks_do_not_run_the_model_and_invalid_input_fails_before_inference():
    session = InpaintSession(.5)
    image = np.zeros((30, 50, 3), np.uint8)
    assert np.array_equal(inpaint_onnx(session, image, np.zeros((30, 50), np.uint8), manga=True), image)
    assert session.feed is None
    with pytest.raises(ValueError, match='invalidImage'):
        inpaint_onnx(session, image, np.zeros((30, 51), np.uint8), manga=True)


def test_anglenet_continuous_orientation_rejects_ambiguous_axes():
    logits = np.full(180, -100.0)
    logits[170] = 100
    assert angle_from_logits(logits) == (10, False)
    logits[170] = -100; logits[90] = 100
    assert angle_from_logits(logits) == (0, True)
    logits[90] = -100; logits[45] = 100
    assert angle_from_logits(logits) == (None, None)
    with pytest.raises(ValueError, match='modelCorrupt'):
        angle_from_logits(np.zeros(179))
