"""Offline extraction primitives. Only refresh.py may access the network."""
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'research/github'
VERSION = '2026-03-10'
REVISION = 'f1c9c4e4958b27996e2b5f451b761fc6c57d6b2c'


def read(name):
    return json.loads((DATA / name).read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class PermissionPage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.heading = ''; self.heading_parts = None; self.cells = None
        self.cell = None; self.rows = []; self.links = []; self.line = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'h2': self.heading_parts = []
        if tag == 'tr': self.cells = []; self.links = []
        if tag == 'td' and self.cells is not None: self.cell = []
        if tag == 'a' and self.cells is not None and 'href' in attrs: self.links.append(attrs['href'])
        if tag == 'svg' and self.cell is not None: self.cell.append(attrs.get('aria-label', ''))

    def handle_data(self, value):
        if self.heading_parts is not None: self.heading_parts.append(value)
        if self.cell is not None: self.cell.append(value)

    def handle_endtag(self, tag):
        if tag == 'h2' and self.heading_parts is not None:
            self.heading = ''.join(self.heading_parts).strip(); self.heading_parts = None
        if tag == 'td' and self.cell is not None:
            self.cells.append(''.join(self.cell).strip()); self.cell = None
        if tag == 'tr' and self.cells:
            match = re.match(r'GET\s+(/\S+)', self.cells[0])
            if match:
                self.rows.append({'path': match[1], 'section': self.heading, 'cells': self.cells, 'links': self.links.copy(), 'occurrence': len(self.rows)+1})
            self.cells = None


def extract_seed():
    p = PermissionPage(); p.feed((DATA / 'sources/app-permissions.html').read_text())
    md = []; heading = ''
    for n, line in enumerate((DATA / 'sources/app-permissions.md').read_text().splitlines(), 1):
        if line.startswith('## '): heading = line[3:]
        match = re.match(r'\| `GET ([^`]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \|', line)
        if match:
            path, access, tokens, additional = [s.strip() for s in match.groups()]
            md.append({'path':path,'section':heading,'access':access,'tokens':tokens.split(', '),'additionalPermissions':additional == '✓','additionalAnnotation':additional,'line':n})
    assert p.rows, 'HTML table parser yielded no GETs'
    assert [(r['path'],r['section']) for r in p.rows] == [(r['path'],r['section']) for r in md], 'HTML/Markdown seed drift'
    for a,b in zip(md,p.rows):
        a.update({'occurrence':b['occurrence'],'source':'app-permissions','documentation':next(('https://docs.github.com'+x if x.startswith('/') else x for x in b['links'] if '/rest/' in x),None),'rawCells':b['cells']})
    return md


def resolve(spec, obj):
    seen = set()
    while isinstance(obj,dict) and '$ref' in obj:
        ref=obj['$ref']; assert ref.startswith('#/'), ref
        if ref in seen: return {}
        seen.add(ref); obj=spec
        for key in ref[2:].split('/'): obj=obj[key.replace('~1','/').replace('~0','~')]
    return obj


def fields(spec, schema, prefix='$', seen=frozenset()):
    ref=schema.get('$ref')
    if ref in seen: return []
    seen=seen | ({ref} if ref else set()); schema=resolve(spec,schema)
    result=[]
    for branch in ('allOf','oneOf','anyOf'):
        for item in schema.get(branch,[]): result.extend(fields(spec,item,prefix,seen))
    if schema.get('type')=='array' or 'items' in schema:
        result.extend(fields(spec,schema.get('items',{}),prefix+'[]',seen))
    for key,value in schema.get('properties',{}).items():
        val=resolve(spec,value); path=prefix+'.'+key
        result.append({'path':path,'name':key,'type':val.get('type','unknown'),'format':val.get('format'), 'nullable':val.get('nullable',False),'required':key in schema.get('required',[]),'description':val.get('description',''),'enum':val.get('enum')})
        result.extend(fields(spec,value,path,seen))
    return result


def response_fields(spec, op):
    result=[]
    for status,response in op.get('responses',{}).items():
        if status.startswith('2'):
            for mime,media in resolve(spec,response).get('content',{}).items():
                if 'json' in mime:
                    result.extend(dict(f,status=status,mediaType=mime) for f in fields(spec,media.get('schema',{})))
    return result


def domain(path, op):
    if '/scim/' in path or any(x in path for x in ['credential','external-group','team-sync','saml']): return 'identity'
    if any(x in path for x in ['billing','licenses','license-sync','visual-studio']): return 'billing'
    if 'copilot' in path or '/agents' in path: return 'copilot'
    if 'insights/api' in path: return 'api-activity'
    if 'audit-log' in path or '/events' in path: return 'audit'
    if 'network-' in path: return 'network'
    if 'codespaces' in path: return 'codespaces'
    if any(x in path for x in ['code-security','code-scanning','secret-scanning','dependabot','security-advisories','dependency-graph','campaigns','code_security','dismissal-requests']): return 'security'
    if 'secrets' in path or 'variables' in path: return 'actions-secrets'
    if '/actions/' in path or '/oidc/' in path: return 'actions'
    if any(x in path for x in ['rules','protection','environments','interaction-limits','immutable-releases']): return 'policies'
    if any(x in path for x in ['properties','custom_roles','custom-repository-roles','organization-roles','enterprise-roles']): return 'governance'
    if any(x in path for x in ['packages','releases','attestation','artifacts/']): return 'packages'
    if any(x in path for x in ['pages','deployments']): return 'deployments'
    if any(x in path for x in ['issues','pulls','projects','discussions','labels','milestones','stacks']): return 'collaboration'
    if any(x in path for x in ['teams','collaborators','invitations']): return 'teams'
    if any(x in path for x in ['hooks','installation','/app','/keys','gpg','ssh_signing','private-registries']): return 'integrations'
    if 'migrations' in path or '/import' in path: return 'migration'
    if path.startswith('/repos/') or path.endswith('/repos'): return 'repos'
    if '/members' in path or path.startswith(('/user','/scim')): return 'users'
    if path.startswith(('/orgs','/organizations','/enterprises')): return 'orgs'
    return op.get('tags',['platform'])[0]


def safety(path, op, fs):
    hazards=[]
    for f in fs:
        if f['name'] in {'secret','token','access_token','refresh_token','private_key','password','client_secret','encrypted_value'}: hazards.append(f['path'])
        if f['name']=='value' and '/variables' in path: hazards.append(f['path'])
        if f['name']=='payload': hazards.append(f['path'])
        if f['name'] in {'key','raw_key','public_key'} and any(x in path for x in ['/keys','gpg','public-key','ssh_signing','stream-key']): hazards.append(f['path'])
    text=(op.get('summary','')+' '+op.get('description','')).lower()
    if 'generate-report' in path: hazards.append('GET generates a report; administrative side effect')
    if any(x in path for x in ['/logs','/tarball','/zipball','/archive','/contents/','/readme','/git/blobs','/git/trees','/git/commits','/git/tags','/source']): hazards.append('content/log/archive retrieval')
    if 'download' in text and (any(s in op.get('responses',{}) for s in ['302','301','307']) or 'reports' in path): hazards.append('download or signed URL response')
    if '/hooks' in path and not path.endswith('/deliveries'): hazards.append('webhook configuration or raw delivery payload; no safe mode established')
    return sorted(set(hazards))


class Sections(HTMLParser):
    def __init__(self):
        super().__init__(); self.sections={}; self.current='preamble'; self.parts=[]; self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in {'script','style'}: self.skip+=1
        if tag=='h2':
            self.sections[self.current]=' '.join(' '.join(self.parts).split())
            self.current=dict(attrs).get('id',''); self.parts=[]
        if tag in {'p','li','h2','h3','tr','br'}: self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in {'script','style'}: self.skip=max(0,self.skip-1)
    def handle_data(self,text):
        if not self.skip: self.parts.append(text)
    def finish(self):
        self.sections[self.current]=' '.join(' '.join(self.parts).split()); return self.sections


def fine_grained_rows():
    result=[]; heading=''
    for line in (DATA/'sources/047f030efe47b8a5.md').read_text().splitlines():
        if line.startswith('## '): heading=line[3:]
        m=re.match(r'\| `GET ([^`]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \|',line)
        if m:
            path,access,tokens,extra=[x.strip() for x in m.groups()]
            result.append({'path':path,'section':heading,'access':access,'additionalPermissions':extra=='✓','source':'047f030efe47b8a5'})
    return result
