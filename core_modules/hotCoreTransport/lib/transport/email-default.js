"use strict";


var dummy
  , path = require('path')
  , hotplate = require('hotplate')
  , declare = require('simpledeclare')
  , nodemailer = require('nodemailer')
  , DeepObject = require('deepobject')
  , htmlToText = require('html-to-text')
  , fs      = require('fs')
  , base64  = require('base64-stream')
  , Imap    = require('imap')
  , async   = require('async')
  , debug = require('debug')('hotplate:hotCoreTransport:email-default')

  , SimpleDbLayer = require( 'simpledblayer' )
  , SimpleSchema = require( 'simpleschema' )
  , JsonRestStores = require( 'jsonreststores' )

  , hotCoreStore = require( 'hotplate/core_modules/hotCoreStore' )
  , hotCoreTransport = require( 'hotplate/core_modules/hotCoreTransport')
  , hotCoreServerLogger = require( 'hotplate/core_modules/hotCoreServerLogger' )
  , logger = hotCoreServerLogger

  , htmlToText = require('html-to-text')
  , mimelib = require("mimelib")
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

// Function to send an email
function _sendMessage( stores, messageTo, config ){

  debug("***************Layer email-default sending: ", messageTo, config );;

  // SMTP server not configured: end of the story
  if( config.smtpServer == '' ){
    logLine( config, messageTo.messageId, messageTo.id, 1, "Error: SMTP is not configured" );
    return;
  }

  changeMessageStatus( 'email-default', config, messageTo, false, 'delivering', function( err ){
    if( err ){
      logLine( config, messageTo.messageId, messageTo.id, 2, "Could not send change status to 'delivering'",err);
      changeMessageStatus( 'email-default', config, messageTo, true, 'todeliver', function(){} );
      return;
    }

    var o = {
      host: config.smtpServer,
      port: config.smtpPort,
      secure: true,
      debug: true
    };

    if( config.smtpLogin ){
      o.auth = {
        user: config.smtpLogin,
        pass: config.smtpPassword,
      };
    }

    // Create an SMTP transporter
    var transporter = nodemailer.createTransport( o );

    // Make up the basic message object
    var m = {
      from: config.systemName + " <" + config.systemEmail + ">",
      //from: config.systemEmail,
      to: messageTo.to
    };

    // Add subject, text part and HTML part if present
    // Like good email clients, text part will be worked out programmatically if it wasn't provided
    var messageId = messageTo._children.messageId;
    if( messageId.subject ) m.subject = messageId.subject;
    if( messageId.bodyHtml ) m.html = messageId.bodyHtml;
    if( messageId.bodyText ){
      m.text = messageId.bodyText;
    } else if( messageId.bodyHtmlSane ) {
      m.text = htmlToText.fromString( messageId.bodyHtmlSane, { wordwrap: 130 } );
    }

    debug("About to send email: ", m );
    var c = transporter.sendMail( m, function( err, info ){

      // There was an error: log it
      if( err ){
        logLine( config, messageTo.messageId, messageTo.id, 2, "Could not send email", err );
        changeMessageStatus( 'email-default', config, messageTo, true, 'todeliver', function(){} );
        return;
      }

      debug("Email sent! Info: ", info );

      // All good: change the status to delivered, log sending
      logLine( config, messageTo.messageId, messageTo.id, 1, "Email delivered successfully!" );
      changeMessageStatus( 'email-default', config, messageTo, false, 'delivered', function(){} );

      // Attempt to save foreignId and foreignData onto messageTo.
      // Note that a failure here is not the end of the world as the
      // message status doesn't get updated asynchronously like it happens
      // in the SMS subsystem.
      // However, a failure will be logged. The user will see the message, the admin
      // will see the proper error
      var updateMessageId = {};
      if( info.messageId ){
        messageTo.foreignId = updateMessageId.foreignId = info.messageId;
      }
      messageTo.foreignData = updateMessageId.foreignData = { deliveryInfo: info };
      //
      stores.messagesTo.dbLayer.updateById( messageTo.id, updateMessageId, function( err ){
        if( err ){
          logLine( config, messageTo.messageId, messageTo.id, 3, "Failed to set remote message ID and response; doing so is not critical ", err );
        }
      });
    });

    transporter.on( 'log', function( msg ){
      debug( "email-default LOG: ", msg );
    })

  });
}


// Functions to deal with incoming messages


