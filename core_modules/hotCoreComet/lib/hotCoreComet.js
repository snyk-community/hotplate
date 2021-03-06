"use strict";

var dummy
  , hotplate = require('hotplate')

  , declare = require('simpledeclare')

  , async = require( 'async' )
  , SimpleDbLayer = require( 'simpledblayer' )
  , SimpleSchema = require( 'simpleschema' )
  , JsonRestStores = require( 'jsonreststores' )
  , hotCoreStore = require( 'hotplate/core_modules/hotCoreStore' )

  , hotCoreStoreConfig = require( 'hotplate/core_modules/hotCoreStoreConfig' )
  , hotCoreStore = require( 'hotplate/core_modules/hotCoreStore' )
  , debug = require('debug')('hotplate:hotCoreComet')
;


var TABLIFESPAN = 18000;
var CLEANUPINTERVAL = 30000;

var intervalHandles = [];
// On shutdown, stop all intervals
process.on( 'hotplateShutdown', function(){
  intervalHandles.forEach( function( i ){
    clearInterval( i );
  });
});

hotplate.hotEvents.onCollect( 'stores', 'hotCoreComet', hotplate.cacheable( function( done ){

  var stores = {};

   // This module only uses JsonRestStores as a way to access the DB and expose methods,
   // it doesn't mixin with hotJsonRestStores (which would do Comet event emission etc.)

   hotCoreStore.get( function( err, s ){
    if( err ) return done( err );

    var BasicDbStore = s.BasicDbStore;
    var BasicSchema = s.BasicSchema;

    // ***********************************
    // *** OPEN TABS   *******************
    // ***********************************

    var Tabs = declare( BasicDbStore, {

      schema: new BasicSchema({
        userId:        { type: 'id', required: true, searchable: true },
        lastSync:      { type: 'date', searchable: true, default: function(){ return new Date() } },
      }),

      handlePost: true,
      handleDelete: true,

      storeName:  'tabs',

      publicURL: '/tabs/:id',
      hotExpose: true,
      type: 'uncached',

      prepareBody: function( request, method, body, cb ){

        // Make a (shallow) copy
        var body = this._co( body );

        if( method == 'post' && request.remote ){
          if( request.session.userId ){
            body.userId = request.session.userId;
          }
        }
        cb( null, body );
      },

      // Delete ALL entries in TabMessages when a tab gets deleted
      afterEverything: function( request, method, cb ){

        // Only deal with delete
        if( method !== 'delete' ) return cb( null );

        // Delete the tab messages
        stores.tabMessages.dbLayer.delete( { type: 'eq', args: [ 'tabId', request.body.tabId ] }, cb );
      },


    });
    stores.tabs = new Tabs();

    // Internal store, only used via API
    var TabMessages = declare( BasicDbStore, {

      schema: new BasicSchema({
        fromUserId:    { type: 'id', searchable: true, required: false },
        message:       { type: 'serialize', required: true },
        added:         { type: 'date', searchable: true, default: function() { return new Date() } },
      }),

      storeName:  'tabMessages',
      paramIds: [ 'tabId', 'id' ],
      type: 'uncached',

    });
    stores.tabMessages = new TabMessages();

    // NON-DB STORE, sends an object out with all of the messages
    // It will return an array of unserialised messages in TabMessages for
    // a specific tabId, and then it will DELETE those messages
    var TabMessageDispatcher = declare( JsonRestStores, JsonRestStores.HTTPMixin, {

      schema: new SimpleSchema({
        tabId:         { type: 'blob' }, // This is 'blob' as SimpleSchema has numbers for IDs by default
        messages:      { type: 'none' },
      }),
      chainErrors: 'all',

      storeName:  'tabMessageDispatcher',

      publicURL: '/tabs/dispatcher/:tabId',
      hotExpose: true,
      type: 'uncached',

      handleGet: true,
      checkPermissions: function( request, method, done ){

        // Check that the remote user requesting the tab is indeed the tab's owner
        var self = this;

        // Only check for 'get'
        if( method !== 'get' ) return done( null, true );

        // User needs to be logged in
        if( ! request.session.userId ) return done( null, false );

        // TODO: Optimise a little here. Since checkPermissions is called before driverAllDbFetch,
        // try and cache this result
        stores.tabs.dbLayer.select( { conditions: {
          type: 'and',
          args: [
            {
              type: 'gte',
              args: [ 'lastSync', new Date() - TABLIFESPAN ]
            },
            {
              type: 'eq',
              args: [ 'id', request.params.tabId ]
            }
          ] } }, function( err, tabs ){
          if( err ) return done( err );

          // This may seem strange, but always pass authentication if the tab is not
          // there, as the store will need to accept the get and return the "storeReset"
          // message after returning the new tab
          if( tabs.length == 0 ){
             done( null, true );
          } else {
            done( null, tabs[0].userId.toString() === request.session.userId.toString() );
          }

        });


      },

      implementFetchOne: function( request, done ){

        var messages = [];
        var self = this;

        // If it's not a remote call, always return empty result
        if( ! request.remote ) return done( null, { messages: [] } );

        var headersWorkspaceId = request._req.headers[ 'x-hotplate-workspaceid' ];

        // User is not logged in -- goodbye
        if( ! request.session.loggedIn || ! request.session.userId ){
          debug("A non-logged in user tried to fetch tabId %s for workspaceId %s, denying...", request.params.tabId, headersWorkspaceId );
          return done( new self.UnauthorizedError() );
        }

        //debug("Looking for tab %s owned by user %s, x-workspaceId is %s, expiration is %s, now is %s", request.params.tabId, request.session.userId, headersWorkspaceId, new Date( new Date() - TABLIFESPAN ), new Date() );

        //stores.tabs.apiGetQuery( { conditions: { id: request.params.tabId, userId: request.session.userId, fromLastSync: new Date() - TABLIFESPAN } }, function( err, tab ){
        stores.tabs.dbLayer.select( { conditions: {
          type: 'and',
          args: [
            {
              type: 'gte',
              args: [ 'lastSync', new Date() - TABLIFESPAN ]
            },

            {
              type: 'eq',
              args: [ 'id', request.params.tabId ]
            },

            {
              type: 'eq',
              args: [ 'userId', request.session.userId ]
            },

          ] } }, function( err, tabs ){


          if( err ) return  done( err );

          if( tabs.length == 0 ){

            debug("Fetching messages for tab, but tab not found:");
            debug( tabs );

            debug("Tab was NOT present. Trying to understand if I should create one");

            // At this point, the tab wasn't found. If workspaceId was passed via headers,
            // the person will be returned the configuration for that workspace. We need to check
            // that the user actually has access to that workspaceId.

            hotCoreStore.getAllStores( function( err, storesData ){
              if( err ) return done( err );

              debug("Checking that user has access to the workspaceId she is trying to register for");
              storesData.usersWorkspaces.dbLayer.selectByHash( { conditions: { userId: request.session.userId, workspaceId: headersWorkspaceId } }, { DEBUGME: true }, function( err, uwDocs){
                if( err ) return done( err );

                if( uwDocs.length == 0 ){
                  debug("No access -- user needs to (re?)login!");
                  return done( new self.UnauthorizedError() );
                }

                debug("OK, access is cleared, creating the tab for the user...");
                debug( request.session.userId );
                stores.tabs.dbLayer.insert( { userId: request.session.userId }, function( err, tab ){
                  if( err ) return done( err );

                  debug("...and ALSO returning the workspace configuration for that userId");
                  hotCoreStoreConfig.getConfigRecords( headersWorkspaceId, request.session.userId, function( err, storeRecords ){
                    if( err ) return done( err );

                    done( null, { messages: [ { fromUserId: request.session.userId, message: { type: 'resetStores', tabId: tab.id, storeRecords: storeRecords } } ] } );
                  });
                });
              });
            });

          } else {

            // Write the new access time onto the tab's record;
            var tab = tabs[ 0 ];
            tab.lastSync = new Date();

            stores.tabs.dbLayer.updateById( tab.id, { lastSync: tab.lastSync }, function( err, tab ){
              if( err ) return done( err );

              // Return all messages for that tab, REMOVING after fetching
              var cursor = stores.tabMessages.dbLayer.select( { sort: { added: 1 }, conditions: {
                type: 'and',
                args: [
                  {
                    type: 'gte',
                    args: [ 'added', new Date() - TABLIFESPAN ]
                  },
                  {
                    type: 'eq',
                    args: [ 'tabId', request.params.tabId ]
                  },
                ]
              } }, { delete: true, useCursor: true }, function( err, tabMessagesCursor ){
                if( err ) return done( err );

                tabMessagesCursor.each(

                  function( tabMessage, cb ){
                    delete tabMessage.messageId;
                    delete tabMessage.tabId;
                    messages.push( tabMessage);
                    cb( null );
                  },

                  function( err ){
                    if( err ) return done( err );

                    done( null, { messages: messages } );
                  }

                );

              });
            });

           }

        });

      },

    });
    stores.tabMessageDispatcher = new TabMessageDispatcher();

    done( null, stores );
  });

}))


