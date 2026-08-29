from pathlib import Path
import base64
import gzip
import re

# Merge bank vaults provider-by-provider so credentials saved by different authorized users remain usable.
p=Path('lib/automation-handler.js')
text=p.read_text()
pattern=r"async function bankVault\(req\)\{.*?\n\}\nasync function routerPasswordMap"
replacement="""async function bankVault(req){
  const [settings,users]=await Promise.all([db(req,`/pp_settings?key=like.${encodeURIComponent(BANK_SECRET_PREFIX+'*')}&select=key,value,updated_at&order=updated_at.desc`),usersById(req)]),vault={};
  for(const row of Array.isArray(settings)?settings:[]){
    const m=text(row.key).match(/^automation_bank_secret_v1_(\\d+)$/);if(!m)continue;const userId=Number(m[1]),hash=users.get(userId);if(!hash)continue;
    const key=crypto.createHash('sha256').update(`provedor-plus-bank-automation-v1|${userId}|${hash}`).digest(),plain=decryptSecret(row.value,key);if(!plain)continue;
    try{const value=JSON.parse(plain);if(!vault.efi&&value?.efi)vault.efi=value.efi;if(!vault.mercadoPago&&value?.mercadoPago)vault.mercadoPago=value.mercadoPago;if(vault.efi&&vault.mercadoPago)break}catch{}
  }
  return vault;
}
async function routerPasswordMap"""
text,count=re.subn(pattern,replacement,text,count=1,flags=re.S)
assert count==1
p.write_text(text)

# Decode the already-patched browser bridge and make vault migration safe/non-blocking for normal bank operations.
parts=sorted(Path('packed').glob('bridgegz-*.txt'))
assert len(parts)==4
raw=''.join(x.read_text().strip() for x in parts)
bridge=gzip.decompress(base64.b64decode(raw)).decode()

old="if(window.__PROVEDOR_PLUS_CLOUD__)await syncAutomationBankVault(efiSec,mpSec);return {efi:"
assert old in bridge
bridge=bridge.replace(old,"if(window.__PROVEDOR_PLUS_CLOUD__)await syncAutomationBankVault(efiSec,mpSec).catch(error=>console.error('Provedor Plus: não foi possível atualizar o cofre bancário da automação.',error));return {efi:",1)

marker="  async function bankCall(payload){"
assert marker in bridge
expose="""  window.ProvedorPlusSyncAutomationBankVault=async()=>{const efiSec=await secureGet('efi'),mpSec=await secureGet('mercadoPago');await syncAutomationBankVault(efiSec,mpSec);return {efi:Boolean(efiSec.clientId&&efiSec.clientSecret),mercadoPago:Boolean(mpSec.accessToken)}};
"""
assert 'window.ProvedorPlusSyncAutomationBankVault' not in bridge
bridge=bridge.replace(marker,expose+marker,1)

Path('/tmp/bridge.js').write_text(bridge)
packed=base64.b64encode(gzip.compress(bridge.encode(),compresslevel=9,mtime=0)).decode()
size=(len(packed)+3)//4
chunks=[packed[i*size:(i+1)*size] for i in range(4)]
assert ''.join(chunks)==packed and all(chunks)
for path,chunk in zip(parts,chunks):
    path.write_text(chunk+'\n')

# On the first panel load after this update, migrate existing local bank secrets to the encrypted server vault without querying either bank.
p=Path('bootstrap.js')
text=p.read_text()
marker="  if(window.provedor?.app?.info){\n"
assert marker in text
assert 'ProvedorPlusSyncAutomationBankVault' not in text
insert="  if(typeof window.ProvedorPlusSyncAutomationBankVault==='function')await window.ProvedorPlusSyncAutomationBankVault().catch(error=>console.error('Provedor Plus: o cofre bancário da automação será sincronizado na próxima tentativa.',error));\n\n"
text=text.replace(marker,insert+marker,1)
p.write_text(text)
