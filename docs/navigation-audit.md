# All-map pathfinder audit

November 12, 2026 · Steam build 26578620 · Installed Events update `1d1d7ad6383dda3f6136502d9a68724666e5d82e`

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
