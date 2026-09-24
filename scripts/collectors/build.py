"""Rebuild derived manifests/specifications from pinned inputs, without network access."""
import collections
import gzip
import re
from research import *
from design import *


def authentication(path, op, occurrences, fg, section, docsource):
    intro=section.split('Parameters for')[0] if section else ''
    permission_text=intro[intro.find('Fine-grained access tokens'): ] if 'Fine-grained access tokens' in intro else ''
    permissions=[{'permission':a,'resource':b.lower(),'access':c} for a,b,c in re.findall(r'["“]([^"”]+)["”]\s+(organization|repository|enterprise|user) permissions?\s*\((read|write)\)',permission_text,re.I)]
    alternative='any of the following permission sets' in permission_text.lower() or 'at least one' in permission_text.lower()
    # Ambiguous additional associations are not a conjunction. Only endpoint prose can resolve them.
    extra=any(o['additionalPermissions'] for o in occurrences+fg)
    if permissions and (not extra or alternative or 'must have the following permission set' in permission_text):
        expression={'anyOf': [{'allOf':[p]} for p in permissions]} if alternative else {'anyOf':[{'allOf':permissions}]}
        expression_status='endpoint-documented'
    elif occurrences and not extra:
        expression={'anyOf':[{'allOf':[{'permission':o['section'],'access':o['access']}]} for o in occurrences]}
        expression_status='permission-reference-documented'
    else: expression=None; expression_status='unresolved'
    tokens={}
    for key,name,short in [('appInstallation','GitHub App installation access tokens','IAT'),('appUser','GitHub App user access tokens','UAT'),('fineGrainedPat','Fine-grained personal access tokens','PAT')]:
        documented=name in permission_text
        associated=any(short in o.get('tokens',[]) for o in occurrences) if short!='PAT' else bool(fg)
        tokens[key]={'support':'documented' if documented or associated else ('unsupported' if 'does not work' in permission_text.lower() else 'unknown'),'source':docsource if documented else ('047f030efe47b8a5' if short=='PAT' else 'app-permissions'),'empirical':'not-tested'}
    classic_sentences=[s.strip() for s in re.split(r'(?<=[.!])\s+',intro or op.get('description','')) if re.search(r'classic|OAuth|scope',s,re.I)]
    tokens['classicPat']={'support':'documented-with-conditions' if classic_sentences else 'unknown','requirements':classic_sentences,'empirical':'not-tested'}
    constraints=[s.strip() for s in re.split(r'(?<=[.!])\s+',intro or op.get('description','')) if re.search(r'owner|admin|role|plan|Enterprise|SSO|SAML|approval|collaborator|read access|write access|installation|fine-grained',s,re.I)]
    return {'documentationStatus':expression_status,'empiricalStatus':'not-tested','tokens':tokens,'permissionExpression':expression,'additionalPermissionsRequireEndpointReview':extra and expression_status!='endpoint-documented','endpointRequirements':intro,'documentSource':docsource,'roleAndPlanEvidence':constraints,'constraints':'Fine-grained PAT owner/repository selection and approval; installation repository selection; user token limited by both user and app grants; classic PAT SSO authorization where enforced; token scopes do not grant account roles. Enterprise access is separately verified.','unresolved':[] if expression_status=='endpoint-documented' and classic_sentences else ['Verify any undocumented token model, classic scope minimum, role, plan and SSO condition against this exact endpoint section before enabling that auth profile; do not broaden grants.']}


