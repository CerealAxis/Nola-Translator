"""Image stages using the host's installed visual resources."""
from __future__ import annotations

from contextlib import asynccontextmanager
from copy import deepcopy
import asyncio
import math
import re
import unicodedata
from uuid import uuid4

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageColor

from .schemas import Style

RESOURCE_WAIT_SECONDS = 30


def ppocr_model(owner, language, detector=False):
  from ...models.ocr_catalog import OCR_SPECS, OCR_LANGUAGES
  if owner is None:
    raise ValueError('ocrUnavailable')
  candidates = [spec for name, spec in OCR_SPECS.items() if name.startswith('pp-ocrv5-')
    and owner.models.is_installed(spec)
    and (detector or language == 'auto' or language in OCR_LANGUAGES.get(name, ()))]
  if not candidates:
    raise ValueError('ocrUnavailable')
  candidates.sort(key=lambda spec: len(OCR_LANGUAGES.get(spec.model_id, ())))
  return candidates[0].model_id


def inpaint_model(owner):
  from ...models.ocr_catalog import LAMA_MANGA_ONNX
  from ...models.inpaint_catalog import LAMA_MANGA
  if owner is None:
    raise ValueError('inpaintUnavailable')
  for spec in (LAMA_MANGA_ONNX, LAMA_MANGA):
    if owner.models.is_installed(spec):
      return spec.model_id
  raise ValueError('inpaintUnavailable')


@asynccontextmanager
async def resource(owner, resource_id):
  if owner is None:
    raise ValueError('ocrUnavailable')
  instance = owner.variant(resource_id)
  try:
    await asyncio.wait_for(instance.lease.acquire(), timeout=RESOURCE_WAIT_SECONDS)
  except TimeoutError as error:
    raise ValueError('resourceBusy') from error
  try:
    owned = not instance._loaded
    try:
      if owned:
        await instance.load()
      yield instance
    finally:
      if owned:
        await instance.release()
  finally:
    instance.lease.release()


def pixels(image):
  return cv2.cvtColor(np.asarray(image.convert('RGB')), cv2.COLOR_RGB2BGR)


def quad(region):
  x, y, w, h = (region[key] for key in ('x', 'y', 'width', 'height'))
  return region.get('sourceQuad') or [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]


def text_color(image, region):
  bounds, mask, background = letter_mask(image, region)
  crop = np.asarray(image.crop(bounds).convert('RGB'))
  if not crop.size:
    return '#222222'
  distance = np.linalg.norm(crop.astype(np.float32) - background, axis=2)
  foreground = (mask > 0) & (distance > max(45, float(np.percentile(distance, 90)) * .6))
  value = np.percentile(crop[foreground], 20 if background.mean() > 128 else 80, axis=0) if foreground.any() else np.array([0, 0, 0])
  if np.linalg.norm(value - background) < 120:
    value = np.array([0, 0, 0] if np.mean(background) > 128 else [255, 255, 255])
  value = value.astype(int)
  return '#' + ''.join(f'{channel:02x}' for channel in value)


