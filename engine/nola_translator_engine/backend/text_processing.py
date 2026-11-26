"""Desktop text processing, shared by preview, direct and realtime translation."""

import asyncio
import itertools
import json
import math
import os
import re
import string
import subprocess
import sys
import unicodedata
from collections import Counter
from functools import cache, lru_cache
from pathlib import Path

PREPROCESSING = (
    "normalize", "controls", "breaks", "lines", "tags", "braces", "quotes", "shift-jis",
    "ascii-punctuation", "digits", "letters", "replace", "repeat-chars", "repeat-block",
    "repeat-segments", "repeat-suffix", "repeat-prefix", "python-pre",
)
HOOK_ONLY = frozenset(name for name in PREPROCESSING if name.startswith("repeat-"))
EMBEDDED_PREPROCESSING = frozenset(("normalize", "breaks", "tags", "braces", "replace", "python-pre"))
OUTPUT_STAGES = ("replace-after", "python-optimize", "arabic")
MAX_TEXT = 64_000
MAX_CONFIG = 8 * 1024 * 1024
_realtime_issues = {}


def report_realtime(document, issues):
    for issue in issues:
        key = (document.get("revision", 0), issue["feature"], issue["reason"])
        if len(_realtime_issues) < 64:
            _realtime_issues[key] = issue


def take_realtime_issues():
    issues = list(_realtime_issues.values())
    _realtime_issues.clear()
    return issues


@lru_cache(maxsize=2)
def _read_document(path, _mtime, _size):
    document = json.loads(Path(path).read_bytes())
    if not isinstance(document, dict) or not isinstance(document.get("values"), dict):
        return {}
    return document


def current_document():
    path = os.environ.get("NOLA_TEXT_PROCESSING_PATH")
    try:
        if path:
            info = os.stat(path)
            if info.st_size <= MAX_CONFIG:
                return _read_document(path, info.st_mtime_ns, info.st_size)
    except (OSError, ValueError):
        pass
    return {}


def scene_enabled(document, scene):
    return document.get("values", {}).get(f"scene:{scene}", True)


def has_input_filters(document, source, target):
    return bool(_features(document, "input", "text", source, target))


def _unescape(text):
    return re.sub(r"\\([nrt\\])", lambda m: {"n": "\n", "r": "\r", "t": "\t", "\\": "\\"}[m[1]], text)


def _expand(match, template):
    def replace(token):
        key = token["dollar"]
        if key is None:
            group = token["name"] or token["python"]
            if group == "\\":
                return "\\"
            return match[group if not group.isdigit() else int(group)] or ""
        if key == "$":
            return "$"
        if key == "&":
            return match[0]
        if key == chr(96):
            return match.string[:match.start()]
        if key == "'":
            return match.string[match.end():]
        try:
            return match[int(key) if key.isdigit() else key[1:-1]] or ""
        except IndexError:
            if len(key) == 2 and key.isdigit() and 0 < int(key[0]) <= match.re.groups:
                return (match[int(key[0])] or "") + key[1]
            return token[0]
    return re.sub(
        r"\$(?P<dollar>[$&'\x60]|[1-9][0-9]?|<\w+>)|\\(?:g<(?P<name>\w+)>|(?P<python>[1-9][0-9]?|\\))",
        replace,
        template,
    )


def _replace(text, rule):
    pattern, replacement = rule["pattern"], rule["replacement"]
    if not pattern:
        return text
    flags = "" if rule["caseSensitive"] else "i"
    inline = None if rule["regex"] else re.fullmatch(r"/(.*)/([gimsuvy]*)", pattern)
    regex = rule["regex"] or inline is not None
    if inline:
        pattern, flags = inline.groups()
    if rule["escape"]:
        pattern, replacement = _unescape(pattern), _unescape(replacement)
    if not regex:
        pattern = re.escape(pattern)
    if rule["wholeWord"] and not inline:
        pattern = rf"\b(?:{pattern})\b"
    if len(set(flags)) != len(flags) or "v" in flags:
        raise ValueError("regex flags")
    pattern = re.sub(r"\(\?<([a-zA-Z_]\w*)>", r"(?P<\1>", pattern)
    pattern = re.sub(r"\\k<([a-zA-Z_]\w*)>", r"(?P=\1)", pattern)
    expression = re.compile(pattern, (re.I if "i" in flags else 0) |
                            (re.M if "m" in flags else 0) | (re.S if "s" in flags else 0))
    parts, end, output_length = [], 0, 0
    for match in expression.finditer(text):
        if "y" in flags and match.start() != end:
            break
        gap = text[end:match.start()]
        try:
            value = _expand(match, replacement) if regex else replacement
        except IndexError as error:
            raise ValueError("missing regex group") from error
        output_length += len(gap) + len(value)
        if output_length > MAX_TEXT:
            raise ValueError("text too long")
        parts.extend((gap, value))
        end = match.end()
    return "".join(parts) + text[end:]


