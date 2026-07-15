let todosPedidos = [];

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
  aguardando_pagamento: 'aguardando pagamento',
  standby: 'aguardando confirmação',
  pago: 'pago',
  parcial: 'parcial',
  cancelado: 'cancelado',
};
const METODO_LABEL = { mercado_pago: 'Cartão / Pix', dinheiro: 'Dinheiro' };
const GENERO_LABEL = { masculina: 'Masculina', feminina: 'Feminina', infantil: 'Infantil' };

(async function init(){
  const { data:{ session } } = await supabaseClient.auth.getSession();
  if(!session){ window.location.href = 'index.html'; return; }
  const usuario = session.user;

  const { data: perfil } = await supabaseClient
    .from('profiles').select('full_name, is_admin').eq('id', usuario.id).single();

  if(!perfil || !perfil.is_admin){
    window.location.href = 'pedido.html';
    return;
  }

  document.getElementById('user-nome').textContent = perfil.full_name || usuario.email;
  await carregarPedidos();
})();

document.getElementById('btn-sair').addEventListener('click', async ()=>{
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

document.getElementById('filtro-busca').addEventListener('input', renderPedidos);
document.getElementById('filtro-status').addEventListener('change', renderPedidos);
document.getElementById('btn-exportar').addEventListener('click', exportarCSV);

async function carregarPedidos(){
  const { data, error } = await supabaseClient
    .from('orders')
    .select('id, buyer_name, contact, payment_method, status, valor_total, valor_pago, created_at, order_items(nome_camisa, tamanho, genero, numero, produto, reservado, products(nome))')
    .order('created_at', { ascending: false });

  if(error){
    document.getElementById('admin-summary').textContent = 'Não foi possível carregar os pedidos.';
    return;
  }

  todosPedidos = data || [];
  renderPedidos();
}

function renderPedidos(){
  const busca = (document.getElementById('filtro-busca').value || '').toLowerCase();
  const fStatus = document.getElementById('filtro-status').value;

  const lista = todosPedidos.filter(p=>{
    const matchNome = p.buyer_name.toLowerCase().includes(busca) ||
      (p.order_items||[]).some(it => it.nome_camisa.toLowerCase().includes(busca));
    if(busca && !matchNome) return false;
    if(fStatus && p.status !== fStatus) return false;
    return true;
  });

  document.getElementById('admin-summary').textContent =
    `${lista.length} de ${todosPedidos.length} pedido(s)`;

  const el = document.getElementById('lista-pedidos');
  if(lista.length === 0){
    el.innerHTML = '<div class="empty"><div class="empty-title">Nenhum pedido encontrado</div></div>';
    return;
  }

  el.innerHTML = lista.map(p => renderCard(p)).join('');

  el.querySelectorAll('[data-status-select]').forEach(sel=>{
    sel.addEventListener('change', ()=> mudarStatus(sel.dataset.statusSelect, sel.value, sel));
  });
  el.querySelectorAll('[data-confirmar]').forEach(btn=>{
    btn.addEventListener('click', ()=> confirmarPagamento(btn.dataset.confirmar));
  });
  el.querySelectorAll('[data-cancelar]').forEach(btn=>{
    btn.addEventListener('click', ()=> cancelarPedido(btn.dataset.cancelar));
  });
  el.querySelectorAll('[data-salvar-valor]').forEach(btn=>{
    btn.addEventListener('click', ()=> salvarValorPago(btn.dataset.salvarValor));
  });
}

function renderCard(p){
  const restante = Math.max(0, (p.valor_total||0) - (p.valor_pago||0));
  const waLink = p.contact
    ? `<a href="https://wa.me/55${p.contact.replace(/\D/g,'')}" target="_blank" rel="noopener">${escapeHtml(p.contact)}</a>`
    : '<span style="color:#bbb;">sem contato</span>';

  const itensHtml = (p.order_items||[]).map(it=>{
    const numTxt = it.numero != null ? `<span class="order-item-tag">Nº ${it.numero}</span>` : `<span class="order-item-tag">TAM ${it.tamanho}</span>`;
    const nomeProduto = it.products ? it.products.nome : it.produto;
    const generoLabel = GENERO_LABEL[it.genero] || it.genero;
    const conflito = it.numero != null && ['pago','standby'].includes(p.status) && !it.reservado
      ? '<span class="conflict-tag">conflito de número</span>' : '';
    return `<div class="order-item-row"><span>${escapeHtml(it.nome_camisa)} <span style="color:#999;">· ${escapeHtml(nomeProduto)} · ${generoLabel} · Tam. ${it.tamanho}</span>${conflito}</span>${numTxt}</div>`;
  }).join('');

  const statusOptions = Object.keys(STATUS_LABEL).map(s=>
    `<option value="${s}" ${p.status===s?'selected':''}>${STATUS_LABEL[s]}</option>`
  ).join('');

  let acoes = '';
  if(p.status === 'standby'){
    acoes += `<button class="btn btn-primary btn-small" data-confirmar="${p.id}">Confirmar pagamento recebido</button>`;
  }
  if(p.status !== 'cancelado'){
    acoes += `<button class="icon-btn" data-cancelar="${p.id}">Cancelar pedido</button>`;
  }

  const valorPagoEdit = p.status === 'parcial' ? `
    <div class="valor-pago-edit">
      <input type="number" min="0" step="0.01" id="valor-pago-${p.id}" value="${p.valor_pago}">
      <button class="btn btn-ghost btn-small" data-salvar-valor="${p.id}">Salvar valor pago</button>
    </div>` : '';

  return `
  <div class="order-card">
    <div class="order-top">
      <div>
        <div class="order-buyer">${escapeHtml(p.buyer_name)}</div>
        <div class="order-meta">${waLink} · ${METODO_LABEL[p.payment_method]||p.payment_method} · ${(p.order_items||[]).length} peça(s) · ${fmtData(p.created_at)}</div>
      </div>
      <select class="badge-select ${p.status}" data-status-select="${p.id}">${statusOptions}</select>
    </div>
    <div class="order-itens">${itensHtml}</div>
    <div class="order-bottom">
      <div class="order-value">${fmtBRL(p.valor_total)}${restante>0 && p.status!=='cancelado' ? ` <span style="color:var(--red-dark);font-weight:400;">· falta ${fmtBRL(restante)}</span>` : ''}</div>
      <div class="order-actions">${acoes}</div>
    </div>
    ${valorPagoEdit}
  </div>`;
}

async function mudarStatus(orderId, novoStatus, selectEl){
  const pedido = todosPedidos.find(p => p.id === orderId);
  if(!pedido) return;

  const update = { status: novoStatus };
  if(novoStatus === 'pago') update.valor_pago = pedido.valor_total;
  else if(['aguardando_pagamento','standby','cancelado'].includes(novoStatus)) update.valor_pago = 0;
  // 'parcial' mantém o valor_pago atual; o admin ajusta manualmente no campo abaixo

  const { error } = await supabaseClient.from('orders').update(update).eq('id', orderId);
  if(error){
    showToast('Não foi possível atualizar o status.', true);
    selectEl.value = pedido.status;
    return;
  }
  showToast('Status atualizado.');
  await carregarPedidos();
}

async function confirmarPagamento(orderId){
  const pedido = todosPedidos.find(p => p.id === orderId);
  if(!pedido) return;
  const { error } = await supabaseClient.from('orders')
    .update({ status: 'pago', valor_pago: pedido.valor_total }).eq('id', orderId);
  if(error){ showToast('Não foi possível confirmar o pagamento.', true); return; }
  showToast('Pagamento confirmado!');
  await carregarPedidos();
}

async function cancelarPedido(orderId){
  if(!confirm('Cancelar este pedido? Os números reservados por ele ficam livres novamente.')) return;
  const { error } = await supabaseClient.from('orders')
    .update({ status: 'cancelado', valor_pago: 0 }).eq('id', orderId);
  if(error){ showToast('Não foi possível cancelar o pedido.', true); return; }
  showToast('Pedido cancelado.');
  await carregarPedidos();
}

async function salvarValorPago(orderId){
  const input = document.getElementById(`valor-pago-${orderId}`);
  const novoValor = parseFloat(input.value);
  if(isNaN(novoValor) || novoValor < 0){ showToast('Valor inválido.', true); return; }

  const { error } = await supabaseClient.from('orders').update({ valor_pago: novoValor }).eq('id', orderId);
  if(error){ showToast('Não foi possível salvar o valor.', true); return; }
  showToast('Valor pago atualizado.');
  await carregarPedidos();
}

function exportarCSV(){
  const header = ['Comprador','Contato','Status','Forma de pagamento','Valor total','Valor pago','Produto','Nome na camisa','Genero','Tamanho','Numero','Data'];
  const rows = [];
  todosPedidos.forEach(p=>{
    (p.order_items||[]).forEach(it=>{
      rows.push([
        p.buyer_name, p.contact, STATUS_LABEL[p.status]||p.status, METODO_LABEL[p.payment_method]||p.payment_method,
        p.valor_total, p.valor_pago, it.products ? it.products.nome : it.produto, it.nome_camisa,
        GENERO_LABEL[it.genero] || it.genero, it.tamanho, it.numero ?? '', p.created_at
      ]);
    });
  });
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'pedidos-uniforme.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
