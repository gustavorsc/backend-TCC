import admin from "firebase-admin";

/**
 * Client do Firebase Admin SDK, usado apenas para verificação de tokens
 * (admin.auth().verifyIdToken) — o login em si é responsabilidade do frontend.
 */
if (admin.apps.length === 0) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Provedores de env costumam escapar as quebras de linha da chave como "\n" literal.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    // Não inicializa com credencial inválida (admin.credential.cert lança erro síncrono
    // e derrubaria a importação do módulo, inclusive para rotas sem auth como /health).
    console.warn(
      "[firebase-admin] Credenciais do Admin SDK ausentes no .env (FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY) — authMiddleware vai falhar até serem configuradas."
    );
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
}

export default admin;
