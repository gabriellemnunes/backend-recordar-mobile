const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Medication = require('../models/Medication');
const PreTriage = require('../models/PreTriage');
const User = require('../models/User');
const { erroHttp } = require('../middlewares/errorHandler');
const { formatConsulta } = require('../config/format');
const { dataValida, horaValida } = require('../config/datas');
const { idValido } = require('../config/vinculos');
function validarId(id) {
  if (typeof id !== 'string' || !idValido(id)) throw erroHttp(400, 'ID inválido.');
}

function instante(c) {
  if (!dataValida(c.data_consulta) || !horaValida(c.horario_consulta)) throw erroHttp(400, 'Data ou horário inválido.');
  return new Date(`${c.data_consulta}T${c.horario_consulta}:00-03:00`);
}
function futuro(c) {
  if (instante(c) <= new Date()) throw erroHttp(409, 'Este horário já passou.');
}
const limpar = { paciente: null, status: 'disponivel', pre_triagem: null,
  queixa_principal: '', sintomas: '', inicio_sintomas: '', aviso_troca: false,
  troca_data_anterior: '', troca_horario_anterior: '' };

async function triagem(id, paciente, session) {
  if (!id) return null;
  validarId(String(id));
  const t = await PreTriage.findOne({ _id: id, paciente, concluida: true }).session(session);
  if (!t) throw erroHttp(404, 'Pré-triagem concluída não encontrada para este paciente.');
  if (t.urgencia !== false) throw erroHttp(422, 'Esta pré-triagem requer atendimento de urgência. Siga as orientações apresentadas pelo serviço de IA.');
  if (!t.especialidades.length) throw erroHttp(422, 'Pré-triagem sem especialidade recomendada.');
  return t;
}
async function validarDestino(c, t, session) {
  futuro(c);
  const m = await User.findOne({ _id: c.medico, tipo: 'medico', clinicas: c.clinica }).session(session);
  if (!m) throw erroHttp(409, 'Profissional ou vínculo com a clínica indisponível.');
  if (t && !t.especialidades.some(id => String(id) === String(m.especialidade))) {
    throw erroHttp(422, 'Escolha um médico de uma especialidade recomendada.');
  }
}
async function resposta(id, res) {
  const c = await Appointment.findById(id).populate({ path: 'medico', populate: { path: 'especialidade' } }).populate('paciente').populate('clinica');
  res.json(formatConsulta(c, { comAnamnese: true }));
}
async function bloquearPaciente(paciente, session) {
  await User.updateOne({ _id: paciente }, { $inc: { booking_revision: 1 } }, { session });
}
async function conflitos(c, paciente, session, ignorar) {
  const query = { paciente, status: 'agendada', _id: { $ne: ignorar || c._id },
    data_consulta: c.data_consulta,
    $or: [{ horario_consulta: c.horario_consulta }, { medico: c.medico }] };
  if (await Appointment.exists(query).session(session)) throw erroHttp(409, 'Você já tem consulta neste horário ou com este profissional neste dia.');
}
async function agendar(req, res) {
  validarId(req.params.id);
  if (req.body.id_pre_triagem != null && typeof req.body.id_pre_triagem !== 'string') throw erroHttp(400, 'ID de pré-triagem inválido.');
  let id;
  await mongoose.connection.transaction(async session => {
    await bloquearPaciente(req.user.id, session);
    const t = await triagem(req.body.id_pre_triagem, req.user.id, session);
    const queixa = String(req.body.queixa_principal || t?.resumo || '').trim();
    if (!queixa) throw erroHttp(400, 'Informe o motivo da consulta.');
    const c = await Appointment.findOne({ _id: req.params.id, status: 'disponivel' }).session(session);
    if (!c) throw erroHttp(409, 'Horário indisponível. Atualize a lista.');
    await validarDestino(c, t, session);
    await conflitos(c, req.user.id, session);
    Object.assign(c, { ...limpar, paciente: req.user.id, status: 'agendada', pre_triagem: t?._id || null,
      queixa_principal: queixa, sintomas: String(req.body.sintomas || ''), inicio_sintomas: String(req.body.inicio_sintomas || '') });
    await c.save({ session });
    id = c._id;
  });
  await resposta(id, res);
}
async function trocar(req, res) {
  validarId(req.params.id);
  validarId(req.body.id_nova);
  if (String(req.body.id_nova) === req.params.id) throw erroHttp(400, 'Escolha outro horário.');
  let id;
  await mongoose.connection.transaction(async session => {
    await bloquearPaciente(req.user.id, session);
    const atual = await Appointment.findOne({ _id: req.params.id, paciente: req.user.id, status: 'agendada' }).session(session);
    if (!atual) throw erroHttp(404, 'Consulta não encontrada.');
    futuro(atual);
    const nova = await Appointment.findOne({ _id: req.body.id_nova, medico: atual.medico, status: 'disponivel' }).session(session);
    if (!nova) throw erroHttp(409, 'Horário indisponível.');
    const t = await triagem(atual.pre_triagem, req.user.id, session);
    await validarDestino(nova, t, session);
    await conflitos(nova, req.user.id, session, atual._id);
    const dados = { paciente: atual.paciente, status: 'agendada', pre_triagem: atual.pre_triagem,
      queixa_principal: atual.queixa_principal, sintomas: atual.sintomas, inicio_sintomas: atual.inicio_sintomas,
      aviso_troca: true, troca_data_anterior: atual.data_consulta, troca_horario_anterior: atual.horario_consulta };
    // Libera a chave única do paciente antes de reservar o destino, na mesma transação.
    Object.assign(atual, limpar);
    await atual.save({ session });
    Object.assign(nova, dados);
    await nova.save({ session });
    await Medication.updateMany({ consulta: atual._id }, { $set: { consulta: nova._id } }, { session });
    id = nova._id;
  });
  await resposta(id, res);
}
async function cancelar(req, res) {
  validarId(req.params.id);
  await mongoose.connection.transaction(async session => {
    const c = await Appointment.findById(req.params.id).session(session);
    if (!c) throw erroHttp(404, 'Consulta não encontrada.');
    if (req.user.tipo !== 'administrador' && ![c.medico, c.paciente].some(id => String(id) === req.user.id)) throw erroHttp(403, 'Acesso não autorizado.');
    if (c.status !== 'agendada') throw erroHttp(409, 'Consulta já cancelada ou indisponível.');
    futuro(c);
    // Mantém prescrições existentes; remove apenas o vínculo com o horário liberado.
    await Medication.updateMany({ consulta: c._id }, { $set: { consulta: null } }, { session });
    Object.assign(c, limpar);
    await c.save({ session });
  });
  res.json({ message: 'Consulta cancelada com sucesso.' });
}
async function disponiveis(req, res) {
  for (const key of ['id_pre_triagem', 'medico', 'clinica', 'especialidade']) {
    if (req.query[key] !== undefined) validarId(req.query[key]);
  }
  const t = await triagem(req.query.id_pre_triagem, req.user.id, null);
  const query = { status: 'disponivel' };
  if (req.query.data) {
    if (!dataValida(req.query.data)) throw erroHttp(400, 'Data inválida.');
    query.data_consulta = req.query.data;
  }
  if (req.query.clinica) query.clinica = req.query.clinica;
  const filtro = { tipo: 'medico' };
  if (t) filtro.especialidade = { $in: t.especialidades };
  else if (req.query.especialidade) filtro.especialidade = req.query.especialidade;
  if (req.query.medico) filtro._id = req.query.medico;
  const medicos = await User.find(filtro).select('_id clinicas');
  query.medico = { $in: medicos.map(m => m._id) };
  const consultas = await Appointment.find(query).sort({ data_consulta: 1, horario_consulta: 1 })
    .populate({ path: 'medico', populate: { path: 'especialidade' } }).populate('clinica');
  res.json(consultas.filter(c => instante(c) > new Date() && c.clinica &&
    medicos.find(m => String(m._id) === String(c.medico?._id))?.clinicas.some(id => String(id) === String(c.clinica._id)))
    .map(c => formatConsulta(c)));
}
module.exports = { agendar, trocar, cancelar, disponiveis, instante };
