const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const Medication = require("../models/Medication");
const { formatUser, formatMedicoPublico } = require("../config/format");
const { dataValida } = require("../config/datas");
const { idValido, conferirEspecialidade, conferirClinicas, buscaPorTexto } = require("../config/vinculos");
const { erroHttp } = require("../middlewares/errorHandler");

const comVinculos = (query) => query.populate("especialidade").populate("clinicas");

const ANAMNESE_VAZIA = {
  queixa_principal: "", sintomas: "", inicio_sintomas: "",
  aviso_troca: false, troca_data_anterior: "", troca_horario_anterior: ""
};
const CAMPOS_SAUDE = ["condicoes_saude", "alergias", "medicamentos_em_uso"];

async function excluirContaEmCascata(user) {
  if (user.tipo === "paciente") {
    await Medication.deleteMany({ paciente: user._id });
    await Appointment.updateMany(
      { paciente: user._id },
      { $set: { paciente: null, status: "disponivel", ...ANAMNESE_VAZIA } }
    );
  }
  if (user.tipo === "medico") {
    await Medication.deleteMany({ medico: user._id });
    await Appointment.deleteMany({ medico: user._id });
  }
  await User.deleteOne({ _id: user._id });
}

async function me(req, res) {
  res.json(formatUser(req.user.doc, { comSaude: true }));
}

function conferirSenha(senha, confirmar_senha) {
  if (String(senha).length < 6) return "A senha precisa ter pelo menos 6 caracteres.";
  if (confirmar_senha !== undefined && confirmar_senha !== senha) return "As senhas não são iguais.";
  return null;
}

async function criarAdministrador(req, res) {
  const { nome_administrador, email, senha, confirmar_senha, telefone } = req.body;
  if (!nome_administrador) {
    return res.status(400).json({ message: "nome_administrador é obrigatório." });
  }
  if (!email || !senha) {
    return res.status(400).json({ message: "email e senha são obrigatórios." });
  }
  const erroSenha = conferirSenha(senha, confirmar_senha);
  if (erroSenha) return res.status(400).json({ message: erroSenha });

  const existe = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (existe) return res.status(409).json({ message: "E-mail já cadastrado." });

  const user = await User.create({
    tipo: "administrador",
    nome_usuario: nome_administrador,
    email,
    telefone: telefone || "",
    senha: await bcrypt.hash(String(senha), 10)
  });
  res.status(201).json(formatUser(user));
}

async function create(req, res) {
  if (req.body.tipo === "administrador") return criarAdministrador(req, res);
  const { nome_medico, crm, id_especialidade, clinicas, email, senha, confirmar_senha, telefone } = req.body;

  if (!nome_medico || !crm || !id_especialidade) {
    return res.status(400).json({ message: "nome_medico, crm e id_especialidade são obrigatórios." });
  }
  if (!email || !senha) {
    return res.status(400).json({ message: "email e senha são obrigatórios." });
  }
  const erroSenha = conferirSenha(senha, confirmar_senha);
  if (erroSenha) return res.status(400).json({ message: erroSenha });

  const especialidade = await conferirEspecialidade(id_especialidade);
  const listaClinicas = await conferirClinicas(clinicas);

  const existe = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (existe) return res.status(409).json({ message: "E-mail já cadastrado." });

  const criado = await User.create({
    tipo: "medico",
    nome_usuario: nome_medico,
    crm,
    especialidade,
    clinicas: listaClinicas,
    email,
    telefone: telefone || "",
    senha: await bcrypt.hash(String(senha), 10)
  });
  const user = await comVinculos(User.findById(criado._id));
  res.status(201).json(formatUser(user));
}

