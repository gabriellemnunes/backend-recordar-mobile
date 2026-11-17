const { erroHttp } = require("../middlewares/errorHandler");

function validarFotoPerfil(value) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 280000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw erroHttp(400, "Escolha uma foto JPEG de até 200 KB.");
  const data = Buffer.from(value.split(",")[1], "base64");
  if (data.length > 200 * 1024 || data.length < 5 || data[0] !== 255 || data[1] !== 216 || data[2] !== 255 || data[data.length - 2] !== 255 || data[data.length - 1] !== 217)
    throw erroHttp(400, "A foto precisa ser uma imagem JPEG válida de até 200 KB.");
  return value;
}
module.exports = { validarFotoPerfil };
