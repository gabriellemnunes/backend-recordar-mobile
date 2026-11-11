const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  medico: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  clinica: { type: mongoose.Schema.Types.ObjectId, ref: "Clinic", required: true },
  paciente: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  data_consulta: { type: String, required: true },
  horario_consulta: { type: String, required: true },
  status: { type: String, enum: ["disponivel", "agendada"], default: "disponivel" },

  pre_triagem: { type: mongoose.Schema.Types.ObjectId, ref: "PreTriage", default: null },
  queixa_principal: { type: String, default: "" },
  sintomas: { type: String, default: "" },
  inicio_sintomas: { type: String, default: "" },

  aviso_troca: { type: Boolean, default: false },
  troca_data_anterior: { type: String, default: "" },
  troca_horario_anterior: { type: String, default: "" }
}, { timestamps: true });

appointmentSchema.index({ medico: 1, data_consulta: 1, horario_consulta: 1 }, { unique: true });

module.exports = mongoose.model("Appointment", appointmentSchema);
