# Installed build and engineering evidence

## Build identification

Inspected November 11, 2026, from the local Steam manifest and files. App `3339970`, build `26578620`, installed depot manifest `7572248151708134333`, Steam language `english`. Path: `D:/Games/SteamLibrary/steamapps/common/Wendy Quest`. Manifest: `D:/Games/SteamLibrary/steamapps/appmanifest_3339970.acf`. The shipped `System.json` identifies locale `en_US`, a 32-pixel tile, stock turn-based battle mode and autosave enabled. The shipped `rmmz_core.js` reports RPG Maker MZ `1.8.0`.

| Relative file | SHA-256 |
| --- | --- |
| `WendyQuest.exe` | `d0c8877ffec0f8e0c12d0f8f84031e720f60e6fb7c61ad7f0d851aaeae4e93a0` |
| `nw.dll` | `42393478adb233cd91226c8cf8c6bc7c53f2a6bfe5060723d32a8951b52f3610` |
| `package.nw/package.json` | `36cda7d6953ece091002940373d4cd8c28338279247c28ae47879d347427ff12` |
| `package.nw/index.html` | `bca32832a921791e048e0c31fc75cfcaeb5aa85b0aaeb7515162902ed6527976` |
| `package.nw/js/plugins.js` | `083317d6b2ee7ba9655762dee7671564a64b0bba82bb33d8cbacd52a7e7b3ab7` |
| `package.nw/data/System.json` | `1f5069331af8e8c2fcce3dde3f5e6d71b2d262bc3d604ceaf6f62d0ac8d41b76` |
| `package.nw/data/MapInfos.json` | `99dc6d892762e7161146637a955741899f399985225081fb7bfea2854fedecbe` |

