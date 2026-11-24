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
test('chat coleta dados, salva uma pre-triagem e isola conversas por paciente',async()=>{
  const ai=require('../src/services/chatAI'); const original=ai.interpretar;
  ai.interpretar=async()=>({sintomas:['dor no joelho'],especialidades:[especialidade.id],urgencia:false});
  try {
    const send=(body,u=paciente)=>request(app).post('/api/chat').set('Authorization',bearer(u)).send(body);
    assert.equal((await send({mensagem:'dor no joelho'})).status,400);
    const first=await send({mensagem:'dor no joelho',consentimento_ia:true});
    assert.equal(first.status,200); const id=first.body.id_conversa;
    assert.equal((await send({mensagem:'dois dias',id_conversa:id},outro)).status,404);
    assert.equal((await send({mensagem:'dois dias',id_conversa:id})).body.etapa,'intensidade');
    assert.equal((await send({mensagem:'100',id_conversa:id})).status,400);
    await send({mensagem:'4',id_conversa:id});
    const done=await send({mensagem:'não',id_conversa:id}); assert.equal(done.status,200); assert.ok(done.body.id_pre_triagem);
    const saved=await PreTriage.findById(done.body.id_pre_triagem); assert.equal(saved.paciente.toString(),paciente.id);assert.equal(saved.intensidade,4); assert.equal(saved.duracao,'dois dias');
    const repeated=await send({mensagem:'não',id_conversa:id}); assert.equal(repeated.body.id_pre_triagem,done.body.id_pre_triagem);
    assert.equal(await PreTriage.countDocuments({conversa:id}),1);
    assert.equal((await request(app).get('/api/chat/'+id).set('Authorization',bearer(outro))).status,404);
    const history=await request(app).get('/api/chat/'+id).set('Authorization',bearer(paciente));assert.equal(history.body.mensagens.length,8);
  } finally {ai.interpretar=original;}
});
test('sinopse longa conserva os sintomas completos e cabe no resumo persistido', async (t) => {
  const ai = require('../src/services/chatAI');
  const Conversation = require('../src/models/ChatConversation');
  const sintomas = Array.from({ length: 10 }, (_, i) => ('sintoma fictício ' + i + ' ').repeat(20).slice(0, 300));
  t.mock.method(ai, 'interpretar', async () => ({ sintomas, especialidades: [especialidade.id], urgencia: false }));
  const c = await Conversation.create({ paciente: paciente.id, etapa: 'complementos', duracao: 'dois dias', intensidade: 4 });
  const resposta = await request(app).post('/api/chat').set('Authorization', bearer(paciente)).send({ mensagem: 'não', id_conversa: c.id });
  assert.equal(resposta.status, 200);
  const triagem = await PreTriage.findById(resposta.body.id_pre_triagem);
  assert.deepEqual(triagem.sintomas, sintomas);
  assert.ok(triagem.resumo.length <= 2000);
  assert.match(triagem.resumo, /Duração: dois dias\. Intensidade: 4\.$/);
});
test('chat de urgencia alerta e persiste mesmo sem IA disponivel',async()=>{
 const ai=require('../src/services/chatAI'); const original=ai.interpretar;ai.interpretar=async()=>{throw Error('Não deve usar IA');};
 try {
  const result=await request(app).post('/api/chat').set('Authorization',bearer(paciente)).send({mensagem:'Estou com dor forte no peito e falta de ar',consentimento_ia:true});
  assert.equal(result.status,200);assert.equal(result.body.urgencia,true);assert.match(result.body.resposta,/192/);
  const t=await PreTriage.findById(result.body.id_pre_triagem);assert.equal(t.origem,'regra_seguranca');assert.deepEqual(t.especialidades,[]);
 }finally{ai.interpretar=original;}
});
test('chat exige paciente autenticado e respeita bloqueio de processamento',async()=>{
 assert.equal((await request(app).post('/api/chat').send({mensagem:'teste'})).status,401);
 assert.equal((await request(app).post('/api/chat').set('Authorization',bearer(medico)).send({mensagem:'teste'})).status,403);
 const c=await require('../src/models/ChatConversation').create({paciente:paciente.id,processando_ate:new Date(Date.now()+60000)});
 assert.equal((await request(app).post('/api/chat').set('Authorization',bearer(paciente)).send({mensagem:'teste',id_conversa:c.id})).status,409);
});
test('falha da IA conserva etapa para tentar novamente sem fabricar resultado',async()=>{
 const ai=require('../src/services/chatAI');const original=ai.interpretar;ai.interpretar=async()=>{throw require('../src/middlewares/errorHandler').erroHttp(503,'IA indisponível');};
 try{
 const c=await require('../src/models/ChatConversation').create({paciente:paciente.id,etapa:'complementos',sintomas_informados:'dor no joelho',duracao:'dois dias',intensidade:4});
 const r=await request(app).post('/api/chat').set('Authorization',bearer(paciente)).send({mensagem:'não',id_conversa:c.id});assert.equal(r.status,503);
 assert.equal(await PreTriage.countDocuments({conversa:c.id}),0);
 assert.equal((await require('../src/models/ChatConversation').findById(c.id)).processando_ate,null);
 }finally{ai.interpretar=original;}
});
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

