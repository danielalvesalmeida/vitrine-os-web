# vitrine-os-callback

Página estática de retorno (Redirect URI) do OAuth do Mercado Livre para o vitrine-os.

URL: `https://danielalvesalmeida.github.io/vitrine-os-callback/`

- Não contém segredo nem código do produto. Só mostra o `code` recebido para ser colado no
  terminal; a troca por token acontece em `scripts/ml_autorizar.py` (repositório privado), com
  Client Secret e PKCE que nunca saem da máquina do operador.
- Remove o código da barra de endereço ao carregar; sem recursos externos; CSP restritiva.
- Público porque o GitHub Pages no plano Free só publica repositórios públicos.
