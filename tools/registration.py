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
DEPENDENCIES = {
    BITMAP_FONT_REL: BITMAP_FONT_SHA,
    STATS_REL: STATS_SHA,
    MESSAGE_OWNER_REL: '26e0230f7bcf8a425ad4c128c728cb0d74d8589d1a07d9d3026edbc2b09c7ce0',
    Path('package.nw/js/rmmz_sprites.js'): '33440ac9584344c4a9675d0b464f82eb49f5dcde0c23c485edbd385360475ba1',
    SALT_REL: '4d14b04a8980f4a4eb50dfa01d0ab61dd5507c62b65a1cd23b5df1621662e296',
    Path('package.nw/data/States.json'): 'db3264ae4f2436acb247655823b4055ffb1c319a5c709e2f760a37be4cdc4b14',
    CAFFEINE_REL: 'e26a883c1d464508d446382ee5be94c5ca7ada1b76ec70e4f9650bdb1f24d48f',
    Path('package.nw/data/CommonEvents.json'): '1884583f50d8e6c37c53c7552df9c6628d59faf0b92ea90d1ed3a65769c0b9d9',
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
}
FILES_LEAVING = b'globalThis.WendyQuestAccessFilesLeaving?.(SceneManager._scene),'
BATTLE_TARGET_LEAVING = (b'SceneManager._scene?._wqaBattleTargetActive&&'
                         b'globalThis.WendyQuestAccessBattleTargetLeaving?.(SceneManager._scene)')
BATTLE_BAG_LEAVING = (b'SceneManager._scene?._wqaBattleBagActive&&'
                      b'globalThis.WendyQuestAccessMenuLeaving?.(SceneManager._scene)')
SCENE_LEAVING = (b'if(this._scene?._wqaPresentation){this._scene._wqaPresentation=false;'
                 b'globalThis.WendyQuestAccessSceneLeaving?.(this._scene);}')
FIELD_WATCHED = (b'(SceneManager._scene?._wqaMapAnnouncement||SceneManager._scene?._wqaDialogue||'
                 b'SceneManager._scene?._wqaRouteActive||SceneManager._scene?._wqaCaveReview||'
                 b'SceneManager._scene?._wqaSettingsActive||SceneManager._scene?._wqaWallAudio||'
                 b'SceneManager._scene?._wqaBeaconActive||SceneManager._scene?._wqaCaveTimingActive||'
                 b'SceneManager._scene?._wqaAutowalkActive||SceneManager._scene?._wqaSoundscapeActive||'
                 b'SceneManager._scene?._wqaQuestTracking||SceneManager._scene?._wqaBookmarkEntrance||'
                 b'SceneManager._scene?._wqaBookmarkLanding)')
ROUTE_DIRTY = (b'if(SceneManager._scene?._wqaRouteActive||SceneManager._scene?._wqaCaveReview||'
               b'SceneManager._scene?._wqaWallAudio||SceneManager._scene?._wqaBeaconActive||'
               b'SceneManager._scene?._wqaCaveTimingActive||SceneManager._scene?._wqaAutowalkActive||'
               b'SceneManager._scene?._wqaSoundscapeSample||SceneManager._scene?._wqaQuestTracking)'
               b'globalThis.WendyQuestAccessFieldChanged?.(SceneManager._scene);')
ACTOR_DIRTY = (b'if(SceneManager._scene?._wqaRouteActive&&(this===$gamePlayer||this._eventId!==undefined||'
               b'this._type==="boat"||this._type==="ship"||this._type==="airship")||'
               b'SceneManager._scene?._wqaCaveReview&&this===$gamePlayer)'
               b'globalThis.WendyQuestAccessFieldChanged?.(SceneManager._scene);')
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
    return original[:TITLE_INSERTION] + TITLE_EVENT + original[TITLE_INSERTION:]


