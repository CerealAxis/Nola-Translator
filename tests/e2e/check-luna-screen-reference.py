"""Compare screen behavior with a pinned LunaTranslator checkout and portable release."""

import argparse
import ast
import base64
import ctypes as ct
import json
import math
import os
import random
import subprocess
import sys
from pathlib import Path
from threading import RLock
from types import SimpleNamespace
from uuid import uuid4

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

from nola_translator_engine.backend.screen_capture import CaptureRequest, ScreenCapture, similarity
from nola_translator_engine.backend.screen_ocr import OcrRequest, ScreenOcr


def bind(dll, name, result, *args):
    fn = getattr(dll, name)
    fn.restype, fn.argtypes = result, args
    return fn


class Luna:
    def __init__(self, package):
        directory = package / "files" / "DLL64"
        self.search = os.add_dll_directory(str(directory))
        self.cv = ct.CDLL(str(directory / "CVUtils.dll"))
        self.native = ct.CDLL(str(directory / "NativeUtils.dll"))
        ptr, integer = ct.c_void_p, ct.c_int
        self.make_image = bind(self.cv, "cvMatFromRGB888", ptr, ptr, integer, integer, integer)
        self.destroy_image = bind(self.cv, "cvMatDestroy", None, ptr)
        self.mssim = bind(self.cv, "cvMatMSSIM", ct.c_double, ptr, ptr)
        self.levenshtein = bind(self.native, "levenshtein_distance", ct.c_size_t,
                               ct.c_size_t, ct.c_wchar_p, ct.c_size_t, ct.c_wchar_p)
        self.package = package

    def image(self, bgr):
        rgb = np.ascontiguousarray(bgr[:, :, ::-1])
        height, width = rgb.shape[:2]
        return self.make_image(rgb.ctypes.data, width, height, rgb.strides[0])

    def compare(self, left, right):
        a, b = self.image(left), self.image(right)
        try:
            return self.mssim(a, b)
        finally:
            self.destroy_image(a)
            self.destroy_image(b)

    def distance(self, left, right):
        return self.levenshtein(len(left), left, len(right), right)

    def read(self, images):
        previous = Path.cwd()
        os.chdir(self.package)
        try:
            return self._read(images)
        finally:
            os.chdir(previous)

    def _read(self, images):
        error_type = ct.CFUNCTYPE(None, ct.c_char_p)
        block_type = ct.CFUNCTYPE(None, *([ct.c_float] * 8), ct.c_char_p)
        ptr = ct.c_void_p
        load = bind(self.cv, "OcrLoadRuntime", ct.c_bool)
        create = bind(self.cv, "OcrInit", ptr, ct.c_wchar_p, ct.c_wchar_p, ct.c_wchar_p,
                      ct.c_int32, ct.c_bool, ct.c_uint64, ct.c_char_p, error_type)
        detect = bind(self.cv, "OcrDetect", None, ptr, ptr, ct.c_int32, block_type, error_type)
        destroy = bind(self.cv, "OcrDestroy", None, ptr)
        weights = next((self.package / "files" / "ocrmodel").glob("*/det.onnx")).parent
        errors = []
        error = error_type(errors.append)
        assert load(), "Luna ONNX runtime failed to load"
        model = create(*(str(weights / name) for name in ("det.onnx", "rec.onnx", "dict.txt")),
                       2, False, 0, b"", error)
        assert model and not errors, errors
        try:
            results = {}
            for name, bgr in images.items():
                blocks = []
                def add(*args):
                    quad = [[args[i], args[i + 1]] for i in range(0, 8, 2)]
                    blocks.append({"text": args[8].decode("utf-8"), "quad": quad})
                mat = self.image(bgr)
                try:
                    detect(model, mat, 2, block_type(add), error)
                finally:
                    self.destroy_image(mat)
                assert not errors, errors
                results[name] = blocks
            return results
        finally:
            destroy(model)


def source_geometry(source, cases):
    path = source / "src/LunaTranslator/ocrengines/baseocrclass.py"
    selected = {"OCRBlock", "_OCRBlockS", "OCRResult", "_sort_text_lines", "_joinlines"}
    tree = ast.parse(path.read_text(encoding="utf-8"))
    reference = {"math": math, "globalconfig": {"verticalocr": 0}}
    exec(compile(ast.Module([node for node in tree.body if getattr(node, "name", None) in selected],
                            type_ignores=[]), str(path), "exec"), reference)
    results = []
    for case in cases:
        reference["globalconfig"]["verticalocr"] = int(case["vertical"])
        boxes = [[coordinate for point in block["quad"] for coordinate in point] for block in case["blocks"]]
        result = reference["OCRResult"]([block["text"] for block in case["blocks"]], boxes)
        try:
            result.parse(case["space"], 1)
        except IndexError:
            results.append(None)
            continue
        results.append([{"text": block.text, "quad": list(zip(block.box[::2], block.box[1::2]))}
                        for block in result.blocks])
    return results


