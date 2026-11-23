function erroHttp(httpStatus, message) {
  return Object.assign(new Error(message), { httpStatus });
}

function notFound(req, res) {
  res.status(404).json({ message: "Rota não encontrada." });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.status === 415 || error.status === 400 && error.type === "encoding.unsupported") {
    return res.status(error.status).json({ message: "Formato da requisição não suportado." });
  }
  if (error.type === "entity.too.large") return res.status(413).json({ message: "Arquivo muito grande. Escolha uma foto menor." });
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ message: "JSON inválido no corpo da requisição." });
  }
  if (error.httpStatus) {
    return res.status(error.httpStatus).json({ message: error.message });
  }
  if (error.name === "CastError") {
    return res.status(400).json({ message: "ID inválido." });
  }
  if (error.name === "ValidationError") {
    return res.status(400).json({ message: "Dados inválidos.", details: Object.keys(error.errors || {}) });
  }
  if (error.code === 11000) {
    const campo = Object.keys(error.keyPattern || {})[0];
    const message = campo === "email"
      ? "E-mail já cadastrado."
      : "Você já tem uma consulta nesse dia e horário.";
    return res.status(409).json({ message });
  }
  if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
    return res.status(401).json({ message: "Sessão inválida ou expirada. Entre novamente." });
  }
  console.error(error);
  res.status(500).json({ message: "Erro interno do servidor." });
}

module.exports = { erroHttp, notFound, errorHandler };
