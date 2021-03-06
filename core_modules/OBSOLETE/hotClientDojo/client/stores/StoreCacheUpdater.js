define( [
  "dojo/_base/declare"

, "dojo/topic"
, "dojo/_base/lang"
, "dojo/aspect"
, "dojo/topic"

, "hotplate/hotClientDojo/stores/stores"
, 'hotplate/hotClientDojo/globals/globals'

], function(
  declare

, topic
, lang
, aspect
, topic

, stores
, globals

){

  // Utility function used to check if a target's placeholding elements
  // match a object's keys. For example:
  // * target: '/workspaces/workspaceId/users'
  // * targetHash: { workspaceId: 10 }
  // THEN:
  // * o == { user: 'Tony', workspaceId: 11} // RETURN FALSE
  // * o == { user: 'Tony', workspaceId: 10} // RETURN TRUE
  var objectValuesIn = function( target, targetHash, o ){

    // Get all tokens in the target.
    var elements = target.match(/:(\w*)/g);

    // No tokens: true by principle
    if( ! elements ) return true;

    // targetHash needs to be a proper object  
    if( typeof( targetHash ) !== 'object' || targetHash === null ) return false;

    // Go through tokens, and check that object being worked on
    // matches the passed hash for that store
    var equal = true;
    for( var i = 0, l = elements.length; i < l; i ++){
      var token = elements[ i ].substr( 1 );
      if( targetHash[ token ] != o[ token ] ){
        equal = false;
        break;
      }
    }

    return equal;
  }

  // CHANGES FROM WITHIN
  //
  // Whenever a change is made to a store locally, trigger a storeRecordUpdate******* topic
  // within the application, exactly the same as the ones triggered by comet events.

  topic.subscribe( 'hotplate/hotClientDojo/newStore', function( storeName, store ){

    store.on( 'add,update,delete', function( event ){

      var topicType, topicEvent = {};

      // If an event has `remote` set, it means that it was the result of a remote comet message: this topic
      // would be a duplicate. So, don't.
      if( event.remote ) return;

      // Publish the topic depending on the event. This is to make sure that the application
      // can listen to storeRecord????? events, and get both the local ones and the remote ones
      // treating them the same way. This is especially useful if a developer wants to monitor
      // changes to a store _globally_, without running `on()` for specific instances
      var topicType = event.type === 'add' ? 'storeRecordCreate' : (  event.type === 'update' ? 'storeRecordUpdate' : 'storeRecordRemove' );

      // Creating the basic topic event
      topicEvent = { type: topicType, storeName: storeName, target: event.target, targetId: event.target[ store.idProperty ], beforeId: event.beforeId };

      if( event.doNotUpdateParentsCache ) topicEvent.doNotUpdateParentsCache = true;

      topic.publish( topicType, globals.userId, topicEvent, false )

    });
  });


  // UPDATE CACHE BASED ON storeRecord TOPICS.
  // 
  // These topics might have been published internally, or by a Comet call

  topic.subscribe('storeRecordUpdate', function( from, message, remote ){

    // Update parent stores' cache
    // Note: this happens whether the request is local or remote
    if( ! message.doNotUpdateParentsCache) updateParentsCache( 'update', message.storeName, message.target );

    // Always process message.storeName
    // PLUS, add alsoStore stores to the list of the ones to process.
    var toProcess = [ message.storeName ];
    var storeEntry = vars['hotCoreStoreVars']['stores'][ message.storeName ];
    if( storeEntry.alsoNotify && storeEntry.alsoNotify.length ){
      toProcess = toProcess.concat( storeEntry.alsoNotify );
    }

    toProcess.forEach( function( storeName ){

      // It will only deal with remote events for the main store.
      // Note that alsoNotify stores' caches will be updated regardless
      if( ! remote  && storeName === message.storeName ) return;

      var definedStores = stores( storeName );
      for( var k in definedStores ){
        var store = definedStores[ k ];

        if( objectValuesIn( store.unresolvedTarget, store.targetHash, message.target ) ){

          // Place the item in the right spot in the cache
          // Note that `message` is passed as the `put()`'s parameters option
          // since it will contain objectId
          if( typeof( message.beforeId) === 'undefined' ) delete message.beforeId;
          if( store.memCache) store.memCache.put( message.target, message );

          // This is here to prevent this very file from fire a topic as well
          message.remote = true;
          if( storeName !== message.storeName ) message.keepForm = true;

          // Emit the update event, which will effectively notify all tracking widgets
          store.emit( 'update', message );

        }
      }
    })
      
  });

  topic.subscribe('storeRecordCreate', function( from, message, remote ){

    // Update parent stores' cache
    // Note: this happens whether the request is local or remote
    if( ! message.doNotUpdateParentsCache) updateParentsCache( 'create', message.storeName, message.target );

    // Always process message.storeName
    // PLUS, add alsoStore stores to the list of the ones to process.
    var toProcess = [ message.storeName ];
    var storeEntry = vars['hotCoreStoreVars']['stores'][ message.storeName ];
    if( storeEntry.alsoNotify && storeEntry.alsoNotify.length ){
      toProcess = toProcess.concat( storeEntry.alsoNotify );
    }

    toProcess.forEach( function( storeName ){

      // It will only deal with remote events for the main store.
      // Note that alsoNotify stores' caches will be updated regardless
      if( ! remote  && storeName === message.storeName ) return;

      var definedStores = stores( storeName );

      for( var k in definedStores ){
        var store = definedStores[ k ];

        if( objectValuesIn( store.unresolvedTarget, store.targetHash, message.target ) ){

          // Place the item in the right spot in the cache
          // Note that `message` is passed as the `put()`'s parameters option
          // since it will contain objectId
          if( typeof( message.beforeId) === 'undefined' ) delete message.beforeId;
          if( store.memCache) store.memCache.put( message.target, message );

          // This is here to prevent this very file from fire a topic as well
          message.remote = true;

          if( storeName !== message.storeName ) message.keepForm = true;

          // Emit the update event, which will effectively notify all tracking widgets
          store.emit( 'add', message );
        }
      }
    });
  });

  topic.subscribe('storeRecordRemove', function( from, message, remote ){

    // Update parent stores' cache
    // Note: this happens whether the request is local or remote
    if( ! message.doNotUpdateParentsCache) updateParentsCache( 'remove', message.storeName, message.target );

    // Always process message.storeName
    // PLUS, add alsoStore stores to the list of the ones to process.
    var toProcess = [ message.storeName ];
    var storeEntry = vars['hotCoreStoreVars']['stores'][ message.storeName ];
    if( storeEntry.alsoNotify && storeEntry.alsoNotify.length ){
      toProcess = toProcess.concat( storeEntry.alsoNotify );
    }

    toProcess.forEach( function( storeName ){

      // It will only deal with remote events for the main store.
      // Note that alsoNotify stores' caches will be updated regardless
      if( ! remote  && storeName === message.storeName ) return;

      var definedStores = stores( storeName );

      for( var k in definedStores ){
        var store = definedStores[ k ];

       if( objectValuesIn( store.unresolvedTarget, store.targetHash, message.target ) ){

          // Make up removeParameters. Since I need an extra attribute, `id`, I make a new
          // object so that I don't modify the message object (which would be probably fine,
          // but dirty and side-effect-ish)
          var removeParameters = {};
          for( var k in message ) removeParameters[ k ] = message[ k ];
          removeParameters.id = message.targetId;

          // Delete the element from the cache
          if( store.memCache) store.memCache.remove( message.targetId, removeParameters );

          // This is here to prevent this very file from fire a topic as well
          message.remote = true;
          if( storeName !== message.storeName ) message.keepForm = true;

          // Emit the update event, which will effectively notify all tracking widgets
          store.emit( 'delete', removeParameters );
        }
      }
    });
  });


  // TODO:
  // Decide if I should:
  // * Use Memory's own mechanism to search. I prefer raw memory search for speed
  // * Use Memory's own 'put()' calls to save. This will store.storage.version ++ but I don't
  //   REALLY need to do that since the main data hasn't changed
  // For now, this works and it's really fast.

  // Update parent stores if a child is modified
  function updateParentsCache( type, storeName, o ){

    // Utility function to zap children from a record.
    function zapChildren( o ){
      var r = {};
      for( var k in o ) if( o.hasOwnProperty( k ) ) r[ k ] = o[ k ];
      r._children = {};

      return r;
    }

    // Get the global array of parent stores
    var parentStores = vars.hotCoreStoreVars.parentStores[ storeName ];

    // No parent stores, no game
    if( ! Array.isArray( parentStores) ) return;

    // Go through each entry in parentStores    
    parentStores.forEach( function( parentStoreEntry ){

      // Get the defined stores for that parent store's entry
      var definedStores = stores( parentStoreEntry.storeName );

      // For each defined store...
      for( var k in definedStores ){
        var store = definedStores[ k ];

        // There is no memCache: end of story
        if( ! store.memCache ) continue;

        // There is no data: end of story 
        var data = store.memCache.data;
        if( !data || !Array.isArray( data) || !data.length ) continue;

        switch( parentStoreEntry.type ){

          case 'multiple':

            // Go through every record in the cache, and continue to next iteration
            // if _children isn't there
            for( var i = 0, l = data.length; i < l; i ++ ){
              var record = data[ i ];
              if( !record._children || !record._children[ storeName] ) continue;

              // Go through children records, if it finds one update it and break
              // out of the cycle
              var childrenRecords = record._children[ storeName ];

              // Check the join, will skip going through records if not correct
              var match = true;
              Object.keys( parentStoreEntry.join ).forEach( function( oField ){
                var recordField = parentStoreEntry.join[ oField ];

                //console.log( "Comparing ", record, recordField );
                //console.log( "With ", o, oField );
                
                if( record[ recordField ] != o[ oField ] ) match = false;
              });

              //console.log( "MATCH IS:", match );

              // No match in join, continue to next record
              if( ! match ) continue;

              // For 'create', simply add the entry to the one matching the join
              if( type === 'create'){

                childrenRecords.push( zapChildren( o ) );
                store.emit( 'update', { keepForm: true, target: record, doNotUpdateParentsCache: true } );
                //console.log("CREATED! NOW IT IS:", record );
              } 

              // For 'update' and 'remove', change the array
              else {
                for( var j = 0, ll = childrenRecords.length; j < ll; j ++ ){
                  var childRecord = childrenRecords[ j ];

                  if( childRecord[ store.idProperty] === o[ store.idProperty ] ){
                    if( type === 'update' ) childrenRecords[ j ] = zapChildren( o );
                    if( type === 'remove' ) delete childrenRecords[ j ];

                    // Update the storage version, and emit the change event for the parent
                    store.storage.version ++;
                    store.emit( 'update', { keepForm: true, target: record, doNotUpdateParentsCache: true } );

                    //console.log("MANIPULATED! NOW IT IS:", record );
                    break;
                  }
                }
              }
            }
          break;

          case 'lookup':

           // Go through every record in the cache, and continue to next iteration
            // if _children isn't there
            for( var i = 0, l = data.length; i < l; i ++ ){
              var record = data[ i ];
              if( !record._children || !record._children[ parentStoreEntry.localField ] ) continue;

              // Get the correct child record in _children, which depends on `localField`
              var childRecord = record._children[ parentStoreEntry.localField ];
              if( !childRecord ) continue;

              //  If the ID corresponds to the change one, update it
              if( childRecord[ store.idProperty] === o[ store.idProperty ] ){
                record._children[ parentStoreEntry.localField ] = o;
                //console.log("EMITTING UPDATE FOR STORE:", store.storeName, "RECORD: ", record, "BECAUSE OF RECORD", o );
                store.storage.version ++;
                store.emit( 'update', { keepForm: true, target: record, doNotUpdateParentsCache: true } );
              }
            }
            //console.log("DATA IS:", data );
          break;
        }
      }
    });
  }

  return {};

});

