const express = require('express');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const aiServiceAuth = require('../middlewares/aiServiceAuth');
const h = require('../middlewares/asyncHandler');
const controller = require('../controllers/preTriagemController');

const router = express.Router();
// Apenas um serviço backend com segredo próprio grava resultados de IA.
router.post('/', aiServiceAuth, h(controller.criar));
// O paciente vê somente seus resultados; ID de outro paciente retorna 404.
router.get('/', authenticate, authorize('paciente'), h(controller.listar));
router.get('/:id', authenticate, authorize('paciente'), h(controller.detalhar));
module.exports = router;
