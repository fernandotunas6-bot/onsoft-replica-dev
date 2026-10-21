// Exportação iCalendar para eventos ilustrativos.
// LIMITAÇÃO: o desvio UTC+1 (WAT, Angola) está fixo na aritmética abaixo.
// Uma escola noutro fuso exporta horas erradas; corrigir isto é uma alteração
// de lógica com os seus próprios testes, não uma substituição de texto.
const encoder=new TextEncoder();
const escapeText=value=>String(value).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
function foldLine(line){
  const lines=[];let current='',bytes=0;
  for(const character of line){const size=encoder.encode(character).length;if(bytes+size>75){lines.push(current);current=' ';bytes=1;}current+=character;bytes+=size;}
  lines.push(current);return lines.join('\r\n');
}
const stamp=date=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
function minutes(time){const match=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);if(!match)throw new RangeError('Hora inválida.');return Number(match[1])*60+Number(match[2]);}
export function buildCalendar(event,{institution='Escola',idDomain='escola.example',now=new Date()}={}){
  if(typeof idDomain!=='string'||!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(idDomain))throw new TypeError('Domínio de UID inválido.');
  if(!event||typeof event.id!=='string'||!/^[a-z0-9_-]+$/i.test(event.id)||typeof event.title!=='string'||!event.title.trim())throw new TypeError('Evento inválido.');
  if(typeof event.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(event.date))throw new RangeError('Data inválida.');
  const base=Date.parse(event.date+'T00:00:00Z');if(!Number.isFinite(base)||new Date(base).toISOString().slice(0,10)!==event.date)throw new RangeError('Data inválida.');
  const times=typeof event.time==='string'?event.time.split(' – '):[];if(times.length!==2)throw new RangeError('Intervalo inválido.');
  const from=minutes(times[0]),to=minutes(times[1]);if(from===to)throw new RangeError('Intervalo vazio.');
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new RangeError('Data de exportação inválida.');
  const start=new Date(base+(from-60)*60000),end=new Date(base+(to-60)*60000+(to<from?86400000:0));
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//'+escapeText(institution)+'//Demonstracao//PT','CALSCALE:GREGORIAN','BEGIN:VEVENT',
    'UID:'+event.id+'-demo-'+event.date.slice(0,4)+'@'+idDomain,'DTSTAMP:'+stamp(now),'DTSTART:'+stamp(start),'DTEND:'+stamp(end),
    'SUMMARY:'+escapeText('[DEMONSTRAÇÃO] '+event.title),'LOCATION:'+escapeText(event.place||''),
    'DESCRIPTION:'+escapeText('Evento ilustrativo. Não é uma actividade oficial do '+institution+'. '+(event.description||'')),
    'END:VEVENT','END:VCALENDAR'];
  return lines.map(foldLine).join('\r\n')+'\r\n';
}
