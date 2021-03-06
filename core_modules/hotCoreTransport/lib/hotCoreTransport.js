"use strict";

var dummy
  , path = require('path')
  , hotplate = require('hotplate')
  , declare = require('simpledeclare')
  , async = require('async')
  , debug = require('debug')('hotplate:hotCoreTransport')
  , sanitize = require('sanitize-caja')

  , SimpleDbLayer = require( 'simpledblayer' )
  , SimpleSchema = require( 'simpleschema' )
  , JsonRestStores = require( 'jsonreststores' )

  , hotCoreStore = require( 'hotplate/core_modules/hotCoreStore' )
  , hotCoreServerLogger = require( 'hotplate/core_modules/hotCoreServerLogger' )
  , logger = hotCoreServerLogger
;

/**
Provides tranport functionalities (SMS an email) to hotplate modules

@module hotCoreTransport
@main hotCoreTransport
@class hotCoreTransport
@static
*/

var intervalHandles = [];
var exitIntervals = false;

// On shutdown, stop all intervals and set exitIntervals to true
process.on( 'hotplateShutdown', function(){
  intervalHandles.forEach( function( i ){
    clearInterval( i );
  });
  exitIntervals = true;
});

// The stores variable is module-wide as some functions use them
var stores = {}

// Set some sane defaults

hotplate.config.set('hotCoreTransport', {
  outgoingQueueInterval: 30000,
  pollInterval: 5000,
  defaultAttemptDelay: 60000 * 60,

  activeTransports: {
    'email-default': {
      attachmentSizeLimit: 200 * 1000, // 200Kb
      defaultAttemptDelay: 60 * 60 * 1000, // 60*60 secs
    },
    //'sms-twilio': {},
    'sms-plivo': {
      signatureHost: null,

      // NOTE: /app/incomingsms/plivo-update will be added as a valid incoming route!
      updateRoute: '/app/incomingsms/plivo-update',

      // Port and host are used to tell the plivo server where to send updates
      updateHost: '27.33.233.17',
      updatePort: 3000,

      // NOTE: /app/incomingsms/plivo will be added as a valid incoming route!
      smsRoute: '/app/incomingsms/plivo',
      defaultAttemptDelay: 60 * 60, // 60*60 secs
    },
  }
});

//hotplate.hotEvents.onCollect( 'stores','hotCoreTransport',  hotplate.cacheable( function( done ){
//  done( null, {  aStore: { storeName: 'aStore', dbLayer: { dropAllIndexes: function(){} }  } } );
//}));

