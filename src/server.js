const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const consultaRoutes = require("./routes/consultaRoutes");
const remedioRoutes = require("./routes/remedioRoutes");
const clinicaRoutes = require("./routes/clinicaRoutes");
const especialidadeRoutes = require("./routes/especialidadeRoutes");
const medicoRoutes = require("./routes/medicoRoutes");
const { notFound, errorHandler } = require("./middlewares/errorHandler");
const { criarAdminInicial } = require("./controllers/authController");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api", (req, res) => {
  res.json({ app: "Recordar", message: "API do Recordar funcionando!", version: "3.0.0" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/consultas", consultaRoutes);
const { authenticate, authorize } = require('./middlewares/authMiddleware');
const h = require('./middlewares/asyncHandler');
const PreTriage = require('./models/PreTriage');
app.get('/api/pre-triagens', authenticate, authorize('paciente'), h(async (req, res) => {
  const itens = await PreTriage.find({ paciente: req.user.id, concluida: true })
    .select('_id resumo urgencia especialidades createdAt').populate('especialidades').sort({ createdAt: -1 }).limit(50);
  res.json(itens);
}));
app.use("/api/remedios", remedioRoutes);
app.use("/api/clinicas", clinicaRoutes);
app.use("/api/especialidades", especialidadeRoutes);
app.use("/api/medicos", medicoRoutes);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const frontend = path.join(__dirname, "../../recordar.frontend/recordar/frontend");
if (fs.existsSync(frontend)) app.use(express.static(frontend));

app.use(notFound);
app.use(errorHandler);

async function start() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  const PORT = process.env.PORT || 3000;

  if (!uri) {
    console.error("MONGO_URI não configurada no arquivo .env.");
    process.exit(1);
  }
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET não configurado no arquivo .env.");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log("MongoDB do Recordar conectado!");
  } catch (error) {
    console.error("Erro ao conectar ao MongoDB:", error.message);
    process.exit(1);
  }

  await criarAdminInicial();

  app.listen(PORT, () => {
    console.log(`Servidor em http://localhost:${PORT}`);
    console.log(`Swagger em http://localhost:${PORT}/api-docs`);
  });
}

if (require.main === module) start();

module.exports = app;
