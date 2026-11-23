module.exports = function extenderSwagger(spec) {
  const perfil = spec.paths['/api/users/me'].put;
  perfil.requestBody.content['application/json'].schema.properties.foto_perfil = {
    type: 'string', nullable: true, maxLength: 280000,
    description: 'Foto JPEG em data:image/jpeg;base64,..., até 200 KB. Envie null para remover. Disponível apenas nos dados da própria conta.'
  };
  perfil.responses['400'] = { description: 'Foto inválida ou maior que 200 KB' };
  perfil.responses['413'] = { description: 'Corpo da requisição maior que 400 KB' };
  const busca = spec.paths['/api/consultas/disponiveis']?.get;
  if (busca) {
    busca.parameters = (busca.parameters || []).filter(p => p.name !== 'id_consulta_atual');
    busca.parameters.push({ in: 'query', name: 'id_consulta_atual', schema: { type: 'string' },
      description: 'ID da consulta própria a reagendar. Mantém o médico e a pré-triagem; desconsidera esta reserva ao filtrar conflitos.' });
    busca.description = 'Retorna somente horários futuros, vinculados à clínica e sem conflitos com a agenda do paciente. A consulta atual é validada quando informada.';
  }
  spec.info.version = '4.3.0';
  spec.info.description += ' Extensão de pré-triagem protegida e histórico de consultas realizadas.';
  spec.components.securitySchemes.aiServiceToken = {
    type: 'apiKey', in: 'header', name: 'x-ai-service-token',
    description: 'Credencial privada de servidor para servidor. Não distribuir ao aplicativo mobile.'
  };
  spec.components.schemas.PreTriagemIAInput = {
    type: 'object',
    required: ['paciente', 'especialidades', 'resumo', 'urgencia', 'concluida'],
    properties: {
      paciente: { type: 'string', description: 'ID do paciente cadastrado' },
      especialidades: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      resumo: { type: 'string', maxLength: 2000 },
      urgencia: { type: 'boolean' },
      concluida: { type: 'boolean' },
      sintomas: { type: 'array', items: { type: 'string' } },
      duracao: { type: 'string', maxLength: 120 },
      intensidade: { type: 'integer', minimum: 0, maximum: 10, nullable: true },
      observacoes: { type: 'string', maxLength: 2000 },
      alertas: { type: 'array', items: { type: 'string' } }
    }
  };
  spec.paths['/api/pre-triagens'] = {
    get: {
      tags: ['Pré-triagem'], summary: 'Lista até 50 pré-triagens concluídas do paciente autenticado',
      security: [{ bearerAuth: [] }], responses: { 200: { description: 'Resultados privados' }, 401: { description: 'Não autenticado' }, 403: { description: 'Exige paciente' } }
    },
    post: {
      tags: ['Pré-triagem'], summary: 'Registra pré-triagem processada pelo serviço de IA',
      description: 'Uso exclusivo do serviço de IA. Não aceita token JWT de paciente como substituto. A IA não substitui avaliação médica.',
      security: [{ aiServiceToken: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PreTriagemIAInput' } } } },
      responses: { 201: { description: 'Resultado salvo' }, 400: { description: 'Campos inválidos' }, 401: { description: 'Credencial inválida' }, 404: { description: 'Paciente inexistente' }, 503: { description: 'Integração não configurada' } }
    }
  };
  spec.paths['/api/pre-triagens/{id}'] = {
    get: {
      tags: ['Pré-triagem'], summary: 'Detalhe de pré-triagem pertencente ao paciente logado',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Resultado e especialidades' }, 404: { description: 'Resultado inexistente ou não pertence ao paciente' } }
    }
  };
  spec.paths['/api/consultas/historico'] = {
    get: {
      tags: ['Consultas'], summary: 'Consulta histórico de atendimentos concluídos',
      description: 'Pacientes e médicos veem apenas os próprios atendimentos; administradores veem metadados sem anamnese. Máximo de 100 resultados, ordenados por data.',
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: 'Lista de consultas realizadas' }, 401: { description: 'Não autenticado' } }
    }
  };
  spec.paths['/api/chat']={post:{tags:['Chatbot'],summary:'Coleta sintomas e conclui pré-triagem com IA',security:[{bearerAuth:[]}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['mensagem'],properties:{mensagem:{type:'string',maxLength:2000},id_conversa:{type:'string',nullable:true},consentimento_ia:{type:'boolean',description:'Obrigatório ao iniciar conversa.'}}}}}},responses:{200:{description:'Resposta, id_conversa, etapa, urgencia e id_pre_triagem quando concluída'},400:{description:'Mensagem ou etapa inválida'},401:{description:'Não autenticado'},403:{description:'Somente pacientes'},409:{description:'Mensagem anterior em processamento'},429:{description:'Limite de mensagens por hora'},503:{description:'IA indisponível; nenhum resultado inventado'}}}};
  spec.paths['/api/chat/{id}']={get:{tags:['Chatbot'],summary:'Recupera conversa do próprio paciente',security:[{bearerAuth:[]}],parameters:[{in:'path',name:'id',required:true,schema:{type:'string'}}],responses:{200:{description:'Mensagens e resultado persistidos'},404:{description:'Conversa não encontrada ou de outro paciente'}}}};
  return spec;
};
