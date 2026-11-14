from pathlib import Path
import os
from uuid import uuid4

import numpy as np
import pytest

from nola_translator_engine.backend.comic_layers import ComicFonts, composite_drawing, drawing_layer_rgba, edit_drawing, validate_drawing_layer


def layer(mode='brush', points=None, **kwargs):
    return {'id': str(uuid4()), 'name': 'Paint', 'visible': True, 'locked': False, 'opacity': 1,
            'strokes': [{'id': str(uuid4()), 'mode': mode, 'color': '#ff0000', 'size': 6,
                         'points': points or [[10, 10], [20, 10]]}], **kwargs}


def test_layers_erase_only_own_pixels_and_respect_visibility_opacity_and_order():
    image = np.full((30, 30, 3), 255, np.uint8)
    bottom = layer()
    top = layer()
    top['strokes'][0]['color'] = '#0000ff'
    top['strokes'].append({**top['strokes'][0], 'id': str(uuid4()), 'mode': 'erase'})
    assert tuple(composite_drawing(image, [bottom, top])[10, 15]) == (0, 0, 255)
    top['strokes'].pop()
    assert tuple(composite_drawing(image, [bottom, top])[10, 15]) == (255, 0, 0)
    top['visible'] = False
    assert tuple(composite_drawing(image, [bottom, top])[10, 15]) == (0, 0, 255)
    bottom['opacity'] = .5
    assert tuple(composite_drawing(image, [bottom])[10, 15]) == (128, 128, 255)
    assert (image == 255).all()


def test_fill_uses_boundaries_and_selection_clip():
    image = np.full((30, 30, 3), 255, np.uint8)
    image[:, 15] = 0
    paint = layer('fill', [[5, 5]])
    paint['strokes'][0]['clip'] = [[0, 0], [12, 0], [12, 12], [0, 12]]
    result = composite_drawing(image, [paint])
    assert tuple(result[5, 5]) == (0, 0, 255)
    assert tuple(result[20, 5]) == (255, 255, 255)
    assert tuple(result[5, 20]) == (255, 255, 255)


def test_stroke_opacity_softness_and_noncontiguous_fill_are_persistent_render_settings():
    image = np.zeros((30, 30, 4), np.uint8)
    image[3:8, 3:8] = [0, 0, 0, 255]
    image[20:25, 20:25] = [0, 0, 0, 255]
    image[:, 14:16] = [255, 255, 255, 255]
    paint = layer('fill', [[5, 5]])
    paint['strokes'][0].update(contiguous=False, opacity=.5)
    result = composite_drawing(image, [paint])
    assert tuple(result[5, 5]) == (0, 0, 128, 255)
    assert tuple(result[22, 22]) == (0, 0, 128, 255)
    assert tuple(result[1, 1]) == (0, 0, 0, 0)
    assert tuple(result[5, 15]) == (255, 255, 255, 255)
    brush = layer(points=[[15, 15]])
    brush['strokes'][0].update(size=12, opacity=.5, hardness=0)
    surface = drawing_layer_rgba(np.zeros((30, 30, 4), np.uint8), brush)
    assert 100 <= surface[15, 15, 3] <= 128
    assert 0 < surface[15, 21, 3] < surface[15, 15, 3]


def test_transparent_fill_extracts_real_alpha_and_accepts_border_seed():
    image = np.zeros((30, 30, 4), np.uint8)
    paint = layer('fill', [[29.9, 29.9]])
    paint['strokes'][0].update(opacity=.5, clip=[[0, 0], [30, 0], [30, 30], [0, 30]])
    validated = validate_drawing_layer(paint, {'width': 30, 'height': 30})
    surface = drawing_layer_rgba(image, validated)
    assert tuple(surface[20, 20]) == (0, 0, 255, 128)
    assert np.array_equal(composite_drawing(image, [validated]), surface)


def test_transparent_background_is_separated_by_an_opaque_black_barrier():
    image = np.zeros((20, 30, 4), np.uint8)
    image[:, 14:16] = [0, 0, 0, 255]
    paint = layer('fill', [[3, 3]])
    result = drawing_layer_rgba(image, paint)
    assert result[3, 3, 3] == 255
    assert result[3, 15, 3] == 0
    assert result[3, 25, 3] == 0


def test_validation_and_edit_lock_prevent_partial_layer_changes():
    page = {'width': 30, 'height': 30}
    value = layer()
    edit_drawing(page, {'action': 'saveDrawingLayer', 'layer': value})
    value = page['drawingLayers'][0]
    value['locked'] = True
    with pytest.raises(ValueError, match='layerLocked'):
        edit_drawing(page, {'action': 'deleteDrawingLayer', 'layerId': value['id']})
    with pytest.raises(ValueError, match='layerLocked'):
        edit_drawing(page, {'action': 'saveDrawingLayer', 'layer': {**value, 'name': 'Wrong', 'locked': False}})
    edit_drawing(page, {'action': 'saveDrawingLayer', 'layer': {**value, 'locked': False}})
    invalid = layer(points=[[30, 0]])
    with pytest.raises(ValueError, match='invalidGeometry'):
        validate_drawing_layer(invalid, page)


