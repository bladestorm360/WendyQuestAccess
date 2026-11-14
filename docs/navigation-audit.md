# All-map pathfinder audit

November 12, 2026 · Steam build 26578620 · Installed Events update `1d1d7ad6383dda3f6136502d9a68724666e5d82e`

## Ice blocks and elevator triggers

The November 14 follow-up matched 46 native ice-melt action pages across all 239 maps. Active ice appears as **Ice block** in **Objects**. Fry Fields, French Fry Forest and the Mech Café register a separate chest event before a native move route gives it a chest sprite and moves it into place. The covered chest stays out of browsing and quest aliasing until its live sprite is assigned. The regression covers all three reveals, the alternate graybox sequence and the opened chest state. The field log recorded declined inputs and lacked the successful selection needed to identify the exact reported target. The elevator approach is under **Exits**. Walking onto the actual platform starts **Ride elevator** under **Events**. [Local destinations](../src/world/local-destinations.js) · [All-map fixture](../tests/local-destinations.cjs)

## Results

- **73 maps** had a sampled route where an active NPC, merchant or exit was omitted because the route crossed a native floor event first. **42 maps** had a matching generic entry in **Events** and **51** had a matching entry in another category. Those counts overlap. **72 of the 73** had a usable first-event entry in every observed interruption. The exception was a synthetic world-map shoreline state.
- **158 first-blocker approaches on 45 maps** were replayed from authored arrivals with the installed native collision and event-acceptance functions. All 158 took the expected first event, and the listed event had a verified approach. This confirms access to the next event. What the event does and whether it advances the objective depend on the live story state.
- **22 native transfer pages across 12 maps** had a reachable interaction but no browser entry in the sampled approach. Seventeen pages on ten maps reproduced from authored arrivals outside the developer area. The remaining five were three conditional fallback pages in Map 058 and two developer warps in Map 185. The native fixture walked to all 20 non-developer omissions and verified that the game's facing or bump interaction accepted the right event. Another 91 transfer-bearing pages were reachable under other categories, including scene triggers, conversations, battle starts and objects. A transfer command on a page is insufficient to classify it as a normal exit.
- The audit found an actual **empty destination list** in a conditional Map 058 region. A second map showed an empty list in a synthetic shoreline state on Map 113. Several return doors can be missing from **Exits** even when other destinations are available.

## Confirmed transfer omissions

All rows refer to the active page 0. An authored arrival is an installed game transfer coordinate. The fixture tested its collision and accepted interaction using a reproducible page state. A transfer with a heading or story condition still requires that exact native branch.

| Priority | Map and event | Finding |
| --- | --- | --- |
| High | 116/8 | Elder Tater’s house. Its return door is missing from Exits at both normal arrivals, (5,6) and (8,4). The native route takes one or six walking steps respectively, then a south-facing touch. |
| High | 117/11, 119/3 | Two interior return doors are absent from Exits. The first was replayed from all three arrivals, the second from the ordinary arrival at (9,11). |
| High | 048/3, 4, 10, 16 | Four cave returns are missing from Exits in the corresponding entry regions. The active pages choose the return map via the native story variable. Three were immediately adjacent at an authored arrival. |
| High | 083/27 | The introductory route's destination is absent from Exits. Native walking and touch reach it from the map's authored arrival at (12,19). |
| High | 113/59, 60, 63, 64 | Four ground transfers are missing from ordinary Exits. From authored return sides (39,26) and (41,39) the fixture reached a transfer with no exit entry. Validate the required approach direction and any native forced turn before using a label. Event 59 already has an independent native-facing bookmark route test. |
| Medium | 012/27, 025/13, 027/17 and 44, 076/64 | Other exits are available, but these specific entrances or boarding interaction are omitted. Native contact was verified for each, with switch 97 active for 076/64. |
| Needs progression verification | 058/37, 38, 39 | With switch 462 on, the (6,4) pocket has zero browse destinations even though events 37–39 are natively approachable. These are conditional fallback scenes with a transfer, so the appropriate player-facing label is generic. The three authored arrivals still offered **Events** in this fixture. None lands in the empty pocket. Verify that normal play can reach that pocket in the same state. |
| Development only | 185/38, 55 | Missing choices are in a developer warp area. Exclude them from normal navigation. |

