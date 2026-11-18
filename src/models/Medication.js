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
  tomado_em: { type: String, default: null },
  tomadas_por_dia: { type: Number, default: 1, min: 1, max: 24 },
  intervalo_minimo_minutos: { type: Number, default: 0, min: 0, max: 1439 },
  registros_tomadas: [{
    dia: { type: String, required: true },
    registrado_em: { type: Date, required: true },
    corrigido_em: { type: Date, default: null }
  }]
}, { timestamps: true, optimisticConcurrency: true });

module.exports = mongoose.model("Medication", medicationSchema);
