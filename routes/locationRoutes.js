const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const verifyToken = require('../middleware/authMiddleware');

// Protect all location routes
router.use(verifyToken);

router.get('/all', locationController.getAllLocations);
router.post('/add', locationController.addLocationHierarchy);
router.put('/booth/:id', locationController.updateBooth);
router.delete('/booth/:id', locationController.deleteBooth);

// changes for the ward creation and management
router.post('/ward/add', locationController.addWard);
router.put('/ward/:id', locationController.updateWard);
router.delete('/ward/:id', locationController.deleteWard);

module.exports = router;