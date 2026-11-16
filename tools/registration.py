"""Prepare the original plugin registration and native front-end notifications.

The CLI verifies the installed inputs and candidate JavaScript. It makes no
writes to the game. The deployment step will use the same checked transforms.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess


TITLE_REL = Path('package.nw/js/plugins/TitleSceneArranger.js')
REGISTRY_REL = Path('package.nw/js/plugins.js')
MENU_REL = Path('package.nw/js/plugins/MenuScene.js')
MANAGERS_REL = Path('package.nw/js/rmmz_managers.js')
SCENES_REL = Path('package.nw/js/rmmz_scenes.js')
CORE_REL = Path('package.nw/js/rmmz_core.js')
WINDOW_REL = Path('package.nw/js/plugins/MonkeyWrenchMZ.js')
INPUT_REL = Path('package.nw/js/plugins/InputAdjustments.js')
TILE_REL = Path('package.nw/js/plugins/Tyruswoo_TileControl.js')
WINDOWS_REL = Path('package.nw/js/rmmz_windows.js')
MAP_REL = Path('package.nw/js/plugins/MapScene.js')
OBJECTS_REL = Path('package.nw/js/rmmz_objects.js')
CANVAS_REL = Path('package.nw/js/plugins/CanvasScaler.js')
BATTLE_REL = Path('package.nw/js/plugins/BattleSceneArranger.js')
ACTION_REL = Path('package.nw/js/plugins/ActionCommandCombat.js')
QUEST_REL = Path('package.nw/js/plugins/Ayatam_HighQualityQuestSystem.js')
BITMAP_FONT_REL = Path('package.nw/js/plugins/EliMZ_BitmapFontPro.js')
STATS_REL = Path('package.nw/js/plugins/WendyQuest.js')
MESSAGE_OWNER_REL = Path('package.nw/js/plugins/EliMZ_Book.js')
SALT_REL = Path('package.nw/data/Map019.json')
CAFFEINE_REL = Path('package.nw/data/Map087.json')
TITLE_SHA = 'a3c35f004b66a6d4e7a918e36b8bc7e48f2383875165ce1c00ae1a5a031e5634'
REGISTRY_SHA = '083317d6b2ee7ba9655762dee7671564a64b0bba82bb33d8cbacd52a7e7b3ab7'
TITLE_INSERTION = 17749
TITLE_CONTINUE_OUTRO = slice(4451, 4548)
TITLE_EVENT = (b';if(typeof globalThis.WendyQuestAccessTitleReady==="function")'
               b'{globalThis.WendyQuestAccessTitleReady(this);}')
MENU_SHA = 'b4426d78f76e1d799f178e31b981292d404cc60a819b767f80573c133b1cd82a'
MANAGERS_SHA = 'e87efc29229a80c903c1651a78bbeafa8b9ffb925227b31cfa7f4741875140bd'
SCENES_SHA = '0f69c04d51b9ce17410e952ceafa31527a1b6c94663a12e11ca7d0e30cf2913a'
CORE_SHA = 'f7f807a8329b6996577771dd5b65b84dac072117b6f24e4f2fc0a6068ccd61e0'
WINDOW_SHA = '37dfb71367496ca5f96a86156c3ea9fb4f813a3d6323280e342848d3bfd9cd42'
INPUT_SHA = 'dac572e3107d47693277fa7565b5c49145fbed73003471e54cb7e64390092d77'
TILE_SHA = '4656a3ac3c7bcfc8361ff9b1cd67a9b52bd3fa77d469982465b2ddf516b170c6'
WINDOWS_SHA = '7bd37af5d4d55d2aedad4d2cb1e14d2ff3ff8eefa261f865ef805b7e8981fd59'
MAP_SHA = 'aff25c073cffce32857bb654d0ae30938f10ddfa534cfc0cb80ebb078a4aaf64'
OBJECTS_SHA = 'b9da176c2041866df643b7d62b36d99d67bf1b44216deb52568adbd08264848a'
CANVAS_SHA = '713457886c5589be41d137d81b327947e37b19707c2f30c5da1b1ff43a9d8ccf'
BATTLE_SHA = 'b6e5b59162e89c38e4d24c55ea622846509ac6d77e91ec0e24c0bb745fd0eab5'
ACTION_SHA = '6e92fbda24f1611c737961db2f5d2456e14adf0e276fe0ffeea2a51bfd839057'
QUEST_SHA = '5a17621ec14791c85716cb13ced13b1ceb82a83d3d05df0e850f2f0059c8daf3'
BITMAP_FONT_SHA = 'b24607bc939ea1f7cfa3972c1121d135550483ffe3ab6484f84c1f135046ae76'
STATS_SHA = 'da3c0950cf9a0559f21fce2df1bbc608a5fee28398dd233c032279178b6a18f9'
SYSTEM_REL = Path('package.nw/data/System.json')
SYSTEM_SHA = '1f5069331af8e8c2fcce3dde3f5e6d71b2d262bc3d604ceaf6f62d0ac8d41b76'
PIXI_REL = Path('package.nw/js/libs/pixi.js')
PIXI_SHA = '6eca31989af44e87ac64319da69b9e484a7fdf0cbbdcaf3cd85869362588cee1'
DEPENDENCIES = {
    SYSTEM_REL: SYSTEM_SHA,
    PIXI_REL: PIXI_SHA,
    Path('package.nw/img/system/Splash.png'): 'fdb48bb2dc78ea6d501ce325f52398a64bcb75ff517c5848614e44c9d7851fe7',
    Path('package.nw/img/system/81monkeysSplashLogo.png'): 'fa8a5159a925325905df5ac2ea11d60240a8e551a238d85e98bac17d3b9a6dba',
    Path('package.nw/img/system/81monkeysSplashLogo.json'): '6d01e76a61e3f39bf5947191a0b8a01ba3e2a526e119aa88a5c0211e1c8250ce',
    Path('package.nw/img/titlescreen/TITLE SCREEN - LOGO.png'): 'a08b69c8cc7304921cf71eb31658270024878f4f8b582a3f93b02e59b7e87ffd',
    Path('package.nw/img/titlescreen/UI - START.png'): '20efaea251136a7238f266eeeb72acfca6aad7fb8b9e26654fb91ba796b7d387',
    Path('package.nw/img/pictures/Ending.png'): '5e2da2fdd47aedcccf1987649c01e26a155aa29a48aa28321f450a28aef06ac3',
    Path('package.nw/img/pictures/TheEnd.png'): '9b69e9fa84b661d09ba8b3a80ab3b13b05ad811f098450867b36f6cb1e6cc361',
    Path('package.nw/img/system/Caffeine Caverns Map.png'): '12bc943da57f479922703bc70451f5b95658830d3a391868e6ce77fa2e86f483',
    Path('package.nw/img/system/Caffeine Caverns Map Trail 1.png'): '56a0363a00319d0236d93f6b396e723247c24971c414cbed0c2e1c29dc9d977b',
    Path('package.nw/img/system/Caffeine Caverns Map Trail 2.png'): '70cc8d178a3d3d98bdb338022767d9200264c2c1621130f3b761957d1a8bda61',
    Path('package.nw/img/system/Caffeine Caverns Map Trail 3.png'): 'a187aa3b243052eb4bf15d74b0e9ee28de5bf2b2b3a613ef2d447e3a1a48e6be',
    Path('package.nw/img/system/Savoria Map.png'): '4558afc06f8761406d502d6b3a43e31d1950e78ae98b67dfcacc7404c3273b40',
    Path('package.nw/img/system/WendyIcon.png'): '5ed0f87b6ce74d5677532d02c4c0ff52ab8cd02da5e4ec10b3bc069a7899252b',
    Path('package.nw/img/system/MapMarkers/Map Markers0.png'): 'd2e7220db93f784df36e2f809e39ab57321101f6b4e35806cd35687c039b174c',
    Path('package.nw/img/system/MapMarkers/Map Markers1.png'): '966705d415684a52d21941f66b3c8fe2526eff3c220af18695c3276a2a135ced',
    Path('package.nw/img/system/MapMarkers/Map Markers2.png'): '41fda6962b54b5261718e58987749669de762fabff055749d09d4977a7817bdc',
    Path('package.nw/img/system/MapMarkers/Map Markers3.png'): '0083bd47f5830550603f80c93e9c6adc19ab140776cebd929c0b2aee368b1811',
    Path('package.nw/img/system/MapMarkers/Map Quest Marker.png'): '70565af90ad1765c1df5b70c5305fe9c3940d9e303f6703f9b0fa065095ed0e7',
    BITMAP_FONT_REL: BITMAP_FONT_SHA,
    Path('package.nw/js/plugins/FilterControllerMZ.js'): '44eaddf9fd7253024a0c4dc0c14a7a0ecb8890105dc878c2807b4ed904c6ba77',
    STATS_REL: STATS_SHA,
    Path('package.nw/data/Items.json'): 'd7f959eca0afa6058ee5e341a5614cc37de7643dd4acd6bd694677386b2b252a',
    Path('package.nw/img/UI/WENDY_COLLECTIBLE_STATUE.json'): 'ae0086a3c216d265c3650d627fab64c287e9e355eb18ed95f6c7736bf07e42ff',
    MESSAGE_OWNER_REL: '26e0230f7bcf8a425ad4c128c728cb0d74d8589d1a07d9d3026edbc2b09c7ce0',
    Path('package.nw/js/rmmz_sprites.js'): '33440ac9584344c4a9675d0b464f82eb49f5dcde0c23c485edbd385360475ba1',
    SALT_REL: '4d14b04a8980f4a4eb50dfa01d0ab61dd5507c62b65a1cd23b5df1621662e296',
    Path('package.nw/data/States.json'): 'db3264ae4f2436acb247655823b4055ffb1c319a5c709e2f760a37be4cdc4b14',
    Path('package.nw/data/Skills.json'): '107e79081ab63e78446b7ebcaeb3310bf5ee2d8b9c667ae1d6f63dbc900eac60',
    CAFFEINE_REL: 'e26a883c1d464508d446382ee5be94c5ca7ada1b76ec70e4f9650bdb1f24d48f',
    Path('package.nw/data/CommonEvents.json'): '1884583f50d8e6c37c53c7552df9c6628d59faf0b92ea90d1ed3a65769c0b9d9',
    Path('package.nw/data/Map013.json'): '4edbf96422217319734b094c5df37eb74e9d5f0659d33826dd17311ee636bfbc',
    Path('package.nw/data/Map015.json'): 'f55ea800b85a452dc076ff35a945256a68f4af0e3bacd209924759da9167c6e5',
    Path('package.nw/data/Map028.json'): '80194daf64d2636d038b97efc668377549739dac152b55cefdf8b84d3bd8f04d',
    Path('package.nw/data/Map032.json'): '8be32e1819de5e31d0f4dcfa0d9deba7c8ebfb6beeb8448ca913a991b3749a58',
    Path('package.nw/data/Map044.json'): '82ce5e8c9c738876baa4df41c97066d1f276161824fe4657d746e70aaccceb51',
    Path('package.nw/data/Map050.json'): '7ff3d348ede2ebe23149b1b446d9bc4cdb50d5f409c8ac9d3f07aa0abf0dd3bd',
    Path('package.nw/data/Map051.json'): '2d1755085570a41f244ed74c256e19fd1a7eda5f315f2da5b26d885b8021f55b',
    Path('package.nw/data/Map053.json'): 'da1044ed17970c37ec582f4a111e95a15752a074efa0f8159abb9ce4fb1275d6',
    Path('package.nw/data/Map055.json'): '16be52e42002832bf13659b9b9ce47163141756cfa9111de11851ca646591f09',
    Path('package.nw/data/Map057.json'): '013ca80bda617519cb775255abb7f50199dbe7f7f82b646499dd7d5fc0beee2e',
    Path('package.nw/data/Map058.json'): '87468a017df640e89983ba5f73a2b14a464fda43d2a2e5645751fc261548f999',
    Path('package.nw/data/Map063.json'): '0764431236c1c0c672b3041d2b7e1aedf81fef229164e0d1f90ea29fd0a943f0',
    Path('package.nw/data/Map113.json'): '9e5a91e26e8907e97fd829ae7aa4603145a92922e4d64c5b47251090aa4c6ab6',
    Path('package.nw/data/Map127.json'): 'ae459a57d039d2d469cb570dc1a9a61a0eec2c54b8f17c7b941f98726874b58e',
    Path('package.nw/data/Map128.json'): 'd906119d7cafeb5b332fd302296aa31221b1efe25b958731d869bbc8a0adfa75',
    Path('package.nw/data/Map132.json'): 'aa18adc96ab3994b94f0a3983b85eb8cfa9ce3bda773414bd604ad3f68880591',
    Path('package.nw/data/Map133.json'): '943ae2bce574fec5671652c1ada1b0e17d5e24ce626074713963354dcea4a75e',
    Path('package.nw/data/Map195.json'): '70ee9fb64540fdc1b2371a22f7e3d5f5e821161cba5aea3c171433dad65e0d1b',
    Path('package.nw/data/Map196.json'): 'bb3dbeb99080470bc3c009ece7b6e5a60aa99d1fad6cfc71fa95b6a8e9a788e8',
    Path('package.nw/data/Map197.json'): '473add1cb944e63f0fb5b077689bf3e525d7a93068e6b03f86e9e9421f80c0b9',
    Path('package.nw/data/Map199.json'): 'ba3fc58a0d8c1c0d71dc2de23010a6e35a7c3c6bd37925becb1fee86adb7998e',
    Path('package.nw/data/Map200.json'): '7b9894f8c5548d3534e4cd14e9c007a8a8ea594acf8352182f91277b4531f0fa',
    Path('package.nw/data/Map201.json'): '3d6cde06daacedebc77a44ee826816890128646ea9c68115404405b7ff14ad21',
    Path('package.nw/data/Map202.json'): 'd35c539b94ed69ca161d4c1a4e30778c1ce8ea70fefef1931b11f4bd480f32f7',
    Path('package.nw/data/Map203.json'): '7c0d6eaa4a9cf7d2b87949b86a1a2e91ca108df180600ec9c0fceb925a287d18',
    Path('package.nw/data/Map205.json'): 'c6dbb57bc575a4fcabefa467358c5c463b00fa1f3a2a3eedd8a1e27365f69013',
    Path('package.nw/data/Map206.json'): '89dadfb242c46f0945edc42c900e967b5fe1e6e9415b60f63cc7129795c69f47',
    Path('package.nw/js/plugins/UIGeneral.js'): '9a282cc96ee2edb4777fc18228d4a5976e2ad7546d50df72a6d0429bc6af9b0e',
    Path('package.nw/img/system/IconSet.png'): '709b556b0c2b217436172d90d7d8af4c722ce421aa19f504261ee72607f5203e',
    Path('package.nw/img/UI/AllStones2X.png'): '87907e3cab62ac897d22d688ac740cb89ddfb3db0a62dbd54428be5c1f533c86',
    Path('package.nw/img/UI/lock.png'): '5ae4449f43c3a06a366139149095045465f21d31d3ccb00b7308b03f5d0a95be',
}
FILES_LEAVING = b'globalThis.WendyQuestAccessFilesLeaving?.(SceneManager._scene),'
BATTLE_TARGET_LEAVING = (b'SceneManager._scene?._wqaBattleTargetActive&&'
                         b'globalThis.WendyQuestAccessBattleTargetLeaving?.(SceneManager._scene)')
BATTLE_BAG_LEAVING = (b'SceneManager._scene?._wqaBattleBagActive&&'
                      b'globalThis.WendyQuestAccessMenuLeaving?.(SceneManager._scene)')
BATTLE_TIMING_LEAVING = (b'SceneManager._scene?._wqaBattleTimingActive&&'
                         b'globalThis.WendyQuestAccessBattleTimingLeaving?.(SceneManager._scene)')
BATTLE_CUE_LEAVING = (b'SceneManager._scene?._wqaBattleCueActive&&'
                      b'globalThis.WendyQuestAccessBattleCueLeaving?.(SceneManager._scene)')
BATTLE_LOG_LEAVING = (b'SceneManager._scene?._wqaBattleLogActive&&'
                      b'globalThis.WendyQuestAccessBattleLogLeaving?.(SceneManager._scene)')
BATTLE_RADIAL_LEAVING = (b'SceneManager._scene?._wqaRadialActive&&'
                         b'globalThis.WendyQuestAccessBattleRadialLeaving?.(SceneManager._scene)')
def narration_leaving(scene=b'SceneManager._scene'):
    return (b'if(' + scene + b'?._wqaNarrationActive||' + scene + b'?._wqaNarrationLoading)'
            b'globalThis.WendyQuestAccessNarrationLeaving?.(' + scene + b');')


SCENE_LEAVING = (narration_leaving(b'this._scene') + b'if(this._scene?._wqaPresentation){this._scene._wqaPresentation=false;'
                 b'globalThis.WendyQuestAccessSceneLeaving?.(this._scene);}')
FIELD_WATCHED = (b'(SceneManager._scene?._wqaMapAnnouncement||SceneManager._scene?._wqaDialogue||'
                 b'SceneManager._scene?._wqaAutosaveNotice||SceneManager._scene?._wqaCreditsActive||'
                 b'SceneManager._scene?._wqaInteractionActive||SceneManager._scene?._wqaTreasureDue||'
                 b'SceneManager._scene?._wqaRouteActive||SceneManager._scene?._wqaCaveReview||'
                 b'SceneManager._scene?._wqaSettingsActive||SceneManager._scene?._wqaWallAudio||'
                 b'Graphics._wqaFootstepsEnabled&&SceneManager._scene?._wqaFieldReady||'
                 b'SceneManager._scene?._wqaBeaconActive||SceneManager._scene?._wqaCaveTimingActive||'
                 b'SceneManager._scene?._wqaAutowalkActive||SceneManager._scene?._wqaArrivalSpeech||'
                 b'SceneManager._scene?._wqaSoundscapeActive||'
                 b'SceneManager._scene?._wqaQuestTracking||SceneManager._scene?._wqaBookmarkEntrance||'
                 b'SceneManager._scene?._wqaBookmarkLanding||SceneManager._scene?._wqaVehicleNotice)')
ROUTE_DIRTY = (b'if(SceneManager._scene?._wqaRouteActive||SceneManager._scene?._wqaCaveReview||'
               b'SceneManager._scene?._wqaWallAudio||SceneManager._scene?._wqaBeaconActive||'
               b'SceneManager._scene?._wqaCaveTimingActive||SceneManager._scene?._wqaAutowalkActive||'
               b'SceneManager._scene?._wqaSoundscapeSample||SceneManager._scene?._wqaQuestTracking)'
               b'globalThis.WendyQuestAccessFieldChanged?.(SceneManager._scene);')
ACTOR_DIRTY = (b'if(SceneManager._scene?._wqaRouteActive&&(this===$gamePlayer||this._eventId!==undefined||'
               b'this._type==="boat"||this._type==="ship"||this._type==="airship")||'
               b'SceneManager._scene?._wqaCaveReview&&this===$gamePlayer)'
               b'globalThis.WendyQuestAccessFieldChanged?.(SceneManager._scene);')
ACTOR_STEP = ACTOR_DIRTY.replace(b'?.(SceneManager._scene);', b'?.(SceneManager._scene,this);')
AUTO_DISCARD = (b'SceneManager._scene?._messageWindow?._wqaAutoPaint&&'
                b'(SceneManager._scene._messageWindow._wqaAutoPaint=null)')
MAP_LEAVING = (AUTO_DISCARD + b';if' + FIELD_WATCHED +
               b'{globalThis.WendyQuestAccessSceneLeaving?.(SceneManager._scene);}')
DIALOGUE_LEAVING = (b'if(SceneManager._scene?._wqaDialogue){'
                    b'globalThis.WendyQuestAccessSceneLeaving?.(SceneManager._scene);}')
DIALOGUE_HOST = b'(SceneManager._scene?._wqaMapRestored||SceneManager._scene?._wqaBattleStarted)'
AUTOSAVE_DONE = (b'if(wqaAutosave){wqaAutosave=false;SceneManager._wqaNativeAutosaves--;}')
PLUGIN = {'name': 'WendyQuestAccess', 'status': True, 'description': 'WendyQuest accessibility support',
          'parameters': {}}


def beacon_actor(direction=b'0', player_only=False):
    actors = (b'this===$gamePlayer' if player_only else
              b'(this===$gamePlayer||this._eventId!==undefined||this._type==="boat"||this._type==="ship")')
    return (b'if(SceneManager._scene?._wqaBeaconActive&&' + actors + b')'
            b'globalThis.WendyQuestAccessBeaconActor?.(SceneManager._scene,this,' + direction + b');')


def title_notification(original):
    if hashlib.sha256(original).hexdigest() != TITLE_SHA:
        raise ValueError('Title plugin does not match the supported Steam build')
    if original[TITLE_INSERTION:TITLE_INSERTION + 1] != b';':
        raise ValueError('The title activation callback boundary does not match')
    # Start Game already deactivates the command and reserves Scene_Load.
    # Its outgoing title fade and window close both hold SceneManager's busy
    # gate. Leave native scene loading and the selector's entry fade intact.
    candidate = original[:TITLE_INSERTION] + TITLE_EVENT + original[TITLE_INSERTION:]
    return candidate[:TITLE_CONTINUE_OUTRO.start] + candidate[TITLE_CONTINUE_OUTRO.stop:]


def insert(original, sha, sites):
    if hashlib.sha256(original).hexdigest() != sha:
        raise ValueError('Native notification source does not match the supported Steam build')
    candidate = original
    for offset, event in sorted(sites.items(), reverse=True):
        candidate = candidate[:offset] + event + candidate[offset:]
    return candidate


def files_ready(scene):
    # SceneManager publishes the save selector after native start and stage
    # attachment, before its first input update. Card art loads independently.
    ready = f'''{scene}&&{scene}._wqaFileKind&&{scene}===SceneManager._scene&&
!SceneManager._nextScene&&!SceneManager._exiting&&!SceneManager._wqaNativeAutosaves&&{scene}._started&&{scene}._active&&
Graphics.app?.stage==={scene}&&!Graphics._wqaResize&&
(!{scene}._wqaPresentation&&
({scene}._wqaFileKind===1||({scene}._wqaFileKind===2&&{scene}._wqaDetailText===true&&!{scene}._destroySave))&&
({scene}._fadeSign===1||({scene}._fadeDuration===0&&{scene}._fadeOpacity===0))||
({scene}._fadeDuration===0&&{scene}._fadeOpacity===0&&
(({scene}._wqaFileKind===3&&({scene}._deleteCount===0||{scene}._wqaDeleteStatus))||
({scene}._wqaFileKind===4&&{scene}._optionsWindow?._wqaOptionsPainted===true)||
({scene}._wqaFileKind===5&&{scene}._commandWindow&&( {scene}._commandWindow._wqaRetryRows&
(1<<{scene}._commandWindow._index))))))'''.replace('\n', '')
    return f'if({ready})globalThis.WendyQuestAccessFilesReady?.({scene});'.encode('ascii')


def menu_notifications(original):
    # Build 26578620. Offsets refer to completed native draw or accepted
    # native actions. Existing event arguments and call order are preserved.
    return insert(original, MENU_SHA, {
        4303: b"if(this._started&&this._active&&!this._fadeDuration&&!this._fadeOpacity&&"
              b"this===SceneManager._scene&&!SceneManager._nextScene&&!SceneManager._exiting&&!Graphics._wqaResize&&"
              b"Graphics.app?.stage===this){const wqaSplash=this._81monkeys?.alpha>0?2:1;"
              b"if(this._wqaSplashSeen&&this._wqaSplashSeen!==wqaSplash&&this._wqaSplashRetired!==wqaSplash){"
              b"this._wqaSplashRetired=wqaSplash;globalThis.WendyQuestAccessSplashLeaving?.(this);}"
              b"if(this._wqaSplashSeen!==wqaSplash&&this._waitCount>this._updateRate&&"
              b"(wqaSplash===1?this._backSprite?.texture?.valid:this._81monkeys?._frame?.y===1550))"
              b"globalThis.WendyQuestAccessSplashReady?.(this,wqaSplash);}",
        9404: b'if(this._wqaMenuActive)globalThis.WendyQuestAccessMenuLeaving?.(this);',
        9431: b'this._wqaMenuSave={status:0};this._wqaLastManualSave=null;',
        12025: b',this._wqaMenuSave&&(this._wqaMenuSave.banner=_0x385754)',
        12368: b'if(this._wqaMenuSave?.banner===_0x385754)this._wqaMenuSave.bannerDone=true;',
        12930: b'globalThis.WendyQuestAccessMenuReady?.(this,1);',
        14319: b'this._wqaMenuStatus=_0x3c6ae6;',
        16877: b'let wqaShopGold,wqaShopCurrency;',
        16937: b'(wqaShopGold=',
        16961: b')',
        16962: b'(wqaShopCurrency=',
        16984: b')',
        # The native pause and shop windows share this completed draw.
        17016: b'if(SceneManager._scene?._goldWindow===this)'
               b'this._wqaShopGold={contents:this.contents,value:wqaShopGold,currency:wqaShopCurrency};',
        20002: b'globalThis.WendyQuestAccessMenuReady?.(this,2);',
        25165: b'if(this._wqaMenuActive)globalThis.WendyQuestAccessMenuLeaving?.(this);',
        27347: b'this._wqaMenuStatus=_0x20357e;',
        34744: b'const wqaRedraw=SceneManager._scene?._wqaMenuActive&&'
               b'SceneManager._scene._itemWindow===this&&this._index===_0x14af0d;',
        35932: b'if(wqaRedraw)this._wqaMenuRowPaint=(this._wqaMenuRowPaint||0)+1;',
        39079: b'if(SceneManager._scene?._itemWindow===this&&'
               b'SceneManager._scene._equipStatusWindow===this.statusWindow){'
               b'this.statusWindow._wqaMenuCompareItem=_0x204675;this.statusWindow._wqaMenuCompareActor=_0x1d24e1;}',
        59805: b'this._wqaShop=true;',
        61263: b'if(this._wqaMenuActive)globalThis.WendyQuestAccessMenuLeaving?.(this);this._wqaShopPurchase=null;',
        61712: b'if(this._wqaMenuActive)globalThis.WendyQuestAccessMenuLeaving?.(this);',
        61897: b'if(this._wqaShop&&this._numberWindow._wqaShopQuantity?.item===this._item&&'
               b'this._numberWindow._wqaShopQuantity.count===_0x4ffa75)'
               b'this._wqaShopPurchase={name:this._item.name,count:_0x4ffa75};',
        62144: b'if(this._wqaMenuActive)globalThis.WendyQuestAccessMenuLeaving?.(this);',
        63109: b'if(SceneManager._scene?._wqaShop&&SceneManager._scene._helpWindow===this)'
               b'this._wqaShopHelp={contents:this.contents,text:this._text};',
        64664: b'if(SceneManager._scene?._wqaShop&&SceneManager._scene._statusWindow===this){'
               b'this._wqaShopPossession={contents:this.contents,item:this._item,count:_0x22ef5e};'
               b'this._wqaShopEquip=this._wqaShopChange=null;}',
        79513: b'this._wqaMenuHelpPaint=(this._wqaMenuHelpPaint||0)+1;',
        91658: b'this._wqaFileKind=4;',
        92959: FILES_LEAVING,
        97879: b'(' + FILES_LEAVING,
        97897: b')',
        100934: b',this._wqaOptionsPainted=true',
        100936: b'if(SceneManager._scene?._optionsWindow===this){' + files_ready('SceneManager._scene') + b'}',
        113848: b'if(this._volumePips&&this._index===_0xe6cc9c){this._wqaOptionRow=_0xe6cc9c;'
                b'this._wqaOptionTab=this.currentTab;this._wqaOptionStatus=_0x2a39aa;}',
        115137: b'if(this._list[this._index]?.symbol===_0x409fc3)this._wqaVolumeShown=_0x20639e;',
        122099: b'if(!this._wqaCouponBusy&&this._started&&this._active&&this._fadeDuration===0&&this._fadeOpacity===0&&'
                b'!this._wqaSettingsActive&&!SceneManager._nextScene&&!SceneManager._exiting&&'
                b'!SceneManager._wqaNativeAutosaves&&!Graphics._wqaResize&&Graphics.app?.stage===this){'
                b'if(this._couponResponseWindow?.active&&this._couponResponseWindow._ready)'
                b'globalThis.WendyQuestAccessMenuReady?.(this,7);'
                b'else if(this._couponsWindow?.active&&this._couponsWindow.sprites)'
                b'globalThis.WendyQuestAccessMenuReady?.(this,6);}',
        122210: b'if(this._wqaMenuActive)globalThis.WendyQuestAccessMenuLeaving?.(this);',
        122542: b'this._wqaCouponBusy=true;',
        122716: b'this._wqaCouponBusy=false;',
        131759: b',this._wqaCouponCopy=(this._wqaCouponCopy||0)+1',
        132121: b'if(SceneManager._scene?._wqaMenuActive)'
                b'globalThis.WendyQuestAccessMenuLeaving?.(SceneManager._scene);',
        139187: b',this._wqaCouponButton1Text=_0x16262d',
        143144: b'if(SceneManager._scene?._wqaMenuActive)'
                b'globalThis.WendyQuestAccessMenuLeaving?.(SceneManager._scene);',
        144369: b',this._wqaCouponCodeText=_0x37d87b',
        144657: b',this._wqaCouponButton2Text=_0x37d87b',
        163333: b'this._wqaFileKind=3;',
        165098: b'this._wqaDeleteStatus=_0x4a1a5b;' + files_ready('this'),
        165586: FILES_LEAVING,
        188382: FILES_LEAVING,
        188587: FILES_LEAVING,
        189925: b'this._wqaFileKind=1;',
        190907: FILES_LEAVING,
        207711: b'(' + FILES_LEAVING,
        207743: b')',
        208402: b'this._wqaDetailArt=true;',
        215620: b'this._wqaDetailText=true;this._wqaFileKind=2;' + files_ready('this'),
        215817: FILES_LEAVING,
        215860: b'if(SceneManager._nextScene)SceneManager._nextScene._wqaReadFailed=true;',
        219539: b'this._wqaCards=true;',
        230489: b'if(_0x6b578e>=0&&_0x6b578e<3&&!(this._commandWindow._wqaRetryRows&(1<<_0x6b578e)))'
                b'{this._commandWindow._wqaRetryRows|=1<<_0x6b578e;' + files_ready('this') + b'}',
        231238: b'this._wqaFileKind=5;',
        234492: b'if(SceneManager._nextScene)SceneManager._nextScene._wqaRetryFailed=true;',
    })


def quest_notification(original):
    # The tracker can repaint during an animation. Sample only the actual
    # stable paint and tag its title and objective draw scopes.
    return insert(original, QUEST_SHA, {
        157600: b'let wqaQuestEnd,wqaQuestComplete=false;'
                b'if(this._needContentRefresh&&this._transitionState===this._targetTransitionState&&'
                b'this===SceneManager._scene?._questNavWindow){'
                b'if(this._wqaQuestDraft!==undefined)this._wqaQuestDraft=null;'
                b'if((SceneManager._scene._wqaFieldReady||SceneManager._scene._wqaDialogue)&&this.offsetY===0)'
                b'wqaQuestEnd=globalThis.WendyQuestAccessQuestPaint?.(this);}'
                b'try{',
        158215: b'wqaQuestComplete=true;}finally{wqaQuestEnd?.(wqaQuestComplete);}',
        159810: b'if(this._wqaQuestCapture)this._wqaQuestCapture.title=true;',
        161688: b'if(this._wqaQuestCapture)this._wqaQuestCapture.title=false;',
        163660: b'this._wqaQuestCapture?.beginRow();',
        166031: b'this._wqaQuestCapture?.endRow();',
        166914: b'this._wqaQuestCapture?.beginRow();',
        167877: b'this._wqaQuestCapture?.endRow();',
        # Retire a quest route before the old native sprites are removed and
        # the asset waiter is started. Ordinary field requests are untouched.
        343956: b'if(SceneManager._scene?._wqaQuestNavigation&&SceneManager._scene._spriteset===this)'
                b'globalThis.WendyQuestAccessQuestNavigationLeaving?.(SceneManager._scene);',
        369098: b'if(this._wqaQuestTracking||((this._wqaFieldReady||this._questNavWindow?._wqaQuestDraft)&&'
                b'this._questNavWindow?._init&&this._questNavWindow.visible&&this._questNavWindow.offsetY===0&&'
                b'this._questNavWindow._needContentRefresh===false&&'
                b'this._questNavWindow._wqaQuestDraft!==false))'
                b'globalThis.WendyQuestAccessQuestUpdate?.(this,this._wqaFieldReady?$gameQuest:null);',
        375124: b'if(this._questNavWindow){this._questNavWindow._wqaQuestRevision='
                b'(this._questNavWindow._wqaQuestRevision||0)+1;'
                b'if(this._wqaQuestTracking)globalThis.WendyQuestAccessQuestUpdate?.(this);}',
    })


def managers_notification(original):
    return insert(original, MANAGERS_SHA, {
        # Use the cache selected by the native loader. The opening Elder's
        # parallel interpreter re-requests the same loaded face every update.
        25496: b'    const wqaScene=this._wqaInterpreterPreload?SceneManager._scene:null;\n'
               b'    const wqaCold=wqaScene&&!cache[url]?.isReady();\n'
               b'    if(wqaCold){if(wqaScene._wqaMapRestored)wqaScene._wqaFieldReady=false;'
               + narration_leaving() + MAP_LEAVING + b'}\n',
        25564: b'    if(wqaCold&&wqaScene._wqaMapRestored&&!cache[url].isReady())'
               b'globalThis.WendyQuestAccessTrackPreload?.(wqaScene,cache[url]);\n',
        # These entry sites precede Chromium reload or the next scene constructor.
        54263: SCENE_LEAVING + b'\n        ',
        57606: b'\n' + files_ready('this._scene'),
        58080: b'\n    ' + SCENE_LEAVING,
        59505: b'\n    ' + narration_leaving() + MAP_LEAVING,
        62230: b'\n    if(SceneManager._scene?._wqaBattleFocusActive&&this._phase!=="input")'
               b'globalThis.WendyQuestAccessBattleFocusLeaving?.(SceneManager._scene);'
               b'\n    if(this._phase!=="input")' + BATTLE_BAG_LEAVING + b';'
               b'\n    if(this._phase!=="ActionCommand")' + BATTLE_TIMING_LEAVING + b';'
               b'\n    if(this._phase!=="input"&&this._phase!=="ActionCommand")' + BATTLE_CUE_LEAVING + b';'
               b'\n    if(this._phase!=="input"&&this._phase!=="ActionCommand")' + BATTLE_TARGET_LEAVING + b';',
        62280: b'        if(SceneManager._scene?._wqaBattleStarted){' + MAP_LEAVING + b'}\n',
        # The result code is still owned by the native battle here.
        77634: b'    if(result===0&&SceneManager._scene?._wqaBattleStarted)SceneManager._scene._wqaBattleWon=true;\n',
    })


def scenes_notification(original):
    return insert(original, SCENES_SHA, {
        106138: b'    if(this._wqaBattleBagActive)globalThis.WendyQuestAccessMenuLeaving?.(this);\n',
        2349: b'\n    ' + narration_leaving() + MAP_LEAVING,
        3177: b'\n' + files_ready('this'),
        33497: b'\n    if(this._wqaShop&&this._started&&this._active&&this._fadeDuration===0&&this._fadeOpacity===0&&'
               b'!this._wqaSettingsActive&&!SceneManager._nextScene&&!SceneManager._exiting&&'
               b'!SceneManager._wqaNativeAutosaves&&!Graphics._wqaResize&&Graphics.app?.stage===this){'
               b'if(this._numberWindow?.active&&this._numberWindow._wqaShopQuantity)'
               b'globalThis.WendyQuestAccessMenuReady?.(this,5);'
               b'else if(this._buyWindow?.active&&this._buyWindow._wqaShopRows?.has(this._buyWindow._index))'
               b'globalThis.WendyQuestAccessMenuReady?.(this,4);}\n',
    })


# The verified parallel weather timers have no event-page consumers of variable 2.
LIGHTNING_EVENTS = {12: 31, 13: 9, 14: 28, 15: 35, 16: 40, 17: 20, 161: 3,
                    162: 2, 164: 3, 165: 1, 166: 3, 207: 2, 208: 2}


def objects_notification(original):
    lightning = json.dumps(LIGHTNING_EVENTS, separators=(',', ':')).encode()
    preload = (b'{const wqaPrior=ImageManager._wqaInterpreterPreload;'
               b'ImageManager._wqaInterpreterPreload=true;try{')
    restore_preload = b'}finally{ImageManager._wqaInterpreterPreload=wqaPrior;}}'
    return insert(original, OBJECTS_SHA, {
        2915: b'        if(SceneManager._scene?._wqaBattleStarted){BattleManager._wqaBattleSpritesBusy=undefined;'
              + BATTLE_LOG_LEAVING + b';}\n',
        # FilterController replaces the numeric setter. Both setters still
        # call onChange. Consume the qualified writer's mark once, before the
        # quest plugin can make a separate request after the numeric write.
        18015: b'const wqaScene=SceneManager._scene;'
               b'const wqaNonPageOnly=wqaScene?._wqaNonPageVariableWrite&&'
               b'(!$gameMap._needsRefresh||wqaScene._wqaNonPageRefreshOnly);'
               b'if(wqaScene?._wqaNonPageVariableWrite)wqaScene._wqaNonPageVariableWrite=false;',
        18041: b'if(wqaNonPageOnly)wqaScene._wqaNonPageRefreshOnly=true;',
        162252: b'if(this===$gameMap&&SceneManager._scene?._wqaNonPageRefreshOnly)'
                b'SceneManager._scene._wqaNonPageRefreshOnly=false;',
        # The timer and Chomps's parallel Saltcaster guard have no page
        # consumers for their variable writes. For the guard, allow only
        # an unchanged value from its owned native common event.
        278919: b'const wqaNonPageScene=(variableId===2||variableId===12)&&this._mapId===$gameMap?._mapId&&'
                b'SceneManager._scene?._wqaMapRestored&&('
                b'variableId===2&&this._eventId===(' + lightning + b')[this._mapId]||'
                b'variableId===12&&this._mapId===59&&this._eventId===26&&operationType===0&&value===1&&'
                b'this._list===$dataCommonEvents?.[47]?.list&&'
                b'$gameMap._events[26]?._interpreter?._childInterpreter===this&&$gameVariables.value(12)===1'
                b')?SceneManager._scene:null;'
                b'if(wqaNonPageScene)wqaNonPageScene._wqaNonPageVariableWrite=true;',
        279818: b'finally{if(wqaNonPageScene)wqaNonPageScene._wqaNonPageVariableWrite=false;}',
        # Sunny Fryshire continuously reapplies the same tileset. Keep the
        # native refresh, and retire routes only when the actual ID changes.
        178811: b'\n    if(this._tilesetId!==tilesetId){' + ROUTE_DIRTY + b'}\n    ',
        180829: b'if(this===$gameMap&&(SceneManager._scene?._wqaCaveGuideActive||Graphics._wqaCaveAutoPending)&&SceneManager._scene?._wqaFieldReady&&'
                b'!SceneManager._nextScene&&Graphics.app?.stage===SceneManager._scene&&!$gamePlayer._transferring)'
                b'globalThis.WendyQuestAccessCaveEventAccepted?.(SceneManager._scene,event);\n            '
                b'if(this===$gameMap&&SceneManager._scene?._wqaBookmarkEntrance&&!SceneManager._nextScene&&'
                b'Graphics.app?.stage===SceneManager._scene&&!$gamePlayer._transferring)'
                b'globalThis.WendyQuestAccessBookmarkEntranceAccepted?.(SceneManager._scene,event);\n            ',
        185272: b'\n    if(this._priorityType!==priorityType){' + ACTOR_DIRTY + beacon_actor() + b'}',
        188368: b'\n    ' + ACTOR_DIRTY + beacon_actor(),  # Position and copyPosition
        188538: b'\n    if(this._x!==character._x||this._y!==character._y){' + ACTOR_DIRTY + beacon_actor() + b'}',
        189047: b'if(this._direction!==d){' + beacon_actor(player_only=True) +
                b'if(SceneManager._scene?._wqaCaveCueUntil&&this===$gamePlayer)'
                b'globalThis.WendyQuestAccessCaveTimingPose?.(SceneManager._scene);}\n        ',
        # Native interpolation has reached the reserved tile. updateMove
        # runs on moving characters, separately from jumping or relocation.
        191826: b'\n        if(this===$gamePlayer&&Graphics._wqaFootstepsEnabled&&SceneManager._scene?._wqaFieldReady)'
                b'globalThis.WendyQuestAccessFootstep?.(SceneManager._scene,this);'
                b'else if(Graphics._wqaCaveTimingEnabled&&this._trigger===2&&this._mapId===$gameMap?._mapId&&'
                b'SceneManager._scene?._wqaFieldReady)'
                b'globalThis.WendyQuestAccessGuardFootstep?.(SceneManager._scene,this);',
        194431: b'\n    if(this._tileId){' + ACTOR_DIRTY + beacon_actor() + b'}',
        194681: b'\n    if(this._tileId!==tileId){' + ACTOR_DIRTY + beacon_actor() + b'}',
        195557: beacon_actor(b'd') + b'if(SceneManager._scene?._wqaCaveTimingActive&&this===$gamePlayer)'
                b'globalThis.WendyQuestAccessCaveTimingMoved?.(SceneManager._scene,d);\n        ',  # Before destination assignment
        195829: ACTOR_STEP + b'\n        ',  # Accepted straight/diagonal steps
        196445: ACTOR_STEP + beacon_actor() + b'\n        ',
        196721: b'\n    if(xPlus||yPlus){' + ACTOR_DIRTY + beacon_actor() + b'}',
        197969: b'\n    if(this._through!==through){' + ACTOR_DIRTY + beacon_actor() + b'}',
        202310: b'if(SceneManager._scene?._wqaCaveTimingActive||SceneManager._scene?._wqaPreviewUntil)'
                b'globalThis.WendyQuestAccessFieldChanged?.(SceneManager._scene);\n    ',  # Forced route ownership
        210400: b'if(this._eventId===18&&$gameMap?._mapId===200&&'
                b'(SceneManager._scene?._wqaCaveTimingActive||SceneManager._scene?._wqaPreviewUntil))'
                b'globalThis.WendyQuestAccessFieldChanged?.(SceneManager._scene);\n        ',  # Distraction wait boundary
        249865: ROUTE_DIRTY + b'\n        ',  # Active event page replacement
        21807: b'\n    ' + narration_leaving() + MAP_LEAVING,  # Game_Screen fade-out
        217381: b'\n    if(this===$gamePlayer&&Graphics._wqaBookmarkTransferPending)'
                b'globalThis.WendyQuestAccessBookmarkTransferReserved?.(SceneManager._scene,this,mapId,x,y,d);\n    '
                + narration_leaving() + MAP_LEAVING,  # Accepted transfer reservation
        231501: MAP_LEAVING + b'\n        ',  # Native aircraft boarding
        231586: MAP_LEAVING + b'\n        ',  # Native ship boarding
        231668: MAP_LEAVING + b'\n        ',  # Native boat boarding
        232058: b'if(this===$gamePlayer&&SceneManager._scene?._wqaBookmarkLanding)'
                b'globalThis.WendyQuestAccessBookmarkLandingAccepted?.(SceneManager._scene,this);'
                + MAP_LEAVING + b'\n        ',  # Native landing after isLandOk
        222789: b'if(this===$gamePlayer&&SceneManager._scene?._wqaAutowalkActive)'
                b'direction=globalThis.WendyQuestAccessAutowalkInput?.(SceneManager._scene,this,direction,'
                b'direction>0||$gameTemp.isDestinationValid())??direction;\n        '
                b'if(this===$gamePlayer&&SceneManager._scene?._wqaCaveTimingActive)'
                b'direction=globalThis.WendyQuestAccessCaveTimingInput?.(SceneManager._scene,direction)??direction;\n        ',
        222850: b'\n            if(this===$gamePlayer&&SceneManager._scene?._wqaFieldReady&&'
                b'(Graphics._wqaWallEnabled||Graphics._wqaFootstepsEnabled||SceneManager._scene._wqaBeaconActive||SceneManager._scene._wqaAutowalkActive))'
                b'globalThis.WendyQuestAccessFieldMove?.(SceneManager._scene,direction,this._movementSuccess);',
        249454: b'if(SceneManager._scene?._wqaFieldReady&&(Graphics._wqaWallEnabled||Graphics._wqaFootstepsEnabled||SceneManager._scene._wqaBeaconActive||'
                b'SceneManager._scene._wqaCaveReview||SceneManager._scene._wqaCaveTimingActive||'
                b'SceneManager._scene._wqaAutowalkActive||SceneManager._scene._wqaSoundscapeActive||'
                b'SceneManager._scene._wqaQuestTracking||SceneManager._scene._wqaQuestNavigation||'
                b'SceneManager._scene._wqaRouteActive||SceneManager._scene._wqaInteractionActive||'
                b'SceneManager._scene._wqaIceRoute))'
                b'globalThis.WendyQuestAccessFieldEvent?.(SceneManager._scene,this);\n        ',  # Accepted event start
        255063: b'\n    if(this===$gameMap?._interpreter||this===$gameTroop?._interpreter){' + narration_leaving() +
                MAP_LEAVING.replace(b'?.(SceneManager._scene);', b'?.(SceneManager._scene,this===$gameMap?._interpreter?eventId:0);') +
                b'if(SceneManager._scene?._wqaBattleFocusActive)'
                b'globalThis.WendyQuestAccessBattleFocusLeaving?.(SceneManager._scene);' +
                BATTLE_TARGET_LEAVING + b';' + BATTLE_BAG_LEAVING + b';' + BATTLE_TIMING_LEAVING + b';' +
                BATTLE_CUE_LEAVING + b';' + BATTLE_LOG_LEAVING + b';' + BATTLE_RADIAL_LEAVING + b';}',
        255573: preload,  # Interpreter face preload
        255618: restore_preload,
        255696: preload,  # Interpreter picture preload
        255744: restore_preload,
        257529: b'\n            if(!waiting&&SceneManager._scene?._wqaBattleInterpreter===this){'
                + MAP_LEAVING + b'SceneManager._scene._wqaBattleInterpreter=null;}',
        # Retain the accepting map event only for the lifetime of this
        # native message. Portraitless NPC lines use its presented sprite.
        11844: b'    this._wqaSpeakerEvent = 0;\n',
        262811: b'    if($gameMap?._mapId===this._mapId&&SceneManager._scene?._wqaMapRestored)'
                b'$gameMessage._wqaSpeakerEvent=this._eventId;\n',
        # These authored story switches reveal actual character sprites.
        274031: b'if(Graphics._wqaNarrationEnabled&&params[0]===params[1]&&params[2]===0&&'
                b'(this._mapId===63&&params[0]===419||this._mapId===107&&params[0]===131||'
                b'this._mapId===114&&params[0]===23||this._mapId===134&&params[0]===77))'
                b'globalThis.WendyQuestAccessNarrationAccepted?.(SceneManager._scene,this,null,params[0]);\n    ',
        # After acceptance of an authored actor's route. The rendered actor,
        # current event list and resource gates are checked in the observer.
        286102: b'\n        if(Graphics._wqaNarrationEnabled&&'
                b'(this._mapId===16||this._mapId===20||this._mapId===63||this._mapId===77||'
                b'this._mapId===103||this._mapId===106||this._mapId===107||this._mapId===108||'
                b'this._mapId===110||this._mapId===134||this._mapId===197))'
                b'globalThis.WendyQuestAccessNarrationAccepted?.(SceneManager._scene,this,character);',
        # Native emotes, Frostyna's flash, and the two identical door approaches.
        287095: b'\n        if(Graphics._wqaNarrationEnabled&&this===$gameMap?._interpreter&&'
                b'(params[1]===1||params[1]===2||(params[1]>=5&&params[1]<=9)))'
                b'globalThis.WendyQuestAccessNarrationAccepted?.(SceneManager._scene,this,character,undefined,params[1]);',
        288646: b'\n    if(Graphics._wqaNarrationEnabled&&this._mapId===134&&this._eventId===2&&this._index===15)'
                b'globalThis.WendyQuestAccessNarrationAccepted?.(SceneManager._scene,this,this.character(0),undefined,-1);',
        291911: b'\n    if(Graphics._wqaNarrationEnabled&&this._mapId===134&&this._index===1&&'
                b'(this._eventId===8||this._eventId===9)&&params[0]?.name==="WQ/SFX_LowRumble")'
                b'globalThis.WendyQuestAccessNarrationAccepted?.(SceneManager._scene,this,$gamePlayer,undefined,-2);',
        # ShowRewardTokens synchronously appends exactly one reward sprite.
        # Record it after the native call, before any later event command.
        305132: b'const wqaRewardScene=pluginName==="WendyQuest"&&params[1]==="ShowRewardTokens"?SceneManager._scene:null;'
                b'const wqaRewardChildren=wqaRewardScene?._spriteset?.children;'
                b'const wqaRewardBefore=wqaRewardChildren?.length;\n    ',
        305198: b'\n    if(wqaRewardBefore!==undefined&&wqaRewardChildren.length===wqaRewardBefore+1)'
                b'globalThis.WendyQuestAccessTreasureStarted?.(wqaRewardScene,wqaRewardChildren[wqaRewardBefore]);',
        258782: b'\n    if(waitMode==="message"&&SceneManager._scene?._wqaBattleStarted)'
                b'SceneManager._scene._wqaBattleInterpreter=this;',
    })


def windows_notification(original):
    paint = (Path(__file__).resolve().parents[1] / 'src/dialogue/paint-markers.js').read_bytes()
    return insert(original, WINDOWS_SHA, {
        6945: b'    if (this._wqaChoicePaint) textState._wqaPaint = this._wqaChoicePaint;\n'
              b'    else if (this._wqaBattleLogPaint) textState._wqaPaint = this._wqaBattleLogPaint;\n',
        171638: b'        if (state.iconIndex > 0 && (!stateText || !state.message4)) '
                b'globalThis.WendyQuestAccessBattleCondition?.(this,target,state,true,!stateText);\n',
        172025: b'        if (state.iconIndex > 0 && !state.message4) '
                b'globalThis.WendyQuestAccessBattleCondition?.(this,target,state,false,true);\n',
        # Carry the source of the native ability line as a separate queue argument.
        166632: b', (item?.id===31||item?.id===32)?'
                b'globalThis.WendyQuestAccessAbilitySource?.(item,fmt):undefined',
        162511: b'    if(SceneManager._scene?._wqaBattleStarted&&SceneManager._scene._logWindow===this){'
                b'BattleManager._wqaBattleSpritesBusy=undefined;'
                b'SceneManager._scene._wqaBattleLogActive&&globalThis.WendyQuestAccessBattleLogBlocked?.(SceneManager._scene);}\n',
        7547: b'\n        if (text && (textState._wqaMessage || textState._wqaPaint)) this._wqaRecordPaint(textState, text);',
        7872: b'\n' + paint + b'\n',
        11423: b'\n        if (textState._wqaMessage || textState._wqaPaint) '
               b'this._wqaRecordPaint(textState, "\\x01" + iconIndex + "\\x02");',
        97987: b'let wqaEnabled;\n    ',
        98011: b'(wqaEnabled=',
        98031: b')',
        98187: b'\n    if(SceneManager._scene?._wqaShop&&SceneManager._scene._buyWindow===this&&index>=0&&index<128)'
               b'(this._wqaShopRows||=new Map()).set(index,{item,price,enabled:wqaEnabled,'
               b'contents:this.contents,list:this._data});',
        # The custom refresh has already drawn the name and quantity before
        # this stock routine completes the total and currency on the same bitmap.
        103731: b'\n    if(SceneManager._scene?._wqaShop&&SceneManager._scene._numberWindow===this)'
                b'this._wqaShopQuantity={contents:this.contents,item:this._item,count:this._number,'
                b'price:total,currency:this._currencyUnit};',
        108820: b'let wqaName;\n    ',
        108834: b'(wqaName=',
        108846: b')',
        109039: b'\n    if(SceneManager._scene?._wqaShop&&SceneManager._scene._statusWindow===this)'
                b'this._wqaShopEquip={contents:this.contents,item:this._item,name:wqaName,enabled,oldItem:item1};',
        109483: b'\n    if(SceneManager._scene?._wqaShop&&SceneManager._scene._statusWindow===this)'
                b'this._wqaShopChange={contents:this.contents,item:this._item,paramId,change};',
        127397: b'    if (' + DIALOGUE_HOST + b' && SceneManager._scene._messageWindow === this._messageWindow) {\n'
                b'        this._wqaChoiceRows = [];\n        this._wqaChoiceShown = null;\n    }\n',
        131029: b'    if (this._wqaChoiceRows) this._wqaChoicePaint = { index, text: "" };\n',
        131102: b'\n    if (this._wqaChoicePaint) {\n        this._wqaChoiceRows[index % 16] = this._wqaChoicePaint;\n'
                b'        this._wqaChoicePaint = null;\n    }',
        131394: b'    ' + DIALOGUE_LEAVING + b'\n',
        131562: b'    ' + DIALOGUE_LEAVING + b'\n',
        132508: b'    if (' + DIALOGUE_HOST + b' && SceneManager._scene._messageWindow === this._messageWindow) {\n'
                b'        this._wqaNumberDrawn = "";\n        this._wqaNumberChange = 0;\n'
                b'        this._wqaNumberShownChange = null;\n    }\n',
        136455: b'\n    if (this._wqaNumberChange !== undefined) this._wqaNumberChange++;',
        136784: b'    ' + DIALOGUE_LEAVING + b'\n',
        137309: b'\n    if (this._wqaNumberChange !== undefined) {\n'
                b'        if (index === 0) { this._wqaNumberPaintCount = 0; this._wqaNumberDrawn = ""; }\n'
                b'        if (index === this._wqaNumberPaintCount && s.length === this._maxDigits && s.length <= 16 &&\n'
                b'            ++this._wqaNumberPaintCount === s.length) this._wqaNumberDrawn = s;\n    }',
        144815: b'    ' + DIALOGUE_LEAVING + b'\n    this._wqaDialoguePaint = this._wqaAutoPaint = null;\n',
        145641: b'\n            ' + DIALOGUE_LEAVING +
                b'\n            if (this._wqaDialoguePaint) this._wqaDialoguePaint.end = 0;',
        # The automatic-close path leaves the contents intact until the
        # native close animation. Only a subsequent full render may use them.
        147570: b'            const wqaAuto = this._wqaDialoguePaint;\n',
        147606: b'\n            if (wqaAuto && wqaAuto.end > wqaAuto.spoken) this._wqaAutoPaint = wqaAuto;',
    })


def dialogue_update(context_ready, victory=False):
    momentum = b'''
        const wqaVictoryMomentum = this._wqaBattleWon && this._wqaMomentumPending &&
            Graphics.frameCount >= this._wqaMomentumNextFrame &&
            ((this._wqaDialogue && wqaPaint && wqaMessage.openness === 255) ||
                (wqaMessage?.openness === 0 && !$gameMessage.hasText()));
''' if victory else b'\n'
    return b'''
    {
        const wqaMessage = this._messageWindow;
        if (wqaMessage?._wqaAutoPaint && wqaMessage.openness !== 255) wqaMessage._wqaAutoPaint = null;
        const wqaAuto = wqaMessage?._wqaAutoPaint;
        const wqaPaint = wqaMessage?._wqaDialoguePaint || wqaAuto;
        const wqaChoice = wqaMessage?._choiceListWindow;
        const wqaNumber = wqaMessage?._numberInputWindow;
        const wqaPageWaiting = wqaPaint && wqaPaint.end > wqaPaint.spoken && wqaMessage.openness === 255;
        const wqaChoiceWaiting = wqaChoice?._wqaChoiceRows && wqaChoice.active &&
            wqaChoice.openness === 255 && wqaChoice._wqaChoiceShown !== wqaChoice._index &&
            (wqaChoice._index === -1 || wqaChoice._wqaChoiceRows[wqaChoice._index % 16]?.index === wqaChoice._index);
        const wqaNumberWaiting = wqaNumber?.active && wqaNumber.openness === 255 && wqaNumber._wqaNumberDrawn &&
            (wqaNumber._wqaNumberShownIndex !== wqaNumber._index ||
                wqaNumber._wqaNumberShownChange !== wqaNumber._wqaNumberChange);
        const wqaPicture = this._wqaMapRestored && wqaMessage?.pause && !this._wqaDiagramShown &&
            (this._wqaDiagramAttempts || 0) < 30 && $gameScreen._pictures?.[27];
        const wqaDiagramWaiting = !!(wqaPicture && !wqaPicture._duration &&
            (wqaPicture._name === "system/Caffeine Caverns Map" || wqaPicture._name === "system/Savoria Map"));
        const wqaVictoryCondition = this._wqaVictoryCondition && this._wqaDialogue &&
            wqaPaint && wqaMessage.openness === 255;__WQA_MOMENTUM__        if ((wqaPageWaiting || wqaChoiceWaiting || wqaNumberWaiting || wqaDiagramWaiting || wqaVictoryCondition__WQA_VICTORY_CHECK__) &&
            !this._wqaDialoguePending &&
            __WQA_CONTEXT__ && this._started && this._active &&
            this._fadeDuration === 0 && this._fadeOpacity === 0 && !($gameScreen._fadeOutDuration > 0) &&
            this === SceneManager._scene && !SceneManager._nextScene && !SceneManager._exiting &&
            !SceneManager._wqaNativeAutosaves && !Graphics._wqaResize && Graphics.app?.stage === this &&
            (!wqaPageWaiting || (!wqaMessage._faceBitmap &&
                (wqaAuto || !(wqaMessage._nameSprite?._currentString && wqaMessage._nameSprite._animationRunning)) &&
                (!wqaMessage._slicedSprite?.visible || (wqaMessage._slicedSpriteFull && wqaMessage._slicedSpriteFaded)))))
            globalThis.WendyQuestAccessDialogueReady?.(this, wqaDiagramWaiting);
    }
'''.replace(b'__WQA_CONTEXT__', context_ready).replace(b'__WQA_MOMENTUM__', momentum).replace(
        b'__WQA_VICTORY_CHECK__', b' || wqaVictoryMomentum' if victory else b'')


def map_notification(original):
    # Native map updates call the mod only after the current scene, window,
    # and control state meet the presentation's own readiness conditions.
    banner_update = b'''
    {
        const wqaWindow = this._mapNameWindow;
        const wqaRevision = wqaWindow?._wqaBannerDrawnRevision;
        const wqaUnread = wqaRevision && wqaRevision !== wqaWindow._wqaBannerRead;
        if (this._wqaMapAnnouncement || wqaUnread) {
            const wqaReady = wqaRevision && wqaWindow._showCount > 0 &&
                wqaWindow.visible && wqaWindow.openness === 255 && wqaWindow.contentsOpacity > 0 &&
                this._wqaMapRestored && this._mapLoaded && this._started && this._active &&
                !this._wqaPreloads?.size && !this._wqaPreloadOverflow &&
                this._fadeDuration === 0 && this._fadeOpacity === 0 && this._prevCanMove === true &&
                this.srcWendy && this.srcStones && $gameMap._nameDisplay && $gameMap.inactiveTime < 30 &&
                !$gamePlayer._transferring && $gameScreen._brightness === 255 && !($gameScreen._fadeOutDuration > 0) &&
                this === SceneManager._scene && !SceneManager._nextScene && !SceneManager._exiting &&
                !SceneManager._wqaNativeAutosaves && !Graphics._wqaResize && Graphics.app?.stage === this;
            if (this._wqaMapAnnouncement > 0 && (!wqaReady || this._wqaMapAnnouncement !== wqaRevision))
                globalThis.WendyQuestAccessMapBannerLeaving?.(this);
            if (wqaReady && wqaUnread && !(this._wqaMapAnnouncement > 0))
                globalThis.WendyQuestAccessMapBannerReady?.(this, wqaRevision);
        }
    }
'''
    field_update = b'''
    if (this._wqaTreasureDue && Graphics.frameCount >= this._wqaTreasureDue)
        globalThis.WendyQuestAccessTreasureUpdate?.(this);
    if (this._wqaWallUntil && Graphics.frameCount >= this._wqaWallUntil)
        globalThis.WendyQuestAccessWallExpire?.(this);
    if (this._wqaBeaconUntil && Graphics.frameCount >= this._wqaBeaconUntil)
        globalThis.WendyQuestAccessBeaconExpire?.(this);
    if (this._wqaCaveCueUntil && Graphics.frameCount >= this._wqaCaveCueUntil)
        globalThis.WendyQuestAccessCaveTimingStop?.(this);
    if (this._wqaPreviewUntil && Graphics.frameCount >= this._wqaPreviewUntil)
        globalThis.WendyQuestAccessFieldChanged?.(this);
    const wqaWasFieldReady = this._wqaFieldReady;
    this._wqaFieldReady = !!(this._wqaMapRestored && this._mapLoaded && this._started && this._active &&
        this._fadeDuration === 0 && this._fadeOpacity === 0 && this._prevCanMove === true && this.srcWendy &&
        this.srcStones && $gameMap.inactiveTime < 30 &&
        (!$gameMap._needsRefresh || this._wqaNonPageRefreshOnly) &&
        !$gameMap._needsTilemapRefresh && !this._wqaPreloads?.size && !this._wqaPreloadOverflow &&
        !$gamePlayer._transferring && !$gamePlayer._vehicleGettingOn && !$gamePlayer._vehicleGettingOff &&
        $gameScreen._brightness === 255 && !$gameScreen._fadeOutDuration && !this._wqaTerrainWork &&
        this === SceneManager._scene && !SceneManager._nextScene && !SceneManager._exiting &&
        !SceneManager._wqaNativeAutosaves && !Graphics._wqaResize && Graphics.app?.stage === this);
    // Sample optional idle effects after the native animation update.
    if (Graphics._wqaNarrationEnabled && $gameMap.inactiveTime >= 30) {
        const wqaIdleSample = Math.floor($gameMap.inactiveTime * 4);
        if (wqaIdleSample !== this._wqaIdleNarrationSample) {
            this._wqaIdleNarrationSample = wqaIdleSample;
            globalThis.WendyQuestAccessIdleNarration?.(this);
        }
    } else if ($gameMap.inactiveTime < 30 && this._wqaIdleNarrationSample) {
        this._wqaIdleNarrationSample = 0;
        this._wqaIdleNarrationMask = 0;
    }
    if (this._wqaNarrationActive) globalThis.WendyQuestAccessNarrationPresent?.(this);
    if (this._wqaFieldReady) {
        if (Graphics._wqaNarrationEnabled && !Graphics._wqaNarrationPackFinished && !this._wqaNarrationLoading &&
            !$gameMap._interpreter?._list)
            globalThis.WendyQuestAccessNarrationWarm?.(this);
        if ((this._wqaPlaceFrames || 0) < 30 && !this._wqaSettingsActive &&
            !$gameMessage.isBusy() && !$gameMap._interpreter?._list) {
            this._wqaPlaceFrames = (this._wqaPlaceFrames || 0) + 1;
            if (this._wqaPlaceFrames === 30)
                globalThis.WendyQuestAccessMapEntranceReady?.(this);
        }
        const wqaVehicleType = $gamePlayer._vehicleType;
        if ((this._wqaVehicleType !== wqaVehicleType || wqaVehicleType === "airship" &&
            $gamePlayer._x === $gamePlayer._realX && $gamePlayer._y === $gamePlayer._realY &&
            (this._wqaLandingX !== $gamePlayer._x || this._wqaLandingY !== $gamePlayer._y ||
                !(Graphics.frameCount < this._wqaLandingDue))) &&
            !this._wqaSettingsActive && !$gameMap._interpreter?._list && !$gameMessage.isBusy())
            globalThis.WendyQuestAccessVehicleReady?.(this);
        if (this._wqaIceRoute && !$gameMap._interpreter?._list)
            globalThis.WendyQuestAccessIceRouteReady?.(this);
        if (this._wqaStepNavigation && $gamePlayer._x === $gamePlayer._realX && $gamePlayer._y === $gamePlayer._realY)
            globalThis.WendyQuestAccessStepNavigationReady?.(this);
        const wqaIcon = $gamePlayer._iconState === 1 && $gamePlayer._interactIcon?.visible ? $gamePlayer._interactIcon : null;
        if ((this._wqaInteractionActive && this._wqaInteractionActive !== wqaIcon) ||
            (!this._wqaInteractionActive && !this._wqaInteractionDeferred && !this._wqaAutowalkActive && wqaIcon && wqaIcon !== this._wqaInteractionSeen &&
            wqaIcon.scale.x > 0 && wqaIcon.children[0]?.texture?.valid))
            globalThis.WendyQuestAccessInteractionUpdate?.(this, wqaIcon);
        if (!Graphics._wqaFrontEndObserved || ((Graphics._wqaCaveProgressPending || Graphics._wqaCaveAutoPending ||
            Graphics._wqaBookmarkTransferPending) &&
            !$gameMap._interpreter?._list &&
            $gamePlayer._x === $gamePlayer._realX && $gamePlayer._y === $gamePlayer._realY) ||
            (Graphics._wqaCaveRecoveryPending && $gameMap._mapId !== 198) ||
            (!wqaWasFieldReady && (Graphics._wqaWallEnabled || Graphics._wqaFootstepsEnabled || Graphics._wqaCaveTimingEnabled)))
            globalThis.WendyQuestAccessFieldReady?.(this);
        if (this._wqaBeaconDue && Graphics.frameCount >= this._wqaBeaconDue)
            globalThis.WendyQuestAccessBeaconUpdate?.(this);
        if (this._wqaCaveCueDue && Graphics.frameCount >= this._wqaCaveCueDue)
            globalThis.WendyQuestAccessCaveTimingUpdate?.(this);
        if (Graphics._wqaSoundscapeEnabled && (this._wqaSoundscapeSample ||
            !this._wqaSoundscapeDue || Graphics.frameCount >= this._wqaSoundscapeDue))
            globalThis.WendyQuestAccessSoundscapeUpdate?.(this);
    } else if (wqaWasFieldReady || this._wqaRouteActive || this._wqaCaveReview || this._wqaWallAudio ||
        this._wqaBeaconActive || this._wqaCaveTimingActive || this._wqaSoundscapeActive || this._wqaInteractionActive)
        globalThis.WendyQuestAccessFieldControlLost?.(this);
'''
    credits_update = b'''
    {
        const wqaMap = $gameMap._mapId;
        const wqaSlots = globalThis.WendyQuestAccessCreditSlots;
        if ((wqaMap === 188 || wqaMap === 189 || (wqaMap >= 210 && wqaMap <= 239)) &&
            wqaSlots && !this._wqaCreditsPending && this._wqaMapRestored && this._mapLoaded &&
            this._started && this._active && this._fadeDuration === 0 && this._fadeOpacity === 0 &&
            !this._wqaPreloads?.size && !this._wqaPreloadOverflow &&
            $gameScreen._brightness === 255 && !$gameScreen._fadeOutDuration && !this._wqaTerrainWork &&
            !$gamePlayer._transferring && $gameMap._interpreter?._list && !$gameMessage.isBusy() &&
            this === SceneManager._scene && !SceneManager._nextScene && !SceneManager._exiting &&
            !SceneManager._wqaNativeAutosaves && !Graphics._wqaResize && Graphics.app?.stage === this) {
            for (const wqaSlot of wqaSlots) {
                const wqaPicture = $gameScreen._pictures?.[wqaSlot];
                if (wqaPicture?._opacity >= 250 && !wqaPicture._duration && !this._wqaCreditsSeen?.has(wqaPicture) &&
                    (this._wqaCreditsRetry?.get(wqaPicture) ?? 0) <= Graphics.frameCount &&
                    (wqaPicture._text || (wqaSlot === 25 && wqaPicture._name === "pictures/Ending") ||
                        (wqaSlot === 26 && wqaPicture._name === "pictures/TheEnd"))) {
                    globalThis.WendyQuestAccessCreditsReady?.(this);
                    break;
                }
            }
        }
        if (this._wqaCreditCards && (this._fadeDuration || this._fadeOpacity || $gameScreen._brightness !== 255 ||
            $gameScreen._fadeOutDuration || $gameMessage.isBusy() || !this._wqaCreditCards.some(wqaCard =>
                $gameScreen._pictures[wqaCard.id] === wqaCard.picture && wqaCard.picture._opacity >= 250 &&
                !wqaCard.picture._duration)))
            globalThis.WendyQuestAccessCreditsObscured?.(this);
    }
'''
    return insert(original, MAP_SHA, {
        # Track the native generator lifetime, including yielded rings.
        32483: b'const wqaFloodScene=SceneManager._scene?._wqaMapRestored?SceneManager._scene:null;'
               b'let wqaFloodActive=!!wqaFloodScene;const wqaFloodDone=()=>{if(wqaFloodActive){'
               b'wqaFloodActive=false;wqaFloodScene._wqaTerrainWork--;}};'
               b'if(wqaFloodActive){wqaFloodScene._wqaTerrainWork=(wqaFloodScene._wqaTerrainWork||0)+1;'
               + ROUTE_DIRTY + b'}try{',
        32557: b'try{',
        33719: b'}finally{wqaFloodDone();}',
        33722: b'}catch(wqaError){wqaFloodDone();throw wqaError;}',
        47577: ACTOR_DIRTY + beacon_actor(),  # Runtime rectangle replacement
        59596: b'this._wqaMapRestored=true;',
        62779: field_update + banner_update + credits_update + dialogue_update(b'this._wqaMapRestored && this._mapLoaded && this.srcWendy && '
                                               b'this.srcStones && !this._wqaPreloads?.size && !this._wqaPreloadOverflow && '
                                               b'$gameMap.inactiveTime < 30 && !$gamePlayer._transferring'),
        67386: b'||(this._wqaNavigationWake&&globalThis.WendyQuestAccessIdleInput?.(this))',
        69005: b'if(_0x1bb9dc>=30){' + MAP_LEAVING + b'}',  # Before the first native idle cue
        86279: b'if(SceneManager._scene?._mapNameWindow===this&&SceneManager._scene._wqaMapAnnouncement)'
               b'globalThis.WendyQuestAccessMapBannerLeaving?.(SceneManager._scene);'
               b'const wqaRevision=(this._wqaBannerRevision||0)+1;'
               b'this._wqaBannerRevision=wqaRevision;this._wqaBannerDrawnRevision=0;let wqaName;',
        86846: b'(wqaName=',
        86874: b')',
        87176: b'if(this._wqaBannerRevision===wqaRevision&&typeof wqaName==="string"&&'
               b'wqaName.length>0&&wqaName.length<=256){this._wqaBannerText=wqaName;'
               b'this._wqaBannerDrawnRevision=wqaRevision;}',
        91226: b'this._wqaDialoguePaint&&(this.pause||(_0x56fdd1.index>=_0x56fdd1.text.length&&!this._waitCount))&&'
               b'(this._wqaDialoguePaint.end=this._wqaDialoguePaint.text.length),',
        96226: MAP_LEAVING + b'this._wqaDialoguePaint=null;_0x380ef0._wqaPaint=null;'
               b'_0x380ef0._wqaMessage=' + DIALOGUE_HOST + b'&&'
               b'SceneManager._scene._messageWindow===this;',
    })


def battle_notification(original):
    # Troop dialogue has a native interpreter owner. Direct outcome pages
    # paint during battleEnd, while the legacy log is still counting its wait.
    ready = (b'this._wqaBattleStarted && (BattleManager._phase === "battleEnd" ? '
             b'BattleManager._wqaBattleSpritesBusy === false && !this._wqaBattleInterpreter?._list && '
             b'!globalThis.$gameTroop?._interpreter?._list && !globalThis.$gameTemp?._animationQueue?.length && '
             b'!this._spriteset?._animationSprites?.length : BattleManager._wqaDialogueBusy === false && '
             b'this._wqaBattleInterpreter?._waitMode === "message" && this._wqaBattleInterpreter._list)')
    # Option.update already checked native activation and focus after the
    # sprite advanced. Observe that exact option before native OK dispatch.
    command_ready = (b'(!this._wqaBattleCommandSeen||this._wqaBattleCommandEnabled!=='
                     b'(this._prerequisitesMet===true&&!this._isLocked))&&this._animationPositionTarget===1&&'
                     b'(this._isLocked?this._levelLockedText:this._nameSprite)?._dirty===false&&'
                     b'SceneManager._scene?._wqaBattleStarted&&'
                     b'BattleManager._phase==="input"&&BattleManager._wqaDialogueBusy===false&&'
                     b'SceneManager._scene._fadeDuration===0&&SceneManager._scene._fadeOpacity===0&&'
                     b'!SceneManager._nextScene&&!SceneManager._exiting&&!SceneManager._wqaNativeAutosaves&&'
                     b'!Graphics._wqaResize&&!SceneManager._scene._wqaSettingsActive&&'
                     b'Graphics.app?.stage===SceneManager._scene')
    command_leaving = (b'(this._wqaBattleCommandSeen&&'
                       b'globalThis.WendyQuestAccessBattleFocusLeaving?.(SceneManager._scene,this),')
    # The native scene has advanced all enemy sprites before this marker.
    # Only a changed target set or a pending paint can schedule observation.
    target_update = b'''
    {
        const wqaPhase = BattleManager._phase;
        const wqaDriver = wqaPhase === 'ActionCommand' ? BattleManager._currentActionCommand : null;
        const wqaTargets = BattleManager._targets;
        if (this._wqaBattleStarted && BattleManager._wqaDialogueBusy === false &&
            this._fadeDuration === 0 && this._fadeOpacity === 0 && !this._wqaSettingsActive &&
            !SceneManager._nextScene && !SceneManager._exiting && !SceneManager._wqaNativeAutosaves &&
            !Graphics._wqaResize && Graphics.app?.stage === this &&
            wqaTargets?.length && (wqaPhase === 'input' ? BattleManager._inputting && !this._wqaBattleFocusActive &&
                !this._itemWindow?.active :
                wqaDriver?._cancelable && wqaDriver._coroutineContainer)) {
            if (this._wqaBattleTargetKey !== wqaTargets || this._wqaBattleTargetMode !== wqaPhase ||
                this._wqaBattleTargetDriver !== wqaDriver)
                globalThis.WendyQuestAccessBattleTargetReady?.(this);
        } else if (this._wqaBattleTargetActive) {
            globalThis.WendyQuestAccessBattleTargetLeaving?.(this);
        }
    }
'''
    bag_update = b'''
    {
        const wqaBag = this._itemWindow;
        if (this._wqaBattleStarted && wqaBag?.active && wqaBag._openAmount === 1 &&
            BattleManager._phase === 'input' && BattleManager._wqaDialogueBusy === false &&
            this._fadeDuration === 0 && this._fadeOpacity === 0 && !this._wqaSettingsActive &&
            !SceneManager._nextScene && !SceneManager._exiting && !SceneManager._wqaNativeAutosaves &&
            !Graphics._wqaResize && Graphics.app?.stage === this) {
            const wqaRow = wqaBag._wqaBattleBagRows?.get(wqaBag._index);
            if (wqaRow && wqaRow !== wqaBag._wqaBattleBagPresented)
                globalThis.WendyQuestAccessMenuReady?.(this,3);
        } else if (this._wqaBattleBagActive) {
            globalThis.WendyQuestAccessMenuLeaving?.(this);
        }
    }
'''
    timing_update = b'''
    {
        const wqaAction = BattleManager._currentActionCommand;
        if (this._wqaBattleStarted && BattleManager._phase === 'ActionCommand' &&
            wqaAction?._wqaTimingWaiting && wqaAction._cancelable && wqaAction._coroutineContainer &&
            BattleManager._wqaDialogueBusy === false && this._fadeDuration === 0 && this._fadeOpacity === 0 &&
            !this._wqaSettingsActive && !SceneManager._nextScene && !SceneManager._exiting &&
            !SceneManager._wqaNativeAutosaves && !Graphics._wqaResize && Graphics.app?.stage === this) {
            if (!wqaAction._wqaTimingPromptSeen)
                globalThis.WendyQuestAccessBattleTimingReady?.(this,wqaAction);
        } else if (this._wqaBattleTimingActive) {
            globalThis.WendyQuestAccessBattleTimingLeaving?.(this);
        }
    }
'''
    radial_update = b'''
    {
        const wqaRadial = BattleManager._currentActionCommand;
        if (BattleManager._phase === 'ActionCommand' && wqaRadial?._wqaRadialPaint &&
            this._wqaBattleStarted && BattleManager._wqaBattleSpritesBusy === false &&
            this._fadeDuration === 0 && this._fadeOpacity === 0 && !this._wqaSettingsActive &&
            !SceneManager._nextScene && !SceneManager._exiting && !SceneManager._wqaNativeAutosaves &&
            !Graphics._wqaResize && Graphics.app?.stage === this)
            globalThis.WendyQuestAccessBattleRadialReady?.(this,wqaRadial);
    }
'''
    log_update = b'''
    {
        const wqaLog = this._actionLogWindow;
        const wqaHud = this._statusWindow;
        if (wqaHud && this._wqaBattleStarted &&
            (this._wqaMomentumHud !== wqaHud || this._wqaMomentumPips !== wqaHud.momentumPips ||
                this._wqaMomentumValue !== wqaHud._momentumCurrent))
            globalThis.WendyQuestAccessMomentumChanged?.(this,wqaHud);
        if (wqaLog && this._wqaBattleStarted && BattleManager._wqaBattleSpritesBusy === false &&
            BattleManager._phase !== 'ActionCommand' && !globalThis.$gameTemp?._animationQueue?.length &&
            !this._spriteset?._animationSprites?.length && !this._itemWindow?.active &&
            this._fadeDuration === 0 && this._fadeOpacity === 0 && !this._wqaSettingsActive &&
            !SceneManager._nextScene && !SceneManager._exiting && !SceneManager._wqaNativeAutosaves &&
            !Graphics._wqaResize && Graphics.app?.stage === this) {
            if (wqaLog._wqaBattleLogRows?.length || this._wqaRadialReport || this._wqaDamageRows?.length ||
                this._wqaDefeatDue || this._wqaResistedRows?.length ||
                (!this._wqaBattleWon && this._wqaMomentumPending && Graphics.frameCount >= this._wqaMomentumNextFrame) ||
                (this._wqaBattleConditions?.length && Graphics.frameCount >= this._wqaNextConditionFrame))
                globalThis.WendyQuestAccessBattleLogReady?.(this,wqaLog);
        } else if (this._wqaBattleLogActive || wqaLog?._wqaBattleLogRows?.length || this._wqaDamageRows?.length) {
            globalThis.WendyQuestAccessBattleLogBlocked?.(this);
        }
    }
'''
    log_paint = b'''
const wqaLogScene=SceneManager._scene;
const wqaLogPaint=!_0x560f74._wqaLogSeen&&!_0x560f74._wqaLogQueued&&_0x58412f>0&&
    wqaLogScene?._wqaBattleStarted&&wqaLogScene._actionLogWindow===this&&
    BattleManager._wqaBattleSpritesBusy===false&&BattleManager._phase!=="ActionCommand"&&
    !globalThis.$gameTemp?._animationQueue?.length&&!wqaLogScene._spriteset?._animationSprites?.length&&
    !wqaLogScene._itemWindow?.active&&!wqaLogScene._wqaSettingsActive&&
    wqaLogScene._fadeDuration===0&&wqaLogScene._fadeOpacity===0&&
    !Graphics._wqaResize&&!SceneManager._nextScene&&!SceneManager._exiting&&
    !SceneManager._wqaNativeAutosaves&&Graphics.app?.stage===wqaLogScene&&
    this.visible&&this.openness===255&&this.contentsOpacity>0&&
    _0x5c4a11.y+_0x5c4a11.height>0&&_0x5c4a11.y<this.contents.height&&
    _0x5c4a11.x+_0x5c4a11.width>0&&_0x5c4a11.x<this.contents.width&&
    (this._wqaBattleLogRows?.length||0)<8?
    (this._wqaBattleLogPaint={row:_0x560f74,text:""}):null;
'''
    # The native damage setup creates one text sprite for an actual result.
    # Its last glyph is painted and ready before adding it to the render batch.
    damage_update = b'''
if (this._wqaDamageCaption && !this._wqaDamageQueued && this._duration > 0) {
    const wqaScene=SceneManager._scene;
    if (wqaScene?._wqaBattleStarted && wqaScene._spriteset?._battleField === this.parent &&
        BattleManager._wqaBattleSpritesBusy === false && BattleManager._phase !== "ActionCommand" &&
        !globalThis.$gameTemp?._animationQueue?.length && !wqaScene._spriteset._animationSprites?.length &&
        !wqaScene._itemWindow?.active && !wqaScene._wqaSettingsActive &&
        wqaScene._fadeDuration === 0 && wqaScene._fadeOpacity === 0 &&
        !Graphics._wqaResize && !SceneManager._nextScene && !SceneManager._exiting &&
        !SceneManager._wqaNativeAutosaves && Graphics.app?.stage === wqaScene &&
        (wqaScene._wqaDamageRows?.length || 0) < 8) {
        const wqaText=this._wqaDamageCaption.text;
        const wqaGlyph=wqaText.children[wqaText._currentString.length-1];
        if (!wqaText._dirty && wqaGlyph?.alpha > 0 && wqaGlyph.scale.x && wqaGlyph.scale.y) {
            this._wqaDamageQueued=true;
            (wqaScene._wqaDamageRows||=[]).push(this);
        }
    }
}
'''
    # Keep the exact availability and quantity expressions in the native
    # draw calls. Capture them only for a live battle inventory row.
    bag_row = b'''
const wqaBagScene=SceneManager._scene;
const wqaBagRow=wqaBagScene?._wqaBattleStarted&&wqaBagScene._itemWindow===this&&
    BattleManager._phase==="input"&&wqaBagScene._fadeDuration===0&&wqaBagScene._fadeOpacity===0&&
    !wqaBagScene._wqaSettingsActive&&!Graphics._wqaResize&&!SceneManager._nextScene&&
    !SceneManager._exiting&&!SceneManager._wqaNativeAutosaves&&Graphics.app?.stage===wqaBagScene&&
    _0x276644>=0&&_0x276644<128?{
        index:_0x276644, item:_0x19bc8b||null, description:_0x19bc8b?.description,
        contents:this.contents, list:this._data, enabled:false, quantity:undefined
    }:null;
'''
    attack_source = (b'wqaAction===this._action&&globalThis.WendyQuestAccessAttackSource?.('
                     b'_0x5a64fd,wqaPerformer,_0x15034e,wqaAction),')
    return insert(original, BATTLE_SHA, {
        # Preserve the exact overlay returned after the native coroutine attaches it.
        57087: b'const wqaBeefOverlay=',
        57246: b'globalThis.WendyQuestAccessBeefOverlayReady?.(_0x3e461b,wqaBeefOverlay);',
        # The same effect also plays on actual counters. Mark only the native
        # skill animation dispatch, then pass its own newly attached particle.
        27379: b',true',
        55336: b',wqaPreparation',
        55364: b'const wqaEffect=',
        55477: b'if(wqaPreparation)globalThis.WendyQuestAccessClapbackReady?.(_0x36a3b7,wqaEffect);',
        # Native Crispy cleanup schedules the visible particles and sound.
        42051: b'if(BattleManager._phase==="battleEnd"&&this._battler?._actorId===1)'
               b'globalThis.WendyQuestAccessVictoryCondition?.(this);',
        # The native floating status effect creates and attaches this exact text before starting its animation.
        132413: b'if(_0x1651da==="Resisted!")globalThis.WendyQuestAccessResisted?.(_0x356095,_0x483734);',
        155370: command_leaving,  # Accepted activation, before native effects
        155394: b')',
        156577: command_leaving,  # Native loss of this exact sprite's focus
        156604: b')',
        162176: b'((' + command_ready +
                b')&&globalThis.WendyQuestAccessBattleFocusReady?.(SceneManager._scene,this),',
        162205: b')',
        # Observe the accepted effect before an instant collapse can finish.
        183354: b'const wqaWasAppeared=this._appeared;',
        183378: b',wqaWasAppeared&&!this._appeared&&this._effectDuration>0&&'
                b'(this._effectType==="collapse"||this._effectType==="bossCollapse"||'
                b'this._effectType==="instantCollapse")&&globalThis.WendyQuestAccessEnemyCollapse?.(this)',
        192463: BATTLE_TARGET_LEAVING + b';' + BATTLE_BAG_LEAVING + b';' + BATTLE_TIMING_LEAVING + b';' +
                BATTLE_CUE_LEAVING + b';',
        193431: b'(this._wqaDialogueBusy=(this._wqaBattleSpritesBusy=',
        193465: b')',
        193508: b')',
        196596: BATTLE_TARGET_LEAVING + b';' + BATTLE_BAG_LEAVING + b';' + BATTLE_TIMING_LEAVING + b';' +
                BATTLE_CUE_LEAVING + b';' + BATTLE_LOG_LEAVING + b';',
        # Keep the renderer's selected performer with the actual result,
        # including the delayed branch and companions whose action uses Wendy.
        198700: b'const wqaAction=this._action;let wqaPerformer=null;',
        199255: b'wqaPerformer=_0x258fbd;',
        199511: b'globalThis.WendyQuestAccessAttackAnimation?.(wqaAction,wqaPerformer,_0x15034e);',
        # Only the attack approaches pass an action to the default motion
        # helper. Its changed-destination branch confirms movement began.
        8083: b',wqaAttack',
        8552: b'wqaAttack&&globalThis.WendyQuestAccessAttackAnimation?.(wqaAttack,this,wqaAttack.subject()),',
        137212: b',undefined,undefined,BattleManager._action',
        180906: b',_0x199732',
        267498: b'globalThis.WendyQuestAccessLethalDamage?.(_0x5683b7);',
        199967: attack_source,
        200118: attack_source,
        241897: b'this._wqaBattleStarted=true;',
        241953: b'BattleManager._wqaDialogueBusy=BattleManager._wqaBattleSpritesBusy=undefined;',
        242214: target_update + bag_update + timing_update + radial_update + log_update + dialogue_update(ready, victory=True),
        # Optional speaker metadata stays on its native row through queuing and paint.
        239515: b',wqaSource',  # Scene_Battle.logAction
        239613: b',wqaSource',
        244188: b',wqaSource',  # Window_BattleActionLog.pushMessage
        244271: b'_wqaSource:wqaSource,',
        247196: log_paint,
        247397: b'if(wqaLogPaint){this._wqaBattleLogPaint=null;if(wqaLogPaint.text){'
                b'wqaLogPaint.row._wqaLogQueued=true;(this._wqaBattleLogRows||=[]).push(wqaLogPaint);}}',
        253388: bag_row,
        253468: b'(wqaBagRow?(wqaBagRow.enabled=',
        253501: b'):' + original[253468:253501] + b')',
        253676: b',wqaBagRow',
        254065: b'if(wqaBagRow){(this._wqaBattleBagRows||=new Map()).set(wqaBagRow.index,wqaBagRow);}',
        255016: b',wqaBagRow',
        255216: b'(wqaBagRow?(wqaBagRow.quantity=',
        255249: b'):' + original[255216:255249] + b')',
        257237: BATTLE_BAG_LEAVING + b';',  # Native force-hide
        257461: BATTLE_BAG_LEAVING + b';',  # Native cancel or hide
        261932: b',wqaSource',  # Window_BattleLog.addText
        261995: b',wqaSource',
        287369: b',wqaSource',  # BattleHelper.logAction
        287578: b',wqaSource',
        # This installed plugin overrides the stock result clear method.
        234266: b'if(this._wqaAttackSource)this._wqaAttackSource=null;if(this._wqaLethalDamage)this._wqaLethalDamage=null;',
        274246: b'if(_0x11e1e4&&SceneManager._scene?._wqaBattleStarted)'
                b'this._wqaDamageCaption={text:_0x11e1e4,target:_0x51b330,source:_0x550832._wqaAttackSource,'
                b'lethal:_0x550832._wqaLethalDamage||globalThis.WendyQuestAccessLethalDamage?.(_0x51b330)};',
        276706: damage_update,
    })


def action_notification(original):
    timing_leaving = (b'(this._wqaTimingWaiting&&(this._wqaTimingWaiting=false,' + BATTLE_TIMING_LEAVING + b'))')
    # Both samples follow native geometry and accepted input. The native
    # generator remains the only owner of elapsed time, pauses and outcomes.
    cue_sample = b',this._wqaBattleCueActive&&globalThis.WendyQuestAccessBattleCueSample?.(SceneManager._scene,this,'
    cue_end_sweep = (b'this._wqaBattleCueActive&&'
                     b'globalThis.WendyQuestAccessBattleCueEndSweep?.(SceneManager._scene,this);')
    # A radial sweep dispatches one qualitative Sprite_Text through the shared
    # native feedback method. Mark its producer only at these two call sites.
    feedback_begin = (b'(this._wqaRadialWords=null,this._wqaCollectRadialWords='
                      b'SceneManager._scene?._wqaBattleStarted&&this===BattleManager._currentActionCommand,')
    feedback_end = b',this._wqaCollectRadialWords=false)'
    return insert(original, ACTION_SHA, {
        25684: BATTLE_TARGET_LEAVING + b',' + timing_leaving + b',' + BATTLE_CUE_LEAVING + b',',
        26228: b'this._wqaRadialPaint=this._wqaRadialWords=this._wqaRadialPowerWords=null;',
        30027: b',this._wqaCollectRadialWords&&(this._wqaRadialWords=_0xc36689)',
        48198: BATTLE_TARGET_LEAVING + b';' + timing_leaving + b';' + BATTLE_CUE_LEAVING + b';',
        67807: b'if(!this._wqaTimingWaiting&&this===BattleManager._currentActionCommand&&'
               b'SceneManager._scene?._wqaBattleStarted)this._wqaTimingWaiting=true;',  # Ready input loop
        67814: BATTLE_TARGET_LEAVING + b';' + timing_leaving + b';'
               b'if(Graphics._wqaBattleCueEnabled&&SceneManager._scene?._wqaBattleStarted)'
               b'globalThis.WendyQuestAccessBattleCueBegin?.(SceneManager._scene,this);',
        71224: cue_sample + b'0,_0x279acd,this._params.powerCritZoneAmountStart,'
                b'this._params.powerCritZoneAmountEnd,this._params.powerFailAmount,'
                b'_0x21be67||_0x17f391||_0x2f41e3>0)',
        71232: cue_end_sweep,
        72577: feedback_begin,
        72630: feedback_end,
        73686: b',this._wqaRadialWords&&(this._wqaRadialPaint={words:this._wqaRadialWords,attempts:0},'
               b'this._wqaRadialWords=null)',
        75351: b'this._wqaRadialPaint=null;',  # Power feedback has ended before accuracy input.
        77631: cue_sample + b'1,_0x1327af,_0x3d8aee,_0x357499,this._params.hitFailAmount,'
                b'_0x197d36||_0x2191e9||_0x592e0d>0)',
        77639: BATTLE_CUE_LEAVING + b';',
        79586: feedback_begin,
        79639: feedback_end,
        80846: b',SceneManager._scene?._wqaBattleStarted&&this===BattleManager._currentActionCommand&&'
               b'(this._wqaRadialPaint={words:this._wqaRadialWords,power:_0x3f7d26,powerBadge:_0x2b5f46,'
               b'accuracy:_0x168297,accuracyBadge:_0x11601c,attempts:0},this._wqaRadialWords=null)',
    })


def core_notification(original):
    markers = (Path(__file__).resolve().parents[1] / 'src/runtime/resize-markers.js').read_bytes()
    return insert(original, CORE_SHA, {
        19696: b'\n    this._wqaViewportWidth = window.innerWidth;\n'
               b'    this._wqaViewportHeight = window.innerHeight;\n'
               b'    if (this._wqaResize) this._wqaTryResumeResize();',
        24280: b'\n    ' + MAP_LEAVING,
        24315: b'\n' + markers + b'\n',
    })


def window_notification(original):
    # Use the ticket belonging to each native async callback, including
    # overlapping requests, and the size issued by the native scale path.
    return insert(original, WINDOW_SHA, {
        # The modal owns a settled scene only. Never suppress native start or
        # a scene change. The stock update is replaced by this custom method.
        4001: b'if(this._scene?._wqaSettingsActive&&this._scene._started&&!this._nextScene&&!this._exiting)return;',
        30441: b'Graphics._wqaFrontEndObserved&&globalThis.WendyQuestAccessResizeStarting?.(),',
        33274: b'{const wqaResize=Graphics._wqaBeginResize();',
        33367: b',wqaResize',
        33369: b'}',
        33463: b',wqaResize',
        33736: b'(',
        33772: b',Graphics._wqaFinishResize(wqaResize,!_0x1812cd.isFullscreen,'
               b'screenWidth*_0x1a0275,screenHeight*_0x1a0275))',
        34676: b'const wqaResize=Graphics._wqaBeginResize();',
        34787: b'(',
        34805: b',Graphics._wqaFinishResize(wqaResize,_0x497b42.isFullscreen,'
               b'window.screen.width,window.screen.height))',
        65299: narration_leaving() + MAP_LEAVING + b'let wqaAutosave=true,wqaManualSave=this._wqaMenuSave;'
               b'if(wqaManualSave&&!wqaManualSave.started)wqaManualSave.started=true;else wqaManualSave=null;'
               b'SceneManager._wqaNativeAutosaves=(SceneManager._wqaNativeAutosaves||0)+1;',
        # A native success callback can itself throw. Keep the completed file
        # write distinct from a callback error, using the existing operation flag.
        65656: b'(wqaAutosave&&wqaManualSave&&(wqaManualSave.status=1),',
        65683: b')',
        65684: AUTOSAVE_DONE,
        65767: b'(wqaAutosave&&wqaManualSave?.status===0&&(wqaManualSave.status=-1),',
        65791: b')',
        65792: AUTOSAVE_DONE,
        # The original success coroutine presents the popup after the save.
        66622: b'{if(this._wqaFieldReady&&!SceneManager._wqaNativeAutosaves&&'
               b'!_0x495fa1._wqaAutosaveRead)'
               b'globalThis.WendyQuestAccessAutosaveNotice?.(this,_0x495fa1);',
        66663: b'}',
        66812: b'if(this._wqaAutosaveNotice)'
               b'globalThis.WendyQuestAccessAutosaveNoticeEnd?.(this,_0x495fa1);',

    })


def input_notification(original):
    marker = (Path(__file__).resolve().parents[1] / 'src/settings/native-pad.js').read_bytes()
    return insert(original, INPUT_SHA, {
        7428: b'\n' + marker.replace(b'WQA_PAD', b'_0x2ef8a9').replace(b'WQA_STATE', b'_0x27bf26') + b'\n',
    })


def tile_notification(original):
    return insert(original, TILE_SHA, {
        31935: b',(SceneManager._scene?._wqaRouteActive&&'
               b'globalThis.WendyQuestAccessFieldChanged?.(SceneManager._scene))',
    })


def canvas_notification(original):
    # CanvasScaler has its own resize listener and can rebuild the scene.
    return insert(original, CANVAS_SHA, {
        7221: AUTO_DISCARD + b',(' + FIELD_WATCHED + b'||SceneManager._scene?._wqaSettingsActive)&&'
              b'globalThis.WendyQuestAccessSceneLeaving?.(SceneManager._scene),',
    })


def register(original):
    if hashlib.sha256(original).hexdigest() != REGISTRY_SHA:
        raise ValueError('Plugin list does not match the supported Steam build')
    text = original.decode('utf8')
    match = re.match(r'^\ufeff?(?:(?://[^\r\n]*\r?\n)|\s)*(?:var|let|const)\s+\$plugins\s*=\s*', text)
    if not match:
        raise ValueError('Plugin registry declaration not found')
    entries, end = json.JSONDecoder().raw_decode(text, match.end())
    if not isinstance(entries, list) or any(not isinstance(entry, dict) for entry in entries) or \
            not re.fullmatch(r'\s*;?\s*', text[end:]):
        raise ValueError('Unexpected plugin list structure')
    if any(entry.get('name') == PLUGIN['name'] for entry in entries):
        raise ValueError('Accessibility plugin is already present')
    end -= 1
    insertion = (',' if entries else '') + '\n' + json.dumps(PLUGIN, separators=(',', ':')) + '\n'
    return (text[:end] + insertion + text[end:]).encode('utf8')


# Registry activation comes after every producer and runtime file.
TRANSFORMS = {
    TITLE_REL: title_notification, MENU_REL: menu_notifications,
    MANAGERS_REL: managers_notification, SCENES_REL: scenes_notification,
    CORE_REL: core_notification, WINDOW_REL: window_notification,
    INPUT_REL: input_notification, TILE_REL: tile_notification,
    OBJECTS_REL: objects_notification, MAP_REL: map_notification,
    CANVAS_REL: canvas_notification, WINDOWS_REL: windows_notification,
    BATTLE_REL: battle_notification, ACTION_REL: action_notification,
    QUEST_REL: quest_notification, REGISTRY_REL: register,
}


def verify_dependencies(read):
    for relative, expected in DEPENDENCIES.items():
        limit = {CAFFEINE_REL: 1_463_068, PIXI_REL: 1_547_074}.get(relative, 1024 * 1024)
        if hashlib.sha256(read(relative, limit)).hexdigest() != expected:
            raise ValueError(f'Game dependency does not match the supported Steam build: {relative}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('game_root', type=Path)
    args = parser.parse_args()

    def read(relative, limit):
        file = args.game_root / relative
        if file.stat().st_size > limit:
            raise ValueError(f'Unsupported game file size: {relative}')
        return file.read_bytes()

    verify_dependencies(read)
    for relative, transform in TRANSFORMS.items():
        candidate = transform(read(relative, 1024 * 1024))
        subprocess.run(['node', '--check'], input=candidate, check=True, timeout=10)
        print(f'Candidate checked: {relative}')


if __name__ == '__main__':
    main()