hotplate.hotEvents.onCollect( 'stores','hotCoreTransport', hotplate.cacheable( function( done ){
  hotCoreStore.get( function( err, s ){
    if( err ) return done( err );

    var HotStore = s.HotStore;
    var HotSchema = s.HotSchema;
    var BasicDbStore = s.BasicDbStore;
    var BasicSchema = s.BasicSchema;

    var Messages = declare( [ BasicDbStore ],  {

      schema: new HotSchema({
        id          : { type: 'id',     searchable: true },

        type        : { type: 'string', searchable: true, required: true,  notEmpty: true, trim: 5 },
        incoming    : { type: 'boolean', searchable: true, required: true },
        from        : { type: 'string', searchable: true, required: true,  notEmpty: false, trim: 255 },
        subject     : { type: 'string', searchable: true, required: false, notEmpty: false, trim: 1024 },
        bodyText    : { type: 'string', searchable: true, required: false,  notEmpty: false, trim: 256000 },
        bodyHtml    : { type: 'string', searchable: false, required: false,  notEmpty: false, trim: 256000 },
        bodyHtmlSane: { type: 'string', searchable: false, protected: true  },

        appData     : { type: 'serialize', searchable: false, required: false, trim: 256000 },

     }),

      idProperty: 'id',

      storeName:  'messages',

      nested: [
        {
          store: 'messagesTo',
          join: { 'messageId': 'id' },
          type: 'multiple'
        },

        {
          store: 'messagesAttachments',
          join: { 'messageId': 'id' },
          type: 'multiple'
        },

        {
          store: 'messagesDeliveryLog',
          join: { 'messageId': 'id' },
          type: 'multiple'
        },
      ],

      hotExpose: false,

      init: function f(){
        var self = this;

        this.inherited( f, arguments );

        // Make dead sure that, at db-layer level, bodyHtmlSane is _always_ set on insert AND update
        // (it's always derived from bodyHtml)
        self.dbLayer.onCollect( 'preInsert', function( record, options, done ){
          record.bodyHtmlSane = sanitize( record.bodyHtml );
          done();
        });
        self.dbLayer.onCollect( 'preUpdate', function( conditions, updateObject, options, done ){
          if( updateObject.bodyHtml ) updateObject.bodyHtmlSane = sanitize( updateObject.bodyHtml );
          done();
        });
      },

    });


    stores.messages = new Messages();



    var MessagesAttachments = declare( [ BasicDbStore ],  {

      schema: new BasicSchema({
        id             : { type: 'id', searchable: true },
        messageId      : { type: 'id', searchable: true },

        foreignId      : { type: 'string', searchable: true, required: false,  notEmpty: false, trim: 255 },
        retrieved      : { type: 'boolean', default: false },
        fileName       : { type: 'string', searchable: false, required: false,  notEmpty: true, trim: 255 },
        mimeType       : { type: 'string', searchable: false, required: false,  notEmpty: true, trim: 255 },
        size           : { type: 'number', searchable: false, required: false,  notempty: true },
        embeddedId     : { type: 'string', searchable: false, required: false,  notEmpty: true, trim: 255 },

        attachmentInfo : { type: 'serialize', required: false },
        attachmentData : { type: 'blob', searchable: false, required: false },
      }),

      idProperty: 'id',

      storeName:  'messagesAttachments',

      hotExpose: false,

      nested: [
        {
          type: 'lookup',
          localField: 'messageId',
          store: 'messages',
          //layerField: 'id'
          //join: { 'id' : 'messageId' },
        },
      ],

    });
    stores.messagesAttachments = new MessagesAttachments();

    // Status can be: todeliver, delivering, delivered, undeliverable, dontdeliver
    var MessagesTo = declare( [ BasicDbStore ],  {

      schema: new BasicSchema({
        id             : { type: 'id', searchable: true },
        messageId      : { type: 'id', searchable: true },

        foreignId   : { type: 'string',    searchable: true, required: false,  notEmpty: true, trim: 255 },
        foreignData : { type: 'serialize', searchable: false, required: false, trim: 256000 },

        appData     :  { type: 'serialize', searchable: false, required: false, trim: 256000 },

        to             : { type: 'string', searchable: true, required: true, notEmpty: true, trim: 255 },
        status         : { type: 'string', searchable: true, required: true, notEmpty: true, trim: 15 },
        failedAttempts : { type: 'number', searchable: true, required: true, default: 0, notEmpty: true },
        attemptAfter   : { type: 'date',   searchable: true, required: false, default: function() { return new Date() } },
        added          : { type: 'date', protected: true, default: function() { return new Date() } },
        lastChange     : { type: 'date', protected: false, default: function() { return new Date() } },
      }),

      idProperty: 'id',

      storeName:  'messagesTo',

      hotExpose: false,

      nested: [
        {
          type: 'lookup',
          localField: 'messageId',
          store: 'messages',
          //layerField: 'id'
          //join: { 'id' : 'messageId' },
        },
      ],

    });
    stores.messagesTo = new MessagesTo();


    var MessagesDeliveryLog = declare( [ BasicDbStore ],  {

      schema: new BasicSchema({
        id            : { type: 'id', searchable: true },

        messageToId   : { type: 'id', required: false, searchable: true },
        messageId     : { type: 'id', required: false, searchable: true }, // NN
        workspaceId   : { type: 'id', searchable: true, required: false},

        date          : { type: 'date', protected: true, default: function() { return new Date() } },
        level         : { type: 'number', default: 1 },
        line          : { type: 'string', searchable: false, required: true, notEmpty: true, trim: 2048 },
        config        : { type: 'serialize' },


      }),

      onlineSearchSchema: new HotSchema({
      }),

      /*
      nested: [
        {
          type: 'lookup',
          localField: 'messageId',
          store: 'messages',
          layerField: 'id'
          //join: { 'id' : 'messageId' },
        },
        {
          type: 'lookup',
          localField: 'messageToId',
          store: 'messagesTo',
          layerField: 'id'
          //join: { 'id' : 'messageToId' },
        },
      ],
      */

      idProperty: 'id',

      storeName:  'messagesDeliveryLog',

      hotExpose: false,

    });
    stores.messagesDeliveryLog = new MessagesDeliveryLog();

    done( null, stores );
  });

}));