hotplate.hotEvents.onCollect( 'run', function( done ){

  hotCoreStore.getAllStores( function( err, storesData ){
    if( err ){
      done( err );
    } else {
      // Clean up Tabs collection every 30 seconds, so that
      // dead tabs are gotten rid of
      var cleaningUp = false;


      intervalHandles.push( setInterval( function(){
        if( cleaningUp ) return;
        cleaningUp = true;

        debug("Cleaning up unused tabs, where date is less than: %s", new Date( new Date() - TABLIFESPAN ) );

        //debug( "Cleaning up expired tabs and tab messages..." );

        storesData.tabs.dbLayer.delete( { type: 'lte', args: [ 'lastSync', new Date( new Date() - TABLIFESPAN ) ] }, { multi: true }, function( err, howMany ){
          debug( 'Tabs: error and howMany: ', err, howMany );
          //TODO: Log error

          storesData.tabMessages.dbLayer.delete( { type: 'lte', args: [ 'added', new Date( new Date() - TABLIFESPAN ) ] }, { multi: true }, function( err, howMany ){
             debug( 'TabMessages: error and howMany: ', err, howMany );
            // TODO: Log error
            cleaningUp = false;
          });
        });

      }, CLEANUPINTERVAL ) );


    }
  });

  done( null );
});


