# Release procedure

The owner authorized public source and GitHub downloads on November27. The first public mod release is **0.5.0**, tag **v0.5.0**. The reusable setup has its own version **1.0.0**. Routine fixes still use focused local deployment; rebuild setup only when its acquisition, compatibility or offline control contract changes. Publishing future releases remains a deliberate release action, rather than a build side effect.

## Source and player guide

Use the actual C: project and the owner's bladestorm360/WendyQuestAccess remote. Review current content and all newly public history for original game bodies, assets, saves, logs and credentials before changing visibility. Original mod additions, factual source locators and insertion recipes are eligible; game inputs and generated geometry stay outside every Git tree and release.

README.md is the canonical complete player guide and GitHub landing page. Keep FFPR Core's Purpose, Known Issues, Install, Keys and Credits headings. Start with a basic feature list; include every current default input and NVDA focus mode (NVDA+Space bar). Do not add named puzzles, mechanics, walkthroughs or ending details. tests/readme.test.cjs checks headings, bindings and the relevant spoiler exclusions. tools/package-release.py derives the matching accessible labeled-row ReadMe.txt; the downloaded payload installs it alongside ThirdPartyNotices.txt. No second hand-maintained guide is used.

## Clean build and dependencies

Freeze a clean committed source revision. build.ps1 takes the verified PRISM archive and audio SDK, using tools/run-build.py with one512MB enforced process tree, below-normal priority and bounded CPU. For a public release, reproduce that build from a fresh source export with VerifySpeechPipe and VerifyAudio, compare the authored bundle/data and record binary provenance. PRISM0.18.3, SDL3.4.4, OpenAL Soft1.25.2 and FFPR audio inputs remain pinned by tools/build.py. Keep licenses and corresponding-source/HRTF notices. installer/build-runtime.ps1 separately compiles the x64 static-CRT local installer utility through the same admission runner; do not nest its runner within another reserved tree.

The source-only Windows workflow checks the guide, JavaScript syntax, online metadata/archive/current-state fixtures and native installer utility compilation without game files. Full payload construction needs the pinned external SDK inputs. Real installation/bake and native game-function fixtures additionally require the owner's supported Steam installation and external originals. CI does not claim those private-input checks.

## Online setup and versioned package

From the clean checkpoint, run tools/package-release.py through tools/run-build.py, with --version0.5.0, a fresh --stage outside Git under the C: analysis workspace and --output pointing to dist/WendyQuestAccess-0.5.0-payload.zip. Do not overwrite the frozen private test ZIP. The builder refuses dirty source and existing output. It never tags, uploads, publishes or launches the game.

The stage contains the standalone WendyQuestAccessSetup.exe, versioned payload bytes, canonical ReadMe.txt, ThirdPartyNotices.txt, SHA256SUMS.txt and local manifests/receipts. Publish only the setup, versioned payload ZIP, two guides/notices and checksums. The payload ZIP contains release.json, engine.cjs, bake.cjs, recipes.json, WendyQuestInstallRuntime.exe and the mod payload. It contains no original game script, map JSON, derived geometry, artwork, saves or game runtime DLLs. Copy/literal recipes retain original game ranges as references; the local baker reads the player's own pinned data.

The setup embeds only a small offline control archive (engine and utility), the baseline compatibility manifest and fallback guide. See [installer ownership](installer.md) for transport, no-download, path limits, journal and receipt contracts. Later compatible payload versions can reuse the exact same setup EXE; include it in each latest release so the permanent latest/download link keeps working. Increase minimumSetup only for an actual contract change. Do not mutate published payload bytes under an existing version/tag.

## Exact verification

Run tests/check-online-installer.ps1 with an outside-Git Output and the final Stage. Its fixture transport is compiled only into OnlineHarness.exe, never the distributed setup. Run tests/public-installer.test.py on a new isolated mirror and tests/installer-package.test.py for the final standalone controls/runtime-option isolation. Verify:

- Fresh install and upgrade from the actual previous installation; exact16 native,48 payload and241 locally generated geometry identities, with16 original recovery scripts.
- Healthy current release: one metadata check, zero payload fetches, no temporary work directory or installation writes. A missing owned file requests repair; downgrade is refused without fetching.
- A later compatible payload updates using the unchanged setup code. Verify/remove work offline with no release lookup.
- Corrupt/truncated/oversized ZIPs, duplicate/escaping/device paths, bad asset URLs/digests, wrong game/runtime and closed-game lease failures stop before mutation.
- Unknown/externally changed files are preserved. Unicode/spaces, inherited Node options isolation, canonical original recovery, save/settings sentinels and accessible keyboard controls remain correct.
- Actual abrupt mutation failure restores the full previous installation, including the root installed-release receipt, on the next run. Ordinary failures also restore before reporting. Interrupted staging and unsafe journals retain their existing checks.

Re-run affected gameplay fixtures when gameplay code changes; otherwise retain revision-matched coverage with exact unchanged-file evidence. Game execution/control and live capture require their separate permission. Fixture timing is not real-game responsiveness.

## Security and publication

