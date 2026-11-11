from pathlib import Path
import struct
import zipfile
import json
from uuid import uuid4

import numpy as np
import pytest
from PIL import Image

from nola_translator_engine.backend.comic import ComicRepository
from nola_translator_engine.backend.comic_formats import png_bytes


@pytest.fixture
def comic(tmp_path):
    paths = []
    for i, size in enumerate([(360, 180), (200, 300)]):
        y, x = np.indices((size[1], size[0]))
        pixels = np.stack((x % 256, y % 256, (x + y) % 256), axis=-1).astype(np.uint8)
        path = tmp_path / f"panel{i}.png"
        Image.fromarray(pixels).save(path)
        paths.append(str(path))
    repo = ComicRepository(tmp_path / "shelf")
    return repo, repo.import_sources(paths, "A & B"), paths


@pytest.mark.parametrize("kind", ["epub", "pdf"])
def test_publication_round_trip(comic, kind):
    repo, book, originals = comic
    path = repo.export(book["id"], kind, None, "source")
    if kind == "epub":
        with zipfile.ZipFile(path) as archive:
            first = archive.infolist()[0]
            assert first.filename == "mimetype" and first.compress_type == zipfile.ZIP_STORED
    restored = repo.import_sources([str(path)], "Reopened")
    assert len(restored["pages"]) == 2
    for page, original in zip(restored["pages"], originals):
        pixels = np.asarray(Image.open(repo.asset_path(restored["id"], page["id"], "source"))).astype(int)
        expected = np.asarray(Image.open(original)).astype(int)
        assert expected.shape == pixels.shape
        assert np.abs(pixels - expected).mean() < 1
    if kind == "pdf":
        one = repo.import_sources([str(path)], "Range", dpi=100, first=2, last=2)
        assert [(p["width"], p["height"]) for p in one["pages"]] == [(100, 150)]
        with pytest.raises(ValueError, match="invalidPageRange"):
            repo.import_sources([str(path)], "Range", first=3)


@pytest.mark.parametrize("suffix", ["gif", "tiff"])
def test_multi_frame_pages_and_first_only(tmp_path, suffix):
    frames = [Image.new("RGB", (20, 15), color) for color in ("red", "blue")]
    source = tmp_path / f"animation.{suffix}"
    frames[0].save(source, save_all=True, append_images=frames[1:])
    repo = ComicRepository(tmp_path / "store")
    book = repo.import_sources([str(source)], "Frames")
    for frame, page in zip(frames, book["pages"], strict=True):
        assert Image.open(repo.asset_path(book["id"], page["id"], "source")).getpixel((0, 0)) == frame.getpixel((0, 0))
    assert repo.import_sources([str(source)], "First", first_frame=True)["pageCount"] == 1


def test_kindle_pdb_record_extraction_and_encryption(comic, tmp_path):
    repo, _, images = comic
    header = bytearray(78)
    header[60:68] = b"BOOKMOBI"
    header[76:78] = struct.pack(">H", 3)
    mobi = bytearray(128)
    mobi[16:20] = b"MOBI"
    mobi[108:112] = struct.pack(">I", 1)
    first = Path(images[0]).read_bytes()
    second = Path(images[1]).read_bytes()
    offset = len(header) + 24
    directory = b"".join(struct.pack(">I4x", n) for n in (offset, offset + len(mobi), offset + len(mobi) + len(first)))
    source = tmp_path / "panels.azw3"
    source.write_bytes(header + directory + mobi + first + second)
    assert repo.import_sources([str(source)], "Kindle")["pageCount"] == 2
    mobi[13] = 2
    source.write_bytes(header + directory + mobi + first + second)
    with pytest.raises(ValueError, match="encryptedBook"):
        repo.import_sources([str(source)], "Encrypted")


