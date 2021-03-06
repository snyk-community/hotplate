"use strict";

/*!
 * Module dependencies.
 */

var dummy
  , hotplate = require('hotplate')
  , path = require('path')
  , hotCoreStoreRegistry = require( 'hotCoreStoreRegistry' )
;


hotplate.config.set( 'hotCoreStoreExposer.storesUrlsPrefix', "/stores" );

// Run onlineAll for each store with a publicURL attribute

hotplate.hotEvents.onCollect( 'setRoutes', function( app, done ){

  hotCoreStoreRegistry.getAllStores( function( err, allStores ){

    Object.keys( allStores ).forEach( function( storeName ){

      var store = allStores[ storeName ];

      // The store has a public URL: add it to the list of stores to expose
      // Note that I pass the modified URL to setAllRoutes
      if( store.hotExpose ){
        store.publicURLPrefix = hotplate.config.get( 'hotCoreStoreExposer.storesUrlsPrefix' );
        store.protocolListenHTTP( { app: app } );
      }
    });

    done( null );
  });
});
