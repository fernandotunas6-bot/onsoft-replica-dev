import json, subprocess, time
from pathlib import Path
OUT=Path(__file__).parent/'evidencias'
env={}
for line in Path('.env').read_text().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        k,v=line.split('=',1);env[k.strip()]=v.strip().strip('\"\'')
def get(url,headers=None):
    start=time.monotonic()
    config='url = '+json.dumps(url)+'\n'
    for k,v in (headers or {}).items():config+='header = '+json.dumps(k+': '+v)+'\n'
    proc=subprocess.run(['/usr/bin/curl','-sS','-L','--max-time','25','--config','-','--write-out','\n%{http_code}\n%{url_effective}'],input=config,text=True,capture_output=True)
    if proc.returncode:return {'error':'curl','exit_code':proc.returncode,'message':proc.stderr[:160]}
    data,status,effective=proc.stdout.rsplit('\n',2)
    result={'status':int(status),'url':effective,'elapsed_ms':round((time.monotonic()-start)*1000)}
    try:result['body']=json.loads(data)
    except Exception:result['bytes']=len(data.encode())
    return result
public={u:get(u) for u in ['https://portal-siga.com/','https://app.portal-siga.com/','https://admin.portal-siga.com/','https://docs.portal-siga.com/','https://payflow.portal-siga.com/api/v1/health','https://app.portal-siga.com/api/saas/me','https://app.portal-siga.com/api/saas/tenants','https://app.portal-siga.com/api/saas/stats']}
(OUT/'public-http.json').write_text(json.dumps(public,indent=2))
account=env.get('CLOUDFLARE_ACCOUNT_ID');token=env.get('CLOUDFLARE_API_TOKEN')
cf={}
if account and token:
    for worker in ['fernandotunas6-bot-onsoft-replica-dev','siga-plus-payflow']:
        response=get(f'https://api.cloudflare.com/client/v4/accounts/{account}/workers/scripts/{worker}/deployments',{'Authorization':'Bearer '+token})
        body=response.get('body',{})
        deployments=body.get('result',{}).get('deployments',[])[:1]
        cf[worker]={'status':response.get('status'),'deployments':[{k:d.get(k) for k in ['id','source','versions','created_on','annotations']} for d in deployments],'success':body.get('success'),'errors':body.get('errors')}
        if deployments and deployments[0].get('versions'):
            vid=deployments[0]['versions'][0]['version_id']
            version=get(f'https://api.cloudflare.com/client/v4/accounts/{account}/workers/scripts/{worker}/versions/{vid}',{'Authorization':'Bearer '+token})
            v=version.get('body',{}).get('result',{})
            cf[worker]['version_metadata']={k:v.get(k) for k in ['id','number','annotations']}
    for project in ['siga-web','siga-admin','siga-docs']:
        response=get(f'https://api.cloudflare.com/client/v4/accounts/{account}/pages/projects/{project}/deployments?per_page=1',{'Authorization':'Bearer '+token})
        body=response.get('body',{})
        cf[project]={'status':response.get('status'),'deployments':[{'id':d.get('id'),'created_on':d.get('created_on'),'environment':d.get('environment'),'deployment_trigger':d.get('deployment_trigger'),'latest_stage':d.get('latest_stage')} for d in body.get('result',[])],'success':body.get('success')}
(OUT/'deployments.json').write_text(json.dumps(cf,indent=2))
print(json.dumps({'http':public,'deployments':cf},indent=2))