// This function will take `struct` as a parameter, and will
// return an object where `text` and/or `html` are possibly
// set based on its contents.
function findBodyParts( struct, result ) {

  var result = result || { text: null, html: null };

  for( var i = 0, len = struct.length; i < len; i++ ) {

    // If it's an array, scan that recursively. Pass `result` to it,
    // so that it keeps on enriching the same object
    if( Array.isArray( struct[i] ) ) {
      findBodyParts( struct[i], result );

    // If it's a normal element, use it to try and enrich
    // result with `plain` or `html` (if available)
    } else {

      var s = struct[ i ];
      if( s.type.toLowerCase() === 'text' ){
        if( ! result.text && s.subtype.toLowerCase() === 'plain' ){
          result.text = s;
        }
       if( ! result.html && s.subtype.toLowerCase() === 'html' ){
          result.html = s;
        }
      }
    }

    // Exit early if not all elements have been scanned yet, but result
    // is already complete.
    if( result.text && result.html ) return result;
  }

  return result;
}

// This function will take `struct` as a parameter, and will
// return an object where `text` and/or `html` are possibly
// set based on its contents.
function findAttachments( struct, result ) {

  var result = result || [ ];

  for( var i = 0, len = struct.length; i < len; i++ ) {

    // If it's an array, scan that recursively. Pass `result` to it,
    // so that it keeps on enriching the same object
    if( Array.isArray( struct[i] ) ) {
      findAttachments( struct[i], result );

    // If it's a normal element, use it to try and enrich
    // result with `plain` or `html` (if available)
    } else {

      var s = struct[ i ];
      if( s.type.toLowerCase() === 'application' ){
        result.push( s );
      }
    }
  }

  return result;
}



function fetchMessagePart( imap, uid, partID, done ){

  if( ! partID ) return done( null, null );

  var hadErrInMessage, hadErrInBody;
  var fullPart = { body: '', attributes: null, info: null }
  var f = imap.fetch(uid, { bodies: [ partID ] } );

  // Since this function will only ever fetch one part, it will only
  // ever receive either "message" or "error", never body. So,
  // having a 'errInFetch`  (and checking for it) would be pointless
  f.on('error', function( err) {
    done( err );
  });

  f.on('message', function( m ) {

    // If there is an error, note that it happened and
    // simply call the callback
    m.on( 'error', function( err ){
      hadErrInMessage = err;
      done( err );
    });

    // Get the attributes
    m.on( 'attributes', function( attributes ) {

      if( hadErrInMessage) return;

      fullPart.attributes = attributes;
    });

    // Get the body
    m.on('body', function( stream, info) {

      if( hadErrInMessage) return;

      // Assign the part info
      fullPart.info = info;

      stream.on('data', function( d ) {
        fullPart.body += d;
      });

      // If there is an error, note that it happened and
      // simply call the callback
      stream.on( 'error', function( err ){
        hadErrInBody = err;
        done( err );
      })

    });

    // Not catching m.on( 'end' ) nor stream.on( 'end' ) as will already catch f.on('end')
    // that always comes afterwards
  });

  f.on('end', function() {

    // If hadErrIn**** is set, then the callback has already been called.
    if( hadErrInBody || hadErrInMessage ){
      return;
    }

    done( null, fullPart );

  });

}


