(()=>{
  async function api(action,data={}){
    const response=await fetch('/api/auth',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});
    let body={};try{body=await response.json()}catch{}
    if(!response.ok||!body.ok)throw new Error(body.error||`Falha de autenticação (HTTP ${response.status}).`);
    return body.data;
  }

  function shell({configured,error=''}){
    const root=document.getElementById('root')||document.body;
    root.innerHTML=`<div style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#f5f6f8;font-family:Segoe UI,Arial,sans-serif;color:#111827"><div style="width:min(430px,100%);background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:28px;box-shadow:0 18px 55px rgba(15,23,42,.10)"><div style="font-size:23px;font-weight:800;margin-bottom:6px">Provedor Plus</div><div style="color:#6b7280;margin-bottom:22px">${configured?'Acesse o gerenciador':'Configure o administrador do gerenciador'}</div>${error?`<div style="background:#fef2f2;color:#b91c1c;padding:11px 12px;border-radius:10px;margin-bottom:14px;font-size:14px">${error.replace(/[<>&]/g,m=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[m]))}</div>`:''}<form id="pp-auth-form"><label style="display:block;font-size:13px;font-weight:600;margin:12px 0 6px">${configured?'Usuário':'Nome do administrador'}</label><input name="${configured?'login':'name'}" autocomplete="${configured?'username':'name'}" required style="box-sizing:border-box;width:100%;padding:11px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:15px" />${configured?'':`<label style="display:block;font-size:13px;font-weight:600;margin:12px 0 6px">Usuário de acesso</label><input name="login" autocomplete="username" required style="box-sizing:border-box;width:100%;padding:11px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:15px" />`}<label style="display:block;font-size:13px;font-weight:600;margin:12px 0 6px">Senha</label><input name="password" type="password" autocomplete="${configured?'current-password':'new-password'}" minlength="8" required style="box-sizing:border-box;width:100%;padding:11px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:15px" />${configured?'':`<label style="display:block;font-size:13px;font-weight:600;margin:12px 0 6px">Confirmar senha</label><input name="confirm" type="password" autocomplete="new-password" minlength="8" required style="box-sizing:border-box;width:100%;padding:11px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:15px" />`}<button style="width:100%;margin-top:18px;padding:12px;border:0;border-radius:10px;background:#111827;color:white;font-weight:700;font-size:15px;cursor:pointer">${configured?'Entrar':'Criar administrador e entrar'}</button></form></div></div>`;
    return root.querySelector('#pp-auth-form');
  }

  async function prompt(configured,error=''){
    const form=shell({configured,error});
    return new Promise(resolve=>{
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        const fd=new FormData(form),password=String(fd.get('password')||'');
        if(!configured&&password!==String(fd.get('confirm')||'')){resolve(prompt(false,'As senhas não conferem.'));return}
        const button=form.querySelector('button');button.disabled=true;button.textContent='Aguarde...';
        try{
          const result=configured?await api('login',{login:String(fd.get('login')||''),password}):await api('setup',{name:String(fd.get('name')||''),login:String(fd.get('login')||''),password});
          resolve(result);
        }catch(error){resolve(prompt(configured,error?.message||String(error)))}
      });
    });
  }

  async function ensure(){
    let status;
    try{status=await api('status')}catch(error){throw new Error(`Não foi possível validar o acesso: ${error?.message||error}`)}
    if(status?.authenticated&&status?.user)return status;
    const result=await prompt(Boolean(status?.configured));
    const root=document.getElementById('root');if(root)root.innerHTML='';
    return result;
  }

  async function logout(){await api('logout').catch(()=>{});location.reload()}
  window.ProvedorPlusAuth={ensure,logout,status:()=>api('status')};
})();
