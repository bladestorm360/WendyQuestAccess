"""Verify diagram coverage from original native data; never retain that data in Git."""
import json,sys
from pathlib import Path
root=Path(sys.argv[1])/'package.nw/data'
common=json.loads((root/'CommonEvents.json').read_text())
base=[];opens=[];closes=[];items=[];pages=0
for file in root.glob('Map[0-9][0-9][0-9].json'):
    data=json.loads(file.read_text())
    for event in data.get('events',[]):
        if not event:continue
        for page,entry in enumerate(event['pages']):
            pages+=1
            for i,row in enumerate(entry['list']):
                loc=[int(file.stem[3:]),event['id'],page,i]
                if row['code']==117 and row['parameters'][0] in [142,143]:
                    (opens if row['parameters'][0]==142 else closes).append(loc)
                if row['code']==357 and row['parameters'][1]=='SetPictureData' and row['parameters'][3].get('pictureName') in ['system/Savoria Map','system/Caffeine Caverns Map']:
                    base.append(loc)
assert base==[[87,n,0,35] for n in range(121,131)],base
boards=base; base=[]
for id,entry in enumerate(common):
    if not entry:continue
    for i,row in enumerate(entry['list']):
        if row['code']==357 and row['parameters'][1]=='SetPictureData' and row['parameters'][3].get('pictureName') in ['system/Savoria Map','system/Caffeine Caverns Map']:
            base.append([id,i])
assert base==[[101,30],[142,17]],base
for entry in json.loads((root/'Items.json').read_text()):
    if not entry:continue
    for effect in entry.get('effects',[]):
        if effect['code']==44 and effect['dataId'] in [101,137,166,167,168,169,170]:items.append([entry['id'],effect['dataId']])
assert {entry[1] for entry in items}>={137,166,167,168,169,170}
# Mayor's first two pin operations precede the caves/lava-lakes paragraph;
# the next pair precede the companion response. The same producer handles all.
mayor=json.loads((root/'Map059.json').read_text())['events'][18]['pages'][1]['list']
assert [mayor[i]['parameters'][0] for i in [23,30,34,42,46,94]]==[142,144,146,148,150,143]
for n,count in zip(range(166,171),[5,5,4,5,3]):
    calls=[r['parameters'][0] for r in common[n]['list'] if r['code']==117]
    assert calls[0]==142 and calls[-1]==143
    assert all(k in calls for k in [144+2*i for i in range(count)]+[145+2*i for i in range(count)])
print(json.dumps({'maps':239,'pages':pages,'directAtlasOpens':len(opens),'directAtlasCloses':len(closes),'baseProducers':base,'directCavernBoards':len(boards),'itemCommonCallers':items,'ruinsMaps':5,'ruinsPinCounts':[5,5,4,5,3],'mayorPinBatches':2}))
