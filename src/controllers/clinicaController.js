const Clinic = require("../models/Clinic");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const { formatClinica } = require("../config/format");
const { buscaPorTexto } = require("../config/vinculos");
const { erroHttp } = require("../middlewares/errorHandler");

async function lerDados(body, idAtual = null) {
  const nome_clinica = String(body.nome_clinica ?? "").trim();
  if (!nome_clinica) throw erroHttp(400, "nome_clinica é obrigatório.");

  const repetida = await Clinic.findOne({ nome_clinica: { $regex: `^${buscaPorTexto(nome_clinica).$regex}$`, $options: "i" } });
  if (repetida && String(repetida._id) !== String(idAtual)) {
    throw erroHttp(409, "Já existe uma clínica com esse nome.");
  }
  return {
    nome_clinica,
    endereco_clinica: String(body.endereco_clinica ?? "").trim(),
    telefone_clinica: String(body.telefone_clinica ?? "").trim()
  };
}

async function list(req, res) {
  const filtro = {};
  if (req.query.busca) {
    const texto = buscaPorTexto(req.query.busca);
    filtro.$or = [{ nome_clinica: texto }, { endereco_clinica: texto }];
  }
  const clinicas = await Clinic.find(filtro).sort({ nome_clinica: 1 });
  res.json(clinicas.map(formatClinica));
}

async function getById(req, res) {
  const clinica = await Clinic.findById(req.params.id);
  if (!clinica) return res.status(404).json({ message: "Clínica não encontrada." });
  res.json(formatClinica(clinica));
}

async function create(req, res) {
  const clinica = await Clinic.create(await lerDados(req.body));
  res.status(201).json(formatClinica(clinica));
}

async function update(req, res) {
  const clinica = await Clinic.findById(req.params.id);
  if (!clinica) return res.status(404).json({ message: "Clínica não encontrada." });
  Object.assign(clinica, await lerDados(req.body, clinica._id));
  await clinica.save();
  res.json(formatClinica(clinica));
}

async function remove(req, res) {
  const clinica = await Clinic.findById(req.params.id);
  if (!clinica) return res.status(404).json({ message: "Clínica não encontrada." });

  if (await Appointment.exists({ clinica: clinica._id })) {
    return res.status(409).json({ message: "Esta clínica tem consultas. Exclua as consultas dela antes." });
  }
  if (await User.exists({ clinicas: clinica._id })) {
    return res.status(409).json({ message: "Há médicos associados a esta clínica. Tire a associação deles antes." });
  }
  await clinica.deleteOne();
  res.json({ message: "Clínica excluída com sucesso." });
}

module.exports = { list, getById, create, update, remove };
