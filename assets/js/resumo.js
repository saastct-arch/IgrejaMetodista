function fmtBRL(v){
  return 'R$ ' + (v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}

(async function init(){
  const { data:{ session } } = await supabaseClient.auth.getSession();
  if(!session){ window.location.href = 'index.html'; return; }
  const usuario = session.user;

  const { data: perfil } = await supabaseClient
    .from('profiles').select('full_name, is_admin').eq('id', usuario.id).single();
  document.getElementById('user-nome').textContent = (perfil && perfil.full_name) || usuario.email;
  if(perfil && perfil.is_admin){
    document.getElementById('user-admin-badge').innerHTML = '<span class="badge-admin">admin</span>';
  }

  const [{ data: geral, error: geralError }, { data: porTamanho, error: tamanhoError }] = await Promise.all([
    supabaseClient.from('resumo_geral').select('*').single(),
    supabaseClient.from('resumo_por_tamanho').select('*'),
  ]);

  if(geralError || !geral){
    document.getElementById('st-pedidos').textContent = '–';
    return;
  }

  const arrecadado = Number(geral.total_arrecadado) || 0;
  const pendente = Number(geral.total_pendente) || 0;
  const totalEsperado = arrecadado + pendente;

  document.getElementById('st-pedidos').textContent = geral.total_pedidos;
  document.getElementById('st-completos').textContent = geral.total_completos;
  document.getElementById('st-torcida').textContent = geral.total_torcida;
  document.getElementById('st-pendente').textContent = fmtBRL(pendente);
  document.getElementById('st-arrecadado').textContent = fmtBRL(arrecadado);

  const pct = totalEsperado > 0 ? Math.round((arrecadado / totalEsperado) * 100) : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-note').textContent =
    totalEsperado > 0
      ? `${fmtBRL(arrecadado)} arrecadados de ${fmtBRL(totalEsperado)} esperados (${pct}%)`
      : 'Nenhum pedido registrado ainda.';

  const wrap = document.getElementById('size-breakdown');
  if(tamanhoError || !porTamanho || porTamanho.length === 0){
    wrap.innerHTML = '<span style="color:#999;font-size:13px;">Nenhum pedido ainda</span>';
  } else {
    const ordem = ['PP','P','M','G','GG','XG','XXG'];
    const ordenado = [...porTamanho].sort((a,b)=> ordem.indexOf(a.tamanho) - ordem.indexOf(b.tamanho));
    wrap.innerHTML = ordenado.map(s => `<div class="size-chip">${s.tamanho} <b>${s.quantidade}</b></div>`).join('');
  }
})();

document.getElementById('btn-sair').addEventListener('click', async ()=>{
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});
