"""Export the desktop engine's built-in model metadata for the website demo."""

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'engine'))

from nola_translator_engine.resources import RESOURCE_DEFINITIONS


def main() -> None:
    records = []
    for model in RESOURCE_DEFINITIONS:
        record = {
            'resourceId': model.resource_id,
            'kind': model.kind,
            'provider': model.provider,
            'name': model.name,
            'description': model.description,
            'languages': sorted(model.languages),
        }
        if model.download_bytes is not None:
            record['downloadBytes'] = model.download_bytes
        records.append('  ' + json.dumps(record, ensure_ascii=False))
    (ROOT / 'docs/media-src/demo-catalog.json').write_text(
        '[\n' + ',\n'.join(records) + '\n]\n', encoding='utf-8', newline='\n',
    )


if __name__ == '__main__':
    main()