// Utility functions to get the transport's config

var getAllTransportConfig = function( transport, done ){

  hotplate.hotEvents.emitCollect( 'allTransportConfig', transport, function( err, results ) {
    if( err ) return done( err );

    // No configuration available: return null
    if( ! Array.isArray( results ) || results.length === 0 ) return done( err, [ ] );

    // Return flattened results
    done( null, Array.prototype.concat.apply([], results.onlyResults() ));

  });
};

var getTransportConfig = function( messageTo, done ){

  hotplate.hotEvents.emitCollect( 'transportConfig', messageTo, function( err, results ) {
    if( err ) return done( err );

    // No configuration available: return null
    if( ! Array.isArray( results ) || results.length === 0 ) return done( err, null )

    // If more than one, issue a warning
    if( results.length > 1 ) debug("WARNING: more than 1 results returned for ", messageTo );

    // Return the first result
    done( null, results[ 0 ].result );
  });

};


// Functions that use the sub-layers to work.
// * getPollingStatus() (exported) calls the transport's pollingStatus() function
// * The events 'setRoute' and 'run' will trigger the corresponding functions in each active transport
// * The event 'run' will also call setTransportCron(), which:
//    - For sendMessage(), it will cycle through the message queue calling the transport's sendMessage() for each
//    - For startPolling() (exported), it will call the transport's startPolling() call
//
// Exported:
// * startPolling(). This will enable other modules to force polling for a specific transport
// * getPollingStatus(). This will enable other modules to see what the status us for a specific transport

var startPolling = exports.startPolling = function( transport, stores, config, force ){
  require('./transport/' + transport + '.js' ).startPolling( stores, config, force );
}

var getPollingStatus = exports.getPollingStatus = function( transport, config, done ){
  require('./transport/' + transport + '.js' ).getPollingStatus( config, done );
}

// Message moving functions
var sendMessage = function( transport, stores, messageTo, config, done ){
  require('./transport/' + transport + '.js' ).sendMessage( stores, messageTo, config, done );
}

/**
  @event setRoutes
*/
hotplate.hotEvents.onCollect( 'setRoutes', 'hotCoreTransport', function( app, done ){

  hotCoreStore.getAllStores( function( err, storeRegistry ){
    if( err ) return done( err );

    async.eachSeries(
      Object.keys( hotplate.config.get('hotCoreTransport').activeTransports),
      function( transport, cb ){

        getAllTransportConfig( transport, function( err, configArray ){
          if( err ) return cb( err );

          var transportModule = require('./transport/' + transport + '.js' );
          // Run setRoutes for relevant module

          transportModule.setRoutes( storeRegistry, app, configArray, cb );
        });
      },
      function( err ){
        if( err ) return done( err );
        done( null );
      }
    );
  });
});


/**
  @event run
*/
hotplate.hotEvents.onCollect( 'run', 'hotCoreTransport', function( done ){

  hotCoreStore.getAllStores( function( err, storeRegistry ){
    if( err ) return done( err );

    async.eachSeries(
      Object.keys( hotplate.config.get('hotCoreTransport').activeTransports ),
      function( transport, cb ){
        // Run setRoutes for relevant module

        getAllTransportConfig( transport, function( err, configArray ){
          if( err ) return cb( err );

          var transportModule = require('./transport/' + transport + '.js' ).run( storeRegistry, configArray, cb );
        });
      },
      function( err ){
        if( err ) return done( err );

        startTransportCron(); // Set the main cron for transport
        done( null );
      }
    );
  });
});