def output_fields(spec,op,path):
    fs=response_fields(spec,op)
    # Prefer the shallowest repeated object as the record. A scalar/settings response is one record.
    arrays=sorted({f['path'].rsplit('.',1)[0] for f in fs if '[]' in f['path']},key=lambda x:(x.count('.'),len(x)))
    root=arrays[0] if arrays and (arrays[0]=='$[]' or arrays[0].count('.')==1) else '$'
    outputs=[]
    person=any(x in path for x in ['/members','outside_collaborators','/role-users']) or path.endswith('/users')
    for f in fs:
        suffix=f['path'][len(root)+1:] if f['path'].startswith(root+'.') else None
        if suffix is None or '[]' in suffix: continue
        if '.' in suffix and not any(suffix.startswith(x) for x in ['configuration.','public_ips.','last_sync.','parent.','permissions.','security_and_analysis.','seat_breakdown.']): continue
        if f['type'] not in {'string','integer','number','boolean'}: continue
        if f['name'] in NEVER_FIELDS: continue
        if f['name'] not in BASE_FIELDS and not f['enum'] and f['type']!='boolean': continue
        if person and f['name'] in {'name','slug','node_id'}: continue
        if 'runners' in path and f['name']=='name': continue
        unit='bytes' if f['name'].endswith(('_bytes','_in_bytes')) or (f['name']=='size' and '/releases/' in path) else ('count' if ('count' in f['name'] or f['name'].startswith('total_') and f['type']=='integer') else None)
        if f['name'].endswith('_days') or f['name']=='days': unit='days'
        if f['name'].endswith('_gb'): unit='GB (provider label; binary multiplier unverified)'
        if f['name'] in {'size','disk_usage'} and unit is None: unit='source-unit-unverified'
        transform='pseudonymize with run-scoped HMAC; discard source identity mapping' if (person and f['name']=='id') or f['name'] in {'actor_id','subject_id'} else 'copy'
        outputs.append({'output':suffix.replace('.','_'),'source':f['path'],'sourceType':f['type'],'type':'string' if transform!='copy' else f['type'],'nullable':not f['required'] or f['nullable'],'unit':unit,'enum':f['enum'],'transform':transform,'missing':'null with fieldAvailability=unknown; never synthesize false or zero','sensitivity':'confidential-metadata','description':f['description']})
    unique={x['output']:x for x in outputs}
    if op['operationId']=='repos/get-all-topics':
        unique={'names':{'output':'names','source':'$.names','sourceType':'array','type':'array','nullable':False,'unit':None,'enum':None,'transform':'copy string[] topic names','missing':'unknown','sensitivity':'confidential-metadata','description':'Repository topics'}}
    if op['operationId']=='repos/list-languages':
        root='$';unique={'language':{'output':'language','source':'$.* (key)','sourceType':'string','type':'string','nullable':False,'unit':None,'enum':None,'transform':'iterate language-name keys','missing':'no key does not prove no source code','sensitivity':'confidential-metadata','description':'Language classifier name'},'bytes':{'output':'bytes','source':'$.* (value)','sourceType':'integer','type':'integer','nullable':False,'unit':'bytes','enum':None,'transform':'copy','missing':'unknown, never zero','sensitivity':'confidential-metadata','description':'Bytes of code classified by language, not repository storage or LFS'}}
    return root,list(unique.values())


