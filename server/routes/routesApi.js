
var utils = require('../utils.js'),
fs = require('fs'),
g = require('../globals.js'),
mongoose = require('mongoose');
eval(fs.readFileSync('../client/validators.js').toString()); // Creates "Validators



exports.postUsersApi1 = function(req, res, next){
  
  var Workspace = mongoose.model('Workspace');
  next( new g.errors.ValidationError422('Message', [{ field: 'name', message: 'ppp' }]) );
  
  // utils.sendResponse( res, { data: { name: 'ppp' } } );
}