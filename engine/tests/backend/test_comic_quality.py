from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from contextlib import asynccontextmanager
from uuid import uuid4

import numpy as np
from PIL import Image, ImageDraw
import pytest

from nola_translator_engine.backend.comics import vision
from nola_translator_engine.backend.comics.layout import Fonts, horizontal_lines, region_layout, render_page, vertical_units
from nola_translator_engine.backend.comics.schemas import Config, Region

FONT = Path(__file__).resolve().parents[3] / 'src/renderer/assets/fonts/NotoSansCJK-SC-VF.otf'


def region(x=70, y=60, width=45, height=120):
  return Region(id=uuid4(), x=x, y=y, width=width, height=height,
    sourceText='こんにちは', targetText='你好，世界！', sourceFontSize=24,
    style=dict(fontSize=23, direction='vertical-rl', autoFontSize=True,
      autoFont=True, autoLineSpacing=True, autoAlign=True, autoBlockAlign=True)).model_dump(exclude_none=True, mode='json')


def test_new_pipeline_defaults_are_automatic():
  config = Config()
  assert config.detector == config.repairMethod == 'auto'
  assert config.ocr == 'auto'
  assert config.renderSettings.autoSize and config.renderSettings.autoFont
  assert config.renderSettings.autoAlign and config.renderSettings.autoBlockAlign and config.renderSettings.autoLineSpacing


def test_automatic_detector_uses_installed_comic_model_without_downloading():
  owner = SimpleNamespace(models=SimpleNamespace(is_installed=lambda spec: spec.model_id == 'comic-rtdetr-onnx'))
  assert vision.automatic_detector(owner, 'ja') == 'comic-rtdetr-onnx'


def test_shared_balloon_background_never_merges_translation_units():
  image = Image.new('RGB', (320, 300), '#555555')
  draw = ImageDraw.Draw(image)
  draw.ellipse((45, 25, 275, 275), fill='white', outline='black', width=3)
  first, second = region(100, 85, 25, 100), region(155, 85, 25, 100)
  first['sourceLines'] = [[[100,85],[125,85],[125,185],[100,185]]]
  original = deepcopy([first,second])
  result = vision.balloon_geometry(image, [first, second])
  assert len(result) == 2
  assert result[0]['sourceLines'] == original[0]['sourceLines']
  for item,before in zip(result,original):
    assert item['sourceQuad'] == vision.quad(before)
    assert item['width'] > 100 and item['height'] > 100
    assert item['x'] > 45 and item['y'] > 25
  manual = region(100, 85, 25, 100) | {'manuallyEdited': True}
  assert vision.balloon_geometry(image, [manual]) == [manual]


def test_open_balloon_does_not_move_text_into_a_distant_white_area():
  image = Image.new('RGB', (300, 300), '#555555')
  draw = ImageDraw.Draw(image)
  draw.rectangle((40, 20, 95, 170), fill='white')
  draw.rectangle((40, 160, 250, 205), fill='white')
  item = region(50, 30, 30, 115)
  result = vision.balloon_geometry(image, [item])[0]
  assert result['y'] < 80
  assert result['height'] > 80


def test_letter_mask_preserves_the_balloon_border_and_empty_background():
  image = Image.new('RGB', (250, 250), 'white')
  draw = ImageDraw.Draw(image)
  draw.ellipse((15, 15, 235, 235), outline='black', width=4)
  draw.text((95, 70), '日本語', font=Fonts(FONT).load(None, 28), fill='black')
  item = region(85, 60, 115, 65)
  mask, _ = vision.mask_for(image, [item], [])
  assert mask.sum() > 0
  assert mask[15, 125] == 0 and mask[200, 125] == 0
  assert np.count_nonzero(mask) < item['width'] * item['height'] * .6


def test_gray_screentone_lines_are_not_mistaken_for_black_text():
  image=Image.new('RGB',(220,220),'white')
  draw=ImageDraw.Draw(image)
  for x in range(0,220,8):
    draw.line((x,0,x,220),fill='#bbbbbb',width=1)
  draw.text((70,80),'文字',font=Fonts(FONT).load(None,32),fill='black')
  item=region(65,75,80,50)
  mask,_=vision.mask_for(image,[item],[])
  assert mask[30,80]==0
  assert np.count_nonzero(mask)>0
  assert vision.smooth_background(np.asarray(image),mask) is None


