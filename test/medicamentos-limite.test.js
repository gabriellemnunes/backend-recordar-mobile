const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatRemedio } = require('../src/config/format');
const dia = '2026-11-18';
const base = { _id: 'med1', data_inicio: '2026-11-01', data_fim: '2026-11-30', tomadas_por_dia: 2, intervalo_minimo_minutos: 480, dias_tomados: [] };
test('exibe contagem, limite e próximo registro', () => {
 const r = formatRemedio({...base, registros_tomadas:[{_id:'a',dia,registrado_em:new Date('2026-11-18T11:00:00Z'),corrigido_em:null}]},dia);
 assert.equal(r.tomadas_hoje,1); assert.equal(r.limite_atingido,false);
 assert.equal(r.proximo_registro_em,'2026-11-18T19:00:00.000Z');
});
test('não conta marcação corrigida como tomada ativa', () => {
 const r = formatRemedio({...base, registros_tomadas:[{_id:'a',dia,registrado_em:new Date(),corrigido_em:new Date()},{_id:'b',dia,registrado_em:new Date(),corrigido_em:null}]},dia);
 assert.equal(r.tomadas_hoje,1); assert.equal(r.marcacoes_por_engano_hoje,1);
});
test('bloqueia visualmente ao alcançar limite prescrito', () => {
 const r = formatRemedio({...base, registros_tomadas:[{_id:'a',dia,registrado_em:new Date()},{_id:'b',dia,registrado_em:new Date()}]},dia);
 assert.equal(r.tomadas_hoje,2); assert.equal(r.limite_atingido,true);
});
