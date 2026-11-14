from pathlib import Path
from uuid import uuid4

import numpy as np
import pytest

from nola_translator_engine.backend.comic import render_page, validate_region, repair_page

FONT = Path(__file__).parents[3] / 'src/renderer/assets/fonts/NotoSansCJK-SC-VF.otf'


def item(text='A😀B'):
    return {'id':str(uuid4()),'x':10,'y':10,'width':240,'height':100,
            'sourceText':'Original','targetText':text,'confidence':None,'ignored':False,'locked':False,'qa':[],
            'style':{'fontSize':32,'color':'#000000','direction':'horizontal','align':'center'}}


def test_rich_runs_use_unicode_codepoints_and_draw_colors():
    region=item('AB')
    region['textRuns']=[{'start':0,'end':1,'style':{'color':'#ff0000','fontSize':40}},
                        {'start':1,'end':2,'style':{'color':'#0000ff'}}]
    region=validate_region(region,{'width':280,'height':140})
    metrics={}
    output=render_page(np.full((140,280,3),255,np.uint8),[region],FONT,metrics=metrics)
    assert ((output[:,:,2]>180)&(output[:,:,0]<100)).any()
    assert ((output[:,:,0]>180)&(output[:,:,2]<100)).any()
    assert metrics[region['id']]['lines']==['AB']
    assert metrics[region['id']]['fontSize']==32
    emoji=item()
    emoji['textRuns']=[{'start':1,'end':2,'style':{'color':'#ff0000'}}]
    assert validate_region(emoji,{'width':280,'height':140})['textRuns'][0]['end']==2


def test_rich_runs_reject_overlaps_and_outside_target():
    region=item('AB')
    region['textRuns']=[{'start':0,'end':2,'style':{}},{'start':1,'end':2,'style':{}}]
    with pytest.raises(ValueError):
        validate_region(region,{'width':280,'height':140})
    region['textRuns']=[{'start':0,'end':3,'style':{}}]
    with pytest.raises(ValueError):
        validate_region(region,{'width':280,'height':140})


def test_explicit_repair_polygon_is_independent_of_layout():
    region=item('译文')
    region['repairPolygon']=[[20,20],[35,20],[35,35],[20,35]]
    source=np.full((140,280,3),255,np.uint8)
    source[20:36,20:36]=0
    _,mask=repair_page(source,[region],[])
    assert mask[25,25]>0
    assert not mask[60,120]


def test_preview_is_readonly_and_uses_committed_render_layout(tmp_path):
    from nola_translator_engine.backend.comic import ComicService, encode_image
    path=tmp_path/'source.png'
    path.write_bytes(encode_image(np.full((140,280,3),255,np.uint8)))
    service=ComicService(tmp_path/'books',None,FONT)
    project=service.repository.import_sources([str(path)],'Book')
    page=project['pages'][0]
    candidate=item('AB')
    candidate['textRuns']=[{'start':0,'end':1,'style':{'color':'#ff0000'}}]
    before=service.repository.open(project['id'])
    preview=service.preview_region(project['id'],page['id'],candidate)
    assert preview['image'].startswith('data:image/png;base64,')
    assert preview['layout']['lines']==['AB']
    assert service.repository.open(project['id'])==before
    changed=service.repository.edit({'projectId':project['id'],'operationId':str(uuid4()),
        'expectedRevision':project['revision'],'command':{'action':'saveRegion','pageId':page['id'],'region':candidate}})
    metrics={}
    service.layer_rgba(changed['pages'][0],'text',candidate['id'],metrics)
    assert metrics[candidate['id']]==preview['layout']


def test_targeted_auto_repair_preserves_manual_and_unrelated_patches(tmp_path):
    from nola_translator_engine.backend.comic import ComicRepository, encode_image, append_repair_layer, save_repair_layers
    pixels=np.full((140,280,3),255,np.uint8)
    path=tmp_path/'source.png';path.write_bytes(encode_image(pixels))
    repo=ComicRepository(tmp_path/'books');project=repo.import_sources([str(path)],'Book');page=project['pages'][0]
    first=item('AB');second=item('CD');second['x']=35
    page['regions']=[first,second]
    mask=np.zeros((140,280),np.uint8);mask[20:30,20:30]=255
    append_repair_layer(repo,page,np.zeros_like(pixels),mask,'Hand repair')
    manual=page['repairLayers'][0].copy();digest=page['repairAssets'][manual['id']]
    mask[:]=0;mask[40:50,40:50]=255
    save_repair_layers(repo,page,np.zeros_like(pixels),mask,[first])
    assert manual in page['repairLayers']
    assert page['repairAssets'][manual['id']]==digest
    auto=next(layer for layer in page['repairLayers'] if layer.get('regionId')==first['id'])
    mask[:]=0;mask[60:65,60:65]=255
    save_repair_layers(repo,page,np.zeros_like(pixels),mask,[second])
    assert auto in page['repairLayers']
    assert manual in page['repairLayers']


