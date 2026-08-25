(()=>{
  const api=window.provedor;
  if(!api?.backup||api.backup.__cloudBackupInstalled)return;
  const KEY='provedor_plus_web_1_0_17';
  const original={...api.backup};

  api.backup.create=async()=>{
    if(window.ProvedorPlusCloudState?.forceSync)await window.ProvedorPlusCloudState.forceSync();
    return original.create();
  };

  api.backup.restore=async()=>{
    const input=document.createElement('input');
    input.type='file';input.accept='.json,application/json';
    return new Promise((resolve,reject)=>{
      input.onchange=()=>{
        const file=input.files?.[0];if(!file){resolve({canceled:true});return}
        const reader=new FileReader();
        reader.onload=async()=>{
          try{
            const data=JSON.parse(String(reader.result||''));
            if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Backup inválido.');
            localStorage.setItem(KEY,JSON.stringify(data));
            if(window.ProvedorPlusCloudState?.forceSync)await window.ProvedorPlusCloudState.forceSync();
            resolve({restored:true});
          }catch(error){reject(error instanceof Error?error:new Error('Backup inválido.'))}
        };
        reader.onerror=()=>reject(new Error('Não foi possível ler o arquivo de backup.'));
        reader.readAsText(file);
      };
      input.click();
    });
  };

  Object.defineProperty(api.backup,'__cloudBackupInstalled',{value:true,enumerable:false});
})();