def insert(original, sha, sites):
    if hashlib.sha256(original).hexdigest() != sha:
        raise ValueError('Native notification source does not match the supported Steam build')
    candidate = original
    for offset, event in sorted(sites.items(), reverse=True):
        candidate = candidate[:offset] + event + candidate[offset:]
    return candidate


def files_ready(scene):
    # Native completion sites publish only flags. The precondition bypasses
    # the mod callback when a scene is loading, changing, fading or retired.
    ready = f'''{scene}&&{scene}._wqaFileKind&&{scene}===SceneManager._scene&&
!SceneManager._nextScene&&!SceneManager._exiting&&{scene}._started&&{scene}._active&&
{scene}._fadeDuration===0&&{scene}._fadeOpacity===0&&Graphics.app?.stage==={scene}&&!Graphics._wqaResize&&
(({scene}._wqaFileKind===1&&{scene}._listWindow?._wqaCards===true)||
({scene}._wqaFileKind===2&&{scene}._wqaDetailText===true&&{scene}._wqaDetailArt===true&&!{scene}._destroySave)||
({scene}._wqaFileKind===3&&({scene}._deleteCount===0||{scene}._wqaDeleteStatus))||
({scene}._wqaFileKind===4&&{scene}._optionsWindow?._wqaOptionsPainted===true)||
({scene}._wqaFileKind===5&&{scene}._commandWindow&&( {scene}._commandWindow._wqaRetryRows&
(1<<{scene}._commandWindow._index))))'''.replace('\n', '')
    return f'if({ready})globalThis.WendyQuestAccessFilesReady?.({scene});'.encode('ascii')


def menu_notifications(original):
    # Build 26578620. Offsets refer to completed native draw or accepted
    # native actions. Existing event arguments and call order are preserved.
    return insert(original, MENU_SHA, {
        9404: b'if(this._wqaMenuActive)globalThis.WendyQuestAccessMenuLeaving?.(this);',
        12930: b'globalThis.WendyQuestAccessMenuReady?.(this,1);',
        20002: b'globalThis.WendyQuestAccessMenuReady?.(this,2);',
        25165: b'if(this._wqaMenuActive)globalThis.WendyQuestAccessMenuLeaving?.(this);',
        34744: b'const wqaRedraw=SceneManager._scene?._wqaMenuActive&&'
               b'SceneManager._scene._itemWindow===this&&this._index===_0x14af0d;',
        35932: b'if(wqaRedraw)this._wqaMenuRowPaint=(this._wqaMenuRowPaint||0)+1;',
        39079: b'if(SceneManager._scene?._itemWindow===this&&'
               b'SceneManager._scene._equipStatusWindow===this.statusWindow){'
               b'this.statusWindow._wqaMenuCompareItem=_0x204675;this.statusWindow._wqaMenuCompareActor=_0x1d24e1;}',
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
        163333: b'this._wqaFileKind=3;',
        165098: b'this._wqaDeleteStatus=_0x4a1a5b;' + files_ready('this'),
        165586: FILES_LEAVING,
        188382: FILES_LEAVING,
        188587: FILES_LEAVING,
        189925: b'this._wqaFileKind=1;',
        190907: FILES_LEAVING,
        207711: b'(' + FILES_LEAVING,
        207743: b')',
        208402: b'this._wqaDetailArt=true;' + files_ready('this'),
        215620: b'this._wqaDetailText=true;this._wqaFileKind=2;' + files_ready('this'),
        215817: FILES_LEAVING,
        215860: b'if(SceneManager._nextScene)SceneManager._nextScene._wqaReadFailed=true;',
        219539: b'this._wqaCards=true;if(SceneManager._scene?._listWindow===this){' +
                files_ready('SceneManager._scene') + b'}',
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
        # These entry sites precede Chromium reload or the next scene constructor.
        54263: SCENE_LEAVING + b'\n        ',
        57606: b'\n' + files_ready('this._scene'),
        58080: b'\n    ' + SCENE_LEAVING,
        59505: b'\n    ' + MAP_LEAVING,
        62230: b'\n    if(SceneManager._scene?._wqaBattleFocusActive&&this._phase!=="input")'
               b'globalThis.WendyQuestAccessBattleFocusLeaving?.(SceneManager._scene);'
               b'\n    if(this._phase!=="input")' + BATTLE_BAG_LEAVING + b';'
               b'\n    if(this._phase!=="input"&&this._phase!=="ActionCommand")' + BATTLE_TARGET_LEAVING + b';',
        62280: b'        if(SceneManager._scene?._wqaBattleStarted){' + MAP_LEAVING + b'}\n',
    })