@pytest.mark.asyncio
async def test_auto_flat_background_is_clean_and_unmasked_pixels_are_identical():
  image = Image.new('RGB', (220, 220), 'white')
  draw = ImageDraw.Draw(image)
  draw.ellipse((10, 10, 210, 210), outline='black', width=4)
  draw.text((70, 80), '文字', font=Fonts(FONT).load(None, 32), fill='black')
  item = region(65, 75, 80, 50)
  mask, _ = vision.mask_for(image, [item], [])
  cleaned = np.asarray(await vision.repair(None, image, image, [item], [], Config().model_dump()))
  assert np.array_equal(cleaned[mask == 0], np.asarray(image)[mask == 0])
  assert cleaned[mask > 0].min() == 255
  assert cleaned[10, 110].max() == 0


@pytest.mark.asyncio
async def test_neural_repair_uses_native_bounded_tiles_and_preserves_the_rest(monkeypatch):
  rng = np.random.default_rng(42)
  image = Image.fromarray(rng.integers(80, 230, (3600, 3600, 3), dtype=np.uint8))
  strokes = [dict(id=str(uuid4()), mode='erase', size=25, points=[[1900, 2000], [2150, 2250]])]
  calls = []
  class Worker:
    _loaded = True
    import asyncio
    lease = asyncio.Lock()
    async def repair(self, crop, mask):
      calls.append(crop.shape)
      assert crop.shape[0] <= 512 and crop.shape[1] <= 512
      result = crop.copy()
      result[mask > 0] = 20
      return result
  worker = Worker()
  owner = SimpleNamespace(variant=lambda name: worker)
  monkeypatch.setattr(vision, 'inpaint_model', lambda owner: 'installed-only')
  cleaned = np.asarray(await vision.repair(owner, image, image, [], strokes, Config().model_dump()))
  mask, _ = vision.mask_for(image, [], strokes)
  assert calls
  assert np.array_equal(cleaned[mask == 0], np.asarray(image)[mask == 0])
  assert (cleaned[mask > 0] == 20).all()


def test_auto_typography_uses_source_size_balanced_columns_and_fixed_manual_values():
  item = region(width=110, height=160)
  item['targetText'] = '我们一起到医院去吧。'
  layout = region_layout(item, Fonts(FONT))
  assert 6 <= layout['fontSize'] <= 27
  assert not layout['overflow']
  assert max(map(len, layout['lines'])) - min(map(len, layout['lines'])) <= 1
  assert layout['lineSpacing'] == pytest.approx(1.15)
  item['style'].update(autoFontSize=False, autoLineSpacing=False, fontSize=18, lineSpacing=1.8)
  manual = region_layout(item, Fonts(FONT))
  assert manual['fontSize'] == 18 and manual['lineSpacing'] == pytest.approx(1.8)


def test_variable_font_is_not_rendered_at_the_default_thin_weight():
  font = Fonts(FONT).load('Noto Sans SC', 40)
  assert font.getbbox('漫画')[2] > 0
  image = Image.new('L', (100, 60))
  ImageDraw.Draw(image).text((0, 0), '漫画', font=font, fill=255)
  assert np.count_nonzero(np.asarray(image) > 200) > 500


def test_word_wrap_keeps_words_and_vertical_short_numbers_together():
  font = Fonts(FONT).load(None, 20)
  lines = horizontal_lines('Please wait for the doctor.', font, 130, 0)
  assert ' '.join(line.strip() for line in lines) == 'Please wait for the doctor.'
  assert vertical_units('已经24小时！？') == ['已', '经', '24', '小', '时', '！？']


def test_invalid_source_quadrilateral_is_rejected():
  item = region()
  item['sourceLines'] = [[[1, 2], [3, 4]]]
  with pytest.raises(ValueError):
    Region.model_validate(item)


def test_perspective_text_stays_inside_the_quad_and_rejects_crossed_corners():
  import cv2
  item = region(30, 20, 120, 180)
  item['textQuad'] = [[45,25],[150,60],[125,220],[25,180]]
  base = Image.new('RGB', (240, 260), 'white')
  result = np.asarray(render_page(base, [item], Fonts(FONT)))
  mask = np.zeros((260,240), np.uint8)
  cv2.fillConvexPoly(mask, np.asarray(item['textQuad'], np.int32), 255)
  mask = cv2.dilate(mask, np.ones((5,5), np.uint8))
  assert (result[mask == 0] == 255).all()
  assert np.count_nonzero(result < 100) > 100
  item['textQuad'] = [[20,20],[150,150],[20,150],[150,20]]
  with pytest.raises(ValueError, match='invalidTextQuad'):
    Region.model_validate(item)


