"""Teste de ponta a ponta da captura no Chrome headless, com API falsa (sem rede).

Uso: python tests/test_captura.py   (requer playwright e Google Chrome)
"""
import http.server
import os
import shutil
import sys
import tempfile
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")


def montar_site():
    d = tempfile.mkdtemp()
    for nome in ("index.html", "app.js", "app.css", "manifest.webmanifest", "icon.svg"):
        shutil.copy(os.path.join(RAIZ, nome), d)
    shutil.copytree(os.path.join(RAIZ, "vendor"), os.path.join(d, "vendor"))
    shutil.copy(os.path.join(RAIZ, "tests", "fake_api.js"), os.path.join(d, "config.js"))
    Image.new("RGB", (4000, 3000), (200, 30, 30)).save(os.path.join(d, "grande.jpg"), quality=90)
    return d


def servir(pasta):
    h = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=pasta, **k)  # noqa: E731
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main():
    pasta = montar_site()
    srv = servir(pasta)
    url = "http://127.0.0.1:%d/" % srv.server_address[1]
    foto = os.path.join(pasta, "grande.jpg")
    falhas = []

    def checa(cond, txt):
        print(("OK   " if cond else "FALHA ") + txt)
        if not cond:
            falhas.append(txt)

    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME)
        pg = b.new_page(viewport={"width": 390, "height": 844})
        erros = []
        pg.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.goto(url)
        pg.wait_for_selector("#tela-home:not([hidden])")
        checa(pg.inner_text("#loja-nome") == "Garimpo de Máquinas", "loja única escolhida automaticamente")

        # --- máquina 1: fluxo completo, com 1 falha de rede no passo 2 e reenvio
        pg.click("#btn-novo")
        sku = pg.input_value("#novo-sku")
        checa(sku.startswith("NB-") and len(sku) == 13, "SKU sugerido no formato NB-AAMMDD-XXX (%s)" % sku)
        pg.fill("#novo-custo", "850")
        pg.evaluate("window.__registro.falharOrdem = 2")
        pg.click("#btn-criar")
        pg.wait_for_selector("#tela-captura:not([hidden])")
        checa(pg.is_hidden("#btn-pular"), "1ª foto (identificação) não pode ser pulada")
        checa("1 de 3" in pg.inner_text("#cap-passo"), "passo 1 de 3")
        for n in (1, 2, 3):
            pg.set_input_files("#cap-input", foto)
            if n < 3:
                pg.wait_for_selector("#cap-passo:has-text('%d de 3')" % (n + 1))
        pg.wait_for_selector("#tela-fim:not([hidden])", timeout=10000)
        resumo = pg.inner_text("#fim-resumo")
        checa("2 foto(s) enviada(s)" in resumo and "1 falharam" in resumo, "resumo mostra a falha: %s" % resumo)
        checa(pg.is_visible("#btn-reenviar"), "botão de reenvio aparece")
        pg.click("#btn-reenviar")
        pg.wait_for_selector("#fim-resumo:has-text('3 foto(s) enviada(s)')", timeout=10000)
        checa(pg.is_hidden("#btn-reenviar"), "reenvio concluído")

        reg = pg.evaluate("window.__registro")
        fotos = sorted(reg["fotos"], key=lambda f: f["ordem"])
        checa([f["ordem"] for f in fotos] == [1, 2, 3], "3 fotos registradas, ordens 1-3")
        checa(all(max(f["largura"], f["altura"]) == 1600 for f in fotos), "reduzidas para lado maior 1600 px")
        checa(all(f["tipo"] == "image/jpeg" for f in fotos), "enviadas como JPEG")
        checa(all(len(f["sha256"]) == 64 for f in fotos), "sha256 calculado")
        checa(fotos[0]["papel"] == "identificacao" and fotos[1]["papel"] == "produto", "papéis seguem o perfil")
        checa(reg["itens"][0]["custo"] == 850, "custo de compra gravado")

        # --- máquina 2: pular e terminar cedo
        pg.click("#btn-voltar")
        pg.wait_for_selector("#tela-home:not([hidden])")
        checa("3 foto(s)" in pg.inner_text("#lista-itens"), "lista mostra a máquina com 3 fotos")
        pg.click("#btn-novo")
        pg.click("#btn-criar")
        pg.wait_for_selector("#tela-captura:not([hidden])")
        pg.set_input_files("#cap-input", foto)
        pg.wait_for_selector("#cap-passo:has-text('2 de 3')")
        pg.click("#btn-pular")
        pg.click("#btn-terminar")
        pg.wait_for_selector("#tela-fim:not([hidden])")
        checa("1 foto(s) enviada(s), 1 passo(s) pulado(s)" in pg.inner_text("#fim-resumo"), "pular e terminar cedo")

        pg.screenshot(path=os.environ.get("SCREENSHOT", "/tmp/captura.png"))
        checa(not erros, "sem erros no console/CSP: %s" % erros)
        b.close()
    srv.shutdown()
    shutil.rmtree(pasta)
    print("\n%d falha(s)" % len(falhas))
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
