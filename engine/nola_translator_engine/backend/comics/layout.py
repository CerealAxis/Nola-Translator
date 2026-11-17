"""Measured CJK lettering and installed-font access."""
from __future__ import annotations

from functools import lru_cache
import math
import os
import re
from pathlib import Path
import unicodedata

import cv2
import numpy as np
from PIL import Image, ImageColor, ImageDraw, ImageFont


class Fonts:
  def __init__(self, default_path: Path):
    self.default_path = default_path.resolve()
    self.paths = {'Noto Sans SC': self.default_path}
    roots = [Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts', self.default_path.parent]
    if os.environ.get('LOCALAPPDATA'):
      roots.append(Path(os.environ['LOCALAPPDATA']) / 'Microsoft/Windows/Fonts')
    self.roots = roots
    self.scanned = False

  def scan(self):
    if not self.scanned:
      self.scanned = True
      for root in self.roots:
        if root.is_dir():
          for path in root.iterdir():
            if path.suffix.lower() in ('.ttf', '.otf', '.ttc') and path.is_file():
              try:
                family, _ = ImageFont.truetype(str(path), 16).getname()
                self.paths.setdefault(family, path)
              except (OSError, ValueError):
                pass
    return self.paths

  def list(self):
    return [dict(family=name, weight=400, italic=False) for name in sorted(self.scan())]

  def path(self, family):
    if family in self.paths:
      return self.paths[family]
    paths = self.scan()
    if family not in paths:
      raise ValueError('fontMissing')
    return paths[family]

  def load(self, family, size):
    return load_font(str(self.path(family or 'Noto Sans SC')), max(1, int(size)))

  def automatic(self, text):
    family = 'Noto Sans JP' if any('\u3040' <= char <= '\u30ff' for char in text) else 'Noto Sans KR' if any('\uac00' <= char <= '\ud7af' for char in text) else 'Noto Sans SC'
    if family != 'Noto Sans SC' and family not in self.scan():
      return 'Noto Sans SC'
    return family

  def missing_glyphs(self, family, text):
    supported = font_characters(str(self.path(family or 'Noto Sans SC')))
    return any(ord(char) not in supported for char in text
      if not char.isspace() and unicodedata.category(char) not in ('Cf', 'Mn'))


@lru_cache(maxsize=128)
def load_font(path, size):
  font = ImageFont.truetype(path, size)
  try:
    axes = font.get_variation_axes()
    values = [max(axis['minimum'], min(axis['maximum'], 500)) if axis['name'] == b'Weight' else axis['default'] for axis in axes]
    font.set_variation_by_axes(values)
  except (OSError, AttributeError):
    pass
  return font


@lru_cache(maxsize=128)
def font_characters(path):
  from fontTools.ttLib import TTFont
  with TTFont(path, fontNumber=0, lazy=True) as font:
    return frozenset(font.getBestCmap() or {})


VERTICAL_PUNCTUATION = str.maketrans({'、':'︑', '。':'︒', '（':'︵', '）':'︶', '「':'﹁', '」':'﹂', '『':'﹃', '』':'﹄', 'ー':'丨', '…':'︙'})


def horizontal_lines(text, font, width, stroke):
  lines = []
  for paragraph in text.split('\n'):
    line = ''
    tokens = re.findall(r'[A-Za-z0-9]+(?:[\x27\u2019-][A-Za-z0-9]+)*|.', paragraph)
    for char in tokens:
      if line and font.getlength(line + char) + stroke * 2 > width:
        carry = ''
        if char in '、。，．！？!?：:；;）)]」』】〉》' or line[-1] in '（([「『【〈《':
          carry, line = line[-1], line[:-1]
        if line:
          lines.append(line.rstrip())
        line = carry
      if not line and char.isspace():
        continue
      if font.getlength(char) > width:
        for part in char:
          if line and font.getlength(line + part) + stroke * 2 > width:
            lines.append(line.rstrip())
            line = ''
          line += part
      else:
        line += char
    lines.append(line)
  return lines


def vertical_units(text):
  return re.findall(r'[0-9]{1,2}|[!?！？]{1,2}|[.…]{1,2}|.', text)


def measured(text, style, fonts, size, width, height):
  font = fonts.load(style.get('fontFamily'), size)
  vertical = style['direction'] == 'vertical-rl'
  factor = (1.15 if vertical else 1.25) if style.get('autoLineSpacing') else style.get('lineSpacing', 1.4)
  spacing = max(1, size * factor)
  advance = size * 1.05 if vertical and style.get('autoLineSpacing') else spacing
  stroke = style.get('strokeWidth', 0)
  if style['direction'] == 'vertical-rl':
    count = max(1, math.floor((height - stroke * 2) / advance))
    lines = []
    for paragraph in text.split('\n'):
      units = vertical_units(paragraph)
      columns = max(1, math.ceil(len(units) / count))
      balanced = max(1, math.ceil(len(units) / columns))
      lines.extend(''.join(units[i:i + balanced]) for i in range(0, len(units), balanced))
      if not paragraph:
        lines.append('')
    used_w = (max(0, len(lines)-1) * spacing + size if lines else 0) + stroke * 2
    used_h = max((len(vertical_units(line)) for line in lines), default=0) * advance + stroke * 2
  else:
    lines = horizontal_lines(text, font, width, stroke)
    used_w = max((font.getlength(line) for line in lines), default=0) + stroke * 2
    used_h = (max(0, len(lines)-1) * spacing + size if lines else 0) + stroke * 2
  return font, spacing, lines, used_w, used_h


def region_layout(region, fonts):
  style = dict(region['style'])
  text = region.get('targetText') or ''
  match = (region.get('resolvedLayout') or {}).get('fontMatch') if style.get('autoFont') else None
  if style.get('autoFont'):
    style['fontFamily'] = match['selectedFamily'] if match else fonts.automatic(text)
  size = style['fontSize']
  width, height = region['width'], region['height']
  if region.get('textQuad'):
    points = np.asarray(region['textQuad'])
    width = float((np.linalg.norm(points[1]-points[0])+np.linalg.norm(points[2]-points[3]))/2)
    height = float((np.linalg.norm(points[3]-points[0])+np.linalg.norm(points[2]-points[1]))/2)
  if style.get('autoFontSize'):
    preferred = region.get('sourceFontSize')
    low, high = 6, min(1024, max(6, round(preferred * 1.12))) if preferred else 200
    while low < high:
      mid = (low + high + 1) // 2
      _, _, _, w, h = measured(text, style, fonts, mid, width, height)
      if w <= width and h <= height:
        low = mid
      else:
        high = mid - 1
    size = low
  font, spacing, lines, used_w, used_h = measured(text, style, fonts, size, width, height)
  return dict(fontSize=size, fontFamily=style.get('fontFamily') or 'Noto Sans SC', lines=lines, lineHeight=spacing,
    glyphAdvance=size*1.05 if style['direction'] == 'vertical-rl' and style.get('autoLineSpacing') else spacing,
    lineSpacing=spacing/max(1,size),
    align='center' if style.get('autoAlign') else style.get('align','center'),
    blockAlign='center' if style.get('autoBlockAlign') else style.get('blockAlign','center'),
    x=region['x'], y=region['y'],
    width=width, height=height, direction=style['direction'], angle=style.get('angle', 0),
    overflow=used_w > width + 1 or used_h > height + 1,
    **({'fontMatch':match} if match else {}))


def offset(align, available, used):
  return 0 if align == 'left' else max(0, available - used) if align == 'right' else max(0, (available - used) / 2)


def render_page(base, regions, fonts):
  image = base.convert('RGBA')
  for region in regions:
    if region.get('ignored') or not region.get('targetText'):
      continue
    style = region['style']
    layout = region_layout(region, fonts)
    region['resolvedLayout'] = layout
    region['qa'] = ['textOverflow'] if layout['overflow'] else []
    if fonts.missing_glyphs(layout['fontFamily'], region['targetText']):
      region['qa'].append('missingGlyph')
    size = layout['fontSize']
    font = fonts.load(layout['fontFamily'], size)
    stroke = round(style.get('strokeWidth', 0))
    width, height = max(2, math.ceil(layout['width'])), max(2, math.ceil(layout['height']))
    layer = Image.new('RGBA', (width, height))
    draw = ImageDraw.Draw(layer)
    lines, spacing = layout['lines'], layout['lineHeight']
    color, outline = style.get('color', '#222222'), style.get('strokeColor', '#ffffff')
    ImageColor.getrgb(color)
    ImageColor.getrgb(outline)
    if style['direction'] == 'vertical-rl':
      block_width = max(0, len(lines)-1) * spacing + size
      block_x = offset(layout['blockAlign'], width, block_width)
      for index, line in enumerate(lines):
        x = block_x + (len(lines) - index - 1) * spacing
        y = offset(layout['align'], height, len(vertical_units(line)) * layout['glyphAdvance'])
        for char in vertical_units(line):
          glyph = char.translate(VERTICAL_PUNCTUATION)
          unit_font = fonts.load(layout['fontFamily'], max(6, round(size * .62))) if len(char) > 1 else font
          draw.text((x + size / 2, y + size / 2), glyph, font=unit_font, fill=color,
            anchor='mm', stroke_width=stroke, stroke_fill=outline)
          y += layout['glyphAdvance']
    else:
      y = offset(layout['blockAlign'], height, max(0,len(lines)-1) * spacing + size)
      for line in lines:
        x = offset(layout['align'], width, font.getlength(line))
        draw.text((x, y), line, font=font, fill=color, anchor='lt', stroke_width=stroke, stroke_fill=outline)
        y += spacing
    if region.get('textQuad'):
      points = np.asarray(region['textQuad'], dtype=np.float32)
      left, top = np.maximum(0, np.floor(points.min(axis=0))).astype(int)
      right, bottom = np.minimum(image.size, np.ceil(points.max(axis=0))+1).astype(int)
      if right <= left or bottom <= top:
        continue
      original = np.array([[0,0],[width-1,0],[width-1,height-1],[0,height-1]], dtype=np.float32)
      matrix = cv2.getPerspectiveTransform(original, (points-[left,top]).astype(np.float32))
      projected = cv2.warpPerspective(np.asarray(layer), matrix, (right-left,bottom-top), flags=cv2.INTER_CUBIC)
      image.alpha_composite(Image.fromarray(projected), (int(left),int(top)))
      continue
    angle = style.get('angle', 0)
    if angle:
      layer = layer.rotate(-angle, expand=True, resample=Image.Resampling.BICUBIC)
    x = round(region['x'] + width / 2 - layer.width / 2)
    y = round(region['y'] + height / 2 - layer.height / 2)
    image.alpha_composite(layer, (x, y))
  return image.convert('RGB')
