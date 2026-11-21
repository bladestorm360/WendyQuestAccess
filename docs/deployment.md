# Local Windows installation and recovery

## Supported Steam build

This installer targets Steam App 3339970, build 26578620, at `C:/Program Files (x86)/Steam/steamapps/common/Wendy Quest`. It checks the installed manifest, launcher, game package and native producers against their expected identities. It also requires a complete original script set or the exact records of its own prior installation.

The plugin is loaded through the normal MZ registry as the last entry. The installer activates that entry after its other native and mod files are in place. It acquires a closed-game lease on the launcher and Steam manifest and checks for a running Wendy Quest process. The original files needed for recovery stay in one local recovery folder in the game directory. Removal deactivates the registry first and restores original bytes. Settings, bookmarks, saves and Steam Cloud use their existing game and profile locations.

Routing geometry is generated from the verified local game and placed in `package.nw/wendyquest-access-geometry`. Preparation checks the 239 map inputs, tilesets, map index and common events. The installed worker verifies map geometry as it reads it. The local derived directory is excluded from Git and the distributable mod payload.

## Build and verify

1. Run `.\build.ps1 -VerifySpeechPipe -VerifyAudio` from `C:/Games/Dev/RPG Maker/Wendy Quest`. The payload is staged in `.build/payload`.
2. Under the bounded runner, run `python tools/run-build.py --memory-mb 384 -- python tools/install.py prepare <new-candidate-directory>`. Use a new directory directly under `C:/Games/Dev/WendyQuestAccess-analysis`. Preparation checks 16 native JavaScript candidates and prints a plan hash. It reads the Steam install.
3. Run the applicable native, world, matching NW.js and installer fixtures. Scan the exact staged payload and installer scripts with the current local scanner. Record the plan hash, file hashes, scan definitions, result and signing status.
4. When the complete candidate passes the release gates, close the game and run `python tools/install.py install <candidate-directory> <plan-hash>`. Run `python tools/install.py status` to confirm the result. Launch through Steam for gameplay confirmation.

The installer fixture runs under the bounded runner as `python tools/run-build.py --memory-mb 384 -- python tests/install.test.py <stock-game-root> <analysis-root>`. Optionally supply a prepared candidate folder and its plan hash after the two paths to exercise that exact candidate without another geometry bake. It builds a temporary mirror outside Git and exercises the real installer against it. It verifies rollback after activation, detection of an occupied install path, launcher leasing, reapplication after a partial Steam restore, protection of unknown edits, byte-for-byte removal and an untouched save witness. The fixture removes its copy at completion.

## Recover and reapply

- Run `python tools/install.py status` to check the current local state. A partially restored same-build installation can reapply the same verified candidate after Steam finishes its work.
- Run `python tools/install.py remove` with the game closed to restore the pinned original files and remove matching mod-owned files. The command stops if any file has unknown changes. The saved settings and bookmarks remain available for a future installation.
- After a different Steam build arrives, use Steam's **Verify integrity of game files** to restore its official files. Keep the new version inactive until the mod qualifies its producers. The pinned installer refuses to write against a different build.
- Preserve the private source checkpoint and the known dependency inputs. Rebuild the candidate when needed. Delete disposable payload and geometry staging after verification.

## Verified development candidate

November 12, 2026, 18:45 UTC. The prepared plan hash was `10efb23a72ec37fba646215ad7ae41f9625569db09d02301e81a32df330ef41d`. The local bake produced 239 maps and 191,235 cells. All 16 exact native candidates passed, the standalone matching NW.js smoke passed, and the isolated mirror passed install, repair and removal. Microsoft Defender found no threats in the staged payload, installer tools and candidate geometry with platform 4.18.26100.4, engine 1.1.26100.4 and definitions 1.463.261.0. The current-user and machine stores had no available code-signing certificate with a private key. The native binaries reported unsigned.

| Scanned source file | SHA-256 |
| --- | --- |
| `install.py` | `52f8c993854e8028656075e559f7050177fd11a7b12dac99201505fdec30f9d5` |
| `registration.py` | `520b58d6a6f71090bbb77d4b96f0f8789ffecd9851dfa4fc1f9cd6d4eb6c7965` |
| `bake-world.cjs` | `544f28ae4fc3c4ea8b767f6157b895835af26b72fd82dc5fe45f29e2f65720b6` |

