var express = require('express');
var router = express.Router();
var jwt = require('express-jwt');
var auth = jwt({
    secret: 'MY_SECRET',
    userProperty: 'payload'
});

var ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn('/auth/login');
var ctrlAuth = require('../controllers/api/authentication');
var ctrlAccount = require('../controllers/api/account');
var ctrlDataset = require('../controllers/api/dataset');
var ctrlWebsite = require('../controllers/api/website');
var ctrlUsers = require('../controllers/api/users');

// authentication
router.post('/register', ctrlAuth.register);
router.post('/login', ctrlAuth.login);
router.post('/isLoggedIn', ctrlAuth.isLoggedIn);

// account settings
router.post('/account/update', ensureLoggedIn, ctrlAccount.updateAccount);

// dataset settings
router.get('/dataset/getAll', ensureLoggedIn, ctrlDataset.getAll);

// website settings

// manage users

router.post('/user/search',ctrlUsers.search);


module.exports = router;