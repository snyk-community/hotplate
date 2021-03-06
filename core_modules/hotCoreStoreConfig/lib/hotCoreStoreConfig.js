"use strict";
/*!
 * Module dependencies.
 */

var dummy
  , hotplate = require('hotplate')
  , path = require('path')
  , async = require('async')
  , hotCoreStore = require('hotplate/core_modules/hotCoreStore')
  , debug = require('debug')('hotplate:hotCoreStoreConfig')
;

var getConfigRecords = exports.getConfigRecords = function( workspaceId, userId, cb ){

  // Sanity check: drop the workspaceId parameter if multiHome is not defined or false
  if( ! hotplate.config.get('hotCoreMultiHome.enabled') ){
    workspaceId = null;
  }

  var results = {};

  // If they are both empty, simply return an empty result.
  // This will the flow of calling function easier
  if( ! workspaceId && ! userId ) return cb( null, results );


  getConfigStores( function( err, configStores ){

    async.each(

      Object.keys( configStores ),

      function( storeName, cb ){

        var store = configStores[ storeName ];

        debug("IN ITERATING FUNCTION FOR " + store.storeName );

        // If getConfigRecords was called for a specific workspaceId and config store
        // doesn't store workspaceId info, then skip everthing. Ditto for userId.
        if( store.configStore.workspaceId && !workspaceId ) return cb( null );
        if( store.configStore.userId && ! userId ) return cb( null );

        debug("PRE-LOADING RECORD FOR " + store.storeName );

        var newRecord;
        var filter = newRecord = {};

        // Sets the filter based on workspaceId and userId.
        // NOTE: no filter is set for globalId, as only one record is supposed to be there,
        // and the first one will be considered
        if( store.configStore.workspaceId ){
          filter.workspaceId = workspaceId;
        }
        if( store.configStore.userId ){
          filter.userId = userId;
        }

        // It's a one-field set, it will only return ONE value.
        //
        if( store.idProperty == 'workspaceId' || store.idProperty == 'userId' || store.idProperty == 'globalId'){

          debug("ONE-RECORD config store -- getting it (or creating it if missing)");
          store.dbLayer.selectByHash( filter, { children: true }, function( err, docs ){
            if( err ) return cb( err );

            // TODO: Add warning for docs.length > 1

            // If a document was found, no need to do anything -- it will get returned
            if( docs.length !== 0 ){
              debug("Record existed, all good for " + store.storeName );
              results[ store.storeName ] = docs[ 0 ];
              return cb( null );
            }

            debug("Record didn't exist! Creating one for " + store.storeName );
            debug( filter );

            // Adding defaults taken from the schema
            for( var k in store.schema.structure ){
              var v = store.schema.structure[ k ];
              if( typeof( v.default ) !== 'undefined' ) newRecord[ k ] = v.default;
            }

            // Create the globalId.
            // TODO: Optimise this. globalId is not always needed. Doing it like this
            // to keep flow simple for now.
            store.schema.makeId( newRecord, function( err, globalId ) {
              if( err ) return cb( err )

              if( store.idProperty === 'globalId' ){
                newRecord.globalId = globalId;
              }

              store.dbLayer.insert( newRecord, { children: true }, function( err, doc ){
                if( err ) return cb( err );

                results[ store.storeName ] = doc;
                cb( null );
              });
            });
          });

        } else {
          debug("COLLECTION config store -- getting it");
          store.dbLayer.selectByHash( filter, { children: true }, function( err, docs ){
            if( err ) return cb( err );

            results[ store.storeName ] = docs;
            return cb( null );
          });
        }

      },

      function( err ){
        if( err ) return cb( err );

        cb( null, results );
      }
    ); // end of async.eachSeries

  });

}



var getConfigStores = exports.getConfigStores = function( done ){

  var ret = {};

  hotCoreStore.getAllStores( function( err, allStores ){
    if( err ) return done( err );

    Object.keys( allStores ).forEach( function( storeName ){

      var store = allStores[ storeName ];

      // The store is a config store: add it to the list to be returned
      if( store.configStore ) ret[ storeName ] = store;
    });

    done( null, ret );
  });
}