def dominant_color(crop):
  samples = crop.reshape(-1, 3)
  if len(samples) > 100000:
    samples = samples[::max(1, len(samples) // 100000)]
  bins = samples.astype(np.int32) // 16
  keys = bins[:, 0] * 256 + bins[:, 1] * 16 + bins[:, 2]
  common = np.bincount(keys, minlength=4096).argmax()
  return np.median(samples[keys == common], axis=0)


def automatic_detector(owner, language):
  from ...models.ocr_catalog import COMIC_DETECTOR, RFDETR_SEG
  if owner is not None:
    for spec in (COMIC_DETECTOR, RFDETR_SEG):
      if owner.models.is_installed(spec):
        return spec.model_id
  return ppocr_model(owner, language, detector=True)


def largest_rectangle(mask):
  heights = np.zeros(mask.shape[1], dtype=int)
  best = (0, 0, 0, 0)
  for y, row in enumerate(mask):
    heights = np.where(row > 0, heights + 1, 0)
    stack = []
    for x, height in enumerate([*heights, 0]):
      start = x
      while stack and stack[-1][1] > height:
        start, previous = stack.pop()
        if (x - start) * previous > best[2] * best[3]:
          best = (start, y - previous + 1, x - start, int(previous))
      if not stack or stack[-1][1] < height:
        stack.append((start, height))
  return best


def balloon_geometry(image, regions):
  scale = min(1, 1800 / max(image.size))
  small = np.asarray(image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale)))))
  white = ((small.min(axis=2) > 220) & (np.ptp(small.astype(np.int16), axis=2) < 40)).astype(np.uint8)
  _, labels, stats, _ = cv2.connectedComponentsWithStats(white, connectivity=4)
  for region in regions:
    if region.get('manuallyEdited') or region.get('locked'):
      continue
    points = np.asarray(quad(region)) * scale
    x1, y1 = np.maximum(0, np.floor(points.min(axis=0)).astype(int))
    x2, y2 = np.minimum([small.shape[1], small.shape[0]], np.ceil(points.max(axis=0)).astype(int))
    crop = labels[y1:y2, x1:x2]
    counts = np.bincount(crop.ravel(), minlength=len(stats))
    counts[0] = 0
    label = int(counts.argmax())
    x, y, w, h, area = stats[label]
    enclosed = (label > 0 and w > 10 and h > 10 and x > 0 and y > 0
      and x+w < small.shape[1] and y+h < small.shape[0]
      and area < white.size * .5 and area > w*h*.4
      and counts[label] > crop.size * .25)
    if not enclosed:
      continue
    component = (labels[y:y+h, x:x+w] == label).astype(np.uint8) * 255
    contours, _ = cv2.findContours(component, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(component, contours, -1, 255, -1)
    margin = max(1, round(min(w, h) * .055))
    component = cv2.erode(component, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (margin*2+1, margin*2+1)))
    rx, ry, rw, rh = largest_rectangle(component)
    source = np.asarray(quad(region))
    left, top = source.min(axis=0)
    right, bottom = source.max(axis=0)
    inner_left, inner_top = (x+rx)/scale, (y+ry)/scale
    inner_right, inner_bottom = inner_left+rw/scale, inner_top+rh/scale
    overlap = max(0, min(inner_right,right)-max(inner_left,left)) * max(0,min(inner_bottom,bottom)-max(inner_top,top))
    if rw * rh / (scale * scale) >= (right-left) * (bottom-top) * .6 and overlap >= (right-left)*(bottom-top)*.55:
      # Bubble shape affects destination layout, never OCR units or source geometry.
      region.setdefault('sourceQuad',source.tolist())
      region.update(x=float((x+rx)/scale), y=float((y+ry)/scale), width=float(rw/scale), height=float(rh/scale))
      region.pop('textQuad', None)
      region['style']['angle'] = 0
  return regions


def line_geometry(points):
  points = np.asarray(points,np.float32)
  vectors = (points[:,None]-points[None]).reshape(16,2)
  edges = vectors[np.argsort(np.linalg.norm(vectors,axis=1))[[8,10]]]
  if np.dot(edges[0],edges[1]) < 0:
    edges[0] *= -1
  axis = np.abs(edges.mean(axis=0))
  if axis[1] >= axis[0]:
    ordered = points[np.argsort(points[:,1])]
    points = np.concatenate([ordered[:2][np.argsort(ordered[:2,0])],ordered[2:][np.argsort(-ordered[2:,0])]])
  else:
    ordered = points[np.argsort(points[:,0])]
    left = ordered[:2][np.argsort(ordered[:2,1])]
    right = ordered[2:][np.argsort(ordered[2:,1])]
    points = np.asarray([left[0],right[0],right[1],left[1]])
  centers = np.asarray([(points[index]+points[(index+1)%4])/2 for index in range(4)]).astype(int).astype(np.float32)
  vertical, horizontal = centers[2]-centers[0], centers[1]-centers[3]
  height,width = max(1,float(np.linalg.norm(vertical))),max(1,float(np.linalg.norm(horizontal)))
  left,top = points.min(axis=0)
  right,bottom = points.max(axis=0)
  return dict(points=points,centers=centers,size=min(width,height),ratio=width/height,
    angle=math.acos(float(np.clip(vertical[0]/height,-1,1)))%math.pi,
    aligned=min(abs(vertical[0]/height),abs(vertical[1]/height),abs(horizontal[0]/width),abs(horizontal[1]/width)) < .05,
    box=(left,top,right-left,bottom-top),center=points.mean(axis=0),vertical=height>=width)


def polygon_gap(first, second):
  if cv2.intersectConvexConvex(first,second)[0] > 0:
    return 0.0
  return max(0,min(min(-cv2.pointPolygonTest(first,tuple(map(float,point)),True) for point in second),
    min(-cv2.pointPolygonTest(second,tuple(map(float,point)),True) for point in first)))


def block_vertical(shapes):
  votes = sum(shape['vertical'] for shape in shapes)
  if votes*2 == len(shapes):
    return max(shapes,key=lambda shape:max(shape['ratio'],1/shape['ratio']))['vertical']
  return votes*2 > len(shapes)


