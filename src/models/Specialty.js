const mongoose = require("mongoose");

const specialtySchema = new mongoose.Schema({
  nome_especialidade: { type: String, required: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.model("Specialty", specialtySchema);
