"use strict";


var dummy
  , path = require('path')
  , hotplate = require('hotplate')
  , declare = require('simpledeclare')
  , request = require('request')
  , DeepObject = require('deepobject')
  , e = require( 'allhttperrors' )
  , url = require( 'url')

  , fs      = require('fs')
  , base64  = require('base64-stream')
  , Imap    = require('imap')
  , async   = require('async')
  , debug = require('debug')('hotplate:hotCoreTransport:sms-plivo')

  , SimpleDbLayer = require( 'simpledblayer' )
  , SimpleSchema = require( 'simpleschema' )
  , JsonRestStores = require( 'jsonreststores' )

  , hotCoreStore = require( 'hotplate/core_modules/hotCoreStore' )
  , hotCoreTransport = require( 'hotplate/core_modules/hotCoreTransport')
  , hotCoreServerLogger = require( 'hotplate/core_modules/hotCoreServerLogger' )
  , crypto = require('crypto')
  , logger = hotCoreServerLogger

  , htmlToText = require('html-to-text')

;


// These variables are module-wide, as are  used to update the status
// of each configId's polling
// They are objects as there is one element per configId
var pollingInProgress = {};
var lastPolling = {};

// Transport layer functions. These are made available to transport layers
// by hotCoreTransport. Very common, and very handy
var tlf = hotCoreTransport.transportLayerFunctions;
var logLine = tlf.logLine;
var formatError = tlf.formatError;
var changeMessageStatus = tlf.changeMessageStatus;
var deleteUnfinishedMessage = tlf.deleteUnfinishedMessage;

// This is the API, exposed through exports.
// Each transport module needs to implement all of these methods
// even if they are left empty

