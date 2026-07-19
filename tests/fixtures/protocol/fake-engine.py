"""仅用于验证 Electron 子进程恢复逻辑的最小 JSONL 引擎。"""

import argparse
import json
import sys
import time
from pathlib import Path


parser = argparse.ArgumentParser()
parser.add_argument("--crash-once", type=Path)
parser.add_argument("--shutdown-marker", type=Path)
args = parser.parse_args()

if args.crash_once and not args.crash_once.exists():
    args.crash_once.write_text("1", encoding="utf-8")
    raise SystemExit(7)

for line in sys.stdin:
    command = json.loads(line)
    if command["type"] == "hello":
        event = {
            "protocolVersion": 1,
            "type": "ready",
            "requestId": command["requestId"],
            "engineVersion": "test",
            "capabilities": [],
        }
    elif command["type"] == "shutdown":
        event = {
            "protocolVersion": 1,
            "type": "shutdownComplete",
            "requestId": command["requestId"],
        }
    else:
        continue
    print(json.dumps(event, separators=(",", ":")), flush=True)
    if event["type"] == "shutdownComplete":
        if args.shutdown_marker:
            time.sleep(0.05)
            args.shutdown_marker.write_text("graceful", encoding="utf-8")
        break
