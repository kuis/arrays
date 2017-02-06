//
//
// 
var async = require("async");
var winston = require('winston');
var raw_source_documents = require('../../../models/raw_source_documents');
var processed_row_objects = require('../../../models/processed_row_objects');
var postimport_caching_controller = require('../cache/controller');
var processing = require('../../datasources/processing');
var import_raw_objects_controller = require('./raw_objects_controller');


//
// ---------- Multiple DataSource Operation ----------
//
module.exports.Import_rawObjects = function (dataSourceDescriptions,job, fn) {
    var i = 1;

    async.eachSeries(
        dataSourceDescriptions,
        function (dataSourceDescription, eachCb) {

            
            if (dataSourceDescription.useCustomView) {
                require(__dirname + '/../../../../user/' + dataSourceDescription._team.subdomain +  '/src/import').ParseAndImportRaw(i,dataSourceDescription,job,eachCb);
                
            } else {
                 import_raw_objects_controller.ParseAndImportRaw(i, dataSourceDescription,job, eachCb);
            }
           
            i++;
        },
        function (err) {


            if (err) {
                winston.info("❌  Error encountered during raw objects import:", err);
                fn(err);
            } else {
                winston.info("✅  Raw objects import done.");
                job.log("✅  Raw objects import done.");
                fn();
            }
        }
    );
};




var _Import_dataSourceDescriptions__enteringImageScrapingDirectly = function (dataSourceDescriptions,job, fn) {
    var self = this;
    var i = 1;
    async.eachSeries(
        dataSourceDescriptions,
        function (dataSourceDescription, eachCb) {
            winston.info("💬  " + i + ": Proceeding to image scraping of \"" + dataSourceDescription.title + "\"");
            job.log("💬 Proceeding to image scraping of \"" + dataSourceDescription.title + "\"");

            _proceedToScrapeImagesAndRemainderOfPostProcessing(i, dataSourceDescription, job,eachCb);
            i++;
        },
        function (err) {
            if (err) {
                winston.info("❌  Error encountered during image-scrapping:(" + err.code + ')', err);
                job.log("❌  Error encountered during image-scrapping:(" + err.code + ')', err);
                fn(err);
            } else {
                winston.info("✅  Import completed.");
                job.log("✅  Import completed.");
                fn();
            }
        }
    );
};

module.exports.Import_dataSourceDescriptions__enteringImageScrapingDirectly = _Import_dataSourceDescriptions__enteringImageScrapingDirectly;

module.exports.PostProcessRawObjects = function (dataSourceDescriptions,job, fn) {
    var i = 1;
    var omitImageScraping = true;

    async.eachSeries(
        dataSourceDescriptions,
        function (dataSourceDescription, eachCb) {

            processed_row_objects.initializeBackgroundIndexBuilding(dataSourceDescription);

            _postProcess(i, dataSourceDescription,job,eachCb);
            i++;
        },
        function (err) {
            if (err) {
                winston.info("❌  Error encountered during import post-processing:", err.message);
                fn(err);
            } else {
                winston.info("✅  Import post-processing done.");
                job.log("✅  Import post-processing done.")
                fn();
            }
        }
    );
};