def build():
    spec=read('sources/ghec.2026-03-10.json'); assert spec['info']['x-github-plan']=='ghec'
    seed=extract_seed(); fg=fine_grained_rows(); docs=read('document-sources.json'); html=read('html-sources.json') if (DATA/'html-sources.json').exists() else []
    docmap={r['url']:r for r in html}; sections={}
    for r in html:
        if r['status']=='retrieved':
            p=Sections();p.feed(gzip.decompress((DATA/r['file']).read_bytes()).decode());sections[r['id']]=p.finish()
    allpaths=sorted(set(spec['paths']) | {r['path'] for r in seed}); endpoints=[]
    for path in allpaths:
        op=spec['paths'].get(path,{}).get('get'); occ=[r for r in seed if r['path']==path]
        if op is None and not occ: continue
        fgrows=[r for r in fg if r['path']==path]
        if op is None:
            endpoints.append({'id':'seed.'+hashlib.sha256(path.encode()).hexdigest()[:16],'method':'GET','path':path,'apiVersion':VERSION,'domain':domain(path,{}),'scope':scope(path),'openapi':None,'sourceOccurrences':occ,'fineGrainedOccurrences':fgrows,'disposition':'Unresolved','rationale':'Seed GET absent from pinned GHEC version. Verify version/product availability with endpoint docs and next OpenAPI revision. Do not execute.','phase':None,'collectorIds':[],'safety':{'status':'unreviewed','hazards':[]},'permissionVerification':'unresolved','sources':['app-permissions']});continue
        fs=response_fields(spec,op); hazards=safety(path,op,fs)
        selected=wanted(path,op); disp,why,phase=disposition(path,op,hazards,selected)
        url=op.get('externalDocs',{}).get('url','');base,_,anchor=url.partition('#');doc=docmap.get(base)
        section=sections.get(doc['id'],{}).get(anchor,'') if doc else ''
        auth=authentication(path,op,occ,fgrows,section,doc['id'] if doc and section else None)
        oid='rest.'+op['operationId'].replace('/','.')
        endpoints.append({'id':oid,'method':'GET','path':path,'apiVersion':VERSION,'domain':domain(path,op),'scope':scope(path),'openapi':{'operationId':op['operationId'],'pointer':'#/paths/'+path.replace('~','~0').replace('/','~1')+'/get','summary':op['summary'],'deprecated':op.get('deprecated',False),'description':op.get('description',''),'parameters':[resolve(spec,x) for x in spec['paths'][path].get('parameters',[])+op.get('parameters',[])],'responseCodes':list(op.get('responses',{})),'responseSchemaPointers':{s:'#/paths/'+path.replace('~','~0').replace('/','~1')+'/get/responses/'+s for s in op.get('responses',{}) if s.startswith('2')},'documentation':url},'sourceOccurrences':occ,'fineGrainedOccurrences':fgrows,'disposition':disp,'rationale':why,'phase':phase,'collectorIds':[oid] if disp=='Planned' else [],'safety':{'status':'blocked' if hazards else ('schema-screened' if selected else 'unreviewed'),'hazards':hazards,'review':'Resolved all success-response schema references, including arrays and union branches. Schema screening is not empirical proof; deny runtime until explicit release review.'},'permissionVerification':auth['documentationStatus'],'authentication':auth,'sources':['ghec-openapi']+(['app-permissions'] if occ else [])+(['047f030efe47b8a5'] if fgrows else [])+([doc['id']] if section else [])})
    planned=[e for e in endpoints if e['disposition']=='Planned']; bypath={e['path']:e for e in planned}; registry=[]
    for e in planned:
        path=e['path'];op=spec['paths'][path]['get'];oid=e['id'];root,outputs=output_fields(spec,op,path)
        inputs=[]; dependencies=[]
        for param in e['openapi']['parameters']:
            if param['in']!='path': continue
            name=param['name']; binding=input_binding(name,path,bypath)
            inputs.append({'name':name,'schema':param.get('schema',{}),'required':param.get('required',False),**binding})
            if binding.get('collector') and binding['collector']!=oid: dependencies.append(binding['collector'])
        # Explicit resource anchors rather than unconditional module dependencies.
        if path.startswith('/repos/') and '/orgs/{org}/repos' in bypath: dependencies.append(bypath['/orgs/{org}/repos']['id'])
        elif path.startswith(('/orgs/','/organizations/')) and path!='/orgs/{org}': dependencies.append('rest.orgs.get')
        dependencies=sorted(set(dependencies)-{oid})
        optional=e['domain'] in OPTIONAL_DOMAINS or '/secrets' in path or '{' in path.split('}',2)[-1] or '/runs' in path or '/artifacts' in path
        cid=oid; module=e['domain'] if e['domain']!='identity' else 'users'
        contract={'target':'2.0.0-proposed','currentReaderCompatible':False,'reason':'Scoped collector executions and typed metadata records require a new registered reader; existing strict 1.0.0 writer/reader remain unchanged.','recordType':cid,'recordRoot':root,'fields':outputs,'envelope':'common-profile.json#/outputEnvelope','relationships':'scopeRef refers to enterprise/organization/repository/resource anchor. Immutable IDs are namespaced by product, resource type and parent; person IDs are run scoped pseudonyms. Detail inputs may remain ephemeral and are not automatically evidence fields.'}
        gaps=list(e['authentication']['unresolved'])
        if any(x['origin']=='caller-supplied' and x['name'] not in {'org','enterprise','owner','repo'} for x in inputs):gaps.append('Caller must supply explicit scoped detail selectors listed in inputs; no complete enumeration claim for those resources.')
        if not outputs:gaps.append('Success shape provides no approved scalar records; collector emits observed record count and outcome only. Field extension needs explicit schema/privacy review.')
        if any(x['unit']=='source-unit-unverified' for x in outputs):gaps.append('Source size unit/meaning not sufficiently verified; preserve source measurement with unverified unit and do not map to v1 bytes or LFS.')
        registry.append({'id':cid,'module':module,'purpose':op['summary'],'priority':'P0' if e['phase']=='C1' else ('P2' if optional else 'P1'),'phase':e['phase'],'implementationStatus':'specified','researchStatus':'documented-with-gaps' if gaps else 'documented-not-empirically-tested','scope':e['scope'],'operations':[oid],'apiVersion':VERSION,'sources':e['sources'],'documentation':e['openapi']['documentation'],'inputs':inputs,'queryParameters':e['openapi']['parameters'],'dependencies':dependencies,'executionOrder':'Topological dependencies, then stable collector ID; per-resource work starts only after its selectors and anchors are known.','selection':'optional' if optional else 'default','executable':False,'runtimeBlockers':['Live implementation intentionally absent','Contract 2.0.0 reader/writer and privacy release review pending','Synthetic least-privilege verification not performed']+gaps,'authentication':e['authentication'],'output':contract,'privacy':{'allowlist':[o['output'] for o in outputs],'prohibited':'common-profile.json#/privacy','sensitivity':'restricted' if optional else 'confidential','redaction':'Standard/minimal both obey exact allowlist. User identifiers pseudonymized; runner names/labels, webhook URLs, arbitrary free text and keys omitted. No flag permits prohibited retrieval.'},'pagination':pagination(e),'cost':{'requests':'sum over scoped input tuples of max(1, ceil(visible_records / negotiated_page_size)); one for a nonpaged detail. Add dependency requests only once.','fanoutKeys':[x['name'] for x in inputs],'estimate':'unknown until scope and cardinality known; show lower bound, unknown upper bound and explicit operator request budget','concurrency':2,'timeoutSeconds':30,'maxAttempts':4,'maxRetrySeconds':300},'outcomes':'common-profile.json#/outcomes','httpBehavior':{'documentedResponseCodes':e['openapi']['responseCodes'],'policy':'common-profile.json#/http'},'coverage':{'denominator':'visible scoped resources only; enterprise total unknown unless separately attested','observed':'deduplicated returned records, including zero only after exhausted successful enumeration','truncation':'record page/request budget, last safe cursor, filters, failed resource count and unknown remaining count','deduplication':'scope + upstream immutable record ID; else reviewed natural key (secret name, branch name, version) + parent; never dedupe by display name across scopes','incremental':'Only when endpoint exposes a documented time/cursor filter; retained cursor is not assumed a durable change feed. Otherwise full reconciliation; deletions cannot be inferred from partial runs.'},'limitations':gaps+['Successful authentication is not proof of complete resource visibility.','Snapshot is non-atomic; resources and grants may change between pages.'],'acceptanceCriteria':[f'Only {e["method"]} {path} at {VERSION} and reviewed dependencies can be requested.',f'Normalize only the {len(outputs)} declared output fields; exact source types and missing/null states are preserved.','Two synthetic pages plus an empty terminal page produce deduplicated scoped records; repeated cursor yields partial, not complete.','401, ordinary 403, hidden 404, 429, 5xx, timeout and abort produce common-profile outcomes without raw payload diagnostics.','No request is sent when capability, privacy, contract, selector or dependency gates fail.','Inaccessible parent resources skip only dependent work; independent scopes retain successful evidence.','Validate a synthetic 2.0.0 record and relationships before enabling a writer; current 1.0.0 reader must reject it.'],'syntheticScenarios':[{'name':'empty-visible-set','given':'200 with documented empty shape and no next page','expect':'complete for observed scope; observed=0, enterprise denominator unknown'},{'name':'partial-visibility','given':'first page succeeds, next page 403','expect':'partial, preserved first-page evidence, expected=null'},{'name':'missing-detail-id','given':'required selector absent','expect':'skipped before transport, no guessed ID'},{'name':'prohibited-field-drift','given':'schema review shows new credential/value field','expect':'operation blocked before customer execution; refresh review required'}],'spec':'docs/specs/collectors/'+cid+'.md','commonProfile':'common-profile.json'})
    report=counts(endpoints,seed)
    write(DATA/'endpoint-inventory.json',{'schemaVersion':'1.0.0','apiVersion':VERSION,'operations':endpoints})
    write(DATA/'collector-registry.json',{'schemaVersion':'1.0.0','apiVersion':VERSION,'collectors':registry})
    write(DATA/'reconciliation.json',report)
    make_specs(registry)
    print(json.dumps(report,indent=2))


