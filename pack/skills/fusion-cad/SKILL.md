---
name: fusion-cad
description: Model, edit, check and export CAD in Autodesk Fusion through the local AnorBridge add-in, or hand a design task to Adam (the adam MCP server). Use for "open the model", "change the part", "export STEP", "check interference", "build the assembly", "render the CAD", ANOR drawing and model work.
---

# Fusion CAD

Fusion is the CAD tool of record. It has no headless mode: its Python API (`adsk.core`, `adsk.fusion`) runs only inside the running app. The AnorBridge add-in exposes it on the loopback port so the harness can run scripts in it.

## Tools
The `fusion` MCP server gives these as native tools in laurelin-agent and Claude Code. Use them first:
- `fusion_status`: version, active and open documents, units, component and body counts. Call it first.
- `fusion_parameters`, `fusion_set_parameter(name, expression)`: read and change user parameters; the set takes a checkpoint F3D first and refuses protected documents.
- `fusion_exec(code, edits)`: Python inside Fusion with `app` and `design` predefined; `edits=true` takes a checkpoint first.
- `fusion_check_interference`, `fusion_screenshot`: verify, and look at the model before claiming a change is right.
- `fusion_export(format)`: STEP, F3D, STL or IGES, always a new timestamped file.
Fallback when the server is not loaded:
- `bin/fusion-bridge health`: is Fusion up and which document is open. Run this first.
- `bin/fusion-bridge run <script.py>`: run a Fusion API script. Put scripts in the task's working folder, never in the vault.
- `bin/fusion-bridge exec "<python>"`: one short snippet (read a parameter, list components).
- **Adam** (MCP server `adam`, https://adam.new/mcp): mechanical design and CAD generation as a hosted task. Use it for a new part or a design study; follow its server instructions (pass the direct work as the prompt, poll the task, show 3D files only when asked). Adam runs on credits; when it reports none, use Fusion.
- `jacobian` MCP server: exact computation and independent checks for dimensions, tolerances and derived figures.
- `laurelin-reactor-calcs` skill: any reactor-physics number. Never do that algebra inline.

## Steps
1. `health`. If Fusion is not reachable, say so and stop; do not start Fusion yourself.
2. Confirm the document identity against the one the task names before any edit. The protected originals and the working document IDs are in Joe's memory notes and the vault CAD notes; read them, do not guess.
3. Before an edit: export a checkpoint (F3D) of the current state.
4. Make the change in one script. Known API traps: pipe section size is `createByReal` in centimetres; `rootComponent.name` is read-only; a coil has no primitive (sweep a helix spline); `ui.messageBox` blocks the bridge, never call it; each build may open a new untitled document, close it after export.
5. Verify: interference check and a health check through the API, and read back the changed parameters.
6. Export additively (STEP, F3D, PNG) into the task's output folder. Never overwrite an earlier export.
7. Record what changed, the checks and the export paths in the work log. Claim done only with the export files and the check output as evidence.

## Authority and limits
- Joe gave standing authority for ANOR II model fixes through the bridge; for any other document, or deleting geometry, ask first.
- Never touch a protected original. Drawings that are NDA-gated stay out of synced cards and public files.
- Drawings from Fusion are PDF only and need a hub; DXF comes only from sketches.
