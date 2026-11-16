const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
process.env.JWT_SECRET = 'segredo-exclusivo-de-testes';
const app = require('../src/server');
const User = require('../src/models/User');
const Appointment = require('../src/models/Appointment');
const PreTriage = require('../src/models/PreTriage');
const Clinic = require('../src/models/Clinic');
const Specialty = require('../src/models/Specialty');
const Medication = require('../src/models/Medication');
let repl, p, other, m, clinic, specialty, triage, slot, token;
const auth = (user = p) => `Bearer ${jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET)}`;
const put = (id, action, body = {}, user = p) => request(app).put(`/api/consultas/${id}/${action}`).set('Authorization', auth(user)).send(body);
async function newSlot(time = '11:00', overrides = {}) {
  return Appointment.create({ medico: m._id, clinica: clinic._id, data_consulta: '2099-12-09', horario_consulta: time, ...overrides });
}
before(async () => {
  const path = require('node:path');
  const fs = require('node:fs');
  fs.mkdirSync(require('node:os').tmpdir(), { recursive: true });
  const dbPath = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mongo-test-'));
  repl = await MongoMemoryReplSet.create({ instanceOpts: [{ dbPath }], replSet: { count: 1 }, binary: { version: '7.0.24', downloadDir: path.join(require('node:os').tmpdir(), 'recordar-mongodb-binaries') } });
  await mongoose.connect(repl.getUri());
  await Promise.all([User.init(), Appointment.init()]);
});
after(async () => { await mongoose.disconnect(); if (repl) await repl.stop(); });
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map(c => c.deleteMany({})));
  specialty = await Specialty.create({ nome_especialidade: 'Cardiologia' });
  clinic = await Clinic.create({ nome_clinica: 'ClÃ­nica Teste' });
  [p, other, m] = await User.create([
    { tipo: 'paciente', nome_usuario: 'Paciente', email: 'p@test.dev', senha: 'teste' },
    { tipo: 'paciente', nome_usuario: 'Outro', email: 'o@test.dev', senha: 'teste' },
    { tipo: 'medico', nome_usuario: 'MÃ©dico', email: 'm@test.dev', senha: 'teste', clinicas: [clinic._id], especialidade: specialty._id }
  ]);
  token = auth();
  triage = await PreTriage.create({ paciente: p._id, especialidades: [specialty._id], resumo: 'Motivo coletado pela IA', urgencia: false, concluida: true });
  slot = await newSlot();
});
test('lista disponÃ­veis e filtra pela recomendaÃ§Ã£o salva', async () => {
  const r = await request(app).get(`/api/consultas/disponiveis?id_pre_triagem=${triage._id}`).set('Authorization', token);
  assert.equal(r.status, 200); assert.equal(r.body.length, 1); assert.equal(r.body[0].nome_especialidade, 'Cardiologia');
});
test('agenda com prÃ©-triagem e retorna vÃ­nculo ao paciente', async () => {
  const r = await put(slot.id, 'agendar', { id_pre_triagem: triage.id });
  assert.equal(r.status, 200); assert.equal(r.body.id_pre_triagem, triage.id);
  assert.equal(r.body.anamnese.queixa_principal, triage.resumo);
});
test('recusa prÃ©-triagem de outro paciente', async () => {
  assert.equal((await put(slot.id, 'agendar', { id_pre_triagem: triage.id }, other)).status, 404);
});
test('recusa urgÃªncia e prÃ©-triagem incompleta', async () => {
  triage.urgencia = true; await triage.save();
  assert.equal((await put(slot.id, 'agendar', { id_pre_triagem: triage.id })).status, 422);
  triage.urgencia = false; triage.concluida = false; await triage.save();
  assert.equal((await put(slot.id, 'agendar', { id_pre_triagem: triage.id })).status, 404);
});
test('recusa mÃ©dico fora da especialidade recomendada', async () => {
  m.especialidade = new mongoose.Types.ObjectId(); await m.save();
  assert.equal((await put(slot.id, 'agendar', { id_pre_triagem: triage.id })).status, 422);
});
test('permite agendamento direto com motivo e exige autenticaÃ§Ã£o', async () => {
  assert.equal((await request(app).put(`/api/consultas/${slot.id}/agendar`).send({ queixa_principal: 'Motivo' })).status, 401);
  assert.equal((await put(slot.id, 'agendar')).status, 400);
  assert.equal((await put(slot.id, 'agendar', { queixa_principal: 'Motivo' })).status, 200);
});
test('duas reservas simultÃ¢neas do mesmo horÃ¡rio tÃªm apenas um vencedor', async () => {
  const r = await Promise.all([put(slot.id, 'agendar', { queixa_principal: 'A' }), put(slot.id, 'agendar', { queixa_principal: 'B' }, other)]);
  assert.deepEqual(r.map(x => x.status).sort(), [200, 409]);
});
test('mesmo paciente nÃ£o reserva simultaneamente dois mÃ©dicos no mesmo horÃ¡rio', async () => {
  const m2 = await User.create({ tipo: 'medico', nome_usuario: 'MÃ©dico 2', email: 'm2@test.dev', senha: 'teste', clinicas: [clinic.id], especialidade: specialty.id });
  const second = await newSlot('11:00', { medico: m2.id });
  const r = await Promise.all([put(slot.id, 'agendar', { queixa_principal: 'A' }), put(second.id, 'agendar', { queixa_principal: 'B' })]);
  assert.deepEqual(r.map(x => x.status).sort(), [200, 409]);
});
test('troca horÃ¡rio no mesmo dia e preserva a prÃ©-triagem', async () => {
  await put(slot.id, 'agendar', { id_pre_triagem: triage.id });
  const second = await newSlot('12:00');
  const r = await put(slot.id, 'trocar', { id_nova: second.id });
  assert.equal(r.status, 200); assert.equal(r.body.id_pre_triagem, triage.id);
  const old = await Appointment.findById(slot.id); assert.equal(old.status, 'disponivel'); assert.equal(old.pre_triagem, null);
});
test('troca para destino ocupado mantÃ©m consulta original intacta', async () => {
  await put(slot.id, 'agendar', { queixa_principal: 'Motivo' });
  const second = await newSlot('12:00', { paciente: other.id, status: 'agendada' });
  assert.equal((await put(slot.id, 'trocar', { id_nova: second.id })).status, 409);
  assert.equal((await Appointment.findById(slot.id)).status, 'agendada');
});
test('cancelamento exige participaÃ§Ã£o e limpa dados antes de liberar o horÃ¡rio', async () => {
  await put(slot.id, 'agendar', { id_pre_triagem: triage.id });
  assert.equal((await put(slot.id, 'cancelar', {}, other)).status, 403);
  assert.equal((await put(slot.id, 'cancelar')).status, 200);
  const old = await Appointment.findById(slot.id);
  assert.equal(old.status, 'disponivel'); assert.equal(old.paciente, null); assert.equal(old.pre_triagem, null); assert.equal(old.queixa_principal, '');
  assert.equal((await put(slot.id, 'agendar', { queixa_principal: 'Novo paciente' }, other)).status, 200);
});
test('recusa horÃ¡rios passados e datas de filtro invÃ¡lidas', async () => {
  slot.data_consulta = '2020-01-01'; await slot.save();
  assert.equal((await put(slot.id, 'agendar', { queixa_principal: 'Motivo' })).status, 409);
  assert.equal((await request(app).get('/api/consultas/disponiveis?data=2099-02-30').set('Authorization', token)).status, 400);
  const r = await request(app).get('/api/consultas/disponiveis').set('Authorization', token);
  assert.equal(r.body.length, 0);
});
test('lista de prÃ©-triagens mostra apenas as do paciente autenticado', async () => {
  const r = await request(app).get('/api/pre-triagens').set('Authorization', auth(other));
  assert.equal(r.status, 200); assert.deepEqual(r.body, []);
});
test('cancelamento preserva prescriÃ§Ã£o e permite atualizar o medicamento desvinculado', async () => {
  await put(slot.id, 'agendar', { queixa_principal: 'Motivo' });
  const medication = await Medication.create({ consulta: slot.id, paciente: p.id, medico: m.id, nome_remedio: 'PrescriÃ§Ã£o fictÃ­cia', horario_remedio: '08:00', quantidade_remedio: '1', data_inicio: '2099-12-01', data_fim: '2099-12-31' });
  assert.equal((await put(slot.id, 'cancelar')).status, 200);
  const saved = await Medication.findById(medication.id);
  assert.equal(saved.consulta, null); saved.quantidade_remedio = '2'; await saved.save();
  assert.equal(await Medication.countDocuments({ paciente: p.id }), 1);
});
test('troca move a prescriÃ§Ã£o sem alterar paciente ou mÃ©dico', async () => {
  await put(slot.id, 'agendar', { queixa_principal: 'Motivo' });
  const medication = await Medication.create({ consulta: slot.id, paciente: p.id, medico: m.id, nome_remedio: 'PrescriÃ§Ã£o fictÃ­cia', horario_remedio: '08:00', quantidade_remedio: '1' });
  const second = await newSlot('12:00');
  assert.equal((await put(slot.id, 'trocar', { id_nova: second.id })).status, 200);
  const saved = await Medication.findById(medication.id);
  assert.equal(String(saved.consulta), second.id); assert.equal(String(saved.paciente), p.id); assert.equal(String(saved.medico), m.id);
});