def nola_geometry(cases, pairs):
    script = """
const fs = require('node:fs')
const bundle = require('esbuild').buildSync({ entryPoints: ['src/main/screen-pipeline.ts'],
  bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text
const port = { exports: {} }
new Function('module', 'exports', bundle)(port, port.exports)
const { mergeScreenLines, editDistanceBelow } = port.exports
const { cases, pairs } = JSON.parse(fs.readFileSync(0, 'utf8'))
process.stdout.write(JSON.stringify({ geometry: cases.map(c => mergeScreenLines(c.blocks, c.vertical, c.space)),
  distances: pairs.map(([left, right]) => editDistanceBelow(left, right, 3)) }))
"""
    process = subprocess.run(["node", "-e", script], cwd=ROOT, encoding="utf-8",
                             input=json.dumps({"cases": cases, "pairs": pairs}), capture_output=True, check=True)
    return json.loads(process.stdout)


def rectangular(text, x, y, w, h):
    return {"text": text, "quad": [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]}


def processing_parity(luna, source):
    rng = random.Random(22)
    cases = [
        {"blocks": [rectangular("short", 0, 0, 35, 20), rectangular("continuation", 0, 24, 100, 20),
                    rectangular("menu", 140, 0, 55, 20)], "vertical": False, "space": " "},
        {"blocks": [rectangular("第一列", 46, 0, 18, 80), rectangular("第二列", 22, 6, 18, 75)],
         "vertical": True, "space": ""},
        {"blocks": [{"text": "left", "quad": [[0, 0], [20, 10], [15, 20], [-5, 10]]},
                    {"text": "right", "quad": [[19, 10], [39, 20], [34, 30], [14, 20]]}],
         "vertical": False, "space": " "},
    ]
    for _ in range(48):
        cases.append({"blocks": [rectangular(str(i), rng.randrange(70), rng.randrange(60),
                                              rng.randrange(8, 30), rng.randrange(8, 25))
                                 for i in range(rng.randrange(1, 10))],
                      "vertical": bool(rng.randrange(2)), "space": " "})
    pairs = [("life 100", "life 101"), ("", "a"), ("AB", "AAXY"), ("same", "same")]
    for _ in range(128):
        left = "".join(rng.choices("ab日字。", k=rng.randrange(16)))
        right = left
        for _ in range(rng.randrange(5)):
            index = rng.randrange(len(right) + 1)
            right = right[:index] + rng.choice(("", "字", "a", "ba")) + right[index + 1:]
        pairs.append((left, right))
    reference = source_geometry(source, cases)
    actual = nola_geometry(cases, pairs)
    assert actual["distances"] == [luna.distance(*pair) < 3 for pair in pairs]
    matches, differences, reference_errors = 0, [], []
    for index, (got, expected) in enumerate(zip(actual["geometry"], reference, strict=True)):
        if expected is None:
            reference_errors.append(index)
            continue
        same_text = [block["text"] for block in got] == [block["text"] for block in expected]
        if same_text and all(np.allclose(a["quad"], b["quad"], atol=1e-9) for a, b in zip(got, expected, strict=True)):
            matches += 1
        else:
            differences.append(index)
    assert all(index >= 3 for index in differences + reference_errors)
    return {"edit_distance_cases": len(pairs), "block_geometry_cases": len(cases),
            "block_geometry_matches": matches, "upstream_merge_index_errors": reference_errors,
            "block_geometry_differences": differences}


def image_fixtures():
    images = {}
    for name, background, foreground, rows in [
        ("dialogue", (238, 244, 255), (24, 34, 58), ["Screen translation 123", "Continue to the next page"]),
        ("dark game menu", (33, 21, 36), (255, 244, 226), ["Inventory", "Continue", "Options", "75 HP"]),
        ("small counter", (192, 223, 241), (23, 17, 49), ["100 HP", "101 coins"]),
    ]:
        image = np.full((320, 680, 3), background, np.uint8)
        for i, row in enumerate(rows):
            scale = 0.65 if name == "small counter" else 1.2
            cv2.putText(image, row, (42 + i * 3, 92 + i * 62), cv2.FONT_HERSHEY_SIMPLEX,
                        scale, foreground, 2, cv2.LINE_AA)
        images[name] = image
    angle = cv2.getRotationMatrix2D((340, 160), 11, 1)
    images["rotated dialogue"] = cv2.warpAffine(images["dialogue"], angle, (680, 320), borderMode=cv2.BORDER_REPLICATE)
    images["blank"] = np.full((320, 680, 3), 225, np.uint8)
    return images


