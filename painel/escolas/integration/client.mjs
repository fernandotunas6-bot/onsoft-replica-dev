/** Browser-safe client for the versioned public school-website API. No secrets. */
export class SigaWebsiteError extends Error {
  constructor(code, status=0) {super(code);this.name='SigaWebsiteError';this.code=code;this.status=status;}
}
function allowedURL(value, originOnly=false) {
  let url;
  try {url=new URL(value);}catch {throw new SigaWebsiteError('invalid_configuration');}
  const local=['localhost','127.0.0.1'].includes(url.hostname);
  if(url.username||url.password||url.hash||url.search||!(url.protocol==='https:'||(local&&url.protocol==='http:'))||(originOnly&&url.pathname!=='/'))throw new SigaWebsiteError('invalid_configuration');
  return originOnly?url.origin:url.href;
}
export function createSigaWebsiteClient({apiOrigin,campaignSlug,portalUrl}, {fetchImpl=globalThis.fetch,timeoutMs=15000}={}) {
  const base=allowedURL(apiOrigin,true);
  if(!/^[a-z0-9-]{2,80}$/.test(campaignSlug))throw new SigaWebsiteError('invalid_configuration');
  const portal=portalUrl?allowedURL(portalUrl):null;
  const endpoint=base+'/api/public/school-website/'+encodeURIComponent(campaignSlug);
  async function request(method,body) {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response=await fetchImpl(endpoint,{method,credentials:'omit',redirect:'error',signal:controller.signal,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      let data;
      try {data=await response.json();}
      catch {throw new SigaWebsiteError(controller.signal.aborted?(method==='POST'?'submission_unknown':'service_unavailable'):'invalid_response',response.status);}
      if(!response.ok)throw new SigaWebsiteError(typeof data.error==='string'?data.error:'request_failed',response.status);
      return data;
    } catch(error) {
      if(error instanceof SigaWebsiteError)throw error;
      throw new SigaWebsiteError(method==='POST'?'submission_unknown':'service_unavailable');
    } finally {clearTimeout(timer);}
  }

  async function getSchool() {
    const data=await request('GET');
    if(data?.apiVersion!==1||data?.campaign?.slug!==campaignSlug||data?.campaign?.isOpen!==true||typeof data?.school?.name!=='string'||!Array.isArray(data.programs)||!data.programs.every(p=>typeof p?.id==='string'&&typeof p?.name==='string'))throw new SigaWebsiteError('invalid_response');
    return data;
  }
  async function submitApplication(input) {
    // Refresh public scope immediately before a write. Never translate demo IDs by name.
    const school=await getSchool();
    if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.person?.full_name!=='string'||input.person.full_name.trim().length<2)throw new SigaWebsiteError('invalid_application');
    if('school_id'in input||'schoolId'in input||'tenant_id'in input||'tenantId'in input||('slug'in input&&input.slug!==campaignSlug))throw new SigaWebsiteError('scope_mismatch');
    if(input.desiredProgramId&&!school.programs.some(p=>p.id===input.desiredProgramId))throw new SigaWebsiteError('program_unavailable');
    const data=await request('POST',{...input,slug:campaignSlug});
    if(data?.ok!==true||!/^CAND-\d{8}-[A-F0-9]{6}$/.test(data.processNumber))throw new SigaWebsiteError('invalid_response');
    return data;
  }
  return Object.freeze({getSchool,submitApplication,getPortalUrl:()=>portal});
}
