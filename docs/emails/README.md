# Os dois emails que o Supabase manda

São os únicos emails do produto, e os dois são de porta de entrada: o de confirmação abre a conta,
o de recuperação devolve o acesso. Não há como testá-los por código — quem envia é o Supabase, e o
que ele envia é o que estiver colado no painel.

## Onde colar

**Supabase → Authentication → Emails**, um por aba:

| Arquivo | Aba do painel | Assunto sugerido |
|---|---|---|
| `confirmar-email.html` | **Confirm signup** | Confirme seu email — Projeto Isaura |
| `recuperar-senha.html` | **Reset password** | Criar uma senha nova — Projeto Isaura |
| `base.html` | *nenhuma* — é o molde | — |

Cole o HTML inteiro no campo *Message body*, salve, e mande um de teste para você antes de mandar
para ela.

## O molde

`base.html` é o template do Projeto Isaura, e os dois emails são ele com cinco trechos preenchidos
(prévia, título, texto, botão, aviso). Para criar um email novo, copie o `base.html` e troque os
cinco — assim os emails continuam parecendo o mesmo produto quando forem três.

O visual sai de `apps/web/src/app/globals.css`, e não de um gosto à parte: mesmo azul de tinta
(`#2F4A9C`), mesmo cartão branco sobre cinza-claro, mesmo raio de canto. Um email que chega com
outro azul não parece o mesmo sistema — e o que ele precisa transmitir em dois segundos é
"isto é o app em que eu confio".

Três detalhes que não são enfeite:

- **A marca é desenhada, não é imagem.** A barra vertical azul é a mesma que o app põe ao lado de
  cada aula na grade, e é `border-left` — imagem seria bloqueada por padrão na maioria dos clientes,
  e o email começaria com um retângulo quebrado.
- **Prévia própria.** A linha escondida no topo é o texto que aparece na caixa de entrada ao lado do
  assunto. Sem ela, o cliente usa o começo do corpo e a prévia vira "Projeto Isaura Confirme…".
- **Modo escuro.** O `<style>` do cabeçalho troca as cores no Apple Mail e no iOS; onde ele é
  descartado valem os estilos em atributo, que já estão certos no claro.

Sem VML de propósito: o botão redondo do Outlook para Windows exigiria um bloco condicional que
ninguém aqui consegue testar. O que se perde sem ele é o arredondamento — o botão continua clicável
e legível.

## O link não é o padrão do Supabase, e isso é de propósito

O template que vem de fábrica usa `{{ .ConfirmationURL }}`, que passa pelo endpoint do Supabase e
devolve a pessoa ao site com **os tokens no fragmento da URL** (`#access_token=…`). Nada neste app
lê aquele fragmento — o desfecho era ela confirmar o cadastro, cair na tela de login e concluir que
a confirmação não funcionou.

Estes templates mandam o `{{ .TokenHash }}` para uma tela nossa:

```
{{ .SiteURL }}/confirmar?codigo={{ .TokenHash }}
{{ .SiteURL }}/senha?codigo={{ .TokenHash }}
```

A tela repassa o código para a API (`POST /auth/confirmar`, `POST /auth/senha`), que o troca por
sessão pelo `/auth/v1/verify` e grava o mesmo cookie httpOnly do login. **Credencial nenhuma passa
pelo navegador** — é a mesma regra que faz o upload de anexo e o resumo da IA passarem pela API em
vez de o front falar direto com o serviço.

Consequência prática: o código é de **uso único e com validade curta**. Link reaberto no dia
seguinte falha, e as duas telas dizem "peça outro" em vez de mostrar erro.

## O que precisa estar configurado no painel

- **Authentication → URL Configuration → Site URL**: é o `{{ .SiteURL }}` dos templates, e é ele que
  decide para onde o link leva. Aponte para o endereço publicado.
- **Redirect URLs**: precisa conter as origens que o app usa. A API manda `redirect_to` a partir da
  primeira entrada do `WEB_ORIGIN`, e o Supabase recusa destino fora desta lista.

Para testar em `localhost`, troque a Site URL temporariamente e devolva depois — um projeto Supabase
tem uma Site URL só, e ela atende os dois ambientes.

## Por que o HTML é feio por dentro

Tabela aninhada, estilo em atributo `style`, nada de folha externa nem fonte da web: cliente de
email descarta `<style>`, e o Outlook não desenha `<button>`. O endereço aparece **escrito por
extenso** embaixo do botão porque há cliente que não abre o botão — sem essa linha, o email vira um
beco sem saída para quem já está sem acesso à conta.