def test_old_locked_layers_can_be_unlocked_after_stroke_defaults_are_added():
    old = layer(locked=True)
    page = {'width': 30, 'height': 30, 'drawingLayers': [old]}
    edit_drawing(page, {'action': 'saveDrawingLayer', 'layer': {**old, 'locked': False}})
    assert page['drawingLayers'][0]['locked'] is False


def test_font_catalog_resolves_family_and_rejects_arbitrary_path(tmp_path):
    font = Path(__file__).parents[3] / 'src/renderer/assets/fonts/NotoSansCJK-SC-VF.otf'
    fonts = ComicFonts(font, tmp_path / 'fonts')
    fonts._directories = lambda: [font.parent, tmp_path / 'fonts']
    catalog = fonts.list()
    assert catalog and all('path' not in entry for entry in catalog)
    assert fonts.resolve(catalog[0]['family']).is_file()
    with pytest.raises(ValueError, match='fontMissing'):
        fonts.resolve('C:/Windows/Fonts/arbitrary.ttf')
    assert fonts.import_files([str(font)]) == catalog
    assert list((tmp_path / 'fonts').iterdir())
    invalid = tmp_path / 'invalid.otf'
    invalid.write_bytes(b'not a font')
    with pytest.raises(ValueError, match='invalidFont'):
        fonts.import_files([str(invalid)])


def test_font_preview_is_cached_and_regenerated_after_font_changes(tmp_path, monkeypatch):
    import shutil
    from PIL import Image

    original = Path(__file__).parents[3] / 'src/renderer/assets/fonts/NotoSansCJK-SC-VF.otf'
    font = tmp_path / 'source' / original.name
    font.parent.mkdir()
    shutil.copyfile(original, font)
    fonts = ComicFonts(font, tmp_path / 'fonts')
    fonts._directories = lambda: [font.parent]
    family = fonts.list()[0]['family']
    preview = fonts.preview(family)
    with Image.open(preview) as image:
        assert image.mode == 'RGBA'
        assert image.width > 0 and image.height > 0
        assert image.getchannel('A').getextrema() == (0, 255)
        bounds = image.getchannel('A').getbbox()
        assert bounds and bounds[3] - bounds[1] >= image.height // 2
        signature = image.info['font-signature']
    before = preview.stat().st_mtime_ns
    assert fonts.preview(family).stat().st_mtime_ns == before
    stat = font.stat()
    os.utime(font, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))
    assert fonts.preview(family) == preview
    with Image.open(preview) as image:
        assert image.info['font-signature'] != signature
    with pytest.raises(ValueError, match='fontMissing'):
        fonts.preview('../not-a-font')
    missing_family = 'Missing \U0010ffff'
    fonts._catalog = [{'family': missing_family, 'weight': 400, 'italic': False, 'path': font}]
    assert fonts.preview(missing_family) is None
    from PIL import features
    monkeypatch.setattr(features, 'check_feature', lambda _name: False)
    family_without_shaper = 'خط عربي'
    fonts._catalog = [{'family': family_without_shaper, 'weight': 400, 'italic': False, 'path': font}]
    assert fonts.preview(family_without_shaper) is None


def test_symbol_font_preview_falls_back_to_readable_name(tmp_path):
    path = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts' / 'wingding.ttf'
    if not path.is_file():
        pytest.skip('Windows Wingdings font is unavailable')
    fonts = ComicFonts(path, tmp_path / 'fonts')
    fonts._directories = lambda: [path.parent]
    family = next(item['family'] for item in fonts.list() if item['family'] == 'Wingdings')
    assert fonts.preview(family) is None


def test_font_preview_route_returns_cached_png_or_readable_fallback(tmp_path):
    from types import SimpleNamespace
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from nola_translator_engine.backend.comic import build_comic_router

    font = Path(__file__).parents[3] / 'src/renderer/assets/fonts/NotoSansCJK-SC-VF.otf'
    fonts = ComicFonts(font, tmp_path / 'fonts')
    fonts._directories = lambda: [font.parent]
    family = fonts.list()[0]['family']
    app = FastAPI()
    app.include_router(build_comic_router(SimpleNamespace(fonts=fonts)))
    with TestClient(app) as client:
        response = client.get('/comics/fonts/preview', params={'family': family})
        assert response.status_code == 200
        assert response.headers['content-type'] == 'image/png'
        assert response.content.startswith(b'\x89PNG\r\n\x1a\n')
        assert client.get('/comics/fonts/preview', params={'family': '../missing'}).status_code == 400
        fonts._catalog = [{'family': 'Missing \U0010ffff', 'weight': 400, 'italic': False, 'path': font}]
        assert client.get('/comics/fonts/preview', params={'family': 'Missing \U0010ffff'}).status_code == 204
