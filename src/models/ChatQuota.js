const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  chave: { type: String, unique: true },
  total: { type: Number, default: 0 },
  expira: Date,
});
schema.index({ expira: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model("ChatQuota", schema);
