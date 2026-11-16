const { timingSafeEqual } = require('node:crypto');

// Esta credencial é exclusiva da integração servidor-servidor.
// Nunca coloque AI_SERVICE_TOKEN no app React Native nem num bundle público.
module.exports = function aiServiceAuth(req, res, next) {
  const esperado = process.env.AI_SERVICE_TOKEN;
  if (!esperado || esperado.length < 32) {
    return res.status(503).json({ message: 'Integração com IA não configurada.' });
  }
  const recebido = req.get('x-ai-service-token') || '';
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ message: 'Credencial do serviço de IA inválida.' });
  }
  next();
};
