const mongoose = require("mongoose");
const Clinic = require("../models/Clinic");
const Specialty = require("../models/Specialty");
const { erroHttp } = require("../middlewares/errorHandler");

const idValido = (id) => typeof id === "string" && mongoose.isValidObjectId(id);

async function conferirEspecialidade(id_especialidade) {
  if (!idValido(id_especialidade) || !(await Specialty.exists({ _id: id_especialidade }))) {
    throw erroHttp(400, "Escolha uma especialidade cadastrada.");
  }
  return id_especialidade;
}

async function conferirClinicas(clinicas) {
  if (clinicas === undefined || clinicas === null || clinicas === "") return [];
  const lista = [...new Set(Array.isArray(clinicas) ? clinicas : [clinicas])];
  if (!lista.every(idValido)) throw erroHttp(400, "Escolha clínicas cadastradas.");
  const achadas = await Clinic.countDocuments({ _id: { $in: lista } });
  if (achadas !== lista.length) throw erroHttp(400, "Escolha clínicas cadastradas.");
  return lista;
}

function buscaPorTexto(texto) {
  return { $regex: String(texto).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
}

module.exports = { idValido, conferirEspecialidade, conferirClinicas, buscaPorTexto };
