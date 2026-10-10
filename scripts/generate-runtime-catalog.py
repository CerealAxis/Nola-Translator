"""Resolve the approved Windows cp312 combinations against official release metadata.

Sources: pytorch.org/get-started/previous-versions, download.pytorch.org/whl,
PyPI wheel metadata, and ggml-org/llama.cpp release b11532. No binaries are downloaded.
"""
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
import hashlib
import html
import json
from pathlib import Path
import re
from urllib.parse import unquote, urljoin, urldefrag
from urllib.request import Request, urlopen


ROWS = [
    (v, ['cu132', 'cu130', 'cu126', 'xpu', 'cpu'], '0.0.35', ['cu130', 'cu126'])
    for v in ['2.14.1', '2.14.0', '2.13.0', '2.12.1', '2.12.0']
] + [
    ('2.11.0', ['cu130', 'cu128', 'cu126', 'xpu', 'cpu'], '0.0.35', ['cu130', 'cu128', 'cu126']),
    ('2.10.0', ['cu130', 'cu128', 'cu126', 'xpu', 'cpu'], '0.0.35', ['cu130', 'cu128', 'cu126']),
    ('2.9.1', ['cu130', 'cu128', 'cu126', 'xpu', 'cpu'], '0.0.33.post2', ['cu130', 'cu128', 'cu126']),
    ('2.9.0', ['cu130', 'cu128', 'cu126', 'cu129', 'xpu', 'cpu'], '0.0.33', ['cu130', 'cu128', 'cu126']),
    ('2.8.0', ['cu129', 'cu128', 'cu126', 'xpu', 'cpu'], '0.0.32.post2', ['cu129', 'cu128', 'cu126']),
    ('2.7.1', ['cu128', 'cu126', 'cu118', 'xpu', 'cpu'], '0.0.31.post1', ['cu128', 'cu126']),
    ('2.7.0', ['cu128', 'cu126', 'cu118', 'xpu', 'cpu'], '0.0.30', ['cu128', 'cu126']),
    ('2.6.0', ['cu126', 'cu124', 'cu118', 'xpu', 'cpu'], '0.0.29.post3', ['cu126', 'cu124']),
    ('2.5.1', ['cu124', 'cu121', 'cu118', 'cpu'], '0.0.28.post3', ['cu124']),
    ('2.5.0', ['cu124', 'cu121', 'cu118', 'cpu'], '0.0.28.post2', ['cu124']),
    ('2.4.1', ['cu124', 'cu121', 'cu118', 'cpu'], '0.0.28.post1', ['cu124']),
    ('2.4.0', ['cu121', 'cu118', 'cu124', 'cpu'], '0.0.27.post2', ['cu121', 'cu118']),
    ('2.3.1', ['cu121', 'cu118', 'cpu'], '0.0.27', ['cu121', 'cu118']),
]


def get(url):
    return urlopen(Request(url, headers={'User-Agent': 'Nola-runtime-catalog'}), timeout=60)


@lru_cache(None)
def index(backend, package):
    url = f'https://download.pytorch.org/whl/{backend}/{package}/'
    with get(url) as response:
        return [urljoin(url, html.unescape(href)) for href in
                re.findall(r'<a href="([^"]+)"', response.read().decode())]


def wheel(backend, package, version):
    candidates = [u for u in index(backend, package)
                  if unquote(u.rsplit('/', 1)[-1]).startswith(f'{package}-{version}-')
                  or unquote(u.rsplit('/', 1)[-1]).startswith(f'{package}-{version}+{backend}-')]
    candidates = [u for u in candidates if 'win_amd64.whl' in u and
                  any(tag in u for tag in ['-cp312-cp312-', '-cp39-abi3-', '-py39-none-'])]
    if not candidates:
        raise ValueError(f'No Windows cp312 wheel: {package} {version} {backend}')
    url, fragment = urldefrag(candidates[0])
    with urlopen(Request(url, headers={'Range': 'bytes=0-0', 'User-Agent': 'Nola-runtime-catalog'}), timeout=60) as response:
        size = int(response.headers.get('Content-Range', '').rsplit('/', 1)[-1] or response.headers['Content-Length'])
    digest = fragment.removeprefix('sha256=')
    if not re.fullmatch(r'[a-f0-9]{64}', digest):
        # Some official index links omit the fragment; hash the actual artifact.
        hash_value = hashlib.sha256()
        with get(url) as response:
            for block in iter(lambda: response.read(1024 * 1024), b''):
                hash_value.update(block)
        digest = hash_value.hexdigest()
    return {'url': url, 'filename': unquote(url.rsplit('/', 1)[-1]),
            'sha256': digest, 'bytes': size}