// Runs through the message queue, attempting to send messages
function startTransportCron(){

  var inCycle = false;
  var inPollingCycle = false;

  hotCoreStore.getAllStores( function( err, storeRegistry){
    if( err ) {
      logger.log( { error: err, system: true, logLevel: 3, message: "Error while getting all stores" } );
      return;
    };

    // INGOING: Receive messages by polling
    // This function will start once a minute, and will call
    // transportModule.startPolling() for each active module/config pair
    intervalHandles.push( setInterval( function(){

      if( exitIntervals ) {
        inPollingCycle = false;
        return; // Cycle must interrupt if shutdown
      }

      debug("**************************Running polling cron")

      // Do not run cron twice
      if( inPollingCycle) {
        debug("**********************************************************************************");
        debug("************************** Polling cron quit as the previous one was still running");
        debug("**********************************************************************************");
        return;
      }
      inPollingCycle = true;

      async.eachSeries(
        Object.keys( hotplate.config.get('hotCoreTransport').activeTransports ),
        function( transport, cb ){

          if( exitIntervals ){
            inPollingCycle = false;
            return; // This async cycle will abruptedly stop here
          }

          getAllTransportConfig( transport, function( err, configArray ){
            if( err ){
              logger.log( { error: err, system: true, logLevel: 3, message: "Error while running getAllTransportConfig", data: { transport: transport } } );
              // This returns "all good" as cycle will need to continue for other transports
              return cb( null );
            }

            debug("Config array:", configArray );

            if( exitIntervals ){
              inPollingCycle = false;
              return; // This async cycle will abruptedly stop here
            }

            // For each config attached to that transport, start polling
            configArray.forEach( function( config ){
              debug("Polling for %o", config );
              startPolling( transport, stores, config );
            })

            // This returns "all good" as cycle will need to continue for other transports configs
            return cb( null );
          })

        },
        function( err ){
          debug( "*****************************Polling cron finished! Setting inPollingCycle to false" );
          // Nothing ever sets 'err'
          // Anything wrong is dealt with by logger.log
          // All that needs to happen, is that inPollingCycle is false as the cycle is finished
          inPollingCycle = false;
        }
      )

    }, hotplate.config.get('hotCoreTransport.pollInterval' ) ) );


    // OUTGOING: Send messages using sendMessage()


    intervalHandles.push( setInterval( function(){

      debug("CRON to send messages started");
      // Do not run cron twice
      if( inCycle) {
        debug("CRON to send messages quit as it was still running");
        logger.log( { system: true, logLevel: 2, message: "Cron to sent messages not started as it is marked as 'already running'" } );
        return;
      }
      inCycle = true;

      // Get the cursor for elements in messagesTo...
      // TODO: Add case where it could be "delivering" and it's very old
      var now = new Date();
      stores.messagesTo.dbLayer.select(
        { type: 'and', args: [
          { type: 'lt', args: [ 'attemptAfter', now ] },
          { type: 'eq', args: [ 'status', 'todeliver' ] },
        ] },
        { useCursor: true , 'delete': false, children: true },
        function( err, cursor, total, grandTotal ){

        // If the cursor cannot be obtained, set inCycle as false, log the problem and get out
        if( err ) {
          inCycle = false;
          logger.log( { error: err, system: true, logLevel: 3, message: "Error getting cursor for queue" } );
          return;
        };

        // Go through the cursor asynchromously using async
        // NOTE that the cycle will not wait for each sendMessage() to finish. However,
        // if sendMessage() returns with an error, errInCycle is set and excution of the cycle
        // will be interrupted half way. The rationale is that if there is a bad error with sending
        // a message, there is no point in continuing with the others
        var i;
        async.doWhilst(

          function( callback ){

            if( exitIntervals ) {
              inCycle = false;
              return; // Cycle must interrupt if shutdown
            }


            cursor.next( function( err, messageTo ){
              if( err ) return callback( err );

              i = messageTo;

              debug("Got message from cursor: ", messageTo );

              // If messageTo is null, just return. This is here because
              // cursor.next WILL return 'null' to indicate the last one
              if( messageTo === null ) return callback( null );

              debug("Message not null: dealing with it!" );

              // ******************************************
              // THIS IS WHERE EACH MESSAGE IS EVALUATED
              // ******************************************

              // Get the config for that message from the application
              getTransportConfig( messageTo, function( err, transportConfig ){
                if( err ){
                  //logger.log( { error: err, system: true, logLevel: 3, message: "Error while getting transport configuration", data: { config: config, messageTo: messageTo } } );
                  logLine( null, messageTo.messageId, messageTo.id, 3, "Error while getting transport configuration", err );
                  return;
                }

                // Send the message!
                // This will only ever return with err !== null when something goes horribly wrong.
                // Undeliverable messages, socket timeouts etc.  mustn't do that.
                debug("Config for message retrieved, result: ", messageTo, transportConfig );

                debug("About to call transportManipulateBeforeSend" );

                hotplate.hotEvents.emitCollect( 'transportManipulateBeforeSend', transportConfig.transport, messageTo, transportConfig.config, function( err ){


                  debug("Message after transportManipulateBeforeSend: ", messageTo );

                  // Could not pre-process messageTo
                  if( err ){
                    logLine( transportConfig.config, messageTo.messageId, messageTo.id, 3, "Error pre-processing message", err );
                    return;
                  }

                } )

                if( exitIntervals ) {
                  inCycle = false;
                  return; // Cycle must interrupt if shutdown
                }

                sendMessage( transportConfig.transport, stores, messageTo, transportConfig.config);
              });

              // This is in the right spot! This cycle doesn't wait for getTransportConfig or sendMessage()
              // to finish.
              callback( null );

            });
          },

          function(){ return i != null; },

          function( err ) {
            inCycle = false;
            debug( "CRON sending message finished!" );
            return;
          }
        );
      });


    }, hotplate.config.get('hotCoreTransport.outgoingQueueInterval', 60000 ) ) );

  });

}