def test_generated_page_retains_undo_chain_and_patch_move_is_reversible(tmp_path):
    import copy
    from nola_translator_engine.backend.comic import ComicRepository, encode_image, append_repair_layer
    pixels=np.full((140,280,3),255,np.uint8)
    path=tmp_path/'source.png';path.write_bytes(encode_image(pixels))
    repo=ComicRepository(tmp_path/'books');project=repo.import_sources([str(path)],'Book');page=project['pages'][0]
    mask=np.zeros((140,280),np.uint8);mask[20:30,20:30]=255
    append_repair_layer(repo,page,np.zeros_like(pixels),mask,'Patch')
    revision=repo.publish_page(project['id'],project['revision'],page)
    layer=page['repairLayers'][0]
    command={'action':'setRepairLayer','pageId':page['id'],'layerId':layer['id'],
             'name':layer['name'],'visible':True,'opacity':1,'x':50,'y':60}
    moved=repo.edit({'projectId':project['id'],'operationId':str(uuid4()),'expectedRevision':revision,'command':command})
    assert moved['pages'][0]['repairLayers'][0]['x']==50
    generated=copy.deepcopy(moved['pages'][0]);generated['status']='rendered'
    revision=repo.publish_page(project['id'],moved['revision'],generated)
    for expected in ('moved','initial'):
        undone=repo.edit({'projectId':project['id'],'operationId':str(uuid4()),'expectedRevision':revision,'command':{'action':'undo'}})
        revision=undone['revision']
        assert undone['pages'][0]['repairLayers'][0]['x']==(50 if expected=='moved' else 20)


def test_editable_metadata_survives_project_export_and_reopen(tmp_path):
    from nola_translator_engine.backend.comic import ComicRepository, encode_image
    pixels=np.full((140,280,3),255,np.uint8)
    path=tmp_path/'source.png';path.write_bytes(encode_image(pixels))
    repo=ComicRepository(tmp_path/'books');project=repo.import_sources([str(path)],'Book');page=project['pages'][0]
    candidate=item('AB')
    candidate['repairPolygon']=[[20,20],[35,20],[35,35],[20,35]]
    candidate['sourceStyle']=dict(candidate['style'])
    candidate['textRuns']=[{'start':0,'end':1,'style':{'fontWeight':700,'color':'#ff0000'}}]
    changed=repo.edit({'projectId':project['id'],'operationId':str(uuid4()),'expectedRevision':project['revision'],
        'command':{'action':'saveRegion','pageId':page['id'],'region':candidate}})
    exported=repo.export(project['id'],'project',None)
    imported=repo.import_sources([str(exported)],'Restored')
    restored=imported['pages'][0]['regions'][0]
    for key in ('repairPolygon','sourceStyle','textRuns','manuallyEdited'):
        assert restored[key]==changed['pages'][0]['regions'][0][key]


def test_rotated_rich_text_preserves_color_alpha_and_layout_geometry():
    region=item('AB')
    region.update(x=60,y=45,width=180,height=90,manuallyEdited=True)
    region['style']['angle']=25
    region['textRuns']=[{'start':0,'end':2,'style':{'color':'#ff0000'}}]
    metrics={}
    output=render_page(np.full((220,320,3),255,np.uint8),[region],FONT,metrics=metrics)
    red=(output[:,:,2]>180)&(output[:,:,0]<100)
    assert red.any()
    ys,xs=np.where(red)
    assert 60 < xs.mean() < 240 and 45 < ys.mean() < 135
    assert metrics[region['id']]['angle']==25
    assert metrics[region['id']]['x']==60