def recipe(args):
    version, backend, xf = args
    torch_wheel = wheel(backend, 'torch', version)
    suffix = backend if backend != 'cpu' else 'cpu'
    label = f'CUDA {backend[2:-1]}.{backend[-1]}' if backend.startswith('cu') else 'Intel XPU' if backend == 'xpu' else 'CPU'
    result = {'id': f'torch-{version.replace(".", "-")}-{suffix}',
              'name': f'Torch {version} ({label})',
              'backend': 'cuda' if backend.startswith('cu') else backend,
              'pythonAbi': 'cp312-win_amd64', 'torchVersion': version,
              'indexUrl': f'https://download.pytorch.org/whl/{backend}',
              'wheel': torch_wheel, 'companions': [],
              'requirements': ['numpy==1.26.4', 'accelerate==1.15.0',
                               'bitsandbytes==0.45.5' if version == '2.3.1' else 'bitsandbytes==0.50.2',
                               'funasr==1.4.16', 'sentencepiece==0.2.1',
                               'transformers==4.46.3' if tuple(map(int, version.split('.'))) < (2, 5, 0) else 'transformers==5.17.0']}
    if xf:
        result['id'] += '-xf-' + xf.replace('.', '-')
        result['name'] += f' + xFormers {xf}'
        result['xformersVersion'] = xf
        result['companions'] = [wheel(backend, 'xformers', xf)]
    return result


def main():
    tasks = []
    for version, backends, xf, xf_backends in ROWS:
        for backend in backends:
            tasks.append((version, backend, None))
            if backend in xf_backends:
                tasks.append((version, backend, xf))
    with ThreadPoolExecutor(max_workers=8) as pool:
        recipes = list(pool.map(recipe, tasks))
    with get('https://pypi.org/pypi/torch-directml/0.2.4.dev240815/json') as response:
        directml = json.load(response)
    asset = next(f for f in directml['urls'] if '-cp312-cp312-win_amd64.whl' in f['filename'])
    direct = recipe(('2.3.1', 'cpu', None))
    direct.update(id='torch-2-3-1-directml', name='Torch 2.3.1 (DirectML)', backend='directml',
                  directmlVersion='0.2.4.dev240815', companions=[
                      dict(url=asset['url'], filename=asset['filename'], sha256=asset['digests']['sha256'], bytes=asset['size'])])
    recipes.append(direct)
    with get('https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/b11532') as response:
        assets = {a['name']: a for a in json.load(response)['assets']}
    def release_file(name):
        a = assets[name]
        return dict(url=a['browser_download_url'], sha256=a['digest'].removeprefix('sha256:'), bytes=a['size'])
    packages = []
    for backend, suffix, label in [('cpu', 'cpu', 'CPU'), ('cuda', 'cuda-12.4', 'CUDA 12.4'),
                                 ('cuda', 'cuda-13.4', 'CUDA 13.4'), ('vulkan', 'vulkan', 'Vulkan'),
                                 ('openvino', 'openvino-2026.4.1', 'OpenVINO 2026.4.1'),
                                 ('sycl', 'sycl', 'SYCL'), ('rocm', 'rocm-10.0', 'ROCm 10.0')]:
        p = dict(id=f'llama-b11532-{suffix.replace(".", "-")}', name=f'llama.cpp b11532 · Windows x64 ({label})',
                 kind='llama', backend=backend, version='b11532', architecture='x64',
                 **release_file(f'llama-b11532-bin-win-{suffix}-x64.zip'))
        if backend == 'cuda':
            p['companions'] = [release_file(f'cudart-llama-bin-win-{suffix}-x64.zip')]
        packages.append(p)
    root = Path(__file__).resolve().parents[1] / 'build'
    for filename, key, entries in [('runtime-recipes.json', 'recipes', recipes), ('runtime-catalog.json', 'packages', packages)]:
        (root / filename).write_text(json.dumps({'version': 1, key: entries}, indent=2) + '\n', encoding='utf-8')
    print(f'Resolved {len(recipes)} Torch combinations and {len(packages)} llama combinations')


if __name__ == '__main__':
    main()