def test_export_exchange_and_archive_validation(comic, tmp_path):
    repo, book, _ = comic
    page = book["pages"][1]
    region = {"id": str(uuid4()), "sourceText": "Hello", "targetText": "Bonjour", "x": 10, "y": 20, "width": 80, "height": 20,
              "confidence": None, "locked": True, "ignored": False, "qa": [],
              "style": {"fontSize": 12, "color": "#000000", "direction": "horizontal", "align": "center"}}
    repo.edit({"projectId": book["id"], "operationId": str(uuid4()), "expectedRevision": book["revision"],
               "command": {"action": "saveRegion", "pageId": page["id"], "region": region}})
    exported = repo.export(book["id"], "png", [page["id"]], "source")
    assert exported.read_bytes() == repo.asset_path(book["id"], page["id"], "source").read_bytes()
    text = json.loads(repo.export(book["id"], "json", None).read_text(encoding="utf-8"))
    assert [p["id"] for p in text["pages"]] == [p["id"] for p in book["pages"]]
    with zipfile.ZipFile(repo.export(book["id"], "labelplus", None)) as archive:
        label = archive.read("labels.txt").decode("utf-8-sig")
        assert ">>>>>>>>[0002.png]<<<<<<<<" in label
        assert "----------------[1]----------------[0.250,0.100,1]\r\nBonjour" in label
        assert json.loads(archive.read("mapping.json")) == text
    traversal = tmp_path / "bad.cbz"
    with zipfile.ZipFile(traversal, "w") as archive:
        archive.writestr("../escape.png", png_bytes(Image.new("RGB", (1, 1))))
    with pytest.raises(ValueError, match="unsafeArchive"):
        repo.import_sources([str(traversal)], "Unsafe")

def test_nested_epub_spine_navigation_and_unsafe_links(comic, tmp_path):
    repo, _, images = comic

    def make_book(src):
        target = tmp_path / "nested.epub"
        with zipfile.ZipFile(target, "w") as archive:
            archive.writestr("META-INF/container.xml", '<container><rootfiles><rootfile full-path="OPS/manifest.opf"/></rootfiles></container>')
            archive.writestr("OPS/manifest.opf", '<package><manifest><item id="nav" properties="nav" href="toc.xhtml"/><item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/><item id="end" href="text/end.svg" media-type="image/svg+xml"/></manifest><spine page-progression-direction="ltr"><itemref idref="end"/><itemref idref="cover"/></spine></package>')
            archive.writestr("OPS/toc.xhtml", '<html xmlns:e="http://www.idpf.org/2007/ops"><nav e:type="toc"><a href="text/end.svg">Prologue</a><a href="text/cover.xhtml">Part II</a></nav></html>')
            archive.writestr("OPS/text/end.svg", '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="../assets/one.png"/></svg>')
            archive.writestr("OPS/text/cover.xhtml", f'<html><body><img src="{src}"/></body></html>')
            archive.write(images[0], "OPS/assets/one.png")
            archive.write(images[1], "OPS/assets/two panels.png")
        return target

    result = repo.import_sources([str(make_book("../assets/two%20panels.png"))], "Fixture")
    assert [p["name"] for p in result["pages"]] == ["one.png", "two panels.png"]
    assert result["config"]["readingDirection"] == "ltr"
    assert [c["title"] for c in result["chapters"]] == ["Prologue", "Part II"]
    assert [p["chapterId"] for p in result["pages"]] == [c["id"] for c in result["chapters"]]
    with pytest.raises(ValueError, match="unsafeArchive"):
        repo.import_sources([str(make_book("https://localhost/secret.png"))], "Rejected")
    assert all(book["title"] != "Rejected" for book in repo.list())