def test_horizontal_refinement_keeps_same_row_left_to_right_despite_jitter():
    from nola_translator_engine.backend.comic import order_horizontal_quads
    left=[[401.8,947.7],[500,947.7],[500,1020.8],[401.8,1020.8]]
    right=[[474.6,939.9],[605.8,935.9],[608.4,1016.9],[477.2,1021]]
    lower=[[402,1060],[500,1060],[500,1130],[402,1130]]
    assert order_horizontal_quads([right,lower,left])==[left,right,lower]


def test_automatic_tilted_paragraph_stays_in_source_line_slots():
    import cv2
    angle=np.radians(30)
    rotation=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
    lines=[(np.array([[0,0],[150,0],[150,30],[0,30]])@rotation.T+[100,30]).tolist(),
           (np.array([[20,75],[120,75],[120,105],[20,105]])@rotation.T+[100,30]).tolist()]
    points=np.asarray(lines).reshape(-1,2);left,top=points.min(axis=0);right,bottom=points.max(axis=0)
    region=item('ABCDEFGHIJKL')
    region.update(x=float(left),y=float(top),width=float(right-left),height=float(bottom-top),sourceLines=lines,
                  sourceQuad=[[left,top],[right,top],[right,bottom],[left,bottom]])
    region['style'].update(angle=30,autoFontSize=True)
    image=np.full((240,300,3),255,np.uint8)
    rendered=render_page(image,[region],FONT)
    allowed=np.zeros(image.shape[:2],np.uint8)
    for quad in lines:
        cv2.fillPoly(allowed,[np.rint(quad).astype(np.int32)],255)
    allowed=cv2.dilate(allowed,np.ones((9,9),np.uint8))
    ink=np.any(rendered<150,axis=2)
    assert ink.any()
    assert not (ink & (allowed==0)).any()


def test_optional_nested_layout_and_font_fields_omit_null_for_shared_schema():
    candidate=item('AB')
    candidate['sourceStyle']=dict(candidate['style'])
    candidate['fontMatch']={'family':'NotoSansSC-Regular','confidence':.2,
                            'candidates':[{'family':'NotoSansSC-Regular','confidence':.2}]}
    normalized=validate_region(candidate,{'width':280,'height':140})
    assert 'matchedFamily' not in normalized['fontMatch']
    assert 'autoFontSize' not in normalized['sourceStyle']


def test_source_line_counts_fill_all_slots_and_keep_capacity():
    from nola_translator_engine.backend.comic import allocate_comic_line_counts
    counts=allocate_comic_line_counts(12,[3,2,5,2,4,4],[140,100,210,100,180,170])
    assert sum(counts)==12 and all(0<count<=capacity for count,capacity in zip(counts,[3,2,5,2,4,4]))
    assert allocate_comic_line_counts(12,[3,2,0,2,4,4],[140,100,210,100,180,170]) is None


def test_vertical_parentheses_atomic_but_explicit_blank_column_is_preserved():
    from nola_translator_engine.backend.comic import allocate_comic_columns
    assert allocate_comic_columns('AB(CDE)',[3,5])==['AB','(CDE)']
    assert allocate_comic_columns('A\n\nB',[4,4,4])==['A','','B']
    assert allocate_comic_columns('A(CDE)',[3,3]) is None


def test_vertical_paragraph_spacing_changes_columns_not_character_advance():
    region=item('ABC')
    region['style'].update(direction='vertical-rl',fontSize=24,autoFontSize=False,lineSpacing=1)
    image=np.full((140,280,3),255,np.uint8)
    first=render_page(image,[region],FONT)
    region['style']['lineSpacing']=2
    second=render_page(image,[region],FONT)
    rows=lambda output:np.where(np.any(output<100,axis=2))[0]
    assert np.ptp(rows(first))==np.ptp(rows(second))


