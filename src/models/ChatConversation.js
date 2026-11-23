const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    paciente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    etapa: {
      type: String,
      enum: ["duracao", "intensidade", "complementos", "concluida"],
      default: "duracao",
    },
    mensagens: [
      { role: { type: String, enum: ["user", "assistant"] }, text: String },
    ],
    sintomas_informados: String,
    duracao: String,
    intensidade: Number,
    complementos: String,
    pre_triagem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PreTriage",
      default: null,
    },
    urgencia: { type: Boolean, default: false },
    processando_ate: { type: Date, default: null },
    processando_token: String,
  },
  { timestamps: true, optimisticConcurrency: true },
);
module.exports = mongoose.model("ChatConversation", schema);
