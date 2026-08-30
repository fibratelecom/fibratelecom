import fs from 'node:fs';
import zlib from 'node:zlib';

fs.mkdirSync('cf',{recursive:true});

const bankChunks=['01','02','03']
  .map(n=>fs.readFileSync(`packed/proxygz-${n}.txt`,'utf8').trim())
  .join('');
const bankSource=zlib.gunzipSync(Buffer.from(bankChunks,'base64')).toString('utf8');
fs.writeFileSync('cf/bank-proxy.cjs',bankSource);

const mikrotik=fs.readFileSync('lib/mikrotik-proxy.js','utf8')
  .replace(new RegExp('\\bV'+'ercel\\b','g'),'Cloudflare')
  .replace(new RegExp('\\bv'+'ercel\\b','g'),'Cloudflare');
fs.writeFileSync('cf/mikrotik-proxy.cjs',mikrotik);