def block_text_groups(lines, bubbles):
  by_bubble = {}
  for line in lines:
    center = tuple(line.mean(axis=0))
    bubble = next((index for index, points in enumerate(bubbles)
      if cv2.pointPolygonTest(points, center, False) >= 0), None)
    by_bubble.setdefault(bubble, []).append(line)
  outside = by_bubble.pop(None, [])
  inside = list(by_bubble.values())
  return inside + split_vertical_text(outside) if outside else inside


def split_vertical_text(lines):
  if len(lines) < 2:
    return [lines]
  starts = np.min(lines, axis=1)
  ends = np.max(lines, axis=1)
  widths, heights = (ends - starts).T
  if np.count_nonzero(heights > widths * 1.4) <= len(lines) / 2:
    return [lines]
  centers = (starts + ends) / 2
  for axis in (0, 1):
    order = np.argsort(centers[:, axis])
    for cut in range(1, len(order)):
      before, after = order[:cut], order[cut:]
      left = before[np.argmax(ends[before, axis])]
      right = after[np.argmin(starts[after, axis])]
      narrow, wide = sorted((widths[left], widths[right]))
      gap = starts[right, axis] - ends[left, axis]
      if gap < -.08 * narrow:
        continue
      # Adjacent columns can be uneven. Require a change in both scale and span.
      if axis == 0:
        short, tall = sorted((heights[left], heights[right]))
        split = narrow <= .9 * wide and short <= .7 * tall and short >= 2 * narrow
      else:
        split = narrow <= .65 * wide
      if split:
        return (split_vertical_text([lines[i] for i in sorted(before)])
          + split_vertical_text([lines[i] for i in sorted(after)]))
  return [lines]


def line_distance(a, b):
  font = max(a['size'],b['size'])
  def area(points):
    return cv2.contourArea(cv2.convexHull(np.asarray(points)))/font
  if a['vertical']:
    top = area([*a['points'][:2],*b['points'][:2]])
    bottom = area([*a['points'][2:],*b['points'][2:]])
    corner = 2 if bottom < font*.5 and bottom < top else 0
    return float(np.linalg.norm(a['points'][corner]-b['points'][corner]))
  left = area([a['points'][0],a['points'][3],b['points'][0],b['points'][3]])
  right = area([a['points'][1],a['points'][2],b['points'][1],b['points'][2]])
  middle = area([a['centers'][0],a['centers'][2],b['centers'][0],b['centers'][2]])
  if middle < font*.5 and middle < min(left,right):
    return float(np.linalg.norm(a['centers'][0]-b['centers'][0]))
  corner = 1 if right < font*.5 and right < left else 0
  return float(np.linalg.norm(a['points'][corner]-b['points'][corner]))