Verify trusted dependency hashes/signatures and the final compiler inputs. Sign with an owner-controlled trusted certificate if available, inner binaries before the outer setup; never invent a signature. No suitable certificate is currently available, so the README discloses the unsigned installer. Scan the exact setup, payload ZIP and expanded package with current Microsoft Defender, recording scanner signature, engine/definition versions, time, hashes and results. A clean scan does not guarantee reputation acceptance. Do not disable protections or strip download-origin metadata.

Commit/push the release source and verify origin/main. Record the clean-checkout and exact-payload evidence. Create the immutable v0.5.0 source tag and a draft release; upload only the five approved assets. Download the draft assets through GitHub and compare their exact hashes before public availability. Change repository visibility under the owner's explicit authorization, publish the stable/latest release, then check anonymous release metadata, asset SHA/size, the real shipped setup download/install path and the complete rendered root README. No authentication or repository token belongs in the installer.

## Local deployment and closure

With the game closed, use the final setup at the established Steam target. Verify all installed identities, root release receipt and16 originals; compare saves and browser-backed preferences before/after. Re-run installation to prove the real endpoint's up-to-date result. Refresh only the sole optional recovery copy after success. Keep the canonical native recovery directory in the game; the root release receipt is separate from that schema.

Consolidate reproducible commands, source/asset hashes, verification limits, public URL/ref and scanner evidence in the existing release-final/verification.json and defender.txt. Update the ordered checkpoint, release/deployment records and memory. Push and verify closure. Remove disposable source exports, expanded packages, isolated mirrors, test outputs and build/stage files; keep final distribution assets and the one optional recovery. Preserve unique source/research inputs and the frozen earlier private test artifact. Unconfirmed physical audio/gameplay and the old intermittent cave-input issue remain separate from installer verification.

## V0.5 verified private artifact

Completed November24 at frozen source58ec36400d56e2fa5ba94e42a453f0a0dd8ec202. Archive dist/Wendy Quest Screen Reader V0.5-test-build.zip is5,788,412bytes, SHA2568a582bdd4433d499862d926bb40e503effc971836713ce94ec4e14e7ae973416; metadata0.5.0-test-build, development false. README/embedded/plain guide and version resources match. The final archive, executable and expanded embedded payload pass signed Microsoft Defender scans; the original executable is unsigned, as disclosed. Its four outer files contain no game data or private logs.

Canonical bounded builds, native pipe/audio checks, full current narration/field/input and matching NW, full standalone install/update/repair/remove/interruption rollback, path/corruption/unknown protection, runtime-option isolation and keyboard accessibility checks pass. The exact distributed executable was then installed and verified at the established Steam target.46 payload/16 native/241 geometry,16 canonical originals,five save/config files and sole refreshed recovery are verified. The user's extra uninstall/failure-rollback requirement is covered by the existing Remove mod option and ordinary-error recovery; the hard process-exit case proves journal recovery to the exact prior installation.

Consolidated verification/security/local rehearsal/cleanup evidence: C:/Games/Dev/WendyQuestAccess-analysis/wendy-release-final/verification.json, privateTestV05_20261124, and its existing defender.txt. Expanded release stage/rehearsal/work/.build and obsolete0.0.0-dev ZIP were removed. The final requested ZIP and one optional latest recovery remain. Publication, uploads, a release tag and repository visibility changes were not performed. The disclosed intermittent cave-input issue and complete physical gameplay/audio confirmation remain private-test limitations, not waived success claims.


## V0.5 verified public release

Public stable/latest v0.5.0 is frozen at a1431561ead3f39a505c72d578b39ba057f83a18. Setup1.0.0 is207872bytes/SHA25614466e1ee9fe97948adca13949cde68815dda69b86d16161a8fe62e91c1fd130; WendyQuestAccess-0.5.0-payload.zip is5979259bytes/SHA256e711476bc8b9882a4ed8584c5a9c802b7cc75d1ea89a1f382a92d5a3daa3955f. The guide/notices/checksums accompany them. [Public downloads](https://github.com/bladestorm360/WendyQuestAccess/releases/tag/v0.5.0) and complete GitHub root README are verified without authentication.

All four ordered release systems pass. The source audit covers382 commits/4,224 local blobs including unreachable objects (203367904bytes), with no suspect original game bodies/assets or credential patterns; subsequent closure changes are authored factual documentation only. The clean-source build/native checks,37 online fixture cases, full isolated updater/recovery/previous-build rehearsal, exact public installer/endpoints, matching NW smoke, current signed Defender scans and local deployment/save/settings/recovery readback pass. [Deployment and evidence](deployment.md#november27-public-github-installer-release) distinguish the unchanged gameplay implementation, exact new distribution, known input issue and physical gameplay limits. The first temporary scratch path and already-patched native input were corrected in runtime fixture invocation; its canonical-stock rerun passes. No failed fixture is counted as passing evidence.

Keep these published bytes/tag immutable. Future compatible mod versions reuse this setup and versioned payload naming; increment release metadata and include the setup asset in each latest release. Changes to compatibility/online/offline controls require a new verified setup version. Routine local fixes still do not repackage the installer. The November24 private test ZIP remains a separate frozen historical artifact, not an updater asset.
