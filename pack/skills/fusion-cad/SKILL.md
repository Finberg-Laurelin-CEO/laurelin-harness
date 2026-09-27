---
name: fusion-cad
description: Fusion CAD work (edit, check, export) and Adam or CADAM parts brought into Fusion. Use for model changes, STEP export, interference checks, ANOR CAD.
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
- `fusion_import(path, target)`: bring a STEP, IGES, F3D, SAT or mesh file in as a new component (checkpoint first) or a new document.
Fallback when the server is not loaded:
- `bin/fusion-bridge health`: is Fusion up and which document is open. Run this first.
- `bin/fusion-bridge run <script.py>`: run a Fusion API script. Put scripts in the task's working folder, never in the vault.
- `bin/fusion-bridge exec "<python>"`: one short snippet (read a parameter, list components).
- **Adam** (MCP server `adam`, https://adam.new/mcp): mechanical design and CAD generation as a hosted task. Use it for a new part or a design study; follow its server instructions (pass the direct work as the prompt, poll the task, show 3D files only when asked). Adam runs on credits; when it reports none, use Fusion.
- `jacobian` MCP server: exact computation and independent checks for dimensions, tolerances and derived figures.
- `laurelin-reactor-calcs` skill: any reactor-physics number. Never do that algebra inline.

## Adam, CADAM and Fusion together
- **Adam** (MCP server `adam`, signed in as Joe): a mechanical-design agent. `adam_create_task` with the direct work as the prompt, poll with `adam_get_task`, list and fetch outputs with `adam_list_files` and `adam_get_file`. Pick a model with `adam_list_models` first. Adam runs on credits; when it reports none, model in Fusion directly.
- **CADAM**: Adam's text-to-CAD workspace (https://adam.new/cadam, open source). Use it for a quick parametric part from a description; its output is a CAD or mesh file.
- **The loop**: generate in Adam or CADAM, save the STEP locally, `fusion_import` it as a component, `fusion_check_interference`, `fusion_screenshot`, then `fusion_export` the result. The Fusion model stays the record.
- **Adam inside Fusion**: Adam's Fusion add-in (Autodesk App Store, "Adam AI CAD Copilot") puts Adam in a palette beside the model and lets Adam's own tasks drive Fusion. Adam's desktop connector can also bridge this repo's `fusion` MCP server to Adam (integration "Custom MCP connector"). Both are installs Joe does once.

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