/* Utility functions used by sublayers
   These functions are always availanle to sub-layers, which will use them
   to make things happen
*/

exports.transportLayerFunctions = {};

/* Note
   ----
   The following functions are _guaranteed_ to be called once the module's stores' variable
   is set, because they are only ever called by the sub-systems (sms-plivo, email-default,
   etc.), which is always required/run once hotCoreStore.getAllStores() has been run
*/

// Log a line to messageDeliveryLog
var formatError = exports.transportLayerFunctions.formatError = function( err ){
  return err.name + ': ' + err.message;
}


// Log a line to messageDeliveryLog
// There is no callback for this function if anything goes wrong, it will call logger.log
// Note that logger.log is _always_ called to issue a system entry if logLevel is >= 3.
// These are problems that need to be looked at if they do happen
var logLine = exports.transportLayerFunctions.logLine = function( config, messageId, messageToId, logLevel, line, errInLogline ){

  debug("logLine called: ", config, messageId, messageToId, logLevel, line, errInLogline );

  // Base values
  var o = {
    level: logLevel,
    line: line,
    config: config
  }
  // Optional values
  if( messageToId ) o.messageToId = messageToId;
  if( messageId ) o.messageId = messageId;
  if( o.config && o.config.workspaceId ) o.workspaceId = o.config.workspaceId;


  hotplate.hotEvents.emitCollect('augmentMessageDeliveryLog', o, function( err ){
    if( err ){
      var l = { error: err, system: true, logLevel: 3, message: "Error emitting augmentMessageDeliveryLog", data: { entry: o } };

      if( o.workspaceId ) l.workspaceId = o.workspaceId;

      logger.log( l );
    }

    // At this point, 'o' is augmented in whichever way (most likely, the workspaceId was added)

    // If logLine is called with an error as last parameter, it means it's indicating that
    // something failed: log it as critical
    // So, logger.log will be called with the relevant information
    if( errInLogline ){
      debug("Logline was called with an error parameter: ", errInLogline );

      // For errors of levels 1 and 2, show the error name and message on the log line
      // Transport layers should leep in mind that errors for levels 1 and 2 are displayed to the user
      // in form of mail delivery log. Timeouts and auth errors are fine, DB errors are not.
      if( logLevel < 3 ) {
        line += " -- Error: " + formatError( errInLogline );

      // For errors of levels 3 and up, absolutely log them with hotplate
      // Note that since the loglevel is high, hotCoreServerLogger will also issue
      // a hotplate. critical() (which will display on the screen)
      } else {
        var l = { error: errInLogline, system: true, logLevel: logLevel, message: "hotCoreTransport.logLine logged: " + line, data: { entry: o } };
        if( o.workspaceId ) l.workspaceId = o.workspaceId;

        // Log the line to the main application's logger
        logger.log( l );
      }
    }

    stores.messagesDeliveryLog.dbLayer.insert(o, function( err, oRecord ){

      if( err ){
        // Error while adding the entry: this is an important system error, log the event
        logger.log( { error: err, system: true, logLevel: 3, message: "Error while writing on messagesDeliveryLog with dbLayer.insert", data: { lineData: o } } );
        return;
      }

      hotplate.hotEvents.emitCollect( 'transportLog', oRecord, function( err, results ) {
        // Error while emitting transportLog: this is an important system error, log the event
        if( err ){
          logger.log( { error: err, system: true, logLevel: 3, message: "Error while emitting transportLog", data: { failedRecord: oRecord } } );
        }
      });
    });
  });
}

