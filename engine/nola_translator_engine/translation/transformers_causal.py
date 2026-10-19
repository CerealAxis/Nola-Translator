"""Local causal-LM translation independent of the recommended model families."""
from __future__ import annotations

import asyncio

from .base import ProviderTranslation
from .m2m100 import M2M100Runtime, _Bundle
from ..compute import cpu_threads, resolve_dtype
from .index_translate_languages import LANGUAGE_NAMES


# ISO 639-1 -> 639-3 identifiers used by multilingual tokenizer language tokens.
_ISO3 = dict(item.split('=') for item in (
    'aa=aar ab=abk ae=ave af=afr ak=aka am=amh an=arg ar=ara as=asm av=ava ay=aym az=aze ba=bak be=bel bg=bul bi=bis bm=bam bn=ben bo=bod br=bre bs=bos ca=cat ce=che ch=cha co=cos cr=cre cs=ces cu=chu cv=chv cy=cym da=dan de=deu dv=div dz=dzo ee=ewe el=ell en=eng eo=epo es=spa et=est eu=eus fa=fas ff=ful fi=fin fj=fij fo=fao fr=fra fy=fry ga=gle gd=gla gl=glg gn=grn gu=guj gv=glv ha=hau he=heb hi=hin ho=hmo hr=hrv ht=hat hu=hun hy=hye hz=her ia=ina id=ind ie=ile ig=ibo ii=iii ik=ipk io=ido is=isl it=ita iu=iku ja=jpn jv=jav ka=kat kg=kon ki=kik kj=kua kk=kaz kl=kal km=khm kn=kan ko=kor kr=kau ks=kas ku=kur kv=kom kw=cor ky=kir la=lat lb=ltz lg=lug li=lim ln=lin lo=lao lt=lit lu=lub lv=lav mg=mlg mh=mah mi=mri mk=mkd ml=mal mn=mon mr=mar ms=msa mt=mlt my=mya na=nau nb=nob nd=nde ne=nep ng=ndo nl=nld nn=nno no=nor nr=nbl nv=nav ny=nya oc=oci oj=oji om=orm or=ori os=oss pa=pan pi=pli pl=pol ps=pus pt=por qu=que rm=roh rn=run ro=ron ru=rus rw=kin sa=san sc=srd sd=snd se=sme sg=sag sh=hbs si=sin sk=slk sl=slv sm=smo sn=sna so=som sq=sqi sr=srp ss=ssw st=sot su=sun sv=swe sw=swa ta=tam te=tel tg=tgk th=tha ti=tir tk=tuk tl=tgl tn=tsn to=ton tr=tur ts=tso tt=tat tw=twi ty=tah ug=uig uk=ukr ur=urd uz=uzb ve=ven vi=vie vo=vol wa=wln wo=wol xh=xho yi=yid yo=yor za=zha zh=zho zu=zul'
).split())
_LANGUAGE_VARIANTS = {'ar': 'arb', 'et': 'ekk', 'fa': 'pes', 'ku': 'kmr', 'lv': 'lvs', 'mg': 'plt',
                      'mn': 'khk', 'ms': 'zsm', 'ne': 'npi', 'no': 'nob', 'ps': 'pbt', 'sq': 'als', 'sw': 'swh', 'uz': 'uzn'}


def tokenizer_language(tokenizer, code: str) -> str:
    from ..model_capabilities import normalize

    tokens = list(getattr(tokenizer, 'lang_code_to_id', {}))
    tokens += list(getattr(tokenizer, 'additional_special_tokens', []))
    key = normalize(code)
    if key == 'auto':
        return getattr(tokenizer, 'src_lang', None) or tokenizer_language(tokenizer, 'en')
    exact = next((token for token in tokens if token.casefold().replace('_', '-') == key.casefold()), None)
    if exact:
        return exact
    prefixes = {key, _ISO3.get(key, key), _LANGUAGE_VARIANTS.get(key, key)}
    candidates = [token for token in tokens if token.split('_')[0] in prefixes]
    if key in ('zh', 'zh-Hant'):
        candidates = [token for token in tokens if token.startswith(('zh_', 'zho_')) and
                      token.rsplit('_', 1)[-1] in (('Hant', 'TW') if key == 'zh-Hant' else ('Hans', 'CN'))]
    return candidates[0] if candidates else code


def load_verified_model(loader, directory, **options):
    model, loading = loader.from_pretrained(str(directory), local_files_only=True,
        trust_remote_code=False, output_loading_info=True, **options)
    missing = loading.get('missing_keys', [])
    if missing:
        # A generated result from randomly initialized parameters does not validate a checkpoint.
        raise ValueError(f'Model weights are incomplete: {len(missing)} missing parameters, first: {missing[0]}')
    return model


