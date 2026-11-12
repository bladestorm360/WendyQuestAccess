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

The installer fixture runs under the bounded runner as `python tools/run-build.py --memory-mb 384 -- python tests/install.test.py <Steam-game-root> <analysis-root>`. It builds a temporary mirror outside Git and exercises the real installer against it. It verifies rollback after activation, detection of an occupied install path, launcher leasing, reapplication after a partial Steam restore, protection of unknown edits, byte-for-byte removal and an untouched save witness. The fixture removes its copy at completion.

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
