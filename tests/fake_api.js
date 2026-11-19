// API falsa para testar a captura sem Supabase. Carregada no lugar de config.js nos testes.
window.VITRINE_CONFIG = { supabaseUrl: "", supabaseAnonKey: "", bucket: "fotos", maxLado: 1600, qualidade: 0.85 };
window.__registro = { itens: [], fotos: [], falharOrdem: null };
window.VITRINE_API = {
  sessao: function () { return Promise.resolve({ id: "u1", email: "daniel@x.test" }); },
  entrar: function () { return Promise.resolve(); },
  sair: function () { return Promise.resolve(); },
  lojas: function () { return Promise.resolve([{ id: "L1", nome: "Garimpo de Máquinas", papel: "admin" }]); },
  perfis: function () {
    return Promise.resolve([
      { id: "notebook", nome: "Notebook", config: { sequencia_fotos: [
        { papel: "identificacao", rotulo: "Etiqueta / serial" },
        { papel: "produto", rotulo: "Frente" },
        { papel: "produto", rotulo: "Tampa" }] } },
      { id: "peca", nome: "Peça", config: { sequencia_fotos: [{ papel: "identificacao", rotulo: "Etiqueta" }] } }
    ]);
  },
  itens: function () {
    return Promise.resolve(window.__registro.itens.map(function (i) {
      return { id: i.id, sku: i.sku, perfil_id: i.perfil_id, status: "recebida",
        n_fotos: window.__registro.fotos.filter(function (f) { return f.item === i.id; }).length };
    }));
  },
  criarItem: function (loja, d) {
    var id = "I" + (window.__registro.itens.length + 1);
    window.__registro.itens.push({ id: id, loja: loja, sku: d.sku, perfil_id: d.perfil_id, custo: d.custo_compra });
    return Promise.resolve(id);
  },
  enviarFoto: function (f) {
    if (window.__registro.falharOrdem === f.ordem) {
      window.__registro.falharOrdem = null;
      return Promise.reject(new Error("rede caiu"));
    }
    window.__registro.fotos.push({ item: f.item, ordem: f.ordem, papel: f.papel, sha256: f.sha256,
      largura: f.largura, altura: f.altura, tipo: f.blob.type, bytes: f.blob.size });
    return new Promise(function (r) { setTimeout(r, 50); });
  }
};
