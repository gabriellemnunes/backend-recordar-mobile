const mongoose = require('mongoose');
const PreTriage = require('../models/PreTriage');
const User = require('../models/User');
const Specialty = require('../models/Specialty');
const { erroHttp } = require('../middlewares/errorHandler');

const idValido = (value) => typeof value === 'string' && mongoose.isObjectIdOrHexString(value);

function texto(valor, campo, limite = 2000, obrigatorio = false) {
  if (valor === undefined || valor === null) {
    if (obrigatorio) throw erroHttp(400, `${campo} é obrigatório.`);
    return '';
  }
  if (typeof valor !== 'string') throw erroHttp(400, `${campo} deve ser texto.`);
  const limpo = valor.trim();
  if ((obrigatorio && !limpo) || limpo.length > limite) {
    throw erroHttp(400, `${campo} deve ter de ${obrigatorio ? 1 : 0} a ${limite} caracteres.`);
  }
  return limpo;
}

function listaTexto(valor, campo, maxItens = 20) {
  if (valor === undefined) return [];
  if (!Array.isArray(valor) || valor.length > maxItens) throw erroHttp(400, `${campo} deve ser uma lista de até ${maxItens} textos.`);
  return valor.map((item) => texto(item, campo, 300, true));
}

function representar(item) {
  return {
    id: item._id,
    paciente: item.paciente,
    especialidades: item.especialidades,
    resumo: item.resumo,
    urgencia: item.urgencia,
    concluida: item.concluida,
    sintomas: item.sintomas,
    duracao: item.duracao,
    intensidade: item.intensidade,
    observacoes: item.observacoes,
    alertas: item.alertas,
    aviso: 'A pré-triagem automatizada não substitui uma avaliação médica.',
    createdAt: item.createdAt
  };
}

async function criar(req, res) {
  const b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw erroHttp(400, 'Corpo da requisição inválido.');
  if (!idValido(b.paciente)) throw erroHttp(400, 'ID do paciente inválido.');
  const paciente = await User.findOne({ _id: b.paciente, tipo: 'paciente' }).select('_id');
  if (!paciente) throw erroHttp(404, 'Paciente não encontrado.');
  if (typeof b.urgencia !== 'boolean' || typeof b.concluida !== 'boolean') {
    throw erroHttp(400, 'urgencia e concluida devem ser booleanos.');
  }
  if (!Array.isArray(b.especialidades) || b.especialidades.length > 10 ||
      b.especialidades.some((id) => !idValido(id))) {
    throw erroHttp(400, 'especialidades deve ser uma lista de até 10 IDs válidos.');
  }
  const especialidades = [...new Set(b.especialidades)];
  if (b.concluida && !b.urgencia && !especialidades.length) {
    throw erroHttp(400, 'Pré-triagem concluída sem urgência precisa recomendar uma especialidade.');
  }
  if (especialidades.length) {
    const quantidade = await Specialty.countDocuments({ _id: { $in: especialidades } });
    if (quantidade !== especialidades.length) throw erroHttp(400, 'Especialidade recomendada não cadastrada.');
  }
  if (b.intensidade !== undefined && b.intensidade !== null &&
      (!Number.isInteger(b.intensidade) || b.intensidade < 0 || b.intensidade > 10)) {
    throw erroHttp(400, 'intensidade deve ser um inteiro de 0 a 10.');
  }
  const registro = await PreTriage.create({
    paciente: paciente._id,
    especialidades,
    resumo: texto(b.resumo, 'resumo', 2000, true),
    urgencia: b.urgencia,
    concluida: b.concluida,
    sintomas: listaTexto(b.sintomas, 'sintomas'),
    duracao: texto(b.duracao, 'duracao', 120),
    intensidade: b.intensidade ?? null,
    observacoes: texto(b.observacoes, 'observacoes', 2000),
    alertas: listaTexto(b.alertas, 'alertas', 10),
    origem: 'servico_ia'
  });
  res.status(201).json(representar(registro));
}

async function listar(req, res) {
  const itens = await PreTriage.find({ paciente: req.user.id, concluida: true })
    .select('_id paciente especialidades resumo urgencia concluida sintomas duracao intensidade observacoes alertas createdAt')
    .populate('especialidades', 'nome_especialidade')
    .sort({ createdAt: -1 }).limit(50);
  res.json(itens.map(representar));
}

async function detalhar(req, res) {
  if (!idValido(req.params.id)) throw erroHttp(400, 'ID de pré-triagem inválido.');
  const item = await PreTriage.findOne({ _id: req.params.id, paciente: req.user.id })
    .populate('especialidades', 'nome_especialidade');
  if (!item) throw erroHttp(404, 'Pré-triagem não encontrada.');
  res.json(representar(item));
}

module.exports = { criar, listar, detalhar };
