const PRAZO_PEDIDOS = new Date('2026-07-20T10:20:00-03:00');

const TAMANHOS_POR_GENERO = {
  masculina: ['P','M','G','GG','EG','EGG'],
  feminina:  ['P','M','G','GG'],
  infantil:  ['2A','4A','6A','8A','10A','12A','14A'],
};
const GENERO_LABEL = { masculina: 'Masculina', feminina: 'Feminina', infantil: 'Infantil' };

let usuario = null;
let perfil = null;
let produtos = {};          // { completo: {nome,descricao,preco,tem_numero}, torcida: {...} }
let produtoAtual = null;
let generoAtual = null;
let numeroSelecionado = null;
let numerosReservadosDb = new Set();
let carrinho = [];

function chaveCarrinho(){ return 'carrinho-uniforme-' + usuario.id; }

function fmtBRL(v){
  return 'R$ ' + (v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}

function showToast(msg, isError){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.toggle('error', !!isError);
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2600);
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------------- auth guard + header ----------------
(async function init(){
  const { data:{ session } } = await supabaseClient.auth.getSession();
  if(!session){ window.location.href = 'index.html'; return; }
  usuario = session.user;

  const { data: perfilData } = await supabaseClient
    .from('profiles').select('full_name, phone, is_admin').eq('id', usuario.id).single();
  perfil = perfilData;
  document.getElementById('user-nome').textContent = (perfil && perfil.full_name) || usuario.email;
  if(perfil && perfil.is_admin){
    document.getElementById('user-admin-badge').innerHTML = '<span class="badge-admin">admin</span>';
    document.querySelector('.site-header-nav').insertAdjacentHTML('beforeend', '<a href="admin.html">Admin</a>');
  }

  if(new Date() > PRAZO_PEDIDOS){
    document.getElementById('cutoff-banner').style.display = 'block';
    document.getElementById('area-pedido').style.display = 'none';
    document.getElementById('btn-abrir-carrinho').style.display = 'none';
    return;
  }

  carregarCarrinhoLocal();
  await carregarProdutos();
  await carregarNumerosReservados();
  renderProdutos();
  renderCarrinho();
})();

document.getElementById('btn-sair').addEventListener('click', async ()=>{
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

// ---------------- carrinho: abrir/fechar painel ----------------
function abrirCarrinho(){
  document.getElementById('cart-drawer').classList.add('open');
  document.getElementById('cart-overlay').classList.add('open');
}
function fecharCarrinho(){
  document.getElementById('cart-drawer').classList.remove('open');
  document.getElementById('cart-overlay').classList.remove('open');
}
document.getElementById('btn-abrir-carrinho').addEventListener('click', abrirCarrinho);
document.getElementById('btn-fechar-carrinho').addEventListener('click', fecharCarrinho);
document.getElementById('cart-overlay').addEventListener('click', fecharCarrinho);

// ---------------- produtos ----------------
async function carregarProdutos(){
  const { data, error } = await supabaseClient.from('products').select('*');
  if(error || !data){ showToast('Não foi possível carregar os produtos.', true); return; }
  produtos = {};
  data.forEach(p=>{ produtos[p.id] = { nome: p.nome, descricao: p.descricao, preco: Number(p.preco), tem_numero: p.tem_numero }; });
}

async function carregarNumerosReservados(){
  const { data, error } = await supabaseClient.from('numeros_reservados').select('numero');
  numerosReservadosDb = new Set(error || !data ? [] : data.map(r=>r.numero));
}

function renderProdutos(){
  const grid = document.getElementById('products-grid');
  grid.innerHTML = Object.keys(produtos).map(id=>{
    const p = produtos[id];
    return `<div class="product-card" data-produto="${id}">
      <div class="p-check"></div>
      <div class="p-name">${escapeHtml(p.nome)}</div>
      <div class="p-desc">${escapeHtml(p.descricao)}</div>
      <div class="p-price">${fmtBRL(p.preco)}</div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.product-card').forEach(card=>{
    card.addEventListener('click', ()=> selecionarProduto(card.dataset.produto));
  });
}

function selecionarProduto(id){
  produtoAtual = id;
  numeroSelecionado = null;
  generoAtual = null;
  document.querySelectorAll('.product-card').forEach(c=>c.classList.toggle('selected', c.dataset.produto===id));
  document.getElementById('config-peca').style.display = 'block';
  document.getElementById('config-titulo').textContent = produtos[id].nome;
  document.getElementById('numero-wrap').style.display = produtos[id].tem_numero ? 'block' : 'none';
  document.getElementById('f-preco').textContent = fmtBRL(produtos[id].preco);
  document.getElementById('f-nomecamisa').value = '';
  document.getElementById('num-warn').textContent = '';
  document.querySelectorAll('.genero-btn').forEach(b=>b.classList.remove('selected'));
  resetTamanhoSelect();
  renderNumeros();
  document.getElementById('config-peca').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resetTamanhoSelect(){
  const sel = document.getElementById('f-tamanho');
  sel.innerHTML = '<option value="">Escolha o gênero primeiro</option>';
  sel.disabled = true;
}

document.querySelectorAll('.genero-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    generoAtual = btn.dataset.genero;
    document.querySelectorAll('.genero-btn').forEach(b=>b.classList.toggle('selected', b===btn));

    const sel = document.getElementById('f-tamanho');
    const tamanhos = TAMANHOS_POR_GENERO[generoAtual];
    sel.innerHTML = '<option value="">Selecione</option>' + tamanhos.map(t=>`<option value="${t}">${t}</option>`).join('');
    sel.disabled = false;
  });
});

function numerosNoCarrinho(){
  return carrinho.filter(it=>it.produto==='completo' && it.numero!=null).map(it=>it.numero);
}

function renderNumeros(){
  if(!produtoAtual || !produtos[produtoAtual] || !produtos[produtoAtual].tem_numero) return;
  const noCarrinho = new Set(numerosNoCarrinho());
  const grid = document.getElementById('num-grid');
  let html = '';
  for(let n=2; n<=99; n++){
    const ocupado = numerosReservadosDb.has(n) || noCarrinho.has(n);
    const sel = numeroSelecionado===n;
    html += `<button type="button" class="num-btn${sel?' selected':''}" ${ocupado?'disabled':''} data-n="${n}">${n}</button>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.num-btn:not(:disabled)').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      numeroSelecionado = Number(btn.dataset.n);
      document.getElementById('num-warn').textContent = '';
      renderNumeros();
    });
  });
}

// ---------------- carrinho ----------------
function carregarCarrinhoLocal(){
  try{ carrinho = JSON.parse(localStorage.getItem(chaveCarrinho())) || []; }
  catch(e){ carrinho = []; }
}
function salvarCarrinhoLocal(){
  localStorage.setItem(chaveCarrinho(), JSON.stringify(carrinho));
}

function atualizarCartBadge(){
  const badge = document.getElementById('cart-fab-count');
  if(carrinho.length>0){ badge.style.display='flex'; badge.textContent = carrinho.length; }
  else { badge.style.display='none'; }
}

document.getElementById('btn-add-carrinho').addEventListener('click', ()=>{
  const tamanho = document.getElementById('f-tamanho').value;
  const nomeCamisa = document.getElementById('f-nomecamisa').value.trim();
  const p = produtos[produtoAtual];

  if(!generoAtual){ showToast('Escolha o gênero da camisa'); return; }
  if(!tamanho){ showToast('Escolha o tamanho'); return; }
  if(!nomeCamisa){ showToast('Informe o nome que vai na camisa'); return; }

  let numero = null;
  if(p.tem_numero){
    if(numeroSelecionado==null){ showToast('Escolha um número entre 2 e 99'); return; }
    const ocupados = new Set([...numerosReservadosDb, ...numerosNoCarrinho()]);
    if(ocupados.has(numeroSelecionado)){
      document.getElementById('num-warn').textContent = `O número ${numeroSelecionado} já está em uso. Escolha outro.`;
      renderNumeros();
      return;
    }
    numero = numeroSelecionado;
  }

  carrinho.push({ produto: produtoAtual, genero: generoAtual, tamanho, nomeCamisa, numero, valor: p.preco });
  salvarCarrinhoLocal();

  document.getElementById('f-nomecamisa').value = '';
  numeroSelecionado = null;
  renderNumeros();
  renderCarrinho();
  atualizarCartBadge();
  showToast('Peça adicionada ao carrinho!');
  abrirCarrinho();
});

function removerDoCarrinho(idx){
  carrinho.splice(idx,1);
  salvarCarrinhoLocal();
  renderCarrinho();
  renderNumeros();
  atualizarCartBadge();
}

function renderCarrinho(){
  const el = document.getElementById('cart-list');
  if(carrinho.length===0){
    el.innerHTML = '<div class="cart-empty">Seu carrinho está vazio. Escolha uma peça para começar.</div>';
  } else {
    el.innerHTML = carrinho.map((it,idx)=>{
      const numTxt = it.numero!=null ? ` · Nº ${it.numero}` : '';
      const nomeProduto = produtos[it.produto] ? produtos[it.produto].nome : it.produto;
      const generoLabel = GENERO_LABEL[it.genero] || it.genero;
      return `<div class="cart-item">
        <div>
          <div class="cart-item-name">${escapeHtml(it.nomeCamisa)}</div>
          <div class="cart-item-meta">${escapeHtml(nomeProduto)} · ${generoLabel} · Tam. ${it.tamanho}${numTxt}</div>
        </div>
        <div class="cart-item-row">
          <span class="cart-item-price">${fmtBRL(it.valor)}</span>
          <button class="remove-x" data-idx="${idx}" title="Remover">&times;</button>
        </div>
      </div>`;
    }).join('');
    el.querySelectorAll('.remove-x').forEach(btn=>{
      btn.addEventListener('click', ()=> removerDoCarrinho(Number(btn.dataset.idx)));
    });
  }
  const total = carrinho.reduce((s,it)=>s+it.valor,0);
  document.getElementById('cart-total').textContent = fmtBRL(total);
  document.getElementById('checkout-area').style.display = carrinho.length>0 ? 'block' : 'none';
  atualizarCartBadge();
}

// ---------------- forma de pagamento ----------------
let metodoPagamento = null;
document.querySelectorAll('.payment-option').forEach(op=>{
  op.addEventListener('click', ()=>{
    metodoPagamento = op.dataset.metodo;
    document.querySelectorAll('.payment-option').forEach(o=>o.classList.toggle('selected', o===op));
    document.getElementById('standby-note').style.display = metodoPagamento==='dinheiro' ? 'block' : 'none';
  });
});

// ---------------- finalizar pedido ----------------
// Nome e contato já vêm do cadastro (perfil) — a pessoa não precisa digitar de novo.
document.getElementById('btn-finalizar').addEventListener('click', async ()=>{
  const btn = document.getElementById('btn-finalizar');
  const errEl = document.getElementById('checkout-error');
  errEl.textContent = '';

  if(carrinho.length===0){ errEl.textContent = 'Seu carrinho está vazio.'; return; }
  if(!metodoPagamento){ errEl.textContent = 'Escolha a forma de pagamento.'; return; }

  const comprador = (perfil && perfil.full_name) || '';
  const contato = (perfil && perfil.phone) || '';

  btn.disabled = true; btn.textContent = 'Enviando...';

  const itens = carrinho.map(it=>({ produto: it.produto, genero: it.genero, tamanho: it.tamanho, nomeCamisa: it.nomeCamisa, numero: it.numero }));

  const { data, error } = await supabaseClient.rpc('criar_pedido', {
    p_buyer_name: comprador,
    p_contact: contato,
    p_payment_method: metodoPagamento,
    p_itens: itens
  });

  if(error){
    btn.disabled = false; btn.textContent = 'Finalizar pedido';
    errEl.textContent = error.message || 'Não foi possível criar o pedido.';
    await carregarNumerosReservados();
    renderNumeros();
    return;
  }

  if(metodoPagamento === 'dinheiro'){
    carrinho = [];
    salvarCarrinhoLocal();
    renderCarrinho();
    btn.disabled = false; btn.textContent = 'Finalizar pedido';
    showToast('Pedido registrado! Combine o pagamento em dinheiro com a liderança do time.');
    document.querySelectorAll('.payment-option').forEach(o=>o.classList.remove('selected'));
    document.getElementById('standby-note').style.display = 'none';
    metodoPagamento = null;
    fecharCarrinho();
    await carregarNumerosReservados();
    renderNumeros();
    return;
  }

  // mercado pago: pede o link de checkout e redireciona
  const { data: pref, error: prefError } = await supabaseClient.functions.invoke('criar-preferencia-mp', {
    body: { order_id: data.order_id, origin: window.location.origin }
  });

  if(prefError || !pref || !pref.checkout_url){
    btn.disabled = false; btn.textContent = 'Finalizar pedido';
    errEl.textContent = (pref && pref.error) || 'Pagamento online indisponível no momento. Você pode tentar novamente ou escolher pagar em dinheiro.';
    return;
  }

  carrinho = [];
  salvarCarrinhoLocal();
  window.location.href = pref.checkout_url;
});
