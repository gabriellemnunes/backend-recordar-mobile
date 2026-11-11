const mongoose = require('mongoose');

// Contrato de leitura para o serviço de IA. Não recebe resultados do aplicativo.
const schema = new mongoose.Schema({
  paciente: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  especialidades: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Specialty' }],
  resumo: { type: String, required: true },
  urgencia: { type: Boolean, required: true },
  concluida: { type: Boolean, required: true }
}, { timestamps: true });
module.exports = mongoose.model('PreTriage', schema);
