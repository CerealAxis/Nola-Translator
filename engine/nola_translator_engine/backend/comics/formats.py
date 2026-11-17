"""Bounded readers for raster comic containers and publication formats."""
from __future__ import annotations

from contextlib import closing
from hashlib import file_digest
import io
import math
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import stat
import struct
import threading
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET
import zipfile

from PIL import Image, ImageOps

MAX_PIXELS = 40_000_000
MAX_PAGE_BYTES = 64 * 1024**2
MAX_TOTAL_BYTES = 2 * 1024**3
MAX_PAGES = 10000
IMAGE_SUFFIXES = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff'}
PDF_LOCK = threading.Lock()


def natural(value):
  return [int(part) if part.isdigit() else part.casefold() for part in re.split(r'(\d+)', value)]


def png_bytes(image):
  stream = io.BytesIO()
  image.save(stream, 'PNG')
  return stream.getvalue()


def image_frames(data, name, first_frame):
  if len(data) > MAX_PAGE_BYTES:
    raise ValueError('imageTooLarge')
  with Image.open(io.BytesIO(data)) as image:
    count = 1 if first_frame else getattr(image, 'n_frames', 1)
    if count > MAX_PAGES:
      raise ValueError('imageTooLarge')
    for frame in range(count):
      image.seek(frame)
      if image.width * image.height > MAX_PIXELS:
        raise ValueError('imageTooLarge')
      yield name if count == 1 else f'{Path(name).stem}-{frame + 1:04}.png', ImageOps.exif_transpose(image).convert('RGB').copy()


def validate_zip(archive):
  entries = archive.infolist()
  if len(entries) > MAX_PAGES * 4 or sum(e.file_size for e in entries) > MAX_TOTAL_BYTES:
    raise ValueError('unsafeArchive')
  seen = set()
  for entry in entries:
    name = entry.filename
    if (name.casefold() in seen or '\\' in name or PureWindowsPath(name).anchor
      or '..' in PurePosixPath(name).parts or entry.flag_bits & 1
      or stat.S_IFMT(entry.external_attr >> 16) not in (0, stat.S_IFREG, stat.S_IFDIR)
      or entry.file_size > MAX_PAGE_BYTES):
      raise ValueError('unsafeArchive')
    seen.add(name.casefold())


def pdf_pages(path, request):
  import pypdfium2 as pdf
  try:
    yield from render_pdf_pages(path, request)
  except pdf.PdfiumError as error:
    raise ValueError('encryptedBook' if error.err_code == 4 else 'invalidDocument') from error


def render_pdf_pages(path, request):
  import pypdfium2 as pdf
  with PDF_LOCK, pdf.PdfDocument(path) as doc:
    end = request.lastPage or len(doc)
    if not 1 <= request.firstPage <= end <= len(doc) or end - request.firstPage >= MAX_PAGES:
      raise ValueError('invalidPageRange')
    for number in range(request.firstPage - 1, end):
      with closing(doc[number]) as page:
        width, height = page.get_size()
        scale = request.pdfDpi / 72
        if not math.isfinite(width * height) or width <= 0 or height <= 0 or math.ceil(width * scale) * math.ceil(height * scale) > MAX_PIXELS:
          raise ValueError('imageTooLarge')
        with closing(page.render(scale=scale)) as bitmap:
          yield f'{path.stem}-{number + 1:04}.png', bitmap.to_pil().convert('RGB').copy()


def epub_entries(archive):
  def xml(name):
    return ET.fromstring(archive.read(name))
  def resolve(base, href):
    url = urlsplit(href)
    if url.scheme or url.netloc:
      raise ValueError('unsafeArchive')
    path = (PurePosixPath(base).parent / unquote(url.path))
    parts = []
    for part in path.parts:
      if part == '..':
        if not parts:
          raise ValueError('unsafeArchive')
        parts.pop()
      elif part not in ('', '.'):
        parts.append(part)
    return '/'.join(parts)
  container = xml('META-INF/container.xml')
  rootfile = next((node.attrib['full-path'] for node in container.iter() if node.tag.endswith('rootfile')), None)
  if not rootfile:
    raise ValueError('invalidDocument')
  package = xml(rootfile)
  manifest = {node.attrib['id']: node for node in package.iter() if node.tag.endswith('}item')}
  found = set()
  for item in (node for node in package.iter() if node.tag.endswith('itemref')):
    entry = manifest[item.attrib['idref']]
    name = resolve(rootfile, entry.attrib['href'])
    if entry.attrib.get('media-type', '').startswith('image/'):
      images = [name]
    else:
      images = [resolve(name, node.attrib.get('src') or node.attrib.get('{http://www.w3.org/1999/xlink}href') or node.attrib.get('href', ''))
        for node in xml(name).iter() if node.tag.rsplit('}', 1)[-1] in ('img', 'image')]
    for image in images:
      if image not in found:
        found.add(image)
        yield image


