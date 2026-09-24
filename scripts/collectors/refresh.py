"""Explicit network refresh into a separate directory; never runs during validation.
Initial research used the same public HTML fallback after the Markdown API throttled.
"""
import argparse
import datetime
import gzip
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from research import DATA, VERSION, read, write


def fetch_documents(destination, delay=1.0):
    destination.mkdir(parents=True, exist_ok=True)
    previous = read('document-sources.json')
    urls = {x['url'] for x in previous}
    urls.update('https://docs.github.com/en/graphql/reference/'+x for x in ['enterprise-admin','orgs','discussions','repos','issues','pulls','projects'])
    results=[]
    for n,url in enumerate(sorted(urls)):
        parsed=urllib.parse.urlparse(url)
        path=parsed.path if parsed.path.startswith('/en/') else '/en'+parsed.path
        request=urllib.parse.urlunparse(parsed._replace(path=path,query='apiVersion='+VERSION))
        sid=hashlib.sha256(url.encode()).hexdigest()[:16]
        row={'id':sid,'url':url,'retrievalUrl':request,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        try:
            with urllib.request.urlopen(request,timeout=30) as response:
                data=response.read(); row['finalUrl']=response.url
            filename=sid+'.html.gz'; (destination/filename).write_bytes(gzip.compress(data,mtime=0))
            row.update(status='retrieved',file='sources/'+filename,sha256=hashlib.sha256((destination/filename).read_bytes()).hexdigest(),contentSha256=hashlib.sha256(data).hexdigest())
        except (urllib.error.URLError, TimeoutError) as error:
            row.update(status='inaccessible',error=str(error))
            if getattr(error,'code',None)==429:
                results.append(row); write(destination.parent/'html-sources.json',results)
                raise SystemExit('Documentation throttle: stopped; retry later, never bypass limits.')
        results.append(row); write(destination.parent/'html-sources.json',results)
        if (n+1)%25==0: print(f'{n+1}/{len(urls)} public documents',flush=True)
        time.sleep(delay)
    print(f'Retrieved {sum(r["status"]=="retrieved" for r in results)}/{len(results)}',flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True,help='Separate candidate sources directory; diff and explicitly promote after review.')
    args=parser.parse_args()
    if args.output.resolve()==(DATA/'sources').resolve(): parser.error('Refresh must not overwrite pinned inputs')
    fetch_documents(args.output)
