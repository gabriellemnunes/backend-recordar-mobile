const express = require("express");
const controller = require("../controllers/remedioController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const h = require("../middlewares/asyncHandler");

const router = express.Router();
router.use(authenticate);

router.get("/", h(controller.list));
router.post("/", authorize("medico"), h(controller.create));
router.put("/:id/tomar", authorize("paciente"), h(controller.tomar));
router.put("/:id", authorize("medico"), h(controller.update));
router.delete("/:id", authorize("medico", "administrador"), h(controller.remove));

module.exports = router;