def image_parity(luna, images):
    source = images["dialogue"]
    changed = source.copy()
    changed[70:125, 42:320, 0] = 100
    values = list(images.values()) + [changed, 255 - source]
    comparisons = [(left, right) for left in values for right in values]
    errors = [abs(similarity(left, right) - luna.compare(left, right)) for left, right in comparisons]
    assert max(errors) < 1e-5, max(errors)
    return {"mssim_pairs": len(errors), "mssim_max_absolute_difference": max(errors)}


def analysis_parity(luna, source, images):
    path = source / "src/LunaTranslator/textio/textsource/ocrtext.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    manager = next(node for node in tree.body if getattr(node, "name", None) == "rangemanger")
    scan = next(node for node in manager.body if getattr(node, "name", None) == "getresauto")
    saved = SimpleNamespace(rect=(0, 0, 680, 320))
    calls = []
    step = 0

    class Matrix:
        def __init__(self, image):
            self.image = image

        def MSSIM(self, other):
            return luna.compare(self.image, other.image) if other is not None else 0

    def recognize(_):
        calls.append(step)
        return SimpleNamespace(error=False, textonly=f"frame number {step:04}")

    def commit(result, _):
        reference.range_ui._ocr_overlay_original = result.textonly
        reference.lastocrtime, reference.savelasttext = step, result.textonly
        reference._last_capture_rect = saved.rect
        return result

    thresholds = SimpleNamespace(emit=lambda _: None)
    environment = {"cvMat": Matrix, "ocr_run": recognize, "time": SimpleNamespace(time=lambda: step),
                   "NativeUtils": SimpleNamespace(distance=lambda a, b: luna.distance(a or "", b or "")),
                   "gobject": SimpleNamespace(base=SimpleNamespace(thresholdsett1=thresholds, thresholdsett2=thresholds)),
                   "globalconfig": {"ocr_auto_method_v2": "analysis", "ocr_translation_overlay": True}}
    exec(compile(ast.Module([scan], type_ignores=[]), str(path), "exec"), environment)
    frame = None
    reference = SimpleNamespace(range_ui=SimpleNamespace(ocr_source_lock=RLock(), capture_snapshot=lambda: saved,
                                _ocr_overlay_original=None), _capture_region=lambda: (saved, frame),
                                _commit_ocr_result=commit, _last_capture_rect=None, savelastimg=None,
                                savelastrecimg=None, savelasttext=None, lastocrtime=0)
    capture = ScreenCapture(SimpleNamespace(dpi_context=lambda _: None, grab=lambda *_: frame))
    request = CaptureRequest(session_id=uuid4(), epoch=0, mode="analysis", owner_pid=1,
                             regions=[dict(id=uuid4(), x=0, y=0, width=680, height=320)])
    nola = []
    order = ["blank", "blank", "dialogue", "dialogue", "dialogue", "rotated dialogue",
             "dark game menu", "dark game menu", "small counter", "small counter", "blank", "blank"]
    for step, sample in enumerate(order):
        frame = images[sample]
        environment["getresauto"](reference)
        if capture.sample(request, step)["frames"]:
            nola.append(step)
    assert calls == nola, (calls, nola)
    return {"analysis_sequence_frames": len(order), "analysis_ocr_frame_indexes": nola}


def ocr_comparison(luna, images, model_root):
    expected = luna.read(images)
    nola = ScreenOcr(model_root)
    report = {}
    for name, image in images.items():
        ok, png = cv2.imencode(".png", image)
        assert ok
        request = OcrRequest(image="data:image/png;base64," + base64.b64encode(png).decode(), language="en")
        actual = nola._infer(request)["blocks"]
        reference_blocks = {block["text"]: block["quad"] for block in expected[name]}
        overlaps = {}
        for block in actual:
            text = block["text"]
            if text not in reference_blocks:
                continue
            a, b = np.float32(reference_blocks[text]), np.float32(block["quad"])
            overlap, _ = cv2.intersectConvexConvex(a, b)
            union = cv2.contourArea(a) + cv2.contourArea(b) - overlap
            if union > 0:
                overlaps[text] = overlap / union
        report[name] = {"luna": expected[name], "nola": actual,
                        "same_text": sorted(reference_blocks) == sorted(block["text"] for block in actual),
                        "matching_text_quad_iou": overlaps}
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--nola-models", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    luna = Luna(args.package.resolve())
    images = image_fixtures()
    report = (processing_parity(luna, args.source.resolve()) | image_parity(luna, images)
              | analysis_parity(luna, args.source.resolve(), images))
    if args.nola_models:
        report["native_ocr"] = ocr_comparison(luna, images, args.nola_models.resolve())
    output = json.dumps(report, ensure_ascii=True, indent=2) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
