"use strict";

var dummy
  , path = require('path')
  , hotplate = require('hotplate')
  , declare = require('simpledeclare')
  , debug = require('debug')('hotplate:hotCoreTransport:twilio')

  , SimpleDbLayer = require( 'simpledblayer' )
  , SimpleSchema = require( 'simpleschema' )
  , JsonRestStores = require( 'jsonreststores' )

  , hotCoreStore = require( 'hotplate/core_modules/hotCoreStore' )
  , hotCoreServerLogger = require( 'hotplate/core_modules/hotCoreServerLogger' )
  , twilio = require( 'twilio' )
;


exports = module.exports = {

  setRoutes: function( stores, app, configArray, done ){


    debug("SETTING ROUTES FOR TWILIO");
    getAllTransportConfig( 'sms-twilio', function( err, configArray ){
      if( err ) return cb( null );


      debug("*********************************************************");
      debug("*********************************************************");
      debug("*********************************************************");
      debug("******************* ROUTES STARTED **********************");
      debug("*********************************************************");
      debug("*********************************************************");
      debug("*********************************************************");
      debug( configArray );


      done( null );
    });

  },

  run: function( stores, configArray, done ){

    debug("RUNNING FOR TWILIO");

    getAllTransportConfig( 'sms-twilio', function( err, configArray ){
      if( err ) return cb( null );

      debug("*********************************************************");
      debug("*********************************************************");
      debug("*********************************************************");
      debug("***************************** run STARTED ***************");
      debug("*********************************************************");
      debug("*********************************************************");
      debug("*********************************************************");
      debug( configArray );


      done( null );
    });

  },

  sendMessage: function( messageTo, messageConfig, done ){
    debug("LAYER SENDING: ", messageTo );

    done( null );
  },

};