@pytest.mark.asyncio
async def test_explicit_targeted_overwrite_can_retranslate_locked_but_batch_cannot(tmp_path,monkeypatch):
    from types import SimpleNamespace
    from nola_translator_engine.backend.comic import ComicService,RunRequest,encode_image
    import asyncio
    calls=[]
    async def translate(gateway,request,**kwargs):
        calls.append(request.text)
        return SimpleNamespace(text='New translation')
    monkeypatch.setattr('nola_translator_engine.backend.direct_inference.run_direct_inference',translate)
    path=tmp_path/'source.png';path.write_bytes(encode_image(np.full((140,280,3),255,np.uint8)))
    service=ComicService(tmp_path/'books',None,FONT);repo=service.repository
    project=repo.import_sources([str(path)],'Book');page=project['pages'][0]
    candidate=item('Manual translation');candidate['locked']=True
    project=repo.edit({'projectId':project['id'],'operationId':str(uuid4()),'expectedRevision':project['revision'],
        'command':{'action':'saveRegion','pageId':page['id'],'region':candidate}})
    for explicit,overwrite in ((False,True),(True,False),(True,True)):
        request=RunRequest(expectedRevision=project['revision'],pageIds=[page['id']],stage='translate',
            regionId=candidate['id'] if explicit else None,overwriteManual=overwrite,model='index-translate')
        service.run(project['id'],request,object(),{})
        await asyncio.gather(*list(service.tasks.values()))
        project=repo.open(project['id'])
        assert next(job for job in project['jobs'] if job['id']==str(request.jobId))['state']=='completed'
        assert len(calls)==int(explicit and overwrite)
    assert project['pages'][0]['regions'][0]['targetText']=='New translation'
    for protected in ('ignored','editLocked'):
        current=project['pages'][0]
        current['regions'][0].update(ignored=False,editLocked=False)
        current['regions'][0][protected]=True
        revision=repo.publish_page(project['id'],project['revision'],current)
        request=RunRequest(expectedRevision=revision,pageIds=[page['id']],stage='translate',regionId=candidate['id'],overwriteManual=True,model='index-translate')
        service.run(project['id'],request,object(),{})
        await asyncio.gather(*list(service.tasks.values()));project=repo.open(project['id'])
        assert len(calls)==1
    await service.close()


@pytest.mark.parametrize('rich',[False,True])
def test_vertical_dialogue_centers_actual_text_block_in_layout(rich):
    candidate=item('ABCD')
    candidate.update(x=20,y=20,width=220,height=220,kind='dialogue')
    candidate['style'].update(direction='vertical-rl',fontSize=24,autoFontSize=False,align='center')
    if rich:candidate['textRuns']=[{'start':0,'end':4,'style':{'color':'#ff0000'}}]
    image=np.full((280,280,3),255,np.uint8);metrics={}
    rendered=render_page(image,[candidate],FONT,metrics=metrics)
    ys,xs=np.where(np.any(rendered<100,axis=2))
    assert abs((xs.min()+xs.max())/2-130)<12
    assert abs((ys.min()+ys.max())/2-130)<12
    layout=metrics[candidate['id']]
    assert layout['x']>candidate['x'] and layout['y']>candidate['y']


@pytest.mark.parametrize('angle',[0,20])
def test_missing_single_emoji_uses_real_system_color_font_without_changing_whole_layer(angle,tmp_path):
    from nola_translator_engine.backend.comic_layers import ComicFonts,font_glyph_metadata
    emoji=Path('C:/Windows/Fonts/seguiemj.ttf')
    if not emoji.is_file():pytest.skip('Windows Segoe UI Emoji is not installed')
    fonts=ComicFonts(FONT,tmp_path/'fonts')
    fonts._catalog=[{'family':'Noto Sans SC','weight':400,'italic':False,'path':FONT},
                    {'family':'Segoe UI Emoji','weight':400,'italic':False,'path':emoji}]
    assert 0x1f600 not in font_glyph_metadata(FONT)[0]
    assert fonts.glyph_fallback('\U0001f600')['family']=='Segoe UI Emoji'
    candidate=item('A\U0001f600B')
    candidate['style'].update(fontSize=40,autoFontSize=False,angle=angle)
    candidate['manuallyEdited']=True
    original=dict(candidate['style'])
    rendered=render_page(np.full((180,320,3),255,np.uint8),[candidate],FONT,fonts)
    colorful=np.ptp(rendered.astype(int),axis=2)>40
    assert np.count_nonzero(colorful)>50
    assert candidate['style']==original


def test_unavailable_glyph_fails_explicitly_instead_of_exporting_tofu(tmp_path):
    from nola_translator_engine.backend.comic_layers import ComicFonts
    fonts=ComicFonts(FONT,tmp_path/'fonts')
    fonts._catalog=[{'family':'Noto Sans SC','weight':400,'italic':False,'path':FONT}]
    with pytest.raises(ValueError,match='fontMissing'):
        render_page(np.full((140,280,3),255,np.uint8),[item('A\U0010ffff')],FONT,fonts)