These omissions share a classification gap. The 20 non-developer pages use normal-priority player touch, which the **Events** floor label excludes. The general **Exits** label requires a recognized name and a top-level transfer. Several of these names or branches fail that test. Preserve native approach checks, branch conditions and spoiler-safe labels when addressing them. [Destination labels](../src/world/destinations.js) · [Reachability and interruption](../src/world/routes.cjs) · [Native-facing bookmark evidence](cross-map-routing.md#facing-conditioned-world-entrances)

## World-map exceptions

- **Shoreline approach, Map 113/94.** The native boarding trigger is reachable from the authored east approach at (46,2) and appears under Vehicles. From the sampled northern pocket at (46,0), its east-entry route is unavailable and 51 otherwise reachable target and blocker pairs collapse to the same silent boundary. Walking toward the event would approach it from the north. The solver returned no event entry there. There was no authored arrival in the northern pocket, and the offline fixture found that reaching it from (46,2) first touches the boarding event. Normal gameplay access in that state is unconfirmed. [Native docking behavior](navigation.md#native-vehicle-transitions)
- **Surface travel, Map 113/24 and 158.** Two active generic triggers are reachable on ship routes. From (18,6), the native fixture replayed 8 and 21 tiles respectively and verified that the correct event starts. Neither appears while sailing because **Events** is walking-only. The three named ship exits were available in the sampled routes, so this is a coverage gap with a progression route still available. Any new speech for these triggers should stay generic. [Snapshot mode checks](../src/world/snapshot.js) · [World-map labels](../src/world/world-destinations.js)

## Coverage and reproduction

- The sweep covered every shipped `Map001.json` through `Map239.json`, 191,235 authored tiles, 6,527 event pages and 1,139 non-normal touch pages with command lists. The default state plus each page's declared switch, variable, self-switch, actor and item requirements produced 1,761 distinct per-map states. The Crispy Beach regression also restored its verified moving actor and live blocker configuration.
- Start points included the initial game tile, valid constant transfer destinations found in map and common-event lists, and one representative of each connected walking region separated by a touch boundary. The sweep tested 464 distinct authored start or arrival tiles and 44,248 combined state and origin samples. Map 021 was included in the data pass. It is an automatic intermediary with neither a walking region nor an authored constant landing. Its event hands off via a common event.
- To reproduce, verify the exact install and obtain the pinned original movement sources from its recovery directory. Run `tests/world-producers.py` with the existing bounded runner against a disposable stock fixture outside Git. Use the native page selection, terrain and event methods from `tests/world.test.cjs`, installed geometry, and the production snapshot and reachability code. For each sampled state and origin compare the available candidate list with a route to each omitted NPC, merchant or exit. Retain a witness when the result is interrupted and record its first event ID and whether that event is selectable. Test direct transfer pages omitted from Exits as a second pass and replay high-priority witnesses with native walking and touch. Store counts and locators, and discard copied scripts and temporary traces after review. [Native fixture](../tests/world.test.cjs) · [Installation evidence](deployment.md#events-category-update)
- This is an offline audit of authored pages and tested approaches. The page matrix did not simulate an entire playthrough or combine every story flag. The sweep did not execute every event, exhaustively resolve script or plugin-generated transitions, reproduce every moved actor, build every dynamic tile state, or generate live quest markers. The matched ship approaches supplement the walking sweep. Airship, timed cave and general input performance remain covered by their existing focused fixtures. No gameplay state or saves were used in this audit.

The maps with an interrupted target in the sampled walking matrix are 007, 012–016, 019, 020, 024–027, 036, 044, 045, 049, 050, 057–060, 063, 066, 076–081, 084–086, 094, 097, 098, 103, 106, 113, 118–120, 122, 126–128, 132, 134, 157, 158, 164, 167–170, 172–176, 178, 191–193, 195, 196, 199–202 and 206–209. The other 166 had no such interruption in the sampled matrix. The transfer table captures the independent omissions, including maps with no sampled floor interruption.

## Engineering estimates

| Work item | Estimated effort |
| --- | --- |
| Cover the verified return doors and other omitted player-touch transfers, including conditional headings and the existing packaged regression and local verification | 4–7 hours |
| Resolve the conditional Map 058 fallback approach and qualify a generic label | 1–2 hours |
| Qualify ship trigger coverage and verify the world-map shoreline access state | 2–4 hours |

Estimates include offline regression checks. Gameplay can confirm the nearest return door after Crispy Beach, then the relevant routes as progression permits. No change to game or mod files was required for this audit.

## Fix verification

The follow-up covered all 20 non-developer omissions. The native fixture verified the expected active category, the walkable approach, the final blocked movement and acceptance of the expected touch event. It also checked the direction-conditioned world entrances, the Cauldron pocket and a generic dock approach from the northern shoreline. A direction accepted by the event can still reach a branch that does not board. The generic label gives the player that distinction. The surface fixture verified both ship triggers and a course stopping before each. The normal-play state for the Cauldron pocket and the northern shoreline remains unconfirmed. [Controls and implementation](navigation.md#return-doors-and-other-audited-triggers)

## Event categories and spoiler labels

The November 13 follow-up read authored active event scripts, native trigger and priority, transfer branches and common-event effects on build 26578620. The full offline label check evaluated 3,004 actionable pages on 239 maps through the production ordinary and quest-label paths. It checked generic scene captions and type-only treasure captions across the pages, and replayed the reported examples in the map fixture.

- Map 113 events 3, 4 and 74 run the verified facing branch and both results transfer into Russetwood. The north and other arrival points were replayed with the native interpreter. Crispy Ruins events 20 and 21 transfer through the introductory route or directly to the world map according to the native page. These routes use Exits.
- The 16 authored up/down floor-transfer pages are in Exits. This includes the marked stair whose internal name described the floor using a developer shorthand. The active quest marker can also identify the same transfer through Quests, and All shows one target.
- Map 113 discovery tiles and active ambush switches use the generic Scene trigger caption. The visual ambush on Map 172 uses a native bump approach. Completed ambush cleanup pages leave no browser entry. Known floor scenes in the timed cave use Events. NPC conversations use their own target in NPC.
- The label sweep traced direct inventory commands and common-event rewards. The reported barrel uses the money routine but its name now comes from the container type. The reported combat guide and the differently named reading event in Map 118 both say Book before and after reading. Bookcases, pantries and chests likewise use type labels. Quest labels use the same safe target name, and the native dialogue still presents the text and rewards at interaction.

Native playback covers representative positions and story pages. It does not exhaustively replay every story state on every map. [Native category and label regression](../tests/local-destinations.cjs) · [Quest marker regression](../tests/quest-destinations.cjs) · [Prompt and field checks](navigation.md#interaction-prompt)

## Object artwork and nearest-first browsing

The installed 239-map pass checked 3,004 actionable pages through the object and quest resolvers. A focused review checked 1,424 action-button pages for object and treasure labels, compared item database names and direct or common-event reward commands, and verified flagged interactions against map tiles, event tile graphics and Wendy's dialogue. Map 120 events 11 and 12 say **Cupboard**. Map 124 event 15 says **Drawer**. Map 138 event 4 is a **Book**, event 9 is a **Food basket**, and Map 146 event 15 is a **Bowl**. Visibly placed drink and burger pickups use generic types. Barrel, Chest, Pantry and Bookcase retain their visible container or furniture type. Native dialogue can reveal contents on interaction.

The browser orders available entries by tile distance from Wendy's settled position. Looping maps use wrapped Manhattan distance. Ties retain native order, and bookmarks without a tile on the current map come last. A category opens on its nearest entry when it has no selection. The current selection stays anchored to its destination ID even when Wendy moves and the next list is reordered. The fixture tests category entry, reordering, selected ID, and a local bookmark across a map seam. [Browser and labels](../src/world/destinations.js) · [Authored overrides](../src/world/local-destinations.js) · [All-map fixture](../tests/local-destinations.cjs)

## Mechanics and prerequisite audit

A static sweep of all 239 maps, with two levels of common-event calls, found seven maps with flood fills, 28 with direct tile edits, 27 with blocker-rectangle commands and ten with same-map transfers. The overlapping command families include lighting-only and scene-only uses. This inventory identifies producers and does not establish that every invocation blocks a playable destination.

Salt Caverns 019 is the implemented multi-state route search. Maps 051, 053 and 055 are native Cauldron pull rooms whose layout changes and return entrances are documented in the [progression audit](puzzles-and-secrets.md#ordinary-progression-and-secret-reachability). Lava River 062 already verifies before/after terrain and blocker occupancy. The Mech Café elevator, French Fry Forest gate and house stairs have native approach or state checks. Maps 037 and 204 have parallel tile-fill pages. Map 192 has elevator floor and transition pages. These producers require their own destination and route fixtures before offering prerequisite directions. Detailed per-destination coverage, the broader floor and vehicle filters, and a verified automatic solution remain open. Existing timed cave guidance stays manual.

### Verified ordinary controls

A bounded installed-method audit used the native tile editor to replay nine action-button control pages. It checked approaches from each adjacent action position before and after the edits. The production worker now models qualifying bridge and passage controls in Russetwood 012:56, Frosty Peak 027:43, Cold Brew Trail 036:37, Lava River 062:17–18, Road to Mech Office 093:58, Office Entrance 103:5 and Patty Workshop 104:6. The fixture found no new chest or exit approach for the French Fry Forest lever 015:62 from the sampled action positions. On Lava River the north button changes traversability, while the chest witness specifically requires the south button. Ordinary controls do not create puzzle guide entries.

The exact worker regression confirmed one blocked target and its reachable control, the proposed post-interaction connection and withholding after the control's active interaction is gone for each of the seven maps. The local index keeps only directional flag changes in the affected cells. Other active events and floor boundaries stay authoritative. The broader source inventory identified story-script, ice-block and vehicle-transition candidates whose approaches have not yet been individually modeled. [Production worker](../src/world/terrain-controls.cjs) · [Exact fixture](../tests/world.test.cjs)