exports = module.exports = {

  setRoutes: function( stores, app, configArray, done ){

    var updateRoute = hotplate.config.get('hotCoreTransport.activeTransports.sms-plivo.updateRoute');

    if( updateRoute ){

      debug("Update URL for Plivio is: " + updateRoute  );
      // Set route for incoming status changes
      app.post( updateRoute , function( req, res, next ){

        var body = req.body;
        debug( "Request to update a message arrived!");
        debug( body );

        // Gets the plivo configuration matching that number
        var config = null, item;
        for( var i = 0, l = configArray.length; i < l; i ++){
          item = configArray[ i ];
          if( body.From == item.fullNumber ){
            config = item;
            break;
          }
        }

        // If the status update is for a phone number we don't know, we have a pretty big problem
        if( ! config ){
          return next( new Error( "Plivo message status update received, but no Plivo configuration set for number " + body.To ));
        }

        // Status updates for subsequent parts are silently ignored, only the first part
        // is actually considered
        // Sub parts will only get a mention in the message log for that message
        if( body.ParentMessageUUID != '-' && body.ParentMessageUUID !== body.MessageUUID ){

          // Looking up the message
          stores.messagesTo.dbLayer.selectByHash( { conditions: { foreignId: body.MessageUUID } }, { children: true }, function( err, there ){
            if( err ){
              debug("Could not lookup message in messagesTo with foreignId %s (parent is %s)" );

              logLine( config, null, null, 3, "Could not lookup message " + body.MessageUUID + ", wanted to log that updates of parts 2 on will not change the status, but got an error", err );
              return next( null );
            }

            debug("Ignoring status update for message %s as it's for a sub-part for parent message %s", body.MessageUUID, body.ParentMessageUUID );
            logLine( config, messageTo.messageId, messageTo.id, 1, "Status update for subpart " + body.MessageUUID + " received; only status update of main part is considered. Status received however was: " + body.Status );
            return next( null );
          });
        }

        // Looking up the message
        stores.messagesTo.dbLayer.selectByHash( { conditions: { foreignId: body.MessageUUID } }, { children: true }, function( err, there ){
          if( err ){
            logLine( config, null, null, 3, "Could not update the status of message " + body.MessageUUID + ", received: ", body.Status, err );
            return next( err );
          }
          if( there.length === 0 ){
            logLine( config, null, null, 3, "Attempted to update the status of non-existent message " + body.MessageUUID + ", received: " + body.Status, new Error() );
            return next( null );
          }
          if( there.length > 1 ){
            logLine( config, null, null, 3, "Multiple messages matching this ID found for message  " + body.MessageUUID + ", received: " + body.Status );
            return done( null );
          }

          // OK, the message is here.
          var messageTo = there[ 0 ];

          // Status matching!
          // Plivo: queued, sent, failed, delivered, undelivered, rejected"
          // Hotplate: todeliver, delivering, delivered, undeliverable, dontdeliver

          // Note that some of the statuses are too precise: 'queued', 'sent' and 'undelivered' all means
          // that the SMS gateway is still working on it. 'failed' and 'rejected' both mean that
          // the message is not deliverable; 'delivered' means (drum roll) delivered.
          var newStatus;
          switch( body.Status ){
            case 'queued'     : newStatus = 'delivering';    break;
            case 'sent'       : newStatus = 'delivering';    break;
            case 'failed'     : newStatus = 'undeliverable'; break;
            case 'delivered'  : newStatus = 'delivered';     break;
            case 'undelivered': newStatus = 'delivering';    break;
            case 'rejected'   : newStatus = 'undeliverable'; break;
          }


          // If the status was already "delivered", then don't do anything (other than
          // logging the event).
          // The call will end here, a 200 will be sent back, and that's it.
          if( messageTo.status === 'delivered' ){

            logLine( config, messageTo.messageId, messageTo.id, 1, "Request change of status for message " + body.MessageUUID + ". Received status: " + body.Status + " which would translates into " + newStatus + ". However, original status message was " + messageTo.status + " which means that the status will NOT be changed." );

            debug( "Request change of status for message " + body.MessageUUID + ". Received status: " + body.Status + " which would translates into " + newStatus + ". However, original status message was " + messageTo.status + " which means that the status will NOT be changed." );

            res.send( 200, '');
            return;

          }

          // The status needs to be changed. Let's get to it.
          logLine( config, messageTo.messageId, messageTo.id, 1, "Changing status for message " + body.MessageUUID + ". Received status: " + body.Status + " which translates into " + newStatus );
          changeMessageStatus( 'sms-plivo', config, messageTo, false, newStatus, function( err ){
            if( err ){
              logLine( config, messageTo.messageId, messageTo.id, 3, "Could not update the status of message " + body.MessageUUID + ", received: " + body.Status + " which translates into " + newStatus , err );
              return next( err );
            }

            logLine( config, messageTo.messageId, messageTo.id, 1, "Status of message " + body.MessageUUID + ", changed, received: " + body.Status + " which translates into " + newStatus , err );
            debug( "Status of message " + body.MessageUUID + ", changed, received: " + body.Status + " which translates into " + newStatus );
            res.send( 200, '');
            return;

            // That's it -- the call won't progress any further
          });
        });
      });
    }


    var route = hotplate.config.get('hotCoreTransport.activeTransports.sms-plivo.smsRoute');
    if( route ){

      // Set route for incoming SMSes
      app.all(route, function( req, res, next ){

        var body = req.body;

        var host = hotplate.config.get( 'hotCoreTransport.activeTransports.sms-plivo.signatureHost', null ) || req.headers.host;
        var data, url;

        // Prepare the data and the url -- they will depend on the method
        if( req.method === 'GET' ){
          var u = require( 'url').parse( req.url, true );
          data = u.query;
          url = req.protocol + '://' + host + u.pathname;
        } else if( req.method === 'POST' ) {
          url = req.protocol + '://' + host + req.url;
          var data = req.body;
        } else {
          next( new Error("Protocol not supported"));
        }

        // Gets the plivo configuration matching that number
        var config = null, item;
        for( var i = 0, l = configArray.length; i < l; i ++){
          item = configArray[ i ];
          if( data.To == item.fullNumber ){
            config = item;
            break;
          }
        }
        if( ! config ){
          return next( new Error( "Plivo message received, but no plivo configuration set"));
        }

        var token = config.token;

        // At this point, 'url' and 'data' and 'token' are all set

        // Create the signature, and check it against the token passed
        var toSign = url;
        Object.keys( data ).sort().forEach( function( key ) {
          toSign += key + data[ key ];
        });
        var signature = crypto.createHmac('sha1', token ).update( toSign ).digest('base64');
        if( signature !== req.headers[ 'x-plivo-signature' ] ){
          return next( new e.UnauthorizedError() );
        }

        stores.messages.dbLayer.insert( {
          type       : 'sms',
          incoming   : true,
          bodyText   : data.Text,
          from       : data.From,
        }, function( err, messageRecord ){
          if( err ){
            logLine( config, null, null, 3, "Error storing message " + fullMessage.foreignId, err );
            return next( err );
          }

          stores.messagesTo.dbLayer.insert( {
            messageId: messageRecord.id,
            to: data.To,
            status: 'dontdeliver',
            failedAttempts: 1,
            foreignId  : data.MessageUUID,
            foreignData: {
              TotalRate: data.TotalRate,
              To: data.To,
              Units: data.Units,
            },
          }, function( err, messageToRecord ){

            // If there was DB error, clean up and return error
            if( err ){
              logLine( config, null, null, 3, "Error attaching recipient " + data.To + " to message " + fullMessage.foreignId, err );
              deleteUnfinishedMessage( config, messageRecord.id );
              return next( err );;
            }

            // Now that _everything_ went according to plan, emit the full message object
            // (which will include `attachments` and `to` under _children) as a
            // broadcast
            stores.messages.apiGet( messageRecord.id, function( err, fullMessageRecord ){

              // If the message cannot be fetched, there is a problem --
              // abort the current message iteration
              if( err ){
                logLine( config, null, null, 3, "Error re-reading the message once sent: " + fullMessage.foreignId + " to broadast it", err );

                deleteUnfinishedMessage( config, messageRecord.id );

                // Call the main cycle's cb, so that it goes to the next message
                return next( err );
              }

              hotplate.hotEvents.emitCollect( 'transportMessageFetched', 'sms-plivo', config, fullMessageRecord, messageToRecord, function( err ) {
                if( err ){

                  logLine( config, null, null, 3, "Error after message " + fullMessageRecord.foreignId + "processed", err );
                  deleteUnfinishedMessage( config, messageRecord.id );

                  return next( err );
                }

                // It actually all worked

                debug("TOSIGN:", toSign );
                debug("URL: ", url );
                debug("DATA:", data );
                debug("TOKEN:", token );

                debug("EXPECTING: ", signature );
                debug("RECEIVED: ", req.headers[ 'x-plivo-signature' ] );

                res.send( 200, '');
              });
            });
          });
        })
      })

    }
    // End of setRoutes
    done( null );
  },

  run: function( stores, configArray, done ){
    done( null );
  },

  // No callback: will initiate sending and log events with logLine
  sendMessage: function( stores, messageTo, config ){
    _sendMessage( stores, messageTo, config );
  },

  // No callback: will initiate sending and log events with logLine
  // MUST: emit( 'transportMessageFetched', config, fullMessageRecord ) for every
  // fetched message, so that other parts of the application can update their own tables
  startPolling: function( stores, config ){
    _startPolling( stores, config );
  },

  getPollingStatus: function( configId, done ){
    _getPollingStatus( configId, done );
  },

};


