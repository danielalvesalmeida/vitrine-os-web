// Configuração pública (não é segredo: a anon key só funciona dentro das regras RLS do banco).
// Preencher com os valores do projeto Supabase (Settings → API).
window.VITRINE_CONFIG = {
  supabaseUrl: "",      // ex.: https://xxxx.supabase.co
  supabaseAnonKey: "",  // chave "anon" / "publishable"
  bucket: "fotos",
  maxLado: 1600,        // lado maior da foto enviada (px)
  qualidade: 0.85
};
