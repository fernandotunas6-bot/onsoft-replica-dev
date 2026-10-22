import {sitePathname} from './site-urls.mjs';
export const appearanceChoices = {
  layout:['campus','editorial','minimal'], radius:['original','rounded','square'],
  motion:['original','fade','rise','zoom','none'], photos:['original','clean','framed'], header:['contextual','full']
};
const advancedChoices = {'headerSurface': ['original', 'solid', 'glass', 'tinted'], 'headerPosition': ['original', 'sticky', 'static'], 'headerDensity': ['original', 'compact', 'comfortable'], 'utilityBar': ['original', 'visible', 'hidden'], 'menuStyle': ['original', 'plain', 'soft', 'outlined'], 'brandMode': ['original', 'text'], 'brandStyle': ['original', 'clean', 'serif', 'boxed', 'gradient'], 'footerLayout': ['original', 'compact', 'center'], 'footerSurface': ['original', 'solid', 'gradient'], 'fontBody': ['original', 'system', 'humanist', 'editorial'], 'fontHeading': ['original', 'system', 'editorial'], 'textScale': ['original', 'comfortable', 'large'], 'lineHeight': ['original', 'compact', 'relaxed'], 'textAlign': ['original', 'left', 'center', 'justify'], 'textMeasure': ['original', 'narrow', 'wide'], 'headingStyle': ['original', 'plain', 'underline'], 'letterSpacing': ['original', 'tight', 'open'], 'sectionSpacing': ['original', 'compact', 'airy'], 'contentWidth': ['original', 'narrow', 'wide'], 'cardStyle': ['original', 'flat', 'elevated', 'bordered'], 'panelSurface': ['original', 'solid', 'glass'], 'imageShape': ['original', 'square', 'rounded', 'arch'], 'imageRatio': ['original', 'landscape', 'portrait'], 'bandStyle': ['original', 'solid', 'gradient', 'diagonal', 'layered'], 'decoration': ['original', 'subtle', 'none'], 'buttonStyle': ['original', 'solid', 'outline', 'soft'], 'buttonSize': ['original', 'compact', 'large'], 'buttonHover': ['original', 'none', 'lift', 'glow'], 'buttonIcon': ['original', 'visible', 'hidden'], 'linkStyle': ['original', 'underline', 'animated'], 'motionSpeed': ['original', 'quick', 'calm']};
Object.assign(advancedChoices,{headingWeight:['original','regular','medium','strong'],buttonShape:['original','square','rounded','pill'],bandMotion:['original','none','drift']});
Object.assign(appearanceChoices,advancedChoices);
const advancedDefaults=Object.fromEntries(Object.keys(advancedChoices).map(key=>[key,'original']));
const colors = ['primary','secondary','background','surface','text','heading','onPrimary','footer','footerText'];
const base = {...advancedDefaults,layout:'campus',primary:'#1558ee',secondary:'#6243c2',background:'#ffffff',surface:'#f6f8fc',text:'#25354c',heading:'#11223e',onPrimary:'#ffffff',footer:'#12264e',footerText:'#f5f7ff',radius:'original',motion:'original',photos:'original',header:'contextual'};
export const builtInThemes = [
  {format:'siga-school-theme',version:1,id:'campus',name:'Campus',description:'A composição actual, com a identidade azul e roxa e movimento discreto.',appearance:{...base}},
  {format:'siga-school-theme',version:1,id:'editorial',name:'Editorial',description:'Títulos alinhados, cartões com linhas simples e fotografias em moldura.',appearance:{...base,layout:'editorial',primary:'#183d70',secondary:'#6347a0',surface:'#f3f5f8',radius:'square',motion:'fade',photos:'framed'}},
  {format:'siga-school-theme',version:1,id:'minimal',name:'Essencial',description:'Fundos claros, cantos suaves e imagens sem ornamentos adicionais.',appearance:{...base,layout:'minimal',primary:'#174f58',secondary:'#325b61',surface:'#f1f7f6',radius:'rounded',motion:'none',photos:'clean',header:'full',footer:'#12363c'}}
];
const record = value => value && typeof value==='object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
function keys(value, allowed) {if (!record(value) || Object.keys(value).some(key=>!allowed.includes(key))) throw Error('O tema contém opções desconhecidas.');}
function contrast(a,b) {
  const luminance = hex => {const parts=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return parts[0]*.2126+parts[1]*.7152+parts[2]*.0722;};
  const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
function appearance(value, partial=false) {
  const allowed=[...colors,...Object.keys(appearanceChoices)];keys(value,allowed);
  if (!partial && allowed.filter(key=>!Object.hasOwn(advancedChoices,key)).some(key=>!Object.hasOwn(value,key))) throw Error('O tema está incompleto. Exporte um modelo para começar.');
  const result=partial?{}:{...advancedDefaults};
  for (const [key,item] of Object.entries(value)) {
    if (colors.includes(key)) {if (typeof item!=='string'||!/^#[0-9a-f]{6}$/i.test(item)) throw Error('Use cores no formato #RRGGBB.');result[key]=item.toLowerCase();}
    else {if (!appearanceChoices[key].includes(item)) throw Error('Esta opção visual não é suportada.');result[key]=item;}
  }
  return result;
}
function accessible(value) {
  for (const [a,b] of [['text','background'],['text','surface'],['heading','background'],['heading','surface'],['onPrimary','primary'],['onPrimary','secondary'],['footerText','footer']])
    if (contrast(value[a],value[b])<4.5) throw Error('Estas cores tornam o texto difícil de ler. Aumente o contraste entre o texto e o fundo.');
  return value;
}
export function parseThemePackage(input) {
  keys(input,['format','version','id','name','description','appearance']);
  if (input.format!=='siga-school-theme'||input.version!==1) throw Error('Formato de tema incompatível. Utilize um pacote SIGA Website, versão 1.');
  if (typeof input.id!=='string'||!/^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.id)||input.id.length>64) throw Error('O identificador do tema deve começar por custom- e usar letras minúsculas, números e hífen.');
  if (typeof input.name!=='string'||input.name.trim().length<2||input.name.length>60||typeof input.description!=='string'||input.description.length>200) throw Error('Indique um nome e uma descrição válidos para o tema.');
  return {format:input.format,version:1,id:input.id,name:input.name.trim(),description:input.description,appearance:accessible(appearance(input.appearance))};
}
export function parseWebsiteDesign(input) {
  keys(input,['activeTheme','installedThemes','overrides','pages']);
  const installed=input.installedThemes??[], pages=input.pages??{};
  if (!Array.isArray(installed)||installed.length>8) throw Error('Pode instalar até oito temas personalizados.');
  const themes=installed.map(parseThemePackage);
  if (new Set(themes.map(t=>t.id)).size!==themes.length) throw Error('Existem temas com o mesmo identificador.');
  const selected=[...builtInThemes,...themes].find(t=>t.id===input.activeTheme);
  if (!selected) throw Error('O tema seleccionado não está instalado.');
  const overrides=appearance(input.overrides??{},true);
  const global=accessible({...selected.appearance,...overrides});
  if (!record(pages)||Object.keys(pages).length>66) throw Error('As opções por página são inválidas.');
  const cleanPages={};
  for (const [path,options] of Object.entries(pages)) {
    if (!/^\/(?:[a-z0-9-]+\/){0,4}$/.test(path)||path.length>150||path.startsWith('/portal/')) throw Error('Esta página não aceita personalização do website.');
    cleanPages[path]=appearance(options,true);accessible({...global,...cleanPages[path]});
  }
  return {activeTheme:selected.id,installedThemes:themes,overrides,pages:cleanPages};
}
export function publishDesign(input) {
  const design=parseWebsiteDesign(input), theme=[...builtInThemes,...design.installedThemes].find(t=>t.id===design.activeTheme);
  return {themeId:theme.id,themeName:theme.name,appearance:{...theme.appearance,...design.overrides},pages:design.pages};
}
export function resolveAppearance(input,path='/') {
  return accessible(appearance({...input.appearance,...(input.pages?.[path]??{})}));
}
export function designAttributes(input,path='/') {
  const value=resolveAppearance(input,path);
  const variables={primary:'--blue',secondary:'--theme-secondary',background:'--theme-background',surface:'--soft',text:'--text',heading:'--deep',onPrimary:'--theme-on-primary',footer:'--theme-footer',footerText:'--theme-footer-text'};
  const advanced=Object.fromEntries(Object.keys(advancedChoices).map(key=>['data-website-'+key.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase()),value[key]]));
  return {...advanced,'data-website-design':'true','data-website-theme':value.layout,'data-website-motion':value.motion,'data-website-photos':value.photos,'data-website-header':value.header,'data-website-radius':value.radius,style:colors.map(key=>variables[key]+':'+value[key]).join(';')};
}
export function setupSchoolDesign(config,{doc=document,path=sitePathname()}={}) {
  const root=doc.documentElement;
  if (!config?.design||doc.querySelector('.portal-sidebar')) return;
  try {const attributes=designAttributes(config.design,path);for(const [name,value]of Object.entries(attributes))if(name==='style')for(const declaration of value.split(';')){const [key,color]=declaration.split(':');root.style.setProperty(key,color);}else root.setAttribute(name,value);}catch{/* An invalid external configuration never executes code or replaces the school's content. */}
}
