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

// Mensagens de erro do Supabase em português
function traduzirErro(msg){
  const mapa = {
    'Invalid login credentials':'E-mail ou senha incorretos.',
    'User already registered':'Já existe uma conta com esse e-mail. Tente entrar.',
    'Email not confirmed':'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.',
    'Password should be at least 6 characters':'A senha precisa ter no mínimo 6 caracteres.',
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

  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;

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
  const email = document.getElementById('cad-email').value.trim();
  const senha = document.getElementById('cad-senha').value;

  if(!nome || !telefone){
    errEl.textContent = 'Preencha nome e contato.';
    return;
  }
  if(senha.length < 6){
    errEl.textContent = 'A senha precisa ter no mínimo 6 caracteres.';
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

  // A conta já é confirmada automaticamente no banco (sem precisar clicar
  // em link de e-mail); só falta entrar com a senha que acabou de criar.
  const { error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
  btn.disabled = false; btn.textContent = 'Criar conta';

  if(loginError){
    showToast('Conta criada! Você já pode entrar com seu e-mail e senha.');
    ativarAba('login');
    return;
  }
  window.location.href = 'pedido.html';
});

// ---- esqueci minha senha ----
document.getElementById('link-esqueci-senha').addEventListener('click', async ()=>{
  const email = document.getElementById('login-email').value.trim();
  if(!email){
    document.getElementById('login-error').textContent = 'Digite seu e-mail acima e clique em "Esqueci minha senha" novamente.';
    return;
  }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href.replace(/index\.html.*$/, 'redefinir-senha.html')
  });
  if(error){
    showToast(traduzirErro(error.message), true);
  } else {
    showToast('Enviamos um link de redefinição de senha para o seu e-mail.');
  }
});
