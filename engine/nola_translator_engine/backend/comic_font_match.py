"""Optional pretrained font classification with each model's documented input.

Storia ONNX handles Latin crops (RGB, padded 320px, ImageNet normalization).
YuzuMarker ONNX handles CJK paragraphs (RGB, bilinear 512px, values in [0,1]).
Their MIT-licensed weights provide classification; installed-family selection
uses real font cmap/PANOSE metadata, without invented glyph matching.
Yuzu source contract: JeffersonQin/YuzuMarker.FontDetection at 0a94e165.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

import numpy as np


def classifier_source_crop(image, quad, lines=None, cjk=False):
    """Reuse the OCR provider's rectification for a detector-confirmed Latin text line."""
    if not cjk and lines:
        import cv2
        from .comic_ocr_providers import _crop_quad
        selected=max(lines,key=lambda value:abs(cv2.contourArea(np.asarray(value,np.float32))))
        return _crop_quad(image,selected)
    points=np.asarray(quad,float)
    left,top=np.floor(points.min(axis=0)).astype(int)
    right,bottom=np.ceil(points.max(axis=0)).astype(int)
    return image[max(0,top):min(image.shape[0],bottom),max(0,left):min(image.shape[1],right)]


def font_classifier_input(image):
    import cv2
    pixels = np.asarray(image)
    if pixels.ndim != 3 or pixels.shape[2] != 3 or not pixels.size:
        raise ValueError('invalidImage')
    rgb = cv2.cvtColor(pixels[:1024, :1024], cv2.COLOR_BGR2RGB)
    height, width = rgb.shape[:2]
    scale = 320 / max(height, width)
    resized = cv2.resize(rgb, (max(1, int(width * scale)), max(1, int(height * scale))))
    canvas = np.full((320, 320, 3), 255, np.uint8)
    top, left = (320-resized.shape[0])//2, (320-resized.shape[1])//2
    canvas[top:top+resized.shape[0], left:left+resized.shape[1]] = resized
    values = canvas.astype(np.float32) / 255
    values = (values - np.array([.485, .456, .406], np.float32)) / np.array([.229, .224, .225], np.float32)
    return np.ascontiguousarray(values.transpose(2, 0, 1)[None])


def font_candidates(logits, classnames, count=5):
    values = np.asarray(logits, dtype=np.float64).reshape(-1)
    if len(values) != len(classnames) or not len(values) or not np.isfinite(values).all():
        raise ValueError('modelCorrupt')
    probabilities = np.exp(values-values.max())
    probabilities /= probabilities.sum()
    return [{'family': classnames[int(index)], 'confidence': float(probabilities[index])}
            for index in np.argsort(-probabilities, kind='stable')[:count]]


def installed_candidate(candidate, fonts, text):
    normalize = lambda value: ''.join(character.casefold() for character in value if character.isalnum())
    import re
    # Google Fonts class labels are font filenames, not operating-system families.
    label = re.sub(r'\[[^\]]+\]$', '', candidate['family'])
    label = re.sub(r' \d+\.\d+$', '', label)
    label = re.sub(r'-(?:Thin|ExtraLight|Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black)?(?:Italic)?$', '', label)
    matches = [item for item in fonts.list() if normalize(item['family']) == normalize(label)]
    for item in matches:
        path = fonts.resolve(item['family'], item['weight'], item['italic'])
        try:
            from fontTools.ttLib import TTFont
        except ImportError:
            return dict(candidate)
        try:
            with TTFont(str(path), fontNumber=0, lazy=True) as font:
                characters = font.getBestCmap() or {}
                if all(ord(character) in characters for character in text if not character.isspace()):
                    return {**candidate, 'matchedFamily': item['family']}
        except (OSError, ValueError):
            continue
    return dict(candidate)


