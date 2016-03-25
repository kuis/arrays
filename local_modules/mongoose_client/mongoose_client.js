//
//
//
var mongoose = require('mongoose');
//
const dbName = 'arraysdb'
const developmentDBURI = 'mongodb://localhost/' + dbName
//
const productionDBUsername = 'arraysserver'
const productionDBPassword = 'AAELBzHUm73Ra9g5' // TODO: move this out of repo?
const productionDBURI = 'mongodb://' + productionDBUsername 
                        + ':' + productionDBPassword 
                        + '@ds019239-a0.mlab.com:19239,ds019239-a1.mlab.com:19239/' 
                        + dbName 
                        + '?replicaSet=rs-ds019239'
//
var fullDBURI = process.env.NODE_ENV == 'development' ? developmentDBURI : productionDBURI
//
console.log("💬  MongoDB URI: " , fullDBURI)
mongoose.connect(fullDBURI)
exports.mongoose = mongoose
//
var isConnected = false
var erroredOnConnection = false
//
var connection = mongoose.connection
connection.on('error', function(err)
{
    erroredOnConnection = true
    console.error("❌  MongoDB connection error:", err)
})
connection.once('open', function()
{
    isConnected = true
    console.log("📡  Connected to " + process.env.NODE_ENV + " MongoDB.")
})
exports.connection = connection
//
function WhenMongoDBConnected(fn)
{
    if (isConnected == true) {
        fn()
        
        return
    } else if (erroredOnConnection == true) {
        console.warn("‼️  Not going to call blocked Mongo fn,", fn)
        
        return
    }
    var period_ms = 100
    console.log("💬  Waiting " + period_ms + "ms until MongoDB is connected….")
    setTimeout(function()
    {
        WhenMongoDBConnected(fn)
    }, period_ms)
}
exports.WhenMongoDBConnected = WhenMongoDBConnected
//