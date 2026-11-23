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

function validarFrequencia(body, parcial = false) {
  for (const [campo, minimo, maximo] of [["tomadas_por_dia", 1, 24], ["intervalo_minimo_minutos", 0, 1439]]) {
    if (body[campo] === undefined && parcial) continue;
    const valor = body[campo] === undefined ? (campo === "tomadas_por_dia" ? 1 : 0) : body[campo];
    if (!Number.isInteger(valor) || valor < minimo || valor > maximo)
      return `${campo} deve ser um inteiro entre ${minimo} e ${maximo}.`;
  }
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

  if (dia) {
    filtro.$and = [
      { $or: [{ data_inicio: { $lte: dia } }, { data_inicio: null }] },
      { $or: [{ data_fim: { $gte: dia } }, { data_fim: null }, { data_fim: "" }] }
    ];
  }

  const remedios = await populado(Medication.find(filtro).sort({ horario_remedio: 1, nome_remedio: 1 }));
  if (!dia) {
    remedios.sort((a, b) => ORDEM_SITUACAO[situacaoRemedio(a)] - ORDEM_SITUACAO[situacaoRemedio(b)]);
  }
  res.json(remedios.map((r) => formatRemedio(r, dia || hoje())));
}

async function create(req, res) {
  const { id_consulta } = req.body;
  if (!id_consulta) return res.status(400).json({ message: "id_consulta é obrigatório." });
  const erro = validar(req.body) || validarFrequencia(req.body) || validarPeriodo(req.body.data_inicio, req.body.data_fim);
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
    tomadas_por_dia: req.body.tomadas_por_dia ?? 1,
    intervalo_minimo_minutos: req.body.intervalo_minimo_minutos ?? 0,
    data_inicio: req.body.data_inicio,
    data_fim: req.body.data_fim
  });
  const r = await populado(Medication.findById(criado._id));
  res.status(201).json(formatRemedio(r));
}

async function update(req, res) {
  const erro = validar(req.body, true) || validarFrequencia(req.body, true);
  if (erro) return res.status(400).json({ message: erro });

  const r = await Medication.findOne({ _id: req.params.id, medico: req.user.id });
  if (!r) return res.status(404).json({ message: "Remédio não encontrado." });

  if (req.body.data_inicio !== undefined || req.body.data_fim !== undefined) {
    const erroPeriodo = validarPeriodo(req.body.data_inicio ?? r.data_inicio, req.body.data_fim ?? r.data_fim);
    if (erroPeriodo) return res.status(400).json({ message: erroPeriodo });
  }

  for (const campo of ["nome_remedio", "horario_remedio", "quantidade_remedio", "data_inicio", "data_fim", "tomadas_por_dia", "intervalo_minimo_minutos"]) {
    if (req.body[campo] !== undefined) r[campo] = req.body[campo];
  }
  await r.save();
  res.json(formatRemedio(await populado(Medication.findById(r._id))));
}

async function tomar(req, res) {
  // A data do registro vem do servidor, evitando antecipar ou retroceder o limite diário.
  const dia = hoje();
  if (req.body.dia !== undefined && req.body.dia !== dia)
    return res.status(400).json({ message: "Só é possível registrar tomadas do dia atual." });
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const r = await Medication.findOne({ _id: req.params.id, paciente: req.user.id });
    if (!r) return res.status(404).json({ message: "Remédio não encontrado." });
    if (situacaoRemedio(r, dia) !== "em_uso")
      return res.status(400).json({ message: "Este remédio não está no período de uso hoje." });
    const registros = r.registros_tomadas || [];
    // Migra marcações antigas para permitir correção sem perder o histórico.
    if (!registros.length && ((r.dias_tomados || []).includes(dia) || r.tomado_em === dia)) {
      registros.push({ dia, registrado_em: r.updatedAt || new Date() });
    }
    const ativos = registros.filter(x => x.dia === dia && !x.corrigido_em);
    const limite = r.tomadas_por_dia || 1;
    if (req.body.tomado === false) {
      const ultimo = ativos[ativos.length - 1];
      if (!ultimo) return res.status(409).json({ message: "Não há registro ativo para corrigir." });
      if (req.body.registro_id && String(ultimo._id) !== String(req.body.registro_id))
        return res.status(409).json({ message: "O registro informado não é o último registro ativo." });
      ultimo.corrigido_em = new Date();
    } else {
      if (ativos.length >= limite)
        return res.status(409).json({ message: "Limite diário prescrito atingido." });
      const ultimo = ativos[ativos.length - 1];
      const intervalo = (r.intervalo_minimo_minutos || 0) * 60000;
      if (ultimo && Date.now() - new Date(ultimo.registrado_em).getTime() < intervalo)
        return res.status(409).json({ message: "Aguarde o intervalo mínimo prescrito entre os registros." });
      registros.push({ dia, registrado_em: new Date() });
    }
    r.registros_tomadas = registros;
    r.dias_tomados = (r.dias_tomados || []).filter(d => d !== dia);
    if (registros.some(x => x.dia === dia && !x.corrigido_em)) r.dias_tomados.push(dia);
    r.tomado_em = null;
    try {
      await r.save();
      return res.json(formatRemedio(await populado(Medication.findById(r._id)), dia));
    } catch (error) {
      if (error.name !== "VersionError") throw error;
    }
  }
  return res.status(409).json({ message: "Registro alterado simultaneamente. Tente novamente." });
}

async function remove(req, res) {
  const filtro = { _id: req.params.id };
  if (req.user.tipo === "medico") filtro.medico = req.user.id;
  const r = await Medication.findOneAndDelete(filtro);
  if (!r) return res.status(404).json({ message: "Remédio não encontrado." });
  res.json({ message: "Remédio excluído com sucesso." });
}

module.exports = { list, create, update, tomar, remove };