// ---------- Single DataSource Operation ----------
//
var _postProcess = function (indexInList, dataSourceDescription,job, callback) {
    var datasetId = dataSourceDescription._id;
    var dataSource_importRevision = dataSourceDescription.importRevision;
    var dataSource_title = dataSourceDescription.fileName;
    var parentId = dataSourceDescription.schemaId;

  
    winston.info("🔁  " + indexInList + ": Post-processing \"" + dataSource_title + "\"");

    
    job.log("🔁  Post-processing \"" + dataSource_title + "\"");


    //
    //
    // Firstly, generate the whole processed objects dataset
    //



    processed_row_objects.InsertProcessedDatasetFromRawRowObjects
    (
        job,
        datasetId,
        parentId,
        function (err) {
            if (err) {
                winston.error("❌  Error encountered while generating whole processed dataset \"" + dataSource_title + "\".");
                return callback(err);
            }

            if (dataSourceDescription.useCustomView) {
                require(__dirname + '/../../../../user/' + dataSourceDescription._team.subdomain +  '/src/import').afterGeneratingProcessedDataSet_performEachRowOperations(indexInList,dataSourceDescription,job,callback);
            } else {
                 _afterGeneratingProcessedDataSet_performEachRowOperations(indexInList, dataSourceDescription,job, function(err) {

                     if (err) {
                        winston.error("❌  Error encountered while generating whole processed dataset \"" + dataSource_title + "\".");
                        return callback(err);
                    }
       


                    job.log("🔁  Now generating fields by joining datasets ");

                    async.eachSeries(
                        dataSourceDescription.relationshipFields,
                        function (description, cb) {
                            var by = description.by;
                            var formingRelationship = typeof description.relationship !== 'undefined' && description.relationship == true ? true : false;
                            switch (by.operation) {
                                case "Join":
                                {
                                    processed_row_objects.GenerateFieldsByJoining_comparingWithMatchFn(
                                        job,
                                        datasetId,
                                        description.field,
                                        description.singular,
                                        by.findingMatchOnField,
                                        by.joinDataset,
                                        by.withLocalField,
                                        by.obtainingValueFromField,
                                        formingRelationship,
                                        cb
                                    );
                                    break;
                                }

                                default:
                                {
                                    winston.error("❌  Unrecognized post-processing field generation operation \"" + byDoingOp + "\" in", description);
                                    break;
                                }
                            }
                        },
                        function (err) {
                            if (err) winston.error("❌  Error encountered while processing \"" + dataSource_title + "\".");
                            return callback(err);
                        }
                    );

                 });
            }
        });
};

var _proceedToScrapeImagesAndRemainderOfPostProcessing = function (indexInList, dataSourceDescription,job, callback) {

  
        
    if (dataSourceDescription.dirty >= 0) { // dont omit scraping

        winston.info("🔁  start image scraping");
        job.log("🔁  start image scraping");
        async.eachSeries(
            dataSourceDescription.imageScraping,
            function (description, cb) {

                processed_row_objects.GenerateImageURLFieldsByScraping(job,dataSourceDescription._team.subdomain,dataSourceDescription._id,
                    dataSourceDescription.schemaId,
                    description.htmlSourceAtURLInField,
                    description.setFields,
                    cb);
            },
            function (err) {

                winston.info("✅  finished image scraping")
                job.log("✅  finished image scraping");

                if (err) { 

                    winston.error("❌  Error encountered while scraping image with \"" + dataSourceDescription.title + "\".");
                    return callback(err);
                }

                callback();
                 
            }
        );

     } else { //omit scraping
        winston.info(" ⚠️  skipping image scraping");
        job.log("⚠️  skipping image scraping"); 
        callback();
     }
}
//


