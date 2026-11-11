const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function hoje() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function dataValida(texto) {
  if (typeof texto !== "string" || !REGEX_DATA.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

function horaValida(texto) {
  return typeof texto === "string" && REGEX_HORA.test(texto);
}

function calcularIdade(data_nascimento) {
  if (!dataValida(data_nascimento)) return null;
  const [ano, mes, dia] = data_nascimento.split("-").map(Number);
  const [anoH, mesH, diaH] = hoje().split("-").map(Number);
  let idade = anoH - ano;
  if (mesH < mes || (mesH === mes && diaH < dia)) idade -= 1;
  return idade;
}

module.exports = { hoje, dataValida, horaValida, calcularIdade };
