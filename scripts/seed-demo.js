const fs = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const Clinic = require('../src/models/Clinic');
const Specialty = require('../src/models/Specialty');
const Appointment = require('../src/models/Appointment');
const PreTriage = require('../src/models/PreTriage');
const Medication = require('../src/models/Medication');

module.exports = async function seedDemo(now = new Date()) {
  const day = offset => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(now.getTime() + offset * 86400000));
  const password = await bcrypt.hash('RecordarDemo123!', 10);
  const portrait = await fs.readFile(path.join(__dirname, 'assets/maria-helena-demo.jpg'));
  const specialty = await Specialty.create({ nome_especialidade: 'Clínica médica' });
  const clinic = await Clinic.create({ nome_clinica: 'Clínica Recordar — demonstração', endereco_clinica: 'Endereço fictício para demonstração', telefone_clinica: '(00) 0000-0000' });
  const [patient, doctor, admin] = await User.create([
    { tipo: 'paciente', nome_usuario: 'Maria Helena Santos', email: 'paciente@demo.recordar', senha: password, data_nascimento: '1953-03-10', telefone: '(00) 00000-0000', foto_perfil: `data:image/jpeg;base64,${portrait.toString('base64')}`, anamnese_preenchida: true, condicoes_saude: 'Perfil fictício para demonstrar o aplicativo. Sem dados clínicos reais.', alergias: 'Informação fictícia de demonstração.', medicamentos_em_uso: 'Medicamentos A, B e C de demonstração; não representam prescrição real.' },
    { tipo: 'medico', nome_usuario: 'Ana Carolina Mendes (demonstração)', email: 'medico@demo.recordar', senha: password, crm: 'DEMO', telefone: '(00) 00000-0000', clinicas: [clinic.id], especialidade: specialty.id },
    { tipo: 'administrador', nome_usuario: 'Gabriela Nunes (demonstração)', email: 'admin@demo.recordar', senha: password, telefone: '(00) 00000-0000' }
  ]);
  const triage = await PreTriage.create({ paciente: patient.id, especialidades: [specialty.id], resumo: 'Pré-triagem fictícia de demonstração. Não foi gerada por IA e não descreve sintomas reais.', urgencia: false, concluida: true });
  const history = await Appointment.create({ medico: doctor.id, clinica: clinic.id, paciente: patient.id, status: 'realizada', data_consulta: day(-10), horario_consulta: '10:00', realizada_em: new Date(now.getTime() - 10 * 86400000), queixa_principal: 'Acompanhamento fictício para demonstração.', sintomas: 'Exemplo sem informação clínica real.' });
  await Promise.all([User.init(), Appointment.init()]);
  for (let offset = 1; offset <= 7; offset++) {
    for (const time of ['09:00', '10:00', '14:00']) {
      const reserved = (offset === 1 && time === '09:00') || (offset === 3 && time === '14:00');
      await Appointment.create({ medico: doctor.id, clinica: clinic.id, paciente: reserved ? patient.id : null, status: reserved ? 'agendada' : 'disponivel', data_consulta: day(offset), horario_consulta: time, pre_triagem: offset === 1 && time === '09:00' ? triage.id : null, queixa_principal: reserved ? 'Consulta fictícia de demonstração.' : '' });
    }
  }
  await Medication.create([
    { consulta: history.id, medico: doctor.id, paciente: patient.id, nome_remedio: 'Medicamento A — exemplo', horario_remedio: '08:00', quantidade_remedio: '1 unidade fictícia', data_inicio: day(-10), data_fim: day(20), dias_tomados: [day(0)] },
    { consulta: history.id, medico: doctor.id, paciente: patient.id, nome_remedio: 'Medicamento B — exemplo', horario_remedio: '14:00', quantidade_remedio: 'Dose ilustrativa, sem uso real', data_inicio: day(-10), data_fim: day(20) },
    { consulta: history.id, medico: doctor.id, paciente: patient.id, nome_remedio: 'Medicamento C — exemplo', horario_remedio: '20:00', quantidade_remedio: '1 unidade fictícia', data_inicio: day(-10), data_fim: day(20) }
  ]);
  return { patient, doctor, admin, clinic, specialty, history, triage };
};
