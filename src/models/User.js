const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  booking_revision: { type: Number, default: 0 },
  tipo: { type: String, enum: ["paciente", "medico", "administrador"], required: true },
  nome_usuario: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  senha: { type: String, required: true },
  telefone: { type: String, default: "", trim: true },

  data_nascimento: { type: String, default: null },
  anamnese_preenchida: { type: Boolean, default: false },
  condicoes_saude: { type: String, default: "" },
  alergias: { type: String, default: "" },
  medicamentos_em_uso: { type: String, default: "" },

  crm: { type: String, default: null, trim: true },
  especialidade: { type: mongoose.Schema.Types.ObjectId, ref: "Specialty", default: null },
  clinicas: [{ type: mongoose.Schema.Types.ObjectId, ref: "Clinic" }]
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