test('foto do perfil persiste somente na própria conta e aceita remoção', async () => {
  const foto = 'data:image/jpeg;base64,' + Buffer.from([255,216,255,224,0,2,255,217]).toString('base64');
  const saved = await request(app).put('/api/users/me').set('Authorization', bearer(paciente)).send({ foto_perfil: foto });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.foto_perfil, foto);
  assert.equal((await request(app).get('/api/users/me').set('Authorization', bearer(paciente))).body.foto_perfil, foto);
  assert.equal((await request(app).get('/api/users/me').set('Authorization', bearer(outro))).body.foto_perfil, null);
  const invalid = await request(app).put('/api/users/me').set('Authorization', bearer(paciente)).send({ foto_perfil: 'data:image/svg+xml;base64,PHN2Zz4=' });
  assert.equal(invalid.status, 400);
  assert.equal((await User.findById(paciente.id)).foto_perfil, foto);
  assert.equal((await request(app).put('/api/users/me').set('Authorization', bearer(paciente)).send({ foto_perfil: null })).status, 200);
  assert.equal((await User.findById(paciente.id)).foto_perfil, null);
});

test('foto não aceita imagem acima do limite e exige autenticação', async () => {
  assert.equal((await request(app).put('/api/users/me').send({ foto_perfil: null })).status, 401);
  const huge = 'data:image/jpeg;base64,' + 'A'.repeat(280001);
  assert.equal((await request(app).put('/api/users/me').set('Authorization', bearer(paciente)).send({ foto_perfil: huge })).status, 400);
});

test('conta de paciente não obtém acesso de administrador alterando tipo ou token', async () => {
  const bcrypt = require('bcryptjs');
  await User.updateOne({ _id: paciente.id }, { senha: await bcrypt.hash('Teste123!', 10) });
  const login = await request(app).post('/api/auth/login').send({ email: paciente.email, senha: 'Teste123!', tipo: 'administrador' });
  assert.equal(login.status, 403);
  assert.equal(login.body.token, undefined);
  assert.equal((await request(app).get('/api/users').set('Authorization', bearer(paciente))).status, 403);
  const token = jwt.sign({ id: paciente.id, tipo: 'administrador' }, process.env.JWT_SECRET);
  assert.equal((await request(app).get('/api/users').set('Authorization', `Bearer ${token}`)).status, 403);
  assert.equal((await request(app).post('/api/auth/register').send({ tipo: 'administrador', email: 'adm@teste.com', senha: 'Teste123!' })).status, 403);
});

test('demonstração tem perfil com foto, agenda, histórico e medicamentos registrados', async () => {
  const demo = await require('../scripts/seed-demo')(new Date('2026-11-17T15:00:00Z'));
  assert.equal(demo.patient.nome_usuario, 'Maria Helena Santos');
  assert.match(demo.patient.foto_perfil, /^data:image\/jpeg;base64,/);
  assert.ok(Buffer.from(demo.patient.foto_perfil.split(',')[1], 'base64').length <= 200 * 1024);
  assert.equal(await Medication.countDocuments({ paciente: demo.patient.id }), 3);
  assert.equal(await Appointment.countDocuments({ paciente: demo.patient.id, status: 'agendada' }), 2);
  assert.equal(await Appointment.countDocuments({ paciente: demo.patient.id, status: 'realizada' }), 1);
  assert.equal(await Appointment.countDocuments({ medico: demo.doctor.id, status: 'disponivel' }), 19);
  const meds = await Medication.find({ paciente: demo.patient.id }).sort({ horario_remedio: 1 });
  assert.equal(meds[0].dias_tomados[0], '2026-11-17');
  assert.equal(demo.admin.tipo, 'administrador');
});
