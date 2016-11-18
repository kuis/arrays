var mongoose = require( 'mongoose' );
var Schema = mongoose.Schema;
var crypto = require('crypto');
var jwt = require('jsonwebtoken');
var findOrCreate = require('mongoose-findorcreate');

var userSchema = new mongoose.Schema({
    email: {
        type: String,
        unique: true,
        required: true
    },
    firstName: String,
    lastName: String,
    profileImageUrl: String,
    provider: String, 
    hash: String,
    salt: String,
    _team: {type: Schema.Types.ObjectId, ref: 'Team'}
});






userSchema.plugin(findOrCreate);

userSchema.methods.setPassword = function(password){
    this.salt = crypto.randomBytes(16).toString('hex');
    this.hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64).toString('hex');
};

userSchema.methods.validPassword = function(password) {
    var hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64).toString('hex');
    return this.hash === hash;
};

userSchema.methods.generateJwt = function() {
    var expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);

    return jwt.sign({
        _id: this._id,
        email: this.email,
        name: this.name,
        exp: parseInt(expiry.getTime() / 1000),
    }, "MY_SECRET"); // DO NOT KEEP YOUR SECRET IN THE CODE!
};

module.exports = mongoose.model('User', userSchema);