def paragraph_groups(lines):
  # Independent implementation of MIT 36fed852: pair graph, MST splitting, reading order.
  shapes = [line_geometry(points) for points in lines]
  count = len(shapes)
  gaps = np.zeros((count,count))
  distances = np.zeros((count,count))
  links = [set() for _ in shapes]
  for first in range(count):
    a = shapes[first]
    for second in range(first+1,count):
      b = shapes[second]
      gap = polygon_gap(a['points'],b['points'])
      gaps[first,second] = gaps[second,first] = gap
      size = min(a['size'],b['size'])
      x1,y1,w1,h1 = a['box']
      x2,y2,w2,h2 = b['box']
      compatible = gap <= 2*size and max(a['size'],b['size'])/size <= 2
      compatible &= not (a['ratio']>1.3 and b['ratio']<1/1.3 or b['ratio']>1.3 and a['ratio']<1/1.3)
      if a['aligned'] and b['aligned']:
        aligned = abs(x1+w1//2-x2-w2//2) < 3
        if not aligned and not (w1>h1*1.9 and h2>w2*1.9 or w2>h2*1.9 and h1>w1*1.9):
          if w1>h1*1.9 or w2>h2*1.9:
            aligned = min(abs(x1-x2),abs(x1+w1-x2-w2)) < 3*size
          elif h1>w1*1.9 or h2>w2*1.9:
            aligned = min(abs(y1-y2),abs(y1+h1-y2-h2)) < 3*size
        compatible &= gap < size and aligned
      else:
        compatible &= abs(a['angle']-b['angle']) < math.pi/12 and gap <= 3*size and abs(a['size']-b['size'])/size <= .25
      if compatible:
        links[first].add(second)
        links[second].add(first)
      distances[first,second] = line_distance(a,b)
      distances[second,first] = line_distance(b,a)
  def components(nodes, adjacency):
    remaining = set(nodes)
    result = []
    while remaining:
      component, pending = set(),[min(remaining)]
      while pending:
        node = pending.pop()
        if node not in remaining:
          continue
        remaining.remove(node)
        component.add(node)
        pending.extend(adjacency[node]&remaining)
      result.append(list(component))
    return result
  def split(nodes):
    nodes = list(set(nodes))
    if len(nodes) < 2:
      return [nodes]
    if len(nodes) == 2:
      a,b = nodes
      if distances[a,b] < 1.5*max(shapes[a]['size'],shapes[b]['size']) and abs(shapes[a]['angle']-shapes[b]['angle']) < math.pi*.2:
        return [nodes]
      return [[a],[b]]
    parents = {node:node for node in nodes}
    def root(node):
      while parents[node] != node:
        node = parents[node]
      return node
    edges = []
    for weight,a,b in sorted(((distances[a,b],a,b) for index,a in enumerate(nodes) for b in nodes[index+1:]),key=lambda edge:edge[0]):
      if root(a) != root(b):
        parents[root(a)] = root(b)
        edges.append((weight,a,b))
    edges.sort(key=lambda edge:-edge[0])
    weights = np.asarray([edge[0] for edge in edges])
    size = float(np.mean([shapes[node]['size'] for node in nodes]))
    deviation,average = float(weights.std()),float(weights.mean())
    longest,a,b = edges[0]
    alignment = float(np.abs(shapes[a]['center']-shapes[b]['center']).min())
    if (longest <= average+2*deviation or longest <= 1.5*size) and (deviation < max(.3*size+5,5) or gaps[a,b] == 0 and alignment < 5):
      return [nodes]
    adjacency = [set() for _ in shapes]
    for _,a,b in edges[1:]:
      adjacency[a].add(b)
      adjacency[b].add(a)
    return [part for component in components(nodes,adjacency) for part in split(component)]
  result = [part for component in components(range(count),links) for part in split(component)]
  for group in result:
    vertical = block_vertical([shapes[index] for index in group])
    group.sort(key=lambda index:-shapes[index]['center'][0] if vertical else shapes[index]['center'][1])
  return result


async def detect(owner, image, config, existing):
  choice = config['detector']
  model = automatic_detector(owner, config['sourceLanguage']) if choice == 'auto' else ppocr_model(owner, config['sourceLanguage'], detector=True) if choice == 'ppocr' else {'rtdetr':'comic-rtdetr-onnx', 'rfdetr-seg':'comic-rfdetr-seg-onnx'}[choice]
  async with resource(owner, model) as detector:
    quads = await detector.detect_comic(pixels(image))
    polygons = await detector.detect_comic_polygons(pixels(image)) if model.startswith('pp-ocrv5-') and hasattr(detector,'detect_comic_polygons') else []
    bubbles = deepcopy(getattr(detector,'bubble_quads',None))
  block_detector = model in ('comic-rtdetr-onnx', 'comic-rfdetr-seg-onnx')
  grouped_lines = []
  if block_detector:
    try:
      verifier = ppocr_model(owner, config['sourceLanguage'], detector=True)
    except ValueError:
      verifier = None
    if verifier:
      async with resource(owner, verifier) as text_detector:
        lines = [np.asarray(line, dtype=float) for line in await text_detector.detect_comic(pixels(image))]
        if hasattr(text_detector,'detect_comic_polygons'):
          polygons = await text_detector.detect_comic_polygons(pixels(image))
      centers = [line.mean(axis=0) for line in lines]
      verified = []
      bubble_polygons = [np.asarray(bubble, np.float32) for bubble in bubbles or []]
      for raw in quads:
        points = np.asarray(raw)
        left, top = points.min(axis=0)
        right, bottom = points.max(axis=0)
        supported = [line for line, (x, y) in zip(lines, centers)
          if left <= x <= right and top <= y <= bottom]
        if not supported:
          continue
        groups = block_text_groups(supported, bubble_polygons)
        if len(groups) == 1:
          verified.append(raw)
          grouped_lines.append(supported)
          continue
        for group in groups:
          points = np.concatenate(group)
          left, top = points.min(axis=0)
          right, bottom = points.max(axis=0)
          verified.append([[left,top],[right,top],[right,bottom],[left,bottom]])
          grouped_lines.append(group)
      quads = verified
  else:
    grouped_lines = [[quads[index] for index in group] for group in paragraph_groups(quads)]
    quads = []
    for group in grouped_lines:
      points = np.concatenate(group)
      left,top = points.min(axis=0)
      right,bottom = points.max(axis=0)
      quads.append(group[0] if len(group)==1 else [[left,top],[right,top],[right,bottom],[left,bottom]])
  regions = [region for region in existing if region.get('manuallyEdited') or region.get('locked')]
  protected_count = len(regions)
  for index,raw in enumerate(quads):
    points = np.asarray(raw, dtype=float)
    if points.shape != (4, 2) or not np.isfinite(points).all():
      continue
    points[:, 0] = np.clip(points[:, 0], 0, image.width)
    points[:, 1] = np.clip(points[:, 1], 0, image.height)
    x, y = points.min(axis=0)
    right, bottom = points.max(axis=0)
    w, h = right-x, bottom-y
    if w < 2 or h < 2:
      continue
    if any(x < r['x'] + r['width'] and right > r['x'] and y < r['y'] + r['height'] and bottom > r['y'] for r in regions[:protected_count]):
      continue
    def duplicate(region):
      intersection = max(0,min(right,region['x']+region['width'])-max(x,region['x'])) * max(0,min(bottom,region['y']+region['height'])-max(y,region['y']))
      return intersection/max(1,w*h+region['width']*region['height']-intersection) >= .5
    if any(duplicate(region) for region in regions[protected_count:]):
      continue
    settings = config['renderSettings']
    direction = settings['direction'] if settings['direction'] != 'auto' else 'vertical-rl' if h > w else 'horizontal'
    style = Style(fontFamily=settings['fontFamily'], fontSize=settings['fontSize'], autoFontSize=settings['autoSize'],
      autoFont=settings['autoFont'], autoLineSpacing=settings['autoLineSpacing'],
      autoAlign=settings['autoAlign'], autoBlockAlign=settings['autoBlockAlign'],
      direction=direction, color=settings['color'], strokeColor=settings['strokeColor'], strokeWidth=settings['strokeWidth'],
      lineSpacing=settings['lineSpacing'], align=settings['align'], blockAlign=settings['blockAlign']).model_dump()
    supported = [np.asarray(line,dtype=float) for line in grouped_lines[index]] if grouped_lines else []
    if supported and settings['direction'] == 'auto':
      widths = np.linalg.norm([line[1]-line[0] for line in supported], axis=1)
      heights = np.linalg.norm([line[3]-line[0] for line in supported], axis=1)
      areas = widths * heights
      style['direction'] = 'vertical-rl' if areas[heights > 1.4 * widths].sum() > areas.sum() / 2 else 'horizontal'
    projected = False
    if len(supported) == 1:
      line = supported[0]
      angle = math.degrees(math.atan2(*(line[1]-line[0])[::-1]))
      line_w, line_h = np.linalg.norm(line[1]-line[0]), np.linalg.norm(line[3]-line[0])
      if abs(angle) < 80 and line_w * line_h > w*h*.35:
        points = line
        x, y = points.min(axis=0)
        w, h = points.max(axis=0)-[x,y]
        style['angle'] = angle
        projected = cv2.isContourConvex(points.astype(np.float32))
        if settings['direction'] == 'auto':
          style['direction'] = 'vertical-rl' if line_h > line_w * 1.2 else 'horizontal'
    regions.append(dict(id=str(uuid4()), x=float(max(0,x)), y=float(max(0,y)), width=float(w), height=float(h),
      sourceQuad=points.tolist(), sourceText='', targetText=None, confidence=None, locked=False,
      ignored=False, manuallyEdited=False, style=style, qa=[]))
    if supported:
      regions[-1]['sourceLines'] = [line.tolist() for line in supported]
    if projected:
      # OCR keeps its stable padded crop; only lettering uses DB contour geometry.
      def overlap(polygon):
        candidate = np.asarray(polygon,dtype=np.float32)
        area, _ = cv2.intersectConvexConvex(points.astype(np.float32),candidate)
        return area/max(1,cv2.contourArea(points.astype(np.float32))+cv2.contourArea(candidate)-area)
      matching = max(polygons,key=overlap) if len(polygons) else None
      regions[-1]['textQuad'] = np.asarray(matching).tolist() if matching is not None and overlap(matching)>0 else points.tolist()
  if block_detector:
    if bubbles:
      inside = []
      for region in regions:
        center = np.asarray(quad(region)).mean(axis=0)
        if any(cv2.pointPolygonTest(np.asarray(bubble,np.float32),tuple(center),False)>=0 for bubble in bubbles):
          inside.append(region)
      if inside:
        await asyncio.to_thread(balloon_geometry,image,inside)
  else:
    await asyncio.to_thread(balloon_geometry,image,regions)
  rtl = config['sourceLanguage'] in ('ja', 'auto', 'zh', 'zh-Hant')
  return sorted(regions, key=lambda r: (round(r['y'] / max(20, image.height * .035)), -r['x'] if rtl else r['x']))


async def recognize(owner, image, config, regions):
  from ...models.ocr_catalog import MANGA_OCR
  groups = {}
  for region in regions:
    if region.get('locked') or region.get('ignored'):
      continue
    choice = config['ocr']
    if choice == 'auto':
      manga = (config['sourceLanguage'] in ('ja', 'auto') and region['style']['direction'] == 'vertical-rl'
        and owner is not None and owner.models.is_installed(MANGA_OCR))
      choice = 'manga-ocr' if manga else 'ppocr'
    model = 'manga-ocr-onnx' if choice == 'manga-ocr' else ppocr_model(owner, config['sourceLanguage'])
    groups.setdefault(model, []).append(region)
  raw = pixels(image)
  for model, members in groups.items():
    if config['ocr'] == 'auto' and model == 'manga-ocr-onnx':
      try:
        primary = ppocr_model(owner, config['sourceLanguage'])
      except ValueError:
        primary = None
      if primary:
        pending = []
        # Scene OCR rejects numeric/symbol art before generative Manga OCR can hallucinate text.
        async with resource(owner, primary) as recognizer:
          for region in members:
            candidate = deepcopy(region)
            await recognize_region(recognizer, primary, raw, config, candidate)
            if candidate['sourceText'].strip() and candidate.get('ignored'):
              region.update(candidate)
            else:
              pending.append(region)
        members = pending
    if not members:
      continue
    async with resource(owner, model) as recognizer:
      for region in members:
        await recognize_region(recognizer, model, raw, config, region, regions)
  await filter_translations(owner, image, config, regions)


def has_letters(text):
  # manga-image-translator's valuable-text gate excludes numbers, punctuation and controls.
  return any(unicodedata.category(char).startswith('L') for char in text)


def same_text(first, second):
  return ''.join(unicodedata.normalize('NFKC', first).split()).casefold() == ''.join(unicodedata.normalize('NFKC', second).split()).casefold()


def same_language(config):
  return config['sourceLanguage'] != 'auto' and config['sourceLanguage'].lower() == config['targetLanguage'].lower()


async def filter_translations(owner, image, config, regions):
  for region in regions:
    if not region.get('locked') and (not has_letters(region['sourceText']) or same_language(config)):
      region['ignored'] = True
  short = [r for r in regions if not r.get('locked') and not r.get('ignored')
    and 0 < len(re.sub(r'[\W_ーｰ]', '', r['sourceText'])) <= 2]
  if config['ocr'] in ('auto', 'manga-ocr') and short:
    try:
      verifier = ppocr_model(owner, config['sourceLanguage'])
    except ValueError:
      verifier = None
    if verifier:
      raw = pixels(image)
      async with resource(owner, verifier) as recognizer:
        for region in short:
          result = await recognizer.recognize_comic_box(raw, quad(region), config['sourceLanguage'], region['style']['direction'] == 'vertical-rl')
          reliable = [item for item in result if float(item[1]) >= .75]
          text = ''.join(str(item[0]) for item in reliable).strip()
          if re.fullmatch(r'[0-9０-９]+', text):
            region.update(sourceText=text, ignored=True)
          else:
            visible = ''.join(str(item[0]) for item in result if float(item[1]) >= .5).strip()
            if visible and not has_letters(visible):
              region['ignored'] = True


async def recognize_region(recognizer, model, raw, config, region, neighbors=()):
  if region.get('locked') or region.get('ignored'):
    return
  points = np.asarray(quad(region), dtype=np.float32)
  angle = region['style'].get('angle', 0)
  def padded(line):
    line = np.asarray(line,dtype=np.float32)
    horizontal,vertical = line[1]-line[0],line[3]-line[0]
    width,height = max(1,np.linalg.norm(horizontal)),max(1,np.linalg.norm(vertical))
    # BallonsTranslator expands text lines by 10% of font size before OCR.
    lines = region.get('sourceLines') or [line]
    largest = np.asarray(max(lines,key=lambda points:cv2.contourArea(np.asarray(points,np.float32))))
    font_size = min(np.linalg.norm(largest[1]-largest[0]),np.linalg.norm(largest[3]-largest[0]))
    margin = max(3,font_size*.1)
    result = line + np.asarray([[-1,-1],[1,-1],[1,1],[-1,1]]) @ np.stack([horizontal/width,vertical/height]) * margin
    return np.clip(result,[0,0],[raw.shape[1]-1,raw.shape[0]-1]).astype(np.float32)
  if model == 'manga-ocr-onnx' and abs(angle) <= 3:
    points = padded(points)
  input_pixels, input_quad = raw, points
  if model == 'manga-ocr-onnx' and abs(angle) <= 3:
    left, top = np.floor(points.min(axis=0)).astype(int)
    right, bottom = np.ceil(points.max(axis=0)).astype(int)
    input_pixels = raw[top:bottom,left:right].copy()
    input_quad = points - [left,top]
    for other in neighbors:
      if other['id'] == region['id'] or other.get('ignored'):
        continue
      for line in other.get('sourceLines') or [quad(other)]:
        cv2.fillConvexPoly(input_pixels,np.rint(np.asarray(line)-[left,top]).astype(np.int32),(255,255,255))
  if abs(angle) > 3:
    width = max(2, round(np.linalg.norm(points[1]-points[0])))
    height = max(2, round(np.linalg.norm(points[3]-points[0])))
    destination = np.array([[0,0],[width-1,0],[width-1,height-1],[0,height-1]], dtype=np.float32)
    input_pixels = cv2.warpPerspective(input_pixels, cv2.getPerspectiveTransform(input_quad.astype(np.float32), destination), (width,height), borderValue=(255,255,255))
    input_quad = destination
  result = await recognizer.recognize_comic_box(input_pixels, input_quad, config['sourceLanguage'], region['style']['direction'] == 'vertical-rl')
  if model != 'manga-ocr-onnx':
    result = [item for item in result if float(item[1]) >= .5]
  region['sourceText'] = '\n'.join(str(item[0]) for item in result)
  region['confidence'] = None if model == 'manga-ocr-onnx' else min((float(item[1]) for item in result), default=None)
  points = np.asarray(quad(region))
  width, height = points.max(axis=0) - points.min(axis=0)
  length = max(1, len(region['sourceText'].replace('\n', '')))
  region['sourceFontSize'] = float(max(6, min(4096, min(width, height, math.sqrt(width * height / length) * .95))))
  if not region.get('manuallyEdited'):
    text = region['sourceText'].strip()
    if text.isdigit() or not any(char.isalnum() for char in text):
      region['ignored'] = True



def letter_mask(image, region):
  points = np.asarray(quad(region), dtype=float)
  left, top = points.min(axis=0)
  right, bottom = points.max(axis=0)
  unit = region.get('sourceFontSize') or min(right-left, bottom-top)
  margin = max(2, round(min(96, unit * .25)))
  left, top = max(0, math.floor(left)-margin), max(0, math.floor(top)-margin)
  right, bottom = min(image.width, math.ceil(right)+margin), min(image.height, math.ceil(bottom)+margin)
  crop = np.asarray(image.crop((left, top, right, bottom)).convert('RGB'))
  polygon = np.zeros(crop.shape[:2], dtype=np.uint8)
  lines = region.get('sourceLines') or [points]
  for line in lines:
    cv2.fillConvexPoly(polygon,np.rint(np.asarray(line) - [left,top]).astype(np.int32),255)
  ring = crop[polygon == 0]
  background = np.median(ring, axis=0) if len(ring) >= 10 else dominant_color(crop)
  gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
  background_gray = float(background @ [.299, .587, .114])
  contrast = background_gray - gray.astype(np.float32) if background_gray > 128 else gray.astype(np.float32) - background_gray
  inside = contrast[polygon > 0]
  threshold = max(45, min(160, float(np.percentile(inside,97)) * .55)) if len(inside) else 45
  candidate = (contrast > threshold).astype(np.uint8)
  count, labels, stats, _ = cv2.connectedComponentsWithStats(candidate, connectivity=8)
  keep = np.zeros(count, dtype=np.uint8)
  overlap = np.bincount(labels[polygon > 0], minlength=count)
  area = max(1, int(np.count_nonzero(polygon)))
  for label in range(1, count):
    x, y, w, h, size = stats[label]
    if size >= 2 and overlap[label] >= size * .2 and size < area * .75:
      keep[label] = 255
  mask = keep[labels]
  radius = max(1, min(24, round(unit * .065)))
  kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius*2+1, radius*2+1))
  mask = cv2.dilate(mask, kernel)
  mask = cv2.bitwise_and(mask, cv2.dilate(polygon, kernel))
  return (left, top, right, bottom), mask, background


