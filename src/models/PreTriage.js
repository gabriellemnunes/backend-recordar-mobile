const mongoose = require('mongoose');

// Escrita restrita ao serviço de IA; leitura restrita ao paciente dono.
const schema = new mongoose.Schema({
  paciente: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  conversa: {type:mongoose.Schema.Types.ObjectId,ref:'ChatConversation',default:undefined},
  especialidades: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Specialty' }],
  resumo: { type: String, required: true, trim: true, maxlength: 2000 },
  urgencia: { type: Boolean, required: true },
  concluida: { type: Boolean, required: true },
  sintomas: { type: [String], default: [] },
  duracao: { type: String, default: '', maxlength: 120 },
  intensidade: { type: Number, min: 0, max: 10, default: null },
  observacoes: { type: String, default: '', maxlength: 2000 },
  alertas: { type: [String], default: [] },
  origem: { type: String, enum: ['servico_ia','regra_seguranca'], default: 'servico_ia' }
}, { timestamps: true });

schema.index({ paciente: 1, createdAt: -1 });
schema.index({conversa:1},{unique:true,sparse:true});
module.exports = mongoose.model('PreTriage', schema);
