const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");
const Conversation = require("../models/ChatConversation");
const Quota = require("../models/ChatQuota");
const PreTriage = require("../models/PreTriage");
const Specialty = require("../models/Specialty");
const ai = require("../services/chatAI");
const { erroHttp } = require("../middlewares/errorHandler");
const questions = {
  duracao: "Há quanto tempo você está sentindo isso?",
  intensidade:
    "De 0 a 10, qual é a intensidade do que está sentindo? Responda com um número.",
  complementos:
    "Há outros sintomas ou alguma informação importante, como alergias ou condições de saúde? Se não houver, escreva “não”.",
};
function resposta(c) {
  return {
    id_conversa: String(c._id),
    resposta: c.mensagens.at(-1)?.text || "",
    id_pre_triagem: c.pre_triagem ? String(c.pre_triagem) : null,
    urgencia: c.urgencia,
    concluida: c.etapa === "concluida",
    etapa: c.etapa,
    aviso: ai.AVISO,
  };
}
async function resultado(c, output, source) {
  const summary = `Sintomas informados: ${output.sintomas.join(", ")}. Duração: ${c.duracao || "não informada"}. Intensidade: ${c.intensidade ?? "não informada"}.`;
  const triage = await PreTriage.findOneAndUpdate(
    { conversa: c._id },
    {
      $setOnInsert: {
        conversa: c._id,
        paciente: c.paciente,
        especialidades: output.urgencia ? [] : output.especialidades,
        resumo: summary,
        urgencia: output.urgencia,
        concluida: true,
        sintomas: output.sintomas,
        duracao: c.duracao || "",
        intensidade: c.intensidade ?? null,
        observacoes: c.complementos || "",
        alertas: output.urgencia ? [ai.ALERTA] : [],
        origem: source,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
  c.pre_triagem = triage._id;
  c.urgencia = output.urgencia;
  c.etapa = "concluida";
  if (output.urgencia) return ai.ALERTA;
  const names = await Specialty.find({
    _id: { $in: output.especialidades },
  }).select("nome_especialidade");
  return `Pré-triagem salva. Especialidades relacionadas: ${names.map((x) => x.nome_especialidade).join(", ")}. Você pode conferir as opções de consulta. ${ai.AVISO}`;
}
async function enviar(req, res) {
  const { mensagem, id_conversa, consentimento_ia } = req.body || {};
  if (
    typeof mensagem !== "string" ||
    !mensagem.trim() ||
    mensagem.length > 2000
  )
    throw erroHttp(400, "Escreva uma mensagem de até 2.000 caracteres.");
  if (id_conversa && !mongoose.isObjectIdOrHexString(id_conversa))
    throw erroHttp(400, "Conversa inválida.");
  if (!id_conversa && consentimento_ia !== true)
    throw erroHttp(400, "Confirme o uso do assistente antes de iniciar.");
  const bucket = `${req.user.id}:${Math.floor(Date.now() / 3600000)}`;
  const q = await Quota.findOneAndUpdate(
    { chave: bucket },
    {
      $inc: { total: 1 },
      $setOnInsert: { expira: new Date(Date.now() + 7200000) },
    },
    { upsert: true, new: true },
  );
  if (q.total > 40)
    throw erroHttp(
      429,
      "Você atingiu o limite de mensagens por hora. Tente mais tarde.",
    );
  let c;
  if (id_conversa) {
    c = await Conversation.findOne({ _id: id_conversa, paciente: req.user.id });
    if (!c) throw erroHttp(404, "Conversa não encontrada.");
    if (c.etapa === "concluida") return res.json(resposta(c));
  } else
    c = await Conversation.create({
      paciente: req.user.id,
      sintomas_informados: mensagem.trim(),
    });
  if (c.mensagens.length >= 24)
    throw erroHttp(
      400,
      "Esta conversa atingiu o limite. Inicie uma nova conversa.",
    );
  const token = randomUUID();
  c = await Conversation.findOneAndUpdate(
    {
      _id: c._id,
      paciente: req.user.id,
      $or: [
        { processando_ate: null },
        { processando_ate: { $lt: new Date() } },
      ],
    },
    {
      $set: {
        processando_ate: new Date(Date.now() + 120000),
        processando_token: token,
      },
    },
    { new: true },
  );
  if (!c)
    throw erroHttp(
      409,
      "Aguarde a resposta anterior antes de enviar outra mensagem.",
    );
  try {
    let text;
    const input = mensagem.trim();
    if (ai.sinalAlerta(input)) {
      c.mensagens.push({ role: "user", text: input });
      text = await resultado(
        c,
        { sintomas: [input.slice(0, 300)], especialidades: [], urgencia: true },
        "regra_seguranca",
      );
    } else if (!id_conversa) {
      c.mensagens.push({ role: "user", text: input });
      text = questions.duracao;
    } else if (c.etapa === "duracao") {
      if (input.length > 120)
        throw erroHttp(400, "Resuma a duração em até 120 caracteres.");
      c.duracao = input;
      c.etapa = "intensidade";
      c.mensagens.push({ role: "user", text: input });
      text = questions.intensidade;
    } else if (c.etapa === "intensidade") {
      if (!/^(10|[0-9])$/.test(input))
        throw erroHttp(400, "Informe um número inteiro de 0 a 10.");
      c.intensidade = Number(input);
      c.etapa = "complementos";
      c.mensagens.push({ role: "user", text: input });
      text = questions.complementos;
    } else {
      c.complementos = input;
      const catalog = await Specialty.find()
        .select("_id nome_especialidade")
        .limit(200);
      if (!catalog.length) {
        console.warn("[chat-triage]", { category: "empty_specialty_catalog", status: 503 });
        throw erroHttp(
          503,
          "Não há especialidades cadastradas para concluir a pré-triagem.",
        );
      }
      const output = await ai.interpretar(
        {
          sintomas: c.sintomas_informados,
          duracao: c.duracao,
          intensidade: c.intensidade,
          complementos: input,
        },
        catalog,
      );
      c.mensagens.push({ role: "user", text: input });
      text = await resultado(c, output, "servico_ia");
    }
    c.mensagens.push({ role: "assistant", text });
    await c.save();
    res.json(resposta(c));
  } finally {
    await Conversation.updateOne(
      { _id: c._id, processando_token: token },
      { $set: { processando_ate: null }, $unset: { processando_token: 1 } },
    );
  }
}
async function historico(req, res) {
  if (!mongoose.isObjectIdOrHexString(req.params.id))
    throw erroHttp(400, "Conversa inválida.");
  const c = await Conversation.findOne({
    _id: req.params.id,
    paciente: req.user.id,
  });
  if (!c) throw erroHttp(404, "Conversa não encontrada.");
  res.json({
    ...resposta(c),
    mensagens: c.mensagens.map((x) => ({ role: x.role, text: x.text })),
  });
}
module.exports = { enviar, historico };
