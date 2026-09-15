---
name: screening-room-search
description: Search for movie and TV titles through the Screening Room MCP using prepared NAS and CinePro navigation scripts. Use when asked to find a title, replace a search query, or navigate search results on the TV.
---

# Screening Room title search

Use `search_titles` to enter a query through the application's UI. Use
`focus_search_results` for the different NAS and CinePro keyboard routes.
These tools navigate the screen; they cannot read matching titles or confirm
that a title was found. Do not invent result lists from a successful tool call.

## Search workflow

1. Use the app named by the user (`nas` for local library, `cinepro` for online
   catalog). Otherwise omit `app` to use the current app. A TV-series request
   normally belongs in CinePro; NAS search covers this app's movie library.
2. Call `search_titles` with the complete title as `query`. Keep punctuation and
   Unicode intact. Do not add a year or season to the query by default: NAS
   matching may depend on filenames, and CinePro search may return the parent
   series. Use those details when comparing visible results.
3. The workflow returns home and **stops current playback**, opens a fresh search,
   and types once. It leaves the input focused. The reset avoids appending to an
   earlier query. This side effect belongs in the user's expectation before
   running the search; do not treat searching as read-only.
4. Wait for visible results to finish loading. `resultsVerified: false` means
   the command sequence completed without observing results. Fixed delays cannot
   establish that CinePro's network request succeeded. `get_status` only reports
   the active app and volume; it cannot confirm search results or input focus.
5. If an available screen-viewing tool can inspect this local app, use it to
   check the query, results, and focus. Otherwise ask the user what the TV shows
   when that information is needed to choose a title. Never report “found” based
   solely on the tool's `query_entered` status.
6. Once results are visibly ready and the search input is still focused, call
   `focus_search_results` **once** with the same app. It attempts to focus the
   first result (or a status message when there are no results). It does not select.
7. Use `press_button` one step at a time to reach a verified visible result.
   Confirm title/year/type as available before `Select`. In NAS this selects the
   movie in the directory; in CinePro it opens details. Neither is confirmation
   that playback started. Continue playback navigation only if requested.

## Examples

Find an online title:

```json
{"query":"Interstellar","app":"cinepro"}
```

Pass that to `search_titles`. After checking visible results and input focus,
pass `{"app":"cinepro"}` to `focus_search_results`.

For a local movie use `{"query":"Spirited Away","app":"nas"}` instead.

If MCP is not connected but local shell execution is available, the same search
script is in this skill's package. From the project root run:

```sh
rtk proxy node mcp/search.mjs --app nas --query 'Spirited Away'
```

The script is at `../../search.mjs` relative to this skill directory. Pass the
title as one properly shell-quoted argument. Prefer the MCP tool for arbitrary
user text so shell quoting is unnecessary. The script uses the configured
`SCREENING_ROOM_REMOTE_URL`, defaulting to the local receiver on port 8060.

## Recovery and limits

- Do not run tools concurrently with a search. The MCP server rejects overlapping
  calls; another phone remote or MCP process can still interrupt the sequence.
- If the query did not appear, do not append it again blindly. Check that the
  correct search screen is open and focused. A deliberate new `search_titles`
  call restarts the workflow and stops playback again.
- On a tool error, stop the sequence. Some preceding steps may have executed;
  the reported completed-command count is not evidence of the resulting UI.
  Never retry automatically or issue leftover steps from the failed script.
- Never repeat `focus_search_results` without restoring input focus: in NAS,
  Enter on a focused result selects it rather than moving to the results pane.
- Search results can be empty, still loading, or unavailable. Use visible
  feedback to decide whether to refine the query or retry after a network error.
- Keep native WebChannel, filesystem paths, arbitrary JavaScript execution, and
  provider frames outside this workflow. Use only the MCP's fixed remote tools.
