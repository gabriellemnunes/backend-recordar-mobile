function erroHttp(httpStatus, message) {
  return Object.assign(new Error(message), { httpStatus });
}

function notFound(req, res) {
  res.status(404).json({ message: "Rota não encontrada." });
}

function errorHandler(error, req, res, next) {
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
    return res.status(400).json({ message: "Dados inválidos.", error: error.message });
  }
  if (error.code === 11000) {
    const campo = Object.keys(error.keyPattern || {})[0];
    const message = campo === "email"
      ? "E-mail já cadastrado."
      : "Você já tem uma consulta nesse dia e horário.";
    return res.status(409).json({ message });
  }
  console.error(error);
  res.status(500).json({ message: "Erro interno do servidor." });
}

module.exports = { erroHttp, notFound, errorHandler };
