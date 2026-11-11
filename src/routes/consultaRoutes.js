const express = require("express");
const controller = { ...require("../controllers/consultaController"), ...require("../controllers/agendamentoController") };
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const h = require("../middlewares/asyncHandler");

const router = express.Router();
router.use(authenticate);

router.get("/", h(controller.list));
router.get("/disponiveis", authorize("paciente"), h(controller.disponiveis));
router.get("/meus-pacientes", authorize("medico"), h(controller.meusPacientes));
router.get("/:id", h(controller.getById));

router.post("/", authorize("medico"), h(controller.create));
router.put("/:id/agendar", authorize("paciente"), h(controller.agendar));
router.put("/:id/trocar", authorize("paciente"), h(controller.trocar));
router.put("/:id/aviso-visto", authorize("medico"), h(controller.avisoVisto));
router.put("/:id/realizada", authorize("medico"), h(controller.realizada));
router.put("/:id/cancelar", h(controller.cancelar));
router.delete("/:id", authorize("medico", "administrador"), h(controller.remove));

module.exports = router;
