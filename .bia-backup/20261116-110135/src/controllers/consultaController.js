const Appointment = require("../models/Appointment");
const Medication = require("../models/Medication");
const { formatConsulta, situacaoRemedio } = require("../config/format");
const { hoje, dataValida, horaValida, calcularIdade } = require("../config/datas");
const User = require("../models/User");
const { idValido, buscaPorTexto } = require("../config/vinculos");
 
const CAMPOS_ANAMNESE = ["queixa_principal", "sintomas", "inicio_sintomas"];
const SEM_AVISO = { aviso_troca: false, troca_data_anterior: "", troca_horario_anterior: "" };
const ORDEM = { data_consulta: 1, horario_consulta: 1 };
 
const populada = (query) => query
  .populate({ path: "medico", populate: { path: "especialidade" } })
  .populate("paciente")
  .populate("clinica");
const ehDono = (id, req) => id && id.toString() === req.user.id;
 
async function list(req, res) {
  const filtro = {};
  if (req.user.tipo === "paciente") {
    filtro.paciente = req.user.id;
    filtro.status = "agendada";
  } else {
    if (req.user.tipo === "medico") filtro.medico = req.user.id;
    if (["disponivel", "agendada"].includes(req.query.status)) filtro.status = req.query.status;
  }
 
  const consultas = await populada(Appointment.find(filtro).sort(ORDEM));
  const comAnamnese = req.user.tipo !== "administrador";
  res.json(consultas.map((c) => formatConsulta(c, { comAnamnese })));
}
 
async function disponiveis(req, res) {
  const filtro = { status: "disponivel", data_consulta: { $gte: hoje() } };
  const { medico, clinica, especialidade, data, nome } = req.query;
  if ([medico, clinica, especialidade].some((id) => id && !idValido(id))) return res.json([]);
 
  if (medico) filtro.medico = medico;
  if (clinica) filtro.clinica = clinica;
  if (data && dataValida(data) && data >= hoje()) filtro.data_consulta = data;
  if (especialidade || nome) {
    const quem = { tipo: "medico" };
    if (especialidade) quem.especialidade = especialidade;
    if (nome) quem.nome_usuario = buscaPorTexto(nome);
    const medicos = await User.find(quem).select("_id");
    const ids = medicos.map((m) => m._id).filter((id) => !medico || String(id) === medico);
    filtro.medico = { $in: ids };
  }
  const consultas = await populada(Appointment.find(filtro).sort(ORDEM));
  res.json(consultas.map((c) => formatConsulta(c)));
}
 
async function meusPacientes(req, res) {
  const busca = String(req.query.busca || "").toLowerCase();
  const confere = (u) => u && u.nome_usuario.toLowerCase().includes(busca);
 
  const [consultas, remedios] = await Promise.all([
    populada(Appointment.find({ medico: req.user.id, status: "agendada" }).sort(ORDEM)),
    Medication.find({ medico: req.user.id }).populate("paciente")
  ]);
 
  // Conta os remédios de cada paciente. "Ativos" são os que ainda não terminaram
  // (em uso hoje ou que ainda vão começar).
  const totalRemedios = {};
  const remediosAtivos = {};
  for (const r of remedios) {
    if (!r.paciente) continue;
    const id = r.paciente._id.toString();
    totalRemedios[id] = (totalRemedios[id] || 0) + 1;
    if (situacaoRemedio(r) !== "encerrado") remediosAtivos[id] = (remediosAtivos[id] || 0) + 1;
  }
 
  const lista = consultas
    .filter((c) => confere(c.paciente))
    .map((c) => {
      const f = formatConsulta(c);
      return {
        id_consulta: f.id,
        id_paciente: f.id_paciente,
        nome_paciente: f.nome_paciente,
        idade_paciente: f.idade_paciente,
        data_consulta: f.data_consulta,
        horario_consulta: f.horario_consulta,
        total_remedios: totalRemedios[String(f.id_paciente)] || 0,
        remedios_ativos: remediosAtivos[String(f.id_paciente)] || 0
      };
    });
 
  // Pacientes sem consulta agendada (ex.: depois de "Consulta realizada") continuam na lista
  // enquanto tiverem algum remédio deste médico que ainda não terminou. O médico segue
  // podendo editar ou excluir esses remédios. Quando a data final de todos passa, o paciente sai.
  const comConsulta = new Set(lista.map((p) => String(p.id_paciente)));
  const vistos = new Set();
  const semConsulta = [];
  for (const r of remedios) {
    const p = r.paciente;
    if (!p || !confere(p)) continue;
    const id = p._id.toString();
    if (comConsulta.has(id) || vistos.has(id) || !remediosAtivos[id]) continue;
    vistos.add(id);
    semConsulta.push({
      id_consulta: null,
      id_paciente: p._id,
      nome_paciente: p.nome_usuario,
      idade_paciente: calcularIdade(p.data_nascimento),
      data_consulta: null,
      horario_consulta: null,
      total_remedios: totalRemedios[id],
      remedios_ativos: remediosAtivos[id]
    });
  }
  semConsulta.sort((a, b) => a.nome_paciente.localeCompare(b.nome_paciente, "pt-BR"));
 
  res.json([...lista, ...semConsulta]);
}
 