@pytest.mark.parametrize('managed',[False,True])
def test_new_text_delete_undo_redo_never_discards_existing_repair_background(tmp_path,managed):
    import copy
    from nola_translator_engine.backend.comic import ComicRepository,encode_image,decode_image,append_repair_layer,composite_repair_layers
    source=np.full((140,280,3),255,np.uint8)
    path=tmp_path/'source.png';path.write_bytes(encode_image(source))
    repo=ComicRepository(tmp_path/'books');project=repo.import_sources([str(path)],'Book');page=project['pages'][0]
    mask=np.zeros(source.shape[:2],np.uint8);mask[20:30,20:30]=255
    if managed:
        append_repair_layer(repo,page,np.zeros_like(source),mask,'Existing patch')
        clean=composite_repair_layers(repo,page)
    else:
        clean=source.copy();clean[mask>0]=0
    page['cleanAsset']=repo.asset(encode_image(clean));page['hasClean']=True
    revision=repo.publish_page(project['id'],project['revision'],page)
    layers=copy.deepcopy(page.get('repairLayers',[]));assets=dict(page.get('repairAssets',{}));digest=page['cleanAsset']
    candidate=item('Added text');candidate['sourceText']=''
    commands=[{'action':'saveRegion','pageId':page['id'],'region':candidate},
              {'action':'deleteRegion','pageId':page['id'],'regionId':candidate['id']},
              {'action':'undo'},{'action':'undo'},{'action':'redo'},{'action':'redo'}]
    for command,count in zip(commands,[1,0,1,0,1,0]):
        project=repo.edit({'projectId':project['id'],'operationId':str(uuid4()),'expectedRevision':revision,'command':command})
        revision=project['revision'];current=project['pages'][0]
        assert len(current['regions'])==count
        assert current['hasClean'] and current['cleanAsset']==digest
        assert current.get('repairLayers',[])==layers and current.get('repairAssets',{})==assets
        assert np.array_equal(decode_image(repo._page_asset(current,'clean').read_bytes()),clean)


def test_legacy_flat_clean_survives_recognition_translation_and_layout_edits(tmp_path):
    from nola_translator_engine.backend.comic import ComicRepository,encode_image
    source=np.full((140,280,3),255,np.uint8)
    path=tmp_path/'source.png';path.write_bytes(encode_image(source))
    repo=ComicRepository(tmp_path/'books');project=repo.import_sources([str(path)],'Legacy');page=project['pages'][0]
    clean=source.copy();clean[20:30,20:30]=0
    page['cleanAsset']=repo.asset(encode_image(clean));page['hasClean']=True
    page['regions']=[item('Old target')]
    revision=repo.publish_page(project['id'],project['revision'],page);digest=page['cleanAsset']
    changed=dict(page['regions'][0]);changed.update(x=30,sourceText='Corrected OCR',targetText='New target',ignored=True,
        sourceQuad=[[30,20],[60,20],[60,50],[30,50]])
    project=repo.edit({'projectId':project['id'],'operationId':str(uuid4()),'expectedRevision':revision,
        'command':{'action':'saveRegion','pageId':page['id'],'region':changed}})
    assert project['pages'][0]['hasClean'] and project['pages'][0]['cleanAsset']==digest
    assert not project['pages'][0]['hasRendered']