The actual Steam installation was verified as stock. Protected-phase output verification and the diagram scope are open. The final candidate still needs its own build, smoke, exact security and installed checks. [Current scope and evidence](feature-checkpoint.md) · [Native dependency hashes](audio.md#dependencies-and-payload-check)

## Combined development candidate

November 12, 2026, 19:24 UTC, Steam build 26578620. The combined candidate added ending and credit-card review to the prior map and atlas coverage. The exact prepared plan SHA-256 was `65ef297fb960b87f07f075754eb734f83f46db514d182f3fbd8832b9561ef65e`. It includes the original and transformed hashes for all 16 native registration candidates, the mod payload hashes, and the 239-map local geometry hashes. The bake covered 191,235 cells.

The canonical Windows build with native speech-pipe and audio fixtures passed. The 24 direct Node fixtures passed, including 120,972 directed movement comparisons and 9,504 airship landing comparisons. Run the direct fixtures with the pinned Steam root as the first argument and the separate world fixture with a fresh analysis directory as the second argument. Run the dialogue fixture with 256 MB and the world and installer fixtures with 384 MB. The matching hidden NW test used 768 MB and an isolated profile. It matched the installed NW libraries and passed controller handback, settings restart, rendered menu and credits, speech and audio submission, map routes, puzzle review and timing. The isolated installer fixture exercised the real installation and removal paths with an untouched save witness.

In the latest capped NW fixture, cross-map submission and ready handback took 1.4 and 0.2 ms. A silent speech receipt took 31.3 ms with 40 ms polling. Cave review and timed preview took 0.9 ms each from key press through enqueue. Warm battle audio reached the silent device in 2 ms. Cold HRTF status appeared after 595.3 ms with 40 ms polling. The separate direct fixture compared 20 paired sweeps at 16.73 ms native and 20.51 ms with observation. It compared 48 native movement steps at 11.28 ms manual and 11.11 ms with autowalk. The 260-frame dense soundscape fixture measured 0.10 ms off and 5.68 ms on, with a peak of 0.68 ms. These capped fixtures use simulated presentation or silent output. Audible onset, hardware buffering and whole-game lag require actual gameplay confirmation.

At 19:24:55 UTC, Microsoft Defender found no threats in the exact staged payload, geometry and plan directory, and the three installer source files. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.267.0. The native binaries reported unsigned. The current-user and machine stores had no code-signing certificate with a private key during the earlier check.

| Scanned installer file | SHA-256 |
| --- | --- |
| `install.py` | `52f8c993854e8028656075e559f7050177fd11a7b12dac99201505fdec30f9d5` |
| `registration.py` | `8c1fe47bc85185ad0d6bad4bb6a4d3d75519aa0f981f154b1f4ba88928bcc51d` |
| `bake-world.cjs` | `544f28ae4fc3c4ea8b767f6157b895835af26b72fd82dc5fe45f29e2f65720b6` |

The exact Steam target still verifies as stock. The protected-phase requirement remains the deployment blocker. [Output lifetime and current limit](implementation.md#speech-service) · [Exact payload hashes](audio.md#dependencies-and-payload-check)

## Transition verification candidate

November 12, 2026, 19:29 UTC, Steam build 26578620. Plan SHA-256 `5fe488f65fb9b64bfeced09cd0fffc5d700a7d3cff8d9cadbab98a9a874abc9e` supersedes the previous development plan. The native build and device fixtures, deterministic transport and geometry-read retirement, the full world fixture, matching NW smoke, all 16 registration candidates and isolated installer passed. The worker now checks admission before starting the next filesystem operation. The geometry remained 239 maps and 191,235 cells.

The current NW fixture measured cross-map submission and handback at 1.3 and 0.1 ms, with a silent speech receipt at 39.4 ms under 40 ms polling. Cave and timed review both enqueued in 1.0 ms. Warm battle audio reached silent SDL in 1 ms. Cold HRTF status appeared at 663.1 ms. The two capped world runs measured the full 57-destination worker batch at 11.62 and 175.12 ms with different concurrent workloads. These are worker completion times. Measure end-to-end responsiveness with the real game and devices.

Microsoft Defender found no threats in the exact payload, local plan and geometry, or installer scripts at 19:29:53 UTC. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.267.0. The three installer source hashes match the previous candidate. The binaries remain unsigned. The Steam installation was stock at this checkpoint. [Approved transition boundary](implementation.md#work-in-progress-when-a-native-transition-starts) · [Installed mod hashes](audio.md#dependencies-and-payload-check)

## Verified local installation

November 12, 2026, 11:42 a.m. PST. The owner approved local installation with the documented allowance for speech, audio and disk work admitted just before a native transition. Source checkpoint `d722131ebcfa39bb08f50ab0f77664ae84f2e170` was rebuilt and installed into `C:/Program Files (x86)/Steam/steamapps/common/Wendy Quest`. The exact plan SHA-256 is `4d387216941295f85add42cb2fb57159dee79acb911a22b83bfa19c5a0b69a09`.

The canonical Windows build passed both native output fixtures. The matching hidden NW smoke and the isolated install, interrupted activation rollback, reapply, unknown-file protection and removal fixture passed against this rebuild. The plan verified 16 native script changes and baked 239 maps with 191,235 cells. The matching NW fixture measured 1.3 ms for cross-map submission, 0.2 ms for handback, and 46.1 ms for the silent speech receipt with 40 ms polling. Cave and timed previews each enqueued in 0.9 ms. Warm battle audio reached silent SDL in 2 ms. These measurements describe bounded offline fixtures.

At 11:39:57 a.m. PST Microsoft Defender found no threats in the exact staged mod files, local plan and geometry, and all three installer scripts. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.267.0. The installer source hashes match the table above. The native files were unsigned. The current-user and machine certificate stores had no code-signing certificate with a private key.

The installer and a separate `status` invocation verified all 16 native script hashes, 38 payload files and 240 local geometry entries. The two files counted by the `.rmmzsave` extension retained their hashes during installation. Follow-up inspection found the settings file `config.rmmzsave` and the save-list index `global.rmmzsave`, with zero numbered playthrough files. The 17 recovery files are in `.wendyquest-access-recovery` under the Steam game directory, including the installed `plan.json` with all original, transformed and installed file hashes. Removal uses these exact originals and retains the game profile and saves. The game has yet to be launched for gameplay confirmation. [Transition behavior](implementation.md#work-in-progress-when-a-native-transition-starts) · [Installed payload hashes](audio.md#dependencies-and-payload-check)

## Gameplay confirmation after installation

Start from Steam after the installer reports **Installed and verified**. Use the earliest scenario you can reach. Allow 20–30 minutes for the early smoke pass, excluding story progression. Report the control you pressed, the last spoken words and what the game did. Prioritize delayed input, stale speech or sound over a missing optional detail.

1. At the title, move focus and listen for the selected command. Open **F8 → Speech**, mute, then restore it. Reopen settings to verify the saved choice and normal focus. Use **R** on the first dialogue page, advance it and confirm repeat follows the new page.
2. On the first settled map, save a location under **F8 → Navigation → Bookmarks**. Return to the map and find it in the **Bookmarks** pathfinder category. Request directions and go through a nearby entrance. Once control returns, request directions again. Confirm the old map or route stays silent. If you use a controller, check View plus a review button returns control to native input. [Bookmark controls](bookmarks.md) · [Field controls](navigation.md#destination-controls-in-the-development-build)
3. Before the first timed attack, enable **Battle timing cues** in Audio. Test the preview, then listen for the lead and tap cues, confirm and repeat for accuracy. Later try the frozen cue. Confirm the result is available after the timing input ends. Compare stereo and HRTF through headphones. [Battle timing](battle.md#radial-timing-tones)
4. In Salt Caverns, use **Shift+G** for the guide. Check a wrong step, its reset, and the correct progression when possible. On later cavern map boards, press **I** and review the displayed trails. In the secret cave, check the first checkpoint, one patrol capture and the return. Use the warning sign and active route cues before timed crossings. Progress to the chamber and credits when the game allows. [Puzzle and secret controls](puzzles-and-secrets.md) · [Map review](navigation.md#displayed-maps-and-ruins-markers) · [Credits review](menus.md#ending-and-credits)

## Crispy Beach controls update

November 12, 2026. The rebuilt candidate re-enabled the pathfinder and F8 at the first interactive beach by qualifying the ambient lightning timer refresh. Plan SHA-256 `bd545836aca8feafd598b44f7a653d30cb870c5a784ed53565f228cf28b6aca7`. The exact original and derived geometry sets matched the previous installation. The canonical build and speech/audio fixtures, installed-method field, map lifecycle, quest, input and dialogue regressions, matching NW smoke, all 16 syntax candidates, and the isolated recovery and installation fixture passed.

At 12:16:14 p.m. PST Microsoft Defender found no threats in the exact staged mod, geometry and plan, or installer scripts. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.267.0. The native binaries remained unsigned. The scanned `registration.py` SHA-256 was `306fcfeeec22620fd4bb1fa878a1ab39e385bc62d6d51d8b930ecb19b5f095f8`. The other two installer source hashes match the previous table.

The old verified payload was held for rollback while the canonical installer restored its originals and applied the replacement under one closed-game lease. The updated installation verified 16 patched scripts, 38 payload files, and 240 geometry entries. The three files in the save directory, including one numbered playthrough file, retained their hashes. The existing recovery location holds the updated plan and verified originals. The game was left closed for the player to confirm the fix. [Regression and controls](navigation.md#crispy-beach-after-the-introduction) · [Payload hashes](audio.md#dependencies-and-payload-check)

## Field controls and Inventory update

November 12, 2026. The verified update covers the active FilterController and quest variable stack at Crispy Beach, arrow and Enter navigation in mod settings, and native Inventory category highlights. Plan SHA-256 `18394353959f35bfbfd37d8e0962844c521d37285daea2e05c85dca253a2a079`. The 16 syntax candidates, canonical native build and output fixtures, field, map, Inventory, quest, input and dialogue regressions, matching NW smoke, and isolated installer recovery checks passed.

At 12:35:20 p.m. PST Microsoft Defender found no threats in the exact payload, geometry and plan, and installer scripts. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.267.0. Native files remained unsigned. The updated `registration.py` hash is `e8990223d64f4b6de769bdafc8e7ec61dd7ea6f5e052250e28a97d7fdeed720d`. The other installer source hashes match the preceding update.

The C: installation verified 16 native script changes, 38 mod payload files and 240 local geometry files. The three save-directory files, including one numbered playthrough, retained their hashes. The installed recovery directory retains the original files and this plan. Confirm field F8 and J/L/P with the native menu closed, settings arrows and Enter/Escape, and Inventory category speech in Steam. [Crispy Beach regression](navigation.md#crispy-beach-after-the-introduction) · [Settings keys](implementation.md#mod-keyboard-settings) · [Inventory categories](menus.md#inventory-category-highlight)

## Pathfinder continuity update

November 12, 2026. Plan SHA-256 `dfcb1963e9ba960e808815081dbb40d7dc0bfd1b8a65d4a9ef302115e82d30f7`. The exact original and derived geometry sets match the previous installation. The bounded native build and output fixtures, field, dialogue, quest, input and map lifecycle regressions, full world comparison, matching NW smoke, 16 native syntax candidates and mirrored installer tests passed. Native lifecycle tests include the unnamed opening map, the visible Crispy Beach banner and independent banner retirement.

At 1:03 p.m. PST Microsoft Defender completed custom scans of the exact payload, local geometry and plan, and installer scripts. It reported no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.267.0. The native binaries remained unsigned. The scanned `registration.py` SHA-256 was `28a1f4824e57f4f2ca8894da2ef26399dc38c5b6546144d94016dca21505f657`. The other two installer source hashes match the preceding table.

The verified C: update covers 16 native scripts, 38 mod files and 240 local geometry entries. All three save-directory files retained their hashes, including one numbered playthrough. The recovery originals and exact new plan were verified. The game stayed closed during deployment.

On the first interactive field, stand still and use **Shift+J/L** to change category. Press **K** to hear the selection and **P** for directions. Open and close the native menu with **X**, then press **K** again. The same category should still be active. Repeat near the elder, where NPC movement can occur. If the map is changing after two retries, listen for the prompt to try again. The startup map has no native display name. The separate first-entry announcement on the beach remains a gameplay observation. [Technical evidence and limits](navigation.md#pathfinder-selection-and-short-interruptions)

## Pathfinder input and visible prompts update

November 12, 2026. Plan SHA-256 `91dffb149e60416aac323a657d434d14f11d3be8365ad88130e3a0c50243529c`. The bounded native build and speech/audio output fixtures, native field and presentation regressions, 120,972 world movement comparisons, 16 syntax candidates, matching NW receipt and isolated installer recovery tests passed. The final hidden runtime verified the full title announcement and “Interact” on the same output transport as the packaged route tests.

At 1:38:20 p.m. PST Microsoft Defender completed custom scans of the exact payload, local geometry, plan, build script and installer scripts and reported no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.267.0. The native files remained unsigned. The scanned `registration.py` SHA-256 was `ca8a1e2137c224a01bf453a23657bf5c765533f80904e62ebfe75b785e6ddc79`. The scanned `build.py` SHA-256 was `0c8aac0864b7215114c5392a1ff72dff725fbb91b53dab4161451a2e082a4def`. The other installer source hashes match the preceding update.

The installed C: copy and recovery plan verified 16 native script patches, 38 payload files and 240 local geometry entries. All three files in the save directory retained their hashes, including the numbered playthrough. The game stayed closed during deployment.

On launch, listen for Wendy's Studios, 81monkeys and the title. At the first beach chest, listen for “Interact” with the original cue. Select a destination, stand still for about 30 seconds, then press the directions key once. Expect directions from the same selection. Also try a single press during ordinary play without waiting for idle. [Pathfinder evidence](navigation.md#single-press-directions-after-native-idle) · [Interaction prompt](navigation.md#interaction-prompt) · [Splash and title](implementation.md#splash-and-title-artwork)

## Pathfinder cache and category update

November 12, 2026. Plan SHA-256 `38f6a965a9b342caf130d1226e181287367b933d0184f7dd857bd4804c8f42b5`. The focused build used `tools/build.py`'s bundle stage and syntax-checked its output. It derived and checked all 16 native candidates from the installed recovery originals. The three changed native scripts were the map scene, interpreter and image manager. It reused 37 payload files and the 240 local geometry files by their previous verified hashes and rechecked all geometry inputs. No native binaries or map data needed rebuilding for deployment.

The native field, image lifecycle, dialogue, prompts, quest and controller checks passed. The matching NW fixture verified the Help focus and default bindings, route worker, quest marker retirement, bookmark handling and settings handback. The world fixture passed 120,972 movement comparisons. The prepared-candidate installer mirror passed the launcher lease, interruption rollback, install, reapply, unknown-file protection and removal.

At 2:13:22 p.m. PST Microsoft Defender completed custom scans of the exact staged payload, geometry and plan, and the build and installer scripts. It reported no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.267.0. The unchanged native binaries remained unsigned. The scanned `registration.py` SHA-256 was `b233a0086b07096b974548677e6c0867074aea23fa147fd5ba35017cca7fac5a`. The other build and installer script hashes match the preceding update.

The C: Steam copy and recovery plan verified 16 native script patches, 38 mod payload files and 240 geometry entries. The three save-directory files, including one numbered playthrough, retained their hashes. The game stayed closed.

On Crispy Beach, stand still and tap **K** once to hear the current selection. Use **Shift+J/L** to reach **All** or **NPC**, and **P** once for directions. While Follow Elder Tater is active and his approach is reachable, NPC should offer Elder Tater. Allow about two minutes to try the controls and open **F8 → Help**. Gameplay confirmation remains pending. [Technical evidence](navigation.md#cached-portrait-requests-and-the-all-category) · [ReadMe](../README.md)

## NPC label update

November 12, 2026. Plan SHA-256 `d537731139ccc9f298b744d65d6fc02988a0103669cfca24f68178826836f40e`. The focused build rebuilt the main JavaScript bundle and verified the 16 existing native script transforms, 37 remaining payload files, and all 240 local geometry entries. The native field fixture spoke “NPC, Elder Tater” and the matching NW fixture verified the Help wording. The exact installer mirror passed installation and recovery.

At 2:24:28 p.m. PST Microsoft Defender completed scans of the exact payload, geometry and plan, and build and installer scripts. It found no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.267.0. Build and installer source hashes and unsigned native dependencies match the prior update. The C: Steam installation and recovery plan verified. All three save-directory files, including the numbered playthrough, retained their hashes. [Pathfinder controls](navigation.md#destination-controls-in-the-development-build)

## Crispy Beach progression update

November 12, 2026. Plan SHA-256 `3589fe7f886abf82a462bc192f047e2851296ec39a156b49d02215a8923f0bed`. The focused build used `tools/build.py`'s bundle stage and replaced `WendyQuestAccess.js`, `routes.cjs` and `speech-text.cjs`. The other 35 payload files and 240 geometry entries matched the verified previous plan. The 16 native script transforms were reproduced, syntax-checked and matched the installed bytes. The connected field fixture, world suite with 120,972 native movement comparisons, matching NW 0.48.4 smoke and exact installer mirror passed. The mirror covered the launcher lease, interrupted rollback, install, reapply, unknown-file protection and removal.

At 2:41:22 p.m. PST Microsoft Defender finished scans of the exact payload, staged geometry and plan, plus `install.py`, `registration.py`, `bake-world.cjs` and `build.py`. It reported no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.267.0. Native binaries remained unsigned and the four script hashes match the preceding updates. The C: Steam installer verified the new plan, original recovery files, 16 installed native script patches, 38 payload files and 240 geometry entries. All three save-directory files retained their hashes. The game stayed closed.

From the current beach save, use **Shift+J** or **Shift+L** to select **NPC**, then press **P** on **Elder Tater**. Follow the directions, including the last manually announced step. After control returns, press **P** again. **Exits** also offers **Elder Tater's house**. Gameplay confirmation of these routes remains pending. [Map, native events and fixture evidence](navigation.md#crispy-beach-routes-through-floor-events)

## Events category update

November 12, 2026. Plan SHA-256 `e68d7439a520cd86f2f0754443d9b272e73fb4c48018c8d5f7106d58424f61e7`. The bounded focused build replaced the main bundle, `routes.cjs` and `speech-text.cjs`. It reused the other 35 payload files and 240 geometry entries by their verified hashes. The 16 native script transforms matched the installed versions and passed syntax checks.

The connected field fixture verified Crispy Beach category cycling, exact generic directions and removal of an erased event. The native world fixture verified the active Conversation page, the shortened autowalk course and 120,972 directed movement comparisons. The matching NW 0.48.4 fixture checked the updated Help, the packaged Events speech and manual activation, then finished the existing bookmark transfers. The exact installer mirror passed the launcher lease, interruption recovery, install, reapply, unknown-file protection and removal.

Microsoft Defender finished the exact payload, staged geometry and plan, and build and installer script scans at 3:00:59 p.m. PST. It reported no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.267.0. The native binaries remained unsigned, and the four build and installer script hashes matched the preceding update. The C: Steam installer verified all 16 patched scripts, 38 payload files and 240 geometry entries, plus recovery and the new plan. All three save-directory files retained their hashes. The game stayed closed.

On foot, use **Shift+J** or **Shift+L** in the default Letters layout to reach **Events**, then **J** or **L** to browse and **P** for directions. A reachable floor event reads as **Scene trigger** and leaves the activation step to the player. A reachable dialogue interaction reads as **Conversation**. Confirm in gameplay when a corresponding event is present. [Navigation controls and evidence](navigation.md#events-category)

## Battle meter and map audit update

November 12, 2026. Plan SHA-256 `cd7278362f0367ac618957e36ac5e68a058508a8a58c46a42ac135b85a0a9bd2`. The focused build replaced the main bundle, the three changed JavaScript service modules and the spatial audio addon. It reused 33 verified payload files and all 240 geometry entries. The 16 native transforms matched the previous installation and passed syntax checks. The bounded native battle fixtures, stereo and HRTF waveform checks, 120,972 movement comparisons and matching NW 0.48.4 smoke passed. The exact mirror verified rollback after interruption, repeat installation, unknown-file protection and removal.

Defender finished exact payload, stage and build/installer scans at 4:41:35 p.m. PST. It reported no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.267.0. Native files remained unsigned. The four build and installer script hashes match the previous update. Steam installation and recovery were verified with 16 native patches, 38 payload files and 240 geometry entries. All save-directory file hashes matched. The game stayed closed.

For the meter, turn on **Audio → Battle timing cues** and press confirm when the high note starts. Listen for the separate accuracy cue after power. To check the navigation update, select **Exits → Return to Crispy Beach** inside Elder Tater's house. Follow directions to the approach and take the announced final input. [Meter evidence](battle.md#meter-contour-verification) · [Map evidence](navigation-audit.md#fix-verification)

## Battle meter sweep update

November 12, 2026. Plan SHA-256 `2a5335c25186222b548e591e039d223ae4ac8f4d514ac8cf3a6d4d45c12ddfde`. The focused build replaced the plugin bundle and verified the other 37 payload files, all 240 geometry entries and the unchanged 16 native script transforms. Installed battle checks verified the end and interior contours, unchanged native scores and timing lifecycle. Matching NW 0.48.4 delivered the updated pulse to silent SDL in 2 ms for the warm fixture case. The exact installer mirror passed interruption recovery and removal.

Defender completed its custom scans at 5:10:49 p.m. PST and reported no threats in the exact payload, staged geometry, plan or build and installer scripts. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.267.0. Native binaries remain unsigned. Build and installer script hashes match the prior update. The verified Steam deployment and original recovery retained the hashes of all three save files. [Player controls and contour evidence](battle.md#radial-timing-tones)

## Crispy Ruins field handback and battle feedback

November 13, 2026. Plan SHA-256 `607c0fbddf5678a017eedefac3443c2ca67fa067e63451a3c2e51ed0760dd214`. The focused update replaced the plugin and speech formatter, reused 36 payload files and all 240 geometry entries, and checked syntax for all 16 native transforms. Five transforms changed. The installed-method and matching NW 0.48.4 fixtures passed. The world regression covered 120,972 movement comparisons. The exact installer mirror passed interruption recovery, reapply, protection against unknown replacements and removal.

Microsoft Defender found no threats in the exact payload, geometry and plan, or the four build and installer scripts at 04:36:21 PST. Platform 4.18.26100.4, engine 1.1.26100.4, signatures 1.463.277.0. The native binaries remain unsigned.

- `install.py` SHA-256 `52f8c993854e8028656075e559f7050177fd11a7b12dac99201505fdec30f9d5`
- `registration.py` SHA-256 `10f53e8e44b62dce0bc50cdb8b2fece13c701e091f8af8c49703f40fc4ef8731`
- `build.py` SHA-256 `6999ab99cf1b3631853336019c5c52d57ef4deabf2c0a95af5f09eace8e47cdb`
- `bake-world.cjs` SHA-256 `544f28ae4fc3c4ea8b767f6157b895835af26b72fd82dc5fe45f29e2f65720b6`

The C: Steam installation was verified against all 16 script patches, 38 payload files and 240 geometry entries. The original game recovery files and all four save-directory files retained their hashes. The game stayed closed.

After a conversation in Crispy Ruins ends, press **M** for the map name and **P** for directions. The next named arrival should say “Entering” and the map name. In battle, defeat an enemy and press **R** if you want to hear the recent results again. Test audible timing and responsiveness in gameplay. [Field evidence](navigation.md#field-handback-after-dialogue) · [Battle evidence](battle.md#enemy-defeat-and-status-effects) · [Gold and HP](menus.md#read-displayed-gold)

## Interaction prompt and destination audit update

November 13, 2026. Plan SHA-256 `afe804d355bb8cb4530ea8abf9a9b29bff8f7d6115e961d4f6a9910aff774f1d`. The focused build replaced the plugin bundle and the MapScene marker. It reused 37 payload files and 240 geometry entries. All 16 native transforms passed syntax checks. The installed-method chest, ice block and statue cases passed. The world fixture checked 3,004 actionable pages and 120,972 directed movement comparisons. The hidden NW 0.48.4 smoke and exact installer mirror passed.

Microsoft Defender found no threats in the final payload, geometry, plan and four build and installer scripts at 06:14:45 PST. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.281.0. The reused native binaries remain unsigned. The `registration.py` SHA-256 is `a0b8de03c23efcd22f29a41dbc3bfd078b591df22c8d403ef0809af04937299a`. The other three scanned scripts match the previous update.

The Steam install verified 16 script patches, 38 payload files, 240 geometry entries and original recovery. All four save-directory files kept their hashes. In gameplay, face the ice block or statue again after using the pathfinder. The native prompt should say “Interact.” Actual device timing and all possible live story states remain gameplay checks. [Prompt evidence](navigation.md#interaction-prompt) · [Event categories and spoiler labels](navigation-audit.md#event-categories-and-spoiler-labels)

## NPC naming update

November 13, 2026. Plan SHA-256 `4ff3234be86a4bcf07a502177e6fb20ec714fd77f3652521d95bfc837c0988a6`. The focused build replaced the plugin bundle. It verified the 37 reused payload files, 240 geometry entries and all 16 native script transforms. The native map fixture, matching NW 0.48.4 smoke and installer recovery checks passed. Defender found no threats in the exact payload, plan, geometry and four build and installer scripts at 06:52:09 PST. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.281.0. The reused native binaries remain unsigned and the four scanned script hashes match the preceding update. The Steam installer verified the new plan and preserved all four save-directory file hashes. [NPC name evidence](navigation.md#npc-names-in-conversations)

## Field audio and destination update

November 13, 2026. Final plan SHA-256 `370916ba4d2ada42f8bfaf84c13fe1d057dada4fa264001f542b3c5616721458`. The scoped build rebuilt the Windows audio addon and its fixture, copied the changed audio worker, bundled the plugin, syntax-checked the 16 native transforms and verified the reused 35 payload files and all 240 geometry entries. Matching NW 0.48.4 verified an off-course beacon update through the real route worker and silent audio, saved settings, and the quest-objective key. The isolated installer passed interruption recovery, reapply, unknown-file protection and removal. The source fixture checked 3,004 actionable pages, 81 fallback names and 120,972 movement comparisons.

Microsoft Defender found no threats in the final payload, geometry, plan and build and installer scripts at 07:52:05 PST. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.281.0. The five native components reported `NotSigned`. The new script hashes are `a49948eebca9af4e849c81ef8223f5a2623e2d2d518f2c43c2097f82a9b37cbb` for registration and `032a0e91f1e18c80850ed600caed0ff6e363633383c8d379ec9bc5477f4cffa4` for the builder. The installer and geometry builder hashes match the previous checkpoint. [Native payload hashes](audio.md#dependencies-and-payload-check)

The Steam installation verified all 16 native patches, 38 payload files and 240 geometry entries. Original recovery and all four save-directory file hashes were preserved.

For gameplay confirmation, enter a previously unnamed house and press **M**. Use **I** with a visible objective. Select a nearby destination, take a wrong step and listen for the updated beacon. With Wall sounds and Footstep sounds enabled, walk beside a wall, stop for three seconds and check that the tone ends. In battle, enable **Battle timing assist** and listen for the perfect-window note. Hardware onset, physical input timing and cumulative in-game responsiveness remain unverified. [Field audio](audio.md#wall-feedback-and-footsteps) · [Battle timing](battle.md#radial-timing-tones)

## Wall tone fade update

November 13, 2026. Plan SHA-256 `99b345cf99ecd6a026b915924e13c1739d0a42096f66d52ea931b602fae977e9`. The focused build compiled only the Windows audio addon and the spatial audio fixture using the 768 MB bounded runner. It verified the 37 reused payload files and 240 geometry entries. The fixture verified the 24,000-frame gain curve at 48 kHz, smooth recovery on renewed movement, concurrent footsteps and callback retirement with silent SDL. NW.js 0.48.4 smoke and exact installer interruption and recovery checks passed.

Defender found no threats in the exact payload, plan, geometry and four build and installation scripts at 08:26:24 PST. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.281.0. The four script hashes match the previous checkpoint. The rebuilt addon is unsigned. The C: Steam install verified 16 script patches, 38 payload files, all geometry, original recovery and four preserved save-directory file hashes. Actual speaker or headphone playback remains a gameplay check. [Fade behavior and audio hash](audio.md#wall-feedback-and-footsteps)

## Direction speech and footstep update

November 13, 2026. Plan SHA-256 `1b0a3376559999df5e9be3f19e8453f0cfcc982259809d8629d2afa7358b2523`. The focused build rebuilt the plugin bundle, speech formatter, and Windows audio addon. It verified 35 reused payload files, all 16 native transforms, and 240 geometry entries. The installed-method field fixture passed ordinary, interrupted, sailing, and landing routes. The matching NW.js 0.48.4 fixture passed route speech, selection speech, cross-map and quest routes, Autowalk arrival, and the footstep preview. The native audio fixture verified the 25 ms noise click, stereo rear pitch, HRTF placement, simultaneous wall audio, and the wall fade. The exact installer mirror passed interruption recovery, reapply and removal.

Defender found no threats in the final payload, plan, geometry and four build and installer scripts at 13:29:31 PST. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.284.0. The four script hashes match the preceding update. The rebuilt audio addon is unsigned. The C: Steam install verified all 38 payload files and preserved original recovery and four save-directory file hashes. Audible comparison in gameplay remains open. [Exact payload hashes](audio.md#dependencies-and-payload-check)

## Title focus and directional audio update

November 13, 2026. Plan SHA-256 `f534a0ee148171a327dd85279d8330ffe562a5a753b301f44e4cabef318ee5a2`. The focused build compiled the Windows audio addon and audio fixture, bundled the plugin and reused 36 payload files and all 240 geometry entries. All 16 native transforms passed syntax checks. The three changed files publish save-selector readiness. The title and file fixtures verified the first slot at frame 1 of a 60-frame fade, including card draw before and after the first visible frame. The world suite passed 120,972 movement comparisons and all four wall directions. The silent Windows fixture verified directional pitch, seams and heel-to-toe PCM. The matching hidden NW 0.48.4 fixture verified packaged HRTF and stereo preview, with the warm preview receipt observed after 40.1 ms at 40 ms polling. This is a throttled fixture receipt rather than device latency. The installer mirror passed upgrade, interruption recovery, reapply, unknown-file protection and uninstall.

Microsoft Defender found no threats in the exact payload, geometry, plan, all 16 generated native patches and four build and installer scripts at 13:49:56 PST. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.284.0. The five native components report `NotSigned`. The updated `registration.py` SHA-256 is `adbd9834ad4dcd84448e37a323a67266d6c79d0e5810dc425ca2d057c72ba7dc`. The other three tool hashes match the previous checkpoint. The Steam installation verified all 16 patches, 38 payload files, 240 geometry entries, original recovery and all four save-directory hashes. [Audio payload and behavior](audio.md#dependencies-and-payload-check)

Press Confirm on Start Game and listen for the first save slot as the selector appears. In the field, enable Wall sounds and Footstep sounds in F8 → Audio. Check a right-side wall and a left-side wall, then stop beside one for three seconds and listen for the fade. The two short footstep pips should sound like one heel-to-toe step. Audible onset, playback on the user's device and cumulative application cost remain gameplay checks. The field log contained no title or device timings. [File producer](implementation.md#file-selector-details-and-deletion) · [Field audio](audio.md#wall-feedback-and-footsteps)

## Simultaneous walls and treasure popup update

November 14, 2026. Plan SHA-256 `776d6027e27fe57f7a463b01dcb96fd9fd1ea9122d3f9df3910b5d8c19afd7ae`. The focused build replaced the addon, audio worker, speech formatter and plugin bundle. All 16 native transforms passed syntax checks. Seven changed scripts carry the reward observer or its existing retirement gate. The build reused 34 payload files and all 240 geometry entries. The world regression passed 120,972 movement comparisons. The matching hidden NW 0.48.4 fixture passed. The final scoped warm-preview receipt was 39.8 ms with 40 ms polling. This fixture measured receipt timing, and the silent native test verified simultaneous playback and independent retirement without hardware. The exact installer mirror passed interruption recovery, reapply, unknown-file protection and removal.

Microsoft Defender found no threats in the final plan, 16 script candidates, 38 payload files, geometry and four build and installer scripts at 04:34:07 PST. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.293.0. The five native components are unsigned. SHA-256 of `registration.py` is `fc3398e3eada90d3f9bb31996d8d98cb42dc5062239ec743c87d884bd289cee4` and of `build.py` is `ffefff9dd441d8fee5fc0562ebf488d83ec596fe06cbe57141662908f7a4bcd2`. The other two tool hashes match the previous checkpoint. The C: Steam update passed an independent status check, with all 16 patches, 38 payload files, 240 geometry entries, original recovery and all four save-directory hashes verified. [Payload hashes](audio.md#dependencies-and-payload-check)

With Wall sounds on, walk into a corner and listen for both tones. Move away from one edge and listen for the other to continue. Open an unopened animated treasure chest and listen for the reward and count as the popup appears. In-game audibility and cumulative application performance remain gameplay checks. [Reward producer and all-map audit](puzzles-and-secrets.md#treasure-popup-announcements)

## Wendy status shortcut update

November 14, 2026. Plan SHA-256 `4e324a0dc61a32e58211eaa85b4c1efb91371d6dbefc342549dd3c1af3225ca3`. Plugin SHA-256 `087ba733d9936018306e6545d1e7e60d721419ff00f3cc1c761b6c2d21a74db7`. The focused build reused 37 payload files and 240 geometry entries. All 16 native script candidates passed syntax and matched the prior plan. Native HUD, battle command, input and menu fixtures passed. The field, pause menu and companion-command scenarios read full status with H in the matching hidden NW 0.48.4 fixture. Digits 1–4 passed through. The native HUD read and formatting took 1.21 ms in the capped battle fixture and 0.41 ms total for three map and menu reads. These are stand-in measurements. The exact installer mirror passed interruption recovery, reapply, unknown-file protection and removal.

Defender scanned the exact payload, geometry, plan, scripts and four build and installer files at 06:04:06 PST and found no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.295.0. The five reused native components are unsigned and the tool hashes match the preceding update. The closed-game install and subsequent status check verified 16 script patches, 38 payload files, 240 geometry entries and original recovery. Four save-directory file hashes were preserved.

Press H in the field and pause menu, then press H while a companion command is selected. In each case the report should describe Wendy's visible status. Actual speech timing remains a gameplay check. [Battle and companion evidence](battle.md#wendys-battle-status)

## Critical field health update

November 14, 2026. Plan SHA-256 `d7f71f011c1e6b970b2efad8892582b5fa862d0986ebe4c7de529e158aec98da`. Plugin SHA-256 `2fb22db3c47c4c6adf7182ea85e4a34f3745523dcb76be8678ab925400fa689f`. The focused build replaced the plugin and verified the 37 reused payload files, 240 geometry entries and all 16 native script candidates. The native HUD, input, battle focus and menu tests passed. The matching NW 0.48.4 fixture verified the critical field cue, exact menu health, the same visible condition in each, and the keyboard and controller actions. The capped native HUD fixture measured 1.37 ms for the battle read and 0.41 ms total for three map and menu reads through formatting. These are stand-in measurements.

Microsoft Defender scanned the exact candidate, geometry, native script candidates and four installer and build files at 06:17:39 PST and found no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.295.0. The five reused native components are unsigned. The four tool hashes match the preceding update.

This standalone candidate was superseded by the combined update below. With the update deployed, press H while the low-health heartbeat is active, then press H again after healing. The field percentage should include “critical” only while the native warning is shown. [HUD evidence](menus.md#map-hud-vitals)

## Beacon, forest switches, World Atlas and battle attribution

November 14, 2026. The focused update replaces the plugin, the route worker and search, the speech formatter and the Windows audio component. It reuses 33 payload files and all 240 geometry entries. Three of the 16 syntax-checked native transforms change. The final plan SHA-256 is `5a1d3b6b5ee5b5ac55c75ddb2a0f74d70717a3712b52164ae3c148d7efd30462`.

The native tests cover the safe route prefix with an authored moving enemy, reusing the selection when it moves, forest switch pages, the 90- and 18-frame beacon endpoints, three ascending notes, native attacker attribution, the Crispy Shield victory cue as appended reward speech, the atlas pin and nearby landmark output, the low-health HUD, and the Q weather-refresh fix for French Fry Forest and Russetwood. The complete world regression passed 120,972 directed movement comparisons. The matching NW.js 0.48.4 packaged smoke verified off-course beacon refresh and audio submission, retirement, and keyboard and controller review. The eight-step beacon test took 0.75 ms native and 3.17 ms connected. The warm packaged beacon receipt was 41.0 ms with 40 ms polling. One shared-slot worker round trip on the overworld took 54.3 ms. Other warm runs were shorter. These are capped stand-in timings and include scheduling, with game responsiveness and audible timing still open.

Microsoft Defender scanned the exact candidate, geometry, patched scripts and four tools at 07:15:14 PST using platform 4.18.26100.4, engine 1.1.26100.4 and definitions 1.463.295.0. It found no threats. The audio addon is unsigned and has SHA-256 `bb7fe0150f9258b0a5513c0e4ec4add23704607c82ed688563ce43bdb65c0779`. The registration and builder hashes are `57a1a59c44dd0ab81cf165e05e7914e9cbf2634b135062e9fd5ddf2bed32a72f` and `a832d9533ab01f8396fca4f62efb2de478d0747e12f390e1c8be49015f53bf32`. The installer and geometry builder hashes match the previous checkpoint.

The isolated installer verified the launcher lease, interruption recovery, installation, reapply, unknown-file protection and removal with the process-list response simulated for the mirror only. This candidate was superseded by the map description update below. [Beacon](beacon.md) · [Forest switches](navigation.md#gated-exits-and-floor-events) · [World Atlas](navigation.md#displayed-maps-and-ruins-markers) · [Battle popups](battle.md#floating-battle-results)

## Map descriptions and resisted-status update

November 14, 2026. Plan SHA-256 `26b36a2d3a28f94fc2b8270ee3043e929a3f001f8f0027702bf22a844723657b`. This includes the preceding staged update. The focused build replaced the plugin bundle, speech formatter and one native battle transform relative to that candidate. All 16 native script candidates passed syntax checks, and 240 verified geometry files were reused.

The field fixture verified Shift+M sends a description without a route worker request. The installed world map fixture checked all five regions and open water. The catalog provides descriptions for 138 maps plus the regional overworld. The native battle fixture executed the floating text producer and verified that an unpainted popup stays silent and two separate rendered resistances are both read. The matching NW.js 0.48.4 fixture passed and verified the French Fry Forest description in the speech worker. The final source normalization removed two blank bytes from the packaged plugin. The remaining script lines match the tested candidate and the normalized payload was scanned again. The world regression passed 120,972 movement comparisons. In the capped battle log fixture, 250 stable draws took 3.94 ms native and 4.06 ms connected.

Microsoft Defender scanned the exact candidate, geometry, patched scripts and tools at 07:38:36 PST and found no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.295.0. Registration SHA-256 `67fbe1606ec5791ebe60b5b3b7c24d1b813dad563d5d8c35da1bfa8dabaa67d8`. Builder SHA-256 `0e3e920d6e6485e7d01b206a6448bc837abc286afe43b4becda0897215f90e75`. The native components match the preceding staged scan.

The isolated installer passed installation, simulated interruption and recovery, reapply, unknown-file protection and removal using a simulated closed-game process list for the mirror. Steam deployment is pending because Wendy Quest is open. In-game speech and descriptions remain to be confirmed. [Map descriptions](navigation.md#map-descriptions) · [Status effects](battle.md#enemy-defeat-and-status-effects)
## Cutscene narration, appearance and sunny-map routing

November 14, 2026. Plan SHA-256 `d2cfd5f9a72d244f35c08012914dfd23f6f810cf2f0dedc2d9ae8f424f504f3c`. The focused build replaced the plugin, route worker and native audio addon and added the 208,890-byte narration pack. The geometry rebuild changed only the index. It reuses all 239 verified map binaries and adds the 13 weather-tileset alternatives. All 16 native patch candidates passed syntax checks. The original local recovery remains available.

The native fixtures passed 178,356 movement comparisons, including 57,384 after the weather change, and checked 46 melt interactions across all 239 maps. They verified rendered Momentum gains, the selected enemy's art variants, active portrait and map-sprite dialogue details, and unchanged battle timing. The matching hidden NW 0.48.4 fixture verified clip decode, cancellation, gain/rate settings across restart, and centered battle cue dispatch. The capped fixture observed the first clip progress after 275.8 ms with 40 ms polling. That is a media progress receipt under the resource cap, separate from main-thread cost or audible onset. The full installer mirror passed admission, simulated interruption, rollback, reapply, unknown-file protection and removal.

Microsoft Defender found no threats in the exact payload, geometry, engine scripts and four deployment tools at 09:00:33 PST. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.295.0. The native audio addon is unsigned and has SHA-256 `2fbf393de4de91fc43c134fd5d5d2d86104541a8883b6e13d92766127c806f2d`. Registration SHA-256 `d062565942f6727e8e92baa1b5077550095c971d740ed0ba838e21fbe8c76f47`. Build tool SHA-256 `7c2eefaed62d7cf0b6fe9dc89557e8637e5d75f17c994410da105add123d0bb1`. Geometry builder SHA-256 `dc83a327040ba816a88feb7844becfc77d9077cd22f27d1ce21fa46cf0cba030`. The installer hash matches the previous checkpoint.

Installed to the closed C: Steam game. The installer independently verified 16 native patches, 39 payload files and 240 geometry entries. All four save-directory files and original recovery hashes were preserved. Start with a directions request on the existing sunny Russetwood save, followed by a browse and route through another sunny map. Select a battle target or pause on spoken dialogue and press I. Turn on Battle timing assist to check the centered power and accuracy notes and listen for the filled count on a Momentum gain. Enable Cutscene descriptions to check timing and mixing at the next covered scene. Game execution and device audio were untested. [Navigation](navigation.md#field-movement-after-the-rain-clears) · [Cutscene audit](cutscene-description.md) · [Battle details](battle.md#visual-descriptions-while-targeting)

## Immediate save focus and battle opening

November 14, 2026. The focused candidate rebuilt the plugin and three of the 16 syntax-checked native scripts. It reused 38 verified payload files and all 240 geometry entries. The plan SHA-256 is `fb6d737bbd3e8a884333b7c4c8f6c7545eb002249d21feeae3ff8d67cb7eec01`. The plugin SHA-256 is `a80b63f23d8134943e41058e06c87795cfa54879f40b2932e6cbe45458eee18e`. The only changed installer input is registration.py with SHA-256 `062a2eb1cfde702b4a3b28c504c304c1f3bf9afc8d8ba5afdf6899060867c46f`.

The original mod failed the new save-list regression by capturing zero initially focused slots at native input readiness. The replacement captures that focus before cursor movement, card art and the next graphics callback. The native tests cover file and title focus, input, transport retirement, dialogue appearance, target focus, battle opening and combat popups. Under the cap the first battle command including formation took 2.74 ms to a formatted receipt, with 600 stable simulated frames at 2.65 ms native and 2.57 ms enabled. Target focus took 3.48 ms through its synthetic render. These timings measure fixtures through their speech receipt, and do not measure device audio. The world fixture passed 178,356 movement comparisons including 57,384 dry-weather comparisons. It checked the rain and sun description on all 13 affected maps and the Salt Caverns torch note.

The matching NW 0.48.4 fixture delivered the initial save-slot packet with no graphics callback, and verified that the formation and appended first command arrived in the same speech epoch. Target percentages reached the same formatter on highlight and manual detail. The installer mirror passed interruption recovery, reapply, unknown-file protection and removal. The mirror used its isolated launcher lease and a fixture process list because the Steam game was open.

Defender reported zero matching detections for the exact payload, geometry, candidate native scripts and build and installer tools at 09:50:32 PST. Platform 4.18.26100.4, engine 1.1.26100.4, signatures 1.463.295.0. The existing unsigned native binaries match the prior installation. Local Steam deployment is pending a closed-game lease.

After installation, press Confirm on Start Game and listen for the current slot. On entering a battle, listen for the formation and then the initially focused command. Highlight an enemy for the percentage and press I for its appearance. Audible onset and behavior during live battle remain gameplay checks. [Save-selector producer](implementation.md#file-selector-details-and-deletion) · [Battle opening](battle.md#battle-opening) · [Area descriptions](navigation.md#map-descriptions)

## Salt Caverns routes and destination visibility

November 14, 2026. Installed plan SHA-256 `9b18ba5638504018037c65768f0e3cf029fc24a48bae6e9b705fa1cf0a580022` supersedes the earlier title and battle candidate. It carries those verified changes and adds the manual cave guide, route prerequisite search and default broad listing. Bundle SHA-256 `0f5aa7db54b2744d80d9a1c6375ea9310ccdc6578c4099263a1cb05d4a7be5a0`. The focused build reused all 239 map binaries and added the cave collision model to the existing local manifest. Updated payload components were the bundle, route worker, speech formatter and two added route modules. Original game sources and map geometry stay outside Git.

The native and packaged tests passed. The packaged worker found routes from the southern entrance to all four unopened chest events and the north exit, with the first approach checked against the native walking model. The guide fixture ran the native color and reset branches and verified review after partial progress. The full world fixture checked 178,356 movement edges. The connected field fixture measured 0.2 ms for a synthetic dense destination snapshot without terrain versus 4.0 ms with terrain; the latter includes the work the optional filter needs. Cave-planning worker replies for the five southern objectives took 126.8–391.7 ms cold and 94.9–358.1 ms warm under the cap. They are worker round trips and leave the main thread free. Actual playback and game-frame timing remain unmeasured.

Microsoft Defender reported zero matching detections at 10:12:18 PST for the exact payload, native scripts, local geometry and build/install tools. Platform 4.18.26100.4, engine 1.1.26100.4, signatures 1.463.295.0. The isolated installer passed interruption recovery, reapply, unknown-file protection and removal. The closed Steam installation verified 16 script patches, 41 payload files, 240 geometry entries, matching original recovery and four unchanged save-directory files.

In Salt Caverns press Shift+G on a settled tile for the next action, or select a chest under Treasure and press P. Complete the spoken interaction with the native controls and request the next step. Toggle Reachable destinations only in F8 → Navigation to filter current route approaches. [Guide and verification](puzzles-and-secrets.md#salt-caverns-guide) · [Map-wide audit](navigation-audit.md#mechanics-and-prerequisite-audit)

## Ordinary bridge and door prerequisites

November 14, 2026. Plan SHA-256 `7ef26beb32a3b0b78287522b4a26c153f5f762c4e029e41157b4b4ab6c7a1ee5` is installed over the Salt Caverns update. Plugin SHA-256 `a485a9c5dd6736616e799863285b5eb16e2f3c2d39625d3f8d43905dec79ba2d`. The focused build changed the bundle and route worker, added the terrain control module and reused all 16 native transforms and 239 map binaries. The geometry manifest now records the verified control edits.

All seven authored control examples passed the actual worker test, along with 178,356 movement comparisons and the Salt routes. Ordinary prerequisite replies took 46.6–164.5 ms cold and 1.3–3.2 ms warm under the runner. The matching NW fixture and the isolated installer admissions, recovery, reapply and removal passed. Microsoft Defender reported zero detections for the exact candidate and build tools at 10:23:03 PST. Platform 4.18.26100.4, engine 1.1.26100.4, signatures 1.463.295.0. The Windows binaries match the preceding scan. The closed Steam installer verified 16 script patches, 42 payload files, 240 geometry entries and all four save-directory files.

Select a blocked chest and press Directions. On a verified gate, the speech leads to its operating control and gives the native action. Leave the chest selected and request directions after the state changes. The source inventory and remaining route gaps are recorded in the [map audit](navigation-audit.md#mechanics-and-prerequisite-audit). Live audio and gameplay remain unverified.

## Start Game handoff, cave labels and narration rate

November 14, 2026. Candidate plan SHA-256 `0b9e269f5122738d829bda09b9408121cf0013f18c230d055c23cc8f225b45ec` and plugin SHA-256 `59d00d8bf9579adc12a32cd3ddb3c8f16636e0a9d1444fdeaf231db74cf69c74`. The focused build changed the plugin bundle and one of 16 verified native transforms. It reused the other 41 payload files, including the same narration recordings and Windows binaries, and all 240 geometry entries by hash.

The native title fixture ran the actual Start Game handlers through the game's scene loop. With prepared scene data, the initial slot was published before any slot input on update 49 in stock and update 1 in the candidate. The corresponding final update took 0.40 ms stock and 0.16 ms connected under the cap. This measures the scene activation and enqueue, with live audible onset still open. The world regression checked 178,356 directed movement edges and 3,004 action pages on all 239 maps. It excluded all 56 No Rain pages and the Salt Caverns playtest conversation while keeping ordinary story Chomps pages and the core Salt Caverns route guidance. Across 120 synthetic map snapshots, the comparison was 9.45 ms baseline and 10.77 ms connected. The matching NW 0.48.4 isolated package verified the 200 percent default, changed it to 210 percent, decoded the existing clip at that rate and confirmed speed and volume after restart. Its first media progress was observed after 158.2 ms with 40 ms polling. The player previously confirmed the cutscene descriptions play in the Steam game. The faster audible mix remains to be heard in play.

Defender completed the exact candidate scan at 10:54:15 PST and reported zero matching detections. Platform 4.18.26100.4, engine 1.1.26100.4, signatures 1.463.295.0. The isolated installer passed interruption recovery, reapply, unknown-file protection and removal. The combined party, terrain and ice update below supersedes this candidate. [File selector timing](implementation.md#file-selector-details-and-deletion) · [Map audit](navigation-audit.md#weather-setup-and-playtest-destinations) · [Narration settings](cutscene-description.md)

## Battle appearance, Chillcrest terrain and ice prerequisites

November 14, 2026. Final plan SHA-256 `b19823f729619d02e9aee3c0c05bcb5d0c7536a295d799c458e4015134a13029`. Plugin SHA-256 `29990092dedf6e1dec9b15590c83999949743572d9820716c6453e6a57cf41a1`. The focused build replaced four mod payload files and three source-checked native transforms. All 240 geometry entries, the narration recordings and the existing Windows binaries matched the verified hashes. The plan includes the earlier Start Game delay, cave listing and narration rate fixes.

The installed battle art audit compared five actor atlases and the associated effect art. Both the scripted battle fixture and matching isolated NW 0.48.4 package passed, including Shift+I over a companion ability with visible ice. Under the cap, the opening fixture took 2.54 ms through its silent speech receipt and 600 stable frames took 1.88 ms stock and 2.12 ms connected. Area descriptions use the installed town terrain and verified entrance positions. The final world suite checked 178,356 movement comparisons. The Chillcrest worker response to the blocked route took 51.3 ms cold and 4.7 ms warm. The cleared route took 45.0 ms cold and 1.4 ms warm. Those comparisons are isolated worker round trips. The native field test checked retirement, actual blocker erasure, and automatic rerouting without a second key.

Microsoft Defender completed the exact candidate scan at 11:33:39 PST and reported zero matching detections. Platform 4.18.26100.4, engine 1.1.26100.4, signatures 1.463.295.0. Scanned registration SHA-256 `fb4a190d8ad9c7084942916aaa47ef4d64b7abf55933cc8aec684b2d840bf5cb`. The native dependencies remain unsigned. The isolated installer passed interruption recovery, reapply, unknown-file protection and removal. The closed C: Steam installation verified all 16 native scripts, 42 payload files, 240 geometry entries and the original recovery set. All four save-directory files retained their hashes. The player confirmed that the title-screen lag is gone in live play and gave positive feedback on the description. The ice handoff and faster narration remain gameplay checks. [Battle controls](battle.md#party-battle-sprites-and-visible-effects) · [Landmarks](navigation.md#map-descriptions) · [Ice route evidence](navigation.md#ice-blocks-that-open-walking-routes)

## Chillcrest speakers, consumed events and filter shortcut

November 14, 2026. The focused candidate rebuilds the plugin only. Plan SHA-256 `87bf6affbdedd7eb3fda3ad22b99892f768853da8d88c30a532639dad2838c79`. Plugin SHA-256 `49984c9b735de0fbb4af7c5f0159e95f7562fae34942a0b7b499bf4cce3abcff`. It reuses 41 other payload files, 16 verified native transforms and all 240 derived geometry entries. The exact candidate, native scripts, local geometry and build/install tools passed the Microsoft Defender custom scan at 13:33:22 PST. Scan ID `422BAC16-C177-4439-8334-0A17B070CE20`. Platform 4.18.26100.4, engine 1.1.26100.4, signatures 1.463.300.0. The native dependencies remain unsigned.

The native dialogue, field, input and world regressions passed. The world suite checked 178,356 movement comparisons, 3,004 actionable pages and 146 erase-only pages. The matching NW 0.48.4 fixture checked both spoken filter states and the prior settings, route and dialogue checks. Its silent cold browse submission took 2.4 ms, receipt 40.1 ms with 40 ms polling, and warm route submission 2.4 ms. The 120-snapshot comparison was 8.88 ms bypassed and 9.56 ms connected, under the same resource cap. These are fixture timings. The isolated installer verified the candidate, launcher lease, interruption recovery, reapply, unknown-file protection and removal.

Installed into the closed C: Steam game. The upgrade fixture first verified replacement of the exact previous installation and preservation of a save witness. The live installer and independent status check verified 16 native scripts, 42 payload files, and 240 canonical geometry entries. All four save-directory files retained their hashes, and the original recovery files matched. The initial test invocation had created a byte-matched duplicate geometry directory under the installed service folder. The upgrade verified all 240 hashes and removed the duplicate from the game directory. Live verification should start with I on both lines of the shared Chillcrest conversation, a filter toggle in either layout, and directions through the finished scene tiles. [Speaker detail](cutscene-description.md) · [Navigation evidence](navigation-audit.md#consumed-floor-events-and-hidden-interactions)


## Chillcrest west exit and Spoiler mode

November 14, 2026. Plan SHA-256 `071b8eaf826c4e9401c951a388509fff5ce49a714301a710a17406379cbf9bbb`, plugin `c3387ae9459354014679402b3de032b0fc841168dd427702d4e06386e49feca7`, and speech formatter `dffb1a8f9d3c9d10f677455f8a957ddd70ac1a6feeb4d8a0aca06217f7213102`. The focused build reused the 16 exact native transforms, 40 other payload files and 240 derived geometry entries. Defender reported no matching detection for the exact candidate at 14:13:18 PST. Scan `E360A285-D772-4273-9161-F2CEAA00961E`. Platform 4.18.26100.4, engine 1.1.26100.4, signatures 1.463.300.0. The reused native components remain unsigned.

The world fixture verified 178,356 movement comparisons, the three Chillcrest exit names, the active quest’s western route, and both visibility states against the native pages. The matching NW 0.48.4 check verified Spoiler mode defaults off, focus returns to its toggle, and the preference persists after a restart. Its throttled synthetic cold browse submission was 3.0 ms and warm route submission was 1.9 ms. The isolated installer passed staging, launcher lease, interruption rollback, unknown-file protection and removal. Installation verified 16 native scripts, 42 payload files, 240 geometry files and four unchanged save/config files. [Controls](navigation.md#spoiler-mode) · [Exit behavior](navigation.md#chillcrest-exits-and-the-rescue-objective)

## Route audio, battle and occupied save slot

November 14, 2026. Steam build 26578620 candidate plan SHA-256 1da547ffbc5349d87ad8e5d8f4e0c6c11cd5b797af66501a9b77f83ddf8da6e3. The focused build reused checked native libraries and the existing 240 geometry files. The last bundle removes ordinal enemy labels from target focus, condition and defeat speech. Optional menu indexing still provides its standard cursor position. Four payload files changed, and all 16 native script transforms were syntax-checked. MenuScene, both scene lifecycle scripts and BattleSceneArranger are the four changed native transforms. Exact scan folder wendy-battle-labels-final, including the local upgrade wrapper. Microsoft Defender custom scan A84C26BD-EDBD-4ACE-A2D1-C9B1186DFFED finished at 15:01:15 PST with no matching detection, using platform 4.18.26100.4, engine 1.1.26100.4 and definitions 1.463.300.0. Native libraries retain their existing signing status.

Focused native tests passed the save selector and occupied-slot readiness, input, dialogue, field and damage paths. Occupied-slot native success to test packet was 0.87 ms with cold art and 0.47 ms with art ready. These use stub file and audio operations. The battle result fixture measured native popup completion to formatted receipt in 2.41 ms and 250 stable updates at 2.00 ms native and 1.26 ms observed. The latter are comparable offline observations without an in-game performance or audible onset measurement. [Field and controller](beacon.md) · [Battle](battle.md#basic-attack-names-and-battle-bag-status) · [Soundscape](soundscape.md)

The world suite passed 178,356 directed movement comparisons and reviewed 3,004 actionable pages across 239 maps. It verified the next Chillcrest quest exits and preserved the action for a painted marker that owns a floor trigger. The matched eight-step traversal took 0.44 ms baseline and 1.92 ms with beacon requests. The dense 260-frame soundscape fixture took 0.08 ms off and 3.07 ms on, with peak 0.35 ms. The exact matching NW.js package passed moving-controller directions, optional path and destination speech, off-course beacon refresh, soundscape emission, Battle Bag vitals and Clapback preparation. The warm beacon reached silent SDL at the 40.1 ms poll. Cold HRTF status arrived after 755.7 ms in the throttled fixture. These are separate fixture measures and do not measure live audible onset.

Local upgrade uses the standard closed-game lease and verifies the current recovery receipt, candidate, payload inventory and save hashes. The isolated installer passed its launcher lease, interruption rollback, reapplication, unknown-file protection and removal with the process query simulated for the mirror only.

Installed on November 14, 2026. The independent status check verified the 16 native scripts, 42 payload files and 240 geometry entries. Four save and configuration files kept identical hashes. The focused installation reused the original native files in the Steam recovery directory. A single previous payload backup and plan are retained for reconstruction from commit 547c75a6daa214d12fdc6e814aee32512545cd54. Gameplay confirmation is open for audible first-slot focus, controller directions and soundscape placement.

## Battle speech, wall bump and Frosty Peak

November 14, 2026. Steam build 26578620, release plan SHA-256 `0b0729dc95a5b5edd8e1cd32a6ee3ffbb65b2e7a5d134c7fed2baa7fab4a087c`. This focused build bundled the mod, replaced the route and speech modules, and compiled the Windows audio addon alone. Plugin SHA-256 `5b4b4b7b9f099457a070652f12f75050a25c384dd4ab75fb19a590a8765aec42`, audio addon `c4b38dd4843e327e8a3064f02aa8f1eb82e2eddeeeb75a67c08764139287bdd9`. Six payload files and the two pinned native battle transforms changed. The build checked syntax for all 16 native scripts and reused the 240 verified geometry entries. The bounded compile used 640 MB, world verification 640 MB, matching NW 0.48.4 smoke 1120 MB and the isolated installer 384 MB.

The installed-method tests verified first-postrender battle introductions, duplicate-name target numbers, lethal result ordering, native Q handback and the I objective tracker. The world test verified 178,356 native collision comparisons, confirmed wall-bump timing and event suppression, and replayed the Frosty Peak enemy, ice and scene sequence. The three Frosty Peak phases took 7.3, 3.9 and 1.3 ms warm in the capped worker fixture. The packaged smoke sent a leftward bump through the real addon and silent stereo driver. Native battle popup formatting took 2.33 ms through a synthetic render and receipt. These are offline timings. Confirm attack speech timing, wall bump audibility and Frosty Peak handoff during normal play. [Battle evidence](battle.md#basic-attack-names-and-battle-bag-status) · [Movement audio](audio.md#wall-feedback-and-footsteps) · [Route evidence](navigation-audit.md#frosty-peak-combined-obstructions)

Defender custom scan `05470541-050F-4973-BF1F-9F1BFF4F1B68` completed at 15:39:30 PST with zero matching detections. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.300.0. The exact candidate included the local installer wrapper, staged native scripts, payload and verified derived geometry. The local addon remains unsigned. The isolated installer verified launcher lease, interrupted installation recovery, reapply, unknown-file protection and removal.

The closed C: Steam upgrade and independent installer status check verified all 16 native scripts, 42 payload files and 240 geometry entries. Four save or configuration files retained their original hashes. The previous verified build is recoverable from private main commit `81d7cdecb407280260e6f491e7f1398d9e8ceb34` and the retained prior payload receipt. Gameplay confirmation is open for directional impact audio, actual audible attack onset, and resuming the Frosty Peak objective after the ice clears.

## Navigation audit corrections deployment

November 15, 2026. Installed source checkpoint `a6f2bc4d98b5c48da3eec325cd4b590bf379bd20` on Steam build 26578620. The verified plan SHA-256 is `c1258cae8b3ea4867799db7ff47f1dd6c93392463d63cc593703d4facd9c10a9`. The plugin hash is `fb47abfd20025667bf156fb0ad1eca07a752fe0e99f09400a5f8a058e7b6fa9f` and the locally derived geometry manifest hash is `e595b29985dc302432678a11b9d1653a0dc105091f8d2ae8d0bd51263235482a`. The focused build changed six mod files and the derived manifest.

The world suite passed 178,356 movement comparisons and checked 3,004 event pages across all 239 maps. The new cases exercised safe handoffs, actual route restoration, six bridge exits and live guide states. Warm worker returns for the new bridge and late story cases took 1.5–3.5 ms under the shared cap. The matching NW.js 0.48.4 fixture passed in isolation after a receipt timeout during a concurrent attempt. It measured 2.0 ms through cold browse submission, 2.7 ms for warm route submission, and 1.1 ms each for cave review and timed preview submission. The eight-step fixture took 0.35 ms baseline and 2.30 ms with beacon requests. These are capped stand-ins. Live responsiveness and audible timing remain gameplay checks. [Navigation verification](navigation-audit.md#navigation-audit-corrections) · [Manual guide](puzzles-and-secrets.md#state-aware-manual-guidance)

The exact staged installer, scripts, local geometry and payload passed Microsoft Defender custom scan `EC7D0A58-2FF6-428D-88E9-4BA36BCF99C5` at 05:27:12 PST. No matching threat was reported. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.311.0. Reused native files retain their existing signing status. The isolated installer verified lease, rollback, reapply, unknown-file protection and removal. The closed Steam upgrade and independent status check verified 16 native scripts, 42 payload files and 240 geometry entries. All four save and settings files retained their hashes. The previous verified plan is available at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-deep-fix/rollback-latest`.

When progression permits, request directions to the Cold Brew Trail cave chest with the crystal off. It should tell you that the chest is beyond a gap in the floor. Once the crystal opens the crossing, request directions again to hear the walking route. In Caffeine Caverns, request the south exit just before the setup tile. It should name the approach and give the final movement. Use Shift+G at the southern Salt Caverns entrance and after partial color progress, then check the next usable checkpoint or crystal in the Secret Cave.

## Breakfast Isles guidance and named exits deployment

November 15, 2026. Steam build 26578620, source checkpoint `52d3d3eb2767976dae4b5538d277c00ba676f848`. Verified plan SHA-256 `d5d3da3fdfd1e6625a96bc2c81cbbaf62d21a4bd6fec3927b9b8c0566b28e0a9`. Plugin SHA-256 `6a18b987c16dce7cc0eb1bbf815e5660edab67715bb5997840ad92a8f0b8fb8d`. Derived regional catalog SHA-256 `cd3c3331ec56404e82c12ceb1e67045a8a4b2ccd1e2584d0a2433bc8b108b2a0`. The focused build changed five mod files, the manifest and the regional catalog.

The offline round trip replay returned to all six original destinations after the verified bridge effects. The world suite passed 178,356 movement comparisons and the field suite covered activation, arrival and stale-route retirement. The matching NW.js fixture checked two spoken exit names with native transfer reservations and selection restoration. Under the runner, the warm route submission took 2.1 ms and the cross-map submission took 1.7 ms. The 41.0 ms silent speech receipt includes 40 ms fixture polling. Live timing and campaign play remain gameplay checks. [Route behavior and fixture](navigation-audit.md#breakfast-isles-onward-directions)

Defender custom scan `31976156-CC8B-4C39-980F-B22AE2BD8BCC` finished at 06:11:06 PST with no threats reported. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.311.0. The isolated installer passed lease, rollback, reapply, unknown-file protection and removal. The closed Steam install and independent status check verified 16 native scripts, 42 mod files and 241 geometry entries. All four save and settings files retained their hashes. The previous verified plan is under `C:/Games/Dev/WendyQuestAccess-analysis/wendy-breakfast-guidance/rollback-latest`.

The first gameplay check is directions to a bridge-blocked target in Poached Pool. Follow the named exit and request directions again through the overworld encounter and Shellside. After the Breakfast Stone Island encounter, follow the return and check that Directions resumes the original selection.

## Party attacks, Cold Brew Trail and navigation audio

The focused candidate replaces three payload files and reuses the verified native transforms, speech helper, runtime dependencies and geometry. Candidate plan 50f7f2e8afc4e3c06e5914d96f4497fb256f61798cf73683d01cbcc1cf0e6e95. The plugin, route solver and Windows audio addon respectively hash to 54ad8e775aa6c173bda21491d805bb22710dda43679ec8121d444faa7b51dbcf, 4ff9faf624946d7c7852bb484d25c91362acbdc30b200f34602b1dfeb8de9027 and ba1b10d676f012567131d6d58758ffac0a8892fb1a5e063416a6499b8f66e676. Signed Microsoft Defender platform 4.18.26100.4 scanned the exact stage with no threats, engine 1.1.26100.4 and definitions 1.463.311.0. The rebuilt addon is unsigned. The isolated installer verified launcher exclusion, exact install, rollback, reapply and removal.

The battle fixture used the installed normal action dispatcher and exact skill records. It verified Wendy, four companions, enemy movement announcements, miss speech, special moves and damage before defeat. The world suite checked 178,356 directed movement comparisons and 3,004 pages across 239 maps. The Cold Brew Trail fixture replayed a legal enemy step across the chosen route and verified the alternative exit selection across a distance tie. The isolated NW fixture verified keyboard menu focus and restart persistence, spatial playback through the rebuilt addon, route and quest marker ownership, and phase cancellation. The direct device fixture verified the source footstep waveform, HRTF and stereo wall seams, fade and cancellation through silent SDL.

The capped direct damage fixture took 2.56 ms from painted completion to formatted receipt. The capped soundscape fixture took 4.35 ms across 260 frames with soundscape enabled and peaked at 0.55 ms. The bundled NW test observed a warm wall preview in 40.0 ms with 40 ms polling and a warm battle cue at the silent SDL submission in 2 ms. Those fixtures use synthetic presentation and silent output. Audible onset, exact reported route behavior and whole-game latency remain gameplay checks. [Audio evidence](audio.md#pixel-remaster-core-samples) · [Navigation](navigation.md)

### MechBorg portrait wording

The pending batch also describes the rounded casing and the two orange-tipped tubes visible behind MechBorg’s shoulder. The normal and shocked portraits use the same outfit and machinery. The isolated speaker fixture verified the complete wording on I for both. The full dialogue fixture stopped at a Salt Caverns routing expectation. The same result reproduced with the unmodified portrait catalog. The supported NW package passed its smoke test.

The revised scanned plan is 3cda24f55508b4a1d82750ef8e8edde30e1470e893131c2e2d6cdbd3e4970613. Its only change from the staged party-attack batch is the bundled plugin, SHA-256 0e5556668f3ec921bc47874ecf204bce876c3a4525fcb88192af40ed45921dc7. Microsoft Defender scanned the revised stage with no threats. [Portrait catalog](../src/dialogue/character-art.js)

## Vehicle notices, Float Fort and visible chests

November 15, 2026. Installed on Steam build 26578620 under C:. Plan SHA-256 `c035b4c50c0755f26f8f3a99aef69db135629b9a85e111952ec1d57ef50d3664`. Plugin SHA-256 `9c3c1a88898c217fa79524bbf805776de2e5d50106bf78ed6c9e62f2a9ef8aad`. Speech formatter SHA-256 `7eab104984d6a9cd2f0a0e132d14cd8f9cfb461a5bd151bfae2dfc28faa4ae28`. The focused build updated the bundled plugin, speech formatter and checked MapScene registration. It reused the verified geometry and native services from the staged party attack, audio and portrait batch above.

The world test passed 178,356 native movement comparisons, including a Float Fort replay from the east-side overworld arrival through the west exit and a direct run from the west-side arrival. The vehicle fixture observed boarding and walking announcements after native handback and verified the aircraft readiness gate. It also checked 9,504 aircraft landing and flight cases. The field replay verified the visible Cold Brew chest in both Spoiler modes and Devilled Nook with Spoiler mode off, then obtained a walking route after each real terrain change. The world labels fixture verified Clothing. Normal gameplay remains the check for audible delivery and the player's complete routes.

The matching NW 0.48.4 test and the speech transport test passed with silent output. Under the shared cap, matching-runtime route submission took 2.0 ms warm. The Float Fort replay's tested town and overworld worker requests returned in roughly 1–2 ms warm. The native fixture used a stand-in renderer and interpolated movement completion. These measurements do not establish audible onset or whole-game lag.

Signed Microsoft Defender scan `AC06313F-EA31-45B9-8C42-B9111B8BA414` completed at 08:49:07 PST with no threats reported. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.311.0. The isolated installer passed lease, interrupted-install rollback, reapply, unknown-file protection and removal. The closed Steam upgrade and independent status check verified 16 native scripts, 42 payload files and 241 geometry entries. All four save and configuration files retained their hashes. The previous verified plan and payload are retained at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-party-attack-fix/rollback-latest`.

In play, use **West exit to world map** in Chillcrest, then select **Float Fort** on the world map. At the quay, follow **Board the boat from the quay**. Listen for “On boat” after boarding and “On foot” after a landing. Repeat with the airship when available. [Vehicle controls](navigation.md#native-vehicle-transitions) · [Map audit](navigation-audit.md#vehicle-maps-and-float-fort)

## World map labels, Nuggedor and prison descriptions

November 15, 2026. Steam build 26578620. The focused update rebuilt the plugin and narration, refreshed the speech formatter and local transfer catalog, and verified all 16 native script outputs. Candidate plan SHA-256 `789cb135103d4ab1d67635b0908155347ff79da8ffd9662495be0f2815517661`. Plugin SHA-256 `f79ccedebdb5aaed3cf196845262028c4382e815e4fb5b8e957f64a5fe0eaea9`. The signed Microsoft Defender scan `B099149B-500C-4AB6-9BE6-3DF0A2953B15` on the exact stage found no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.311.0. The reused native dependencies retain their prior signing status.

The world check covered 178,356 movement comparisons, 430 direct world-return pages, the two Nuggedor variants and the revealed ruin on the ship. The field, battle and speaker checks passed, as did the new native narration fixture and matching isolated NW smoke. The full dialogue fixture still stops at its Salt Caverns route assertion. The previous installed source reproduced that failure, and the dedicated world fixture verified four Salt Caverns chest plans and the solve order. The isolated installer passed verification, interruption rollback, reapply, unknown-file protection and removal.

The closed Steam upgrade and independent installation status passed. Verified 16 native scripts, 42 payload files and 241 geometry entries. All four save and configuration files retained their hashes. The previous installation's verified payload and receipt are at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-world-exits/rollback-latest`. Actual route playthrough and audio mix remain gameplay checks. [Navigation evidence](navigation-audit.md#world-exits-and-nuggedor-mine-route) · [Narration](cutscene-description.md)

## Nuggedor restaurant and field handback

November 15, 2026. The focused build changes the bundled plugin and two native scripts, the stock variable write and the MapScene readiness check. It reuses the other payload and geometry. Plan SHA-256 `1dd363c683b268cdef1b51e6e32ade9aa8fb21757c45ef9fb249cc5223132ba5`, plugin SHA-256 `f0399b5e91f83527fb3aed1663c955764d477b832fbdce7675a0170af499d6a4`. The exact candidate passed signed Microsoft Defender scan `951399B1-FC43-4481-8A16-AE29686595A4` at 10:14:12 PST, platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.311.0. Reused native files retain their existing signing status.

The field, quest, all-map and matching packaged NW.js checks passed. The isolated installer verified the launcher lease, interruption rollback, reapply, unknown-file protection and removal. [Native investigation and reproduction](navigation-audit.md#nuggedor-restaurant-and-follow-chomps)

The Steam install and independent status check verified 16 native scripts, 42 payload files and 241 geometry entries. All four save and configuration files retained their hashes. The previous verified payload and receipt are under `C:/Games/Dev/WendyQuestAccess-analysis/wendy-nuggedor-field/rollback-latest`. Actual field handback in a live game remains to be confirmed.

## Concise targeting and standalone quest markers

November 15, 2026. The focused build changes the bundled plugin. The other 41 payload files, 16 native transforms and 241 geometry entries match the previous verified plan. Candidate plan SHA-256 `78c6baec122aa853f3eb017fa72640ba661f2417ae1144c76614168be6da9a18`. Plugin SHA-256 `a0cce221bb6f5f87531f024e6c3ec46657d208dad22d806c98a14b531a9ad755`. Signed Microsoft Defender scan `6299745F-38AD-47A9-A8B1-39412D3445F3` at 10:49:07 PST found no threats on the exact candidate. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.311.0. Native file signing is unchanged.

The target fixture verifies focus with duplicate names, automatic HP, group order, explicit review, cancellation and protected battle phases. The matching runtime checks exact formatted focus speech. The world check verifies the three standalone Cauldron markers under Quests while rendered and absent when inactive. The waypoint and contact classification are covered by the native marker fixture. The isolated installer verified launcher exclusion, interruption recovery, reapplication and removal. Field HUD verification confirms the painted Momentum pips and the hidden-value guards. [Battle focus](battle.md#enemy-target-focus) · [Visible quest markers](quests.md) · [Field vitals fixture](../tests/party-vitals.test.cjs)

The installed Steam payload passed the independent status check. All four save and settings files retained their hashes. The preceding verified build is available at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-target-focus-speech/rollback-latest`. The updated announcements were verified offline.

## Field enemy names

November 15, 2026. The focused build changes the bundled plugin. The other 41 payload files, 16 native transforms and 241 geometry entries match the preceding plan. Candidate plan SHA-256 `6d3eaf8e175274c18ad7fd36c290d06d102d70ec505846a0522a000577bb658e`. Plugin SHA-256 `42a70f6c23e7b34cb97f4d33d5d49a4d39a5caa7891d4e5b692d93657344607f`. Signed Microsoft Defender scan `0287F62A-4A4F-4467-A3CB-1CF8AB5B3CA8` at 11:05:19 PST found no threats in the exact candidate. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.311.0.

The map check scanned all 239 maps and verified 205 encounter pages using 16 game enemy names. The field fixture verifies a stock encounter, a changed live graphic and the generic fallback. The matching NW.js smoke test and isolated installer tests passed, including launcher exclusion, interruption recovery, reapply and removal. [Field labels](navigation.md#destination-controls-in-the-development-build)

Installed to the closed Steam game and verified with the independent installer status check. All four save and configuration files retained their hashes. The previous verified build is available at C:/Games/Dev/WendyQuestAccess-analysis/wendy-field-enemy-names/rollback-latest. The new field speech was verified offline.

## Formation-backed field enemy audit

November 15, 2026. The installed Steam copies of the 239 maps, enemy database and formation database matched the verified stock data. The audit matched 16 distinct field graphics on 206 encounter pages against the enemy sheets referenced by 175 authored formations. Map 172 event 31 was the one visible encounter filed under Events. Its field sprite is a Heat Lamp. Formation 52 also contains a Lil Pink Salty. The native touch approach is preserved. The map fixture verifies its new label, the native contact route and removal when the completion page activates. Invisible ambush triggers keep their event role. [Field regression](../tests/local-destinations.cjs)

Candidate plan SHA-256 `f27092632ffcea7e53dd76a55c6728f44f2b18dda91e85ac3281408e6a07793f`. Plugin SHA-256 `68aeade138cbd07986c0317435cc17689194ea323849d6a3869d72f955f53d19`. The focused bundle is the only changed payload file. Signed Microsoft Defender scan `8066551C-2A6B-4918-BE7F-062AAD600E14` finished at 11:17:15 PST with no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.311.0.

The field fixture, all-map regression, matching NW.js smoke and installer rehearsal passed. The Steam installation and independent status check verified 16 native scripts, 42 payload files and 241 geometry entries. All four save/config hashes were preserved. The preceding verified build is available at C:/Games/Dev/WendyQuestAccess-analysis/wendy-formation-names/rollback-latest. The new label and the contact approach were verified offline.

## Kathryn categories and accuracy cue

November 15, 2026. All five Wendy's locations route to Kathryn behind the counter under NPC and to the order point under Merchants. Both labels use the native spelling, Kathryn. The checks include both Nuggedor order pages, native interaction approaches and bookmarks saved under the earlier categories. [Restaurant audit](navigation-audit.md#nuggedor-restaurant-and-follow-chomps)

The stock Blandhawk accuracy band can span five percent, roughly 40 ms at the standard sweep speed. In the native sweep fixture, a legal late band and a 30 ms cue-response delay produced a 95 percent miss before the adjustment. With the one-update lead, the same response and the earliest next-update response both land within the perfect band. Native outcomes at identical input times, Frozen pauses, Frosty slowdown and the Soggy cutoff passed. The capped fixture reported 7.88 ms for 20 native full sweep pairs and 10.32 ms with observation. These are fixture timings. Speaker or headphone latency has yet to be confirmed in gameplay. [Cue fixture](../tests/battle-cues.test.cjs) · [Timing and implementation](battle.md#radial-timing-tones)

Candidate plan SHA-256 `9b8825c9f67478f0c2409554c4f8ffcbdda6f20dc4abf25de1126398a3ccf24c`. Plugin SHA-256 `13c925e7b487acf7bcb906187900ccd1cd37221ceb67164aefc89d9963a91fad`. The bundled plugin is the single changed file. Signed Microsoft Defender scan `4F02B757-BCBE-4FE8-9C67-95551A19DA97` found no threats at 11:37:54 PST. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.311.0.

The all-map route fixture, native score checks, matching NW.js smoke and isolated installer rehearsal passed. The Steam installer and its independent status check verified 16 native scripts, 42 payload files and 241 geometry entries. All four save and configuration hashes were preserved. The preceding verified build is available at C:/Games/Dev/WendyQuestAccess-analysis/wendy-kathryn-timing/rollback-latest.

## Autowalk, Frydusa and the queued audio update

November 15, 2026. Installed from source checkpoint `765526f53e6d00c98c50ea781bf18c314a6f17bb` on Steam build 26578620. The focused candidate changed the accessibility plugin, narration pack and seven native observation files. It reused 241 verified geometry entries and 40 payload files. Plan SHA-256 `0c5c5ca5dacd208997a52b2f2a0bcebdf76593b4167e41a8a4c4c8189e226fd7`. Plugin SHA-256 `6b405e31885ff6b6c44b2509c0891c912d09a8315ce273d89b6075963b7c6404`. Narration pack SHA-256 `93e0591306b2204a12712017e9d806f3b4888cf3c2b7d0287a2c488e79550428`.

The stock world fixture, matching NW.js smoke and all 16 native syntax checks passed. The exact candidate passed the isolated installer rehearsal for launcher exclusion, interruption recovery, application, reapplication, unknown-file protection and removal. The signed Microsoft Defender scan `651F0DD2-A7A8-41F6-AA8F-8E819CF1CE55` completed at 12:58:58 PST and reported no threats for the exact staged payload, native candidates, geometry, plan and installer scripts. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.311.0.

The closed-game installer and independent status check verified the installed scripts, payload and geometry. All four save and configuration file hashes matched across installation. The preceding verified build is retained at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-autowalk-release/rollback-latest`, with source checkpoint `112bbd9851259317ef199800a7b915e20beb0725`. Cleanup removed 34,063,542 bytes of staging and the superseded recovery copy.

During gameplay, enable Autowalk under F8 → Navigation and request directions to a nearby NPC or object. Expect “Walking,” then “Arrived,” followed by any applicable prompt. At an exit, you'll hear the final movement or action instruction and complete the transition yourself. Check the updated idle and cutscene clips under F8 → Audio → Cutscene descriptions and the Vehicles category at Breaded Bay when progression permits. [Autowalk](navigation.md#native-input-boundary-for-autowalk) · [Narration](cutscene-description.md) · [Timing](battle.md#radial-timing-tones)

## Autowalk interaction facing and Cooking pot

November 15, 2026. Installed from source checkpoint `5d020d6552e4c7e4b63889d2768e47230ac48d1c`. The focused plan changes only the bundled plugin. The 16 native scripts, 41 other payload files and 241 geometry entries match the preceding plan. Plan SHA-256 `f664908f6a1ec74f1441536af66b10df0db48c9e11f2f6e469cb4f81ab56cdf7`. Plugin SHA-256 `a3d8b13d4788c8d245351ba744f912ab9fce13dff05d69b25b623c753a502658`.

The world and matching NW.js fixtures passed. The exact candidate passed the isolated installer rehearsal for launcher exclusion, interruption rollback, installation, reapplication, unknown-file protection and removal. Signed Microsoft Defender scan `77A39D66-D3AF-4762-8CC4-E54FE7E46317` completed at 13:21:00 PST with no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.311.0.

The independent Steam status check and installed plan and plugin hashes matched. All four save and configuration hashes matched before and after installation. The preceding verified build is retained in `C:/Games/Dev/WendyQuestAccess-analysis/wendy-facing-pot/rollback-latest`. Cleanup removed 34,454,681 bytes of temporary output and the superseded backup.

With Autowalk on, select **Cooking pot** in **Objects** in the Caves house. Request directions. At “Arrived,” press Confirm to inspect the pot. The offline check exercises arrival from an adjacent tile while facing away from the pot. [Autowalk](navigation.md#native-input-boundary-for-autowalk) · [Object labels](navigation-audit.md)

## Victory Momentum

November 15, 2026. Installed from source checkpoint `58108cf389399c49222ffb6ee6af3c9eb199b6a6`. The focused plan updates the bundled plugin, `rmmz_managers.js` and `BattleSceneArranger.js`. The other 14 native scripts, 41 payload files and 241 geometry entries match the preceding plan. Plan SHA-256 `c5ed881835020e95a865540cd4b5fabeb5af078a23e8b31741f1b15530a82edb`. Plugin SHA-256 `592abbe15ace680492d48500a9fd687d81f0919edd642f4f5207a3bedb1a0932`.

The exact candidate passed the native victory and regular Momentum fixtures, the matching NW.js smoke and the isolated installer rehearsal. Signed Microsoft Defender scan `020ED90D-46B4-49E5-9540-9C6EA893BE1F` completed at 13:59:04 PST with no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.317.0. The wider dialogue fixture reproduced the preceding build's Salt Caverns test failure. [Verification details](feature-checkpoint.md)

The closed-game installer and independent status check verified the installed files. All four save and configuration hashes matched before and after installation. The preceding Autowalk facing build is retained in `C:/Games/Dev/WendyQuestAccess-analysis/wendy-victory-momentum/rollback-latest`. Cleanup removed 24,217,756 bytes of staging and the superseded copy.

During gameplay, when a crystal arrives during victory, listen for “Momentum gained” and the filled pip count after the rewards. [Momentum behavior](battle.md#momentum-gains)

## Airship landing and Sunrise Bay

November 15, 2026. Plan SHA-256 `99631d6fd573e3676ded4a29dd373a4a16e93f3501bd1bd4c1f13f2f450ac2bf`. Plugin SHA-256 `7f432e6093777f41557777c4bf2951a9934a796f7dafc0cc9c44616ad4e30f70`. Nine other native scripts, 41 other payload files and 241 geometry entries match the preceding plan. The seven changed scripts carry the map update or native cancellation predicate.

The focused dialogue, world and matching NW.js fixtures passed. The exact release passed the closed-game installer rehearsal, including rollback, reapplication and unknown-file protection. Signed Microsoft Defender scan `B055A769-3247-45A2-87DE-CAE219472D5C` completed at 15:15:45 PST with no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.317.0.

In flight, cross from water onto eligible ground and listen for “Can land.” Moving between adjacent landable tiles or leaving the area is silent. In Sunrise Bay shop 3, select Shelly under NPC and follow directions to the counter. Press Confirm to talk and I to check her appearance. Inside Wendy’s in Sunrise Bay, Kitty and Jay have separate NPC entries. [Landing](navigation.md#airship-landing-trace) · [Sunrise Bay](navigation-audit.md#sunrise-bay-scene-npcs-and-counter-access)

Installed from source checkpoint `14260cc2258c181e3d04ae8665dc2d937e41625d` after the game closed. The independent Steam status and installed hashes matched. All four save and configuration hashes matched before and after installation. The preceding victory Momentum plan is retained in `C:/Games/Dev/WendyQuestAccess-analysis/wendy-airship-landing/rollback-latest`. Cleanup removed 36,096,634 bytes of disposable output and the superseded backup.

## NPC passages and food artwork

November 16, 2026. Verified Steam build 26578620. Plan SHA-256 6bb5c3cc7fdbf8b24e9cfe413a274bc99071cc038c93fe42f3647d80f30b2e73. Plugin SHA-256 c860e21c4b4579adc88f403d602355d3fc8009c185a2d64b7555055aa43215ad. Four worker and speech files changed alongside the bundle. The native BattleSceneArranger candidate SHA-256 is efb79447407461e2a74e9c38b5d9f0dc3dac24bebb6d9db0a20df6719ca51cbc. The other 15 native scripts, 37 payload files and all 241 geometry files matched the preceding plan.

The world, battle command and target fixtures passed with the stock development copy. All 32 enemy artworks declared in the game data were compared with the native animation assets and the text accepted by Details. The packaged NW.js smoke and the isolated installer rehearsal passed for the rebuilt payload. Signed Microsoft Defender scan 7E423495-EC24-495F-8813-396D8775F515 completed at 05:30:46 PST with no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.328.0. [Source and fixture evidence](feature-checkpoint.md#npc-passages-breakfast-isles-barrels-and-food-artwork)

In Cracked Cove, request directions to the checkpoint while the Search and Rescue Officer is in the passage. Expect the directions to his tile and “Blocked by Search and Rescue Officer.” Talk to him with Baconator in the party, then request directions again to the same destination. At Brekky Byway, Shift+M reads the current bacon bridge art. On the world map, leave Spoiler mode off and sail to the Secret Island boat landing. Follow the Secret Island route after dismounting and continue after the discovery marker. In battle, highlight Axoflopl or OrEggAmi and press I. In Special, move through the locked rows and press I to repeat the displayed requirement. The ultimate announces the three captions after they render. [Route cases](navigation-audit.md#npcs-blocking-passages) · [Battle Details](battle.md#visual-descriptions-while-targeting)

Installed from source checkpoint f44bd2035b5b81a46cbae77f18509b9694da262b after the Steam launcher closed. The independent status and hashes verified 16 native scripts, 42 payload files and 241 geometry entries. All four save and configuration hashes matched before and after. The previous Steam release is retained at C:/Games/Dev/WendyQuestAccess-analysis/wendy-npc-gates/rollback-latest. Cleanup removed 42,988,640 bytes of generated staging, fixtures, disposable logs and the superseded recovery copy.

## Secret Cave patrol tracking and Dave narration

The focused update is installed in Steam. It changes the plugin, crossing worker, patrol timing contract, speech formatter and narration pack. The verified install includes 16 native scripts, 42 payload files and 241 geometry files. All four save and configuration files matched their pre-install hashes. The installer fixture verified interruption rollback, reapply and removal. The prior verified plan is retained as the recovery copy.

- Installed plan SHA-256 `4dab3652aa010da47b7e89b734fce61fb19cdc62e1a0f2e017fb571efca054d9`
- Plugin SHA-256 `437fefeda67821ee093b10c266314332ef6d3d2923044dbe56042aedb3e032d7`
- Narration pack SHA-256 `d88c255dc2e5319eadfd3424ff76f851c1f8d1a66f9948acf7c1b3eff57e266f`
- The exact release stage passed Microsoft Defender scan `13DBA742-5E73-44D7-A272-254B929D6794` on November 16, 2026 with definition `1.463.328.0`.
- The rollback plan is `6bb5c3cc7fdbf8b24e9cfe413a274bc99071cc038c93fe42f3647d80f30b2e73` at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-barrel/rollback-latest`.

[Native patrol checks and player controls](puzzles-and-secrets.md#cave-timing-cues) · [Cutscene clips](cutscene-description.md#playback-and-verification)

## Compass cave pings and continuous crossings

The focused update is installed in Steam. It replaces the plugin, Windows audio addon, crossing worker, patrol world model and speech formatter. Native game scripts, geometry and all four save and configuration files matched the previous installation checks. The installer fixture verified staging, the launcher lease, rollback, reapply and removal. The boss review found that boss sprites use the existing HP gauge and needed no payload change.

- Installed plan SHA-256 `099563c93404161354345122069019c9c451d5bf160910fbae65b6c84e3396bf`
- Plugin SHA-256 `926f153f1207ae934f8fb2cf55763a4c8858cf7f42a2200fe7050ff7c67d4ac9`
- Audio addon SHA-256 `3f72352e146521824eb869940a3036779bf47ecadd3c02de58f88f755ac34e90`
- Microsoft Defender scan `564ABFCD-79E4-4C9A-A806-25FBC2DB2380` passed for the exact stage on November 16, 2026 with definition `1.463.328.0`.
- The rollback plan is `4dab3652aa010da47b7e89b734fce61fb19cdc62e1a0f2e017fb571efca054d9` at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-direction/rollback-latest`.

[Continuous crossing and playback checks](feature-checkpoint.md#compass-cave-pings-and-continuous-crossings) · [Boss HP producer](battle.md#boss-hp-bars)

## Idle narration and per-leg cave pings

November 16, 2026. The verified Steam installation changed the plugin, speech formatter, crossing planner, patrol timing contract, MapScene.js and rmmz_objects.js. The independent check verified 16 native scripts, 42 payload files and 241 geometry entries. All four save and configuration file hashes matched across installation. The exact candidate passed the isolated installer rehearsal for the launcher lease, interruption rollback, installation, reapply, unknown-file protection and removal.

- Installed plan SHA-256 `2e0a9221eb34115068b112e6341332d757044ae2c822979e52c74ccc6c4ac393`
- Plugin SHA-256 `c28d4dc26b55fd9d9faec18f6e63f4b8bc5ebc42430ad1baaee80aec80041c29`
- Signed Microsoft Defender scan `2A96EC77-C080-4AFE-8758-D77A397CF86A` completed at 07:03:48 PST with no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.328.0.
- Prior plan `099563c93404161354345122069019c9c451d5bf160910fbae65b6c84e3396bf` is retained at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-idle-cave-pings/rollback-latest`. Cleanup removed 35,189,991 bytes of generated outputs and superseded recovery.

Check idle narration with **Cutscene descriptions** enabled by leaving Wendy standing on a field map. In the first Secret Cave patrol room, request directions and listen for each crossing leg on the appropriate side. The north corridor crossing stops at a refuge. Request directions again from the refuge. [Offline results](feature-checkpoint.md#idle-narration-and-per-leg-cave-pings)

## Cave cue handoff after the first step

November 16, 2026. The focused Steam update replaces the bundled plugin and speech formatter. All 16 native scripts, 40 other payload files and 241 geometry entries matched the preceding plan. The installer rehearsal, independent status and all four save and configuration hashes passed. The matching NW.js and native world checks covered the stock movement handoff and the first crossing north from the side refuge.

- Installed plan SHA-256 `0c7ff5b5116ef9c25fae002784cde41898b5aca18d4b1f3608851490c175ca61`
- Plugin SHA-256 `d69161cbedb906c545ae0ad5084e374b224acca8860e897ff1a1ace86f4a5287`
- Signed Microsoft Defender scan `1F9578F9-17A5-461F-B51C-9F3EA0F762AD` completed at 07:20:24 PST with no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.328.0.
- Prior plan `2e0a9221eb34115068b112e6341332d757044ae2c822979e52c74ccc6c4ac393` is retained at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-handoff/rollback-latest`. Cleanup removed 36,009,580 bytes of generated outputs and superseded recovery.

From the first room’s side refuge the guide says to go one tile north on the ping, stop and request directions again. The later west-lane crossing is still unverified. [Offline checks](feature-checkpoint.md#cave-cue-handoff-after-the-first-step)

## Secret Cave crossing audit

November 16, 2026. The verified Steam update replaced the bundled plugin, speech formatter, crossing planner and patrol motion module. All 16 native scripts, 38 other payload files and 241 geometry entries matched the preceding plan. The installer rehearsal verified the launcher lease, interrupted-install recovery, reapply, unknown-file protection and removal. The independent Steam status check passed, and all four save and configuration hashes matched.

- Installed plan SHA-256 `f7112ff65e45ec2d584b4e642c856fbd5043f30fc4e84ba99d51dc7f5697a308`
- Plugin SHA-256 `462743485d0642cc79cc3c9dc8f67d5471a1234ce696cb7e2f04fdbdf2fec0a2`
- Signed Microsoft Defender scan `DF15A52D-1B27-4B5D-AA05-A74408F0CB52` completed at 08:13:54 PST with no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.328.0.
- Prior plan `0c7ff5b5116ef9c25fae002784cde41898b5aca18d4b1f3608851490c175ca61` is retained at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-crossings-audit/rollback-latest`. Cleanup removed 36,186,416 bytes of generated outputs and superseded recovery.

The world and matching NW.js fixtures passed. The replay reached the first and patrol-line room exits, verified the first distraction crossing and the next guard’s crystal, and followed all nine dash stretches in the chase room. [Verification scope](feature-checkpoint.md#secret-cave-crossing-audit) · [Cave controls](puzzles-and-secrets.md#secret-cave-room-handoffs)

## Five safe tiles from the first-room refuge

November 16, 2026. The Steam installer replaced the crossing worker and speech formatter. The plugin bundle, 16 native scripts and 241 geometry entries match the prior plan. The world fixture, matching NW.js smoke and isolated installer passed. The independent status verified 42 payload files and confirmed all four existing save and configuration hashes match.

- Installed plan SHA-256 `b8cbcb93a051bce6b9fd20665c7cbc7f799c4c906006461a1216f760d5764e9d`
- Crossing module SHA-256 `b3e08ba1fc1efb080f8b910b7b8fe3baecef77a4ac373d312bc56f3508c73afd`
- Speech formatter SHA-256 `e6a49821111e7de99c3a929bc722c03310ff0424eb56a0f152a41e39b478826f`
- The signed Microsoft Defender CLI completed a custom scan of the exact release with exit zero and no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.328.0.
- Prior plan `f7112ff65e45ec2d584b4e642c856fbd5043f30fc4e84ba99d51dc7f5697a308` is retained at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-refuge/rollback-latest`.

Cleanup removed 24,365,500 bytes of disposable build and test output. Automatic review blocked removal of the superseded rollback copy because it is recovery data. Both recovery copies are retained.

[Offline native replay and input scope](feature-checkpoint.md#first-room-refuge-to-the-next-crossing)

## Patrol-line loot and completed footsteps

November 16, 2026. The Steam installer replaced six mod payload files and added the completed-step observer to the pinned native objects script. Fifteen other native scripts and all 241 geometry entries matched the preceding plan. The exact candidate passed the world replay, matching NW.js smoke and installer rehearsal, including interruption restoration and unknown-file protection. The independent installation check verified 44 payload files and all four existing save and configuration hashes matched.

- Installed plan SHA-256 `d3950475d7573c0143844b458f808b857e2057c1a661480a1a70ecdabd7ab507`
- Plugin SHA-256 `52cd5fec5f7895f76cafee20b03f6f4e34c92d76a4a141c5552abf4c8fafeb7d`
- The signed Microsoft Defender CLI scanned the exact prepared files at 09:06 PST with exit zero and no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.328.0.
- One rollback is retained at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-loot/rollback-latest` with plan SHA-256 `b8cbcb93a051bce6b9fd20665c7cbc7f799c4c906006461a1216f760d5764e9d`. Cleanup removed 25,169,579 bytes of final disposable outputs and 21,781,605 bytes across two superseded rollbacks.

The earlier automatic review rejected a mixed cleanup request because it classified the included rollback directory as protected recovery data. The owner authorized its deletion explicitly. Both deletions subsequently passed as individual operations after identifying the superseded hash and verifying the newer retained backup, live installation and unchanged recovery structure. [Native tests and remaining live checks](feature-checkpoint.md#patrol-line-loot-and-native-footstep-completion)

## Manual guard-line routes

November 16, 2026. Installed the manual barrel, chest and exit routes for the second patrol room. Six mod payload files changed or were added. All 16 native scripts and 241 geometry entries match the preceding plan. The exact candidate passed the world fixture, matching NW.js smoke, and the isolated installer with launcher lease, rollback and unknown-file protection. Independent local verification passed with 45 payload files and four unchanged save and configuration hashes.

- Installed plan SHA-256 `2f6ce235116bd83247bcbdaf4dfc45abb5e671f5a919e39bb1cde8f60210c4cb`
- Plugin SHA-256 `d749bb155c74816765e4b3c895350be0b3b181dab7e1815775b520b45ac0473d`
- Signed Microsoft Defender CLI scanned the exact prepared files at 09:48 PST with exit zero and no threats. Platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.328.0.
- Exactly one rollback remains at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-manual/rollback-latest` with plan SHA-256 `d3950475d7573c0143844b458f808b857e2057c1a661480a1a70ecdabd7ab507`. Cleanup removed 24,421,115 bytes of final disposable output and the superseded 10,898,166-byte rollback.

[Native replays and live verification limits](feature-checkpoint.md#manual-routes-for-the-second-patrol-room) · [Manual and automatic controls](puzzles-and-secrets.md#secret-cave-room-handoffs)

### Secret Cave safe stops, guard footsteps and Autowalk

November 16, 2026. Installed and independently verified the Steam build. Two native scripts and six mod payload files changed. The installed plan verifies 16 native scripts, 45 payload files and 241 geometry entries. Four save and configuration hashes matched across the installation. The exact candidate passed the matching NW.js runtime, installer mirror and signed Microsoft Defender scan. The scan reported no threats with engine 1.1.26100.4 and signatures 1.463.328.0.

- Installed plan SHA-256 `e99e96652c2f1d84ec572610f4c9b285b274f73e75a77c35789413286a674d40`
- Plugin SHA-256 `b3de7d4543bd6dcda04a3458bd6ad6bc1ac81a66cffff19f4737ed70305545ca`
- Audio addon SHA-256 `78b54845e0e070f2ab1c7d2c5bf7ca5c5d42b343836dbf269f043c68f7568406`
- One verified rollback remains at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-pockets/rollback-latest` with plan SHA-256 `2f6ce235116bd83247bcbdaf4dfc45abb5e671f5a919e39bb1cde8f60210c4cb`.

Cleanup reclaimed 27,046,173 bytes of generated work and a 10,915,818-byte superseded rollback. [Offline verification and gameplay check](feature-checkpoint.md#secret-cave-safe-pockets-and-automatic-crossings)

### Secret Cave wait instructions and recovery routes

November 16, 2026. Installed and independently verified the update. Five mod payload files changed. All 16 native scripts and 241 geometry entries matched the prior release. Four save and configuration hashes matched before and after installation. The world suite, matching NW.js smoke, native audio fixture, installer rehearsal and signed Microsoft Defender scan passed. Defender engine 1.1.26100.4 and signatures 1.463.328.0 reported no threats.

- Installed plan SHA-256 `785ca48a44dab0794bb72493873496605da133dc7599c8035973c07f067ce868`
- Plugin SHA-256 `fd5ccd4b0aa7cbeee65f8b2d63e2f85af9cf1e200a8d6bf9095370cea303092a`
- Audio addon SHA-256 `34bf3bc7f7663eea91cec480d57b8a6553445de1beefc068ba7175fc6abaadbe`
- One verified rollback remains at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-waits/rollback-latest` with plan SHA-256 `e99e96652c2f1d84ec572610f4c9b285b274f73e75a77c35789413286a674d40`.

Cleanup removed 26,646,916 bytes of disposable build, staging and test geometry and the 10,929,326-byte superseded rollback. Automatic review declined removal of the small release and recovery scripts and plan receipt, so those records remain. [Crossing evidence](feature-checkpoint.md#secret-cave-announced-waits-and-patrol-lane-recovery)

### Silent Secret Cave crossing stops

November 16, 2026. Installed and independently verified the silent-stop follow-up. The bundled plugin and speech formatter changed. All 16 native scripts and 241 geometry entries matched the prior plan. Four save and configuration hashes matched across the installation. The native movement suite, matching NW.js smoke, installer rehearsal, and exact-candidate Microsoft Defender scan passed. Defender engine 1.1.26100.4 and signatures 1.463.328.0 reported no threats.

- Installed plan SHA-256 `104260e30cbb1ada9776bb51484d1c1a627e350914dda626e02037e91b57ce99`
- Plugin SHA-256 `37a0dbb96a55d797625eb13b7efbadc09749df6f56b42e1ef089f1635635df62`
- One verified rollback remains at `C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-silent-stop/rollback-latest` with plan SHA-256 `785ca48a44dab0794bb72493873496605da133dc7599c8035973c07f067ce868`.

Cleanup removed 24,459,580 bytes of disposable outputs and the 10,958,509-byte superseded rollback. [Silent stop and dash verification](feature-checkpoint.md#silent-cave-stops-and-native-dash-input)

### Wendy’s footstep cadence

November 16, 2026. The local Steam update rebuilt the bundled plugin and Windows audio addon. The installed-method world suite, matching NW.js smoke, native audio device fixture and exact installer rehearsal passed. The signed Microsoft Defender platform 4.18.26100.4 with engine 1.1.26100.4 and definitions 1.463.328.0 found no threats in the exact candidate. The rebuilt addon is unsigned.

- Installed plan SHA-256 `0545e57baa2c914e36988abc040049ff7e534937308187794f18e3f0fd24f47e`
- Plugin SHA-256 `cf82274fd93e5e7d5a9463f9372b9e3d017a395a2355f0d4945f94671f97b2c8`
- Audio addon SHA-256 `5574acb3d0fa29c6514adc58cdfc302491d6221d4aba6fd4148215c0d3c01d19`
- The single rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-footstep-cadence/rollback-latest with plan SHA-256 104260e30cbb1ada9776bb51484d1c1a627e350914dda626e02037e91b57ce99.

Installer readback verified 16 native scripts, 45 payload files and 241 geometry entries. The native script and geometry hashes match the prior release. Four save and settings hashes matched across installation. Cleanup removed 25,883,939 bytes of generated output and the 10,963,685-byte superseded rollback. [Validation and gameplay check](feature-checkpoint.md#wendys-footstep-cadence)

### Dash input and manual cave stop cues

November 16, 2026. The local Steam update changed the plugin bundle, speech formatter and one native transform in rmmz_objects.js. The exact installer rehearsal, installed-method world suite and matching NW.js fixture passed. Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4 and definitions 1.463.328.0 found no threats in the exact candidate.

- Installed plan SHA-256 `e94c544f1e91bbca8173a9d44469ce7244dcf460472c1d02d9e4720ff07f0b18`
- Plugin SHA-256 `a303f8d96a7e08e36656e02d1db356871e1a53b00a43bff5d587075e4e4f8e0b`
- Speech formatter SHA-256 `1a393b1b0dd2b28e87a1ee67baf08acf8fe371353156e304e46890578d9a8f3d`
- Movement transform SHA-256 `922cd1eed80d7415d07c69d12c2b776cc99c5fa922d130143c2fd27ffc08899c`
- The single rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-dash-keyboard/rollback-latest with plan SHA-256 `0545e57baa2c914e36988abc040049ff7e534937308187794f18e3f0fd24f47e`.

Install readback verified 16 native scripts, 45 payload files and 241 geometry entries. Four save and configuration hashes matched across installation. Cleanup removed 24,459,195 bytes of final build and staging data and the 10,963,694-byte superseded rollback. [Verification scope](feature-checkpoint.md#dash-input-and-manual-cave-stop-cues)

### Live keyboard dash trace

November 16, 2026. The local Steam diagnostic build updated the plugin bundle and the map-readiness and movement transforms. The exact installer rehearsal, world suite, focused diagnostic fixture and matching NW.js smoke passed. Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4 and definitions 1.463.328.0 found no threats in the exact candidate.

- Installed plan SHA-256 `c7236bd23e1e2a8b0c236fc7754446539c7107e9743622db42c8d02c2892347c`
- Plugin SHA-256 `500598b8dce97f4461c346ff7d5688e3bf10c6316814ed6397f6b3c577b04980`
- Map-readiness transform SHA-256 `82a77818d8b370aee43adcfd18c0685871d384a4e37ad5319409fc52830f6798`
- Movement transform SHA-256 `7c80b96bb456a39401b388dfe2fc5f29cb835afa50691779b4eb0d503e5afbe2`
- The single rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-dash-trace/rollback-latest with plan SHA-256 `e94c544f1e91bbca8173a9d44469ce7244dcf460472c1d02d9e4720ff07f0b18`.

Installed readback verified 16 native scripts, 45 payload files and 241 geometry entries. Four save and configuration hashes matched across installation. Cleanup removed 24,469,635 bytes of build and test output and the 10,964,620-byte superseded rollback. The recorder runs in the game session when a supported cave room is active and writes to the installed WendyQuestAccess-field.log. The live renderer PID and first comparison are pending the owner’s next session. [Verification scope](feature-checkpoint.md#live-keyboard-dash-trace)

### Retail walking speed and cave routing

November 16, 2026. The Steam installation now uses the cave guide verified against the active retail movement methods. The two temporary native trace transforms were restored to their pre-trace hashes. The exact installer rehearsal, installed-method world suite and matching NW.js smoke checks passed. Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4 and definitions 1.463.328.0 found no threats in the exact candidate.

- Installed plan SHA-256 `604c2f72b6f8e61be7d5600902c0bd70fb30911e488b5589fc835b309f74ad36`
- Plugin SHA-256 `67a666fc939b7bc2c2b45c40d46ef74f68ae910b64a1ccda4817343163a9c802`
- Crossing worker SHA-256 `86a7d4f709e7dbdc404a88689e2b38cf5ddc2f1a363ea456dc1a2dba2ff0fefe`
- Patrol motion worker SHA-256 `4224332a42a41aa9c135f6ce431ade93fb722b2d97ce364ee94ecd88547e4475`
- The single rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-retail-pace/rollback-latest with plan SHA-256 c7236bd23e1e2a8b0c236fc7754446539c7107e9743622db42c8d02c2892347c. The prior source revision is a21c367582cf1386f637a43ddef3bbfe13652369.

Readback verified 16 native scripts, 45 payload files and 241 geometry entries. Four save and configuration hashes matched across installation. Cleanup removed 24,824,166 bytes of build, staging and test output and the 10,963,694-byte superseded recovery. The exact scan receipt and the four lines from the live speed comparison remain in the C: analysis workspace. [Cave route and verification scope](feature-checkpoint.md#retail-walking-speed-and-cave-routing)

### Cave ping cadence and explicit pauses

November 16, 2026. The focused build changed the plugin, speech formatter and four patrol workers. It reused the verified native and geometry hashes. The world suite, matching NW.js smoke and installer rehearsal passed. The bounded replay reported 0.11 ms for a sampled cave capture and 0.12 ms for postrender cue recheck and enqueue. The NW fixture observed a warm SDL submission after 47.0 ms using 40 ms polling and silent output. These fixture timings leave audible gameplay timing to be confirmed. Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4 and definitions 1.463.328.0 found no threats in the exact candidate.

- Installed plan SHA-256 `07cdf5ce031203935928cfe80afb9fe11609124fd6c40613dc276b3763d8950e`
- Plugin SHA-256 `95a022c4ddf1bd899e8373d8dc91a5daa36cd5d696c955bcf837d89682f3984a`
- Speech formatter SHA-256 `93cfa1b81831efd3b95dfe4a0ebfe73c285fe9697d499d8706531b4afd712ffe`
- Patrol motion worker SHA-256 `df3312b6fa7c0baf555b513e6046ee48aa7d045350477a078e39a6112b515218`
- Patrol line state worker SHA-256 `946e290563cb03ac3fbac0466c2171ca2294884c2c803d8c44ab49ace171bd86`
- Patrol line manual worker SHA-256 `04efc155451f38ea5d1479f7b02854d08fd7e6ef7386501ea797facaac809ff1`
- Patrol line worker SHA-256 `e4e9150c51207db691b088e9c771246d9abe942d9dc3d90e40087bf14fac8627`
- The single rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-cadence/rollback-latest with plan `604c2f72b6f8e61be7d5600902c0bd70fb30911e488b5589fc835b309f74ad36`. The prior source revision is `7e1a3ce6bfe57caf5fb489c963cfb414521b0d60`.

Readback verified 16 native scripts, 45 payload files and 241 geometry entries. Four save and configuration hashes matched across installation. Cleanup removed 24,468,765 bytes of staging and test output and the 10,968,375-byte superseded recovery. [Cave replay and gameplay check](feature-checkpoint.md#cave-ping-cadence-and-explicit-pauses)

### Silent cave misses, stop sound and checkpoint handoff

November 16, 2026. The focused rebuild changed the plugin bundle. The verified gameplay workers, native scripts and geometry were reused. The world replay, focused capture handoff fixture, audio priority unit fixture, matching NW.js smoke and installer rehearsal passed. The world fixture sampled 0.11 ms for cave capture and 0.13 ms for cue recheck and enqueue. The matching NW.js fixture observed native cue submission after 32.3 ms with silent output and 40 ms polling. Physical audibility remains a gameplay check.

- Installed plan SHA-256 `eb9ee4a09ae7d83677234e43011c6dc0fecea8ee0cd0f606b3d3eeace423f7c2`
- Plugin SHA-256 `c801350a704f0c50cfc536f654e32ecf097a97aeda52035fe80495a1eab72ded`
- The single rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-quiet/rollback-latest with plan `07cdf5ce031203935928cfe80afb9fe11609124fd6c40613dc276b3763d8950e` and source revision `40a7030fa1a7878be3e93db2963309196709df76`.

Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4 and definitions 1.463.328.0 found no threats in the exact candidate. Installation verified 16 native scripts, 45 payload files, 241 geometry entries and four unchanged save and configuration hashes. Cleanup removed 24,468,480 bytes of generated build and test output and the 10,964,172-byte superseded recovery. [Cave verification](feature-checkpoint.md#silent-cave-misses-stop-sound-and-checkpoint-handoff)

### Autowalk and native inactivity

November 20, 2026. The focused rebuild updated the plugin and the native MapScene activity condition. Verified payload workers, native libraries and geometry were reused. The world replay, ordinary idle narration fixture, matching NW.js smoke and installer rehearsal passed. The bounded NW fixture compared 4,800 native activity updates with physical input, 2.67 ms total, against standing and interpolated Autowalk, 5.91 ms total. The extra work was 3.24 ms across the simulated 80-second episode. Physical gameplay performance remains unmeasured.

- Installed plan SHA-256 `1b08f03a09769a23a7dc8111908367cd7364b125214f476f68139413c4cdf821`
- Plugin SHA-256 `4a992f15a77526bcb2251c940932ea90f71efc81301fde376165c8556aa2d91d`
- MapScene transform SHA-256 `9afa5c1bef523384a55c186d5f230be4fd8ffa60f6c05e0077c0e50739c458f0`
- The single rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-autowalk-idle/rollback-latest with plan `eb9ee4a09ae7d83677234e43011c6dc0fecea8ee0cd0f606b3d3eeace423f7c2` and source revision `446f13ad3982f28a3c45389932e516065a2962be`.

Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4 and definitions 1.463.386.0 found no threats in the exact candidate. Installation readback verified 16 native scripts, 45 payload files, 241 geometry entries and four unchanged save and configuration hashes. Cleanup removed 24,468,907 bytes of build and test output and the 10,965,101-byte superseded recovery. [Autowalk verification and remaining gameplay check](feature-checkpoint.md#autowalk-and-native-inactivity)

### Autowalk keyboard toggle

November 20, 2026. The focused plugin rebuild adds the saved Ctrl+Backslash toggle in both navigation layouts. Native input, full world regression, matching NW.js smoke and the exact installer rehearsal passed. The keyboard runtime verified held-repeat suppression, cancellation between tiles and persistence after restart. No native script, geometry or worker change was needed. The other 44 payload files were reused by verified hash.

- Installed plan SHA-256 `914712f7638eff57151959760ca32e0e95d5b61283e1207efd5e486cd21577ab`
- Plugin SHA-256 `f0603a208246f67474dc15c09de362f5182fc839de09881586a960870257f37e`
- The single rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-autowalk-key/rollback-latest with plan `1b08f03a09769a23a7dc8111908367cd7364b125214f476f68139413c4cdf821` and source revision `5a1bc0c4f314dd19ba4792049f41a0cfbf221479`.

Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4 and definitions 1.463.386.0 found no threats in the exact candidate. Closed-game installation readback verified 16 native scripts, 45 payload files, 241 geometry entries and four unchanged save/config hashes. Installed status is verified. Cleanup removed 24,444,237 generated build/staging/world-test bytes and the 10,965,810-byte superseded rollback, followed by the disposable task scripts and runner receipts. [Implementation and verification limits](feature-checkpoint.md#autowalk-keyboard-toggle)

### Distraction routes and concise chase guidance

November 20, 2026. The focused build updates the plugin, crossing worker and patrol-motion worker. It reuses 42 verified payload files and all 241 geometry entries. Seven native transforms extend the existing scene/resource gates and accepted-step/event observations for the scoped chase owner. All 16 transformed scripts passed syntax checks. Native input, the full world regression, final matching NW.js runtime and exact installer rehearsal passed. The additional field replay covers the authored distraction-room entrance, all crystals and checkpoints, manual cue-driven traversal and all nine automatic/manual chase handoffs.

- Installed plan SHA-256 `4cedc9ec52b8307a3998a671e0c15c905cb15effbf92a9a07cef18d4057901a2`
- Plugin SHA-256 `e1a5009573c2469abedd880212c7d5d4cfe982aa692865b19211b8e49b347138`
- Crossing worker SHA-256 `ce6215327f74ed2a08302c30f298f5eaaeed26ac21b3cb00983773bdaa754d8a`
- Patrol-motion worker SHA-256 `bffd8db4eed4374eb8fdfc9d88249054e2cd42f8a7954c5097a6f23843b10e56`
- The single rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-distraction-chase/rollback-latest with plan `914712f7638eff57151959760ca32e0e95d5b61283e1207efd5e486cd21577ab` and source revision `d667691ea18d7d47047dc14bbed1289549b27e7e`. It includes verified prior native transforms as well as payload and geometry, so recovery does not depend on the newer transform implementation.

Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4 and definitions 1.463.386.0 found no threats in the exact final candidate. Closed-game installation readback verified 16 native scripts, 45 payload files, 241 geometry entries and four unchanged save/config hashes. Cleanup removed 24,473,616 generated build/staging/world-test bytes, 29,153 disposable script/log bytes and the 10,966,102-byte superseded recovery. The resource-slot wait that returned busy launched no child and was retried under the same limits after the installer check released its slot. [Behavior, limits and gameplay procedure](puzzles-and-secrets.md#distraction-crystals-and-current-chase-legs)

### Distraction-barrel prerequisite and interaction

November 20, 2026. The focused candidate rebuild updates three mod files: plugin, route worker and crossing worker. It reuses 42 verified payload files, all 16 existing native transforms and all 241 geometry entries. Exact reported-start and both-barrel manual/automatic field replays, first two patrol rooms, nine chase handoffs, 178,356 directed world comparisons, native input and matching NW.js 0.48.4 smoke passed. The installer rehearsal verified staging, launcher lease, interruption rollback, install/reapply, unknown-file protection and removal. Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.386.0 found no threats in the exact candidate. Closed-game installation readback passed: 45 payload files, 16 unchanged native scripts, 241 geometry entries and four preserved save/config hashes. Installed status is verified.

- Installed plan SHA-256 `e09cf1b99aeaebd9ae2941f5342e333d178ea70694b63ebe7de36e0ebfd0bef1`
- Plugin SHA-256 `8039d748382d8808c88b0fc8e345697f602d1459d36753da0d7619e74f8dd11a`
- Route worker SHA-256 `943b0e9decd160dec20d8911a28b3d193797c362e82847e60a79821fef60192f`
- Crossing worker SHA-256 `e9f47096e03640c05581c7a1c0d51857a2d55a35507a7b24ad9c46fa7233100c`

The game-side integration and native registration hashes are unchanged. [Scope, behavior and limits](puzzles-and-secrets.md#distraction-room-barrel-prerequisites). The initial full-world invocation lacked the cleaned packaged worker and stopped; the focused package was then built and the complete replay passed.

Source checkpoint `41f6c0a9ad06e89e654f5420ffa47276635c8522` was pushed to the owned private origin/main and the remote ref matched before deployment. The single verified recovery is C:/Games/Dev/WendyQuestAccess-analysis/wendy-barrel-distraction/rollback-latest, containing preceding plan `4cedc9ec52b8307a3998a671e0c15c905cb15effbf92a9a07cef18d4057901a2` and source `9bfa20c1473f4b251bac92f16854a62a6978a7e8`. Its payload, geometry and native bytes were verified before installation. The superseded recovery was removed. Gameplay confirmation of this barrel's physical cue and action timing remains open.

Task-close cleanup removed 25,261,648 generated build/staging/geometry-test bytes, 42,294 disposable probe/script/log bytes and the 13,396,746-byte superseded recovery. The current task directory retains only the exact Defender result and the single verified rollback. Tests ran under C: in the capped 816 MB, one-worker resource runner; no retired-drive work, game launch or live probe was performed. Rebuild at the checkpoint using the canonical bundler and installer, reuse verified unchanged payloads, and replace the plugin, route worker and crossing worker. The exact installer plan and hashes above identify the shipped result.

### Crystal-first guidance

November 20, 2026. The focused build changes the plugin, crossing worker and speech formatter. It reuses 42 verified payload files, all 16 native transforms and all 241 geometry entries. Both barrel routes now resolve their first required crystal before walking directions. Repeated Directions stays on the crystal, including at its action point. Post-activation native readiness takes a fresh snapshot for the selected destination. The existing pickup/retreat is preserved.

The final focused field replay, full 178,356 world comparisons, earlier patrol rooms, nine chase handoffs, native input, speech transport, matching NW.js 0.48.4 smoke, exact installer rehearsal and packaged syntax checks passed. The final runtime invocation initially found both shared resource slots occupied and launched no child. It was retried under identical limits after the world replay released its slot, and passed. Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.387.0 found no threats in the exact final candidate. Closed-game installation and readback passed: 45 payload files, 16 unchanged native transforms, 241 geometry entries and four unchanged save/config hashes. Installed status is verified.

- Installed plan SHA-256 `128b13779087f3fbf1b58bf6644f14ee4fd5f6f50f5775c4899714e5d685e796`
- Plugin SHA-256 `f51a781071ec88df1ff8bfc57daba4eda914e53f744dfae72e4f8cfb2c3c0a9b`
- Speech formatter SHA-256 `d3599afdb1d8f452aac063063265c0ec53a7f40bea48103632e2124e7a8706a9`
- Crossing worker SHA-256 `e22b25f7a5b6f68f1120136b0c1e9ebe54e54de316b5df90ee1ee0db47528979`

[Behavior, finite dependency test, callback accounting and gameplay limits](puzzles-and-secrets.md#crystal-first-route-ownership). No native game script, DLL, geometry, timing preference or saved setting is changed by this correction.

Source checkpoint `331058d9251460c5142c568602429a60b24b0791` was pushed to owned private origin/main; the remote ref matched before deployment. The single verified rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-crystal-first/rollback-latest, containing preceding plan `e09cf1b99aeaebd9ae2941f5342e333d178ea70694b63ebe7de36e0ebfd0bef1` and source `d15ba93bb0f73c062952627ce180627b18bc5632`. Its payload, native bytes and geometry were verified before replacement. The superseded optional recovery was removed. Gameplay confirmation remains separate.

Task-close cleanup removed 25,652,992 generated build/staging/test bytes, 99,323 disposable script/probe/log bytes and the 13,412,387-byte superseded recovery. The current task folder retains only the exact final Defender result and one verified rollback. Rebuild from the source checkpoint using the canonical bundler/installer; reuse verified unchanged dependencies and replace the three mod files identified above. No game launch, control or live probe was performed.


## Automatic manual patrol legs and crystal escape

November 20, 2026. The focused bundle and formatter candidate passed the full world, patrol/crystal/chase, native input, speech transport, exact script syntax, matching NW.js 0.48.4 runtime and installer recovery checks. The two obsolete long-form speech assertions in the full-world and NW fixtures were updated after their failures; both complete checks then passed. Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.387.0 found no threats in the exact final candidate. The candidate contains 45 mod payload files, 16 patched native scripts and 241 geometry entries. Two mod payload files change, plus the existing MapScene ready condition for an accepted manual action; 43 payload dependencies, 15 other transforms and all geometry are reused unchanged.

- Candidate plan SHA-256 `9cbf0477e1bff10c7d1fba4f370ee771aeecff20554d4f0851a62fc2d3a1a4f6`
- Plugin SHA-256 `a57374a3cba5e1b071587fa29b36765343dc56d558d53b6bbede36a2c304e436`
- Speech formatter SHA-256 `5f67657830f929ac784f42e23eccd24e6947544a4987246b52886fcd716fe985`
- Patched MapScene SHA-256 `a1cbd67c73d7a40583a775d81e004dde884a14b068d9e46934c6a1faedb38732`

[Behavior, source-boundary cause, bounds and gameplay procedure](puzzles-and-secrets.md#automatic-manual-patrol-legs-and-crystal-escape). [Scope and verification](feature-checkpoint.md#automatic-manual-patrol-legs-and-crystal-escape). The temporary candidate staging was C:/Games/Dev/WendyQuestAccess-analysis/wendy-patrol-legs-candidate; it was removed after verified installation. Deployment targets the established Steam installation only, preserving verified originals, a single rollback and saves/settings. No game launch, control or live probe is part of the task.


Closed-game deployment passed the manifest/launcher lease and exact readback. The installed plan matches the candidate above; all 45 mod payload files, 16 patched native scripts and 241 geometry entries match. Original game recovery bytes and all four save/config hashes are unchanged; no browser preferences were written. Installer status is verified. The single optional rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-patrol-legs/rollback-latest, containing previous plan 128b13779087f3fbf1b58bf6644f14ee4fd5f6f50f5775c4899714e5d685e796 and source checkpoint 3e4fed7823d92bf1f4bd0b25e3916b4a7bdc6437. Its complete native bytes, payload and geometry were verified. The superseded optional rollback was removed before copying the current known-good install. The deployment script included a previous-transform recovery branch for the changed MapScene hash; it was not needed.

The current source checkpoint c813feec8dbfb680c2ac9e585d67ada92b58ff02 was pushed and the private remote ref verified before deployment. Task-close cleanup removed 24,549,475 generated build, staging, fixture and disposable analysis/log bytes. Only the exact final Defender result and verified rollback remain in this task's analysis folder. For reproduction, use the canonical bundler for plugin changes, copy the current speech formatter, reuse hash-verified dependencies/geometry, and compute the current native registration plan; do not assume the previous MapScene transform is unchanged. Full-world and matching-runtime fixtures pass with current-leg expectations. Gameplay confirmation is separate and remains open.


## Repeat crystal activation after capture

November 20, 2026. The focused single-plugin candidate passes the full world, native capture recovery, input, transport, packaged syntax and matching NW.js 0.48.4 checks. The source-matched regression proves automatic escape after a no-dialogue repeat activation from both recovery guidance and a directly selected crystal. Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.387.0 found no threats in the exact final candidate. Candidate contains 45 payload files with only the plugin changed; 44 dependencies, all 16 existing native transforms and 241 geometry entries are reused by verified hash.

- Candidate plan SHA-256 `dc73e113fd20a589a94908a8aff6ec688fd7ecaf2958e6b9daeff08791efe12f`
- Plugin SHA-256 `a0d12fcd4ee520725c569941f8237dad7430cd93fcf1f272852d68f39fd7a72a`

[Cause, native locators, ownership, bounded costs and gameplay check](puzzles-and-secrets.md#repeat-crystal-activation-after-capture). [Scope and verification](feature-checkpoint.md#repeat-distraction-crystal-after-capture). The exact installer rehearsal, closed-game local deployment and final cleanup are complete. No game launch/control/probe is authorized or performed.


Closed-game manifest/launcher admission and installed readback passed. Plan dc73e113fd20a589a94908a8aff6ec688fd7ecaf2958e6b9daeff08791efe12f matches all 45 payload files, 16 native scripts and 241 geometry entries. Four save/config hashes and original native recovery bytes are unchanged; browser preferences were not written. Installer status reports Installed and verified. Source checkpoint 3a4e2ad852637f201bd3e7bf1dbc1e87a17cbe8b was pushed and the private remote ref verified before deployment.

The single optional rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-crystal-repeat/rollback-latest, containing preceding plan 9cbf0477e1bff10c7d1fba4f370ee771aeecff20554d4f0851a62fc2d3a1a4f6 and source checkpoint ec361c34cf599cf91977fb54d2cf466f579c9bde. Its native bytes, payload and geometry were verified. The superseded optional rollback was removed before copying the known-good installed version. Cleanup removed 24,546,232 generated build/staging/fixture/disposable analysis bytes. The task folder retains only the final Defender result and verified rollback. Two older closed-task logs were pruned under retention; their deployment results and newer world receipt remain, bringing retained development logs to 20. Rebuild with the canonical bundler, replace only the plugin, reuse hash-verified dependencies/geometry and the unchanged current native transforms, then use the canonical installer. No game launch, control or live probe was performed. Physical feedback and repeat-activation gameplay confirmation remain open.


## Autowalk crystal handoff and exposed escape

November 20, 2026. The focused candidate changes the plugin, crossing worker and shared patrol-motion constants. All 42 other payload dependencies, 16 native transforms and 241 geometry entries are reused by verified hash. First-use/repeat crystal Autowalk, direct/recovery guide entry, ten exposed native phases and delayed manual escapes pass alongside both prior rooms, both barrels, all crystal/chase handoffs and 178,356 world comparisons. Native input, transport, capture recovery, packaged syntax and matching NW.js 0.48.4 runtime pass. Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.387.0 found no threats in the exact final candidate. The exact installer rehearsal, closed-game deployment and final cleanup are complete.

- Candidate plan SHA-256 `dafaad1b518d172ac167c148b61ef4106dc1095a37ed775e08d9692e2b2ab783`
- Plugin SHA-256 `b1dc9e923af23014f958634170ff8488a82e75e079081911109a6b39d9413d9a`
- Crossing worker SHA-256 `2598f4bc1f83dd1e77045fdd46b835cf0ce6cb77391100a99442677daf8ba7c4`
- Shared patrol-motion SHA-256 `7a69bd97181a96852eb1e0a1a7fad0f42c842800d02efc12e949eb3e02e7a2bc`

[Mode correction, forecast bounds, native phase evidence and gameplay limits](puzzles-and-secrets.md#automatic-crystal-handoff-and-exposed-escapes). [Scope checkpoint](feature-checkpoint.md#autowalk-crystal-handoff-and-exposed-escape). No game launch, control or live probe was performed.


Exact installer rehearsal passed staging, launcher lease, interruption rollback, install/reapply, unknown-file protection and removal. Closed-game install and readback match plan dafaad1b518d172ac167c148b61ef4106dc1095a37ed775e08d9692e2b2ab783 and all 45 payload, 16 native and 241 geometry entries. Four save/config hashes and original recovery bytes are unchanged; browser preferences were not written. Installer status is verified. Source checkpoint 03e4ea69499010515491970a76e843dd994875c4 was pushed and private origin/main verified before deployment.

The single optional rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-escape/rollback-latest, containing preceding plan dc73e113fd20a589a94908a8aff6ec688fd7ecaf2958e6b9daeff08791efe12f and source checkpoint c48331a5b1f931182ef49345287101b67da71b9f. Its complete native bytes, payload and geometry were verified. The superseded rollback was removed before copying the known-good installation. Task cleanup removed 24,576,719 generated build/staging/fixture/probe/log bytes. Only the final Defender result and verified rollback remain in the task folder; pruning one older closed-task world log keeps retained development logs at 20. Its results remain recorded in the earlier deployment section and current full regression. Rebuild with the canonical bundler and the crossing/patrol-motion worker sources above, reuse verified dependencies/geometry and unchanged native transforms, then use the canonical installer. No game launch/control/live probe was performed. Physical post-crystal continuation and escape feedback remain gameplay checks.


## Second crystal native interaction handoff

November 20, 2026. The focused candidate changes only the bundled plugin, reusing all 44 payload dependencies, 16 native transforms and 241 geometry entries by verified hash. The regression reproduces capture at 34,20 when a resource closure gates the early notifier despite native interpreter acceptance, and verifies checkpoint/barrel continuation plus direct manual/automatic second-crystal handoff after the fix. The full 178,356 world comparisons, current patrol/loot/crystal/chase replays, native controls, four capture recovery branches, retail prompt fixture, speech transport, final packaged syntax, matching NW.js 0.48.4 runtime and exact installer interruption/recovery rehearsal pass. The stricter chase-order discrepancy is recorded separately and does not change production chase behavior. Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.387.0 found no threats in the exact final candidate.

- Candidate plan SHA-256 `ba0428f995f5804ce30882e240c2321002ddcbd75a7cc22ffa7ef34e4efa4c46`
- Plugin SHA-256 `87d1a937351a6dc07062f1b59889b27a7697167fb78166629af0a0e99fa444ab`

[Native acceptance source, queued token lifetime, full action path, bounded diagnostics, fixture limits and gameplay check](puzzles-and-secrets.md#second-crystal-native-interaction-handoff). [Scope checkpoint](feature-checkpoint.md#second-distraction-crystal-interaction-and-continuation). The final closed-game installation, readback and cleanup are complete. No game launch, control or live probe was performed.


Closed-game manifest/launcher admission and installed readback passed. Installed plan ba0428f995f5804ce30882e240c2321002ddcbd75a7cc22ffa7ef34e4efa4c46 matches all 45 payload files, 16 native scripts and 241 geometry entries. Original native recovery bytes and all four save/config hashes are unchanged; browser preferences were not written. Canonical installer status reports Installed and verified. Source checkpoint c9e4f062bc75bd890a3e7709f74eb3b31ff1ac48 was pushed and the owned private origin/main ref verified before installation.

The single optional rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-second-crystal/rollback-latest, containing preceding plan dafaad1b518d172ac167c148b61ef4106dc1095a37ed775e08d9692e2b2ab783 and source checkpoint 54b72e7a527d4ab7f6f806c966d99bce24b5fc90. Its payload, native bytes and geometry are verified; the superseded optional copy was removed. Cleanup removed 24,603,901 generated build, staging, fixture, disposable analysis and superseded log bytes. Only the exact final Defender result and verified rollback remain in this task folder. Pruning the older closed target-focus world log leaves 20 retained development logs; its verification results remain documented and are superseded by the current full world regression. Raw task receipts were discarded after preserving decisive source-matched findings and measurements in the linked puzzle/checkpoint records.

Rebuild with the canonical bundler, replace only the plugin and reuse hash-verified installed dependencies/geometry and all unchanged native transforms. Repeat the documented full-world, native input/transport/recovery/prompt, matching NW, exact installer and final-payload security checks before deployment. No game launch, control or live capture was performed. Physical interaction/escape confirmation remains a gameplay check. The stricter chase-order fixture discrepancy remains recorded separately and is not claimed resolved by this crystal update.

## Native refresh retention and automatic cave collection

November 20, 2026. The focused candidate changes the plugin and crossing worker. All 43 other payload files, 16 native transforms and 241 geometry entries are reused by verified hash. The native readiness regression reproduces the prior second-crystal capture at 34,19 and passes after correction. Full-world, native input/transport/capture recovery/prompt, packaged syntax, matching NW and exact installer staging/launcher-lease/interruption/rollback/reapply/protection/removal checks pass. Eight native pickup lifecycle cases pass with the documented local Map 199 approach limits. Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.387.0 found no threats in the exact final candidate.

- Candidate plan SHA-256 `517a914c3393bcf1b64222ae5f49f9ff8b418846e89dfa5168e4a7602751e769`
- Plugin SHA-256 `641bf7fb7168b631b1e4ef3e044f05e4ece25a56c6a08c4c9c5e33f1abc07576`
- Crossing worker SHA-256 `724709a7bd59df4a0888f2b2b3a071dd7211079967ed03c8b3031aa32954bbae`

[Cause, native phase ownership, pickup set, fixture measurements and gameplay limits](puzzles-and-secrets.md#native-page-refresh-and-automatic-cave-pickups). [Scope checkpoint](feature-checkpoint.md#cave-interaction-locks-interrupted-walking-and-automatic-pickups). Final closed-game installation, readback and cleanup are complete. No game launch, control or live probe was performed.


Closed-game manifest/launcher admission and installed readback passed. Installed plan 517a914c3393bcf1b64222ae5f49f9ff8b418846e89dfa5168e4a7602751e769 matches all 45 payload, 16 native and 241 geometry entries. All four save/config hashes and original native recovery bytes are unchanged; browser preferences were not written. Canonical installer status reports Installed and verified. Source checkpoint c5f49024557ff823f0e0da670328922f532024f8 was pushed and the owned private origin/main ref verified before deployment.

The single optional rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-actions/rollback-latest, containing preceding plan ba0428f995f5804ce30882e240c2321002ddcbd75a7cc22ffa7ef34e4efa4c46 and source checkpoint c140a269e7ae8bfacc2ccb9bef8515d1960f8a96. Its complete payload/native/geometry hashes are verified. The superseded optional copy was removed before copying the current known-good installation. Cleanup removed 29,775,210 generated build, staging, fixture, disposable analysis and superseded-log bytes. Only the exact Defender result and verified rollback remain in this task folder. Pruning the older cave-silent-stop world log, whose result is superseded by the current complete regression and retained deployment record, leaves 20 long-term development logs. Original stock/RE inputs, installed payload, settings and saves remain untouched by cleanup. Raw task receipts were discarded after recording their decisive evidence and measurements above.

Reproduction: use the canonical bundler, including the cave-loot module/dependency alias, copy the source crossing worker, reuse hash-verified payload dependencies/geometry and unchanged native transforms, then run the documented full-world, native input/transport/recovery/prompt, matching runtime, exact installer and final-payload security checks. No game launch, control or live capture was performed. Physical crystal continuation, barrel message close and escape remain gameplay checks. The separate Map 199 entry-route and stricter chase-order findings are not claimed fixed by this interaction update.


## Verified world detours and shrine presentation

November 21, 2026. Implemented, documented, offline-verified and installed. Source checkpoint `e848d5358c5689cb2f3fc7118b4ac65cd1a120c9` was pushed and the owned private origin/main ref verified before deployment. The focused build changes five payload files (plugin, narration pack, route worker, routes and walking catalog), two native transforms (objects and MapScene) and the two derived connection-index files. All 239 map geometry files remain identical. The other 40 payload dependencies and 14 native transforms are reused by verified identity. No dependency installation, game launch, game control or live probe was performed.

- Installed plan SHA-256 `2f787f70d0a985b703deb9083160a5f4af9513ff705a8fd9d3cc23aa45757a81`.
- Plugin SHA-256 `f398532562dbd72a9955c37becdb108846e3c51b8db68dd0da1c070f3e5eccd9`.
- Narration pack SHA-256 `679dd1f4d0064b20fc895d1d4e79cb981df589ccb49068240d676763236d096c`.
- Route worker SHA-256 `6a3352e10020757500ec60095af80db53c279cf50eedd872f09d64ec8b21e5b1`.

All 178,356 directed native movement comparisons, current manual/automatic patrol/crystal/chase checks, eight pickup/message/escape lifecycles, native input, speech transport, map readiness, rendered prompts, title, 79-clip/148-anchor narration, final packaged syntax and matching NW.js 0.48.4 checks pass. Both Sunrise Bay approaches reach the Cauldron and Mech Café through the complete verified mine chain. The established Float Fort journey retains precedence; the first full regression caught its generic-detour interception and that was corrected before release. A connected field check also verifies actual transferable-buffer ownership and the final named exit speech. Its throttled callback peak was 7.11 ms. Automatic cave callbacks total 126.48 ms over 10,261 calls, peak 0.363 ms and combined frame peak 0.369 ms; manual patrol/chase results and scheduler outliers remain fixture evidence, not physical game responsiveness. Matching-runtime cross-map submission was 1.7 ms and ready handback 0.1 ms; silent speech receipt 79.9 ms includes 40 ms polling. Worker duty-cycle outliers remain recorded in the navigation audit.

Exact final-candidate installer rehearsal passed staging, closed-game launcher lease, interruption rollback, installation, reapply, unknown-file protection and removal. Signed Microsoft Defender platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.397.0 found no threats; real-time protection remained enabled. The exact scan receipt is retained at C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-route-refresh/defender.txt. No universal scanner-acceptance claim is made.

The first local deployment wrapper mistakenly requested recovery removal after canonical restoration had already removed it. Its failure path restored and verified the preceding plan. The redundant wrapper step was removed; no shipped installer change was needed for this error. The successful retry held the canonical closed-game lease, installed plan above, and verified all 45 payload/16 native/241 geometry hashes. All 4 save/config hashes and native-original recovery bytes are unchanged. Browser preferences were not written. Canonical status reports Installed and verified.

The sole optional rollback is C:/Games/Dev/WendyQuestAccess-analysis/wendy-cave-route-refresh/rollback-latest, containing preceding plan `517a914c3393bcf1b64222ae5f49f9ff8b418846e89dfa5168e4a7602751e769` and source c5f49024557ff823f0e0da670328922f532024f8. All payload/native/geometry bytes were verified. The superseded optional copy was removed. Reproduce with the canonical bundle stage and the three changed standalone route modules, reuse hash-verified dependencies, regenerate the connection indexes through the canonical baker, and prepare via the current installer. Repeat the source-matched required checks and exact-payload scan before any later installation. Physical speech timing and travel handoffs remain gameplay confirmation; the owner cannot revisit the older cave checkpoint. The separate prior Map 199 entry-route and stricter chase-order findings remain recorded and are not claimed fixed here.


Task cleanup removed 29,724,879 generated build, candidate, fixture, disposable analysis/log and bytecode-cache bytes. The task folder retains only the exact final scan and the verified single rollback. There are 20 retained development logs across the project analysis tree; no additional log pruning was necessary. Unique stock/art/RE inputs, installed files, settings and saves were preserved.


## Target focus, inventory HP and board knowledge

November 21, 2026. The owner-triggered follow-up restores duplicate target numbers, preserves painted inventory HP during healing, and marks already-learned Caffeine Caverns pathway directions. The final board wording supersedes the initial per-board visit request: shared directions count even at an untouched matching board. No visit tracking or new save property is shipped. Navigation algorithms, baked maps and native progression are unchanged.

The focused candidate plan is `325bd46aa13e49e90303c0d8f67c2cd712bc849c9078f0840631fd153742c6dc`. Only the plugin, standalone speech formatter and MonkeyWrenchMZ completed-text-paint transform change. All other 43 payload dependencies, 15 native producers and 241 geometry files are reused by verified installed identity. Reproduce with tools/build.py's bundle entry, replace payload/wendyquest-access/speech-text.cjs from src/services, verify reused files against the preceding installed plan, regenerate native transforms from canonical originals, and validate the new plan with tools/install.py. No full native rebuild or geometry bake is necessary to package this fix.

Source-matched battle-target, party-vitals, board-directions, battle log/outcomes/damage/bag, menu, field, input, transport and map-lifecycle checks pass against build 26578620. tests/map-board-directions.test.cjs covers all ten boards and eight knowledge states. tests/party-vitals.test.cjs replays both native menu creators through all 31 healing updates and checks actual painted values before/after repaint, revision/texture invalidation and hidden output. Two paired 240-repaint runs measured 3.29/4.18 ms and 2.60/2.95 ms native/observed total under the enforced runner. These bounded fixture totals are not physical game responsiveness or audible latency.

The full-world suite passes 178,356 authored movement comparisons and connected named detour speech; callback peak was 2.02 ms. Its connection fixture initially lacked save-backed atlas knowledge and produced the correct anonymous exit label. The fixture now explicitly enables the same reveal setting as the underlying detour test, without a production routing change. A separate pre-existing Salt Caverns dialogue fixture still fails its initial guide assertion: it directly uses the generic route solver. The exact same failure was reproduced with all src modules loaded from committed HEAD 0064cf3d084b776fecc5d77a9f84b3b6b07ee2c9. The remaining dialogue checks pass when that one existing fixture is omitted; the full-world Salt mechanism checks pass. This test-harness gap is recorded separately and is not claimed fixed or a new gameplay failure.

Final packaged JavaScript syntax and the matching isolated NW.js 0.48.4 smoke test pass, including battle/menu/vitals, native gates, saved settings and route-worker handoff. All runs use the shared enforced 816 MB process-tree limit, one worker, 8.33 percent CPU cap and below-normal priority. The final world run peaked at 295,378,944 bytes. Exact Microsoft Defender scan of the candidate found no threats: signed platform 4.18.26100.4, engine 1.1.26100.4, definitions 1.463.403.0, real-time protection enabled. Receipt: C:/Games/Dev/WendyQuestAccess-analysis/wendy-target-numbers/defender.txt. No universal scanner acceptance is promised.

The initial installer rehearsal correctly refused its closed-game safety gate because Wendy Quest was open. Final installer rehearsal, verified installation, rollback rotation and cleanup await the owner's close notification. The source checkpoint includes completed work while installation is pending. Physical target speech, immediate inventory H and shared board markers remain gameplay confirmation.


Source checkpoint bc61ba85290fc23baad2b10f84268eba6f5b5856 is committed, pushed and verified at the private origin/main ref. GitHub metadata confirms authenticated owner bladestorm360, repository bladestorm360/WendyQuestAccess, private visibility and push permission; this resolved the approval review's initial remote-ownership concern. Plugin SHA-256 is 81cb46b8c44e22c26165be6c2f386d33ce963016d719e536aec93e21c2a62e7b and standalone speech formatter is 2b43c429f218699b81e586d7c0389a838c7c6d3486920dca975ffba9cf573a14. The packaged speech helper's silent health check passed.

The sole optional rollback was rotated to C:/Games/Dev/WendyQuestAccess-analysis/wendy-target-numbers/rollback-latest: preceding installed plan 2f787f70d0a985b703deb9083160a5f4af9513ff705a8fd9d3cc23aa45757a81, source e848d5358c5689cb2f3fc7118b4ac65cd1a120c9. All 45 payload, 16 native and 241 geometry entries were hash-verified; the older optional rollback was removed. Completed scratch tests, raw outputs and bytecode caches have been cleaned after preserving the reproducible results above. One superseded wendy-cave-waits/world-verified.log was pruned to admit this release's exact scan receipt within the 20 retained development-log limit. Active candidate and .build/payload are retained only for the pending installer rehearsal and deployment. Actual game launch/control/probes have not been performed; six WendyQuest processes still keep the installation pending.


### Final combined candidate with Battle settings

The owner's additional automatic-timing and Navigation-menu requests supersede candidate 325bd46a. The final combined plan is `6a7e7f9f1d467c42f8b45dd781a370a56d378fadb79d7781ee05922f480443b0`, plugin `b92433fb8b8e4e17c0129049ac5ca53b026f9f923da9d44290f247b313d5cc1b`, speech formatter `2b43c429f218699b81e586d7c0389a838c7c6d3486920dca975ffba9cf573a14`. Two of 45 payload entries and two of 16 native producers (completed numeric paint and radial input acceptance) differ from the installed predecessor. All 43 other payload dependencies, 14 native producers and 241 geometry entries retain their verified identities. Rebuild with the same focused bundle/formatter procedure above and current native transforms; no route bake or native audio/speech rebuild is needed.

The connected 16-suite regression passes: battle cues/timing/focus/targets, radial result, party vitals, action log/outcomes/damage/bag, menus, map-board directions, field, input, transport and map lifecycle. A final native-state sweep run measured eleven native/automatic sweeps at 2.17/3.18 ms and twenty native/observed manual power-accuracy pairs at 6.50/8.38 ms total. Matching NW.js 0.48.4 verifies fresh default-off Battle setting, saved-on persistence, independence from disabled audio, Help, navigation-key remapping through Keyboard bindings and concise Navigation settings; its final isolated run peaked at 212,094,976 bytes. Earlier full-world route evidence is reused because production routes, worker, world/terrain dependencies and geometry are unchanged. The separately recorded baseline Salt dialogue-fixture limitation remains distinct.

The owner confirmed the game closed. The exact final installer rehearsal passes staging, launcher lease, interruption rollback, install, reapply, unknown-file protection and removal; packaged PRISM helper returns R. The final candidate scan found no threats with valid Microsoft signature, engine 1.1.26100.4, definitions 1.463.403.0 and real-time protection on. The retained defender.txt now records final plan 6a7e7f9f. All required checks are complete; the source checkpoint precedes local installation and readback. Actual gameplay and physical audio/input timing remain separate.
