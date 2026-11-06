"""Bounded, offline readers and writers for image-based comic publications."""
from contextlib import closing
from datetime import datetime, timezone
import io
import math
from pathlib import PurePosixPath, PureWindowsPath
import posixpath
import stat
import struct
import threading
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape
import zipfile

from PIL import Image

MAX_PAGE_BYTES = 24 * 1024 * 1024
MAX_IMPORT_BYTES = 512 * 1024 * 1024
MAX_PIXELS = 12_000_000
PDF_DPI = 200
# PDFium requires serialization even when threads use different documents.
_PDF_LOCK = threading.Lock()


def validate_archive(archive):
    entries = archive.infolist()
    if len(entries) > 5000 or sum(entry.file_size for entry in entries) > MAX_IMPORT_BYTES:
        raise ValueError("unsafeArchive")
    seen = set()
    for entry in entries:
        name = entry.filename
        if (name.casefold() in seen or "\\" in name or PureWindowsPath(name).anchor
                or ".." in PurePosixPath(name).parts or entry.flag_bits & 1
                or stat.S_IFMT(entry.external_attr >> 16) not in (0, stat.S_IFREG, stat.S_IFDIR)):
            raise ValueError("unsafeArchive")
        seen.add(name.casefold())


def png_bytes(image):
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def pdf_pages(path, dpi, first, last):
    import pypdfium2 as pdf
    try:
        with _PDF_LOCK, pdf.PdfDocument(path) as doc:
            end = last if last is not None else len(doc)
            if not 1 <= first <= end <= len(doc) or end - first >= 1000:
                raise ValueError("invalidPageRange")
            for number in range(first, end + 1):
                with closing(doc[number - 1]) as page:
                    width, height = page.get_size()
                    # PDFium reports page boxes as floats and rounds render dimensions upward.
                    scale = dpi / 72 * (1 - 1e-7)
                    if math.ceil(width * scale) * math.ceil(height * scale) > MAX_PIXELS:
                        raise ValueError("imageTooLarge")
                    with closing(page.render(scale=scale)) as bitmap:
                        yield f"{path.stem}-{number:04}.png", png_bytes(bitmap.to_pil())
    except pdf.PdfiumError as error:
        raise ValueError("encryptedBook" if error.err_code == 4 else "invalidDocument") from error


def write_pdf(target, images):
    import pypdfium2 as pdf
    with _PDF_LOCK, pdf.PdfDocument.new() as doc:
        for _, path in images:
            with Image.open(path) as image, closing(pdf.PdfBitmap.from_pil(image.convert("RGB"))) as bitmap:
                width, height = (value * 72 / PDF_DPI for value in image.size)
                with closing(doc.new_page(width, height)) as page:
                    obj = pdf.PdfImage.new(doc)
                    obj.set_bitmap(bitmap)
                    obj.set_matrix(pdf.PdfMatrix().scale(width, height))
                    page.insert_obj(obj)
                    page.gen_content()
        doc.save(target)


def epub_pages(path):
    def resolve(base, href):
        url = urlsplit(href)
        relative = unquote(url.path)
        if not relative or url.scheme or url.netloc or PureWindowsPath(relative).anchor or "\\" in relative:
            raise ValueError("unsafeArchive")
        name = posixpath.normpath(posixpath.join(posixpath.dirname(base), relative))
        if name == ".." or name.startswith("../"):
            raise ValueError("unsafeArchive")
        return name

    with zipfile.ZipFile(path) as archive:
        validate_archive(archive)

        def xml(name):
            if archive.getinfo(name).file_size > 2 * 1024 * 1024:
                raise ValueError("unsafeArchive")
            try:
                return ET.fromstring(archive.read(name))
            except ET.ParseError as error:
                raise ValueError("invalidDocument") from error

        rootfile = xml("META-INF/container.xml").find(".//{*}rootfile")
        if rootfile is None:
            raise ValueError("invalidDocument")
        opf = resolve("", rootfile.attrib["full-path"])
        package = xml(opf)
        items = {node.attrib["id"]: node for node in package.findall("{*}manifest/{*}item")}
        encrypted = set()
        if "META-INF/encryption.xml" in archive.namelist():
            encrypted = {resolve("", node.attrib["URI"]) for node in xml("META-INF/encryption.xml").findall(".//{*}CipherReference")}
        toc = {}
        for item in items.values():
            if "nav" in item.get("properties", "").split():
                navpath = resolve(opf, item.attrib["href"])
                for nav in xml(navpath).findall(".//{*}nav"):
                    if "toc" in nav.get("{http://www.idpf.org/2007/ops}type", "").split():
                        for link in nav.findall(".//{*}a"):
                            if link.get("href") and urlsplit(link.get("href")).path:
                                toc.setdefault(resolve(navpath, link.attrib["href"]), "".join(link.itertext()).strip()[:200])
                break
        spine = package.find("{*}spine")
        if spine is None:
            raise ValueError("invalidDocument")
        anchors = {}
        if not toc and spine.get("toc"):
            ncx = items[spine.attrib["toc"]]
            if ncx.get("media-type") != "application/x-dtbncx+xml":
                raise ValueError("invalidDocument")
            ncx_path = resolve(opf, ncx.attrib["href"])
            if ncx_path in encrypted:
                raise ValueError("encryptedBook")
            for point in xml(ncx_path).findall("{*}navMap/.//{*}navPoint"):
                label = point.find("{*}navLabel/{*}text")
                content = point.find("{*}content")
                if label is None or content is None:
                    raise ValueError("invalidDocument")
                src = content.attrib["src"]
                page = resolve(ncx_path, src)
                title = "".join(label.itertext()).strip()[:200]
                fragment = unquote(urlsplit(src).fragment)
                if fragment:
                    anchors.setdefault((page, fragment), title)
                else:
                    toc.setdefault(page, title)
        direction = spine.get("page-progression-direction")
        chapter = None
        for ref in spine.findall("{*}itemref"):
            if ref.get("linear") == "no":
                continue
            item = items[ref.attrib["idref"]]
            page = resolve(opf, item.attrib["href"])
            if page in encrypted:
                raise ValueError("encryptedBook")
            if page in toc:
                chapter = (page, toc[page])
            if item.get("media-type") in ("application/xhtml+xml", "image/svg+xml"):
                names = []
                for node in xml(page).iter():
                    anchor = (page, node.get("id") or node.get("{http://www.w3.org/XML/1998/namespace}id"))
                    if anchor in anchors:
                        chapter = (anchor, anchors[anchor])
                    if node.tag.rsplit("}", 1)[-1] in ("img", "image"):
                        href = node.get("src") or node.get("href") or node.get("{http://www.w3.org/1999/xlink}href")
                        if href:
                            names.append((resolve(page, href), chapter))
            else:
                names = [(page, chapter)]
            if not names:
                raise ValueError("unsupportedFormat")
            for name, image_chapter in names:
                if name in encrypted:
                    raise ValueError("encryptedBook")
                if archive.getinfo(name).file_size > MAX_PAGE_BYTES:
                    raise ValueError("imageTooLarge")
                yield PurePosixPath(name).name, archive.read(name), image_chapter, direction


