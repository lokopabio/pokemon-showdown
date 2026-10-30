"""Resumable offline public-log replay. Never connects or plays new battles."""
import argparse, hashlib, json, os, pathlib, subprocess, sys, time

def frames(text):
    events, request = [], None
    for line in text.splitlines():
        if line.startswith('|request|'):
            if request is not None:
                raise ValueError('Unmatched request in log')
            request = json.loads(line[9:])
            if request.get('wait'):
                yield {'events': events, 'request':request}
                events, request = [], None
        elif line.startswith('|botchoice|'):
            if request is None:
                raise ValueError('Choice without request')
            yield {'events':events,'request':request,'playedChoice':line.split('|',3)[3]}
            events, request = [], None
        elif not line.startswith(('|botsearch|','|botcalc|')):
            events.append(line)
    if request is not None:
        raise ValueError('Incomplete final decision')

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--log',required=True);p.add_argument('--output',required=True)
    p.add_argument('--foul',default='../roman-foul-play');p.add_argument('--bank',default='metagame/metagame-bank.json')
    p.add_argument('--repeats',type=int,default=30);p.add_argument('--hours',type=float,default=2);p.add_argument('--search-ms',type=int,default=100)
    a=p.parse_args()
    if not 1 <= a.repeats <= 1000 or not 0 < a.hours <= 48 or not 1 <= a.search_ms <= 10000: p.error('Invalid hours or search budget')
    root=pathlib.Path(__file__).resolve().parent
    raw=pathlib.Path(a.log).read_bytes();bank=pathlib.Path(a.bank).read_bytes()
    messages=list(frames(raw.decode('utf-8-sig')))
    out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True)
    manifest={'schema':1,'logSHA256':hashlib.sha256(raw).hexdigest(),'bankSHA256':hashlib.sha256(bank).hexdigest(),
              'searchMs':a.search_ms,'bridgeSHA256':hashlib.sha256((root/'bridge.py').read_bytes()).hexdigest(),
              'beliefSHA256':hashlib.sha256((root/'belief.py').read_bytes()).hexdigest(),
              'foul':str(pathlib.Path(a.foul).resolve()),'python':sys.executable,
              'scope':'Fresh sampled hypotheses on recorded public trajectories. Not original thoughts, new games, learning, or a strength comparison.'}
    mp=out/'manifest.json'
    if mp.exists() and json.loads(mp.read_text())!=manifest:raise ValueError('Resume inputs changed; use a new output folder')
    mp.write_text(json.dumps(manifest,indent=2))
    deadline=time.monotonic()+a.hours*3600
    repeat=0
    while repeat<a.repeats and time.monotonic()<deadline:
        for mode in ('baseline','candidate'):
            final=out/f'{repeat:05d}-{mode}.jsonl'
            if final.exists():continue
            env={**os.environ,'PYTHONUTF8':'1','ROMAN_FOUL_PLAY':str(pathlib.Path(a.foul).resolve()),
                 'ROMAN_METAGAME_BANK':str(pathlib.Path(a.bank).resolve()),'ROMAN_SEARCH_MS':str(a.search_ms),
                 'ROMAN_DIAGNOSTICS':'1','BENITO_BELIEF':'1' if mode=='candidate' else '0'}
            env.pop('BENITO_PASSWORD',None)
            temp=final.with_suffix('.partial');err=final.with_suffix('.stderr')
            with err.open('w') as errors:
                child=subprocess.Popen([sys.executable,str(root/'bridge.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=errors,text=True,encoding='utf-8',env=env)
                # A watchdog bounds a hung native call and keeps the run resumable.
                import threading
                watchdog=threading.Timer( max(120,len(messages)*35),child.kill);watchdog.start()
                try:
                    with temp.open('w',encoding='utf-8') as stream:
                        for index,message in enumerate(messages):
                            child.stdin.write(json.dumps(message)+'\n');child.stdin.flush()
                            line=child.stdout.readline()
                            if not line:raise RuntimeError('Bridge stopped; inspect '+str(err))
                            result=json.loads(line)
                            stream.write(json.dumps({'decision':index+1,'rqid':message['request'].get('rqid'),'playedChoice':message.get('playedChoice'),'result':result})+'\n');stream.flush()
                    child.stdin.close()
                    if child.wait(timeout=30)!=0:raise RuntimeError('Bridge failed; inspect '+str(err))
                    temp.replace(final)
                finally:
                    watchdog.cancel()
                    if child.poll() is None:child.kill()
                    child.wait()
            print(f'Completed replay {repeat} {mode}',flush=True)
        repeat+=1
    print('Finished. Complete replays are resumable; live policy was not modified.',flush=True)
if __name__=='__main__':main()