def test_real_http_vector_pdf_and_folder_export(tmp_path):
    from types import SimpleNamespace
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from nola_translator_engine.backend.comic import build_comic_router

    # Independent vector-only PDF: a filled red rectangle, no embedded raster image.
    content = b"1 0 0 rg 10 10 20 20 re f"
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
               b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Resources << >> /Contents 4 0 R >>",
               f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream"]
    data = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f"{number} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(data)
    data.extend(b"xref\n0 5\n0000000000 65535 f \n")
    for offset in offsets:
        data.extend(f"{offset:010d} 00000 n \n".encode())
    data.extend(f"trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    document = tmp_path / "drawing.pdf"
    document.write_bytes(data)
    repo = ComicRepository(tmp_path / "shelf")
    app = FastAPI()
    app.include_router(build_comic_router(SimpleNamespace(repository=repo)))
    with TestClient(app) as client:
        response = client.post("/comics/import", json={"paths": [str(document)], "pdfDpi": 72, "title": "Drawing"})
        assert response.status_code == 200, response.text
        book = response.json()
        url = f"/comics/projects/{book['id']}"
        response = client.post(url + "/export", json={"kind": "epub", "layer": "source"})
        assert response.headers["content-type"] == "application/epub+zip"
        folder = tmp_path / "export"
        folder.mkdir()
        for _ in range(2):
            response = client.post(url + "/export-directory", json={"directory": str(folder), "layer": "source"})
            assert response.status_code == 200, response.text
        assert len(list(folder.iterdir())) == 2
        for path in folder.glob("*/0001.png"):
            with Image.open(path) as rendered:
                assert rendered.size == (72, 72)
                assert rendered.getpixel((15, 55)) == (255, 0, 0)
                assert rendered.getpixel((0, 0)) == (255, 255, 255)


def test_large_pdf_page_fits_default_import_and_failed_import_cleans_staging(tmp_path):
    import pypdfium2 as pdf
    from nola_translator_engine.backend.comic_formats import MAX_PIXELS

    document = tmp_path / "large.pdf"
    with pdf.PdfDocument.new() as book:
        book.new_page(1500, 2100).close()
        book.save(document)
    repo = ComicRepository(tmp_path / "shelf")
    with pytest.raises(FileNotFoundError):
        repo.import_sources([str(document), str(tmp_path / "missing.pdf")], "Broken")
    assert repo.list() == []
    assert not list((repo.root / "assets").iterdir())
    assert not list(repo.root.glob(".import-*"))
    page, = repo.import_sources([str(document)], "Large")["pages"]
    assert 2_000_000 < page["width"] * page["height"] <= MAX_PIXELS
    assert repo.asset_path(repo.list()[0]["id"], page["id"], "source").is_file()


def test_epub2_ncx_chapters_include_nested_fragment_targets(comic, tmp_path):
    repo, _, images = comic
    book = tmp_path / "illustrated.epub"
    with zipfile.ZipFile(book, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        archive.writestr("META-INF/container.xml", """<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
          <rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>""")
        archive.writestr("OPS/book.opf", """<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:nola:fixture</dc:identifier>
          <dc:title>Illustrated edition</dc:title><dc:language>en</dc:language></metadata><manifest>
          <item id="navigation" href="index/navigation.ncx" media-type="application/x-dtbncx+xml"/>
          <item id="opening" href="text/opening.xhtml" media-type="application/xhtml+xml"/>
          <item id="end" href="text/ending.xhtml" media-type="application/xhtml+xml"/>
          <item id="a" href="a.png" media-type="image/png"/><item id="b" href="b.png" media-type="image/png"/>
          </manifest><spine toc="navigation"><itemref idref="opening"/><itemref idref="end"/></spine></package>""")
        archive.writestr("OPS/index/navigation.ncx", """<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
          <head><meta name="dtb:uid" content="urn:nola:fixture"/></head><docTitle><text>Illustrated edition</text></docTitle>
          <navMap><navPoint id="chapter" playOrder="1"><navLabel><text>Arrival</text></navLabel><content src="../text/opening.xhtml"/>
          <navPoint id="nested" playOrder="2"><navLabel><text>In the garden</text></navLabel>
          <content src="../text/opening.xhtml#garden"/></navPoint></navPoint>
          <navPoint id="ending" playOrder="3"><navLabel><text>Departure</text></navLabel>
          <content src="../text/ending.xhtml"/></navPoint></navMap></ncx>""")
        for name, content in [("opening", '<p><img src="../a.png" alt="Gate"/></p><div id="garden"><img src="../b.png" alt="Garden"/></div>'),
                              ("ending", '<p><img src="../a.png" alt="Gate"/></p>')]:
            archive.writestr(f"OPS/text/{name}.xhtml", f'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>{name}</title></head><body>{content}</body></html>')
        archive.write(images[0], "OPS/a.png")
        archive.write(images[1], "OPS/b.png")
    result = repo.import_sources([str(book)], "Illustrated edition")
    assert [c["title"] for c in result["chapters"]] == ["Arrival", "In the garden", "Departure"]
    assert [p["name"] for p in result["pages"]] == ["a.png", "b.png", "a.png"]
    assert [p["chapterId"] for p in result["pages"]] == [c["id"] for c in result["chapters"]]