`WendyQuest.exe`, `nw.dll`, `nw_elf.dll`, `node.dll` and the Greenworks `.node` addon are PE32+ AMD64 (`0x8664`). The launcher and two NW DLLs report file version `0.48.4`; `node.dll` reports `0.44.0-beta1` in its resource. That label is not `process.versions.node` or a Node module ABI. Confirm the exact Node/V8 versions against a matching host and the shipped export contract before choosing native bindings. Upstream [0.48-series notes](https://nwjs.io/blog/v0.48.3/) are orientation only. `package.json` selects `index.html`, fullscreen and disabled devtools. The HTML includes a web bundle and the MZ bootstrap; verify that their UI, fullscreen/focus, and popup domains stay distinct before covering front-end messages.

### DLL decision

| Candidate | Observed import evidence | Consequence |
| --- | --- | --- |
| `VERSION.dll` | Normal import in the executable and `nw.dll`: `GetFileVersionInfoSizeW`, `GetFileVersionInfoW`, `VerQueryValueW`. | Best fallback candidate on this build, conditional on actual search and load order, Known DLL/loaded-module rules, correct x64 exports and a safe renderer bridge. Static imports alone do not prove the local file will win. |
| `WINMM.dll` | Executable delay-imports 3 timer functions; `nw.dll` normally imports 31 WinMM functions; `nw_elf.dll` and `node.dll` also reference it. | Broader forwarding burden for no access advantage. |
| `dxgi.dll` / `dinput8.dll` | `nw.dll` delay-imports `CreateDXGIFactory1`; no `dinput8.dll` import found in the parsed launch/runtime PE tables. | Timing and availability are weaker for a general bootstrap. This does not rule out dynamic loads. |
| `nw_elf.dll` | Game ships it, with 23 named exports; launcher imports two, `nw.dll` imports 13. Includes startup/crash interfaces. | Replacing a supplied runtime component increases compatibility and recovery risk. |

Any fallback proof must preserve imports/exports including any relevant ordinals, forward to the explicit real system library, leave `DllMain` inert, isolate the renderer/isolate and return control without waiting. Reject address guesses, debugger dependence, existing DLL conflicts, and modifications to native Chromium sandbox behavior. No proxy was built or loaded.

## Loader and lifecycle candidates

`js/main.js` lines 128–148 creates ordered script elements and calls `PluginManager.setup` after the engine scripts load; lines 174–212 cover the window/Effekseer gate into `Scene_Boot`. `js/rmmz_managers.js` lines 3075–3114 reads enabled descriptors and makes the plugin script path. `plugins.js` is a parseable array declaration: 23 enabled entries, all with a corresponding file, ending with `EffekseerForRPGMakerMZ_Ex`. Append an inert mod entry after the others; qualify exact execution order and proof of readiness before feature hook install or service start. Never treat a loaded script or a Chromium document-ready event as a ready game.

| Protected phase | Installed source path to follow | Readiness obligation |
| --- | --- | --- |
| Launch, database, fonts and resources | `main.js` → `Scene_Boot.create/isReady/onDatabaseLoaded/start` (`rmmz_scenes.js` 267–346); `MonkeyWrenchMZ` wraps boot. `SceneManager.onBeforeSceneStart` destroys the prior scene and stops Effekseer; `onSceneStart` ends loading and sets the stage (`rmmz_managers.js` 2091–2156). | First stable, focused title frame with its custom commands actually presented. Resolve late boot/plugin dependencies without initializing speech or workers during load. |
| New game, initial save load and reload | `Scene_Load.executeLoad/onLoadSuccess/reloadMapIfUpdated` (`rmmz_scenes.js` 2441–2467), custom `MenuScene` load scene, `DataManager` and black-screen starting map 38. | Close before accepted new/load action. Resume only after save and custom event reconstruction, destination map, startup interpreter and presentation settle. No mod save writes. |
| Map transfers and asset changes | `DataManager.loadMapData`, `Scene_Map.isReady/onMapLoaded/onTransfer/start/onTransferEnd` (775–815); `Game_Player.performTransfer` (`rmmz_objects.js` 8165). `MapScene.doSceneStart`, event restore/animation/blocker state and `Tyruswoo_TileControl` map-load alias extend stock order. | Pre-close at verified accepted transfer/scene transition, retire the old map generation and stop all output/work. Do not reopen at JSON loaded, stock `start`, fade-in request or tileset availability alone. Require live event state, stable movement/presentation, and the destination generation. |
| Event/cutscene entry | `Game_Event.start`, `Game_Map.setupStartingEvent/setupAutorunCommonEvent`, `Game_Interpreter.setup/setupChild`; `MapScene` movement and message overrides and data-defined parallel/autorun events. | Close before native entry, including custom forced movement and visible camera changes. When stable dialogue actually appears, permit its speech domain only; keep routes/movement closed until field ownership returns. Treat loading/overlay events separately from harmless parallel scripts. |
| Battle and return | `Game_Interpreter.command301`, encounter transfer (`Scene_Map.startEncounterEffect/updateEncounterEffect` overridden), `BattleManager.setup/startBattle`, `Scene_Battle.start` and result/return handlers in `BattleSceneArranger`. | Close before transition. Resume at first stable actionable or displayed battle state after custom UI and timing setup. Close again before battle teardown, map return or retry. Retire combat cues when their native window closes. |

These are source locators and proposed gate anchors, not approved hook sites. Track startup, transfer, resource, event, battle, modal, focus and shutdown as independent reasons to close; reopened views must have a fresh generation. Prove that workers stop accepting work at closure, that in-flight work is bounded and quiesces before protected entry without waiting on the game thread, and that stale speech, sound and movement cannot run in the next generation. If the apparent anchor gives insufficient lead time, find an earlier safe publication or do not enable that service in the affected context.

## Producer and input map

| Player-facing surface | Evidence and next check |
| --- | --- |
| Title, file, settings and inventory | `TitleSceneArranger.Scene_Title.start/commandContinue` with stock `Window_TitleCommand` and custom sprites; `MenuScene` has `Scene_FileLoad`, `Scene_DeleteGame`, `Scene_Coupons`, item/equip/option and game-over overrides. Trace accepted focus, help visibility, enabled state and result rather than treating every canvas text call as spoken. |
| Dialogue, choices, HUD and quests | `Window_Message.startMessage/newPage/updateMessage` is overridden in `MapScene`; it injects special text and has its own text sound and name-sprite paths. Follow visible pagination, `Window_ChoiceList`, `SetPictureText`, the quest plugin's marker and journal producers, and WendyQuest's HUD and status visibility. Include image-only instructions and menus after visual/asset confirmation. |
| Combat | `BattleSceneArranger` overrides `BattleManager.makeActionOrders/startInput/startAction/targetEnemy/processCursorMove/processVictory/processDefeat`; `Scene_Battle.createActionLogWindow`, `Sprite_EnemyGauge` and custom sprites supplement stock menus/gauges. `ActionCommandCombat` has `InputPressed`, `InputHeld`, radial timing/feedback and native sound producers. Recover actual timed prompt, accepted input edge, frame/clock, per-variant window and outcome. Never read an unrevealed hidden action order. |
| Field | `Game_Map.checkPassage/allTiles/isPassable`, `Game_CharacterBase` collision and movement, `Game_Event.findProperPageIndex/meetsConditions` and `Game_Player.moveByInput`; `MapScene` overrides page, movement and boat rules and defines `SetBlocker`, `FloodFill` and animated-object state. `Tyruswoo_TileControl.set_tile` writes tiles. Test both directions of a boundary, occupancy/priority/through, interactions, live deltas and path cancellation. |

The custom scripts are one-line JavaScript; several use rotating string tables. A bounded static decode of literal tables and checksum arithmetic resolved the symbols above in `InputAdjustments`, `MapScene`, `TitleSceneArranger`, `BattleSceneArranger` and `ActionCommandCombat`, without running them. Some other plugin tables need additional discriminants; inspect resolved call chains, not broad raw strings, before relying on them. There is no evidence that a game archive must be unpacked.

| Base controls recovered from `InputAdjustments` | Native actions |
| --- | --- |
| Keyboard movement | Arrows, W/A/S/D, and numpad 8/4/2/6. |
| Keyboard accept/cancel | Enter, Space and Z → OK; Escape, Insert, X and numpad 0 → escape. |
| Keyboard additional | Q/Page Up and E/Page Down; Tab; Shift; Ctrl and Alt both map to control; F1; F9 maps to debug. F5 has a separate native reload handler. |
| Standard-mapped gamepad | South/A → OK; east/B → cancel; west/X → shift; north/Y and Start/Menu → menu; LB/RB → page up/down. D-pad and left-stick axes 0/1 yield directions at a 0.5 threshold. |
| UI and special cases | Mouse/touch and active device switching are present. Custom battle consumes native OK/held input and touch; Quest and other scene plugins may layer over the base map. Verify each context and effective Steam Input remaps. View/Select and stick clicks are absent from the decoded base action table; that alone does not make them free. |

F8 is a separate `SceneManager.onKeyDown` case; stock `showDevTools` is test-only and the shipped manifest disables devtools. `MonkeyWrenchMZ.js` also contains a key-119 handler. Follow its exact guard and consumer before selecting F8. Keep the controller settings path accessible regardless of the final keyboard choice. Do not bind competing game actions twice; honor native focus, controller ownership, hold/release, repeat and manual movement priority.

## Offline checks completed and reproducible procedure

1. Read the Steam manifest; inspect `package.nw` as a directory; hash the build identity files; parse PE import, delay import and export tables using the existing `pefile` package in fast-load mode. No binary was executed.
2. Read map, tileset, event and registry JSON directly. Confirm the map IDs exactly equal non-null `MapInfos` IDs, every grid has width × height × six entries, all event coordinates are in bounds, and all map tileset IDs resolve. Results: 239 maps, 191,235 map cells, 4,636 event instances, 6,527 pages, 51,215 map-page command rows, 250 common events, 175 troops and 17 tilesets. Largest grid: map 87 at 120 × 80. Largest event count: 244 on map 41. Static direct transfers alone reached 189 map IDs from the start with every conditional branch admitted; this is a graph sanity check and proves neither actual reachability nor exclusion of the other 50 maps.
3. Trace the linked interpreter commands by `(map ID, event ID, page)`, including common event calls and custom command names. Avoid executing event scripts in analysis. Inspect scripts on the existing install and decode the static literal tables without executing their plugin bodies.
4. In an isolated Node `vm` with a mock DOM, load only the installed stock `PluginManager.setup`, `setParameters`, `loadScript`, `makeUrl`, and `onError` methods. Supply the locally parsed registry plus one synthetic marker. Verified order and script URLs for all 24 descriptors and that repeating setup did not append duplicates. DOM execution and the actual NW.js launch sequence were not exercised.
5. In the same fixture load the stock `Game_Map.checkPassage`, `tileId`, `layeredTiles`, `allTiles`, `isPassable` and `Game_Event.findProperPageIndex`/`meetsConditions` methods. Use Salt Caverns' real dimensions and tileset, stub tile events as empty and supply the real crystal event with mock switch state. All 14,000 direction/tile cases completed: 11,319 pass and 2,681 block in base geometry. Setting the crystal's D self switch selects page 2 over page 1. This is base engine evidence; custom overrides, dynamic blockers, event occupancy and puzzle progression are deliberately unmodeled.

The map/script audits and Node fixture used the canonical machine-wide job runner with 128 or 256 MB aggregate caps and one worker. These were functional offline checks. No native/runtime responsiveness, hook overhead, speech latency, installed behavior, or accessibility was measured. No game, save, plugin, network reward or Steam API was run.
