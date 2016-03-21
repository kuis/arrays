//
//
// 
const async = require("async")
const fs = require('fs')
const parse = require('csv-parse')

const import_datatypes = require('./import_datatypes')
//
//
//
////////////////////////////////////////////////////////////////////////////////

var constructor = function(options, context)
{
    var self = this;
    self.options = options
    self.context = context
    
    self._init()
    
    return self
}
module.exports = constructor
constructor.prototype._init = function()
{
    var self = this;
    console.log("raw string documents controller is up")
}

//
constructor.prototype.Import_dataSourceDescriptions = function(dataSourceDescriptions)
{
    var self = this
    async.each(dataSourceDescriptions, function(dataSourceDescription, callback)
    {
        self._dataSourceParsingFunction(dataSourceDescription, callback) // so self is accessible within the called function
    }, function(err) 
    {
        console.log("✅  Import done.")
    });
}
constructor.prototype._dataSourceParsingFunction = function(dataSourceDescription, callback)
{
    var self = this
    var dataSource_uid = dataSourceDescription.uid
    var dataSource_import_revision = dataSourceDescription.import_revision

    // Generated    
    var dataSourceRevision_pKey = dataSource_uid+"-rev"+dataSource_import_revision

    var dataSource_title = dataSourceDescription.title

    var format = dataSourceDescription.format
    switch (format) {
        case import_datatypes.DataSourceFormats.CSV:
            console.log("self " , self)
            self._new_parsed_StringDocumentObject_fromCSVDataSourceDescription(dataSourceDescription, dataSource_title, dataSourceRevision_pKey, function(err, stringDocumentObject)
            {
                if (err) {
                    callback(err)
                    return
                }
                console.log("📌  TODO: Now pass import result to string document controller for merge import", stringDocumentObject)
        
            // TODO: put these into mongo asynchronously(.. concurrently, too?)
            // Do a find & update or create by primaryKey + sourceDocumentRevisionKey
            // However, on re-import, flash parsedRawRowObjects_primaryKeys and thus parse on stringDocumentObject in case rows change
        
                callback()
            })
        
            break;
        
        default:
            var errDescStr = "❌  Unrecognized data source format \"" + format + "\"."
            console.error(errDescStr);
            callback(new Error(errDescStr)); // skip this one
    }
}
//
constructor.prototype._new_parsed_StringDocumentObject_fromCSVDataSourceDescription = function(csvDescription, sourceDocumentTitle, sourceDocumentRevisionKey, fn) 
{
    var self = this
    
    const CSV_resources_path_prefix = __dirname + "/resources"
    var filename = csvDescription.filename
    var filepath = CSV_resources_path_prefix + "/" + filename    

    // todo: look up data type scheme here so we can do translation/mapping just below

    var parser = parse({delimiter: ','}, function(err, columnNamesAndThenRowObjectValues)
    { // Is it going to be a memory concern to hold entire large CSV files in memory?
        // console.log(columnNamesAndThenRowObjectValues);
        var parsed_rowObjectsById = []
        var parsed_rowObjectPrimaryKeys = []
        // 
        var columnNames = columnNamesAndThenRowObjectValues[0]
        var num_columnNames = columnNames.length
        var num_rows = columnNamesAndThenRowObjectValues.length - 1
        for (var rowIndex = 1 ; rowIndex < num_rows ; rowIndex++) {
            var rowObjectValues = columnNamesAndThenRowObjectValues[rowIndex]
            if (rowObjectValues.length != num_columnNames) {
                console.error("❌  Row has different number of values than number of CSV's number of columns. Skipping: ", rowObjectValues)
                continue
            }
            var rowObject = {}
            for (var columnIndex = 0 ; columnIndex < num_columnNames ; columnIndex++) {
                var columnName = columnNames[columnIndex]
                var rowValue = rowObjectValues[columnIndex]
          
                var typeFinalized_rowValue = rowValue // TODO: do type coersion/parsing here with functions
          
                rowObject["" + columnName] = typeFinalized_rowValue
            }
            var rowObject_primaryKey = csvDescription.fn_new_rowPrimaryKeyFromRowObject(rowObject, rowIndex)
            if (typeof rowObject_primaryKey === 'undefined' || rowObject_primaryKey == null || rowObject_primaryKey == "") {
                console.error("Error: missing pkey on row", rowObject, "with factory accessor", csvDescription.fn_new_rowPrimaryKeyFromRowObject)

                return
            }
            var parsedObject =
            {
                primaryKey_withinThisRevision: rowObject_primaryKey, // Queries to find this unique row will have to happen 
                dataSourceDocumentRevisionKey: sourceDocumentRevisionKey, // by primaryKey_withinThisRevision && dataSourceDocumentRevisionKey
                row_index: rowIndex,
                row_parameters: rowObject
            }
        
            parsed_rowObjectsById[rowObject_primaryKey] = parsedObject
            parsed_rowObjectPrimaryKeys.push(rowObject_primaryKey)
        }
        var stringDocumentObject = self.context.raw_string_documents_controller.New_templateForPersistableObject(sourceDocumentRevisionKey, sourceDocumentTitle, parsed_rowObjectsById, parsed_rowObjectPrimaryKeys)
        stringDocumentObject.filename = filename

        fn(null, stringDocumentObject)
    });
    fs.createReadStream(filepath).pipe(parser);
}
//