hotplate.hotEvents.onCollect('cometBroadcast', 'hotCoreComet', function( userId, tabId, makeTabIdHash, message, done ){

  var self = this;

  debug("Asked to broadcast!");

  hotCoreStore.getAllStores( function( err, storesData ){
    if( err ) return done( err );

    // makeTabId function wasn't passed: just use the stock "send it to all tabs" function
    if( ! makeTabIdHash ){
      debug("Using allTabIdHash!");
      makeTabIdHash = allTabIdHash;
    } else {
      debug("Using PASSED makeTabIdHash!");
    }

    // Get the list of tab ids
    makeTabIdHash( userId, tabId, message, function( err, tabIdHash ){
      if( err ) return done( err );

      async.eachSeries(

        Object.keys( tabIdHash ),

        function( tabId, cb){

          // Make up the object. fromUserId is not required, so it will only be added if needed
          var obj = {
            tabId: tabId,
            message: message
          };
          if( userId ) obj.fromUserId = userId;

          // OK, post it to the messages
          storesData.tabMessages.dbLayer.insert( obj, cb );
        },

        function( err ){
          if( err ) return done( err );

          done( null );
        }
      );

    })


  });

});

function allTabIdHash( userId, tabId, message, done ){

  debug("In allTabIdHash!" );

  hotCoreStore.getAllStores( function( err, storesData ){
    if( err ){
      done( err );
    } else {

      var tabIdHash = {};

      // Just return all active tabs

      //storesData.tabs.apiGetQuery( { conditions: { fromLastSync: new Date() - TABLIFESPAN  }  }, function( err, docs ){

      stores.tabs.dbLayer.select( { conditions: {
        type: 'and',
        args: [
          {
            type: 'gte',
            args: [ 'lastSync', new Date() - TABLIFESPAN ]
          },
        ] } }, function( err, tabs ){

        if( err ) return done( err );

        tabs.forEach( function( i ){
          if( i.id != tabId ) tabIdHash[ i.id ] = true;
        });

        done( null, tabIdHash );
      });
    }
  });

}
