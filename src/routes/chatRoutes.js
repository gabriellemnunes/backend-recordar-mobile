const router = require("express").Router();
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const h = require("../middlewares/asyncHandler");
const c = require("../controllers/chatController");
router.use(authenticate, authorize("paciente"));
router.post("/", h(c.enviar));
router.get("/:id", h(c.historico));
module.exports = router;
