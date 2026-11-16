const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
process.env.JWT_SECRET = 'segredo-exclusivo-de-testes';
process.env.AI_SERVICE_TOKEN = 'segredo-interno-de-integracao-com-ia-para-testes-123';
const app = require('../src/server');
const User = require('../src/models/User');
const PreTriage = require('../src/models/PreTriage');
const Appointment = require('../src/models/Appointment');
const Specialty = require('../src/models/Specialty');
const Clinic = require('../src/models/Clinic');
const Medication = require('../src/models/Medication');
let repl, paciente, outro, medico, clinica, especialidade, consulta;
const bearer = (u) => `Bearer ${jwt.sign({ id: String(u._id) }, process.env.JWT_SECRET)}`;
const cabecalhoIA = { 'x-ai-service-token': process.env.AI_SERVICE_TOKEN };
const dadosIA = () => ({ paciente: paciente.id, especialidades: [especialidade.id], resumo: 'Dor de cabeÃ§a informada', urgencia: false, concluida: true, sintomas: ['dor de cabeÃ§a'], duracao: 'dois dias', intensidade: 3 });

before(async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  fs.mkdirSync(require('node:os').tmpdir(), { recursive: true });
  const dbPath = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mongo-bia-'));
  repl = await MongoMemoryReplSet.create({ instanceOpts: [{ dbPath }], replSet: { count: 1 }, binary: { version: '7.0.24', downloadDir: path.join(require('node:os').tmpdir(), 'recordar-mongodb-binaries') } });
  await mongoose.connect(repl.getUri());
  await Promise.all([User.init(), Appointment.init()]);
});
after(async () => { await mongoose.disconnect(); if (repl) await repl.stop(); });
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  especialidade = await Specialty.create({ nome_especialidade: 'ClÃ­nica mÃ©dica' });
  clinica = await Clinic.create({ nome_clinica: 'ClÃ­nica Teste' });
  [paciente, outro, medico] = await User.create([
    { tipo: 'paciente', nome_usuario: 'Paciente', email: 'paciente@test.dev', senha: 'testes' },
    { tipo: 'paciente', nome_usuario: 'Outro paciente', email: 'outro@test.dev', senha: 'testes' },
    { tipo: 'medico', nome_usuario: 'MÃ©dico', email: 'medico@test.dev', senha: 'testes', especialidade: especialidade.id, clinicas: [clinica.id] }
  ]);
  consulta = await Appointment.create({ medico: medico.id, clinica: clinica.id, paciente: paciente.id, status: 'agendada', data_consulta: '2026-11-15', horario_consulta: '11:00', queixa_principal: 'Dor de cabeÃ§a' });
});

test('somente serviÃ§o autenticado cadastra resultado; JWT mobile nÃ£o basta', async () => {
  const r1 = await request(app).post('/api/pre-triagens').set('Authorization', bearer(paciente)).send(dadosIA());
  assert.equal(r1.status, 401);
  const r2 = await request(app).post('/api/pre-triagens').set('x-ai-service-token', 'invalido').send(dadosIA());
  assert.equal(r2.status, 401);
  const r3 = await request(app).post('/api/pre-triagens').set(cabecalhoIA).send(dadosIA());
  assert.equal(r3.status, 201);
  assert.equal(r3.body.paciente, paciente.id);
  assert.equal(r3.body.intensidade, 3);
  assert.equal(r3.body.urgencia, false);
});

test('valida especialidade, paciente e tipos de dados antes de salvar', async () => {
  const r1 = await request(app).post('/api/pre-triagens').set(cabecalhoIA).send({ ...dadosIA(), intensidade: 100 });
  assert.equal(r1.status, 400);
  const r2 = await request(app).post('/api/pre-triagens').set(cabecalhoIA).send({ ...dadosIA(), especialidades: [new mongoose.Types.ObjectId().toString()] });
  assert.equal(r2.status, 400);
  const r3 = await request(app).post('/api/pre-triagens').set(cabecalhoIA).send({ ...dadosIA(), paciente: medico.id });
  assert.equal(r3.status, 404);
  assert.equal(await PreTriage.countDocuments(), 0);
});

test('paciente lÃª apenas suas prÃ©-triagens, inclusive no detalhe', async () => {
  const criacao = await request(app).post('/api/pre-triagens').set(cabecalhoIA).send(dadosIA());
  const id = criacao.body.id;
  assert.equal((await request(app).get('/api/pre-triagens').set('Authorization', bearer(paciente))).body.length, 1);
  assert.deepEqual((await request(app).get('/api/pre-triagens').set('Authorization', bearer(outro))).body, []);
  assert.equal((await request(app).get(`/api/pre-triagens/${id}`).set('Authorization', bearer(outro))).status, 404);
  assert.equal((await request(app).get(`/api/pre-triagens/${id}`).set('Authorization', bearer(medico))).status, 403);
});

test('consulta realizada fica no histÃ³rico com vÃ­nculo de prÃ©-triagem e remÃ©dios', async () => {
  const t = await PreTriage.create({ paciente: paciente.id, especialidades: [especialidade.id], resumo: 'Dor de cabeÃ§a', urgencia: false, concluida: true });
  consulta.pre_triagem = t.id;
  await consulta.save();
  const med = await Medication.create({ consulta: consulta.id, medico: medico.id, paciente: paciente.id, nome_remedio: 'MedicaÃ§Ã£o fictÃ­cia', horario_remedio: '08:00', quantidade_remedio: '1' });
  const resposta = await request(app).put(`/api/consultas/${consulta.id}/realizada`).set('Authorization', bearer(medico));
  assert.equal(resposta.status, 200);
  const realizada = await Appointment.findById(consulta.id);
  assert.equal(realizada.status, 'realizada');
  assert.equal(String(realizada.pre_triagem), t.id);
  assert.ok(realizada.realizada_em);
  assert.equal(String((await Medication.findById(med.id)).consulta), consulta.id);
  const historico = await request(app).get('/api/consultas/historico').set('Authorization', bearer(paciente));
  assert.equal(historico.status, 200);
  assert.equal(historico.body.length, 1);
  assert.equal(historico.body[0].id_pre_triagem, t.id);
  assert.equal((await request(app).get('/api/consultas/historico').set('Authorization', bearer(outro))).body.length, 0);
  assert.equal((await request(app).get('/api/consultas').set('Authorization', bearer(paciente))).body.length, 0);
  assert.equal((await request(app).put(`/api/consultas/${consulta.id}/realizada`).set('Authorization', bearer(medico))).status, 409);
});

test('excluir paciente remove histÃ³rico e prÃ©-triagem em vez de liberar consulta antiga', async () => {
  await PreTriage.create({ paciente: paciente.id, especialidades: [especialidade.id], resumo: 'Teste', urgencia: false, concluida: true });
  await request(app).put(`/api/consultas/${consulta.id}/realizada`).set('Authorization', bearer(medico));
  const resposta = await request(app).delete('/api/users/me').set('Authorization', bearer(paciente));
  assert.equal(resposta.status, 200);
  assert.equal(await Appointment.countDocuments({ status: 'realizada' }), 0);
  assert.equal(await PreTriage.countDocuments({ paciente: paciente.id }), 0);
});
