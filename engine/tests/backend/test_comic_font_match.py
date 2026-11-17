from pathlib import Path

import numpy as np
import pytest

from nola_translator_engine.backend.comic_font_match import (
    font_classifier_input, font_candidates, match_installed_candidates, read_font_classnames,
)

FONT = Path(__file__).parents[3] / 'src/renderer/assets/fonts/NotoSansCJK-SC-VF.otf'


def test_public_classifier_input_rgb_pad_and_imagenet_normalization():
    pixels=np.zeros((10,20,3),np.uint8)
    pixels[:,:,2]=255
    values=font_classifier_input(pixels)
    assert values.shape==(1,3,320,320) and values.dtype==np.float32
    assert np.allclose(values[0,:,160,160],[(1-.485)/.229,-.456/.224,-.406/.225])
    assert np.allclose(values[0,:,0,0],[(1-.485)/.229,(1-.456)/.224,(1-.406)/.225])


def test_top_five_preserve_real_softmax_rank_and_reject_invalid_logits():
    result=font_candidates([0,1,2],['A','B','C'])
    assert [item['family'] for item in result]==['C','B','A']
    assert sum(item['confidence'] for item in result)==pytest.approx(1)
    with pytest.raises(ValueError):
        font_candidates([np.nan],['A'])


def test_real_font_coverage_uses_installed_family_and_retains_top_one_metadata():
    from PIL import ImageFont
    family=ImageFont.truetype(str(FONT),20).getname()[0]
    class Fonts:
        def list(self):
            return [{'family':family,'weight':400,'italic':False}]
        def path(self,*args):
            return FONT
    candidates=[{'family':'Missing-Regular','confidence':.6},
                {'family':family.replace(' ','')+'-Regular','confidence':.3}]
    result=match_installed_candidates(candidates,Fonts(),'ABC\u4f60\uff0c')
    assert result['family']=='Missing-Regular' and result['confidence']==.6
    assert result['matchedFamily']==family and result['matchedConfidence']==.3 and result['rank']==2
    unsupported=match_installed_candidates(candidates,Fonts(),'\U0010ffff')
    assert 'matchedFamily' not in unsupported


def test_pinned_config_scalar_list_parser_is_not_yaml_object_loader(tmp_path):
    path=tmp_path/'config.yaml'
    labels=['NotoSansSC[wght]','ABeeZee-Regular']+[f'Font{index}' for index in range(3471)]
    path.write_text('arch: efficientnet_b3.ra2_in1k\nclasses: 3473\nclassnames:\n'+
                    ''.join('- '+label+'\n' for label in labels)+'size: 320\n')
    assert read_font_classnames(path)==labels
    path.write_text('classes: 1\nclassnames:\n- !!python/object:evil\nsize: 320\n')
    with pytest.raises(ValueError):
        read_font_classnames(path)


def test_yuzu_public_input_is_rgb_bilinear_512_without_imagenet_normalization():
    from nola_translator_engine.backend.comic_font_match import yuzu_classifier_input,comic_font_is_cjk
    pixels=np.zeros((20,30,3),np.uint8);pixels[:,:,2]=255
    values=yuzu_classifier_input(pixels)
    assert values.shape==(1,3,512,512) and values.dtype==np.float32
    assert np.array_equal(values[0,:,0,0],[1,0,0])
    assert comic_font_is_cjk('ABC\u3042') and comic_font_is_cjk('\u4e2d\u6587')
    assert not comic_font_is_cjk('Hello WORLD 123')


def test_yuzu_category_substitution_is_real_cmap_and_not_fake_exact_confidence():
    from PIL import ImageFont
    from nola_translator_engine.backend.comic_font_match import match_installed_candidates,font_weight_from_label
    family=ImageFont.truetype(str(FONT),20).getname()[0]
    class Fonts:
        def list(self):return [{'family':family,'weight':400,'italic':False}]
        def path(self,*args):return FONT
    result=match_installed_candidates([{'family':'Uninstalled Comic','confidence':.9}],Fonts(),'\u4e2d\u6587\uff0c',False)
    assert result['matchedFamily']==family and result['substitution']=='category'
    assert 'matchedConfidence' not in result and 'rank' not in result
    assert font_weight_from_label('DFComic-W7')==700
    assert font_weight_from_label('Arphic POP44 Bold JIS')==700
    assert font_weight_from_label('S2G Memo font') is None