async function getById(req, res) {
  const c = await populada(Appointment.findById(req.params.id));
  if (!c) return res.status(404).json({ message: "Consulta não encontrada." });
 
  const admin = req.user.tipo === "administrador";
  const participa = ehDono(c.medico?._id, req) || ehDono(c.paciente?._id, req);
  const livreParaPaciente = req.user.tipo === "paciente" && c.status === "disponivel";
  if (!admin && !participa && !livreParaPaciente) {
    return res.status(403).json({ message: "Acesso não autorizado." });
  }
  res.json(formatConsulta(c, { comAnamnese: participa }));
}
 
async function create(req, res) {
  const { data_consulta, id_clinica } = req.body;
  const pedidos = req.body.horarios !== undefined ? req.body.horarios : req.body.horario_consulta;
  const horarios = [...new Set(Array.isArray(pedidos) ? pedidos : [pedidos])].sort();
 
  const minhasClinicas = (req.user.doc.clinicas || []).map((c) => String(c._id));
  if (!minhasClinicas.length) {
    return res.status(400).json({ message: "Associe-se a uma clínica no seu Perfil antes de criar consultas." });
  }
  if (!id_clinica || !minhasClinicas.includes(String(id_clinica))) {
    return res.status(400).json({ message: "Escolha uma das clínicas em que você atende." });
  }
  if (!dataValida(data_consulta)) {
    return res.status(400).json({ message: "data_consulta deve estar no formato AAAA-MM-DD." });
  }
  if (!horarios.length || !horarios.every(horaValida)) {
    return res.status(400).json({ message: "Marque pelo menos um horário, no formato HH:MM." });
  }
  if (data_consulta < hoje()) {
    return res.status(400).json({ message: "Não é possível criar consulta em uma data que já passou." });
  }
 
  const existentes = await Appointment.find({ medico: req.user.id, data_consulta, horario_consulta: { $in: horarios } });
  const repetidos = existentes.map((c) => c.horario_consulta);
  const novos = horarios.filter((h) => !repetidos.includes(h));
  if (!novos.length) {
    return res.status(409).json({ message: "Você já tem consulta nesse dia e horário." });
  }
 
  const criadas = [];
  for (const horario_consulta of novos) {
    criadas.push(await Appointment.create({ medico: req.user.id, clinica: id_clinica, data_consulta, horario_consulta }));
  }
  const consultas = await populada(Appointment.find({ _id: { $in: criadas.map((c) => c._id) } }).sort(ORDEM));
 
  res.status(201).json({
    message: novos.length === 1 ? "1 horário criado." : `${novos.length} horários criados.`,
    consultas: consultas.map((c) => formatConsulta(c)),
    horarios_repetidos: repetidos.sort()
  });
}
 
function lerAnamnese(corpo) {
  const anamnese = {};
  for (const campo of CAMPOS_ANAMNESE) {
    anamnese[campo] = String(corpo[campo] ?? "").trim();
  }
  return anamnese;
}
 
async function agendar(req, res) {
  const anamnese = lerAnamnese(req.body);
  if (!anamnese.queixa_principal) {
    return res.status(400).json({ message: "queixa_principal é obrigatória." });
  }
 
  const livre = await Appointment.findOne({ _id: req.params.id, status: "disponivel" });
  if (!livre) return res.status(409).json({ message: "Esta consulta não está mais disponível." });
 
  const jaTem = await Appointment.exists({
    paciente: req.user.id, medico: livre.medico, data_consulta: livre.data_consulta, status: "agendada"
  });
  if (jaTem) {
    return res.status(409).json({ message: "Você já tem consulta com este profissional neste dia. Para mudar, use Trocar horário." });
  }
 
  const c = await populada(Appointment.findOneAndUpdate(
    { _id: req.params.id, status: "disponivel" },
    { $set: { ...anamnese, ...SEM_AVISO, paciente: req.user.id, status: "agendada" } },
    { new: true }
  ));
  if (!c) return res.status(409).json({ message: "Esta consulta não está mais disponível." });
  res.json(formatConsulta(c, { comAnamnese: true }));
}
 