def smooth_background(crop, mask):
  step = max(1, round(math.sqrt(crop.shape[0]*crop.shape[1]/12000)))
  yy, xx = np.mgrid[0:crop.shape[0]:step, 0:crop.shape[1]:step]
  x, y = xx/max(1,crop.shape[1]), yy/max(1,crop.shape[0])
  features = np.stack([np.ones_like(x),x,y,x*y,x*x,y*y], axis=-1)
  valid = mask[::step,::step] == 0
  samples = crop[::step,::step].astype(float)
  if np.count_nonzero(valid) < 30:
    return None
  for _ in range(2):
    coefficients = np.linalg.lstsq(features[valid], samples[valid], rcond=None)[0]
    errors = np.linalg.norm(features @ coefficients - samples, axis=-1)
    cutoff = max(4, np.percentile(errors[valid], 85))
    valid &= errors <= cutoff
  if np.percentile(errors[mask[::step,::step] == 0], 95) > 24:
    return None
  ys, xs = np.nonzero(mask)
  x, y = xs/max(1,crop.shape[1]), ys/max(1,crop.shape[0])
  predicted = np.stack([np.ones_like(x),x,y,x*y,x*x,y*y], axis=-1) @ coefficients
  return np.rint(predicted).clip(0,255).astype(np.uint8)