def scope(path):
    if '/scim/' in path:return 'identity-provider'
    if path.startswith('/enterprises/'): return 'enterprise'
    if path.startswith('/repos/'): return 'repository'
    if path.startswith(('/orgs/','/organizations/')):return 'organization'
    if path.startswith(('/user','/users')):return 'user'
    return 'platform-or-caller-resource'


def input_binding(name,path,bypath):
    if name in {'org','enterprise'}:return {'origin':'caller-supplied','sourceField':name,'note':'Explicit approved target; enterprise membership not inferred from name.'}
    if name in {'owner','repo','repository_id','organization_id'}:
        provider='/orgs/{org}' if name=='organization_id' else '/orgs/{org}/repos'
        field={'owner':'owner.login','repo':'name','repository_id':'id','organization_id':'id'}[name]
        if provider in bypath:return {'origin':'discovered','collector':bypath[provider]['id'],'sourceField':field,'note':'Routing selector held ephemerally; verify immutable parent identity.'}
    mapping={'team_slug':('/orgs/{org}/teams','slug'),'environment_name':('/repos/{owner}/{repo}/environments','name'),'branch':('/repos/{owner}/{repo}/branches','name'),'workflow_id':('/repos/{owner}/{repo}/actions/workflows','id'),'run_id':('/repos/{owner}/{repo}/actions/runs','id'),'artifact_id':('/repos/{owner}/{repo}/actions/artifacts','id'),'enterprise-team':('/enterprises/{enterprise}/teams','slug'),'package_name':('/orgs/{org}/packages','name')}
    if name=='team_slug' and path.startswith('/enterprises/'):mapping[name]=('/enterprises/{enterprise}/teams','slug')
    if name in mapping and mapping[name][0] in bypath:
        p,f=mapping[name];return {'origin':'discovered','collector':bypath[p]['id'],'sourceField':f,'note':'Scoped parent-list discovery; child pagination independent.'}
    # Detail selectors from the nearest known list, never invent a list operation.
    marker='{'+name+'}';prefix=path.split(marker)[0].rstrip('/')
    if prefix in bypath:
        field='name' if name in {'secret_name','custom_property_name'} else ('number' if name.endswith('_number') else 'id')
        return {'origin':'discovered','collector':bypath[prefix]['id'],'sourceField':field,'note':'Check list response field against pinned schema; do not infer IDs from names.'}
    return {'origin':'caller-supplied','sourceField':name,'note':'No automatic enumeration mapping approved. Explicit selector required; report sampled scope. Verify a safe list/query in the next phase.'}


