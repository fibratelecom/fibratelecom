(()=>{
  const toast=document.getElementById('toast');
  const show=message=>{if(!toast)return;toast.textContent=message;toast.hidden=false;clearTimeout(show.timer);show.timer=setTimeout(()=>{toast.hidden=true},3200)};
  document.getElementById('new-provider')?.addEventListener('click',()=>show('Cadastro multiempresa será conectado na próxima etapa.'));
  document.querySelectorAll('.sidebar nav button:not(.active)').forEach(button=>button.addEventListener('click',()=>show('Esta área será ativada conforme montarmos a Central.')));
})();