@pytest.mark.parametrize('managed',[False,True])
def test_mask_input_edits_preserve_last_clean_until_explicit_repair(tmp_path,managed):
    from nola_translator_engine.backend.comic import ComicRepository,encode_image,append_repair_layer,composite_repair_layers
    source=np.full((140,280,3),255,np.uint8);path=tmp_path/'source.png';path.write_bytes(encode_image(source))
    repo=ComicRepository(tmp_path/'books');project=repo.import_sources([str(path)],'Book');page=project['pages'][0]
    mask=np.zeros(source.shape[:2],np.uint8);mask[20:30,20:30]=255
    if managed:append_repair_layer(repo,page,np.zeros_like(source),mask,'Saved repair')
    clean=composite_repair_layers(repo,page) if managed else np.full_like(source,230)
    page.update(cleanAsset=repo.asset(encode_image(clean)),hasClean=True,status='rendered')
    revision=repo.publish_page(project['id'],project['revision'],page);digest=page['cleanAsset']
    stroke={'id':str(uuid4()),'mode':'erase','size':10,'points':[[60,60],[80,60]]}
    renamed={**stroke,'name':'Renamed mask','points':[[70,70],[90,70]]}
    for command in ({'action':'paintMask','pageId':page['id'],'stroke':stroke},
                    {'action':'saveMask','pageId':page['id'],'stroke':renamed},
                    {'action':'deleteMask','pageId':page['id'],'strokeId':stroke['id']},
                    {'action':'paintMask','pageId':page['id'],'stroke':stroke},
                    {'action':'clearMask','pageId':page['id']}):
        project=repo.edit({'projectId':project['id'],'operationId':str(uuid4()),'expectedRevision':revision,'command':command})
        revision=project['revision'];current=project['pages'][0]
        assert current['hasClean'] and current['cleanAsset']==digest
        assert current.get('repairLayers',[])==page.get('repairLayers',[])
        assert current['status']=='translated' and not current['hasRendered']


@pytest.mark.asyncio
async def test_explicit_repair_refreshes_empty_auto_masks_but_keeps_manual_patch(tmp_path):
    import asyncio
    from nola_translator_engine.backend.comic import ComicService,RunRequest,encode_image,append_repair_layer,composite_repair_layers
    pixels=np.full((140,280,3),255,np.uint8);path=tmp_path/'source.png';path.write_bytes(encode_image(pixels))
    service=ComicService(tmp_path/'books',None,FONT);repo=service.repository
    project=repo.import_sources([str(path)],'Book');page=project['pages'][0]
    mask=np.zeros(pixels.shape[:2],np.uint8);mask[20:30,20:30]=255
    append_repair_layer(repo,page,np.zeros_like(pixels),mask,'Automatic mask')
    page['repairLayers'][0]['origin']='auto'
    automatic=page['repairLayers'][0]['id']
    mask[:]=0;mask[60:70,60:70]=255
    append_repair_layer(repo,page,np.zeros_like(pixels),mask,'Manual patch')
    manual=page['repairLayers'][1]['id']
    page.update(cleanAsset=repo.asset(encode_image(composite_repair_layers(repo,page))),hasClean=True)
    old=page['cleanAsset'];revision=repo.publish_page(project['id'],project['revision'],page)
    request=RunRequest(expectedRevision=revision,pageIds=[page['id']],stage='repair',model='index-translate')
    service.run(project['id'],request,None,{})
    await asyncio.gather(*list(service.tasks.values()))
    result=repo.open(project['id']);current=result['pages'][0]
    assert result['jobs'][0]['state']=='completed'
    assert current['cleanAsset']!=old and current['hasClean']
    assert [layer['id'] for layer in current['repairLayers']]==[manual]
    assert automatic not in current['repairAssets']
    await service.close()


def test_mixed_horizontal_font_sizes_share_actual_baseline():
    candidate=item('AB')
    candidate['style'].update(fontSize=42,autoFontSize=False)
    candidate['textRuns']=[{'start':0,'end':1,'style':{'fontSize':64,'color':'#ff0000'}},
                           {'start':1,'end':2,'style':{'fontSize':42,'color':'#0000ff'}}]
    rendered=render_page(np.full((140,280,3),255,np.uint8),[candidate],FONT)
    red=(rendered[:,:,2]>150)&(rendered[:,:,0]<100)&(rendered[:,:,1]<100)
    blue=(rendered[:,:,0]>150)&(rendered[:,:,2]<100)&(rendered[:,:,1]<100)
    assert abs(np.where(red)[0].max()-np.where(blue)[0].max())<=1
    assert np.where(red)[0].min()<np.where(blue)[0].min()-10


def test_uniform_horizontal_rich_and_plain_text_do_not_jump_baseline():
    candidate=item('\u4f60\u6587')
    candidate['style'].update(fontSize=42,autoFontSize=False)
    image=np.full((140,280,3),255,np.uint8)
    plain=render_page(image,[candidate],FONT)
    candidate['textRuns']=[{'start':0,'end':2,'style':{'color':'#000000'}}]
    rich=render_page(image,[candidate],FONT)
    assert np.array_equal(plain,rich)


