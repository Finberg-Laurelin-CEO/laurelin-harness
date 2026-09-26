"""Fusion MCP server: Autodesk Fusion as native tools for any agent (laurelin-agent, Claude Code, Hermes).

Runs over stdio. Each tool sends a small Python program to the AnorBridge add-in inside the
running Fusion (loopback 127.0.0.1:27300, token from ~/.anor_bridge_token, never returned).
Exports are additive: every file gets a timestamp and nothing is overwritten.
Guardrails from Joe's CAD notes: checkpoint before an edit, no message boxes, never touch a
protected original (set FUSION_PROTECTED to a comma list of document names to refuse edits on).
"""
import json, os, time, urllib.request
from mcp.server.mcpserver import MCPServer

URL = os.environ.get("FUSION_BRIDGE_URL", "http://127.0.0.1:27300")
OUT = os.path.expanduser(os.environ.get("FUSION_OUT_DIR", "~/.laurelin/fusion-out"))
PROTECTED = [x.strip() for x in os.environ.get("FUSION_PROTECTED", "").split(",") if x.strip()]

mcp = MCPServer("fusion", instructions=(
    "Autodesk Fusion through the local AnorBridge. Call fusion_status first. Edits (fusion_set_parameter, "
    "fusion_exec that changes geometry) take a checkpoint F3D automatically. Never call ui.messageBox in code: it blocks Fusion. "
    "Units in the API are centimetres. Verify with fusion_check_interference and fusion_screenshot before claiming done."))

def _bridge(code: str, timeout: int = 600) -> dict:
    tok = open(os.path.expanduser("~/.anor_bridge_token")).read().strip()
    req = urllib.request.Request(URL + "/exec", data=json.dumps({"token": tok, "code": code}).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        r = json.load(urllib.request.urlopen(req, timeout=timeout))
    except OSError as e:
        raise RuntimeError(f"Fusion is not reachable on {URL} ({e}). Open Fusion; the AnorBridge add-in starts with it.")
    if not r.get("ok"):
        raise RuntimeError(str(r.get("error") or r)[:2000])
    return r

def _json(code: str):
    out = _bridge(code).get("stdout", "").strip().splitlines()
    return json.loads(out[-1]) if out else None

PRE = "import adsk.core, adsk.fusion, json\napp=adsk.core.Application.get()\ndesign=adsk.fusion.Design.cast(app.activeProduct)\n"

def _stamp(name: str, ext: str) -> str:
    os.makedirs(OUT, exist_ok=True)
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in name)[:60]
    return os.path.join(OUT, f"{safe}-{time.strftime('%Y%m%d-%H%M%S')}.{ext}")

def _active_name() -> str:
    return _json(PRE + "print(json.dumps(app.activeDocument.name if app.activeDocument else ''))") or ""

def _guard_edit():
    name = _active_name()
    for p in PROTECTED:
        if p and p in name:
            raise RuntimeError(f"'{name}' is a protected document; edits are refused. Open the working copy.")
    return name

@mcp.tool()
def fusion_status() -> dict:
    """Fusion version, the active document, all open documents, units, and counts of components and bodies."""
    return _json(PRE + """
docs=[app.documents.item(i).name for i in range(app.documents.count)]
d={'version':app.version,'active':app.activeDocument.name if app.activeDocument else None,'open':docs}
if design:
    r=design.rootComponent
    d.update(units=design.unitsManager.defaultLengthUnits, components=design.allComponents.count,
             bodies=sum(c.bRepBodies.count for c in design.allComponents), user_parameters=design.userParameters.count)
print(json.dumps(d))""")

@mcp.tool()
def fusion_parameters() -> list:
    """The active design's user parameters: name, expression, value and unit."""
    return _json(PRE + """
ps=design.userParameters
print(json.dumps([{'name':p.name,'expression':p.expression,'value':p.value,'unit':p.unit,'comment':p.comment} for p in (ps.item(i) for i in range(ps.count))]))""")

@mcp.tool()
def fusion_export(format: str = "step", name: str = "") -> dict:
    """Export the active design additively (step, f3d, stl or iges) to a new timestamped file. Returns the path."""
    fmt = format.lower()
    path = _stamp(name or _active_name() or "fusion", {"step": "step", "f3d": "f3d", "stl": "stl", "iges": "igs"}[fmt])
    opt = {"step": "createSTEPExportOptions", "f3d": "createFusionArchiveExportOptions",
           "stl": "createSTLExportOptions", "iges": "createIGESExportOptions"}[fmt]
    arg = "(p, design.rootComponent)" if fmt == "stl" else "(p)"
    _bridge(PRE + f"p={json.dumps(path)}\nem=design.exportManager\nem.execute(em.{opt}{arg})\nprint('ok')")
    return {"path": path, "bytes": os.path.getsize(path) if os.path.exists(path) else None}

@mcp.tool()
def fusion_set_parameter(name: str, expression: str) -> dict:
    """Set a user parameter's expression (for example '44 mm'). Takes a checkpoint F3D first; refuses protected documents."""
    doc = _guard_edit()
    ckpt = fusion_export("f3d", f"checkpoint-{doc}")
    r = _json(PRE + f"""
p=design.userParameters.itemByName({json.dumps(name)})
if p is None: raise Exception('no user parameter named ' + {json.dumps(name)})
old=p.expression; p.expression={json.dumps(expression)}
print(json.dumps({{'name':p.name,'old':old,'new':p.expression,'value':p.value,'unit':p.unit}}))""")
    r["checkpoint"] = ckpt["path"]
    return r

@mcp.tool()
def fusion_check_interference() -> dict:
    """Interference check across all solid bodies in the active design. Returns the count and the body pairs."""
    return _json(PRE + """
bodies=adsk.core.ObjectCollection.create()
for c in design.allComponents:
    for b in c.bRepBodies:
        if b.isSolid: bodies.add(b)
res=design.analyzeInterference(design.createInterferenceInput(bodies))
pairs=[{'a':res.item(i).entityOne.name,'b':res.item(i).entityTwo.name,'volume_cm3':res.item(i).interferenceBody.volume} for i in range(res.count)]
print(json.dumps({'bodies':bodies.count,'interferences':res.count,'pairs':pairs[:50]}))""")

@mcp.tool()
def fusion_screenshot(name: str = "", width: int = 1600, height: int = 1000) -> dict:
    """Save the current viewport as a PNG (additive). Use it to look at the model before claiming a change is right."""
    path = _stamp(name or "viewport", "png")
    _bridge(PRE + f"app.activeViewport.saveAsImageFile({json.dumps(path)}, {int(width)}, {int(height)})\nprint('ok')")
    return {"path": path}

@mcp.tool()
def fusion_exec(code: str, edits: bool = False) -> dict:
    """Run Python inside Fusion (adsk.core, adsk.fusion; `app` and `design` are predefined). Print results.
    Set edits=true when the code changes geometry: a checkpoint F3D is taken first and protected documents are refused.
    Never call ui.messageBox."""
    ckpt = None
    if edits:
        doc = _guard_edit()
        ckpt = fusion_export("f3d", f"checkpoint-{doc}")["path"]
    r = _bridge(PRE + code)
    return {"stdout": r.get("stdout", ""), "value": r.get("value"), "checkpoint": ckpt, "seconds": r.get("seconds")}

if __name__ == "__main__":
    mcp.run("stdio")