class CausalTranslationRuntime(M2M100Runtime):
    model_label = "Transformers causal LM"

    def __init__(self, model_dir, *, context_size=2048, **options):
        super().__init__(model_dir, **options)
        self.context_size = context_size

    def _load_bundle(self):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.device = self.device or "cpu"
        torch.set_num_threads(cpu_threads(self.threads))
        tokenizer = AutoTokenizer.from_pretrained(str(self.model_dir), local_files_only=True, trust_remote_code=False)
        model = load_verified_model(AutoModelForCausalLM, self.model_dir,
            torch_dtype=resolve_dtype(self.device, self.precision)).to(self.device).eval()
        return _Bundle(model=model, tokenizer=tokenizer)

    def _translate_locked(self, text, source, target):
        import torch
        from ..model_capabilities import normalize
        from ..hub import HYMT2_LANGUAGES

        self.load()
        bundle = self._bundle
        target_name = HYMT2_LANGUAGES.get(normalize(target)) or LANGUAGE_NAMES.get(normalize(target), target)
        prompt = f"Translate the following text into {target_name}. Only output the translation:\n{text}"
        rendered = (bundle.tokenizer.apply_chat_template([{"role": "user", "content": prompt}],
            tokenize=False, add_generation_prompt=True, enable_thinking=False)
            if bundle.tokenizer.chat_template else prompt + '\n')
        inputs = bundle.tokenizer(rendered, return_tensors="pt", add_special_tokens=False).to(self.device)
        count = inputs['input_ids'].shape[1]
        limit = min(self.context_size, getattr(bundle.model.config, 'max_position_embeddings', self.context_size))
        output_tokens = min(512, limit - count)
        if output_tokens < 32:
            raise ValueError("翻译原文超过模型上下文长度，请缩短原文或增大上下文窗口。")
        with torch.inference_mode():
            output = bundle.model.generate(**inputs, max_new_tokens=output_tokens, do_sample=False)
        generated = output[0, count:]
        if len(generated) >= output_tokens:
            raise ValueError("翻译达到输出上限，请缩短原文或增大上下文窗口。")
        return bundle.tokenizer.decode(generated, skip_special_tokens=True).strip()


class CausalTranslationProvider:
    name = "transformers-causal"

    def __init__(self, model_dir, **options):
        self.runtime = CausalTranslationRuntime(model_dir, **options)

    async def translate(self, text, source, target):
        content = await asyncio.to_thread(self.runtime.translate_sync, text, source, target)
        return ProviderTranslation(content, (source, target))


class Seq2SeqTranslationRuntime(CausalTranslationRuntime):
    model_label = "Transformers sequence-to-sequence"

    def _load_bundle(self):
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        self.device = self.device or "cpu"
        torch.set_num_threads(cpu_threads(self.threads))
        tokenizer = AutoTokenizer.from_pretrained(str(self.model_dir), local_files_only=True, trust_remote_code=False)
        model = load_verified_model(AutoModelForSeq2SeqLM, self.model_dir,
            torch_dtype=resolve_dtype(self.device, self.precision)).to(self.device).eval()
        return _Bundle(model=model, tokenizer=tokenizer)

    def _translate_locked(self, text, source, target):
        import torch

        self.load()
        bundle = self._bundle
        tokenizer = bundle.tokenizer
        # Multilingual tokenizers own the source/target prefix and BOS protocol.
        build_translation = getattr(tokenizer, '_build_translation_inputs', None)
        if build_translation is not None and hasattr(tokenizer, 'src_lang'):
            inputs = build_translation(text, return_tensors='pt',
                src_lang=tokenizer_language(tokenizer, source), tgt_lang=tokenizer_language(tokenizer, target))
        else:
            source_name = LANGUAGE_NAMES.get(source, source)
            target_name = LANGUAGE_NAMES.get(target, target)
            task_params = getattr(bundle.model.config, 'task_specific_params', None) or {}
            task = task_params.get(f'translation_{source}_to_{target}', {})
            prefix = task.get('prefix', getattr(bundle.model.config, 'prefix', None))
            prompt = text if prefix else f'translate {source_name} to {target_name}: {text}'
            inputs = tokenizer((prefix or '') + prompt, return_tensors='pt')
        inputs = {key: value.to(self.device) if hasattr(value, 'to') else value for key, value in inputs.items()}
        with torch.inference_mode():
            output = bundle.model.generate(**inputs, max_new_tokens=min(512, self.context_size), do_sample=False)
        return tokenizer.batch_decode(output, skip_special_tokens=True)[0].strip()


class Seq2SeqTranslationProvider(CausalTranslationProvider):
    name = "transformers-seq2seq"

    def __init__(self, model_dir, **options):
        self.runtime = Seq2SeqTranslationRuntime(model_dir, **options)
