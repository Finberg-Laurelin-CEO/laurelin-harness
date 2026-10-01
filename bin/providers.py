#!/usr/bin/env python3
"""Model providers for laurelin-agent.

  laurelin-agent providers                  which providers are ready (key present), and how many models each has
  laurelin-agent providers add NAME         add or refresh a preset (cheaperinference, venice)
  laurelin-agent providers add NAME --base-url URL --key-env VAR [--api openai-completions]
                                            any OpenAI-compatible service: lists its models with the key and
                                            writes the provider into ~/.laurelin/agent/models.json

Keys live in the key store (laurelin-agent keys add VAR). models.json holds only the variable's name,
never the key. Built-in providers (openrouter, amazon-bedrock, anthropic, openai, ...) need only their key.
"""
import json, os, shutil, subprocess, sys, time, urllib.error, urllib.request

AGENT_DIR = os.environ.get("LAURELIN_CODING_AGENT_DIR") or os.path.expanduser("~/.laurelin/agent")
MODELS = os.path.join(AGENT_DIR, "models.json")

PRESETS = {
    "cheaperinference": {"baseUrl": "https://api.cheaperinference.com/v1", "keyEnv": "CHEAPER_INFERENCE_API_KEY"},
    "venice": {"baseUrl": "https://api.venice.ai/api/v1", "keyEnv": "VENICE_API_KEY"},
}
# Built-in providers and the variables each reads (Prime's providers.md).
BUILTIN = {
    "openrouter": ["OPENROUTER_API_KEY"],
    "amazon-bedrock": ["AWS_PROFILE", "AWS_ACCESS_KEY_ID", "AWS_BEARER_TOKEN_BEDROCK"],
    "openai": ["OPENAI_API_KEY"],
    "vercel-ai-gateway": ["AI_GATEWAY_API_KEY"],
}


def load() -> dict:
    try:
        with open(MODELS) as f:
            return json.load(f)
    except FileNotFoundError:
        return {"providers": {}}


def save(d: dict) -> None:
    os.makedirs(AGENT_DIR, exist_ok=True)
    if os.path.exists(MODELS):
        shutil.copy2(MODELS, f"{MODELS}.bak-{time.strftime('%Y%m%d-%H%M%S')}")
    tmp = MODELS + ".tmp"
    with open(tmp, "w") as f:
        json.dump(d, f, indent=2)
        f.write("\n")
    os.replace(tmp, MODELS)


def is_env_name(ref: str) -> bool:
    return bool(ref) and ref.replace("_", "").isalnum() and ref.upper() == ref and not ref.isdigit()


def resolve_key(ref: str) -> str:
    if not ref:
        return ""
    if ref.startswith("!"):
        try:
            return subprocess.run(ref[1:], shell=True, capture_output=True, text=True, timeout=10).stdout.strip()
        except Exception:
            return ""
    if is_env_name(ref):
        return os.environ.get(ref, "")
    return ref  # a literal value


def status() -> int:
    d = load()
    provs = d.get("providers", {})
    print(f"{'provider':20} {'models':>8}  ready  key")
    for name, p in sorted(provs.items()):
        ref = p.get("apiKey", "")
        shown = ref if (is_env_name(ref) or ref.startswith("!")) else "(literal value)"
        print(f"{name:20} {len(p.get('models', [])):>8}  {'yes' if resolve_key(ref) else 'NO ':5}  {shown}")
    for name, names in BUILTIN.items():
        if name in provs:
            continue
        ready = any(os.environ.get(v) for v in names)
        print(f"{name:20} {'built-in':>8}  {'yes' if ready else 'NO ':5}  {' or '.join(names)}")
    for name, pre in PRESETS.items():
        if name not in provs:
            has = "key" if os.environ.get(pre["keyEnv"]) else "NO "
            print(f"{name:20} {'-':>8}  {has:5}  {pre['keyEnv']}  (then: laurelin-agent providers add {name})")
    return 0


def per_million(v) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return 0.0
    return round(x * 1_000_000, 4) if 0 < x < 0.01 else x  # per-token prices become per-million