def test_artboard_position_preserves_local_layers_cache_and_survives_history_and_project_io(tmp_path):
    import copy
    from nola_translator_engine.backend.comic import ComicRepository,encode_image
    pixels=np.full((140,280,3),255,np.uint8)
    paths=[]
    for number in range(2):
        path=tmp_path/f'source-{number}.png';pixels[0,0]=250-number
        path.write_bytes(encode_image(pixels));paths.append(str(path))
    repo=ComicRepository(tmp_path/'books');project=repo.import_sources(paths,'Multiple artboards')
    page=project['pages'][0]
    page.update(cleanAsset=repo.asset(encode_image(np.full_like(pixels,240))),hasClean=True,
                renderedAsset=repo.asset(encode_image(np.full_like(pixels,230))),hasRendered=True,status='rendered')
    page['regions']=[item('AB')]
    revision=repo.publish_page(project['id'],project['revision'],page)
    before=copy.deepcopy(repo.open(project['id'])['pages'][0])
    assert before['artboard']=={'x':0,'y':0}
    project=repo.edit({'projectId':project['id'],'operationId':str(uuid4()),'expectedRevision':revision,
        'command':{'action':'setArtboard','pageId':page['id'],'artboard':{'x':-123.5,'y':987.25,'name':'  Chapter One  ','visible':False,'locked':True,'expanded':False}}})
    moved=project['pages'][0]
    assert moved['artboard']=={'x':-123.5,'y':987.25,'name':'Chapter One','visible':False,'locked':True,'expanded':False}
    assert {key:value for key,value in moved.items() if key!='artboard'}=={key:value for key,value in before.items() if key!='artboard'}
    assert project['pages'][1]['artboard']=={'x':380,'y':0}
    restarted=ComicRepository(tmp_path/'books').open(project['id'])
    assert restarted['pages'][0]['artboard']==moved['artboard']
    for action,exists in (('undo',False),('redo',True)):
        project=repo.edit({'projectId':project['id'],'operationId':str(uuid4()),'expectedRevision':project['revision'],'command':{'action':action}})
        current=project['pages'][0]
        assert current['artboard']==(moved['artboard'] if exists else before['artboard'])
        assert {key:value for key,value in current.items() if key!='artboard'}=={key:value for key,value in before.items() if key!='artboard'}
    hidden_png=repo.export(project['id'],'png',[page['id']])
    from nola_translator_engine.backend.comic import decode_image
    assert np.array_equal(decode_image(hidden_png.read_bytes()),np.full_like(pixels,230))
    exported=repo.export(project['id'],'project',None)
    imported=repo.import_sources([str(exported)],'Reopened artboards')
    assert imported['pages'][0]['artboard']=={'x':-123.5,'y':987.25,'name':'Chapter One','visible':False,'locked':True,'expanded':False}
    assert imported['pages'][1]['artboard']=={'x':380,'y':0}
    assert imported['pages'][0]['hasClean'] and imported['pages'][0]['hasRendered']


@pytest.mark.parametrize('position',[{'x':True,'y':0},{'x':float('nan'),'y':0},{'x':0,'y':float('inf')},
    {'x':-1_000_001,'y':0},{'x':0,'y':1_000_001},{'x':'5','y':0},{'x':0},
    {'x':0,'y':0,'width':100}])
def test_artboard_coordinates_reject_nonfinite_or_out_of_workspace_values(position):
    from nola_translator_engine.backend.comic import validate_artboard
    with pytest.raises(ValueError,match='invalidGeometry'):
        validate_artboard(position)


def test_artboard_coordinate_bounds_are_inclusive():
    from nola_translator_engine.backend.comic import validate_artboard
    assert validate_artboard({'x':-1_000_000,'y':1_000_000})=={'x':-1_000_000.,'y':1_000_000.}


