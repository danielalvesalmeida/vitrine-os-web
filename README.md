# vitrine-os-web

Parte pública e estática do vitrine-os, publicada no GitHub Pages:

| Caminho | O que é |
|---|---|
| `/` | App de captura no celular (PWA): entrar → loja → nova máquina → fotos guiadas pelo perfil → envio ao Supabase |
| `/ml/callback/` | Redirect URI do OAuth do Mercado Livre: só mostra o `code` para colar no terminal |

URL: `https://danielalvesalmeida.github.io/vitrine-os-web/`

## Por que é público
O GitHub Pages no plano Free só publica repositório público. Nada aqui é segredo: a `anon key` do
Supabase em `config.js` só funciona dentro das regras de acesso (RLS) do banco, que ficam no
repositório privado `vitrine-os`. Nunca colocar `service_role`, Client Secret ou token aqui.

## Segurança da página
- CSP restritiva: só scripts do próprio site; conexão só com `*.supabase.co`.
- supabase-js embutido (`vendor/`, v2.119.2, licença MIT em `vendor/supabase-LICENSE`), sem CDN.
- Fotos reduzidas no celular (lado maior 1600 px, JPEG) e com sha256 antes do envio.
- Falha de rede numa foto não trava o fluxo: as falhas ficam guardadas e são reenviadas ao terminar.

## Teste
```bash
python tests/test_captura.py   # Chrome headless + API falsa, sem rede (playwright, Pillow)
```

## Configurar
Preencher `config.js` com a URL e a anon key do projeto Supabase (Settings → API).