def write_epub(target, project, images):
    title = escape(project["title"])
    lang = escape(project["config"]["targetLanguage"])
    direction = project["config"]["readingDirection"]
    with zipfile.ZipFile(target, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        archive.writestr("META-INF/container.xml", '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        manifest, spine, links = [], [], []
        chapters = {item["id"]: item["title"] for item in project["chapters"]}
        previous = None
        for i, (page, path) in enumerate(images, 1):
            archive.write(path, f"{i}.png")
            width, height = page["width"], page["height"]
            archive.writestr(f"{i}.xhtml", f'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>{i}</title><meta name="viewport" content="width={width}, height={height}"/><style>html,body{{margin:0}}</style></head><body><img src="{i}.png" alt="{i}" width="{width}" height="{height}"/></body></html>')
            manifest.append(f'<item id="p{i}" href="{i}.xhtml" media-type="application/xhtml+xml"/><item id="i{i}" href="{i}.png" media-type="image/png"/>')
            spine.append(f'<itemref idref="p{i}"/>')
            if page["chapterId"] != previous:
                previous = page["chapterId"]
                links.append(f'<li><a href="{i}.xhtml">{escape(chapters[previous])}</a></li>')
        archive.writestr("nav.xhtml", f'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>{title}</title></head><body><nav epub:type="toc"><h1>{title}</h1><ol>{"".join(links)}</ol></nav></body></html>')
        modified = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        archive.writestr("book.opf", f'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:{project["id"]}</dc:identifier><dc:title>{title}</dc:title><dc:language>{lang}</dc:language><meta property="dcterms:modified">{modified}</meta><meta property="rendition:layout">pre-paginated</meta></metadata><manifest><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>{"".join(manifest)}</manifest><spine page-progression-direction="{direction}">{"".join(spine)}</spine></package>')


def kindle_images(path):
    # Palm Database record order is retained; this imports embedded images, not reflowable text.
    with path.open("rb") as stream:
        header = stream.read(78)
        if len(header) != 78 or header[60:68] != b"BOOKMOBI":
            raise ValueError("invalidDocument")
        count = int.from_bytes(header[76:78], "big")
        directory = stream.read(count * 8)
        if count < 2 or len(directory) != count * 8:
            raise ValueError("invalidDocument")
        offsets = [item[0] for item in struct.iter_unpack(">I4x", directory)] + [path.stat().st_size]
        if offsets[0] < stream.tell() or any(a >= b for a, b in zip(offsets, offsets[1:])):
            raise ValueError("invalidDocument")
        stream.seek(offsets[0])
        mobi = stream.read(min(128, offsets[1] - offsets[0]))
        if len(mobi) < 112 or mobi[16:20] != b"MOBI":
            raise ValueError("invalidDocument")
        if mobi[12:14] != b"\x00\x00":
            raise ValueError("encryptedBook")
        start = int.from_bytes(mobi[108:112], "big")
        if not 1 <= start <= count:
            raise ValueError("invalidDocument")
        for index in range(start, count):
            stream.seek(offsets[index])
            prefix = stream.read(8)
            if not prefix.startswith((b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"GIF87a", b"GIF89a")):
                continue
            size = offsets[index + 1] - offsets[index]
            if size > MAX_PAGE_BYTES:
                raise ValueError("imageTooLarge")
            stream.seek(offsets[index])
            yield f"{path.stem}-{index:04}", stream.read(size)
