import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const port=Number(process.env.SCHOOL_SITE_PORT||4174);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Porta inválida.');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  let target=file;
  try{const stat=await fs.stat(target);if(stat.isDirectory())target=path.join(target,'index.html');}catch{target=path.join(root,'404.html');res.statusCode=404;}
  const body=await fs.readFile(target);res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');res.end(body);
 }catch{res.writeHead(400);res.end('Pedido inválido.');}
}).listen(port,'127.0.0.1',()=>console.log('Website escolar: http://127.0.0.1:'+port));
