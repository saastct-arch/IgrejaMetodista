// ---- tabs (Entrar / Criar conta) ----
function ativarAba(nome){
  document.querySelectorAll('.auth-tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===nome));
  document.getElementById('form-login').classList.toggle('active', nome==='login');
  document.getElementById('form-cadastro').classList.toggle('active', nome==='cadastro');
  document.getElementById('login-error').textContent='';
  document.getElementById('cadastro-error').textContent='';
}
document.querySelectorAll('[data-tab]').forEach(el=>{
  el.addEventListener('click', ()=> ativarAba(el.dataset.tab));
});

function showToast(msg, isError){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.toggle('error', !!isError);
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2600);
}

// O login é só com WhatsApp (sem senha visível pro usuário). Por baixo dos
// panos, a conta continua sendo e-mail+senha no Supabase Auth — só que
// e-mail e senha são derivados de forma determinística a partir do próprio
// número de telefone, então a pessoa nunca precisa digitá-los.
function credenciaisPorTelefone(telefone){
  const digitos = (telefone || '').replace(/\D/g, '');
  return {
    digitos,
    email: `wa${digitos}@metodistatimoteo.app`,
    senha: `tm-${digitos}-uniforme`,
  };
}

function traduzirErro(msg){
  const mapa = {
    'Invalid login credentials':'Não encontramos uma conta com esse WhatsApp. Confira o número ou crie uma conta.',
    'User already registered':'Já existe uma conta com esse WhatsApp. Tente entrar.',
  };
  return mapa[msg] || msg;
}

// Se já estiver logado, vai direto para a área interna
(async function checarSessao(){
  const { data:{ session } } = await supabaseClient.auth.getSession();
  if(session){ window.location.href = 'pedido.html'; }
})();

// ---- login ----
document.getElementById('form-login').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  const errEl = document.getElementById('login-error');
  errEl.textContent='';

  const telefone = document.getElementById('login-telefone').value.trim();
  const { digitos, email, senha } = credenciaisPorTelefone(telefone);

  if(digitos.length < 10){
    errEl.textContent = 'Digite um WhatsApp válido, com DDD.';
    return;
  }

  btn.disabled = true; btn.textContent = 'Entrando...';
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
  btn.disabled = false; btn.textContent = 'Entrar';

  if(error){
    errEl.textContent = traduzirErro(error.message);
    return;
  }
  window.location.href = 'pedido.html';
});

// ---- cadastro ----
document.getElementById('form-cadastro').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = document.getElementById('btn-cadastro');
  const errEl = document.getElementById('cadastro-error');
  errEl.textContent='';

  const nome = document.getElementById('cad-nome').value.trim();
  const telefone = document.getElementById('cad-telefone').value.trim();
  const { digitos, email, senha } = credenciaisPorTelefone(telefone);

  if(!nome){
    errEl.textContent = 'Informe seu nome completo.';
    return;
  }
  if(digitos.length < 10){
    errEl.textContent = 'Digite um WhatsApp válido, com DDD.';
    return;
  }

  btn.disabled = true; btn.textContent = 'Criando conta...';
  const { data, error } = await supabaseClient.auth.signUp({
    email, password: senha,
    options: { data: { full_name: nome, phone: telefone } }
  });

  if(error){
    btn.disabled = false; btn.textContent = 'Criar conta';
    errEl.textContent = traduzirErro(error.message);
    return;
  }

  if(data.session){
    window.location.href = 'pedido.html';
    return;
  }

  // A conta já é confirmada automaticamente no banco; só falta entrar.
  const { error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
  btn.disabled = false; btn.textContent = 'Criar conta';

  if(loginError){
    showToast('Conta criada! Toque em "Entrar" e digite seu WhatsApp.');
    ativarAba('login');
    return;
  }
  window.location.href = 'pedido.html';
});