async function aplicarEdicao(user, b, { podeTrocarSenha }) {
  if (b.email !== undefined) {
    const email = String(b.email).toLowerCase().trim();
    if (!email) throw erroHttp(400, "email não pode ficar vazio.");
    const emUso = await User.findOne({ email, _id: { $ne: user._id } });
    if (emUso) throw erroHttp(409, "E-mail já cadastrado.");
    user.email = email;
  }
  if (b.telefone !== undefined) user.telefone = b.telefone;

  if (user.tipo === "paciente") {
    if (b.nome_paciente !== undefined) user.nome_usuario = b.nome_paciente;
    if (b.data_nascimento !== undefined) {
      if (!dataValida(b.data_nascimento)) throw erroHttp(400, "data_nascimento deve estar no formato AAAA-MM-DD.");
      user.data_nascimento = b.data_nascimento;
    }
    if (podeTrocarSenha && CAMPOS_SAUDE.some((campo) => b[campo] !== undefined)) {
      for (const campo of CAMPOS_SAUDE) {
        if (b[campo] !== undefined) user[campo] = String(b[campo] ?? "").trim();
      }
      user.anamnese_preenchida = true;
    }
  }

  if (user.tipo === "medico") {
    if (b.nome_medico !== undefined) user.nome_usuario = b.nome_medico;
    if (b.crm !== undefined) user.crm = b.crm;
    if (b.id_especialidade !== undefined) user.especialidade = await conferirEspecialidade(b.id_especialidade);

    if (b.clinicas !== undefined) {
      const novas = await conferirClinicas(b.clinicas);
      const atuais = (user.clinicas || []).map((c) => String(c._id || c));
      const retiradas = atuais.filter((id) => !novas.includes(id));
      if (retiradas.length && await Appointment.exists({ medico: user._id, clinica: { $in: retiradas } })) {
        throw erroHttp(409, "Há consultas criadas em uma clínica que você desmarcou. Exclua essas consultas antes.");
      }
      user.clinicas = novas;
    }
  }

  if (user.tipo === "administrador" && b.nome_administrador !== undefined) {
    user.nome_usuario = b.nome_administrador;
  }

  if (podeTrocarSenha && b.senha !== undefined && b.senha !== "") {
    if (String(b.senha).length < 6) throw erroHttp(400, "A senha precisa ter pelo menos 6 caracteres.");
    user.senha = await bcrypt.hash(String(b.senha), 10);
  }

  await user.save();
  return comVinculos(User.findById(user._id));
}

async function updateMe(req, res) {
  const user = await aplicarEdicao(req.user.doc, req.body, { podeTrocarSenha: true });
  res.json(formatUser(user, { comSaude: true }));
}

async function removeMe(req, res) {
  if (req.user.tipo === "administrador") {
    return res.status(403).json({ message: "A conta de administrador não pode ser deletada pelo aplicativo." });
  }
  await excluirContaEmCascata(req.user.doc);
  res.json({ message: "Conta deletada com sucesso." });
}

async function list(req, res) {
  const filtro = { tipo: { $in: ["paciente", "medico"] } };
  if (["paciente", "medico", "administrador"].includes(req.query.tipo)) filtro.tipo = req.query.tipo;
  if (req.query.busca) {
    filtro.nome_usuario = buscaPorTexto(req.query.busca);
  }
  const users = await comVinculos(User.find(filtro).sort({ nome_usuario: 1 }));
  res.json(users.map(formatUser));
}

async function getById(req, res) {
  const user = await comVinculos(User.findById(req.params.id));
  if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
  res.json(formatUser(user));
}

async function update(req, res) {
  const alvo = await User.findById(req.params.id);
  if (!alvo) return res.status(404).json({ message: "Usuário não encontrado." });
  if (alvo.tipo === "administrador") {
    return res.status(403).json({ message: "Contas de administrador não são editadas por aqui." });
  }
  const user = await aplicarEdicao(alvo, req.body, { podeTrocarSenha: false });
  res.json(formatUser(user));
}

async function listMedicos(req, res) {
  const filtro = { tipo: "medico" };
  if (req.query.nome) filtro.nome_usuario = buscaPorTexto(req.query.nome);
  for (const [parametro, campo] of [["clinica", "clinicas"], ["especialidade", "especialidade"]]) {
    const id = req.query[parametro];
    if (!id) continue;
    if (!idValido(id)) return res.json([]);
    filtro[campo] = id;
  }
  const medicos = await comVinculos(User.find(filtro).sort({ nome_usuario: 1 }));
  res.json(medicos.map(formatMedicoPublico));
}

async function remove(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
  if (String(user._id) === req.user.id) {
    return res.status(403).json({ message: "Você não pode deletar a sua própria conta por aqui." });
  }
  await excluirContaEmCascata(user);
  res.json({ message: "Usuário deletado com sucesso." });
}

module.exports = { me, updateMe, removeMe, create, list, getById, update, listMedicos, remove };
