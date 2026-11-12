import {siteAsset} from './site-urls.mjs';
const isIspab = value => /^ispab(?:\s*\(demonstração\))?\.?$/i.test(String(value || '').trim());

// A school's uploaded logo always takes precedence over the ISPAB demonstration asset.
export async function setupInstitutionWordmark(config, {doc = document, loadImage} = {}) {
  if (!isIspab(config?.schoolName)) return false;
  const brands = [...doc.querySelectorAll('a.brand')].filter(link => !link.querySelector('img,.brand-wordmark-art') && isIspab(link.textContent));
  if (!brands.length) return false;
  const source = siteAsset('/assets/ispab-wordmark.png');
  const loaded = await (loadImage ? loadImage(source) : new Promise(resolve => {
    const image = new doc.defaultView.Image();
    image.onload = () => resolve(true); image.onerror = () => resolve(false); image.src = source;
  }));
  if (!loaded) return false;
  for (const link of brands) {
    // Recheck after loading in case a content refresh supplied a new identity.
    if (link.querySelector('img,.brand-wordmark-art') || !isIspab(link.textContent)) continue;
    const art = doc.createElement('span'); art.className = 'brand-wordmark-art'; art.setAttribute('aria-hidden', 'true');
    art.style.setProperty('--institution-wordmark', `url("${source}")`);
    link.append(art); link.classList.add('ispab-wordmark');
  }
  return true;
}
