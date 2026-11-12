"""Return movement producers from the installed build, in memory only."""

import json
from pathlib import Path
import runpy
import sys


ROOT = Path(__file__).resolve().parents[1]
fixture = runpy.run_path(str(ROOT / 'tests/file-producers.py'))
between = fixture['between']
decode = fixture['load_decoder']()
from registration import CORE_REL, MAP_REL, OBJECTS_REL, core_notification, map_notification, objects_notification


def methods(installed):
    stock = objects_notification((installed / OBJECTS_REL).read_bytes()).decode('utf8')
    output = []
    for group, names in {
        'Game_Map': ['mapId', 'width', 'height', 'isLoopHorizontal', 'isLoopVertical', 'isValid', 'xWithDirection',
                     'yWithDirection', 'roundX', 'roundY', 'roundXWithDirection', 'roundYWithDirection', 'checkPassage',
                     'tileset', 'tilesetFlags', 'tileId', 'layeredTiles', 'tileEventsXy', 'allTiles', 'isPassable',
                     'terrainTag', 'regionId', 'checkLayeredTilesFlags', 'isCounter', 'events', 'eventsXyNt',
                     'refreshTileEvents', 'vehicle', 'boat', 'ship', 'airship', 'isAnyEventStarting', 'updateEvents',
                     'tileWidth', 'tileHeight', 'screenTileX', 'screenTileY', 'adjustX', 'adjustY',
                     'scrollUp', 'scrollDown', 'scrollLeft', 'scrollRight', 'deltaX', 'deltaY', 'isLadder',
                     'setupStartingMapEvent', 'event', 'eraseEvent'],
        'Game_CharacterBase': ['pos', 'posNt', 'isNormalPriority', 'tileId', 'isTile', 'reverseDir', 'isThrough',
                               'isMapPassable', 'isCollidedWithCharacters', 'isCollidedWithEvents', 'isCollidedWithVehicles',
                               'moveStraight', 'setMovementSuccess', 'isMovementSucceeded', 'checkEventTriggerTouchFront',
                               'isDebugThrough', 'isJumping', 'setDirection', 'isDirectionFixed', 'resetStopCount',
                               'isStopping', 'isMoving', 'checkStop', 'moveFrequency', 'realMoveSpeed', 'distancePerFrame',
                               'isDashing', 'update', 'updateStop', 'updateMove', 'updateJump', 'jump', 'increaseSteps',
                               'isOnLadder', 'straighten', 'hasWalkAnime', 'hasStepAnime', 'isNearTheScreen',
                               'setStepAnime', 'setMoveSpeed', 'scrolledX', 'scrolledY', 'locate', 'setPosition'],
        'Game_Character': ['updateStop', 'updateRoutineMove', 'processMoveCommand', 'processRouteEnd',
                           'advanceMoveRouteIndex', 'forceMoveRoute', 'memorizeMoveRoute', 'restoreMoveRoute',
                           'isMoveRouteForcing', 'turnTowardPlayer', 'turnTowardCharacter', 'deltaXFrom', 'deltaYFrom'],
        'Game_Player': ['isMapPassable', 'vehicle', 'isInAirship', 'canStartLocalEvents',
                        'checkEventTriggerHere', 'checkEventTriggerThere', 'checkEventTriggerTouch', 'isCollided',
                        'updateScroll', 'centerX', 'centerY', 'moveByInput', 'getInputDirection', 'executeMove',
                        'moveStraight', 'canMove', 'isInVehicle', 'isInBoat', 'isInShip', 'isDashing', 'areFollowersGathering',
                        'reserveTransfer', 'isTransferring'],
        'Game_Vehicle': ['pos', 'isBoat', 'isShip', 'isAirship', 'isMapPassable'],
        'Game_Interpreter': ['command111', 'command115', 'command121', 'command201', 'command203', 'command205',
                             'command214', 'command402', 'executeCommand', 'updateWaitMode', 'currentCommand',
                             'setWaitMode', 'skipBranch', 'isOnCurrentMap', 'character'],
        'Game_Event': ['findProperPageIndex', 'meetsConditions', 'event', 'page', 'list', 'isTriggerIn', 'start', 'isStarting',
                       'checkEventTriggerTouch', 'isCollidedWithCharacters', 'isCollidedWithPlayerCharacters', 'isCollidedWithEvents',
                       'update', 'updateStop', 'updateSelfMovement', 'stopCountThreshold', 'moveTypeCustom',
                       'checkEventTriggerAuto', 'updateParallel', 'forceMoveRoute', 'eventId', 'clearStartingFlag',
                       'erase', 'refresh', 'locate'],
    }.items():
        for name in names:
            output.append(between(stock, f'\n{group}.prototype.{name} = function(', '\n};') + '\n};')
    output.append(between(stock, 'Game_Character.ROUTE_END =', 'Game_Character.prototype.initialize ='))
    core = core_notification((installed / CORE_REL).read_bytes()).decode('utf8')
    output.append(between(core, 'Tilemap.TILE_ID_B =', 'Tilemap.isVisibleTile ='))
    for name in ('Number.prototype.mod', 'Array.prototype.contains', 'Tilemap.prototype._readMapData',
                 'Tilemap.getAutotileKind', 'Tilemap.isTileA3', 'Tilemap.isTileA4',
                 'Tilemap.isWaterfallTile', 'Tilemap.isWallSideTile'):
        output.append(between(core, f'\n{name} = function(', '\n};') + '\n};')
    custom, _ = decode(map_notification((installed / MAP_REL).read_bytes()).decode('utf8'))
    for start, end in (
        ("Game_Map['prototype']['isBoatPassable']", "},Game_Map['prototype']['isShipPassable']"),
        ("Game_Map['prototype']['isShipPassable']", "},Game_Map['prototype']['isAirshipLandOk']"),
        ("Game_Map['prototype']['IsWater']", '},function('),
        ("Game_CharacterBase['prototype']['canPass']", "},Game_Followers['prototype']['isSomeoneCollided']"),
        ("Game_Followers['prototype']['isSomeoneCollided']", "},Game_Follower['prototype']['actor']"),
        ("Game_Player['prototype']['startMapEvent']", "},Game_Player['prototype']['canTriggerEvent']"),
        ("Game_Player['prototype']['canTriggerEvent']", "},Game_Player['prototype']['findEventsAt']"),
        ("Game_Player['prototype']['findEventsAt']", "},Game_Player['prototype']['triggerTouchActionD3']"),
        ("Game_Event['prototype']['SetBlocker']", "},Game_Event['prototype']['GetCenter']"),
        ("TileEditor['FloodFillRegion']", "},Tilemap['prototype']['SetMapData']"),
    ):
        output.append(between(custom, start + '=function(', end) + '};')
    tile, _ = decode((installed / MAP_REL.with_name('Tyruswoo_TileControl.js')).read_text(encoding='utf-8-sig'))
    output.append('var ' + between(tile, '_0x2f5b0f=[', ',_0x5f3a3e=') + ';')
    output.append(between(tile, "Tyruswoo['TileControl']['getSheetNumberOfCode']=function(",
                          "},Tyruswoo['TileControl']['tileSheetExists']") + '};')
    for name, tail in (
        ('linkedTileId', 'getTileChangeData'), ('linkedAutotileType', 'linkedRegionId'), ('setTileId', 'readTileCode'),
        ('readTileCode', 'autotileTypeById'), ('autotileTypeById', 'setExactTileId'),
        ('setExactTileId', 'autotileNeighbor'), ('autotileNeighbor', 'shapeAutotile'),
        ('shapeAutotile', 'calculateAutotileShape'), ('calculateAutotileShape', 'calculateWaterfallShape'),
        ('calculateWaterfallShape', 'calculateAutotileNESWShape'), ('calculateAutotileNESWShape', 'fillTiles'),
    ):
        output.append(between(tile, f"Game_Map['prototype']['{name}']=function(",
                              f"}},Game_Map['prototype']['{tail}']") + '};')
    return output


if __name__ == '__main__':
    print(json.dumps(methods(Path(sys.argv[1]))))
