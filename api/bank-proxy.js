const fs=require('fs');
const path=require('path');
const zlib=require('zlib');
const chunks=['01','02','03'].map(n=>fs.readFileSync(path.join(process.cwd(),'packed',`proxygz-${n}.txt`),'utf8').trim()).join('');
const source=zlib.gunzipSync(Buffer.from(chunks,'base64')).toString('utf8');
const m={exports:{}};
new Function('require','module','exports','__filename','__dirname',source)(require,m,m.exports,__filename,__dirname);
module.exports=m.exports;
