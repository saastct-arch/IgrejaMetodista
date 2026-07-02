let usuario = null;

function fmtBRL(v){
  return 'R$ ' + (v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtData(iso){
  return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function showToast(msg, isError){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.toggle('error', !!isError);
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2600);
}

const STATUS_LABEL = {
  aguardando_pagamento: 'Aguardando pagamento',
  standby: 'Aguardando confirmação',
  pago: 'Pago',
  parcial: 'Parcial',
  cancelado: 'Pagamento não aprovado',
};
const METODO_LABEL = { mercado_pago: 'Cartão / Pix', dinheiro: 'Dinheiro' };

(async function init(){
  const { data:{ session } } = await supabaseClient.auth.getSession();
  if(!session){ window.location.href = 'index.html'; return; }
  usuario = session.user;

  const { data: perfil } = await supabaseClient
    .from('profiles').select('full_name, is_admin').eq('id', usuario.id).single();
  document.getElementById('user-nome').textContent = (perfil && perfil.full_name) || usuario.email;
  if(perfil && perfil.is_admin){
    document.getElementById('user-admin-badge').innerHTML = '<span class="badge-admin">admin</span>';
  }

  await carregarPedidos();
})();

document.getElementById('btn-sair').addEventListener('click', async ()=>{
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

async function carregarPedidos(){
  const el = document.getElementById('lista-pedidos');
  const { data: pedidos, error } = await supabaseClient
    .from('orders')
    .select('id, payment_method, status, valor_total, valor_pago, created_at, order_items(nome_camisa, tamanho, numero, produto, products(nome))')
    .eq('user_id', usuario.id)
    .order('created_at', { ascending: false });

  if(error){
    el.innerHTML = '<div class="empty"><div class="empty-title">Não foi possível carregar seus pedidos</div>Tente novamente em alguns instantes.</div>';
    return;
  }

  if(!pedidos || pedidos.length === 0){
    el.innerHTML = `<div class="empty"><div class="empty-title">Você ainda não fez nenhum pedido</div>
      <a href="pedido.html" class="btn btn-primary" style="display:inline-block;text-decoration:none;max-width:220px;margin-top:14px;">Montar pedido</a>
    </div>`;
    return;
  }

  el.innerHTML = pedidos.map(p=>{
    const restante = Math.max(0, (p.valor_total||0) - (p.valor_pago||0));
    const itensHtml = (p.order_items||[]).map(it=>{
      const numTxt = it.numero != null ? `<span class="order-item-tag">Nº ${it.numero}</span>` : `<span class="order-item-tag">TAM ${it.tamanho}</span>`;
      const nomeProduto = it.products ? it.products.nome : it.produto;
      return `<div class="order-item-row"><span>${escapeHtml(it.nome_camisa)} <span style="color:#999;">· ${escapeHtml(nomeProduto)}${it.numero!=null?` · Tam. ${it.tamanho}`:''}</span></span>${numTxt}</div>`;
    }).join('');

    let nota = '';
    let botao = '';
    if(p.status === 'standby'){
      nota = '<p class="order-note">Combine o pagamento em dinheiro com a liderança do time. Assim que for recebido, o administrador confirma por aqui.</p>';
    } else if(p.status === 'cancelado'){
      nota = '<p class="order-note danger">O pagamento não foi aprovado pelo Mercado Pago. Você pode montar um novo pedido e tentar novamente.</p>';
      botao = `<a href="pedido.html" class="btn btn-outline" style="display:inline-block;text-decoration:none;width:auto;padding:8px 16px;font-size:13px;">Tentar novamente</a>`;
    } else if(p.status === 'aguardando_pagamento' && p.payment_method === 'mercado_pago'){
      nota = '<p class="order-note">Pagamento ainda não concluído.</p>';
      botao = `<button class="btn btn-primary" style="width:auto;padding:8px 16px;font-size:13px;" data-pagar="${p.id}">Pagar agora</button>`;
    }

    return `
    <div class="order-card">
      <div class="order-top">
        <div>
          <div class="order-buyer">Pedido de ${fmtData(p.created_at)}</div>
          <div class="order-meta">${METODO_LABEL[p.payment_method] || p.payment_method} · ${(p.order_items||[]).length} peça(s)</div>
        </div>
        <span class="badge ${p.status}">${STATUS_LABEL[p.status] || p.status}</span>
      </div>
      <div class="order-itens">${itensHtml}</div>
      <div class="order-bottom">
        <div class="order-value">${fmtBRL(p.valor_total)}${restante>0 && p.status!=='cancelado' ? ` <span style="color:var(--red-dark);font-weight:400;">· falta ${fmtBRL(restante)}</span>` : ''}</div>
        ${botao}
      </div>
      ${nota}
    </div>`;
  }).join('');

  el.querySelectorAll('[data-pagar]').forEach(btn=>{
    btn.addEventListener('click', ()=> pagarAgora(btn.dataset.pagar, btn));
  });
}

async function pagarAgora(orderId, btn){
  btn.disabled = true;
  btn.textContent = 'Abrindo pagamento...';

  const { data: pref, error } = await supabaseClient.functions.invoke('criar-preferencia-mp', {
    body: { order_id: orderId, origin: window.location.origin }
  });

  if(error || !pref || !pref.checkout_url){
    btn.disabled = false;
    btn.textContent = 'Pagar agora';
    showToast((pref && pref.error) || 'Não foi possível abrir o pagamento agora. Tente novamente.', true);
    return;
  }

  window.location.href = pref.checkout_url;
}
