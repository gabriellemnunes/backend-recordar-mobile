// Valida campos obrigatórios sem alterar os contratos das rotas existentes.
module.exports = (...fields) => (req, res, next) => {
  const missing = fields.filter((field) => {
    const value = req.body?.[field];
    return value === undefined || value === null ||
      (typeof value === "string" && value.trim() === "");
  });
  if (missing.length) {
    return res.status(400).json({
      message: `Campos obrigatórios: ${missing.join(", ")}.`,
      fields: missing,
    });
  }
  next();
};
