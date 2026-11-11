const mongoose = require("mongoose");

const clinicSchema = new mongoose.Schema({
  nome_clinica: { type: String, required: true, trim: true },
  endereco_clinica: { type: String, default: "", trim: true },
  telefone_clinica: { type: String, default: "", trim: true }
}, { timestamps: true });

module.exports = mongoose.model("Clinic", clinicSchema);
