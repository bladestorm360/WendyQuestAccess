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
STATS_REL = Path('package.nw/js/plugins/WendyQuest.js')
MESSAGE_OWNER_REL = Path('package.nw/js/plugins/EliMZ_Book.js')
SALT_REL = Path('package.nw/data/Map019.json')
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
STATS_SHA = 'da3c0950cf9a0559f21fce2df1bbc608a5fee28398dd233c032279178b6a18f9'
DEPENDENCIES = {
    STATS_REL: STATS_SHA,
    MESSAGE_OWNER_REL: '26e0230f7bcf8a425ad4c128c728cb0d74d8589d1a07d9d3026edbc2b09c7ce0',
    Path('package.nw/js/rmmz_sprites.js'): '33440ac9584344c4a9675d0b464f82eb49f5dcde0c23c485edbd385360475ba1',
    SALT_REL: '4d14b04a8980f4a4eb50dfa01d0ab61dd5507c62b65a1cd23b5df1621662e296',
    Path('package.nw/data/CommonEvents.json'): '1884583f50d8e6c37c53c7552df9c6628d59faf0b92ea90d1ed3a65769c0b9d9',
    Path('package.nw/data/Map196.json'): 'bb3dbeb99080470bc3c009ece7b6e5a60aa99d1fad6cfc71fa95b6a8e9a788e8',
    Path('package.nw/data/Map199.json'): 'ba3fc58a0d8c1c0d71dc2de23010a6e35a7c3c6bd37925becb1fee86adb7998e',
    Path('package.nw/data/Map200.json'): '7b9894f8c5548d3534e4cd14e9c007a8a8ea594acf8352182f91277b4531f0fa',
    Path('package.nw/data/Map201.json'): '3d6cde06daacedebc77a44ee826816890128646ea9c68115404405b7ff14ad21',
    Path('package.nw/js/plugins/UIGeneral.js'): '9a282cc96ee2edb4777fc18228d4a5976e2ad7546d50df72a6d0429bc6af9b0e',
    Path('package.nw/img/system/IconSet.png'): '709b556b0c2b217436172d90d7d8af4c722ce421aa19f504261ee72607f5203e',
}
FILES_LEAVING = b'globalThis.WendyQuestAccessFilesLeaving?.(SceneManager._scene),'
SCENE_LEAVING = (b'if(this._scene?._wqaPresentation){this._scene._wqaPresentation=false;'
                 b'globalThis.WendyQuestAccessSceneLeaving?.(this._scene);}')
FIELD_WATCHED = (b'(SceneManager._scene?._wqaMapAnnouncement||SceneManager._scene?._wqaDialogue||'
                 b'SceneManager._scene?._wqaRouteActive||SceneManager._scene?._wqaCaveReview||'
                 b'SceneManager._scene?._wqaSettingsActive)')
ROUTE_DIRTY = (b'if(SceneManager._scene?._wqaRouteActive||SceneManager._scene?._wqaCaveReview)'
               b'globalThis.WendyQuestAccessFieldChanged?.(SceneManager._scene);')
ACTOR_DIRTY = (b'if(SceneManager._scene?._wqaRouteActive&&(this===$gamePlayer||this._eventId!==undefined||'
               b'this._type==="boat"||this._type==="ship")||'
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


def managers_notification(original):
    return insert(original, MANAGERS_SHA, {
        # These entry sites precede Chromium reload or the next scene constructor.
        54263: SCENE_LEAVING + b'\n        ',
        57606: b'\n' + files_ready('this._scene'),
        58080: b'\n    ' + SCENE_LEAVING,
        59505: b'\n    ' + MAP_LEAVING,
        62280: b'        if(SceneManager._scene?._wqaBattleStarted){' + MAP_LEAVING + b'}\n',
    })


def scenes_notification(original):
    return insert(original, SCENES_SHA, {
        2349: b'\n    ' + MAP_LEAVING,
        3177: b'\n' + files_ready('this'),
    })


def objects_notification(original):
    return insert(original, OBJECTS_SHA, {
        178811: b'\n    ' + ROUTE_DIRTY,  # Tileset replacement
        185272: b'\n    if(this._priorityType!==priorityType){' + ACTOR_DIRTY + b'}',
        188368: b'\n    ' + ACTOR_DIRTY,  # Position and copyPosition
        188538: b'\n    if(this._x!==character._x||this._y!==character._y){' + ACTOR_DIRTY + b'}',
        194431: b'\n    if(this._tileId){' + ACTOR_DIRTY + b'}',
        194681: b'\n    if(this._tileId!==tileId){' + ACTOR_DIRTY + b'}',
        195829: ACTOR_DIRTY + b'\n        ',  # Accepted straight/diagonal steps
        196445: ACTOR_DIRTY + b'\n        ',
        196721: b'\n    if(xPlus||yPlus){' + ACTOR_DIRTY + b'}',
        197969: b'\n    if(this._through!==through){' + ACTOR_DIRTY + b'}',
        249865: ROUTE_DIRTY + b'\n        ',  # Active event page replacement
        21807: b'\n    ' + MAP_LEAVING,  # Game_Screen fade-out
        217381: b'\n    ' + MAP_LEAVING,  # Accepted transfer reservation
        255063: b'\n    if(this===$gameMap?._interpreter||this===$gameTroop?._interpreter){' + MAP_LEAVING + b'}',
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
        if (!Graphics._wqaFrontEndObserved || (Graphics._wqaCaveRecoveryPending && $gameMap._mapId !== 198))
            globalThis.WendyQuestAccessFieldReady?.(this);
    } else if (wqaWasFieldReady || this._wqaRouteActive || this._wqaCaveReview) globalThis.WendyQuestAccessFieldControlLost?.(this);
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
        47577: ACTOR_DIRTY,  # Runtime rectangle replacement
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
    return insert(original, BATTLE_SHA, {
        193431: b'(this._wqaDialogueBusy=',
        193508: b')',
        241897: b'this._wqaBattleStarted=true;',
        241953: b'BattleManager._wqaDialogueBusy=undefined;',
        242214: dialogue_update(ready),
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
        if dependency.stat().st_size > 1024 * 1024 or hashlib.sha256(dependency.read_bytes()).hexdigest() != expected:
            raise ValueError(f'Game dependency does not match the supported Steam build: {relative}')
    for relative, transform in ((TITLE_REL, title_notification), (MENU_REL, menu_notifications),
                                (MANAGERS_REL, managers_notification), (SCENES_REL, scenes_notification),
                                (CORE_REL, core_notification), (WINDOW_REL, window_notification),
                                (INPUT_REL, input_notification), (TILE_REL, tile_notification),
                                (OBJECTS_REL, objects_notification), (MAP_REL, map_notification),
                                (CANVAS_REL, canvas_notification), (WINDOWS_REL, windows_notification),
                                (BATTLE_REL, battle_notification),
                                (REGISTRY_REL, register)):
        file = args.game_root / relative
        if file.stat().st_size > 1024 * 1024:
            raise ValueError('Unsupported game script size')
        candidate = transform(file.read_bytes())
        subprocess.run(['node', '--check'], input=candidate, check=True, timeout=10)
        print(f'Candidate checked: {relative}')


if __name__ == '__main__':
    main()
