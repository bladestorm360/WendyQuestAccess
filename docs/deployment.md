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

For gameplay confirmation, enter a previously unnamed house and press **M**. Use **Q** with a visible objective. Select a nearby destination, take a wrong step and listen for the updated beacon. With Wall sounds and Footstep sounds enabled, walk beside a wall, stop for three seconds and check that the tone ends. In battle, enable **Battle timing assist** and listen for the perfect-window note. Hardware onset, physical input timing and cumulative in-game responsiveness remain unverified. [Field audio](audio.md#wall-feedback-and-footsteps) · [Battle timing](battle.md#radial-timing-tones)

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

November 14, 2026. The focused update replaces the plugin, the route worker and search, the speech formatter and the Windows audio component. It reuses 33 payload files and all 240 geometry entries. Three of the 16 syntax-checked native transforms change. The final plan SHA-256 is `4494d07ba045efdba893f26e164c495f5399c69508f16240e81672680b2c6556`.

The native tests cover the safe route prefix with an authored moving enemy, reusing the selection when it moves, forest switch pages, the 90- and 18-frame beacon endpoints, three ascending notes, native attacker attribution, the Crispy Shield victory cue as appended reward speech, the atlas pin and nearby landmark output, and the low-health HUD. The complete world regression passed 120,972 directed movement comparisons. The matching NW.js 0.48.4 packaged smoke verified off-course beacon refresh and audio submission, retirement, and keyboard and controller review. The eight-step beacon test took 0.75 ms native and 3.17 ms connected. The warm packaged beacon receipt was 39.8 ms with 40 ms polling. One shared-slot worker round trip on the overworld took 54.3 ms. Other warm runs were shorter. These are capped stand-in timings and include scheduling, with game responsiveness and audible timing still open.

Microsoft Defender scanned the exact candidate, geometry, patched scripts and four tools at 07:07:35 PST using platform 4.18.26100.4, engine 1.1.26100.4 and definitions 1.463.295.0. It found no threats. The audio addon is unsigned and has SHA-256 `bb7fe0150f9258b0a5513c0e4ec4add23704607c82ed688563ce43bdb65c0779`. The registration and builder hashes are `57a1a59c44dd0ab81cf165e05e7914e9cbf2634b135062e9fd5ddf2bed32a72f` and `a832d9533ab01f8396fca4f62efb2de478d0747e12f390e1c8be49015f53bf32`. The installer and geometry builder hashes match the previous checkpoint.

The isolated installer verified the launcher lease, interruption recovery, installation, reapply, unknown-file protection and removal with the process-list response simulated for the mirror only. The real Steam installation is pending because Wendy Quest is open. [Beacon](beacon.md) · [Forest switches](navigation.md#gated-exits-and-floor-events) · [World Atlas](navigation.md#displayed-maps-and-ruins-markers) · [Battle popups](battle.md#floating-battle-results)