function fetchFullMessage( config, imap, uid, fetchOptions, done ){

  // Unfinished, initial fullMessage object
  var fullImapMessage = { uid: null, body: '', bodyHtml: '', headers: null, attachments: [] };
  var hadErrInBody, hadErrInMessage;
  var attributes, messageRawBody = '';

  // Just in case. Without this, this function cannot work.
  fetchOptions.struct = true;

  // Run the imap
  var f = imap.fetch( uid, fetchOptions );

  // Since this function will only ever fetch one part, it will only
  // ever receive either "message" or "error", never body. So,
  // having a 'errInFetch`  (and checking for it) would be pointless
  f.once('error', function( err) {
    debug("Fetch - ERROR: ", err );
    done( err );
  });

  f.once('message', function( msg, seqno) {

    var prefix = "[" + seqno + "] ";

    debug( prefix + "Fetch - Message");

    // Set hadErrorInMessage in case of errors
    msg.once('error', function( err) {

      debug( prefix + "Message - ERROR: ", err );

      hadErrInMessage = true;
      done( err );
    });

    // Assign 'attributes'
    msg.once('attributes', function( _attributes ) {
      debug( prefix + "Message - attributes: " );

      if( hadErrInMessage ) return;

      attributes = _attributes;
    });

    // Assign 'messageRawBody'
    msg.on( 'body', function(stream, info) {

      debug( prefix + "Message - body: " );

      if( hadErrInMessage ) return;

      stream.on( 'error', function( err ){
        debug( prefix + "Stream - ERROR: ", err );

        hadErrInBody = err;
        cb( err );
      });
      stream.on( 'data', function( d ){
        debug( prefix + "Stream - data: " );

        if( hadErrInBody ) return;
        messageRawBody += d;
      });

    });

    // Not catching f.on( 'end' ) nor stream.on( 'end' ) as will already catch msg.on( 'end' )
    // that is absolutely enough

    msg.once('end', function() {
      debug( prefix + "Message - end: " );

      if( hadErrInMessage || hadErrInBody ) return;

      // Setting fullMessage
      fullImapMessage.headers = Imap.parseHeader( messageRawBody );
      fullImapMessage.uid = attributes.uid;

      debug("TEMPORARY MESSAGE: ", fullImapMessage );

      var bodyParts = findBodyParts( attributes.struct );

      // FETCH BODY PARTS

      // At this point, we are missing "text" and "html" in fullImapMessage.
      // It should be easy to get it

      var partIDs = [];

      if( bodyParts.html ) partIDs.push( { type: 'bodyHtml', partID: bodyParts.html.partID } );
      if( bodyParts.text ) partIDs.push( { type: 'bodyText', partID: bodyParts.text.partID } );

      async.eachSeries(
        partIDs,
        function( partID, cb ){

          debug("ABOUT TO FETCH PART:");
          fetchMessagePart( imap, fullImapMessage.uid, partID.partID, function( err, part ){
            if( err ) return cb( err );

            debug("PART FETCHED");

            fullImapMessage[ partID.type ] = mimelib.decodeQuotedPrintable( part.body );
            cb( null );
          })
        },
        function( err ){
          if( err ) return done( err );


          // FETCH ATTACHMENT PARTS

          var attachmentPartsInStruct = findAttachments( attributes.struct );

          debug("Attachment parts in struct: %o", attachmentPartsInStruct );

          async.eachSeries(
            attachmentPartsInStruct,
            function( partInStruct, cb ){

              // Get the filename, Use DeepObject as it's quite deep into partInStruct
              var fileName = DeepObject.get( partInStruct, 'disposition.params.filename');

              // Get the size limit from the configuration
              var sizeLimit = hotplate.config.get('hotCoreTransport.activeTransports.email-default.attachmentSizeLimit');


              debug("sizeLimit is: ", sizeLimit );
;
              debug("Comparing: %d && %d > %d", sizeLimit, partInStruct.size, sizeLimit );

              // If it's too big, do not download it
              if( sizeLimit && partInStruct.size > sizeLimit ){
                // The next log line is pointless as the message hasn't been created yet, and it
                // would end up in the "generic" transport log...
                // logLine( config, null, null, 1, "Attachment " + fileName + " wasn't fetched as it was too big --  " + partInStruct.size + " bytes against a " + sizeLimit + "limit" );

                // Make up the attachment object
                var p = {
                  id: partInStruct.partID,
                  mimeType: partInStruct.type+ '/' + partInStruct.subtype,
                  retrieved: false,
                  size: partInStruct.size,
                };
                if( fileName ) p.fileName = fileName;
                if( partInStruct.id ) p.embeddedId = partInStruct.id;

                // Add the object to the attachment array
                fullImapMessage.attachments.push( p );

                return cb( null );
              }

              debug("ABOUT TO FETCH ATTACHMENT PART %o:", partInStruct);
              fetchMessagePart( imap, fullImapMessage.uid, partInStruct.partID, function( err, downloadedPart ){
                if( err ) return cb( err );

                //downloadedPart.body = downloadedPart.body.substr( 0, 400 );
                debug("ATTACHMENT PART FETCHED:", downloadedPart );

                // Make up the attachment object
                var p = {
                  id: partInStruct.partID,
                  data: downloadedPart.body,
                  mimeType: partInStruct.type+ '/' + partInStruct.subtype,
                  size: partInStruct.size,
                  retrieved: true,
                };
                if( fileName ) p.fileName = fileName;
                if( partInStruct.id ) p.embeddedId = partInStruct.id;

                // Add the object to the attachment array
                fullImapMessage.attachments.push( p );
                cb( null );
              })
            },
            function( err ){
              if( err ) return done( err );

              done( null, fullImapMessage );
            }
          );

        }
      );

    })
  })
}

