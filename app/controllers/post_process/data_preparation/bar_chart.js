var winston = require('winston');
var Batch = require('batch');
var express = require('express');
var router = express.Router();
//
var importedDataPreparation = require('../../../datasources/utils/imported_data_preparation');
var import_datatypes = require('../../../datasources/utils/import_datatypes');
var raw_source_documents = require('../../../models/raw_source_documents');
var processed_row_objects = require('../../../models/processed_row_objects');
var config = require('../config');
var func = require('../func');

/**
 * @param {Object} urlQuery - URL params
 * @param {Function} callback
 */
router.BindData = function (req, urlQuery, callback) {
    var self = this;
     // urlQuery keys:
    // source_key
    // groupBy
    // sortDir
    // searchQ
    // searchCol
    // embed
    // filters
    var source_pKey = urlQuery.source_key;

    importedDataPreparation.DataSourceDescriptionWithPKey(source_pKey)
    .then(function(dataSourceDescription) {

        if (dataSourceDescription == null || typeof dataSourceDescription === 'undefined') {
            callback(new Error("No data source with that source pkey " + source_pKey), null);

            return;
        }

        if (typeof dataSourceDescription.fe_views !== 'undefined' && dataSourceDescription.fe_views.views != null && typeof dataSourceDescription.fe_views.views.lineGraph === 'undefined') {
            callback(new Error('View doesn\'t exist for dataset. UID? urlQuery: ' + JSON.stringify(urlQuery, null, '\t')), null);
            return;
        }

        var processedRowObjects_mongooseContext = processed_row_objects.Lazy_Shared_ProcessedRowObject_MongooseContext(source_pKey);
        var processedRowObjects_mongooseModel = processedRowObjects_mongooseContext.Model;
        //
        var groupBy = urlQuery.groupBy; // the human readable col name - real col name derived below
        var defaultGroupByColumnName_humanReadable = dataSourceDescription.fe_views.views.barChart.defaultGroupByColumnName_humanReadable;
        var groupBy_realColumnName = importedDataPreparation.RealColumnNameFromHumanReadableColumnName(groupBy ? groupBy : defaultGroupByColumnName_humanReadable,
            dataSourceDescription);
        var raw_rowObjects_coercionSchema = dataSourceDescription.raw_rowObjects_coercionScheme;
        var groupBy_isDate = (raw_rowObjects_coercionSchema && raw_rowObjects_coercionSchema[groupBy_realColumnName] &&
        raw_rowObjects_coercionSchema[groupBy_realColumnName].operation == "ToDate");
        var groupBy_outputInFormat = '';
        if (dataSourceDescription.fe_views.views.barChart.outputInFormat && dataSourceDescription.fe_views.views.barChart.outputInFormat[groupBy_realColumnName] && dataSourceDescription.fe_views.views.barChart.outputInFormat[groupBy_realColumnName].format) {
            groupBy_outputInFormat = dataSourceDescription.fe_views.views.barChart.outputInFormat[groupBy_realColumnName].format;
        } else if (dataSourceDescription.raw_rowObjects_coercionScheme && dataSourceDescription.raw_rowObjects_coercionScheme[groupBy_realColumnName] &&
            dataSourceDescription.raw_rowObjects_coercionScheme[groupBy_realColumnName].outputFormat) {
            groupBy_outputInFormat = dataSourceDescription.raw_rowObjects_coercionScheme[groupBy_realColumnName].outputFormat;
        }
        //
        var stackBy = dataSourceDescription.fe_views.views.barChart.stackByColumnName_humanReadable;

        var sortDir = urlQuery.sortDir;
        var sortDirection = sortDir ? sortDir == 'Ascending' ? 1 : -1 : 1;
        //


        var routePath_base = "/array/" + source_pKey + "/bar-chart";
        var sourceDocURL = dataSourceDescription.urls ? dataSourceDescription.urls.length > 0 ? dataSourceDescription.urls[0] : null : null;
        if (urlQuery.embed == 'true') routePath_base += '?embed=true';
        //
        var truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill = func.new_truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill(dataSourceDescription);

        //
        var filterObj = func.filterObjFromQueryParams(urlQuery);
        var isFilterActive = Object.keys(filterObj).length != 0;
        //
        var searchCol = urlQuery.searchCol;
        var searchQ = urlQuery.searchQ;
        var isSearchActive = typeof searchCol !== 'undefined' && searchCol != null && searchCol != "" // Not only a column
            && typeof searchQ !== 'undefined' && searchQ != null && searchQ != "";  // but a search query

        //
        // DataSource Relationship
        var mapping_source_pKey = dataSourceDescription.fe_views.views.barChart.mapping_dataSource_pKey;
        //var dataSourceRevision_pKey = raw_source_documents.NewCustomPrimaryKeyStringWithComponents(mapping_dataSource_uid, mapping_dataSource_importRevision);

        var mapping_default_filterObj = {};
        var mapping_default_view = "gallery";
        var mapping_groupByObj = {};



        if (mapping_source_pKey) {
            var mappingDataSourceDescription = importedDataPreparation.DataSourceDescriptionWithPKey(mapping_source_pKey).then(function(mappingDataSourceDescription) {


                var mapping_default_filterObj = {};
                if (typeof mappingDataSourceDescription.fe_filters.default_filter !== 'undefined') {
                    mapping_default_filterObj = mappingDataSourceDescription.fe_filters.default_filter ;
                } 

                mapping_default_view = mappingDataSourceDescription.fe_views.default_view;

                var mapping_groupBy = groupBy_realColumnName;
                if (dataSourceDescription.fe_views.views.barChart.mapping_dataSource_fields)
                    mapping_groupBy = dataSourceDescription.fe_views.views.barChart.mapping_dataSource_fields[groupBy_realColumnName];
                var mapping_groupByObj = {};
                mapping_groupByObj[mapping_groupBy] = '';
            })
        }

        // Aggregate By
        var aggregateBy = urlQuery.aggregateBy;
        var defaultAggregateByColumnName_humanReadable = dataSourceDescription.fe_views.views.barChart.defaultAggregateByColumnName_humanReadable;
        var numberOfRecords_notAvailable = dataSourceDescription.fe_views.views.barChart_aggregateByColumnName_numberOfRecords_notAvailable;
        if (!defaultAggregateByColumnName_humanReadable && !numberOfRecords_notAvailable)
            defaultAggregateByColumnName_humanReadable = config.aggregateByDefaultColumnName;

        // Aggregate By Available
        var aggregateBy_humanReadable_available = undefined;
        for (var colName in raw_rowObjects_coercionSchema) {
            var colValue = raw_rowObjects_coercionSchema[colName];
            if (colValue.operation == "ToInteger") {
                var humanReadableColumnName = colName;
                if (dataSourceDescription.fe_displayTitleOverrides && dataSourceDescription.fe_displayTitleOverrides[colName])
                    humanReadableColumnName = dataSourceDescription.fe_displayTitleOverrides[colName];

                if (!aggregateBy_humanReadable_available) {
                    aggregateBy_humanReadable_available = [];
                    if (!numberOfRecords_notAvailable)
                        aggregateBy_humanReadable_available.push(config.aggregateByDefaultColumnName); // Add the default - aggregate by number of records.
                }

                aggregateBy_humanReadable_available.push(humanReadableColumnName);
            }
        }
        if (aggregateBy_humanReadable_available) {
            if (aggregateBy_humanReadable_available.length > 0)
                defaultAggregateByColumnName_humanReadable = aggregateBy_humanReadable_available[0];
            if (aggregateBy_humanReadable_available.length == 1)
                aggregateBy_humanReadable_available = undefined;
        }

        var aggregateBy_realColumnName = importedDataPreparation.RealColumnNameFromHumanReadableColumnName(aggregateBy ? aggregateBy : defaultAggregateByColumnName_humanReadable, dataSourceDescription);

        //
        var sourceDoc, sampleDoc, uniqueFieldValuesByFieldName, stackedResultsByGroup = {};

        ///
        // graphData is exported and used by template for lineChart generation
        var graphData;


        var batch = new Batch();
        batch.concurrency(1);

        // Obtain source document
        batch.push(function (done) {
            raw_source_documents.Model.findOne({primaryKey: source_pKey}, function (err, _sourceDoc) {
                if (err) return done(err);

                sourceDoc = _sourceDoc;
                done();
            });
        });

        // Obtain sample document
        batch.push(function (done) {
            processedRowObjects_mongooseModel.findOne({}, function (err, _sampleDoc) {
                if (err) return done(err);

                sampleDoc = _sampleDoc;
                done();
            });
        });

        // Obtain Top Unique Field Values For Filtering
        batch.push(function (done) {
            func.topUniqueFieldValuesForFiltering(source_pKey, dataSourceDescription, function (err, _uniqueFieldValuesByFieldName) {
                if (err) return done(err);

                uniqueFieldValuesByFieldName = {};
                for (var columnName in _uniqueFieldValuesByFieldName) {
                    if (_uniqueFieldValuesByFieldName.hasOwnProperty(columnName)) {
                        if (raw_rowObjects_coercionSchema && raw_rowObjects_coercionSchema[columnName]) {
                            var row = [];
                            _uniqueFieldValuesByFieldName[columnName].forEach(function (rowValue) {
                                row.push(import_datatypes.OriginalValue(raw_rowObjects_coercionSchema[columnName], rowValue));
                            });
                            row.sort();
                            uniqueFieldValuesByFieldName[columnName] = row;
                        } else {
                            uniqueFieldValuesByFieldName[columnName] = _uniqueFieldValuesByFieldName[columnName];
                        }

                        if (dataSourceDescription.fe_filters.fieldsSortableByInteger && dataSourceDescription.fe_filters.fieldsSortableByInteger.indexOf(columnName) != -1) { // Sort by integer

                            uniqueFieldValuesByFieldName[columnName].sort(function (a, b) {
                                a = a.replace(/\D/g, '');
                                a = a == '' ? 0 : parseInt(a);
                                b = b.replace(/\D/g, '');
                                b = b == '' ? 0 : parseInt(b);
                                return a - b;
                            });

                        } else // Sort alphabetically by default
                            uniqueFieldValuesByFieldName[columnName].sort(function (a, b) {
                                return a - b;
                            });
                    }
                }
                done();
            });
        });

        // Obtain Grouped ResultSet
        batch.push(function (done) {
            //
            var aggregationOperators = [];
            if (isSearchActive) {
                var _orErrDesc = func.activeSearch_matchOp_orErrDescription(dataSourceDescription, searchCol, searchQ);
                if (_orErrDesc.err) return done(_orErrDesc.err);

                aggregationOperators = aggregationOperators.concat(_orErrDesc.matchOps);
            }
            if (isFilterActive) { // rules out undefined filterCol
                var _orErrDesc = func.activeFilter_matchOp_orErrDescription_fromMultiFilter(dataSourceDescription, filterObj);
                if (_orErrDesc.err) return done(_orErrDesc.err);

                aggregationOperators = aggregationOperators.concat(_orErrDesc.matchOps);
            }

            if (typeof aggregateBy_realColumnName !== 'undefined' && aggregateBy_realColumnName !== null && aggregateBy_realColumnName !== "" && aggregateBy_realColumnName != config.aggregateByDefaultColumnName) {

                if (typeof stackBy !== 'undefined' && stackBy !== null && stackBy !== "") {
                    var stackBy_realColumnName = importedDataPreparation.RealColumnNameFromHumanReadableColumnName(stackBy, dataSourceDescription);

                    aggregationOperators = aggregationOperators.concat(
                        [
                            {$unwind: "$" + "rowParams." + groupBy_realColumnName},
                            {$unwind: "$" + "rowParams." + stackBy_realColumnName},
                            {
                                $group: {
                                    _id: {
                                        groupBy: "$" + "rowParams." + groupBy_realColumnName,
                                        stackBy: "$" + "rowParams." + stackBy_realColumnName
                                    },
                                    value: {$sum: "$" + "rowParams." + aggregateBy_realColumnName}
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    label: "$_id.groupBy",
                                    stack: "$_id.stackBy",
                                    value: 1
                                }
                            },
                            {
                                $sort: {value: sortDirection} // priotize by incidence, since we're $limit-ing below
                            }
                        ]);

                } else {

                    // Count by summing numeric field in group if option in datasource description is set
                    aggregationOperators = aggregationOperators.concat(
                        [
                            {$unwind: "$" + "rowParams." + groupBy_realColumnName}, // requires MongoDB 3.2, otherwise throws an error if non-array
                            {
                                $group: {
                                    _id: "$" + "rowParams." + groupBy_realColumnName,
                                    value: {$sum: "$" + "rowParams." + aggregateBy_realColumnName}
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    label: "$_id",
                                    value: 1
                                }
                            },
                            {
                                $sort: {value: sortDirection} // priotize by incidence, since we're $limit-ing below
                            }
                     
                        ]);

                }
            } else {
                // Count by number of records

                if (typeof stackBy !== 'undefined' && stackBy !== null && stackBy !== "") {
                    var stackBy_realColumnName = importedDataPreparation.RealColumnNameFromHumanReadableColumnName(stackBy, dataSourceDescription);

                    aggregationOperators = aggregationOperators.concat(
                        [
                            {$unwind: "$" + "rowParams." + groupBy_realColumnName},
                            {$unwind: "$" + "rowParams." + stackBy_realColumnName},
                            {
                                $group: {
                                    _id: {
                                        groupBy: "$" + "rowParams." + groupBy_realColumnName,
                                        stackBy: "$" + "rowParams." + stackBy_realColumnName
                                    },
                                    value: {$sum: 1}
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    label: "$_id.groupBy",
                                    stack: "$_id.stackBy",
                                    value: 1
                                }
                            },
                            {
                                $sort: {value: sortDirection} // priotize by incidence, since we're $limit-ing below
                            }
                    
                        ]);

                } else {

                    aggregationOperators = aggregationOperators.concat(
                        [
                            {$unwind: "$" + "rowParams." + groupBy_realColumnName}, // requires MongoDB 3.2, otherwise throws an error if non-array
                            { // unique/grouping and summing stage
                                $group: {
                                    _id: "$" + "rowParams." + groupBy_realColumnName,
                                    value: {$sum: 1}
                                }
                            },
                            { // reformat
                                $project: {
                                    _id: 0,
                                    label: "$_id",
                                    value: 1
                                }
                            },
                            { // priotize by incidence, since we're $limit-ing below
                                $sort: {value: sortDirection}
                            }
                        ]);
                }
            }

            var doneFn = function (err, _multigroupedResults) {
                if (err) return done(err);

                if (_multigroupedResults == undefined || _multigroupedResults == null) _multigroupedResults = [];

                var _multigroupedResults_object = {};
                _multigroupedResults.forEach(function (el) {
                    var stack = el.stack && el.stack != '' ? el.stack : 'default';
                    if (_multigroupedResults_object[stack] === undefined) {
                        _multigroupedResults_object[stack] = [];
                    }
                    _multigroupedResults_object[stack].push(el);
                });

                 _.forOwn(_multigroupedResults_object, function(_groupedResults, category) {

                    var displayableCategory;
                    if (groupBy_isDate) {
                        displayableCategory = func.convertDateToBeRecognizable(category, groupBy_realColumnName, dataSourceDescription);
                    } else {
                        displayableCategory = func.ValueToExcludeByOriginalKey(
                            category, dataSourceDescription, groupBy_realColumnName, 'barChart');
                        if (!displayableCategory) return;
                    }

                    var finalizedButNotCoalesced_groupedResults = [];
                    _.each(_groupedResults, function (el, i) {
                        //
                        if (el.label) {
                            var displayableLabel;

                            displayableLabel = func.ValueToExcludeByOriginalKey(
                                el.label, dataSourceDescription, groupBy_realColumnName, 'barChart');
                            if (!displayableLabel) return;

                            finalizedButNotCoalesced_groupedResults.push({
                                value: el.value,
                                label: displayableLabel
                            });
                        } else {
                            finalizedButNotCoalesced_groupedResults.push({
                                value: el.value,
                                label: 'default'
                            });
                        }
                    });

                    var summedValuesByLowercasedLabels = {};
                    var titleWithMostMatchesAndMatchAggregateByLowercasedTitle = {};
                    _.each(finalizedButNotCoalesced_groupedResults, function (el) {
                        var label = el.label;
                        var value = el.value;
                        var label_toLowerCased = label.toLowerCase();
                        //
                        var existing_valueSum = summedValuesByLowercasedLabels[label_toLowerCased] || 0;
                        var new_valueSum = existing_valueSum + value;
                        summedValuesByLowercasedLabels[label_toLowerCased] = new_valueSum;
                        //
                        var existing_titleWithMostMatchesAndMatchCount = titleWithMostMatchesAndMatchAggregateByLowercasedTitle[label_toLowerCased] || {
                                label: '',
                                value: -1
                            };
                        if (existing_titleWithMostMatchesAndMatchCount.value < value) {
                            var new_titleWithMostMatchesAndMatchCount = {label: label, value: value};
                            titleWithMostMatchesAndMatchAggregateByLowercasedTitle[label_toLowerCased] = new_titleWithMostMatchesAndMatchCount;
                        }
                    });
                    var lowercasedLabels = Object.keys(summedValuesByLowercasedLabels);
                    var groupedResults = [];
                    _.each(lowercasedLabels, function (key, i, arr) {
                        var summedValue = summedValuesByLowercasedLabels[key];
                        var reconstitutedDisplayableTitle = key;
                        var titleWithMostMatchesAndMatchCount = titleWithMostMatchesAndMatchAggregateByLowercasedTitle[key];
                        if (typeof titleWithMostMatchesAndMatchCount === 'undefined') {
                            winston.error("❌  This should never be undefined.");
                            callback(new Error('Unexpectedly undefined title with most matches'), null);

                            return;
                        } else {
                            reconstitutedDisplayableTitle = titleWithMostMatchesAndMatchCount.label;
                        }
                        groupedResults.push({
                            value: summedValue,
                            label: reconstitutedDisplayableTitle
                        });
                    });

                    stackedResultsByGroup[displayableCategory] = groupedResults;

                });



                

                graphData = [];

                var barColors = dataSourceDescription.fe_views.views.barChart.stackedBarColors ? dataSourceDescription.fe_views.views.barChart.stackedBarColors : {};

                if (Array.isArray(stackedResultsByGroup)) {
                    graphData = {
                        categories: [dataSourceDescription.title],
                        data: stackedResultsByGroup.map(function(row) {

                            row.value = Number(row.value);
                            if (groupBy_isDate) {
                                var offsetTime = new Date(row.label);
                                offsetTime = new Date(offsetTime.getTime() + offsetTime.getTimezoneOffset() * 60 * 1000);
                                row.label = offsetTime;
                            }
                            return row;

                        })
                    };

                } else {
                    graphData = {categories: [], data: []};
                    for (var category in stackedResultsByGroup) {
                        if (stackedResultsByGroup.hasOwnProperty(category)) {
                            graphData.categories.push(category);

                            graphData.data.push(stackedResultsByGroup[category].map(function(row) {
                                row.value = Number(row.value);
                                if (groupBy_isDate) {
                                    var offsetTime = new Date(row.label);
                                    offsetTime = new Date(offsetTime.getTime() + offsetTime.getTimezoneOffset() * 60 * 1000);
                                    row.label = offsetTime;
                                }
                                return row;
                            }));

                            if (barColors && barColors[category]) {
                                if (!graphData.colors) graphData.colors = [];
                                graphData.colors.push(barColors[category]);
                            }
                        }
                    }
                }
                done();
            };

            processedRowObjects_mongooseModel.aggregate(aggregationOperators).allowDiskUse(true)/* or we will hit mem limit on some pages*/.exec(doneFn);
        });

        batch.end(function (err) {
            if (err) return callback(err);

            //
            var data =
            {
                env: process.env,
                
                user: req.user,

                arrayTitle: dataSourceDescription.title,
                array_source_key: source_pKey,
                team: dataSourceDescription._team?  dataSourceDescription._team : null,
                brandColor: dataSourceDescription.brandColor,
                sourceDoc: sourceDoc,
                sourceDocURL: sourceDocURL,
                view_visibility: dataSourceDescription.fe_views.views ? dataSourceDescription.fe_views.views : {},
                view_description: dataSourceDescription.fe_views.views.barChart.description ? dataSourceDescription.fe_view.views.barChart.description : "",
                //
                groupBy: groupBy,
                groupBy_isDate: groupBy_isDate,
              // barColors: dataSourceDescription.fe_barChart_stackedBarColors ? dataSourceDescription.fe_barChart_stackedBarColors : {},
                groupBy_outputInFormat: groupBy_outputInFormat,
                //
                filterObj: filterObj,
                isFilterActive: isFilterActive,
                uniqueFieldValuesByFieldName: uniqueFieldValuesByFieldName,
                truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill: truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill,
                //
                searchQ: searchQ,
                searchCol: searchCol,
                isSearchActive: isSearchActive,
                //

                sortDir: sortDir,
                defaultGroupByColumnName_humanReadable: defaultGroupByColumnName_humanReadable,
                colNames_orderedForGroupByDropdown: importedDataPreparation.HumanReadableFEVisibleColumnNamesWithSampleRowObject_orderedForLineGraphGroupByDropdown(sampleDoc, dataSourceDescription),
                colNames_orderedForSortByDropdown: importedDataPreparation.HumanReadableFEVisibleColumnNamesWithSampleRowObject_orderedForSortByDropdown(sampleDoc, dataSourceDescription),
                //
                routePath_base: routePath_base,
                // datasource relationship
                mapping_source_pKey: mapping_source_pKey,
                mapping_default_filterObj: mapping_default_filterObj,
                mapping_default_view: mapping_default_view,
                mapping_groupByObj: mapping_groupByObj,
                // multiselectable filter fields
                multiselectableFilterFields: dataSourceDescription.fe_filters.fieldsMultiSelectable,
                // Aggregate By
                aggregateBy_humanReadable_available: aggregateBy_humanReadable_available,
                defaultAggregateByColumnName_humanReadable: defaultAggregateByColumnName_humanReadable,
                aggregateBy: aggregateBy,
                // graphData contains all the data rows; used by the template to create the linechart
                graphData: graphData ,
                isHorizontal: dataSourceDescription.fe_views.views.barChart.isHorizontal,
                isNormalized: stackBy_realColumnName == groupBy_realColumnName ? false : dataSourceDescription.fe_views.views.barChart.isNormalized,
                padding: dataSourceDescription.fe_views.views.barChart.padding
            };

            callback(err, data);
        });



    })
   
};

module.exports = router;