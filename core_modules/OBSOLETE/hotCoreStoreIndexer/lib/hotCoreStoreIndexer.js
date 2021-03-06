"use strict";

/*!
 * Module dependencies.
 */

var dummy
  , hotplate = require('hotplate')
  , hotCoreStoreRegistry = require( 'hotCoreStoreRegistry' )
  , debug = require('debug')('hotplate:hotCoreStoreIndexer')
;

hotplate.config.set( 'hotCoreStoreIndexer.zapIndexes', false );

hotplate.hotEvents.onCollect( 'run', function( done ){

  hotCoreStoreRegistry.getAllStores( function( err, allStores ){

    Object.keys( allStores ).forEach( function( storeName ){

      var store = allStores[ storeName ];

      if( ! store.dbLayer ) return; // Like saying "continue"

      if( hotplate.config.get( 'hotCoreStoreIndexer.zapIndexes' ) ){

        debug("Zapping indexes before rebuilding them for ", storeName);

        store.dbLayer.dropAllIndexes( function( e ){
          store.dbLayer.generateSchemaIndexes( { background: true }, function(){}  );
        });
      } else {
        store.dbLayer.generateSchemaIndexes( { background: true }, function(){}  );
      }

    });

    done( null );
  });
});