def scenes_notification(original):
    return insert(original, SCENES_SHA, {
        106138: b'    if(this._wqaBattleBagActive)globalThis.WendyQuestAccessMenuLeaving?.(this);\n',
        2349: b'\n    ' + MAP_LEAVING,
        3177: b'\n' + files_ready('this'),
    })


def objects_notification(original):
    return insert(original, OBJECTS_SHA, {
        178811: b'\n    ' + ROUTE_DIRTY,  # Tileset replacement
        180829: b'if(this===$gameMap&&SceneManager._scene?._wqaCaveGuideActive&&SceneManager._scene._wqaFieldReady&&'
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
        194431: b'\n    if(this._tileId){' + ACTOR_DIRTY + beacon_actor() + b'}',
        194681: b'\n    if(this._tileId!==tileId){' + ACTOR_DIRTY + beacon_actor() + b'}',
        195557: beacon_actor(b'd') + b'if(SceneManager._scene?._wqaCaveTimingActive&&this===$gamePlayer)'
                b'globalThis.WendyQuestAccessCaveTimingStop?.(SceneManager._scene);\n        ',  # Before destination assignment
        195829: ACTOR_DIRTY + b'\n        ',  # Accepted straight/diagonal steps
        196445: ACTOR_DIRTY + beacon_actor() + b'\n        ',
        196721: b'\n    if(xPlus||yPlus){' + ACTOR_DIRTY + beacon_actor() + b'}',
        197969: b'\n    if(this._through!==through){' + ACTOR_DIRTY + beacon_actor() + b'}',
        202310: b'if(SceneManager._scene?._wqaCaveTimingActive||SceneManager._scene?._wqaPreviewUntil)'
                b'globalThis.WendyQuestAccessFieldChanged?.(SceneManager._scene);\n    ',  # Forced route ownership
        210400: b'if(this._eventId===18&&$gameMap?._mapId===200&&'
                b'(SceneManager._scene?._wqaCaveTimingActive||SceneManager._scene?._wqaPreviewUntil))'
                b'globalThis.WendyQuestAccessFieldChanged?.(SceneManager._scene);\n        ',  # Distraction wait boundary
        249865: ROUTE_DIRTY + b'\n        ',  # Active event page replacement
        21807: b'\n    ' + MAP_LEAVING,  # Game_Screen fade-out
        217381: b'\n    if(this===$gamePlayer&&Graphics._wqaBookmarkTransferPending)'
                b'globalThis.WendyQuestAccessBookmarkTransferReserved?.(SceneManager._scene,this,mapId,x,y,d);\n    '
                + MAP_LEAVING,  # Accepted transfer reservation
        231501: MAP_LEAVING + b'\n        ',  # Native aircraft boarding
        231586: MAP_LEAVING + b'\n        ',  # Native ship boarding
        231668: MAP_LEAVING + b'\n        ',  # Native boat boarding
        232058: b'if(this===$gamePlayer&&SceneManager._scene?._wqaBookmarkLanding)'
                b'globalThis.WendyQuestAccessBookmarkLandingAccepted?.(SceneManager._scene,this);'
                + MAP_LEAVING + b'\n        ',  # Native landing after isLandOk
        222789: b'if(this===$gamePlayer&&SceneManager._scene?._wqaAutowalkActive)'
                b'direction=globalThis.WendyQuestAccessAutowalkInput?.(SceneManager._scene,this,direction,'
                b'direction>0||$gameTemp.isDestinationValid())??direction;\n        ',
        222850: b'\n            if(this===$gamePlayer&&SceneManager._scene?._wqaFieldReady&&'
                b'(Graphics._wqaWallEnabled||SceneManager._scene._wqaBeaconActive||SceneManager._scene._wqaAutowalkActive))'
                b'globalThis.WendyQuestAccessFieldMove?.(SceneManager._scene,direction,this._movementSuccess);',
        249454: b'if(SceneManager._scene?._wqaFieldReady&&(Graphics._wqaWallEnabled||SceneManager._scene._wqaBeaconActive||'
                b'SceneManager._scene._wqaCaveReview||SceneManager._scene._wqaCaveTimingActive||'
                b'SceneManager._scene._wqaAutowalkActive||SceneManager._scene._wqaSoundscapeActive||'
                b'SceneManager._scene._wqaQuestTracking||SceneManager._scene._wqaQuestNavigation||'
                b'SceneManager._scene._wqaRouteActive))'
                b'globalThis.WendyQuestAccessFieldEvent?.(SceneManager._scene);\n        ',  # Accepted event start
        255063: b'\n    if(this===$gameMap?._interpreter||this===$gameTroop?._interpreter){' + MAP_LEAVING +
                b'if(SceneManager._scene?._wqaBattleFocusActive)'
                b'globalThis.WendyQuestAccessBattleFocusLeaving?.(SceneManager._scene);' +
                BATTLE_TARGET_LEAVING + b';' + BATTLE_BAG_LEAVING + b';}',
        255573: MAP_LEAVING + b'\n                ',  # Face preload
        255696: MAP_LEAVING + b'\n                ',  # Picture preload
        257529: b'\n            if(!waiting&&SceneManager._scene?._wqaBattleInterpreter===this){'
                + MAP_LEAVING + b'SceneManager._scene._wqaBattleInterpreter=null;}',
        258782: b'\n    if(waitMode==="message"&&SceneManager._scene?._wqaBattleStarted)'
                b'SceneManager._scene._wqaBattleInterpreter=this;',
    })