def test_calligraphic_candidate_uses_installed_kai_with_real_glyph_coverage():
    class Fonts:
        def list(self):
            return [{'family': 'Example Kaiti', 'weight': 400, 'italic': False}]
        def path(self, *args):
            return FONT

    result = match_installed_candidates([{'family': '示例字迹-古风', 'confidence': .9}], Fonts(), '中文', False)
    assert result['matchedFamily'] == 'Example Kaiti'
    assert result['substitution'] == 'category'
    assert 'matchedConfidence' not in result
    assert 'matchedFamily' not in match_installed_candidates(
        [{'family': '示例字迹-古风', 'confidence': .9}], Fonts(), '\U0010ffff', False)
    result = match_installed_candidates([{'family':'Unknown','confidence':.9},
        {'family':'示例手书','confidence':.1}],Fonts(),'中文',False)
    assert result['matchedFamily']=='Example Kaiti' and result['substitution']=='category'
    assert 'matchedConfidence' not in result


def test_classifier_crop_rectifies_both_scripts_without_deleted_ocr_module():
    from nola_translator_engine.backend.comic_font_match import classifier_source_crop
    image=np.full((100,100,3),255,np.uint8)
    image[20:80,30:60]=[20,40,60]
    quad=[[30,20],[60,20],[60,80],[30,80]]
    for cjk in (False,True):
        crop=classifier_source_crop(image,quad,[quad],cjk)
        assert crop.shape==(60,30,3)
        assert np.array_equal(crop[20,15],[20,40,60])


@pytest.mark.asyncio
@pytest.mark.parametrize('source,model', [('日本語','comic-yuzu-font-onnx'),('English','comic-font-classifier-onnx')])
async def test_automatic_font_runs_source_classifier_and_reuses_it_when_translation_changes(monkeypatch,source,model):
    from collections import OrderedDict
    from contextlib import asynccontextmanager
    from types import SimpleNamespace
    from PIL import Image
    from nola_translator_engine.backend.comic_font_match import match_comic_fonts
    from nola_translator_engine.backend.comics import vision
    from nola_translator_engine.backend.comics.layout import Fonts,render_page
    calls=[]
    fonts=Fonts(FONT)
    class Classifier:
        async def classify(self,crop):
            calls.append(crop.shape)
            return [{'family':'NotoSansSC-Regular','confidence':.9}]
        async def describe(self,crop):
            calls.append(crop.shape)
            return {'candidates':[{'family':'Missing','confidence':.9}], 'serif':False}
    @asynccontextmanager
    async def resource(owner,selected_model):
        assert selected_model==model
        yield Classifier()
    monkeypatch.setattr(vision,'resource',resource)
    owner=SimpleNamespace(models=SimpleNamespace(is_installed=lambda spec:True))
    item=dict(id='bubble',x=20,y=20,width=120,height=150,sourceText=source,targetText='中文',
        style=dict(autoFont=True,fontFamily='Noto Sans SC',fontSize=22,direction='horizontal'))
    cache=OrderedDict()
    image=Image.new('RGB',(200,200),'white')
    await match_comic_fonts(owner,image,[item],fonts,cache)
    render_page(image,[item],fonts)
    assert item['resolvedLayout']['fontMatch']['substitution']==('category' if source=='日本語' else 'exact')
    assert item['resolvedLayout']['fontFamily']==item['style']['fontFamily']
    item['targetText']='changed text'
    await match_comic_fonts(owner,image,[item],fonts,cache)
    assert len(calls)==1
    assert item['style']['autoFont'] is True
    item['style']['autoFont']=False
    item['style']['fontFamily']='manual selection'
    await match_comic_fonts(owner,image,[item],fonts,cache)
    assert item['style']['fontFamily']=='manual selection' and len(calls)==1


@pytest.mark.asyncio
async def test_missing_classifier_falls_back_without_downloading():
    from collections import OrderedDict
    from PIL import Image
    from types import SimpleNamespace
    from nola_translator_engine.backend.comic_font_match import match_comic_fonts
    from nola_translator_engine.backend.comics.layout import Fonts
    class Owner:
        models=SimpleNamespace(is_installed=lambda spec:False)
        def variant(self,model):raise AssertionError('must not load or install a missing model')
    item=dict(id='bubble',sourceText='text',targetText='中文',style=dict(autoFont=True))
    await match_comic_fonts(Owner(),Image.new('RGB',(50,50)),[item],Fonts(FONT),OrderedDict())
    assert item['resolvedLayout']['fontMatch']['reason']=='modelMissing'
    assert item['style']['fontFamily']=='Noto Sans SC'