def category_font_family(fonts, text, serif, language='zh'):
    """Use Yuzu's existing serif class and font PANOSE/cmap metadata, never glyph guessing."""
    from fontTools.ttLib import TTFont, TTLibError
    locale='HK' if language=='zh-HK' else 'TC' if language=='zh-TW' else {'zh':'SC','ja':'JP','ko':'KR'}.get(language.split('-')[0],'SC')
    expected='Serif' if serif else 'Sans'
    preferred=[f'Noto {expected} {locale}',f'Noto {expected} CJK {locale}']
    order={family.casefold():index for index,family in enumerate(preferred)}
    catalog=sorted(fonts.list(),key=lambda item:(order.get(item['family'].casefold(),len(order)),item['family']))
    for item in catalog:
        try:
            with TTFont(str(fonts.resolve(item['family'],item['weight'],item['italic'])),fontNumber=0,lazy=True) as font:
                if 'OS/2' not in font:
                    continue
                panose=font['OS/2'].panose
                category=True if 2<=panose.bSerifStyle<=10 else False if 11<=panose.bSerifStyle<=15 else None
                if panose.bFamilyType!=2 or category is not serif:
                    continue
                characters=font.getBestCmap() or {}
                if all(ord(char) in characters for char in text if not char.isspace()):
                    return item['family']
        except (OSError,ValueError,TTLibError):
            continue
    return None


def match_installed_candidates(candidates, fonts, text, serif=None, language="zh"):
    if not candidates:
        raise ValueError('modelCorrupt')
    result = {**candidates[0], 'candidates': candidates}
    if type(serif) is bool:
        result['serif']=serif
    for rank, candidate in enumerate(candidates, 1):
        installed = installed_candidate(candidate, fonts, text)
        if installed.get('matchedFamily'):
            return {**result, 'matchedFamily': installed['matchedFamily'],
                    'matchedConfidence': candidate['confidence'], 'rank': rank, 'substitution':'exact'}
    if type(serif) is bool:
        family = category_font_family(fonts, text, serif, language)
        if family:
            return {**result, 'serif':serif, 'matchedFamily':family, 'substitution':'category'}
    return result



def read_font_classnames(path):
    # This pinned configuration contains only an unquoted scalar list for labels.
    # Do not deserialize arbitrary YAML objects supplied by project files.
    import json
    labels = []
    inside = False
    size = classes = None
    for raw in Path(path).read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if line.startswith('size:'):
            size = int(line.split(':', 1)[1])
        elif line.startswith('classes:'):
            classes = int(line.split(':', 1)[1])
        elif line == 'classnames:':
            inside = True
        elif inside and line.startswith('- '):
            label = line[2:].strip()
            if label.startswith('"'):
                label = json.loads(label)
            elif label.startswith("'") and label.endswith("'"):
                label = label[1:-1].replace("''", "'")
            if not label or len(label) > 300:
                raise ValueError('modelCorrupt')
            labels.append(label)
        elif inside and line and not raw[:1].isspace():
            inside = False
    if size != 320 or classes != len(labels) or classes != 3473:
        raise ValueError('modelCorrupt')
    return labels


from .screen_ocr import ScreenOcr


class ComicFontMatcher(ScreenOcr):
    model_filename = 'model.onnx'
    output_dimensions = 3473

    def _load_config(self, directory):
        return read_font_classnames(directory / 'model_config.yaml')

    def _input(self, image):
        return font_classifier_input(image)

    def __init__(self, model_root):
        from ..models.ocr_catalog import COMIC_FONT_CLASSIFIER
        super().__init__(model_root, spec=COMIC_FONT_CLASSIFIER)
        self.classnames = None

    async def load(self):
        if self._closed or self._lock.locked() or self._loaded:
            raise ValueError('resourceBusy')
        async with self._lock:
            def load_weights():
                directory = self._verify()
                self.classnames = self._load_config(directory)
                self._session(directory / self.model_filename)
            task = asyncio.create_task(asyncio.to_thread(load_weights))
            try:
                await asyncio.shield(task)
                self._loaded = True
            except BaseException:
                try:
                    await task
                finally:
                    self.classnames = None
                    self._sessions.clear()
                    self._loaded = False
                raise
        return self.status()

    def _classify(self, image):
        session = self._session(self.root / self.spec.directory / self.model_filename)
        output = np.asarray(session.run(None, {session.get_inputs()[0].name: self._input(image)})[0])
        if output.shape != (1, self.output_dimensions):
            raise ValueError('modelCorrupt')
        return font_candidates(output[0,:len(self.classnames)], self.classnames)

    async def classify(self, image):
        return await self._run_inference('auto', 1, False, self._classify, image)

    async def release(self):
        result = await super().release()
        self.classnames = None
        return result


