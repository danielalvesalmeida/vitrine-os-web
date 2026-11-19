/* vitrine-os · captura no celular (F1.2)
 * Fluxo: entrar → loja → nova máquina → fotos guiadas pelo perfil → envio.
 * Toda regra de acesso está no banco (RLS); este arquivo só orquestra a tela.
 */
(function () {
  "use strict";
  var CFG = window.VITRINE_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var estado = { loja: null, perfis: [], item: null, passo: 0, enviadas: 0, puladas: 0, emEnvio: 0, falhas: [] };

  // ------------------------------------------------------------ API (injetável para testes)
  function apiSupabase() {
    if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) { return null; }
    var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
    function ok(r) { if (r.error) { throw new Error(r.error.message); } return r.data; }
    return {
      sessao: function () { return sb.auth.getSession().then(function (r) { return r.data.session && r.data.session.user; }); },
      entrar: function (email) {
        return sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } })
          .then(ok);
      },
      sair: function () { return sb.auth.signOut(); },
      lojas: function () {
        return sb.from("membro").select("papel, loja:loja_id(id, nome)").then(ok).then(function (rows) {
          return rows.map(function (r) { return { id: r.loja.id, nome: r.loja.nome, papel: r.papel }; });
        });
      },
      perfis: function () { return sb.from("perfil_categoria").select("id, nome, config").order("id").then(ok); },
      itens: function (loja) {
        return sb.from("item").select("id, sku, perfil_id, status, criado_em, foto(count)")
          .eq("loja_id", loja).order("criado_em", { ascending: false }).limit(20).then(ok)
          .then(function (rows) {
            return rows.map(function (r) { r.n_fotos = (r.foto && r.foto[0] && r.foto[0].count) || 0; return r; });
          });
      },
      criarItem: function (loja, dados) {
        return sb.from("item").insert({ loja_id: loja, sku: dados.sku, perfil_id: dados.perfil_id,
          custo_compra: dados.custo_compra || 0 }).select("id").single().then(ok).then(function (r) { return r.id; });
      },
      enviarFoto: function (f) {
        var caminho = f.loja + "/" + f.item + "/" + String(f.ordem).padStart(2, "0") + "-" + f.papel + ".jpg";
        return sb.storage.from(CFG.bucket || "fotos").upload(caminho, f.blob, { contentType: "image/jpeg", upsert: false })
          .then(function (r) {
            // reenvio após falha no passo seguinte: o arquivo já pode estar no Storage
            if (r.error && !/exist|duplicate/i.test(r.error.message)) { throw new Error(r.error.message); }
          }).then(function () {
            return sb.from("foto").insert({ loja_id: f.loja, item_id: f.item, ordem: f.ordem, papel: f.papel,
              storage_path: caminho, sha256: f.sha256, largura: f.largura, altura: f.altura }).then(ok);
          }).then(function () { return caminho; });
      }
    };
  }
  var api = window.VITRINE_API || apiSupabase();

  // ------------------------------------------------------------ utilidades
  function tela(nome) {
    var secs = document.querySelectorAll("main > section");
    for (var i = 0; i < secs.length; i++) { secs[i].hidden = secs[i].id !== "tela-" + nome; }
  }
  function msg(id, texto, ok) { var el = $(id); el.textContent = texto || ""; el.className = "msg" + (ok ? " ok" : ""); }
  function erro(id) { return function (e) { msg(id, "Erro: " + (e && e.message ? e.message : e)); }; }

  var PREFIXO = { notebook: "NB", doador: "DO", peca: "PC", moda: "MD" };
  function sugerirSku(perfil) {
    var d = new Date();
    var data = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    var r = Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, "0");
    return (PREFIXO[perfil] || "IT") + "-" + data + "-" + r;
  }

  function reduzir(arquivo) {
    var maxLado = CFG.maxLado || 1600;
    return createImageBitmap(arquivo).then(function (bmp) {
      var esc = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
      var w = Math.round(bmp.width * esc), h = Math.round(bmp.height * esc);
      var c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(bmp, 0, 0, w, h);
      return new Promise(function (res, rej) {
        c.toBlob(function (b) { b ? res({ blob: b, largura: w, altura: h }) : rej(new Error("falha ao converter a foto")); },
          "image/jpeg", CFG.qualidade || 0.85);
      });
    });
  }
  function sha256(blob) {
    return blob.arrayBuffer().then(function (buf) { return crypto.subtle.digest("SHA-256", buf); }).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    });
  }

  // ------------------------------------------------------------ telas
  function iniciar() {
    if (!api) { tela("carregando"); $("tela-carregando").textContent = "Configuração ausente: preencha config.js (URL e anon key do Supabase)."; return; }
    api.sessao().then(function (user) {
      if (!user) { tela("login"); return; }
      $("btn-sair").hidden = false;
      return Promise.all([api.lojas(), api.perfis()]).then(function (r) {
        estado.perfis = r[1];
        var lojas = r[0];
        if (!lojas.length) { tela("carregando"); $("tela-carregando").textContent = "Seu usuário ainda não tem acesso a nenhuma loja. Peça ao admin."; return; }
        if (lojas.length === 1) { escolherLoja(lojas[0]); return; }
        var lista = $("lista-lojas"); lista.textContent = "";
        lojas.forEach(function (l) {
          var b = document.createElement("button");
          b.textContent = l.nome + " (" + l.papel + ")";
          b.addEventListener("click", function () { escolherLoja(l); });
          lista.appendChild(b);
        });
        tela("lojas");
      });
    }).catch(function (e) { tela("carregando"); $("tela-carregando").textContent = "Erro: " + e.message; });
  }

  function escolherLoja(l) { estado.loja = l; $("loja-nome").textContent = l.nome; home(); }

  function home() {
    tela("home");
    var lista = $("lista-itens"); lista.textContent = "Carregando…";
    api.itens(estado.loja.id).then(function (itens) {
      lista.textContent = itens.length ? "" : "Nenhuma máquina ainda.";
      itens.forEach(function (it) {
        var d = document.createElement("div");
        var t = document.createElement("strong"); t.textContent = it.sku;
        var s = document.createElement("small"); s.textContent = " · " + it.perfil_id + " · " + it.status + " · " + it.n_fotos + " foto(s)";
        d.appendChild(t); d.appendChild(s); lista.appendChild(d);
      });
    }).catch(function (e) { lista.textContent = "Erro: " + e.message; });
  }

  function novo() {
    var sel = $("novo-perfil"); sel.textContent = "";
    estado.perfis.forEach(function (p) { var o = document.createElement("option"); o.value = p.id; o.textContent = p.nome; sel.appendChild(o); });
    $("novo-sku").value = sugerirSku(sel.value);
    $("novo-custo").value = "";
    msg("novo-msg", "");
    tela("novo");
  }

  function criar() {
    var perfilId = $("novo-perfil").value, sku = $("novo-sku").value.trim().toUpperCase();
    var custo = $("novo-custo").value ? Number($("novo-custo").value) : 0;
    if (!sku) { msg("novo-msg", "Informe o SKU."); return; }
    if (custo < 0 || isNaN(custo)) { msg("novo-msg", "Custo inválido."); return; }
    $("btn-criar").disabled = true;
    api.criarItem(estado.loja.id, { sku: sku, perfil_id: perfilId, custo_compra: custo }).then(function (id) {
      var perfil = estado.perfis.filter(function (p) { return p.id === perfilId; })[0];
      estado.item = { id: id, sku: sku, sequencia: perfil.config.sequencia_fotos };
      estado.passo = 0; estado.enviadas = 0; estado.puladas = 0; estado.falhas = [];
      mostrarPasso();
    }).catch(erro("novo-msg")).then(function () { $("btn-criar").disabled = false; });
  }

  function mostrarPasso() {
    var seq = estado.item.sequencia;
    if (estado.passo >= seq.length) { terminar(); return; }
    var p = seq[estado.passo];
    $("cap-passo").textContent = "Foto " + (estado.passo + 1) + " de " + seq.length;
    $("cap-sku").textContent = estado.item.sku;
    $("cap-rotulo").textContent = p.rotulo;
    $("cap-papel").textContent = p.papel === "identificacao" ? "Identificação: precisa estar nítida e legível" : "Foto do produto";
    // a 1ª foto de identificação é obrigatória (base da procedência)
    $("btn-pular").hidden = estado.passo === 0;
    $("cap-preview").hidden = true;
    $("cap-input").value = "";
    msg("cap-msg", "");
    tela("captura");
  }

  function fotoEscolhida(ev) {
    var arquivo = ev.target.files && ev.target.files[0];
    if (!arquivo) { return; }
    var p = estado.item.sequencia[estado.passo];
    var ordem = estado.passo + 1, item = estado.item, loja = estado.loja.id;
    msg("cap-msg", "Preparando foto…", true);
    reduzir(arquivo).then(function (r) {
      $("cap-preview").src = URL.createObjectURL(r.blob);
      $("cap-preview").hidden = false;
      return sha256(r.blob).then(function (h) {
        // envio em segundo plano: o próximo passo já aparece (ganha tempo no KPI)
        enviar({ loja: loja, item: item.id, ordem: ordem, papel: p.papel, blob: r.blob,
          sha256: h, largura: r.largura, altura: r.altura });
        estado.passo++;
        setTimeout(mostrarPasso, 350);
      });
    }).catch(erro("cap-msg"));
  }

  function enviar(payload) {
    estado.emEnvio++; atualizarFila();
    return api.enviarFoto(payload)
      .then(function () { estado.enviadas++; })
      .catch(function (e) { payload.erro = e.message; estado.falhas.push(payload); })
      .then(function () { estado.emEnvio--; atualizarFila(); });
  }

  function atualizarFila() {
    var t = [];
    if (estado.emEnvio) { t.push("Enviando " + estado.emEnvio + " foto(s)…"); }
    if (estado.falhas.length) { t.push(estado.falhas.length + " falha(s): serão reenviadas ao terminar"); }
    $("cap-fila").textContent = t.join(" · ");
  }

  function terminar() {
    if (estado.emEnvio) { msg("cap-msg", "Aguardando " + estado.emEnvio + " envio(s)…", true); setTimeout(terminar, 400); return; }
    $("fim-resumo").textContent = estado.item.sku + ": " + estado.enviadas + " foto(s) enviada(s)" +
      (estado.puladas ? ", " + estado.puladas + " passo(s) pulado(s)" : "") +
      (estado.falhas.length ? ". " + estado.falhas.length + " falharam (" + estado.falhas[0].erro + ")." : ".");
    $("btn-reenviar").hidden = !estado.falhas.length;
    tela("fim");
  }

  function reenviar() {
    var lote = estado.falhas; estado.falhas = [];
    $("btn-reenviar").hidden = true;
    $("fim-resumo").textContent = "Reenviando " + lote.length + " foto(s)…";
    Promise.all(lote.map(enviar)).then(terminar);
  }

  // ------------------------------------------------------------ eventos
  document.addEventListener("DOMContentLoaded", function () {
    $("btn-login").addEventListener("click", function () {
      var email = $("login-email").value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg("login-msg", "E-mail inválido."); return; }
      api.entrar(email).then(function () { msg("login-msg", "Link enviado. Abra o e-mail neste celular.", true); })
        .catch(erro("login-msg"));
    });
    $("btn-sair").addEventListener("click", function () { api.sair().then(function () { location.reload(); }); });
    $("btn-novo").addEventListener("click", novo);
    $("novo-perfil").addEventListener("change", function () { $("novo-sku").value = sugerirSku(this.value); });
    $("btn-criar").addEventListener("click", criar);
    $("btn-cancelar-novo").addEventListener("click", home);
    $("cap-input").addEventListener("change", fotoEscolhida);
    $("btn-pular").addEventListener("click", function () { estado.puladas++; estado.passo++; mostrarPasso(); });
    $("btn-terminar").addEventListener("click", terminar);
    $("btn-voltar").addEventListener("click", home);
    $("btn-reenviar").addEventListener("click", reenviar);
    iniciar();
  });
})();
