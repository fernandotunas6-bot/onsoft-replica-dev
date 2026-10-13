import { ApiFailure } from './api.ts';
export type Provider = 'google_meet' | 'zoom' | 'bigbluebutton' | 'whatsapp';
export type Integration = {
  schoolId: string; provider: Provider; version: 1;
  configured: boolean; authorized: boolean; supported: readonly string[];
  granted: readonly string[]; verifiedAt: string | null;
};
/** Installed/configured is not operational. Validate live credential health in
 * the connector before generating a room URL; never expose OAuth credentials. */
export function capabilityEnabled(integration: Integration, schoolId: string, capability: string) {
  return integration.schoolId === schoolId && integration.version === 1 && integration.configured &&
    integration.authorized && integration.supported.includes(capability) && integration.granted.includes(capability);
}
export function publicIntegrationState(integration: Integration, schoolId: string) {
  if (integration.schoolId !== schoolId) throw new ApiFailure(403,'INTEGRATION_FORBIDDEN');
  return {version: integration.version, provider: integration.provider,
    state: !integration.configured ? 'disconnected' : !integration.authorized ? 'authorization_required' : 'configured',
    verifiedAt: integration.verifiedAt,
    capabilities: integration.configured && integration.authorized
      ? [...new Set(integration.supported.filter(c => integration.granted.includes(c)))] : []};
}
/** Never use an arbitrary URL from a client or a DB setting as a launch target.
 * BBB uses the verified school-specific HTTPS origin, not a global wildcard. */
export function validateLaunchUrl(provider: Provider, raw: string, bbbOrigin?: string): string {
  let url: URL;
  try {url=new URL(raw);} catch {throw new ApiFailure(422,'INVALID_LAUNCH_URL');}
  if (url.hash || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new ApiFailure(422,'INVALID_LAUNCH_URL');
  const host=url.hostname.toLowerCase();
  let permitted=false;
  if (provider==='google_meet') permitted=host==='meet.google.com' && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname);
  if (provider==='zoom') permitted=(host==='zoom.us' || host.endsWith('.zoom.us')) && /^\/j\/\d+$/.test(url.pathname);
  if (provider==='whatsapp') permitted=host==='chat.whatsapp.com' && /^\/[A-Za-z0-9]{10,64}$/.test(url.pathname) && !url.search && !url.hash;
  if (provider==='bigbluebutton' && bbbOrigin) {
    let allowed: URL;
    try {allowed=new URL(bbbOrigin);} catch {throw new ApiFailure(422,'BBB_ORIGIN_INVALID');}
    permitted=allowed.protocol==='https:' && !allowed.username && !allowed.password &&
      allowed.origin===url.origin && url.pathname==='/bigbluebutton/api/join';
  }
  if (!permitted) throw new ApiFailure(422,'LAUNCH_ORIGIN_FORBIDDEN');
  return url.toString();
}
