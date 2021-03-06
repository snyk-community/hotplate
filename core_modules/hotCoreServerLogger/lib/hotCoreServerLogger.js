"use strict";

/*!
 * Module dependencies.
 */

var dummy
, hotplate = require( 'hotplate' )
, debug = require('debug')('hotplate:hotCoreServerLogger')
;


exports.log = function( l, req, done ){


/*
  INPUTS FOR 'l':
  * logLevel
  * error (will be expanded as errorName, errorMessage, errorStack, errors )
  * message
  * data
  * workspaceId (if not there, will attempt to work it out from the request)
  * userId (if not there, will attempt to work it out from the request)
  * system


/*
  logLevel   : number  // If not defined, set as 1
  error      : object  // Optional (object)

  errorName  : string  // If error is defined, set as error.name
  errorMessage: string  // If error is defined, set as error.name
  errorStack : string  // If error is defined, set as error.stack
  errors     : object  // If undefined and error is defined and error.errors, set as error.errors (array)

  message    : string  // If undefined and error is defined, set as error.name || error.message
  data       : object  // Optional (object)
  loggedOn   : date    // Set as new Date()
  workspaceId: string  // Optional (valid workspaceId)
  userId     : string  // Optional (valid userId)
  system     : boolean // If undefined, set as false

  logLevels:
  1 -- Informational
  2 -- Important-ish
  3 -- Critical
*/

  var len = arguments.length;
  if( len == 1 ){
    var req = null;
    var done = function(){};
  } else if( len == 2 ){
    var done = function(){}
  }

  // Fix up sane defaults as per documentation
  if( ! l.logLevel ) l.logLevel = 1;
  if( l.error ){
    l.errorName = l.error.name;
    l.errorMessage = l.error.message;
    l.errorStack = l.error.stack;
    if( !Array.isArray( l.errors ) && Array.isArray( l.error.errors ) ) l.errors = l.error.errors;
  }
  if( typeof( l.message ) == 'undefined' && l.error ) l.message = l.error.message || l.error.name;

  l.loggedOn = new Date();
  l.system = !! l.system;

  if( req ){

    // If workspaceId wasn't passed, try to work it out from the request headers
    if( !l.workspaceId ){
      var workspaceId = req.headers[ 'x-hotplate-workspaceid' ] || req.params.workspaceId;
      if( workspaceId ) l.workspaceId = workspaceId;
    }

    // If userId wasn't passed, try to work it out from the request headers
    if( !l.userId  && req.session ){
      var userId = req.session.userId;
      if( userId ) l.userId = userId;
    }
  }

  // If the level is 3, critical, print the line to the screen
  if( l.logLevel >= 3 ){
    hotplate.critical("Logging a highly important line: %j", l, 'Error Object is:', require('util').inspect( l.error, { depth: 10 } ) );
    if( l.error ) console.log( l.error.stack );
  }

  debug("Logging: %o", l );

  // Emit the log event
  hotplate.hotEvents.emitCollect( 'log', l, done );
}
