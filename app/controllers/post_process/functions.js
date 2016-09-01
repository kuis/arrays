var winston = require('winston');
var moment = require('moment');

var importedDataPreparation = require('../../datasources/utils/imported_data_preparation');
var cached_values_model = require('../../models/cached_values_model');
var import_datatypes = require('../../datasources/utils/import_datatypes');
var config = new require('./config.js')();

var constructor = function() {
    var self = this;
    //
    self._routePathByAppendingQueryStringToVariationOfBase = function(routePath_variation, queryString, routePath_base)
    {
        if (routePath_variation === routePath_base) {
            routePath_variation += "?";
        } else {
            routePath_variation += "&";
        }
        routePath_variation += queryString;

        return routePath_variation;
    };
    //
    self._urlQueryByAppendingQueryStringToExistingQueryString = function(existingQueryString, queryStringToAppend)
    {
        var newWholeQueryString = existingQueryString;
        if (existingQueryString.length == 0) {
            newWholeQueryString += "?";
        } else {
            newWholeQueryString += "&";
        }
        newWholeQueryString += queryStringToAppend;

        return newWholeQueryString;
    };
    //
    self._activeFilter_matchOp_orErrDescription_fromMultiFilter = function(dataSourceDescription, filterObj)
    {
        var filterCols = Object.keys(filterObj);
        var filterCols_length = filterCols.length;
        if (filterCols_length == 0) {
            winston.error("❌  Programmer runtime check error. Filter obj had no keys.");

            return { err: new Error("No active filter despite filterObj") };
        }
        var conditions = [];
        for (var i = 0 ; i < filterCols_length ; i++) {
            var filterCol = filterCols[i];
            var filterVals = filterObj[filterCol];
            var filterVals_length = filterVals.length;
            for (var j = 0 ; j < filterVals_length ; j++) {
                var filterVal = filterVals[j];
                var matchConditions = {};
                if (typeof filterVal === 'string') {
                    matchConditions = self._activeFilter_matchCondition_orErrDescription(dataSourceDescription, filterCol, filterVal);
                } else if (filterVal.min !== null || filterVal.max !== null) {
                    matchConditions = self._activeFilterRange_matchCondition_orErrDescription(dataSourceDescription, filterCol, filterVal.min, filterVal.max);
                } else {
                    // TODO - ERROR - Unexpected format
                }
                if (typeof matchConditions.err !== 'undefined') {
                    return { err: matchConditions.err };
                }
                conditions = conditions.concat(matchConditions.matchConditions);
            }
        }
        if (conditions.length == 0) {
            winston.error("❌  Programmer runtime check error. No match conditions in multifilter for filter obj: ", filterObj);

            return { err: new Error("No match conditions in multifilter despite filterObj") };
        }

        return { matchOps: conditions };
    };
    //
    self._activeFilter_matchCondition_orErrDescription = function(dataSourceDescription, filterCol, filterVal)
    {
        var matchConditions = undefined;
        var isAFabricatedFilter = false; // finalize
        if (dataSourceDescription.fe_filters_fabricatedFilters) {
            var fabricatedFilters_length = dataSourceDescription.fe_filters_fabricatedFilters.length;
            for (var i = 0 ; i < fabricatedFilters_length ; i++) {
                var fabricatedFilter = dataSourceDescription.fe_filters_fabricatedFilters[i];
                if (fabricatedFilter.title === filterCol) {
                    isAFabricatedFilter = true;
                    // Now find the applicable filter choice
                    var choices = fabricatedFilter.choices;
                    var choices_length = choices.length;
                    var foundChoice = false;
                    for (var j = 0 ; j < choices_length ; j++) {
                        var choice = choices[j];
                        if (choice.title === filterVal) {
                            foundChoice = true;
                            matchConditions = [{$match: choice["$match"]}];

                            break; // found the applicable filter choice
                        }
                    }
                    if (foundChoice == false) { // still not found despite the filter col being recognized as fabricated
                        return { err: new Error("No such choice \"" + filterVal + "\" for filter " + filterCol) };
                    }

                    break; // found the applicable fabricated filter
                }
            }
        }
        if (isAFabricatedFilter == true) { // already obtained matchConditions just above
            if (typeof matchConditions === 'undefined') {
                return { err: new Error("Unexpectedly missing matchConditions given fabricated filter…" + JSON.stringify(urlQuery)) };
            }
        } else {
            var realColumnName = importedDataPreparation.RealColumnNameFromHumanReadableColumnName(filterCol, dataSourceDescription);
            var realColumnName_path = "rowParams." + realColumnName;
            var realFilterValue = filterVal; // To finalize in case of override…
            // To coercion the date field into the valid date
            var raw_rowObjects_coercionSchema = dataSourceDescription.raw_rowObjects_coercionScheme;
            var isDate = raw_rowObjects_coercionSchema && raw_rowObjects_coercionSchema[realColumnName]
                && raw_rowObjects_coercionSchema[realColumnName].do === import_datatypes.Coercion_ops.ToDate;
            if (!isDate) {
                var oneToOneOverrideWithValuesByTitleByFieldName = dataSourceDescription.fe_filters_oneToOneOverrideWithValuesByTitleByFieldName || {};
                var oneToOneOverrideWithValuesByTitle_forThisColumn = oneToOneOverrideWithValuesByTitleByFieldName[realColumnName];
                if (oneToOneOverrideWithValuesByTitle_forThisColumn) {
                    var overrideValue = oneToOneOverrideWithValuesByTitle_forThisColumn[filterVal];
                    if (typeof overrideValue === 'undefined') {
                        var errString = "Missing override value for overridden column " + realColumnName + " and incoming filterVal " + filterVal;
                        winston.error("❌  " + errString); // we'll just use the value they entered - maybe a user is manually editing the URL
                    } else {
                        realFilterValue = overrideValue;
                    }
                }

                // We need to consider that the search column might be array
                // escape Mongo reserved characters in Mongo
                realFilterValue = realFilterValue.split("(").join("\\(")
                    .split(")").join("\\)")
                    .split("+").join("\\+")
                    .split("$").join("\\$");

                matchConditions = self._activeSearch_matchOp_orErrDescription(dataSourceDescription, realColumnName, realFilterValue).matchOps;

            } else {
                matchConditions = self._activeSearch_matchOp_orErrDescription(dataSourceDescription, realColumnName, filterVal).matchOps;
            }
        }
        if (typeof matchConditions === 'undefined') {
            throw new Error("Undefined match condition");
        }

        return { matchConditions: matchConditions };
    };
    //
    self._activeFilterRange_matchCondition_orErrDescription = function(dataSourceDescription, filterCol, filterValMin, filterValMax)
    {
        var realColumnName = importedDataPreparation.RealColumnNameFromHumanReadableColumnName(filterCol, dataSourceDescription);
        var realColumnName_path = "rowParams." + realColumnName;
        var realFilterValueMin = filterValMin, realFilterValueMax = filterValMax; // To finalize in case of override…
        // To coercion the date field into the valid date
        var raw_rowObjects_coercionSchema = dataSourceDescription.raw_rowObjects_coercionScheme;
        var isDate = raw_rowObjects_coercionSchema && raw_rowObjects_coercionSchema[realColumnName]
            && raw_rowObjects_coercionSchema[realColumnName].do === import_datatypes.Coercion_ops.ToDate;
        if (!isDate) {
            var oneToOneOverrideWithValuesByTitleByFieldName = dataSourceDescription.fe_filters_oneToOneOverrideWithValuesByTitleByFieldName || {};
            var oneToOneOverrideWithValuesByTitle_forThisColumn = oneToOneOverrideWithValuesByTitleByFieldName[realColumnName];
            if (oneToOneOverrideWithValuesByTitle_forThisColumn) {
                var overrideValueMin = oneToOneOverrideWithValuesByTitle_forThisColumn[filterValMin];
                if (typeof overrideValueMin === 'undefined') {
                    var errString = "Missing override value for overridden column " + realColumnName + " and incoming filterValMin " + filterValMin;
                    winston.error("❌  " + errString); // we'll just use the value they entered - maybe a user is manually editing the URL
                    throw new Error("Undefined match condition");
                } else {
                    realFilterValueMin = overrideValueMin;
                }

                var overrideValueMax = oneToOneOverrideWithValuesByTitle_forThisColumn[filterValMax];
                if (typeof overrideValueMax === 'undefined') {
                    var errString = "Missing override value for overridden column " + realColumnName + " and incoming filterValMax " + filterValMax;
                    winston.error("❌  " + errString); // we'll just use the value they entered - maybe a user is manually editing the URL
                    throw new Error("Undefined match condition");
                } else {
                    realFilterValueMax = overrideValueMax;
                }
            }
        } else {
            var filterDateMin = moment(filterValMin);
            if (filterDateMin.isValid()) {
                realFilterValueMin = filterDateMin.utc().startOf('day').toDate();
            } else {
                throw new Error('Invalid date');
            }
            var filterDateMax = moment(filterValMax);
            if (filterDateMax.isValid()) {
                realFilterValueMax = filterDateMax.utc().startOf('day').toDate();
            } else {
                throw new Error('Invalid date');
            }
        }

        // We need to consider that the search column is array
        var projectOp = { $project: {
            _id: 1,
            pKey: 1,
            srcDocPKey: 1,
            rowIdxInDoc: 1,
            rowParams: 1,
            matchingField: {
                $cond: {
                    if: { $isArray: "$" + realColumnName_path },
                    then: { $size: "$" + realColumnName_path }, // gets the number of items in the array
                    else: "$" + realColumnName_path
                }
            }
        }};

        var matchOp = { $match: {} };
        matchOp["$match"]["matchingField"] = {$gte: realFilterValueMin, $lte: realFilterValueMax};

        return { matchConditions: [projectOp, matchOp] };
    };
    //
    self._activeSearch_matchOp_orErrDescription = function(dataSourceDescription, searchCol, searchQ)
    { // returns dictionary with err or matchOp
        var realColumnName = importedDataPreparation.RealColumnNameFromHumanReadableColumnName(searchCol, dataSourceDescription);
        var realColumnName_path = "rowParams." + realColumnName;

        // We need to consider that the search column is array
        var unwindOp = { $unwind: '$' + realColumnName_path };
        var matchOp = { $match: {} };
        var raw_rowObjects_coercionSchema = dataSourceDescription.raw_rowObjects_coercionScheme;
        var isDate = raw_rowObjects_coercionSchema && raw_rowObjects_coercionSchema[realColumnName]
            && raw_rowObjects_coercionSchema[realColumnName].do === import_datatypes.Coercion_ops.ToDate;
        if (!isDate) {
            matchOp["$match"][realColumnName_path] = { $regex: searchQ, $options: "i" };
        } else {
            var searchDate = moment.utc(searchQ);
            var realSearchValue;
            if (searchDate.isValid()) {
                realSearchValue = searchDate.utc().startOf('day').toDate();
            } else { // Invalid Date
                return { err: 'Invalid Date' };
            }
            matchOp["$match"][realColumnName_path] = { $eq: realSearchValue };
        }

        var groupOp = {
            $group: {
                _id: '$_id',
                pKey: {'$first': '$pKey'},
                srcDocPKey: {'$first': '$srcDocPKey'},
                rowIdxInDoc: {'$first': '$rowIdxInDoc'},
                rowParams: {'$first': '$rowParams'},
                wordExistence: {'$first': '$wordExistence'}
            }
        };

        return { matchOps: [unwindOp, matchOp, groupOp] };
    };
    //
    self._topUniqueFieldValuesForFiltering = function(source_pKey, dataSourceDescription, sampleDoc, callback)
    {
        cached_values_model.MongooseModel.findOne({ srcDocPKey: source_pKey }, function(err, doc)
        {
            if (err) {
                callback(err, null);

                return;
            }
            if (doc == null) {
                callback(new Error('Missing cached values document for srcDocPKey: ' + source_pKey), null);

                return;
            }
            var uniqueFieldValuesByFieldName = doc.limitedUniqValsByHumanReadableColName;
            if (uniqueFieldValuesByFieldName == null || typeof uniqueFieldValuesByFieldName === 'undefined') {
                callback(new Error('Unexpectedly missing uniqueFieldValuesByFieldName for srcDocPKey: ' + source_pKey), null);

                return;
            }
            //
            // Now insert fabricated filters
            if (dataSourceDescription.fe_filters_fabricatedFilters) {
                var fabricatedFilters_length = dataSourceDescription.fe_filters_fabricatedFilters.length;
                for (var i = 0 ; i < fabricatedFilters_length ; i++) {
                    var fabricatedFilter = dataSourceDescription.fe_filters_fabricatedFilters[i];
                    var choices = fabricatedFilter.choices;
                    var choices_length = choices.length;
                    var values = [];
                    for (var j = 0 ; j < choices_length ; j++) {
                        var choice = choices[j];
                        values.push(choice.title);
                    }
                    if (typeof uniqueFieldValuesByFieldName[fabricatedFilter.title] !== 'undefined') {
                        var errStr = 'Unexpectedly already-existent filter for the fabricated filter title ' + fabricatedFilter.title;
                        winston.error("❌  " + errStr);
                        callback(new Error(errStr), null);

                        return;
                    }
                    uniqueFieldValuesByFieldName[fabricatedFilter.title] = values;
                }
            }
            //
            // Now insert keyword filters
            if (dataSourceDescription.fe_filters_keywordFilters) {
                var keywordFilters_length = dataSourceDescription.fe_filters_keywordFilters.length;
                for (var i = 0 ; i < keywordFilters_length ; i++) {
                    var keywordFilter = dataSourceDescription.fe_filters_keywordFilters[i];
                    var choices = keywordFilter.choices;
                    var choices_length = choices.length;
                    var values = [];
                    for (var j = 0 ; j < choices_length ; j++) {
                        var choice = choices[j];
                        values.push(choice);
                    }
                    if (typeof uniqueFieldValuesByFieldName[keywordFilter.title] !== 'undefined') {
                        var errStr = 'Unexpectedly already-existent filter for the keyword filter title ' + keywordFilter.title;
                        winston.error("❌  " + errStr);
                        callback(new Error(errStr), null);

                        return;
                    }
                    uniqueFieldValuesByFieldName[keywordFilter.title] = values;
                }
            }
            //
            callback(null, uniqueFieldValuesByFieldName);
        });
    };
    //
    self._reverseDataTypeCoersionToMakeFEDisplayableValFrom = function(originalVal, key, dataSourceDescription)
    {
        var displayableVal = originalVal;
        // var prototypeName = Object.prototype.toString.call(originalVal);
        // if (prototypeName === '[object Date]') {
        // }
        // ^ We could check this but we ought to have the info, and checking the
        // coersion scheme will make this function slightly more rigorous.
        // Perhaps we could do some type-introspection automated formatting later
        // here if needed, but I think generally that kind of thing would be done case-by-case
        // in the template, such as comma-formatting numbers.
        var raw_rowObjects_coercionScheme = dataSourceDescription.raw_rowObjects_coercionScheme;
        if (raw_rowObjects_coercionScheme && typeof raw_rowObjects_coercionScheme !== 'undefined') {
            var coersionSchemeOfKey = raw_rowObjects_coercionScheme["" + key];
            if (coersionSchemeOfKey && typeof coersionSchemeOfKey !== 'undefined') {
                var _do = coersionSchemeOfKey.do;
                if (_do === import_datatypes.Coercion_ops.ToDate) {
                    if (originalVal == null || originalVal == "") {
                        return originalVal; // do not attempt to format
                    }
                    var dateFormat = null;
                    var fe_outputInFormat = dataSourceDescription.fe_outputInFormat;
                    if (fe_outputInFormat && typeof fe_outputInFormat !== 'undefined') {
                        var outputInFormat_ofKey = fe_outputInFormat["" + key];
                        if (outputInFormat_ofKey && typeof outputInFormat_ofKey !== 'undefined') {
                            dateFormat = outputInFormat_ofKey.format || null; // || null to hit check below
                        }
                    }
                    if (dateFormat == null) { // still null - no specific ovrride, so check initial coersion
                        var opts = coersionSchemeOfKey.opts;
                        if (opts && typeof opts !== 'undefined') {
                            dateFormat = opts.format;
                        }
                    }
                    if (dateFormat == null) { // still null? use default
                        dateFormat = config.defaultFormat;
                    }
                    displayableVal = moment.utc(originalVal).format(dateFormat);
                } else { // nothing to do? (no other types yet)
                }
            } else { // nothing to do?
            }
        } else { // nothing to do?
        }
        //
        return displayableVal;
    };
    //
    self._new_truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill = function (dataSourceDescription)
    {
        var truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill = {};
        var fe_filters_fabricatedFilters = dataSourceDescription.fe_filters_fabricatedFilters;
        if (typeof fe_filters_fabricatedFilters !== 'undefined') {
            var fe_filters_fabricatedFilters_length = fe_filters_fabricatedFilters.length;
            for (var i = 0 ; i < fe_filters_fabricatedFilters_length ; i++) {
                var fabricatedFilter = fe_filters_fabricatedFilters[i];
                var filterCol = fabricatedFilter.title;
                truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill[filterCol] = {};
                var choices = fabricatedFilter.choices;
                var choices_length = choices.length;
                if (choices_length == 1) { // then we do not want to display the filter col key for this one
                    for (var j = 0 ; j < choices_length ; j++) {
                        var choice = choices[j];
                        var filterVal = choice.title;
                        truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill[filterCol][filterVal] = true;
                    }
                }
            }
        }

        return truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill;
    };
    //
    self._new_reconstructedURLEncodedFilterObjAsFilterJSONString = function(filterObj)
    {
        var reconstructedURLEncodedFilterObjForFilterJSONString = {}; // to construct
        var filterObj_keys = Object.keys(filterObj);
        var filterObj_keys_length = filterObj_keys.length;
        for (var i = 0 ; i < filterObj_keys_length ; i++) {
            var filterObj_key = filterObj_keys[i];
            var filterObj_key_vals = filterObj[filterObj_key];
            // we need to re-URI-encode filterObj_key_vals elements and then stringify
            var filterObj_key_vals_length = filterObj_key_vals.length;
            var encodedVals = [];
            for (var j = 0 ; j < filterObj_key_vals_length ; j++) {
                var filterObj_key_val = filterObj_key_vals[j];
                var filterIsString = typeof filterObj_key_val === 'string';
                var filterVal = filterIsString ? encodeURIComponent(filterObj_key_val) : filterObj_key_val;
                encodedVals.push(filterVal);
            }
            reconstructedURLEncodedFilterObjForFilterJSONString[filterObj_key] = encodedVals;
        }
        var filterJSON_uriEncodedVals = JSON.stringify(reconstructedURLEncodedFilterObjForFilterJSONString);

        return filterJSON_uriEncodedVals;
    }

    //
    self.buildFilterAggregation = function(urlQuery, dataSourceDescription, data) {
        var filterJSON = urlQuery.filterJSON;
        var filterObj = {};
        var isFilterActive = false;
        if (typeof filterJSON !== 'undefined' && filterJSON != null && filterJSON.length != 0) {
            try {
                filterObj = JSON.parse(filterJSON);
                if (typeof filterObj !== 'undefined' && filterObj != null && Object.keys(filterObj) != 0) {
                    isFilterActive = true;
                } else {
                    filterObj = {}; // must replace it to prevent errors below
                }
            } catch (e) {
                winston.error("❌  Error parsing filterJSON: ", filterJSON);
                return e;
            }
        }

        var aggregationOperators = [];
        // We must re-URI-encode the filter vals since they get decoded
        var filterJSON_uriEncodedVals = self._new_reconstructedURLEncodedFilterObjAsFilterJSONString(filterObj);

        if (isFilterActive) { // rules out undefined filterJSON
            var _orErrDesc = self._activeFilter_matchOp_orErrDescription_fromMultiFilter(dataSourceDescription, filterObj);
            if (typeof _orErrDesc.err !== 'undefined') {
                return _orErrDesc.err;
            }
            aggregationOperators = _orErrDesc.matchOps;
        }

        var truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill = functions._new_truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill(dataSourceDescription);

        if (data === undefined) data = {};
        data.filterObj = filterObj;
        data.filterJSON_nonURIEncodedVals = filterJSON;
        data.filterJSON = filterJSON_uriEncodedVals;
        data.isFilterActive = isFilterActive;
        data.uniqueFieldValuesByFieldName = uniqueFieldValuesByFieldName;
        data.truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill = truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill;

        if (isFilterActive) {
            var appendQuery = "filterJSON=" + filterJSON_uriEncodedVals;
            routePath_withoutPage       = self._routePathByAppendingQueryStringToVariationOfBase(routePath_withoutPage,      appendQuery, routePath_base);
            routePath_withoutSortBy     = self._routePathByAppendingQueryStringToVariationOfBase(routePath_withoutSortBy,    appendQuery, routePath_base);
            routePath_withoutSortDir    = self._routePathByAppendingQueryStringToVariationOfBase(routePath_withoutSortDir,   appendQuery, routePath_base);
            urlQuery_forSwitchingViews  = self._urlQueryByAppendingQueryStringToExistingQueryString(urlQuery_forSwitchingViews, appendQuery);
        }
        data.routePath_withoutFilter = routePath_withoutFilter;

        return aggregationOperators;
    }
    //
    self.buildSearchAggregation = function(urlQuery, dataSourceDescription, data) {
        var aggregationOperators = [];

        //
        var searchCol = urlQuery.searchCol;
        var searchQ = urlQuery.searchQ;
        var isSearchActive = typeof searchCol !== 'undefined' && searchCol != null && searchCol != "" // Not only a column
            && typeof searchQ !== 'undefined' && searchQ != null && searchQ != "";  // but a search query

        //
        var aggregationOperators = [];
        if (isSearchActive) {
            var _orErrDesc = self._activeSearch_matchOp_orErrDescription(dataSourceDescription, searchCol, searchQ);
            if (typeof _orErrDesc.err !== 'undefined') {
                return _orErrDesc.err;
            }
            aggregationOperators = _orErrDesc.matchOps;
        }

        if (data === undefined) {
            data = {};
        }
        //
        data.searchQ = searchQ;
        data.searchCol = searchCol;
        data.isSearchActive = isSearchActive;

        if (isSearchActive) {
            var appendQuery = "searchCol=" + searchCol + "&" + "searchQ=" + searchQ;
            routePath_withoutFilter     = self._routePathByAppendingQueryStringToVariationOfBase(routePath_withoutFilter,    appendQuery, routePath_base);
            routePath_withoutPage       = self._routePathByAppendingQueryStringToVariationOfBase(routePath_withoutPage,      appendQuery, routePath_base);
            routePath_withoutSortBy     = self._routePathByAppendingQueryStringToVariationOfBase(routePath_withoutSortBy,    appendQuery, routePath_base);
            routePath_withoutSortDir    = self._routePathByAppendingQueryStringToVariationOfBase(routePath_withoutSortDir,   appendQuery, routePath_base);
            urlQuery_forSwitchingViews  = self._urlQueryByAppendingQueryStringToExistingQueryString(urlQuery_forSwitchingViews, appendQuery);
        }

        return aggregationOperators;
    }
    //
    self.buildSourceDocument = function()
    {

    }
    //
    self.buildSampleDocument = function()
    {

    }
    //
    self.countWholeSet = function()
    {

    }
    //
    self.buildPagedDocs = function()
    {

    }

    return self;
};

module.exports = constructor;