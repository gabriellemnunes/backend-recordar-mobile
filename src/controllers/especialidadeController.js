const Specialty = require("../models/Specialty");
const User = require("../models/User");
const { formatEspecialidade } = require("../config/format");
const { buscaPorTexto } = require("../config/vinculos");
const { erroHttp } = require("../middlewares/errorHandler");

async function lerNome(body, idAtual = null) {
  const nome_especialidade = String(body.nome_especialidade ?? "").trim();
  if (!nome_especialidade) throw erroHttp(400, "nome_especialidade é obrigatório.");

  const repetida = await Specialty.findOne({ nome_especialidade: { $regex: `^${buscaPorTexto(nome_especialidade).$regex}$`, $options: "i" } });
  if (repetida && String(repetida._id) !== String(idAtual)) {
    throw erroHttp(409, "Esta especialidade já está cadastrada.");
  }
  return nome_especialidade;
}

async function list(req, res) {
  const filtro = req.query.busca ? { nome_especialidade: buscaPorTexto(req.query.busca) } : {};
  const especialidades = await Specialty.find(filtro).sort({ nome_especialidade: 1 });
  res.json(especialidades.map(formatEspecialidade));
}

async function create(req, res) {
  const especialidade = await Specialty.create({ nome_especialidade: await lerNome(req.body) });
  res.status(201).json(formatEspecialidade(especialidade));
}

async function update(req, res) {
  const especialidade = await Specialty.findById(req.params.id);
  if (!especialidade) return res.status(404).json({ message: "Especialidade não encontrada." });
  especialidade.nome_especialidade = await lerNome(req.body, especialidade._id);
  await especialidade.save();
  res.json(formatEspecialidade(especialidade));
}

async function remove(req, res) {
  const especialidade = await Specialty.findById(req.params.id);
  if (!especialidade) return res.status(404).json({ message: "Especialidade não encontrada." });
  if (await User.exists({ especialidade: especialidade._id })) {
    return res.status(409).json({ message: "Há médicos com esta especialidade. Troque a especialidade deles antes." });
  }
  await especialidade.deleteOne();
  res.json({ message: "Especialidade excluída com sucesso." });
}

module.exports = { list, create, update, remove };
