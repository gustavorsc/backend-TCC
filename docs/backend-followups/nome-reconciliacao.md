# Follow-up — reconciliar `nome`/`email` do token a cada acesso

**Origem:** desenvolvimento do frontend (etapa 5 — tela de cadastro).
**Prioridade:** baixa. Não bloqueia o frontend (há contorno no lado dele).
**Status:** proposta, não implementada.

## Problema

`authMiddleware` só grava `nome`/`email` **na criação** do `Usuario` (primeiro
acesso). No cadastro por e-mail o frontend faz:

```
createUserWithEmailAndPassword(...)   // já dispara onAuthStateChanged -> 1ª request
updateProfile(user, { displayName })  // grava o nome DEPOIS
```

A primeira request autenticada chega com um ID token que **ainda não tem o
`name`** (o `updateProfile` não força refresh do token). Resultado: o `Usuario` é
criado com `nome = decoded.email`. O nome digitado no cadastro nunca chega ao
backend.

Login com Google não tem o problema — o token já vem com `name`.

## Contorno atual (frontend)

`useAuth` expõe `nomeExibicao = firebaseUser.displayName ?? usuario.nome ??
firebaseUser.email`. As telas usam isso. O `Usuario.nome` no banco continua
"errado" (igual ao e-mail), mas nada quebra.

## Correção proposta (backend)

No `authMiddleware`, quando o `Usuario` já existe, reconciliar a partir do token
quando houver divergência:

```ts
if (!usuario) {
  usuario = await prisma.usuario.create({ /* ...igual a hoje... */ });
} else {
  const nomeToken = decoded.name?.trim();
  const emailToken = decoded.email?.trim();
  const precisaAtualizar =
    (nomeToken && nomeToken !== usuario.nome) ||
    (emailToken && emailToken !== usuario.email);

  if (precisaAtualizar) {
    usuario = await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        ...(nomeToken && nomeToken !== usuario.nome ? { nome: nomeToken } : {}),
        ...(emailToken && emailToken !== usuario.email ? { email: emailToken } : {}),
      },
    });
  }
}
```

- O frontend, após `updateProfile`, deve chamar `user.getIdToken(true)` para o
  token novo já carregar o `name` na request seguinte (a etapa 5 pode adicionar
  isso quando esta correção existir).
- `email` é `@unique` (RN01): a atualização pode colidir. Envolver em try/catch e,
  em conflito, manter o valor atual e logar.
- Cobre de brinde: usuário que troca o nome no Google passa a ver o nome novo.

## Alternativa

Expor `PUT /api/usuarios/me` (nome). Mais trabalho, e o `autenticacao.md` hoje diz
explicitamente que não há essa rota — a reconciliação pelo token mantém o modelo
"identidade vem do Firebase".
