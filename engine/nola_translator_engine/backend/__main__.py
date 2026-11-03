"""Backend control-process entry point.

Electron's supervisor spawns `python -m nola_translator_engine.backend` with
NOLA_BACKEND_CONTROL_TOKEN / NOLA_BACKEND_INSTANCE_ID / port injected through
the private environment channel. Single uvicorn worker only: the SessionManager,
reducer and slot are in-process state, so a second worker would fork them.

The ready frame on stdout carries only address/instance/protocol version; the
control token must never be printed.
"""

from __future__ import annotations

import json
import os
import socket
import sys

from .contracts import SCHEMA_VERSION


def main() -> int:
    import uvicorn

    from .app import INSTANCE_ID_ENV, create_app
    from uuid import uuid4

    instance_id = os.environ.get(INSTANCE_ID_ENV) or str(uuid4())
    # The real control process owns the unified model gateway (M02); it probes
    # devices and can start a local model worker on demand.
    app = create_app(instance_id=instance_id, enable_gateway=True)
    # Emit the ready frame once the server is up; uvicorn logs go to stderr
    # so stdout stays a clean single-line protocol channel. The frame carries
    # only address/instance/protocol version, never the control token.
    class _ReadyPrinter(uvicorn.Server):
        async def startup(self, sockets=None):
            await super().startup(sockets)
            if self.started:
                ready = {
                    "type": "ready", "address": f"127.0.0.1:{port}",
                    "instance_id": instance_id, "protocol_version": SCHEMA_VERSION,
                }
                print(json.dumps(ready), file=sys.stdout, flush=True)

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", int(os.environ.get("NOLA_BACKEND_PORT") or 0)))
        port = listener.getsockname()[1]
        config = uvicorn.Config(
            app, host="127.0.0.1", port=port, workers=1,
            log_level=os.environ.get("NOLA_BACKEND_LOG_LEVEL", "warning"), access_log=False,
        )
        server = _ReadyPrinter(config)
        server.run(sockets=[listener])
        return 0 if server.started else 1


if __name__ == "__main__":
    raise SystemExit(main())