var _afterGeneratingProcessedDataSet_performEachRowOperations = function (indexInList, dataSourceDescription,job, callback) {

    var dataSource_importRevision = dataSourceDescription.importRevision;
    var dataSource_title = dataSourceDescription.fileName;
    var dataset_parentId = dataSourceDescription.schemaId;
    var dataSource_team_subdomain = dataSourceDescription._team.subdomain;


    var forThisDataSource_mongooseContext;
    if (dataset_parentId) {
        forThisDataSource_mongooseContext = processed_row_objects.Lazy_Shared_ProcessedRowObject_MongooseContext(dataset_parentId);
    } else {
        forThisDataSource_mongooseContext =  processed_row_objects.Lazy_Shared_ProcessedRowObject_MongooseContext(dataSourceDescription._id);
    }

    var forThisDataSource_rowObjects_modelName = forThisDataSource_mongooseContext.Model.modelName;
    var forThisDataSource_RawRowObject_model = forThisDataSource_mongooseContext.Model.model;
    var forThisDataSource_nativeCollection = forThisDataSource_mongooseContext.Model.collection;

    // var mergeFieldsIntoCustomField_BulkOperation = forThisDataSource_nativeCollection.initializeUnorderedBulkOp();


    //

    winston.info("🔁  Performing each-row operation for \"" + dataSource_title + "\"");

    job.log("🔁  Performing each-row operation and creating custom fields for \"" + dataSource_title + "\"");

    var eachCtx;
    var eachCtx = dataSourceDescription.customFieldsToProcess;

    if (typeof dataSourceDescription.fe_nestedObject != 'undefined' && dataSourceDescription.fe_nestedObject.prefix) {
        eachCtx = dataSourceDescription.fe_nestedObject;
        eachCtx.nested = true;
        eachCtx.numberOfInsertedRows = 0;
        eachCtx.numberOfRows = 0;
        eachCtx.pKeyQuery = {};
        if (dataset_parentId) {
            eachCtx.pKeyQuery = {$regex: "^" + dataSourceDescription._id + "-"}
        } else {
            eachCtx.pKeyQuery = dataSourceDescription._id.toString();

        }
       
    }

    startIterations();

    function startIterations() {

        /*eachCtx could be array or object*/

        if (eachCtx == null || typeof eachCtx == 'undefined' || (Array.isArray(eachCtx) && !eachCtx.length) ||
            (!Array.isArray(eachCtx) && !eachCtx.fields.length)) {
            continueToAfterIterating();
        } else {

            // eachCtx.mergeFieldsIntoCustomField_BulkOperation = mergeFieldsIntoCustomField_BulkOperation;
            eachCtx.nativeCollection = forThisDataSource_nativeCollection;
            afterGeneratingProcessedRowObjects_eachRowFn(eachCtx,function(err) {
                if (err) {
                    winston.error("❌  Error encountered while performing each-row operations \"" + dataSource_title + "\".");
                    job.log("❌  Error encountered while performing each-row operations \"" + dataSource_title + "\".");
                    callback(err); // bail early
                } else {
                    continueToAfterIterating(eachCtx);
                }
            });
        }
    }


    function afterGeneratingProcessedRowObjects_eachRowFn(eachCtx,cb) {

        var bulkOperationQueryFragment;

        if (typeof eachCtx.nested !== 'undefined' && eachCtx.nested == true) {
         
            var matchQuery = {};

            if (eachCtx.criteria !== null && typeof eachCtx.criteria !== 'undefined') {
                matchQuery["rowParams." + eachCtx.criteria.fieldName] = eachCtx.criteria.value;
            }
            if (typeof eachCtx.pKeyQuery == 'string') {
                matchQuery["srcDocPKey"] = eachCtx.pKeyQuery;

            } else {
                matchQuery["pKey"] = eachCtx.pKeyQuery;

            }

            var groupQuery = formGroupQuery(eachCtx);

            var completed = false;
            var counter = 1;
            var skipping = 0;
            var limit = 1000;

            async.whilst(function() {
                if (counter == 1) {
                    return true;
                } else {
                    return completed;
                }
            },function(next) {
                eachCtx.nativeCollection.aggregate([
                    {$match: matchQuery},
                    {$group: groupQuery},
                    {$skip: skipping},
                    {$limit: limit}
                ],function(err,aggregatedResult) {

               
                    if (err) return next(err);
                 
                    if (aggregatedResult.length == 0) {
                        completed = true;
                        return next();
                    } 
                
                    async.each(aggregatedResult,function(res,callback) {
                        var updateQuery = {};
                        updateQuery["rowParams." + eachCtx.criteria.fieldName] = {$ne: eachCtx.criteria.value};
                        var matchingCond = res._id;
                        updateQuery["rowParams." + eachCtx.nestingKey] = matchingCond;
                        var setQuery = formSetQuery(res,eachCtx.prefix);

                        eachCtx.numberOfRows += res.count;

                        delete res._id;
                        delete res.count;

                        eachCtx.nativeCollection.update(updateQuery,{$set: setQuery},function(err,result) {
                            if (err) return callback(err);
                            var r = JSON.parse(result);

                            eachCtx.numberOfInsertedRows += parseInt(r["n"]);
                            eachCtx.numberOfRows += parseInt(r["n"]);

                            var removeQuery = {};
                            removeQuery["rowParams." + eachCtx.nestingKey] = matchingCond;
                            removeQuery["rowParams." + eachCtx.criteria.fieldName] = eachCtx.criteria.value;
                            eachCtx.nativeCollection.remove(removeQuery,callback(err));
                        })

                    },function(err) {
     
                        skipping += counter * limit;
                        counter++;
                        next(err);
                    })

                })

            },function(err) {
                cb(err);
            })

        } else {

            for (var i = 0; i < eachCtx.length; i++) {

                var newFieldName = eachCtx[i].fieldName;

                var newFieldType = eachCtx[i].fieldType;
                if (newFieldType == 'array') {
                    var fieldsToMergeIntoArray = eachCtx[i].fieldsToMergeIntoArray;
                    var delimiterArrays = eachCtx[i].delimiterOnFields;
                    var new_array = mergeAllFieldsToArray(fieldsToMergeIntoArray,delimiterArrays, rowDoc, null);
             

                    var updateQuery = addToSet(newFieldName, new_array);
    
                    bulkOperationQueryFragment =
                    {
                        pKey: rowDoc.pKey,
                        srcDocPKey: rowDoc.srcDocPKey
                    };

                    
                    eachCtx.nativeCollection.update(bulkOperationQueryFragment,updateQuery);
                     
                } else if (newFieldType == 'object') {


                }

            }
        }

    }

    function formGroupQuery(ctx) {
        var ret = {};
        ret["_id"] = "$rowParams." + ctx.nestingKey;
        for (var i = 0; i < ctx.fields.length; i ++) {
            if (ctx.fields[i] == "Transcript") continue;
            ret[ctx.fields[i]] = {$push: "$" + "rowParams." + ctx.fields[i]};
        }
        ret["count"] = {$sum:1};
        return ret;
    }

    


    function formSetQuery(obj,prefix) {
        var ret = {};
        for (var key in obj) {
            var revisedKey = "rowParams." + prefix + key;
            ret[revisedKey] = obj[key];
        }
        return ret;
    }





    function mergeAllFieldsToArray(withValuesInFieldsNamed,delimiterArrays, rowDoc) {

        var generatedArray = [];
        for (var i = 0; i < withValuesInFieldsNamed.length; i++) {
            var fieldName = withValuesInFieldsNamed[i];
            var fieldValue = rowDoc["rowParams"][fieldName];
            if (typeof fieldValue !== 'undefined' && fieldValue !== null && fieldValue !== "") {
                if (typeof delimiterArrays !== 'undefined' && Array.isArray(delimiterArrays) &&
                    delimiterArrays.length > 0) {
                    if (delimiterArrays[i] == '" "') {
                        delimiterArrays[i] = " ";
                    }
                    fieldValue = fieldValue.split(delimiterArrays[i]);
                    var refinedValue = [];
                    fieldValue.forEach(function(value) {
                        refinedValue.push(value.toString().trim());
                    });
                    generatedArray = generatedArray.concat(refinedValue);
                } else {
                    generatedArray.push(fieldValue);
                }
            }
        }
        return generatedArray;
    }

    function addToSet(generateFieldNamed, persistableValue) {
        var updateFragment = {$addToSet: {}};
        updateFragment["$addToSet"]["rowParams." + generateFieldNamed] = {"$each": persistableValue};

        return updateFragment;

    }

    function afterGeneratingProcessedRowObjects_afterIterating_eachRowFn(eachCtx, cb) {

        winston.info("✅  [" + (new Date()).toString() + "] Saved custom fields.");

        if (typeof eachCtx.nested != 'undefined' && eachCtx.nested == true) {

            var updateId = dataSourceDescription._id;
            if (dataset_parentId) {
                updateId = dataset_parentId
            }


            raw_source_documents.IncreaseNumberOfRawRows(updateId, eachCtx.numberOfInsertedRows - eachCtx.numberOfRows,function(err) {
                if (err) {
                    winston.error('❌ Error when modifying number of rows in raw source documents: %s', err);
                }
                cb(err);
            })

        } else {
            cb(null);
        }

    }


    function continueToAfterIterating(eachCtx) {

        /* check object key length would not be appropriate because eacCtx could be array */

        if (eachCtx != null && typeof eachCtx != 'undefined' ) {

            afterGeneratingProcessedRowObjects_afterIterating_eachRowFn(
                eachCtx,
                function (err) {
                    if (err) {
                        winston.error("❌  Error encountered while performing each-row operations \"" + dataSource_title + "\".");
                    } else {
                        winston.info("✅  " + indexInList + ": Imported processed rows and custom field objects --  \"" + dataSource_title + "\".");
                        job.log("✅  " + indexInList + ": Imported processed rows and custom field objects for \"" + dataSource_title + "\".");
                    }
                    //
                    callback(err);
                }
            );
        } else {
            winston.info("✅  " + indexInList + ": Imported processed rows and custom field objects  --  \"" + dataSource_title + "\".");
            job.log("✅  " + indexInList + ": Imported processed rows and custom field objects  \"" + dataSource_title + "\".");
            callback(); // all done
        }
    }
};