def to_model(m: dict) -> dict:
    mid = m["id"]
    caps_raw = m.get("capabilities") or m.get("features") or []
    caps = (" ".join(map(str, caps_raw)) if isinstance(caps_raw, list) else json.dumps(caps_raw)).lower()
    pricing = m.get("pricing") or {}
    ctx = (
        m.get("context_length")
        or m.get("context_window")
        or m.get("contextWindow")
        or (m.get("top_provider") or {}).get("context_length")
        or 128000
    )
    return {
        "id": mid,
        "name": m.get("name") or mid,
        "reasoning": "reason" in caps or bool(m.get("reasoning")),
        "input": ["text", "image"] if ("vision" in caps or "image" in caps) else ["text"],
        "contextWindow": int(ctx),
        "maxTokens": int(m.get("max_output_tokens") or m.get("max_tokens") or 16384),
        "cost": {
            "input": per_million(pricing.get("input") or pricing.get("prompt")),
            "output": per_million(pricing.get("output") or pricing.get("completion")),
            "cacheRead": 0,
            "cacheWrite": 0,
        },
    }


def fetch_models(base: str, key: str) -> list:
    req = urllib.request.Request(
        base.rstrip("/") + "/models",
        headers={"Authorization": f"Bearer {key}", "x-api-key": key, "User-Agent": "laurelin-agent"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.load(r)
    items = body.get("data", body.get("models", [])) if isinstance(body, dict) else body
    return [to_model(m) for m in items if isinstance(m, dict) and m.get("id")]


def add(argv: list) -> int:
    if not argv:
        print("usage: providers add NAME [--base-url URL --key-env VAR --api openai-completions]", file=sys.stderr)
        return 2
    name, rest = argv[0], argv[1:]
    opts = dict(PRESETS.get(name, {}))
    opts.setdefault("api", "openai-completions")
    it = iter(rest)
    for a in it:
        if a == "--base-url":
            opts["baseUrl"] = next(it, "")
        elif a == "--key-env":
            opts["keyEnv"] = next(it, "")
        elif a == "--api":
            opts["api"] = next(it, "openai-completions")
    if not opts.get("baseUrl") or not opts.get("keyEnv"):
        print(f"{name}: not a preset; give --base-url and --key-env", file=sys.stderr)
        return 2
    d = load()
    existing = d.get("providers", {}).get(name, {})
    # Keep a working key reference that is already there (Venice reads its key from a file with "!...").
    key_ref = existing.get("apiKey") if resolve_key(existing.get("apiKey", "")) else opts["keyEnv"]
    key = resolve_key(key_ref)
    if not key:
        print(f"{name}: no key. Run:  laurelin-agent keys add {opts['keyEnv']}   then run this again.", file=sys.stderr)
        return 1
    try:
        models = fetch_models(opts["baseUrl"], key)
    except urllib.error.HTTPError as e:
        print(f"{name}: the model list failed: HTTP {e.code} {e.read()[:200].decode(errors='replace')}", file=sys.stderr)
        return 1
    except Exception as e:  # network, bad JSON
        print(f"{name}: the model list failed: {e}", file=sys.stderr)
        return 1
    if not models:
        print(f"{name}: the service listed no models", file=sys.stderr)
        return 1
    # Keep hand-tuned entries (compat flags, prices) for models that are still listed.
    old = {m.get("id"): m for m in existing.get("models", [])}
    merged = [old.get(m["id"], m) for m in models]
    d.setdefault("providers", {})[name] = {
        **{k: v for k, v in existing.items() if k != "models"},
        "baseUrl": opts["baseUrl"],
        "api": existing.get("api", opts["api"]),
        "apiKey": key_ref,
        "authHeader": True,
        "models": merged,
    }
    save(d)
    print(f"{name}: {len(merged)} models in {MODELS}.")
    print(f"Use one with:  laurelin-agent --provider {name} --model {merged[0]['id']}   (or /model in a session)")
    return 0


def main() -> int:
    args = sys.argv[1:]
    if not args or args[0] in ("list", "status"):
        return status()
    if args[0] in ("add", "refresh"):
        return add(args[1:])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
