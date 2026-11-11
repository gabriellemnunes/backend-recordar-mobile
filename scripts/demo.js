// Dados fictícios em banco descartável. Nunca conecta ao banco oficial.
const path = require('node:path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
process.env.JWT_SECRET = require('node:crypto').randomBytes(32).toString('hex');
const app = require('../src/server');
const User = require('../src/models/User');
const Clinic = require('../src/models/Clinic');
const Specialty = require('../src/models/Specialty');
const Appointment = require('../src/models/Appointment');
const PreTriage = require('../src/models/PreTriage');
async function main() {
  const fs = require('node:fs');
  fs.mkdirSync(path.resolve('../../work'), { recursive: true });
  const dbPath = fs.mkdtempSync(path.resolve('../../work/mongo-demo-'));
  const repl = await MongoMemoryReplSet.create({ instanceOpts: [{ dbPath }], replSet: { count: 1 }, binary: { version: '7.0.24', downloadDir: path.resolve('../../work/mongodb-binaries') } });
  await mongoose.connect(repl.getUri());
  const specialty = await Specialty.create({ nome_especialidade: 'Clínica médica' });
  const clinic = await Clinic.create({ nome_clinica: 'Clínica Demonstração', endereco_clinica: 'Endereço fictício para demonstração' });
  const password = await bcrypt.hash('RecordarDemo123!', 10);
  const [patient, doctor] = await User.create([
    { tipo: 'paciente', nome_usuario: 'Paciente de demonstração', email: 'paciente@demo.recordar', senha: password },
    { tipo: 'medico', nome_usuario: 'Profissional de demonstração', email: 'medico@demo.recordar', senha: password, crm: 'DEMO', clinicas: [clinic.id], especialidade: specialty.id }
  ]);
  await Promise.all([User.init(), Appointment.init()]);
  for (let day = 1; day <= 7; day++) {
    const date = new Date(Date.now() + day * 86400000);
    const dateString = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
    for (const time of ['09:00', '10:00', '14:00']) await Appointment.create({ medico: doctor.id, clinica: clinic.id, data_consulta: dateString, horario_consulta: time });
  }
  await PreTriage.create({ paciente: patient.id, especialidades: [specialty.id], resumo: 'Resultado fictício para demonstrar integração. Não foi gerado por IA.', urgencia: false, concluida: true });
  const server = app.listen(3000, '0.0.0.0', () => console.log('DEMONSTRAÇÃO: API na porta 3000. Paciente: paciente@demo.recordar | Senha: RecordarDemo123!\nBanco temporário: os dados somem ao encerrar.'));
  async function stop() { server.close(); await mongoose.disconnect(); await repl.stop(); process.exit(0); }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
main().catch(error => { console.error(error); process.exit(1); });
