---
name: wondersearch
description: Ask questions across outside document sets (regulator PDFs, data rooms, specs) in WonderSearch, with cited passages.
---

# wondersearch

WonderSearch, from the Polygres team, stores documents in drives and answers questions over them with the exact passage, its document and its byte position. In this harness it is the MCP server `wondersearch`, signed in as Joe (OAuth; `/mcp login wondersearch` if it ever asks again).

## When to use it

A bounded set of outside documents that Joe wants to question but not keep in the vault: a regulator's rules and guidance PDFs, an investor's data room, a vendor's spec sheets, a stack of papers. Not for the vault itself (memory already searches it), and not for one short document you can just read.

## How to use it

From the Python runtime, `await mcp.call_tool("wondersearch", "<tool>", {...})`.

1. One drive per project: `list_drives`, then `create_drive` if none fits (name it for the project, for example "WA fusion rules 2026"). Folders per source: `create_folder`.
2. Add documents. Text: `add_documents`. Files (PDF and others): `prepare_upload`, then upload the bytes to the URL from `upload_transfer`, then `complete_upload`. Give each document an external id (its source URL or file name) so a later `update_document` replaces it in place.
3. Wait for ingestion: `get_operation` or `get_document` until it reports ready. A small file takes about 30 seconds.
4. Ask: `search` returns up to ten passages (about 5 to 10 seconds). Read more around a hit with `fetch` or `get_document_text`.
5. Cite every claim with the passage and its document. A passage is evidence; a claim without one is not.

Other tools: `list_workspaces`, `get_drive`, `list_documents`, `get_file`, `list_folders`, `get_upload`, `rename_folder`, `rename_drive`, `delete_document`, `delete_folder` (empty only), `delete_drive` (empty, non-default only).

## Rules

- Uploading sends documents to an outside service. Upload only material Joe has chosen for it. Never upload vault notes, investor or contact data, personnel or legal files, or anything export-controlled.
- Uploads (`add_documents`, `update_document`, `prepare_upload`) and deletes (`delete_document`, `delete_folder`, `delete_drive`) wait for Joe's approval. Reads and searches do not.
- The API key (WONDERSEARCH_API_KEY) is for the Python SDK only. The SDK reads POLYGRES_API_KEY by default: pass the key explicitly, never export it under that name, or the harness's Polygres memory breaks.