def kindle_pages(path, first_frame):
  data = path.read_bytes()
  if len(data) < 86 or data[60:68] != b'BOOKMOBI':
    raise ValueError('unsupportedFormat')
  count = int.from_bytes(data[76:78], 'big')
  if count < 2 or count > 65535 or len(data) < 78 + count * 8:
    raise ValueError('invalidDocument')
  offsets = [int.from_bytes(data[78 + i * 8:82 + i * 8], 'big') for i in range(count)] + [len(data)]
  if offsets != sorted(offsets) or offsets[0] < 78 + count * 8:
    raise ValueError('invalidDocument')
  header = data[offsets[0]:offsets[1]]
  if len(header) < 112 or header[16:20] != b'MOBI' or header[12:14] != b'\0\0':
    raise ValueError('encryptedBook')
  first = int.from_bytes(header[108:112], 'big')
  if not 0 < first < count:
    raise ValueError('unsupportedFormat')
  for index in range(first, count):
    raw = data[offsets[index]:offsets[index + 1]]
    if raw.startswith((b'\xff\xd8\xff', b'\x89PNG', b'GIF8', b'RIFF', b'BM', b'II*\0', b'MM\0*')):
      yield from image_frames(raw, f'{path.stem}-{index - first + 1:04}.png', first_frame)


def read_sources(request):
  paths = []
  for raw in request.paths:
    original = Path(raw)
    if original.is_symlink():
      raise ValueError('invalidDocument')
    path = original.resolve(strict=True)
    if path.is_dir():
      paths.extend(sorted((p for p in path.rglob('*') if p.is_file() and not p.is_symlink() and p.suffix.lower() in IMAGE_SUFFIXES), key=lambda p: natural(str(p.relative_to(path)))))
    elif path.is_file() and not path.is_symlink():
      paths.append(path)
    else:
      raise ValueError('invalidDocument')
  paths.sort(key=lambda p: natural(str(p)))
  total = sum(path.stat().st_size for path in paths)
  if total > MAX_TOTAL_BYTES:
    raise ValueError('importTooLarge')
  count = 0
  for path in paths:
    suffix = path.suffix.lower()
    with path.open('rb') as stream:
      digest = file_digest(stream, 'sha256').hexdigest()
    if suffix == '.pdf':
      stream = pdf_pages(path, request)
    elif suffix in ('.zip', '.cbz', '.epub'):
      def zipped():
        with zipfile.ZipFile(path) as archive:
          validate_zip(archive)
          entries = epub_entries(archive) if suffix == '.epub' else sorted((e.filename for e in archive.infolist() if Path(e.filename).suffix.lower() in IMAGE_SUFFIXES), key=natural)
          for name in entries:
            yield from image_frames(archive.read(name), name, request.firstFrame)
      stream = zipped()
    elif suffix in ('.mobi', '.azw', '.azw3'):
      stream = kindle_pages(path, request.firstFrame)
    elif suffix in IMAGE_SUFFIXES:
      stream = image_frames(path.read_bytes(), path.name, request.firstFrame)
    else:
      raise ValueError('unsupportedFormat')
    for index, (name, image) in enumerate(stream):
      count += 1
      if count > MAX_PAGES:
        raise ValueError('importTooLarge')
      yield name, image, f'{digest}:{name}:{request.pdfDpi if suffix == ".pdf" else 0}'
  if not count:
    raise ValueError('emptyImport')


def write_pdf(images):
  import pypdfium2 as pdf
  target = io.BytesIO()
  with PDF_LOCK, pdf.PdfDocument.new() as document:
    for image in images:
      with closing(pdf.PdfBitmap.from_pil(image.convert('RGB'))) as bitmap:
        width, height = image.size
        with closing(document.new_page(width * 72 / 200, height * 72 / 200)) as page:
          obj = pdf.PdfImage.new(document)
          obj.set_bitmap(bitmap)
          obj.set_matrix(pdf.PdfMatrix().scale(width * 72 / 200, height * 72 / 200))
          page.insert_obj(obj)
          page.gen_content()
    document.save(target)
  return target.getvalue()