// Polling is always handled, at API-level, for one specific config
function _startPolling( stores, config, force ){

  if( force ){
    logLine( config, null, null, 1, "Polling happening regardless of configured timeout" );
  }

  if( pollingInProgress[ config.id ] ){
    logLine( config, null, null, 1, "Polling requested while another one still in progress, aborting request" );
    return;
  }

  if( !force && lastPolling[ config.id ] && ( ( new Date() ) - lastPolling[ config.Id ]  ) / 1000 < config.imapPollInterval ){
    debug("It hasn't been long enough since last poll for %o, not doing it just yet");
    return;
  }


  // Check that all settings are actually on
  if( config.imapLogin == '' ||  config.imapPassword == '' || config.imapServer == '' || config.imapPort == '' ){
    logLine( config, null, null, 1, "IMAP not enabled as one of the parameters weren't set" );
    return;
  }

  // OK, it's officially in progress
  pollingInProgress[ config.id ] = true;
  lastPolling[ config.id ] = new Date();


  // Create the imap object
  var imap = new Imap({
    user: config.imapLogin,
    password: config.imapPassword,
    host: config.imapServer,
    port: config.imapPort,
    tls: true,
    debug: function( msg ){
      debug( "IMAP DEBUGGING MESSAGE: " + msg )
    },
    connTimeout: 30000,
    authTimeout: 30000,
    socketTimeout: 30000,
  });


  imap.once('error', function( err ) {
    //logLine( config, null, 2, "IMAP error", err );
    pollingInProgress[ config.id ] = false;
    debug("IMAP error: ", err, config );
  });

  imap.once('end', function() {
    //logLine( config, null, 1, "IMAP connection ended" );
    pollingInProgress[ config.id ] = false;
    debug('Connection ended');
  });

  imap.once('close', function(){
    //logLine( config, null, 1, "IMAP connection closed" );
    pollingInProgress[ config.id ] = false;
    debug("Connection closed" );
  })

  imap.once('ready', function() {

    //logLine( config, null, 1, "IMAP connection established" );

    debug("IMAP is ready");

    // Open INBOX in the imap server
    imap.openBox('INBOX', false, function( err, mailbox ){

      if (err){
        logLine( config, null, null, 1, "Could not open inbox: " + config.imapHost + ":" + config.imapPort, err );
        return;
      }

      debug("Inbox is open");

      imap.search([ 'UNSEEN' ], function(err, uids) {
        if( err ){
          logLine( config, null, null, 1, "Could not search inbox: " + config.imapHost + ":" + config.imapPort, err );
          return;
        }

        debug("Search returned");

        async.eachSeries(
          uids,
          function( uid, uidsIterationCb ){

            fetchFullMessage( config, imap, uid, { bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE )', struct: true }, function( err, fullImapMessage){

              if( err ){
                logLine( config, null, null, 1, "Could not fetch body parts for message " + uid, err );
                return uidsIterationCb( null );
              }
              debug("FULL MESSAGE: ", fullImapMessage );

              stores.messagesTo.dbLayer.selectByHash( { conditions: { foreignId: fullImapMessage.uid } }, { children: true }, function( err, there ){
                if( err ){
                  logLine( config, null, null, 3, "Could not check if message " + fullImapMessage.uid + " was already in the database.", err );
                  return uidsIterationCb( null );
                }
                if( there.length > 0 ){
                  logLine( config, null, null, 1, "Message " + fullImapMessage.uid + " was already in the database, skipping" );

                  // Set the message as read
                  imap.setFlags( fullImapMessage.uid, 'Seen', function( err ){

                    if( err ){
                      logLine( config, null, null, 1, "Error while marking message as read (doing so since it was already in database) " + fullMessageRecord.uid, err )

                    }
                  });

                  return uidsIterationCb( null );

                }

                var m = {
                  type       : 'email',
                  incoming   : true,
                  subject    : fullImapMessage.headers.subject[ 0 ],
                  bodyText   : fullImapMessage.bodyText,
                  bodyHtml   : fullImapMessage.bodyHtml,
                  from       : fullImapMessage.headers.from[ 0 ],
                };

                hotplate.hotEvents.emitCollect( 'transportManipulateMessageBeforeSave', 'email-default', m, config, function( err ){

                  if( err ){
                    logLine( config, null, null, 3, "Error in manipulation (m) before storing message " + fullImapMessage.uid, err );
                    return uidsIterationCb( null );
                  }

                  stores.messages.dbLayer.insert( m, function( err, messageRecord ){

                    if( err ){
                      logLine( config, null, null, 3, "Error storing message " + fullImapMessage.uid, err );
                      return uidsIterationCb( null );
                    }

                    var mt = {
                      messageId: messageRecord.id,
                      to: config.systemEmail,
                      status: 'dontdeliver',
                      failedAttempts: 1,
                      foreignId  : fullImapMessage.uid,
                      foreignData: { headers: fullImapMessage.headers },
                    };


                    hotplate.hotEvents.emitCollect( 'transportManipulateMessageToBeforeSave', 'email-default', mt, config, function( err ){

                      if( err ){
                        logLine( config, null, null, 3, "Error in manipulation (mt) before storing message " + fullImapMessage.uid, err );

                        deleteUnfinishedMessage( config, messageRecord.id );

                        return uidsIterationCb( null );
                      }

                      stores.messagesTo.dbLayer.insert( mt, function( err, messageToRecord ){
                        if( err ){
                          logLine( config, null, null, 3, "Error attaching recipient " + config.systemEmail + " to message " + fullImapMessage.uid, err );

                          deleteUnfinishedMessage( config, messageRecord.id );
                          return uidsIterationCb( null );
                        }

                        async.eachSeries(

                          fullImapMessage.attachments,

                          function( attachment, attachmentIterationCb ){
                            debug("Attachment: %o", attachment );

                            var a = {
                              messageId: messageRecord.id,
                              foreignId: attachment.id,
                              size: attachment.size,
                              mimeType: attachment.mimeType,
                              retrieved: attachment.retrieved,
                              attachmentData: attachment.data
                            };
                            if( attachment.fileName ) a.fileName = attachment.fileName;
                            if( attachment.embeddedId ) a.embeddedId = attachment.embeddedId;

                            debug("About to add record to db: %o", a );

                            stores.messagesAttachments.dbLayer.insert( a, function( err, partRecord ){
                              if( err ){
                                logLine( config, null, null, 3, "Error attaching attachment " + attachmentPart.partID + " to message " + fullImapMessage.uid, err );
                                  return attachmentIterationCb( err );
                              }

                              attachmentIterationCb( null );

                            })
                          },

                          function( err ){

                            // Something went wrong adding attachment: give up on the message
                            if( err ){
                              deleteUnfinishedMessage( config, messageRecord.id );
                              return uidsIterationCb( null );
                            }

                            // Now that _everything_ went according to plan, emit the full message object
                            // (which will include `attachments` and `to` under _children) as a
                            // broadcast
                            stores.messages.dbLayer.selectById( messageRecord.id, function( err, fullMessageRecord ){

                              // If the message cannot be fetched, there is a problem --
                              // abort the current message iteration
                              if( err ){
                                logLine( config, null, null, 3, "Error re-reading the message once sent: " + fullImapMessage.uid + " to broadast it", err );

                                deleteUnfinishedMessage( config, messageRecord.id );

                                // Call the main cycle's cb, so that it goes to the next message
                                return uidsIterationCb( null );
                              }

                              hotplate.hotEvents.emitCollect( 'transportMessageFetched', 'email-default', config, fullMessageRecord, messageToRecord, function( err ) {

                                if( err ){
                                  logLine( config, null, null, 3, "Error after message " + fullImapMessage.uid + " processed", err );

                                  deleteUnfinishedMessage( config, messageRecord.id );

                                    // Call the main cycle's cb, so that it goes to the next message
                                  return uidsIterationCb( null );
                                }

                                // All done, we did it! (Looking at it this way, looks like a miracle)
                                // Go for the next message
                                debug("VICTORY: %o", fullMessageRecord );

                                // Set the message as read
                                imap.setFlags( fullImapMessage.uid, 'Seen', function( err ){

                                  if( err ){
                                    logLine( config, null, null, 1, "Error while marking message as read:  " + fullMessageRecord.uid, err );

                                    // Call the main cycle's cb, so that it goes to the next message
                                    return uidsIterationCb( null );
                                  }


                                  // Add a logline attached to that particular message
                                  logLine( config, fullMessageRecord.id, messageToRecord.id, 1, "Email fetched via IMAP:  " + fullImapMessage.uid );


                                  // All was fine: next message!
                                  uidsIterationCb( null );


                                });

                              });

                            });

                          }
                        );
                        // End of async.eachSeries to add records to messagesTo



                      })
                    })
                  })
                })
              });
            });

          },
          function( err ){

            // Err cannot be set here as iterating function will never cb( err )
            debug("END OF PROCESSING MESSAGES!" );

            // Close the imap connection. A side effect is that
            // pollingInProgress[ config.id ] will be set to false
            imap.end();
          }
        );

      });
    });
  });
  imap.connect();
}
