"""FastAPI realtime backend package (schema_version 2).

Modules: contracts (wire truth), events (reducer/journal/fanout), sessions
(SessionManager + slot), api (REST/WS), app (factory + lifespan + auth).
"""

from .app import CONTROL_TOKEN_ENV, INSTANCE_ID_ENV, create_app

__all__ = ["create_app", "CONTROL_TOKEN_ENV", "INSTANCE_ID_ENV"]
