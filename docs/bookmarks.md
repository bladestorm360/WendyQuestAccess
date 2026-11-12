# Personal bookmarks

## Find a bookmark

On the map, change the pathfinder category to **Bookmarks**. Browse the entries, then use your usual Directions control. With the Letters layout, use **Shift+J/L** for categories, **J/L** for entries and **P** for directions. On a controller, use **right stick up/down** for categories, **right stick left/right** for entries and the **left trigger** for directions. [Layouts and remaps](navigation.md#destination-controls-in-the-development-build)

The category lists every saved bookmark. A local bookmark gives its bearing when available. The browser identifies bookmarks saved on another map or in another travel mode, and keeps out-of-reach tiles and currently unavailable linked events in the list. Walking directions can lead through verified entrances to another map. Aboard the story ship, directions to a bookmark saved on foot can take you through Float Fort or Breaded Bay. Request directions again after each map settles. The beacon and autowalk use your existing settings. [Directions across walking maps](cross-map-routing.md#routes-across-several-walking-maps) · [Ship port controls](cross-map-routing.md#ship-routes-to-walking-bookmarks)

## Save or manage bookmarks

On a settled map, open mod settings with **F8** or its remap. On a controller, press **View/Select**, release it, then press **Menu/Start**. Choose **Navigation**, then **Bookmarks**.

1. Choose **Save current location** to mark your tile. To mark an NPC, object, exit or another eligible live destination, browse to it first and choose **Bookmark current destination**. The menu announces the new bookmark number.
2. Open the bookmark and choose **Rename bookmark**. Type its name and press **Enter** or activate **Save name**. With a controller, open **Choose character**, choose a letter group, numbers or punctuation, and press the confirm button on a character. **Clear name**, **Remove last character** and **Letter case** are available.
3. **Select for directions** is also available as a menu shortcut where the current travel mode supports it.
4. To delete a bookmark, choose **Remove bookmark**. Focus starts on **Keep bookmark**. Choose **Confirm removal** to delete it. Escape or the controller back button returns to the bookmark.

The management list is also available from the title screen. Bookmarks are shared by the local NW.js profile across game saves and remain after a restart. The list holds up to 64 bookmarks, each with a name of up to 64 characters. A tile saved in flight marks a point in flight. A linked destination follows the current eligible event. Names you enter apply to your bookmarks. The ordinary destination categories retain their own names and type-only treasure labels.

## Integration and evidence

- The [bookmark model](../src/world/bookmark-records.js) validates the build, schema, map, travel mode and coordinate or event identity. [The settings database](../src/settings/storage.js) saves a bounded record through one IndexedDB transaction. A conflicting edit leaves the newer record intact and refreshes the list. The [bookmark settings menu](../src/settings/bookmark-menu.js) owns focus, keyboard text and controller character selection. Closing settings cancels any transaction still in progress.
- The [field owner](../src/world/field.js) samples bookmark context before opening settings, and the [current-map snapshot](../src/world/snapshot.js) resolves bookmarks on a settled map. A linked event uses the same native page, interaction priority and quest marker checks as its original destination. A tile enters the [route solver](../src/world/routes.cjs) as an exact endpoint. After the normal browse filter, the browser merges every saved record by ID, keeping available approaches, marking blocked approaches and providing an entry for each unavailable destination. A direction request checks live collisions and floor triggers. Changes in position, terrain, event ownership, scene or vehicle retire affected routes. The timed cave uses manual timing and preview guidance.
- The [installed-method fixture](../tests/bookmarks.cjs) compares the point approach with native Salt Caverns passage and verifies browsing of blocked, inactive, remote and different-mode entries. The [matching NW.js fixture](../tests/nw-smoke.py) selects the local bookmark through controller category browsing and the remote bookmark through keyboard category browsing. It also checks the menu shortcut, both naming methods, removal, route and arrival speech, native movement and restart persistence. Both run outside the installed game.

The packaged Salt Caverns bookmark route took 42.6 ms cold and 0.9 ms warm for the full worker round trip under the CPU cap. In the synthetic NW.js fixture, general warm field command submission took 0.5 ms. The worker timings include scheduling and the cold geometry read. Game-thread episode cost, sustained input and audible timing need the final performance pass.

For the eventual gameplay pass, save a familiar tile on a calm map, rename it, walk a few tiles away, and request directions back. Expect the saved name, cardinal steps and the exact tile at arrival. Then save a visible NPC or object and revisit it. A linked bookmark should follow the entity or report it unavailable after its page changes. Confirm a canceled removal leaves the bookmark, then remove it and check that the other marker remains after restarting. Physical controller and screen-reader output, combined game-thread cost and audible arrival are still to be measured.
