// Conexão com o backend (Supabase). A chave "anon" é pública por design:
// o acesso aos dados é controlado pelas políticas de RLS no banco.
const SUPABASE_URL = 'https://ofnckkypiytzzerkowgh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mbmNra3lwaXl0enplcmtvd2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5ODA2MDMsImV4cCI6MjA5ODU1NjYwM30.DfrV7tkmbqQ-C5h4QFaHFtXljf3gU-BAtl-GJmiP23A';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