// If `failedAttempt`, and the messageTo.failedAttempt > 5, newMessageStatus is forced to `undeliverable`
// Failing to broadcast will result in logging with loglevel 3, but will not result in done( err ) as
// it's not critical (the status has actually changed)
exports.transportLayerFunctions.changeMessageStatus = function( transport, config, messageTo, failedAttempt, newMessageStatus, done ){

  debug( "changeMessageStatus called with parameters: ", transport, config, messageTo, failedAttempt, newMessageStatus );

  // It's NOT a failed attempt, just a change of status: in this case,
  // the status is always set to newMessageStatus,
  if( !failedAttempt ){
    messageTo.status = newMessageStatus;

  // It WAS a failed attempt: in this case, things are trickier. messageTo.failedAttempts will
  // be incremented, and if it got too big the status will be forced to 'undeliverable'. If it's
  // not too big, then the status will nbe set to newMessageStatus and attemptAfter set in the future
  } else {

    messageTo.failedAttempts ++;

    // If the number of failed attempts is > 5, then that's the end of the story: the status is set
    // to 'undeliverable' (rather than what was requested) and attemptAfter is deleted.
    if( messageTo.failedAttempts > 5 ){
      messageTo.status = 'undeliverable';
      delete messageTo.attemptAfter;
    } else {
      messageTo.status = newMessageStatus;
      var delay = hotplate.config.get('hotCoreTransport.activeTransports.' + transport + '.defaultAttemptDelay');
      if( ! delay ){
        delay = hotplate.config.get('hotCoreTransport.defaultAttemptDelay', 60 * 60 * 1000 );
      }
      messageTo.attemptAfter = new Date( new Date().getTime() + delay );

    };
  }

  stores.messagesTo.dbLayer.update( { type: 'eq', args: [ 'id', messageTo.id ] }, { status: messageTo.status, failedAttempts: messageTo.failedAttempts }, function( err ){

    if( err ){
      logLine( config, messageTo.messageId, messageTo.id, 3, "Could not change the message status to " + newMessageStatus, err );
      return done( err );
    }

    // If the emit fails the error is logged (loglevel 3) but done(null) as it's not critical
    hotplate.hotEvents.emitCollect( 'changeMessageStatus', transport, config, messageTo, function( err ) {
      if( err ){
        logLine( config, messageTo.messageId, messageTo.id, 3, "Error broadcasting the change of status", err );
      }

      done( null );
    });
  });
}

exports.transportLayerFunctions.deleteUnfinishedMessage = function( config, messageId ){


  stores.messagesTo.dbLayer.delete( { type: 'eq', args: [ 'messageId', messageId ] }, { multi: true }, function( err ){
    if( err ){
      logger.log( { error: err, system: true, logLevel: 3, message: "Error while deleting elements from messagesTo for incomplete message", data: { config: config, messageId: messageId } } );
    }

    stores.messagesAttachments.dbLayer.delete( { type: 'eq', args: [ 'messageId', messageId ] }, { multi: true }, function( err ){
      if( err ){
        logger.log( { error: err, system: true, logLevel: 3, message: "Error while deleting elements from messagesAttachments for incomplete message", data: { config: config, messageId: messageId } } );
      }

      stores.messages.dbLayer.delete( { type: 'eq', args: [ 'id', messageId  ] }, { multi: true }, function( err ){
        if( err ){
          logger.log( { error: err, system: true, logLevel: 3, message: "Error while deleting elements from messages for incomplete message", data: { config: config, messageId: messageId } } );
        }

      });
    });
  })


}
