const express = require('express');
const router = express.Router();
const securityController = require('../controllers/securityController');

router.get('/dashboard', securityController.getDashboardStats);
router.get('/incidents', securityController.getEvents);
router.get('/events', securityController.getEvents);
router.get('/threats', securityController.getThreats);
// We can re-use dashboard stats for statistics
router.get('/statistics', securityController.getDashboardStats);

router.post('/remediate', securityController.remediateEvent);
router.post('/acknowledge', securityController.acknowledgeEvent);

module.exports = router;
