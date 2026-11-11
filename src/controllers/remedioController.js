const Medication = require("../models/Medication");
const Appointment = require("../models/Appointment");
const { formatRemedio, situacaoRemedio } = require("../config/format");
const { horaValida, dataValida, hoje } = require("../config/datas");

const populado = (query) => query.populate("medico").populate("paciente");

function validar({ nome_remedio, horario_remedio, quantidade_remedio }, parcial = false) {
  if (!parcial || nome_remedio !== undefined) {
    if (!String(nome_remedio ?? "").trim()) return "nome_remedio é obrigatório.";
  }
  if (!parcial || horario_remedio !== undefined) {
    if (!horaValida(horario_remedio)) return "horario_remedio deve estar no formato HH:MM.";
  }
  if (!parcial || quantidade_remedio !== undefined) {
    if (!String(quantidade_remedio ?? "").trim()) return "quantidade_remedio é obrigatória.";
  }
  return null;
}

function validarPeriodo(data_inicio, data_fim) {
  if (!dataValida(data_inicio)) return "data_inicio é obrigatória e deve estar no formato AAAA-MM-DD.";
  if (!dataValida(data_fim)) return "data_fim é obrigatória e deve estar no formato AAAA-MM-DD.";
  if (data_fim < data_inicio) return "A data final do remédio não pode ser antes da data inicial.";
  return null;
}

const ORDEM_SITUACAO = { em_uso: 0, futuro: 1, encerrado: 2 };

async function list(req, res) {
  const filtro = {};
  if (req.user.tipo === "paciente") filtro.paciente = req.user.id;
  if (req.user.tipo === "medico") filtro.medico = req.user.id;
  if (req.user.tipo !== "paciente") {
    if (req.query.consulta) filtro.consulta = req.query.consulta;
    if (req.query.paciente) filtro.paciente = req.query.paciente;
  }
  const { dia } = req.query;
  if (dia !== undefined && !dataValida(dia)) {
    return res.status(400).json({ message: "dia deve estar no formato AAAA-MM-DD." });
  }

  let remedios = await populado(Medication.find(filtro).sort({ horario_remedio: 1, nome_remedio: 1 }));
  if (dia) {
    remedios = remedios.filter((r) => situacaoRemedio(r, dia) === "em_uso");
  } else {
    remedios.sort((a, b) => ORDEM_SITUACAO[situacaoRemedio(a)] - ORDEM_SITUACAO[situacaoRemedio(b)]);
  }
  res.json(remedios.map((r) => formatRemedio(r, dia || hoje())));
}

async function create(req, res) {
  const { id_consulta } = req.body;
  if (!id_consulta) return res.status(400).json({ message: "id_consulta é obrigatório." });
  const erro = validar(req.body) || validarPeriodo(req.body.data_inicio, req.body.data_fim);
  if (erro) return res.status(400).json({ message: erro });

  const consulta = await Appointment.findOne({ _id: id_consulta, medico: req.user.id, status: "agendada" });
  if (!consulta) {
    return res.status(404).json({ message: "Consulta agendada não encontrada para este médico." });
  }

  const criado = await Medication.create({
    consulta: consulta._id,
    medico: req.user.id,
    paciente: consulta.paciente,
    nome_remedio: req.body.nome_remedio,
    horario_remedio: req.body.horario_remedio,
    quantidade_remedio: req.body.quantidade_remedio,
    data_inicio: req.body.data_inicio,
    data_fim: req.body.data_fim
  });
  const r = await populado(Medication.findById(criado._id));
  res.status(201).json(formatRemedio(r));
}

async function update(req, res) {
  const erro = validar(req.body, true);
  if (erro) return res.status(400).json({ message: erro });

  const r = await Medication.findOne({ _id: req.params.id, medico: req.user.id });
  if (!r) return res.status(404).json({ message: "Remédio não encontrado." });

  if (req.body.data_inicio !== undefined || req.body.data_fim !== undefined) {
    const erroPeriodo = validarPeriodo(req.body.data_inicio ?? r.data_inicio, req.body.data_fim ?? r.data_fim);
    if (erroPeriodo) return res.status(400).json({ message: erroPeriodo });
  }

  for (const campo of ["nome_remedio", "horario_remedio", "quantidade_remedio", "data_inicio", "data_fim"]) {
    if (req.body[campo] !== undefined) r[campo] = req.body[campo];
  }
  await r.save();
  res.json(formatRemedio(await populado(Medication.findById(r._id))));
}

async function tomar(req, res) {
  const r = await Medication.findOne({ _id: req.params.id, paciente: req.user.id });
  if (!r) return res.status(404).json({ message: "Remédio não encontrado." });
  const dia = req.body.dia ?? hoje();
  if (!dataValida(dia)) return res.status(400).json({ message: "dia deve estar no formato AAAA-MM-DD." });
  if (situacaoRemedio(r, dia) !== "em_uso") {
    return res.status(400).json({ message: "Este remédio não está no período de uso nesse dia." });
  }

  const dias = new Set(r.dias_tomados || []);
  if (r.tomado_em) dias.add(r.tomado_em);
  if (req.body.tomado === false) dias.delete(dia);
  else dias.add(dia);
  r.dias_tomados = [...dias].sort();
  r.tomado_em = null;
  await r.save();
  res.json(formatRemedio(await populado(Medication.findById(r._id)), dia));
}

async function remove(req, res) {
  const filtro = { _id: req.params.id };
  if (req.user.tipo === "medico") filtro.medico = req.user.id;
  const r = await Medication.findOneAndDelete(filtro);
  if (!r) return res.status(404).json({ message: "Remédio não encontrado." });
  res.json({ message: "Remédio excluído com sucesso." });
}

module.exports = { list, create, update, tomar, remove };
