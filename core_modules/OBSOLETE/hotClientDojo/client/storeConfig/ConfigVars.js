
define([

  "dojo/_base/declare"
, "dojo/topic"
, "dojo/when"

, "hotplate/hotClientDojo/stores/stores"
, "hotplate/hotClientDojo/globals/globals"

], function(

  declare
, topic
, when

, stores
, globals

 ){

  var r = {};

  // Important note: this is a rare case where we can be sure that the store lookup using `store()` will
  // return always the same store, because the only parameters we ever pass to it are `workspaceId` and `userId`
  // (by design), which by definition are always the same in the life of the app.

  Object.keys( vars.hotCoreStoreConfig.configStores ).forEach( function( storeName ){

    // Loads the store
    var store = stores( storeName, { workspaceId: globals.workspaceId, userId: globals.userId } );

    // Get the config records value from the global variable on the page
    var storeRecords = vars.hotCoreStoreConfig.storeRecords[ storeName ];

    // It's a one-record value: assign its value to the `r` hash (to be returned), and then
    // turn it into an array, ready for setData
    if( store.idProperty == 'userId' || store.idProperty == 'workspaceId' || store.idProperty == 'globalId' ){
      r[ storeName ] = storeRecords;
      storeRecords = [ storeRecords ];

      // Watch for changes
      store.on( 'add,update,delete', function( event ){
        r[ storeName ] = event.target;
        topic.publish('configChange/' + storeName, r[ storeName ] );
      });

    }

    // Write the data into the cache (at this point, it's always an array)
    if( store.memCache ) store.memCache.setData( storeRecords );

  });


  // `refreshData`
  // Subscribe to refreshData -- when it happens, it means that the application
  // has timed out and stores' cache has been updated. If that's the case,
  // the `r` variable will need to be updated with the values that came from
  // the refreshData message (if they are managed by `r` and are one-record ones)
  //
  topic.subscribe( 'refreshData', function( storeRecords ) {
    Object.keys( storeRecords ).forEach( function( storeName ){
      var storeData = storeRecords[ storeName ];

      // If it's a one-record value, and the storeName is in `r`...
      if( typeof( storeData.length ) === 'undefined' && typeof( r[ storeName ] !== 'undefined' ) ){

        // ...then update `r` and publish the `configChange` event
        r[ storeName ] = storeData;
        topic.publish('configChange/' + storeName, r[ storeName ] );
      }
    });

  });

  return r;

});