def _repeat_chars(text, count, keep):
    runs = [(char, sum(1 for _ in group)) for char, group in itertools.groupby(text)]
    if count < 2:
        frequency = Counter(length for _, length in runs)
        highest = max(frequency.values())
        candidates = sorted(length for length, total in frequency.items() if total == highest)
        count = candidates[1] if candidates[:1] == [1] and len(candidates) > 1 else candidates[0]
    if not keep:
        return text[:len(text) // count * count:count]
    return "".join(char * (length // count + length % count) for char, length in runs)


def _repeat_block(text, count):
    if count >= 2:
        return text[:len(text) // count]
    position = (text + text).find(text, 1)
    return text[:position]


def _repeat_segments(text):
    parts = []
    while text:
        for size in range(len(text) // 2, 1, -1):
            part = text[:size]
            if text.startswith(part, size):
                offset = size * 2
                while text.startswith(part, offset):
                    offset += size
                parts.append(part)
                text = text[offset:]
                break
        else:
            parts.append(text[0])
            text = text[1:]
    return "".join(parts)


def _growing_prefix(text):
    parts, end = [], len(text)
    while end:
        for width in range((math.isqrt(8 * end + 1) - 1) // 2, 0, -1):
            start = end - width
            prefix = text[start:end]
            cursor = start
            for size in range(width - 1, 0, -1):
                if not text.startswith(prefix[:size], cursor - size):
                    break
                cursor -= size
            else:
                parts.append(prefix)
                end = cursor
                break
    return "".join(reversed(parts))


@cache
def _arabic_forms():
    forms = {}
    for point in itertools.chain(range(0xFB50, 0xFE00), range(0xFE70, 0xFEFF)):
        tag, *parts = unicodedata.decomposition(chr(point)).split() or [""]
        if tag in ("<isolated>", "<initial>", "<medial>", "<final>") and len(parts) == 1:
            forms.setdefault(chr(int(parts[0], 16)), {})[tag[1:-1]] = chr(point)
    return forms


def _arabic(text):
    forms = _arabic_forms()
    letters = [index for index, char in enumerate(text) if not unicodedata.category(char).startswith("M")]
    result = list(text)
    for before, current, after in zip([None, *letters], letters, [*letters[1:], None]):
        choices = forms.get(text[current])
        if not choices:
            continue
        joins_before = before is not None and "final" in choices and "initial" in forms.get(text[before], {})
        joins_after = after is not None and "initial" in choices and "final" in forms.get(text[after], {})
        form = ("medial" if joins_after else "final") if joins_before else ("initial" if joins_after else "isolated")
        result[current] = choices.get(form, text[current])
    return "".join(result)


def _preprocess(feature, text, options, source):
    if feature == "normalize":
        return unicodedata.normalize(options.get("form", "NFKC"), text)
    if feature == "controls":
        return re.sub(r"[\x00-\x09\x0b-\x0c\x0e-\x1f\x7f-\xa0]", "", text)
    if feature == "breaks":
        return ("" if (source or "").split("-")[0] in {"zh", "ja", "th"} else " ").join(filter(None, text.splitlines()))
    if feature == "lines":
        lines = text.splitlines()
        count = max(1, int(options.get("count", "1")))
        return "\n".join(lines[-count:] if options.get("keepEnd", True) else lines[:count]) if len(lines) > count else text
    if feature == "tags":
        return re.sub(r"<.*?>", "", text)
    if feature == "braces":
        text = re.sub(r"\{(\w+).*?\}(.*?)\{/\1\}", r"\2", text)
        text = re.sub(r"\{([^}]*?)[:/].*?\}", r"\1", text)
        return re.sub(r"\{.*?\}", "", text)
    if feature == "quotes":
        return "".join(re.findall("「[^」]*」", text)) or text
    if feature == "shift-jis":
        return text.encode("shift_jis", "ignore").decode("shift_jis")
    if feature in ("ascii-punctuation", "digits", "letters"):
        unwanted = {"ascii-punctuation": string.punctuation, "digits": string.digits, "letters": string.ascii_letters}
        return text.translate(str.maketrans("", "", unwanted[feature]))
    if feature == "repeat-chars":
        return _repeat_chars(text, int(options.get("count", "1")), options.get("keepSingle", True))
    if feature == "repeat-block":
        return _repeat_block(text, int(options.get("count", "1")))
    if feature == "repeat-segments":
        return _repeat_segments(text)
    if feature == "repeat-prefix":
        return _growing_prefix(text)
    if feature == "repeat-suffix":
        return _growing_prefix(text[::-1])[::-1]
    return text


def _script(code, feature, phase, text, context):
    from contextlib import redirect_stdout

    scope = {"__name__": "__nola_text_processing__"}
    with open(os.devnull, "w") as output, redirect_stdout(output):
        exec(compile(code, f"<{feature}>", "exec"), scope)
        if feature == "python-pre":
            return scope["POSTSOLVE"](text), context
        processor = scope["Process"]()
        if phase == "input":
            text, context = processor.process_before(text)
            return text, {"value": context, "state": vars(processor) if hasattr(processor, "__dict__") else {}}
        if context is None:
            return text, context
        if hasattr(processor, "__dict__"):
            vars(processor).update(context["state"])
        return processor.process_after(text, context["value"]), None


def _features(document, phase, kind, source, target):
    values = document.get("values", {})
    enabled = values.get("enabled", {})
    rank = [name for name in values.get("rank", []) if name in PREPROCESSING]
    preprocessing = tuple(dict.fromkeys([*rank, *PREPROCESSING]))
    stages = preprocessing if phase == "preview" else (
        (*preprocessing, "replace-before", "python-optimize", "skip-punctuation")
        if phase == "input" else OUTPUT_STAGES
    )
    if kind == "embedded" and phase == "input":
        stages = tuple(name for name in stages if name in EMBEDDED_PREPROCESSING or name == "skip-punctuation")
    return [name for name in stages if enabled.get(name) and (
        name not in HOOK_ONLY or kind in {"hook", "embedded", "preview"}
    ) and (name != "arabic" or (target or "").split("-")[0] == "ar")
      and (not name.startswith("python-") or values.get(f"script:{name}"))]


def _rules(values, feature):
    tables = values.get(f"tables:{feature}", [])
    return itertools.chain.from_iterable(table["rules"] for table in tables)


def _apply(document, phase, text, source=None, target=None, kind="text", context=None, *, isolate=False):
    issues = []
    result = {"text": text, "skip": False, "context": context, "issues": issues}
    values = document.get("values", {})
    for feature in _features(document, phase, kind, source, target):
        if not text:
            break
        options = values.get(f"options:{feature}", {})
        before, prior_context = text, context
        try:
            if feature in {"replace", "replace-before", "replace-after"}:
                for rule in _rules(values, feature):
                    try:
                        text = _replace(text, rule)
                    except (ValueError, re.error):
                        issue = {"feature": feature, "reason": "regex"}
                        if issue not in issues:
                            issues.append(issue)
                    if len(text) > MAX_TEXT:
                        raise ValueError("text too long")
            elif feature in {"python-pre", "python-optimize"}:
                code = values.get(f"script:{feature}")
                if code and isolate:
                    text, context = _script(code, feature, "input" if phase == "preview" else phase, text, context)
                    # shortcut: Hooks exchange JSON state, use a per-request worker if scripts need live Python objects.
                    if len(json.dumps(context)) > MAX_TEXT:
                        raise ValueError("context too long")
            elif feature == "skip-punctuation":
                if all(char.isspace() or unicodedata.category(char).startswith("P") for char in text):
                    result["skip"] = True
                    break
            elif feature == "arabic":
                text = _arabic(text)
            else:
                text = _preprocess(feature, text, options, source)
            if not isinstance(text, str) or len(text) > MAX_TEXT:
                raise ValueError("invalid result")
        except (Exception, SystemExit):
            text, context = before, prior_context
            issues.append({"feature": feature, "reason": "script" if feature.startswith("python") else "processing"})
    result.update(text=text, context=context, skip=result["skip"] or (phase != "output" and not text.strip()))
    return result


async def apply(document, phase, text, source=None, target=None, kind="text", context=None):
    if phase == "preview":
        kind = "preview"
    args = (document, phase, text, source, target, kind, context)
    features = _features(document, phase, kind, source, target)
    values = document.get("values", {})
    isolated = [name for name in features if name.startswith("python-") or name in {"repeat-segments", "repeat-suffix", "repeat-prefix"}
                or (name.startswith("replace") and any(rule["pattern"] for rule in _rules(values, name)))]
    if not isolated:
        return _apply(*args)
    env = {key: os.environ[key] for key in ("SystemRoot", "WINDIR", "TEMP", "TMP", "PATH") if key in os.environ}
    process = None
    try:
        process = await asyncio.create_subprocess_exec(
            sys.executable, "-I", "-X", "utf8", str(Path(__file__).resolve()),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, env=env,
            **({"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}),
        )
        output, _ = await asyncio.wait_for(process.communicate(json.dumps(args).encode()), 4)
        result = json.loads(output)
        if process.returncode == 0 and isinstance(result.get("text"), str):
            return result
    except (OSError, TimeoutError, ValueError, AttributeError):
        pass
    finally:
        if process is not None and process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
            await process.wait()
    safe = {**document, "values": {**document.get("values", {}), "enabled": {
        **document.get("values", {}).get("enabled", {}), **dict.fromkeys(isolated, False),
    }}}
    result = _apply(safe, phase, text, source, target, kind, context)
    result["issues"].append({"feature": ", ".join(isolated), "reason": "worker"})
    return result


if __name__ == "__main__":
    print(json.dumps(_apply(*json.load(sys.stdin), isolate=True)))
