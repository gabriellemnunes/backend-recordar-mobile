const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { formatUser } = require("../config/format");
const { dataValida } = require("../config/datas");

function tokenFor(user) {
  return jwt.sign({ id: user._id.toString(), tipo: user.tipo }, process.env.JWT_SECRET, { expiresIn: "8h" });
}

async function register(req, res) {
  const { tipo = "paciente", email, senha, confirmar_senha, telefone, nome_paciente, data_nascimento } = req.body;

  if (tipo !== "paciente") {
    return res.status(403).json({ message: "Só pacientes criam a própria conta. O cadastro de médicos é feito pelo administrador." });
  }
  if (!email || !senha) {
    return res.status(400).json({ message: "email e senha são obrigatórios." });
  }
  if (String(senha).length < 6) {
    return res.status(400).json({ message: "A senha precisa ter pelo menos 6 caracteres." });
  }
  if (confirmar_senha !== undefined && confirmar_senha !== senha) {
    return res.status(400).json({ message: "As senhas não são iguais." });
  }
  if (!nome_paciente || !data_nascimento) {
    return res.status(400).json({ message: "nome_paciente e data_nascimento são obrigatórios." });
  }
  if (!dataValida(data_nascimento)) {
    return res.status(400).json({ message: "data_nascimento deve estar no formato AAAA-MM-DD." });
  }

  const existe = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (existe) return res.status(409).json({ message: "E-mail já cadastrado." });

  const user = await User.create({
    tipo: "paciente",
    nome_usuario: nome_paciente,
    data_nascimento,
    email,
    telefone: telefone || "",
    senha: await bcrypt.hash(String(senha), 10)
  });

  res.status(201).json({ message: "Conta criada com sucesso.", token: tokenFor(user), user: formatUser(user, { comSaude: true }) });
}

async function login(req, res) {
  const { email, senha, tipo } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ message: "email e senha são obrigatórios." });
  }

  const user = await User.findOne({ email: String(email).toLowerCase().trim() })
    .populate("especialidade").populate("clinicas");
  if (!user || !(await bcrypt.compare(String(senha), user.senha))) {
    return res.status(401).json({ message: "E-mail ou senha inválidos." });
  }
  if (tipo && tipo !== user.tipo) {
    return res.status(403).json({ message: "Esta conta não é deste acesso. Use os botões Entrar como paciente, médico ou administrador." });
  }

  res.json({ message: "Login realizado com sucesso.", token: tokenFor(user), user: formatUser(user, { comSaude: true }) });
}

async function recuperarSenha(req, res) {
  const { tipo, email, data_nascimento, crm, nova_senha, confirmar_senha } = req.body;

  if (tipo !== "paciente" && tipo !== "medico") {
    return res.status(400).json({ message: "tipo deve ser 'paciente' ou 'medico'." });
  }
  const prova = tipo === "paciente" ? data_nascimento : crm;
  if (!email || !prova || !nova_senha) {
    return res.status(400).json({ message: "Preencha todos os campos." });
  }
  if (String(nova_senha).length < 6) {
    return res.status(400).json({ message: "A senha precisa ter pelo menos 6 caracteres." });
  }
  if (confirmar_senha !== undefined && confirmar_senha !== nova_senha) {
    return res.status(400).json({ message: "As senhas não são iguais." });
  }

  const user = await User.findOne({ email: String(email).toLowerCase().trim(), tipo });
  const guardado = user && (tipo === "paciente" ? user.data_nascimento : user.crm);
  const confere = guardado && String(guardado).trim().toLowerCase() === String(prova).trim().toLowerCase();
  if (!confere) {
    return res.status(400).json({ message: "Os dados não conferem com o cadastro." });
  }

  user.senha = await bcrypt.hash(String(nova_senha), 10);
  await user.save();
  res.json({ message: "Senha alterada com sucesso. Entre com a nova senha." });
}

async function criarAdminInicial() {
  const { ADMIN_NOME = "Administrador", ADMIN_EMAIL, ADMIN_SENHA } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_SENHA) return;

  const email = ADMIN_EMAIL.toLowerCase().trim();
  const existente = await User.findOne({ email });

  if (existente && existente.tipo !== "administrador") {
    console.warn("ADMIN_EMAIL já pertence a uma conta de paciente ou médico. Administrador não criado.");
    return;
  }
  if (!existente) {
    await User.create({ tipo: "administrador", nome_usuario: ADMIN_NOME, email, senha: await bcrypt.hash(ADMIN_SENHA, 10) });
    console.log(`Administrador criado: ${email}`);
    return;
  }
  if (!(await bcrypt.compare(ADMIN_SENHA, existente.senha))) {
    existente.senha = await bcrypt.hash(ADMIN_SENHA, 10);
    await existente.save();
    console.log(`Senha do administrador atualizada: ${email}`);
  }
}

module.exports = { register, login, recuperarSenha, criarAdminInicial };
