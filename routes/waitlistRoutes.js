const express = require('express');
const router = express.Router();
const { joinWaitlist } = require('../controllers/waitlistController');

router.post('/join', joinWaitlist);

module.exports = router;