function _getPollingStatus( configId, done ){
  done( null, pollingInProgress[ configId ] ? "ONGOING" : "IDLE" ); // OR "NOTIMPLEMENTED"
}

// Function to send an SMS
function _sendMessage( stores, messageTo, config ){

  debug("Layer sms-plivo sending: ", messageTo, config );;

  // Plivo account not configured: end of the story
  if( config.account == '' ){
    logLine( config, messageTo.messageId, messageTo.id, 1, "Plivo account (account) not configured" );
    changeMessageStatus( 'sms-plivo', config, messageTo, true, 'todeliver', function(){} );
    return;
  }
  if( config.token == '' ){
    logLine( config, messageTo.messageId, messageTo.id, 1, "Plivo account (token) not configured" );
    changeMessageStatus( 'sms-plivo', config, messageTo, true, 'todeliver', function(){} );
    return;
  }


  changeMessageStatus( 'sms-plivo', config, messageTo, false, 'delivering', function( err ){
    if( err ) return;

    var message = messageTo._children.messageId;
    var sms = {
      src: config.fullNumber,
      dst: messageTo.to,
    };

    // Determine the text to send. If message.bodyText, send that one. If message.bodyHtml, send a
    // htmlToText version of it. If neither, send an empty text
    if( message.bodyText ) {
      sms.text = message.bodyText;
    } else if ( message.bodyHtml ){
      sms.text = htmlToText.fromString( message.bodyHtmlSane, { wordwrap: 130 } );
    } else {
      sms.text = '';
    }


    var hostname = hotplate.config.get('hotCoreTransport.activeTransports.sms-plivo.updateHost', 'localhost' );
    var pathname = hotplate.config.get('hotCoreTransport.activeTransports.sms-plivo.updateRoute');
    var port = hotplate.config.get('hotCoreTransport.activeTransports.sms-plivo.updatePort', 80 );
    sms.url = url.format( { protocol: 'http', hostname: hostname, pathname: pathname, port: port } );
    console.log("UPDATE URL FOR SMS IS:", sms.url );

    debug("MAKING REQUEST: ", { url:'https://api.plivo.com/v1/Account/' +  config.account + '/Message/', qs: sms });
    debug("REQUEST PARAMETERS:",
      {
        'auth': {
          'user': config.account,
          'pass': config.token,
          'sendImmediately': true
        },
      }
    );

    request.post(
      {
        uri:'https://api.plivo.com/v1/Account/' +  config.account + '/Message/',
        json: sms,
        'auth': {
          'user': config.account,
          'pass': config.token,
          'sendImmediately': true
        }
      },

      function( err, response, body ){

        // There was an error: log it, set the new status
        if( err ){
          logLine( config, messageTo.messageId, messageTo.id, 1, "Could not send SMS", err );
          changeMessageStatus( 'sms-plivo', config, messageTo, true, 'todeliver', function(){} );
          return;
        }

        debug("RESPONSE STATUS:", response.statusCode );
        debug("BODY:", body );

        if( response.statusCode !== 202 ){
          logLine( config, messageTo.messageId, messageTo.id, 1, "Attempt to send SMS failed server responded with status " + response.statusCode );
          changeMessageStatus( 'sms-plivo', config, messageTo, true, 'todeliver', function(){} );
          return;
        }

        // Always only 1 message sent, get the first response code
        var foreignId = body.message_uuid[ 0 ];

        messageTo.foreignId = foreignId;

        stores.messagesTo.dbLayer.updateById( messageTo.id, { foreignId: foreignId }, function( err ){

          // If messageTo cannot be updated for a DB error, status updates won't be able to be matched with
          // the foreign ID. So, the message is marked as "delivered". This may sound a little risky, but
          // there is no other choice. Retrying sendMessage is not an option as it will end up sending
          // things more than once.
          if( err ){
            logLine( config, messageTo.messageId, messageTo.id, 3, "Failed to update local message with foreign message ID; status updates won't be registered, assuming the message will be delivered", err );
            changeMessageStatus( 'sms-plivo', config, messageTo, false, 'delivered', function(){} );
            return;
          }

          // All good: change the status to delivered, log sending
          logLine( config, messageTo.messageId, messageTo.id, 1, "SMS handed over to gateway, waiting for status updates" );
        })
      }
    );

  });
}


// Functions to deal with incoming messages


// Polling is used to check for messages that have been undeliverable for a very long time,
// to see if they have been delivered and we just don't know about it
function _startPolling( stores, config, force ){
  return;
}
