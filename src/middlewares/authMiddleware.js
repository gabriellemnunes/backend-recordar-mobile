const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token não informado." });
  }

  try {
    const dados = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    const user = await User.findById(dados.id).populate("especialidade").populate("clinicas");
    if (!user) return res.status(401).json({ message: "Conta não encontrada. Faça login novamente." });

    req.user = { id: user._id.toString(), tipo: user.tipo, doc: user };
    next();
  } catch {
    return res.status(401).json({ message: "Token inválido ou expirado." });
  }
}

function authorize(...tipos) {
  return (req, res, next) => {
    if (!req.user || !tipos.includes(req.user.tipo)) {
      return res.status(403).json({ message: "Acesso não autorizado." });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
