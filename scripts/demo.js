// Banco temporário exclusivo de demonstração. Nunca conecta ao banco oficial.
const path = require('node:path');
const fs = require('node:fs');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
process.env.RECORDAR_DEMO = '1';
process.env.JWT_SECRET = require('node:crypto').randomBytes(32).toString('hex');
const app = require('../src/server');
const seedDemo = require('./seed-demo');
async function main() {
  const workDir=path.resolve(process.env.RECORDAR_DEMO_DIR || '../../work');
  fs.mkdirSync(workDir, { recursive: true });
  const dbPath = fs.mkdtempSync(path.join(workDir,'mongo-demo-'));
  const repl = await MongoMemoryReplSet.create({ instanceOpts: [{ dbPath }], replSet: { count: 1 }, binary: { version: '7.0.24', downloadDir: path.resolve('../../work/mongodb-binaries') } });
  await mongoose.connect(repl.getUri());
  await seedDemo();
  const port=Number(process.env.DEMO_PORT || 3000);
  const server = app.listen(port, '0.0.0.0', () => console.log(`DEMONSTRAÇÃO LOCAL: http://127.0.0.1:${port}/api\nPaciente: paciente@demo.recordar\nMédico: medico@demo.recordar\nAdministrador: admin@demo.recordar\nSenha de todos: RecordarDemo123!\nDados e retrato fictícios. Banco temporário; os exemplos são recriados ao iniciar.`));
  async function stop() { server.close(); await mongoose.disconnect(); await repl.stop(); process.exit(0); }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
main().catch(error => { console.error(error); process.exit(1); });