def pagination(e):
    params=e['openapi']['parameters']; query=[p for p in params if p['in']=='query']
    names=[p['name'] for p in query]
    return {'mode':'link' if 'page' in names else ('cursor' if any(x in names for x in ['before','after','cursor']) else 'unpaged-or-endpoint-defined'),'parameters':query,'pageSize':'min(100, endpoint documented maximum), never override a smaller limit; use endpoint default if maximum undocumented','filters':'Only listed query parameters. Default time-bounded collectors to last 30 days where a documented filter exists; freeze until at scan start; otherwise disclose unbounded history and require optional request budget.','retention':'Endpoint-specific documented limits in operation description/parameters; unknown where undocumented, never assume a full history.','ordering':'Use endpoint-supported sort/direction only; Link next or documented cursor is authoritative; detect repeated cursor/URL.','termination':'Exhaust next link/cursor; missing total is unknown; budget exhaustion yields partial. Pagination never proves token-wide or enterprise-wide completeness.'}


def counts(es,seed):
    oa={e['path'] for e in es if e['openapi']};se={r['path'] for r in seed}
    return {'schemaVersion':'1.0.0','seedRawGetOccurrences':len(seed),'seedUniqueGetOperations':len(se),'openapiUniqueGetOperations':len(oa),'overlap':len(oa&se),'seedOnly':sorted(se-oa),'openapiOnly':sorted(oa-se),'union':len(es),'dispositions':dict(sorted(collections.Counter(e['disposition'] for e in es).items())),'domains':{d:dict(sorted(collections.Counter(e['disposition'] for e in es if e['domain']==d).items())) for d in sorted({e['domain'] for e in es})},'plannedCollectors':sum(e['disposition']=='Planned' for e in es),'permissionAssociationsAtWriteAccess':sum(r['access']=='write' for r in seed),'additionalPermissionOccurrences':sum(r['additionalPermissions'] for r in seed),'completeness':'All GETs in the pinned GHEC 2026-03-10 description and all GET table occurrences in the requested App permissions page. Not universal GitHub API completeness; supplementary GraphQL scoped separately.'}


def make_specs(registry):
    folder=ROOT/'docs/specs/collectors'; folder.mkdir(exist_ok=True)
    for c in registry:
        sections=[f'# {c["id"]}: {c["purpose"]}', '\nGenerated deterministically from the pinned research inputs and reviewed design policy. Status: specified, not implemented. Common requirements in [execution profile](../../../research/github/common-profile.json) are normative for this collector.\n',f'Official endpoint: [{c["purpose"]}]({c["documentation"]}). API version `{VERSION}`.']
        for name,keys in [('Identity and selection',['id','module','scope','priority','phase','researchStatus','selection','executable']),('Operations, inputs and discovery',['operations','inputs','queryParameters','dependencies','executionOrder']),('Authentication and capability gates',['authentication','runtimeBlockers']),('Exact evidence contract and privacy',['output','privacy']),('Pagination, cost and coverage',['pagination','cost','coverage','limitations']),('Outcomes and acceptance',['outcomes','httpBehavior','acceptanceCriteria','syntheticScenarios'])]:
            sections+=['\n## '+name+'\n','```json\n'+json.dumps({k:c[k] for k in keys},indent=2,ensure_ascii=False)+'\n```']
        (ROOT/c['spec']).write_text('\n'.join(sections)+'\n')


if __name__=='__main__':build()
