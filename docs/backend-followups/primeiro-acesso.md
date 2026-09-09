# Primeiro acesso — corrida na criação do Usuario + reconciliação de nome/email

**Origem:** integração com o frontend (etapa 6 — dashboard).
**Status:** implementado — merge de `fix/primeiro-acesso-concorrente` na `main` (PR #12).
Inclui a reconciliação de nome/email do token, que antes era só uma proposta
separada (item 2 abaixo).

## Problemas observados

Ao abrir o app pela primeira vez, o frontend dispara em paralelo
`GET /api/usuarios/me`, `/me/progresso` e `/api/desafios`. Com o usuário ainda
não criado localmente:

1. **Corrida → 500.** As três requisições passam pelo `authMiddleware`, todas
   fazem `findUnique` (miss) e todas tentam `create`. Duas colidem no
   `@unique(firebaseUid)` → `P2002` → `errorHandler` genérico → `500 ERRO_INTERNO`.
   O usuário via a tela de erro no primeiro acesso.

2. **Nome errado no cadastro por e-mail.** O frontend faz
   `createUserWithEmailAndPassword` (dispara a 1ª request) e só depois
   `updateProfile({ displayName })`. O token da 1ª request ainda não tem `name`,
   então o `Usuario` nasce com `nome = email`. Como não há `PUT /me`, ficava assim
   para sempre.

## Correção (`src/middlewares/auth.middleware.ts`)

`obterOuCriarUsuario(decoded)`:

- **`create` protegido contra `P2002`:** se colidir, refaz o `findUnique` e usa o
  registro que a requisição concorrente criou. Sem 500.
- **`reconciliar(usuario, nomeToken, emailToken)`:** quando o `Usuario` já existe
  e o token traz `name`/`email` diferentes do gravado, faz um `update`. Resolve o
  caso do cadastro por e-mail (assim que o frontend manda um token já com o nome —
  ver abaixo) e, de brinde, troca de nome no provedor. Conflito de e-mail único no
  update é engolido (mantém o registro atual).

Sem mudança de contrato: as respostas das rotas são as mesmas.

## Do lado do frontend

Após `updateProfile`, o frontend força `getIdToken(true)` e recarrega
`GET /api/usuarios/me` — a partir daí o token carrega o `name` e a reconciliação
acima grava o nome certo. (feito em `etapa-6-dashboard`.)

## Testes

`tests/routes/auth.middleware.test.ts` — 6 casos: criação no 1º acesso, corrida
`P2002` sem 500, erro não-P2002 propaga, reconciliação de nome, no-op quando já
bate, conflito de e-mail no update. `npx jest` — 73/73.