def windows_notification(original):
    paint = (Path(__file__).resolve().parents[1] / 'src/dialogue/paint-markers.js').read_bytes()
    return insert(original, WINDOWS_SHA, {
        6945: b'    if (this._wqaChoicePaint) textState._wqaPaint = this._wqaChoicePaint;\n',
        7547: b'\n        if (text && (textState._wqaMessage || textState._wqaPaint)) this._wqaRecordPaint(textState, text);',
        7872: b'\n' + paint + b'\n',
        11423: b'\n        if (textState._wqaMessage || textState._wqaPaint) '
               b'this._wqaRecordPaint(textState, "\\x01" + iconIndex + "\\x02");',
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


def dialogue_update(context_ready):
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
        if ((wqaPageWaiting || wqaChoiceWaiting || wqaNumberWaiting) && !this._wqaDialoguePending &&
            __WQA_CONTEXT__ && this._started && this._active &&
            this._fadeDuration === 0 && this._fadeOpacity === 0 && !($gameScreen._fadeOutDuration > 0) &&
            this === SceneManager._scene && !SceneManager._nextScene && !SceneManager._exiting &&
            !SceneManager._wqaNativeAutosaves && !Graphics._wqaResize && Graphics.app?.stage === this &&
            (!wqaPageWaiting || (!wqaMessage._faceBitmap &&
                (wqaAuto || !(wqaMessage._nameSprite?._currentString && wqaMessage._nameSprite._animationRunning)) &&
                (!wqaMessage._slicedSprite?.visible || (wqaMessage._slicedSpriteFull && wqaMessage._slicedSpriteFaded)))))
            globalThis.WendyQuestAccessDialogueReady?.(this);
    }
'''.replace(b'__WQA_CONTEXT__', context_ready)


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
                this._fadeDuration === 0 && this._fadeOpacity === 0 && this._prevCanMove === true &&
                this.srcWendy && this.srcStones && $gameMap._nameDisplay && $gameMap.inactiveTime < 30 &&
                !$gamePlayer._transferring && $gameScreen._brightness === 255 && !($gameScreen._fadeOutDuration > 0) &&
                this === SceneManager._scene && !SceneManager._nextScene && !SceneManager._exiting &&
                !SceneManager._wqaNativeAutosaves && !Graphics._wqaResize && Graphics.app?.stage === this;
            if (this._wqaMapAnnouncement && (!wqaReady || this._wqaMapAnnouncement !== wqaRevision))
                globalThis.WendyQuestAccessSceneLeaving?.(this);
            if (wqaReady && wqaUnread && !this._wqaMapAnnouncement)
                globalThis.WendyQuestAccessMapBannerReady?.(this, wqaRevision);
        }
    }
'''
    field_update = b'''
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
        this.srcStones && $gameMap.inactiveTime < 30 && !$gameMap._needsRefresh && !$gameMap._needsTilemapRefresh &&
        !$gamePlayer._transferring && !$gamePlayer._vehicleGettingOn && !$gamePlayer._vehicleGettingOff &&
        $gameScreen._brightness === 255 && !$gameScreen._fadeOutDuration && !this._wqaTerrainWork &&
        this === SceneManager._scene && !SceneManager._nextScene && !SceneManager._exiting &&
        !SceneManager._wqaNativeAutosaves && !Graphics._wqaResize && Graphics.app?.stage === this);
    if (this._wqaFieldReady) {
        if (!Graphics._wqaFrontEndObserved || ((Graphics._wqaCaveProgressPending || Graphics._wqaBookmarkTransferPending) &&
            !$gameMap._interpreter?._list &&
            $gamePlayer._x === $gamePlayer._realX && $gamePlayer._y === $gamePlayer._realY) ||
            (Graphics._wqaCaveRecoveryPending && $gameMap._mapId !== 198) ||
            (!wqaWasFieldReady && (Graphics._wqaWallEnabled || Graphics._wqaCaveTimingEnabled)))
            globalThis.WendyQuestAccessFieldReady?.(this);
        if (this._wqaBeaconDue && Graphics.frameCount >= this._wqaBeaconDue &&
            $gamePlayer._x === $gamePlayer._realX && $gamePlayer._y === $gamePlayer._realY)
            globalThis.WendyQuestAccessBeaconUpdate?.(this);
        if (this._wqaCaveCueDue && Graphics.frameCount >= this._wqaCaveCueDue)
            globalThis.WendyQuestAccessCaveTimingUpdate?.(this);
        if (Graphics._wqaSoundscapeEnabled && (this._wqaSoundscapeSample ||
            !this._wqaSoundscapeDue || Graphics.frameCount >= this._wqaSoundscapeDue))
            globalThis.WendyQuestAccessSoundscapeUpdate?.(this);
    } else if (wqaWasFieldReady || this._wqaRouteActive || this._wqaCaveReview || this._wqaWallAudio ||
        this._wqaBeaconActive || this._wqaCaveTimingActive || this._wqaSoundscapeActive)
        globalThis.WendyQuestAccessFieldControlLost?.(this);
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
        62779: field_update + banner_update + dialogue_update(b'this._wqaMapRestored && this._mapLoaded && this.srcWendy && '
                                               b'this.srcStones && $gameMap.inactiveTime < 30 && !$gamePlayer._transferring'),
        69005: b'if(_0x1bb9dc>=30){' + MAP_LEAVING + b'}',  # Before the first native idle cue
        86279: b'if(SceneManager._scene?._mapNameWindow===this){' + MAP_LEAVING + b'}'
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
    # Use the busy result already queried by the native battle update. A
    # message window can be visible before the battle interpreter is ready.
    ready = (b'this._wqaBattleStarted && BattleManager._wqaDialogueBusy === false && '
             b'this._wqaBattleInterpreter?._waitMode === "message" && this._wqaBattleInterpreter._list')
    # Option.update already checked native activation and focus after the
    # sprite advanced. Observe that exact option before native OK dispatch.
    command_ready = (b'(!this._wqaBattleCommandSeen||this._wqaBattleCommandEnabled!=='
                     b'(this._prerequisitesMet===true&&!this._isLocked))&&this._animationPositionTarget===1&&'
                     b'this._nameSprite?._dirty===false&&SceneManager._scene?._wqaBattleStarted&&'
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
    return insert(original, BATTLE_SHA, {
        155370: command_leaving,  # Accepted activation, before native effects
        155394: b')',
        156577: command_leaving,  # Native loss of this exact sprite's focus
        156604: b')',
        162176: b'((' + command_ready +
                b')&&globalThis.WendyQuestAccessBattleFocusReady?.(SceneManager._scene,this),',
        162205: b')',
        192463: BATTLE_TARGET_LEAVING + b';' + BATTLE_BAG_LEAVING + b';',  # Return to native input
        193431: b'(this._wqaDialogueBusy=',
        193508: b')',
        196596: BATTLE_TARGET_LEAVING + b';' + BATTLE_BAG_LEAVING + b';',  # Native action start
        241897: b'this._wqaBattleStarted=true;',
        241953: b'BattleManager._wqaDialogueBusy=undefined;',
        242214: target_update + bag_update + dialogue_update(ready),
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
    })


def action_notification(original):
    return insert(original, ACTION_SHA, {
        25684: BATTLE_TARGET_LEAVING + b',',  # Accepted cancellation, before coroutine effects
        48198: BATTLE_TARGET_LEAVING + b';',  # Native radial cleanup
        67814: BATTLE_TARGET_LEAVING + b';',  # Native radial windup starts
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
        65299: MAP_LEAVING + b'let wqaAutosave=true;'
               b'SceneManager._wqaNativeAutosaves=(SceneManager._wqaNativeAutosaves||0)+1;',
        65684: AUTOSAVE_DONE,
        65792: AUTOSAVE_DONE,
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('game_root', type=Path)
    args = parser.parse_args()
    for relative, expected in DEPENDENCIES.items():
        dependency = args.game_root / relative
        limit = 1_463_068 if relative == CAFFEINE_REL else 1024 * 1024
        if dependency.stat().st_size > limit or hashlib.sha256(dependency.read_bytes()).hexdigest() != expected:
            raise ValueError(f'Game dependency does not match the supported Steam build: {relative}')
    for relative, transform in ((TITLE_REL, title_notification), (MENU_REL, menu_notifications),
                                (MANAGERS_REL, managers_notification), (SCENES_REL, scenes_notification),
                                (CORE_REL, core_notification), (WINDOW_REL, window_notification),
                                (INPUT_REL, input_notification), (TILE_REL, tile_notification),
                                (OBJECTS_REL, objects_notification), (MAP_REL, map_notification),
                                (CANVAS_REL, canvas_notification), (WINDOWS_REL, windows_notification),
                                (BATTLE_REL, battle_notification), (ACTION_REL, action_notification),
                                (QUEST_REL, quest_notification),
                                (REGISTRY_REL, register)):
        file = args.game_root / relative
        if file.stat().st_size > 1024 * 1024:
            raise ValueError('Unsupported game script size')
        candidate = transform(file.read_bytes())
        subprocess.run(['node', '--check'], input=candidate, check=True, timeout=10)
        print(f'Candidate checked: {relative}')


if __name__ == '__main__':
    main()
