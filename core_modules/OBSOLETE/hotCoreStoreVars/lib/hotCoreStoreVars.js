"use strict";
/*!
 * Module dependencies.
 */

var dummy
  , path = require('path')
  , hotplate = require('hotplate')
  , hotCoreStoreRegistry = require('hotCoreStoreRegistry')
;

hotplate.hotEvents.onCollect('pageElements', 'hotCoreStoreVars', hotplate.cacheable( function( done ){

  var storesVarsData = {};
  var parentStores = {};

  hotCoreStoreRegistry.getAllStores( function( err, allStores ){

    Object.keys( allStores ).forEach( function( storeName ){
      var store = allStores[ storeName ];

      if( store.publicURL && store.hotExpose ){
        var url = path.join( hotplate.config.get( 'hotCoreStoreExposer.storesUrlsPrefix' ), store.publicURL );
        storesVarsData[ store.storeName ] = { 
          target: url,
          sortParam: 'sortBy',
          alsoNotify: store.alsoNotify,
          enabledField: store.enabledField,
          defaultNewToStart: store.defaultNewToStart,
          preserveCacheOnReset: !!store.preserveCacheOnReset,
          alwaysRefreshOnChange: store.alwaysRefreshOnChange,
          type: store.type ? store.type : 'cached',      
        };
        if( store.collectionName ) storesVarsData[ store.storeName ].collectionName = store.collectionName;

        if( store.nested ){

          //console.log("Store", store.storeName, "Has these nested ones:", store.nested );

          // Add the nested entry to teh vars if `nested` is defined in the store
          storesVarsData[ store.storeName ].nested = varifyNested( store.nested );


          // Adds entry to parentStores if needed
          store.nested.forEach( function( e ){

            // One-record piggyback stores don't have children by definition
            if( store.piggyField ) return;

            // Add this nested store to the parent's list
            parentStores[ e.store.storeName ] = parentStores[ e.store.storeName ] || [];
            parentStores[ e.store.storeName ].push( { storeName: store.storeName, type: e.type, localField: e.localField, join: e.join } );
          })
        }

      }
    });
  });


  done( null, { vars: [
    { name: 'stores', value: storesVarsData },
    { name: 'parentStores', value: parentStores }
  ]});

}));


function varifyNested( storeNested ){
  var newNested = [];
  storeNested.forEach( function( e ){
    newNested.push( varifyNestedEntry( e ) );
  })
  return newNested;
}

function varifyNestedEntry( entry ){
  var newEntry = {};
  newEntry.type = entry.type;
  newEntry.storeName = entry.store.storeName;
  newEntry.localField = entry.localField;
  newEntry.join = entry.join;

  //if( entry.type === 'multiple') console.log("IT IS: ", newEntry );

  return newEntry;
}
