//
//
// NOTE: Run this from arrays-server-js via bin/_*_MVP_DB_seed
//
var dotenv_path = __dirname + "/../../../../config/env/.env." + process.env.NODE_ENV;
require('dotenv').config({
    path: dotenv_path
});
//
var datasources = require('../cmd_parser').GetDatasources();
var dataSourceDescriptions = require('../../../datasources/descriptions').GetDescriptionsToSetup(datasources);
//
//
var postimport_caching_controller = require('./postimport_caching_controller');
postimport_caching_controller.GeneratePostImportCaches(dataSourceDescriptions);
