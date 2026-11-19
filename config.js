// Configuração pública (não é segredo: a anon key só funciona dentro das regras RLS do banco).
// Preencher com os valores do projeto Supabase (Settings → API).
window.VITRINE_CONFIG = {
  supabaseUrl: "https://ztodnrtpuffbfcrhvuxx.supabase.co",
  supabaseAnonKey: "sb_publishable_B8OE2Fu21rIWwrdzGLg8Ww_OEoS6CRf",  // chave publicável (pública)
  bucket: "fotos",
  maxLado: 1600,        // lado maior da foto enviada (px)
  qualidade: 0.85
};