@pytest.mark.parametrize('metadata',[{'x':float('nan'),'y':0},{'x':0,'y':0,'name':[]},{'x':0,'y':0,'visible':1}])
def test_project_import_rejects_nonfinite_artboard_metadata(tmp_path,metadata):
    import json,zipfile
    from nola_translator_engine.backend.comic import ComicRepository,encode_image
    path=tmp_path/'source.png';path.write_bytes(encode_image(np.full((140,280,3),255,np.uint8)))
    repo=ComicRepository(tmp_path/'books');project=repo.import_sources([str(path)],'Book')
    exported=repo.export(project['id'],'project',None);invalid=tmp_path/'invalid.nola-comic'
    with zipfile.ZipFile(exported) as original,zipfile.ZipFile(invalid,'w') as target:
        for member in original.infolist():
            data=original.read(member.filename)
            if member.filename=='project.json':
                manifest=json.loads(data);manifest['project']['pages'][0]['artboard']=metadata
                data=json.dumps(manifest).encode('utf-8')
            target.writestr(member,data)
    with pytest.raises(ValueError,match='invalidGeometry'):
        repo.import_sources([str(invalid)],'Invalid artboard')
    assert repo.open(project['id'])['pages'][0]['artboard']=={'x':0,'y':0}


@pytest.mark.parametrize('extra',[{'name':''},{'name':'   '},{'name':'a'*201},{'name':None},{'name':123},
    {'name':[]},{'visible':1},{'locked':0},{'expanded':'false'},{'visible':None}])
def test_artboard_rejects_invalid_names_and_non_boolean_workspace_flags(extra):
    from nola_translator_engine.backend.comic import validate_artboard
    with pytest.raises(ValueError,match='invalidGeometry'):
        validate_artboard({'x':0,'y':0,**extra})


def test_artboard_metadata_accepts_optional_fields_without_generating_defaults():
    from nola_translator_engine.backend.comic import validate_artboard,validate_edit
    assert validate_artboard({'x':1,'y':2})=={'x':1.,'y':2.}
    assert validate_artboard({'x':1,'y':2,'name':'  Friendly label  ','visible':False,'locked':True,'expanded':False})=={
        'x':1.,'y':2.,'name':'Friendly label','visible':False,'locked':True,'expanded':False}
    with pytest.raises(ValueError,match='invalidCommand'):
        validate_edit({'projectId':str(uuid4()),'operationId':str(uuid4()),'expectedRevision':0,
                       'command':{'action':'setArtboardPosition','pageId':str(uuid4()),'x':0,'y':0}})


def test_legacy_artboard_defaults_are_read_only_until_edit_and_stable_after_move_and_reorder(tmp_path):
    import copy,json
    from nola_translator_engine.backend.comic import ComicRepository,encode_image
    paths=[]
    for index,width in enumerate((180,240,300)):
        path=tmp_path/f"board-{index}.png"
        path.write_bytes(encode_image(np.full((140,width,3),255,np.uint8)))
        paths.append(str(path))
    repo=ComicRepository(tmp_path/'books');project=repo.import_sources(paths,'Legacy')
    identifier=project['id']
    with repo.connection() as db:
        legacy=json.loads(db.execute('SELECT body FROM projects WHERE id=?',(identifier,)).fetchone()[0])
        for page in legacy['pages']:page.pop('artboard')
        legacy['pages'][1]['artboard']={'x':-500,'y':20,'locked':True}
        body=json.dumps(legacy)
        db.execute('UPDATE projects SET body=? WHERE id=?',(body,identifier))
    project=repo.open(identifier)
    assert [p['artboard'] for p in project['pages']]==[{'x':0,'y':0},{'x':-500,'y':20,'locked':True},{'x':620,'y':0}]
    assert project['revision']==legacy['revision']
    with repo.connection() as db:
        assert db.execute('SELECT body FROM projects WHERE id=?',(identifier,)).fetchone()[0]==body
    original=copy.deepcopy(project['pages'])
    def edit(command):
        nonlocal project
        project=repo.edit({'projectId':identifier,'expectedRevision':project['revision'],'operationId':str(uuid4()),'command':command})
    edit({'action':'setArtboard','pageId':original[0]['id'],'artboard':{'x':9000,'y':400}})
    edit({'action':'movePage','pageId':original[0]['id'],'chapterId':original[0]['chapterId'],'index':2})
    reopened=ComicRepository(tmp_path/'books').open(identifier)
    by_id={p['id']:p for p in reopened['pages']}
    for page in original[1:]:assert by_id[page['id']]==page
    assert by_id[original[0]['id']]['artboard']=={'x':9000,'y':400}
    export=repo.export(identifier,'project',None)
    imported=repo.import_sources([str(export)],'Reopened')
    assert [p['artboard'] for p in imported['pages']]==[p['artboard'] for p in reopened['pages']]
