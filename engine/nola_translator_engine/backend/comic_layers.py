"""Comic drawing layers and an allowlisted catalog of installed fonts."""
from __future__ import annotations

import hashlib
from functools import lru_cache
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Literal
import unicodedata
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DrawingStroke(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    id: UUID
    mode: Literal['brush', 'erase', 'fill']
    color: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    size: float = Field(ge=1, le=2000)
    points: list[tuple[float, float]] = Field(min_length=1, max_length=20000)
    clip: list[tuple[float, float]] | list[dict] | None = None
    tolerance: int = Field(default=24, ge=0, le=255)
    opacity: float = Field(default=1, ge=0, le=1)
    hardness: float = Field(default=1, ge=0, le=1)
    contiguous: bool = True


class DrawingLayer(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    id: UUID
    name: str = Field(min_length=1, max_length=200)
    visible: bool
    locked: bool
    opacity: float = Field(ge=0, le=1)
    strokes: list[DrawingStroke] = Field(max_length=1000)


def validate_drawing_layer(raw: dict, page: dict) -> dict:
    value = DrawingLayer.model_validate(raw).model_dump(mode='json', exclude_none=True)
    if not value['name'].strip() or sum(len(stroke['points']) for stroke in value['strokes']) > 100000:
        raise ValueError('drawingTooLarge')
    for stroke in value['strokes']:
        if any(not 0 <= x < page['width'] or not 0 <= y < page['height'] for x, y in stroke['points']):
            raise ValueError('invalidGeometry')
        if stroke.get('clip') is not None:
            from .comic_selection import validate_selection
            stroke['clip'] = validate_selection(stroke['clip'], page['width'], page['height'])
    return value


def edit_drawing(page: dict, command: dict) -> None:
    layers = page.setdefault('drawingLayers', [])
    layer_id = command.get('layerId') or command.get('layer', {}).get('id')
    index = next((i for i, layer in enumerate(layers) if layer['id'] == layer_id), None)
    if command['action'] == 'saveDrawingLayer':
        value = validate_drawing_layer(command['layer'], page)
        if index is None:
            if len(layers) >= 256:
                raise ValueError('drawingTooLarge')
            layers.append(value)
        else:
            old = validate_drawing_layer(layers[index], page)
            if old['locked'] and {**value, 'locked': old['locked']} != old:
                raise ValueError('layerLocked')
            layers[index] = value
    else:
        if index is None:
            raise ValueError('layerNotFound')
        if layers[index]['locked']:
            raise ValueError('layerLocked')
        layer = layers.pop(index)
        if command['action'] == 'moveDrawingLayer':
            layers.insert(command['index'], layer)
    page.pop('renderedAsset', None)
    page['hasRendered'] = False


def composite_drawing(image, layers: list[dict]):
    import numpy as np
    result = image.copy()
    for layer in layers:
        if not layer['visible'] or not layer['opacity']:
            continue
        surface = drawing_layer_rgba(result, layer)
        result = _over(result, surface[:, :, :3], surface[:, :, 3].astype(np.float32) / 255 * layer['opacity'])
    return result


def _over(base, rgb, alpha):
    import numpy as np
    coverage = alpha[:, :, None]
    if base.shape[2] == 3:
        return np.rint(rgb * coverage + base * (1 - coverage)).clip(0, 255).astype(np.uint8)
    background_alpha = base[:, :, 3].astype(np.float32) / 255
    combined_alpha = alpha + background_alpha * (1 - alpha)
    numerator = rgb * coverage + base[:, :, :3] * (background_alpha * (1 - alpha))[:, :, None]
    colors = np.rint(numerator / np.maximum(combined_alpha[:, :, None], 1e-6)).clip(0, 255).astype(np.uint8)
    return np.dstack((colors, np.rint(combined_alpha * 255).astype(np.uint8)))


def drawing_layer_rgba(image, layer):
    """Render once against the real sample; fill is not a linear black/white operation."""
    import cv2
    import numpy as np
    height, width = image.shape[:2]
    rgb = np.zeros((height, width, 3), np.uint8)
    alpha = np.zeros((height, width), np.uint8)
    for stroke in layer['strokes']:
        mask = np.zeros_like(alpha)
        points = np.rint(stroke['points']).astype(np.int32)
        points[:, 0] = points[:, 0].clip(0, width - 1)
        points[:, 1] = points[:, 1].clip(0, height - 1)
        radius = max(1, round(stroke['size'] / 2))
        if stroke['mode'] == 'fill':
            seed = tuple(int(item) for item in np.floor(stroke['points'][0]))
            flood_mask = np.zeros((height + 2, width + 2), np.uint8)
            sample = _over(image, rgb, alpha.astype(np.float32) / 255)
            current = np.ascontiguousarray(sample[:, :, :3])
            tolerance = stroke.get('tolerance', 24)
            alpha_matches = (np.abs(sample[:, :, 3].astype(np.int16) - int(sample[seed[1], seed[0], 3])) <= tolerance
                             if sample.shape[2] == 4 else np.ones((height, width), bool))
            if stroke.get('contiguous', True):
                flood_mask[1:-1, 1:-1][~alpha_matches] = 1
                cv2.floodFill(current, flood_mask, seed, (0, 0, 0), (tolerance,) * 3,
                              (tolerance,) * 3, cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE | (255 << 8) | 4)
                mask = (flood_mask[1:-1, 1:-1] == 255).astype(np.uint8) * 255
            else:
                color = current[seed[1], seed[0]].astype(np.int16)
                mask = ((np.max(np.abs(current.astype(np.int16) - color), axis=2) <= tolerance) & alpha_matches).astype(np.uint8) * 255
        else:
            if len(points) > 1:
                cv2.polylines(mask, [points], False, 255, max(1, round(stroke['size'])), cv2.LINE_AA)
            for point in (points[0], points[-1]):
                cv2.circle(mask, tuple(point), radius, 255, -1, cv2.LINE_AA)
            if stroke.get('hardness', 1) < 1:
                blur = max(.25, radius * (1 - stroke['hardness']) / 2)
                mask = cv2.GaussianBlur(mask, (0, 0), blur)
        if stroke.get('clip'):
            from .comic_selection import selection_mask
            mask = cv2.bitwise_and(mask, selection_mask(stroke['clip'], width, height))
        coverage = mask.astype(np.float32) / 255 * stroke.get('opacity', 1)
        if stroke['mode'] == 'erase':
            alpha = np.rint(alpha * (1 - coverage)).astype(np.uint8)
        else:
            color = np.array([int(stroke['color'][i:i + 2], 16) for i in (5, 3, 1)], np.float32)
            previous_alpha = alpha.astype(np.float32) / 255
            next_alpha = coverage + previous_alpha * (1 - coverage)
            numerator = color * coverage[:, :, None] + rgb * (previous_alpha * (1 - coverage))[:, :, None]
            rgb = np.rint(numerator / np.maximum(next_alpha[:, :, None], 1e-6)).clip(0, 255).astype(np.uint8)
            alpha = np.rint(next_alpha * 255).astype(np.uint8)
    return np.dstack((rgb, alpha))


@lru_cache(maxsize=64)
def _font_glyph_metadata(path, modified, index):
    from fontTools.ttLib import TTFont, TTLibError
    try:
        with TTFont(path, fontNumber=index, lazy=True) as font:
            return frozenset(font.getBestCmap() or {}), any(table in font for table in ('COLR','CBDT','sbix','SVG '))
    except (OSError,ValueError,TTLibError) as error:
        raise ValueError('fontMissing') from error


def font_glyph_metadata(path, index=0):
    path=Path(path)
    return _font_glyph_metadata(str(path),path.stat().st_mtime_ns,index)


class ComicFonts:
    def __init__(self, default_font: Path, managed: Path):
        self.default_font = default_font
        self.managed = managed
        self._catalog = None

    def _directories(self):
        directories = [self.default_font.parent, self.managed]
        if os.name == 'nt':
            directories += [Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts',
                            Path(os.environ.get('LOCALAPPDATA', '')) / 'Microsoft/Windows/Fonts']
        else:
            directories += [Path('/usr/share/fonts'), Path('/usr/local/share/fonts'),
                            Path('/Library/Fonts'), Path('/System/Library/Fonts'), Path.home() / '.fonts']
        return directories

    def _scan(self):
        from PIL import ImageFont
        catalog = []
        seen = set()
        for directory in self._directories():
            if not directory.is_dir():
                continue
            for path in sorted(directory.rglob('*')):
                if path.suffix.lower() not in ('.ttf', '.otf', '.ttc') or not path.is_file():
                    continue
                try:
                    font = ImageFont.truetype(str(path), 20)
                    family, style = font.getname()
                    italic = any(word in style.lower() for word in ('italic', 'oblique'))
                    weight = 700 if any(word in style.lower() for word in ('bold', 'black', 'heavy')) else 400
                    key = (family, weight, italic)
                    if key not in seen:
                        seen.add(key)
                        catalog.append({'family': family, 'weight': weight, 'italic': italic, 'path': path})
                except (OSError, ValueError):
                    continue
        self._catalog = catalog
        return catalog

    def list(self, refresh=False):
        return [{key: value for key, value in item.items() if key != 'path'}
                for item in (self._catalog if self._catalog is not None and not refresh else self._scan())]

    def resolve(self, family: str | None, weight=400, italic=False) -> Path:
        if not family:
            return self.default_font
        catalog = self._catalog if self._catalog is not None else self._scan()
        matches = [item for item in catalog if item['family'].casefold() == family.casefold()]
        if not matches:
            raise ValueError('fontMissing')
        return min(matches, key=lambda item: abs(item['weight'] - weight) + (0 if item['italic'] == italic else 1000))['path']

    def glyph_fallback(self, character):
        catalog=self._catalog if self._catalog is not None else self._scan()
        # The operating system's emoji family is first; all choices still require a real cmap entry.
        for item in sorted(catalog,key=lambda item:(item['family']!='Segoe UI Emoji',item['family'])):
            glyphs,color=font_glyph_metadata(item['path'])
            if ord(character) in glyphs:
                return {**item,'colorGlyphs':color}
        return None

    def preview(self, family: str) -> Path | None:
        from PIL import Image, ImageDraw, ImageFont, PngImagePlugin, features

        font_path = self.resolve(family)
        stat = font_path.stat()
        signature = hashlib.sha256(f'v5\0{font_path}\0{stat.st_size}\0{stat.st_mtime_ns}\0{family}'.encode()).hexdigest()
        cache = self.managed.parent / 'font-previews'
        target = cache / (hashlib.sha256(family.casefold().encode()).hexdigest() + '.png')
        try:
            with Image.open(target) as existing:
                if existing.info.get('font-signature') == signature:
                    existing.verify()
                    return target
        except (OSError, ValueError, SyntaxError):
            pass

        font = ImageFont.truetype(str(font_path), 48)
        if not features.check_feature('raqm') and any(unicodedata.bidirectional(char) in {'R', 'AL', 'AN'} or unicodedata.category(char) in {'Mn', 'Mc', 'Me'} for char in family):
            return None
        try:
            axes = font.get_variation_axes()
            font.set_variation_by_axes([max(axis['minimum'], min(axis['maximum'], 400)) if axis['name'] == b'Weight' else axis['default'] for axis in axes])
        except (AttributeError, OSError):
            pass
        missing = font.getmask('\U0010ffff')
        missing_glyph = (missing.size, bytes(missing))
        for char in set(family):
            if char.isspace():
                continue
            glyph = font.getmask(char)
            if (glyph.size, bytes(glyph)) == missing_glyph:
                return None
        left, top, right, bottom = font.getbbox(family)
        padding = 2
        image = Image.new('L', (max(1, right - min(left, 0) + padding * 2), max(font.size, bottom - top + padding * 2)))
        ImageDraw.Draw(image).text((padding - min(left, 0), padding - top), family, font=font, fill=255)
        rgba = Image.new('RGBA', image.size, (255, 255, 255, 0))
        rgba.putalpha(image)
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text('font-signature', signature)
        cache.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(dir=cache, suffix='.png', delete=False) as output:
            temporary = Path(output.name)
        try:
            rgba.save(temporary, format='PNG', pnginfo=metadata)
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)
        return target

    def import_files(self, paths: list[str]):
        from PIL import ImageFont
        if not 1 <= len(paths) <= 100:
            raise ValueError('invalidFont')
        validated = []
        for raw in paths:
            path = Path(raw)
            if path.suffix.lower() not in ('.ttf', '.otf', '.ttc') or not path.is_file() or path.stat().st_size > 32 * 1024 * 1024:
                raise ValueError('invalidFont')
            try:
                ImageFont.truetype(str(path), 20).getname()
            except (OSError, ValueError) as error:
                raise ValueError('invalidFont') from error
            data = path.read_bytes()
            validated.append((hashlib.sha256(data).hexdigest() + path.suffix.lower(), data))
        self.managed.mkdir(parents=True, exist_ok=True)
        for name, data in validated:
            target = self.managed / name
            if not target.exists():
                target.write_bytes(data)
        self._catalog = None
        return self.list()
