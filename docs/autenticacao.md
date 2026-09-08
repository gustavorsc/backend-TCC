# Autenticação

## Princípio

O backend **não faz login, cadastro nem redefinição de senha**. Isso é 100%
responsabilidade do **frontend + Firebase Authentication**. O backend apenas
**verifica** o ID token que o frontend já obteve.

Consequência no modelo de dados: não existe campo de senha nem de token de reset.
O `Usuario` local guarda só o `firebaseUid` como elo com o Firebase.

## Fluxo

```
[Frontend]                              [Backend]
login no Firebase
  → recebe ID token
  → guarda o token
para cada request:
  Authorization: Bearer <ID token>  ──►  authMiddleware
                                          1. lê o header Authorization
                                          2. admin.auth().verifyIdToken(token)
                                             ├─ inválido/expirado → 401 NAO_AUTENTICADO
                                             └─ ok → decoded { uid, email, name, firebase.sign_in_provider }
                                          3. prisma.usuario.findUnique({ firebaseUid: uid })
                                             └─ não existe? cria (primeiro acesso, não é erro)
                                          4. req.usuario = usuario
                                          5. next()
```

Código: `src/middlewares/auth.middleware.ts`.

## Cabeçalho esperado

```
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
```

- Sem o prefixo `Bearer ` → `401 NAO_AUTENTICADO` ("Token de autenticação ausente").
- Token que o Firebase rejeita → `401 NAO_AUTENTICADO` ("Token de autenticação inválido ou expirado").

## Criação do usuário no primeiro acesso

Quando o token é válido mas não há `Usuario` local para aquele `firebaseUid`, o
middleware cria um automaticamente:

| Campo | Origem |
|---|---|
| `firebaseUid` | `decoded.uid` |
| `nome` | `decoded.name` → senão `decoded.email` → senão `"Usuário"` |
| `email` | `decoded.email` → senão `""` |
| `authProvider` | `decoded.firebase.sign_in_provider` (ex.: `"password"`, `"google.com"`) |
| `xpTotal`, `streakAtual` | `0` |
| `ultimaAtividade` | `null` |

O frontend não precisa chamar nenhuma rota de "registrar usuário" — a primeira
requisição autenticada já cria o registro. Se o nome vindo do Firebase estiver
vazio, considerar expor uma edição de perfil no futuro (hoje não há rota de
`PUT /me`).

## Rotas e autenticação

| Rota | Autenticada? |
|---|---|
| `GET /health` | Não |
| `GET/POST/PUT/PATCH/DELETE /api/**` | Sim — todas passam pelo `authMiddleware` |

## Configuração necessária (backend)

O Admin SDK precisa de credenciais de service account no `.env`:

```
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=      # com \n literais; o backend os converte em quebras de linha reais
```

Sem essas variáveis o servidor sobe (para não derrubar `/health`), mas emite um
aviso no boot e **todas as rotas autenticadas falham** na verificação do token.

## Erros do frontend a tratar

| Situação | Resposta | O que o frontend deve fazer |
|---|---|---|
| Token expirou | `401 NAO_AUTENTICADO` | Renovar o token no Firebase e repetir a requisição. |
| Usuário deslogou / token inválido | `401 NAO_AUTENTICADO` | Redirecionar para o login. |
| Conta excluída via `DELETE /api/usuarios/me` | próximas requisições recriam o usuário (token ainda válido até expirar) | Após excluir, deslogar do Firebase no frontend. |
