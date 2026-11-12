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