def mask_for(image, regions, strokes):
  mask = Image.new('L', image.size)
  for region in regions:
    if not region.get('ignored') and not region.get('locked'):
      bounds, refined, _ = letter_mask(image, region)
      mask.paste(Image.fromarray(np.maximum(np.asarray(mask.crop(bounds)), refined)), bounds[:2])
  draw = ImageDraw.Draw(mask)
  restore = Image.new('L', image.size)
  restore_draw = ImageDraw.Draw(restore)
  for stroke in strokes:
    points = [tuple(p) for p in stroke['points']]
    radius = stroke['size'] / 2
    for target, fill in ((draw, 255 if stroke['mode'] == 'erase' else 0),
      (restore_draw, 255 if stroke['mode'] == 'restore' else 0)):
      if len(points) > 1:
        target.line(points, fill=fill, width=max(1, round(stroke['size'])), joint='curve')
      for x, y in points:
        target.ellipse((x-radius,y-radius,x+radius,y+radius),fill=fill)
  return np.asarray(mask), np.asarray(restore)


async def repair(owner, source, base, regions, strokes, config):
  mask, restore = await asyncio.to_thread(mask_for, source, regions, strokes)
  raw = await asyncio.to_thread(pixels, base)
  if np.any(mask):
    method = config['repairMethod']
    if method == 'solid':
      rgb = ImageColor.getrgb(config['renderSettings']['fillColor'])
      result = np.where((mask > 0)[..., None], np.array(rgb[::-1], dtype=np.uint8), raw)
    else:
      result = raw.copy()
      pending = mask.copy()
      if method == 'auto':
        for region in regions:
          if region.get('ignored') or region.get('locked'):
            continue
          bounds, refined, background = await asyncio.to_thread(letter_mask, source, region)
          left, top, right, bottom = bounds
          crop = np.asarray(source.crop(bounds))
          selected = ((refined > 0) & (pending[top:bottom, left:right] > 0)).astype(np.uint8)
          fitted = await asyncio.to_thread(smooth_background, crop, selected)
          if fitted is not None:
            result[top:bottom, left:right][selected > 0] = fitted[:,::-1]
            pending[top:bottom, left:right][selected > 0] = 0
      if pending.any():
        model = None
        if method in ('auto', 'lama-manga'):
          try:
            model = inpaint_model(owner)
          except ValueError:
            if method != 'auto':
              raise
        # Keep the native text pixels and context; whole-page downsizing loses fine strokes.
        async def tiles(inpainter=None):
          for top in range(0, source.height, 384):
            for left in range(0, source.width, 384):
              right, bottom = min(source.width, left+384), min(source.height, top+384)
              selected = pending[top:bottom, left:right]
              if not selected.any():
                continue
              ys, xs = np.nonzero(selected)
              x1, y1 = max(0, left+int(xs.min())-64), max(0, top+int(ys.min())-64)
              x2, y2 = min(source.width, left+int(xs.max())+65), min(source.height, top+int(ys.max())+65)
              local_mask = pending[y1:y2,x1:x2].copy()
              write_mask = np.zeros_like(local_mask)
              ix1, iy1, ix2, iy2 = max(left,x1), max(top,y1), min(right,x2), min(bottom,y2)
              write_mask[iy1-y1:iy2-y1, ix1-x1:ix2-x1] = pending[iy1:iy2, ix1:ix2]
              crop = result[y1:y2, x1:x2].copy()
              filled = await inpainter.repair(crop, local_mask) if inpainter else await asyncio.to_thread(cv2.inpaint, crop, local_mask, 3, cv2.INPAINT_TELEA)
              target = result[y1:y2, x1:x2]
              target[write_mask > 0] = filled[write_mask > 0]
        if model:
          async with resource(owner, model) as inpainter:
            await tiles(inpainter)
        else:
          await tiles()
  else:
    result = raw
  result = np.where((restore > 0)[..., None], pixels(source), result)
  return Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB))
