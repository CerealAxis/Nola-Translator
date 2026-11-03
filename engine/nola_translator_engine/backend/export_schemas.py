"""Export OpenAPI and WS frame JSON Schemas from the Pydantic contract models.

Doc 09 §11: Pydantic is the backend truth; the TypeScript boundary consumes
generated artifacts (or golden fixtures compared in CI) so Zod/Pydantic twins
cannot drift. Run:

    python -m nola_translator_engine.backend.export_schemas <out_dir>

Outputs:
  openapi.json          REST /api/v2 surface
  ws-events.schema.json event envelope + payload union
  ws-frames.schema.json client/server control frames
  golden/               round-trip fixtures for cross-language comparison
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .contracts import (
    AUDIO_HEADER_BYTES,
    AUDIO_HEADER_FORMAT,
    EventEnvelope,
    WsClientFrame,
    WsHelloAck,
    WsServerFrame,
)
from .app import create_app


def _ws_schema(adapter_type) -> dict:
    from pydantic import TypeAdapter

    return TypeAdapter(adapter_type).json_schema(
        ref_template="#/$defs/{model}"
    )


def export(out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    app = create_app(control_token="export-only")
    openapi_path = out_dir / "openapi.json"
    openapi_path.write_text(
        json.dumps(app.openapi(), indent=2, ensure_ascii=False), encoding="utf-8"
    )
    written.append(openapi_path)

    from pydantic import TypeAdapter

    events_path = out_dir / "ws-events.schema.json"
    events_path.write_text(
        json.dumps(
            {
                "$schema": "https://json-schema.org/draft/2020-12/schema",
                "description": "Session events WS: server-to-client envelopes",
                "envelope": EventEnvelope.model_json_schema(),
                "binary_audio_header": {
                    "struct_format": AUDIO_HEADER_FORMAT,
                    "header_bytes": AUDIO_HEADER_BYTES,
                    "byte_order": "little-endian",
                },
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    written.append(events_path)

    frames_path = out_dir / "ws-frames.schema.json"
    frames_path.write_text(
        json.dumps(
            {
                "$schema": "https://json-schema.org/draft/2020-12/schema",
                "description": "Control frames for input/audio/events WS",
                "client_frame": TypeAdapter(WsClientFrame).json_schema(),
                "server_frame": {
                    "oneOf_note": "WsServerFrame union incl. EventEnvelope; see ws-events.schema.json",
                    "hello_ack": WsHelloAck.model_json_schema(),
                },
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    written.append(frames_path)

    # Golden fixtures: fixed UUIDs, no secrets (doc 12 §2).
    golden_dir = out_dir / "golden"
    golden_dir.mkdir(exist_ok=True)
    from uuid import UUID

    fixed_uuid = UUID("11111111-2222-3333-4444-555555555555")
    envelope = EventEnvelope(
        server_instance_id="golden-instance",
        event_id=fixed_uuid,
        event_seq=42,
        event_type="source_committed",
        session_id=fixed_uuid,
        pipeline_id=fixed_uuid,
        epoch=1,
        emitted_at_unix_ms=1793450000000,
        trace_id="trace-golden",
        payload={
            "commit_id": "commit-golden",
            "segment_id": "seg-golden",
            "segment_index": 3,
            "utterance_id": "utt-golden",
            "source_revision": 6,
            "text": "Ice cream is very good.",
            "language": "en",
            "boundary_reason": "hard_silence",
            "cutoff_sample": 192000,
            "timing_quality": "segment",
            "quality_flags": [],
        },
    )
    (golden_dir / "source_committed.json").write_text(
        envelope.model_dump_json(indent=2), encoding="utf-8"
    )
    written.append(golden_dir / "source_committed.json")

    from .contracts import (
        AudioFrameHeader,
        pack_audio_frame,
    )

    header = AudioFrameHeader(
        kind=1, stream_handle=7, epoch=2, chunk_seq=10,
        sample_start=3200, sample_count=320, payload_bytes=640,
    )
    frame = pack_audio_frame(header, b"\x00\x01" * 320)
    (golden_dir / "audio_frame_input.bin").write_bytes(frame)
    (golden_dir / "audio_frame_input.json").write_text(
        json.dumps(
            {
                "note": "40-byte header + 640 payload bytes; little-endian",
                "header": header.model_dump(),
                "hex": frame.hex(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    written.append(golden_dir / "audio_frame_input.json")

    return written


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    for path in export(Path(sys.argv[1])):
        print("wrote", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