def comic_font_is_cjk(text):
    return any(0x3040 <= ord(char) <= 0x30ff or 0x3400 <= ord(char) <= 0x9fff
               or 0xac00 <= ord(char) <= 0xd7af or 0xff66 <= ord(char) <= 0xff9f
               or 0x20000 <= ord(char) <= 0x3134f for char in text)


def font_weight_from_label(label):
    """Map explicit font style labels to the nearest CSS weight, never inspect glyphs."""
    import re
    match=re.search(r'(?:^|[-_\s])W([1-9])(?:$|[-_\s])',label,re.I)
    if match:
        return int(match.group(1))*100
    weights={'thin':100,'extralight':200,'ultralight':200,'light':300,'regular':400,
             'normal':400,'medium':500,'semibold':600,'demibold':600,'bold':700,
             'extrabold':800,'ultrabold':800,'black':900,'heavy':900}
    matches=re.findall(r'(?:^|[-_\s])(ExtraLight|UltraLight|ExtraBold|UltraBold|SemiBold|DemiBold|Thin|Light|Regular|Normal|Medium|Bold|Black|Heavy)(?=$|[-_\s])',label,re.I)
    return weights[matches[-1].lower()] if matches else None


def yuzu_classifier_input(image):
    # YuzuMarker demo.py @ 0a94e165: PIL RGB Resize(512,512), ToTensor.
    # MIT Copyright (c) 2021 gyro永不抽风. No training or pickle code is imported.
    from PIL import Image
    pixels = np.asarray(image)
    if pixels.ndim != 3 or pixels.shape[2] != 3 or not pixels.size:
        raise ValueError('invalidImage')
    resized = Image.fromarray(pixels[:,:,::-1]).resize((512,512),Image.Resampling.BILINEAR)
    return np.ascontiguousarray(np.asarray(resized,dtype=np.float32).transpose(2,0,1)[None]/255)


class YuzuComicFontMatcher(ComicFontMatcher):
    model_filename = 'font-detector.onnx'
    output_dimensions = 6162

    def __init__(self, model_root):
        from ..models.ocr_catalog import COMIC_YUZU_FONT
        ScreenOcr.__init__(self, model_root, spec=COMIC_YUZU_FONT)
        self.classnames = None

    def _load_config(self, directory):
        import json
        labels = json.loads((directory/'font-labels-ex.json').read_text(encoding='utf-8'))
        if not isinstance(labels,list) or len(labels)!=6150:
            raise ValueError('modelCorrupt')
        self.labels=labels
        names=[]
        for entry in labels:
            if not isinstance(entry,dict) or not isinstance(entry.get('path'),str):
                raise ValueError('modelCorrupt')
            name=Path(entry['path'].replace('\\','/')).stem
            if not name or len(name)>200:
                raise ValueError('modelCorrupt')
            names.append(name)
        return names

    def _input(self, image):
        return yuzu_classifier_input(image)


    def _describe(self, image):
        session=self._session(self.root/self.spec.directory/self.model_filename)
        output=np.asarray(session.run(None,{session.get_inputs()[0].name:self._input(image)})[0])
        if output.shape!=(1,6162) or not np.isfinite(output).all():
            raise ValueError('modelCorrupt')
        values=output[0]
        candidates=font_candidates(values[:6150],self.classnames)
        label=self.labels[int(np.argmax(values[:6150]))]
        regression=values[6152:]
        width=image.shape[1]
        color=lambda values: '#'+''.join(f'{max(0,min(255,round(float(value)*255))):02x}' for value in values)
        size=max(6,min(2000,round(float(regression[3])*width)))
        weight=font_weight_from_label(candidates[0]['family'])
        return {'candidates':candidates,'serif':label.get('serif'),
                'sourceStyle':{'fontSize':size, **({'fontWeight':weight} if weight is not None else {})},
                'regression':{'color':color(regression[:3]),
                    'strokeWidth':max(0,min(100,float(regression[4])*width)),
                    'strokeColor':color(regression[5:8]),
                    'lineSpacing':max(.5,min(3,1+float(regression[8])*width/size))}}

    async def describe(self, image):
        return await self._run_inference('auto',1,False,self._describe,image)
