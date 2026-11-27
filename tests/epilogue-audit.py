"""Check authored epilogue presentation facts without copying native scripts."""
import json
from pathlib import Path
import sys

package = Path(sys.argv[1]) / 'package.nw'
data = package / 'data'
common = json.loads((data / 'CommonEvents.json').read_text(encoding='utf8'))
motion = [row for row in common[244]['list'] if row['code'] == 232]
assert len(motion) == 1 and motion[0]['parameters'][0] == 3
assert motion[0]['parameters'][4:6] == [28, 47]
assert motion[0]['parameters'][10] == 200
portraits = []
for map_id in [189, *range(210, 240)]:
    world = json.loads((data / f'Map{map_id:03}.json').read_text(encoding='utf8'))
    rows = next(event for event in world['events'] if event and event['id'] == (5 if map_id == 238 else 1))['pages'][0]['list']
    images = [row['parameters'][3] for row in rows if row['code'] == 357 and
              row['parameters'][:2] == ['MapScene', 'SetPictureData'] and row['parameters'][3].get('id') == '3']
    portrait = next(image for image in images if image['pictureName'].startswith('Credits/'))
    assert (package / 'img' / (portrait['pictureName'] + '.png')).is_file()
    assert not portrait['pictureName'].endswith('.json')
    assert float(portrait['alpha']) == (255 if map_id == 224 else 10)
    assert not any(row['code'] == 357 and row['parameters'][1] in
                   ['AnimatedObjectSetState', 'InitAnimatedObject'] for row in rows)
    portraits.append(portrait['pictureName'])
    if map_id == 189:
        body = next(row['parameters'][3]['text'] for row in rows if row['code'] == 357 and
                    row['parameters'][:2] == ['MapScene', 'SetPictureText'] and row['parameters'][3].get('id') == '5')
        assert 'guest house' in body and '"special" guest' in body and body.count('\\n') == 3
ending = json.loads((data / 'Map107.json').read_text(encoding='utf8'))['events'][3]['pages'][4]['list']
assert ending[167]['parameters'][0]['name'] == 'WQ/SFX_Magic_Reveal'
assert ending[168]['parameters'] == [0, 190, 13, 7, 2, 1]
print(f'Verified {len(portraits)} static epilogue PNG portraits and shared fade/slide; Elder Tater guest-house lines are one text card, with no intervening character actions. Secret Epilogue transfer is white.')
