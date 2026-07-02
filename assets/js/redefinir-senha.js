function mostrarEstado(nome){
  ['estado-carregando','form-nova-senha','estado-invalido'].forEach(id=>{
    document.getElementById(id).classList.toggle('active', id===nome);
  });
}

function showToast(msg, isError){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.toggle('error', !!isError);
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2600);
}

function traduzirErro(msg){
  const mapa = {
    'Password should be at least 6 characters':'A senha precisa ter no mínimo 6 caracteres.',
    'New password should be different from the old password.':'A nova senha precisa ser diferente da senha atual.',
    'Auth session missing!':'Sessão expirada. Solicite um novo link de redefinição.',
  };
  return mapa[msg] || msg;
}

let sessaoPronta = false;

function liberarFormulario(){
  if(sessaoPronta) return;
  sessaoPronta = true;
  document.getElementById('subtitulo').textContent = 'Crie uma nova senha para a sua conta';
  mostrarEstado('form-nova-senha');
}

// O link do e-mail chega com um token na URL; o supabase-js processa
// automaticamente e dispara o evento PASSWORD_RECOVERY.
supabaseClient.auth.onAuthStateChange((event)=>{
  if(event === 'PASSWORD_RECOVERY'){
    liberarFormulario();
  }
});

// Fallback: se a sessão já existir (recuperação já processada, ou usuário
// já autenticado navegando direto para cá), libera o formulário também.
(async function init(){
  const { data:{ session } } = await supabaseClient.auth.getSession();
  if(session){
    liberarFormulario();
  } else {
    setTimeout(async ()=>{
      if(sessaoPronta) return;
      const { data:{ session: s2 } } = await supabaseClient.auth.getSession();
      if(s2){ liberarFormulario(); }
      else {
        document.getElementById('subtitulo').textContent = 'Não foi possível verificar o link';
        mostrarEstado('estado-invalido');
      }
    }, 2500);
  }
})();

document.getElementById('form-nova-senha').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = document.getElementById('btn-nova-senha');
  const errEl = document.getElementById('nova-senha-error');
  errEl.textContent = '';

  const senha = document.getElementById('nova-senha').value;
  const confirmar = document.getElementById('confirmar-senha').value;

  if(senha.length < 6){
    errEl.textContent = 'A senha precisa ter no mínimo 6 caracteres.';
    return;
  }
  if(senha !== confirmar){
    errEl.textContent = 'As senhas não coincidem.';
    return;
  }

  btn.disabled = true; btn.textContent = 'Salvando...';
  const { error } = await supabaseClient.auth.updateUser({ password: senha });
  btn.disabled = false; btn.textContent = 'Salvar nova senha';

  if(error){
    errEl.textContent = traduzirErro(error.message);
    return;
  }

  showToast('Senha atualizada com sucesso!');
  setTimeout(()=>{ window.location.href = 'dashboard.html'; }, 1200);
});