def test_smooth_background_reconstructs_a_gradient_instead_of_a_flat_patch():
  yy, xx = np.mgrid[:150,:180]
  crop = np.stack([180+xx//8, 150+yy//8, 100+xx//10], axis=-1).astype(np.uint8)
  mask = np.zeros((150,180), np.uint8)
  mask[30:130,70:100] = 255
  expected = crop[mask > 0].copy()
  damaged = crop.copy()
  damaged[mask > 0] = 0
  fitted = vision.smooth_background(damaged, mask)
  assert fitted is not None
  assert np.abs(fitted.astype(int)-expected.astype(int)).max() <= 2


@pytest.mark.asyncio
@pytest.mark.parametrize('detector', ['auto','rtdetr'])
async def test_auto_detector_rejects_artwork_without_supported_text_lines(monkeypatch,detector):
  real = [[150,70],[185,70],[185,150],[150,150]]
  windows = [[10,10],[100,10],[100,50],[10,50]]
  class Detector:
    def __init__(self, kind): self.kind = kind
    async def detect_comic(self, image): return [windows,real] if self.kind == 'comic-rtdetr-onnx' else [real]
  @asynccontextmanager
  async def resource(owner, kind):
    yield Detector(kind)
  monkeypatch.setattr(vision, 'resource', resource)
  monkeypatch.setattr(vision, 'ppocr_model', lambda *args, **kwargs: 'ppocr')
  owner = SimpleNamespace(models=SimpleNamespace(is_installed=lambda spec: spec.model_id == 'comic-rtdetr-onnx'))
  result = await vision.detect(owner, Image.new('RGB',(220,220),'white'), Config(detector=detector).model_dump(), [])
  assert len(result) == 1
  assert result[0]['x'] == 150


@pytest.mark.asyncio
async def test_perspective_lettering_keeps_the_original_ocr_crop(monkeypatch):
  source = [[65,30],[95,30],[95,200],[65,200]]
  destination = [[72,35],[87,40],[95,195],[60,190]]
  class Detector:
    async def detect_comic(self, image): return [source]
    async def detect_comic_polygons(self, image): return [destination]
  @asynccontextmanager
  async def resource(owner, kind):
    yield Detector()
  monkeypatch.setattr(vision, 'resource', resource)
  monkeypatch.setattr(vision, 'ppocr_model', lambda *args, **kwargs: 'pp-ocrv5-ch')
  result = await vision.detect(None, Image.new('RGB',(220,240),'#777777'), Config(detector='ppocr').model_dump(), [])
  assert len(result) == 1
  assert result[0]['sourceQuad'] == source
  assert result[0]['sourceLines'] == [source]
  assert result[0]['textQuad'] == destination


@pytest.mark.asyncio
async def test_slanted_text_is_rectified_before_recognition(monkeypatch):
  captured = []
  class Recognizer:
    async def recognize_comic_box(self, image, quad, language, vertical):
      captured.append((image.shape, np.asarray(quad)))
      return [('手術室', .99)]
  @asynccontextmanager
  async def resource(owner, kind):
    yield Recognizer()
  monkeypatch.setattr(vision, 'resource', resource)
  item = region(10,20,150,150)
  item['sourceQuad'] = [[20,30],[160,90],[130,160],[0,90]]
  item['style']['angle'] = 25
  await vision.recognize(None, Image.new('RGB',(200,200),'white'), Config(ocr='manga-ocr').model_dump(), [item])
  assert item['sourceText'] == '手術室'
  assert len(captured) == 1
  assert captured[0][1][0].tolist() == [0,0]
  assert captured[0][0][:2] != (200,200)


def test_vertical_list_keeps_separate_numbers_available_for_pretranslation_filtering():
  item = region(10,10,200,200)
  item['sourceLines'] = []
  for x in (20,60,100,140):
    item['sourceLines'].extend([
      [[x,20],[x+12,20],[x+12,35],[x,35]],
      [[x,50],[x+12,50],[x+12,150],[x,150]],
    ])
  result = vision.paragraph_groups(item['sourceLines'])
  assert len(result) == 8
  assert all(len(part) == 1 for part in result)
  assert sorted(index for group in result for index in group)==list(range(8))


@pytest.mark.asyncio
async def test_auto_ocr_selects_scene_recognition_and_filters_unreliable_fragments(monkeypatch):
  used = []
  class Recognizer:
    async def recognize_comic_box(self, *args): return [('noise', .2), ('手術室', .8)]
  @asynccontextmanager
  async def resource(owner, model):
    used.append(model)
    yield Recognizer()
  monkeypatch.setattr(vision,'resource',resource)
  monkeypatch.setattr(vision,'ppocr_model',lambda *args,**kwargs:'installed-scene-ocr')
  item = region()
  item['style']['direction'] = 'horizontal'
  owner = SimpleNamespace(models=SimpleNamespace(is_installed=lambda spec: True))
  await vision.recognize(owner,Image.new('RGB',(250,250),'white'),Config().model_dump(),[item])
  assert used == ['installed-scene-ocr']
  assert item['sourceText'] == '手術室' and item['confidence'] == .8


@pytest.mark.asyncio
@pytest.mark.parametrize('manga,scene,confidence,ignored', [
  ('イー','-',.63,True), ('ええ','ええ',.85,False), ('1','',0,True),
])
async def test_ambiguous_graphic_marks_and_numbers_are_preserved(monkeypatch,manga,scene,confidence,ignored):
  class Recognizer:
    def __init__(self,model): self.model=model
    async def recognize_comic_box(self,*args): return [(manga,1)] if self.model=='manga-ocr-onnx' else [(scene,confidence)]
  @asynccontextmanager
  async def resource(owner,model):
    yield Recognizer(model)
  monkeypatch.setattr(vision,'resource',resource)
  monkeypatch.setattr(vision,'ppocr_model',lambda *args,**kwargs:'scene')
  owner=SimpleNamespace(models=SimpleNamespace(is_installed=lambda spec:True))
  item=region()
  await vision.recognize(owner,Image.new('RGB',(250,250),'white'),Config().model_dump(),[item])
  assert item['ignored'] is ignored
  assert item['sourceText'] == (scene if scene and confidence >= .5 and (ignored or confidence >= .75) else manga)


@pytest.mark.asyncio
@pytest.mark.parametrize('text,ignored', [('1',True),('１２–３',True),('1.25',True),('…！',True),('©™',True),('①',True),('3時間',False),('ええ',False),('啊',False)])
async def test_pretranslation_filter_preserves_numbers_and_marks_without_dropping_short_dialogue(text,ignored):
  item=region()
  item.update(sourceText=text,manuallyEdited=True)
  await vision.filter_translations(None,Image.new('RGB',(250,250)),Config().model_dump(),[item])
  assert item.get('ignored',False) is ignored


@pytest.mark.asyncio
async def test_style_edit_does_not_bypass_numeric_ocr_verification(monkeypatch):
  class Recognizer:
    async def recognize_comic_box(self,*args):return [('1.',.95)]
  @asynccontextmanager
  async def resource(owner,model):yield Recognizer()
  monkeypatch.setattr(vision,'resource',resource)
  monkeypatch.setattr(vision,'ppocr_model',lambda *args,**kwargs:'scene')
  item=region()
  item.update(sourceText='イー',manuallyEdited=True)
  await vision.filter_translations(None,Image.new('RGB',(250,250)),Config().model_dump(),[item])
  assert item['ignored'] is True


@pytest.mark.asyncio
async def test_configured_same_language_preserves_original():
  item=region()
  await vision.filter_translations(None,Image.new('RGB',(250,250)),Config(sourceLanguage='ja',targetLanguage='ja').model_dump(),[item])
  assert item['ignored'] is True


def test_mixed_size_cover_columns_do_not_merge_through_a_white_background():
  image=Image.new('RGB',(500,500),'#555555')
  ImageDraw.Draw(image).rectangle((20,20,480,480),fill='white')
  title=region(100,100,160,250)
  title['sourceLines']=[[[100,100],[180,100],[180,350],[100,350]],
    [[220,230],[240,230],[240,350],[220,350]]]
  result=vision.balloon_geometry(image,[title])[0]
  assert len(result['sourceLines'])==2
  columns=vision.paragraph_groups(result['sourceLines'])
  assert len(columns)==2
  assert sorted(tuple(column) for column in columns)==[(0,),(1,)]


def test_line_groups_keep_adjacent_words_together_and_separate_smaller_captions():
  item=region(20,20,240,320)
  item['sourceLines']=[[[20,20],[80,20],[80,210],[20,210]],
    [[85,20],[145,20],[145,300],[85,300]],
    [[150,20],[210,20],[210,300],[150,300]],
    [[30,240],[45,240],[45,310],[30,310]]]
  blocks=vision.paragraph_groups(item['sourceLines'])
  assert sorted(len(block) for block in blocks)==[1,3]
  assert [0,1,2] in [sorted(block) for block in blocks]


@pytest.mark.asyncio
async def test_block_detector_keeps_its_paragraph_as_one_translation_unit(monkeypatch):
  block=[[20,20],[200,20],[200,210],[20,210]]
  lines=[[[35,30],[60,30],[60,180],[35,180]],[[150,30],[175,30],[175,180],[150,180]]]
  class Detector:
    def __init__(self,kind):self.kind=kind
    async def detect_comic(self,image):return [block] if self.kind=='comic-rtdetr-onnx' else lines
  @asynccontextmanager
  async def resource(owner,kind):yield Detector(kind)
  monkeypatch.setattr(vision,'resource',resource)
  monkeypatch.setattr(vision,'ppocr_model',lambda *args,**kwargs:'pp-ocrv5-ch')
  result=await vision.detect(None,Image.new('RGB',(240,240),'white'),Config(detector='rtdetr').model_dump(),[])
  assert len(result)==1
  assert result[0]['sourceQuad']==block
  assert result[0]['sourceLines']==lines


@pytest.mark.asyncio
async def test_line_detector_groups_lines_before_creating_translation_units(monkeypatch):
  lines=[[[20,20],[45,20],[45,170],[20,170]],[[50,20],[75,20],[75,170],[50,170]]]
  class Detector:
    async def detect_comic(self,image):return lines
  @asynccontextmanager
  async def resource(owner,kind):yield Detector()
  monkeypatch.setattr(vision,'resource',resource)
  monkeypatch.setattr(vision,'ppocr_model',lambda *args,**kwargs:'pp-ocrv5-ch')
  result=await vision.detect(None,Image.new('RGB',(240,240),'#555555'),Config(detector='ppocr').model_dump(),[])
  assert len(result)==1
  assert len(result[0]['sourceLines'])==2
  assert result[0]['sourceQuad']==[[20,20],[75,20],[75,170],[20,170]]


def test_paragraph_grouping_matches_pinned_upstream_vectors():
  import json
  vectors=json.loads(Path(__file__).with_name('comic-paragraph-groups.json').read_text('utf-8'))
  for case in vectors['cases']:
    actual=vision.paragraph_groups(case['lines'])
    assert sorted(tuple(group) for group in actual)==sorted(tuple(group) for group in case['groups'])


@pytest.mark.asyncio
async def test_manga_crop_keeps_character_margin_and_excludes_neighboring_text():
  raw=np.full((200,200,3),255,np.uint8)
  raw[50:54,68:75]=0
  raw[110:140,70:90]=0
  item=region(60,55,40,80)
  neighbor=region(70,110,20,30)
  item['style']['angle']=0
  captures=[]
  class Recognizer:
    async def recognize_comic_box(self,image,quad,*args):
      captures.append(image.copy())
      return [('recognized',1)]
  await vision.recognize_region(Recognizer(),'manga-ocr-onnx',raw,Config().model_dump(),item,[item,neighbor])
  assert captures
  assert (captures[0][:8]<100).any()
  assert (captures[0][-24:]==255).all()


@pytest.mark.asyncio
async def test_perspective_save_undo_and_redo_keep_the_original_repair_geometry(tmp_path):
  from nola_translator_engine.backend.comics.service import ComicService
  from nola_translator_engine.backend.comics.schemas import ImportRequest, Mutation
  service=ComicService(tmp_path/'library',FONT)
  path=tmp_path/'source.png'
  Image.new('RGB',(240,260),'white').save(path)
  book=service.import_book(ImportRequest(paths=[str(path)]))
  item=region()
  async def edit(command):
    current=service.repository.get(book['id'])
    return await service.document(book['id'],Mutation(operationId=uuid4(),expectedRevision=current['revision'],command=command))
  first=await edit(dict(action='savePages',pages=[dict(id=book['pages'][0]['id'],regions=[item])]))
  original=deepcopy(first['pages'][0]['regions'][0]['sourceQuad'])
  changed=deepcopy(first['pages'][0]['regions'][0])
  quad=[[45,25],[150,60],[125,220],[25,180]]
  changed.update(textQuad=quad,x=25,y=25,width=125,height=195)
  await edit(dict(action='savePages',pages=[dict(id=book['pages'][0]['id'],regions=[changed])]))
  undone=await edit(dict(action='undo'))
  assert not undone['pages'][0]['regions'][0].get('textQuad')
  redone=await edit(dict(action='redo'))
  assert redone['pages'][0]['regions'][0]['textQuad']==quad
  assert redone['pages'][0]['regions'][0]['sourceQuad']==original
  await service.close()
