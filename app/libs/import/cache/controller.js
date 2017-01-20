var async = require("async");
var fs = require('fs');
var parse = require('csv-parse');
var winston = require('winston');


var imported_data_preparation = require('../../datasources/imported_data_preparation')
var data_types = require('../../datasources/datatypes');
var processed_row_objects = require('../../../models/processed_row_objects');
var raw_source_documents = require('../../../models/raw_source_documents');
var cache_keywords_controller = require('../cache/keywords_controller');

//
//
module.exports.GeneratePostImportCaches = function (dataSourceDescriptions,job, fn) {
    var i = 1;

    async.eachSeries(dataSourceDescriptions, function (dataSourceDescription, callback) {
        _dataSourcePostImportCachingFunction(i, dataSourceDescription,job, callback);
        i++;
    }, function (err) {
        if (err) {
            winston.info("❌  Error encountered during post-import caching:", err);
        } else {
            winston.info("✅  Post-import caching done.");
        }
        fn(err);
    });
};
//
var _dataSourcePostImportCachingFunction = function (indexInList, dataSourceDescription,job, callback) {
    var dataSource_title = dataSourceDescription.title;
    var fe_visible = dataSourceDescription.fe_visible;
    if (typeof fe_visible !== 'undefined' && fe_visible != null && fe_visible === false) {
        winston.warn("⚠️  The data source \"" + dataSource_title + "\" had fe_visible=false, so not going to generate its unique filter value cache.");
        return callback(null);
    }

    if (dataSourceDescription.dataset_uid) {
          winston.info("🔁  " + indexInList + ": Generated post-import caches for \"" + dataSource_title + "\" (appended dataset: " + 
            dataSourceDescription.dataset_uid + ")");
    }


    winston.info("🔁  " + indexInList + ": Generated post-import caches for \"" + dataSource_title + "\"");

    _generateUniqueFilterValueCacheCollection(job,dataSourceDescription, function (err) {
        if (err) {
            winston.error("❌  Error encountered while post-processing \"" + dataSource_title + "\".");
            return callback(err);
        }

        // Cachcing Keyword for the word cloud
        cache_keywords_controller.cacheKeywords_fromDataSourceDescription(job,dataSourceDescription, callback);
    });
};


var _generateUniqueFilterValueCacheCollection = function (job,dataSourceDescription, callback) {
    var dataSource_uid = dataSourceDescription.uid;
    var dataSource_title = dataSourceDescription.title;
    var dataSource_importRevision = dataSourceDescription.importRevision;
    var dataSourceRevision_pKey = raw_source_documents.NewCustomPrimaryKeyStringWithComponents(dataSource_uid, dataSource_importRevision);
    //
    var processedRowObjects_mongooseContext = processed_row_objects.Lazy_Shared_ProcessedRowObject_MongooseContext(dataSourceRevision_pKey);
    var processedRowObjects_mongooseModel = processedRowObjects_mongooseContext.Model;
    //
    processedRowObjects_mongooseModel.findOne({}, function (err, sampleDoc) {

        // console.log(JSON.stringify(sampleDoc));

        if (err) {
            callback(err, null);

            return;
        }
        var limitToNTopValues = 100;


     
        var filterKeys = Object.keys(sampleDoc.rowParams);

        if (dataSourceDescription.useCustomView) {

            filterKeys = require(__dirname + '/../../../../user/' + dataSourceDescription._team.subdomain +  '/src/import').filterKeys();

        } else {

            
            if (!dataSourceDescription.fe_excludeFields) {
                dataSourceDescription.fe_excludeFields = {};
            }
            if (!dataSourceDescription.fe_filters) {
                dataSourceDescription.fe_filters = {};
                dataSourceDescription.fe_filters.fieldsNotAvailable = [];
            }

            filterKeys = filterKeys.filter(function(key) {
                return !dataSourceDescription.fe_excludeFields[key] && dataSourceDescription.fe_filters.fieldsNotAvailable.indexOf(key)==-1;

            })
        }

        
        var uniqueFieldValuesByFieldName = {};

        for (i = 0; i < filterKeys.length ; i++) {
            key = filterKeys[i];
            uniqueFieldValuesByFieldName[key] = [];
        }

        async.each(filterKeys, function (key, cb) {
            // Commented out the count section for the comma-separated as individual filters.
            var uniqueStage = {$group: {_id: {}, count: {$sum: 1}}};
            uniqueStage["$group"]["_id"] = "$" + "rowParams." + key;

            processedRowObjects_mongooseModel.aggregate([

                {$unwind: "$" + "rowParams." + key}, // requires MongoDB 3.2, otherwise throws an error if non-array
                uniqueStage,
                {$sort: {count: -1}},
                {$limit : limitToNTopValues} // To escape that aggregation result exceeds maximum document size (16MB)
            ]).allowDiskUse(true).exec(function (err, results) {

                // console.log(results);

                if (err) {
                    cb(err);

                    return;
                }
                if (results == undefined || results == null || results.length == 0) {

                    console.log(key);
                    callback(new Error('Unexpectedly empty unique field value aggregation'));

                    return;
                }


                valuesRaw = results.map(function (el) {
                    var value = el._id;
                    if (typeof value === 'string')
                        return value.trim();
                    else
                        return value;
                });


                // flatten array of arrays (for nested tables)
                var values = [].concat.apply([], valuesRaw).filter(function (elem, index, self) {
                    return elem != '';
                }).splice(0, limitToNTopValues);
                values.sort();
  
                uniqueFieldValuesByFieldName[key] = values;
                cb();
            });
        }, function (err) {

            if (err) callback(err);

            var persistableDoc =
            {
                srcDocPKey: dataSourceRevision_pKey,
                limitedUniqValsByColName: uniqueFieldValuesByFieldName
            };
            var cached_values = require('../../../models/cached_values');
            cached_values.findOneAndUpdate({srcDocPKey: dataSourceRevision_pKey}, persistableDoc, {
                upsert: true,
                new: true
            }, function (err, doc) {
                if (err) {
                    return callback(err, null);
                }
                winston.info("✅  Inserted cachedUniqValsByKey for \"" + dataSource_title + "\".");
                job.log("✅  Inserted cachedUniqValsByKey for \"" + dataSource_title + "\".");
                callback(null, null);
            });

        });
    });
};
