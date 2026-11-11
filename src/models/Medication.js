const mongoose = require("mongoose");

const medicationSchema = new mongoose.Schema({
  consulta: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },
  medico: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  paciente: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  nome_remedio: { type: String, required: true, trim: true },
  horario_remedio: { type: String, required: true },
  quantidade_remedio: { type: String, required: true, trim: true },
  data_inicio: { type: String, default: null },
  data_fim: { type: String, default: null },
  dias_tomados: { type: [String], default: [] },
  tomado_em: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model("Medication", medicationSchema);