async function trocar(req, res) {
  const { id_nova } = req.body;
  if (!idValido(id_nova) || id_nova === req.params.id) {
    return res.status(400).json({ message: "Escolha um novo horário." });
  }
 
  const atual = await Appointment.findOne({ _id: req.params.id, paciente: req.user.id, status: "agendada" });
  if (!atual) return res.status(404).json({ message: "Consulta não encontrada." });
 
  const destino = await Appointment.findOne({
    _id: id_nova, status: "disponivel", medico: atual.medico, data_consulta: { $gte: hoje() }
  });
  if (!destino) return res.status(409).json({ message: "Este horário não está mais disponível." });
 
  const jaTem = await Appointment.exists({
    _id: { $ne: atual._id },
    paciente: req.user.id, medico: atual.medico, data_consulta: destino.data_consulta, status: "agendada"
  });
  if (jaTem) {
    return res.status(409).json({ message: "Você já tem outra consulta com este profissional nesse dia." });
  }
 
  const nova = await populada(Appointment.findOneAndUpdate(
    { _id: id_nova, status: "disponivel" },
    {
      $set: {
        ...lerAnamnese(atual),
        paciente: req.user.id,
        status: "agendada",
        aviso_troca: true,
        troca_data_anterior: atual.data_consulta,
        troca_horario_anterior: atual.horario_consulta
      }
    },
    { new: true }
  ));
  if (!nova) return res.status(409).json({ message: "Este horário não está mais disponível." });
 
  await Medication.updateMany({ consulta: atual._id }, { $set: { consulta: nova._id } });
  atual.paciente = null;
  atual.status = "disponivel";
  for (const campo of CAMPOS_ANAMNESE) atual[campo] = "";
  Object.assign(atual, SEM_AVISO);
  await atual.save();
 
  res.json(formatConsulta(nova, { comAnamnese: true }));
}
 
async function cancelar(req, res) {
  const c = await Appointment.findById(req.params.id);
  if (!c) return res.status(404).json({ message: "Consulta não encontrada." });
 
  const pode = req.user.tipo === "administrador" || ehDono(c.medico, req) || ehDono(c.paciente, req);
  if (!pode) return res.status(403).json({ message: "Acesso não autorizado." });
  if (c.status !== "agendada") {
    return res.status(400).json({ message: "Esta consulta não está agendada." });
  }
 
  await Medication.deleteMany({ consulta: c._id });
  c.paciente = null;
  c.status = "disponivel";
  for (const campo of CAMPOS_ANAMNESE) c[campo] = "";
  Object.assign(c, SEM_AVISO);
  await c.save();
 
  res.json({ message: "Consulta cancelada com sucesso." });
}
 
async function realizada(req, res) {
  const c = await Appointment.findOne({ _id: req.params.id, medico: req.user.id });
  if (!c) return res.status(404).json({ message: "Consulta não encontrada." });
  if (c.status !== "agendada") {
    return res.status(400).json({ message: "Só uma consulta agendada pode ser marcada como realizada." });
  }
  await c.deleteOne();
  res.json({ message: "Consulta realizada. Os remédios receitados continuam com o paciente." });
}
 
async function avisoVisto(req, res) {
  const c = await Appointment.findOneAndUpdate(
    { _id: req.params.id, medico: req.user.id },
    { $set: SEM_AVISO },
    { new: true }
  );
  if (!c) return res.status(404).json({ message: "Consulta não encontrada." });
  res.json({ message: "Aviso marcado como visto." });
}
 
async function remove(req, res) {
  const c = await Appointment.findById(req.params.id);
  if (!c) return res.status(404).json({ message: "Consulta não encontrada." });
  if (req.user.tipo !== "administrador" && !ehDono(c.medico, req)) {
    return res.status(403).json({ message: "Acesso não autorizado." });
  }
 
  await Medication.deleteMany({ consulta: c._id });
  await c.deleteOne();
  res.json({ message: "Consulta excluída com sucesso." });
}
 
module.exports = { list, disponiveis, meusPacientes, getById, create, agendar, trocar, avisoVisto, realizada, cancelar, remove };