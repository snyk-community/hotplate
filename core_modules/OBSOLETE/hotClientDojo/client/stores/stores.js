define( [
  "dojo/_base/declare"

, "dojo/topic"
, "dojo/_base/Deferred"
, "dojo/when"

, "hotplate/hotClientDojo/lib/dstore/Rest"
, "hotplate/hotClientDojo/lib/dstore/Trackable"
, "hotplate/hotClientDojo/lib/dstore/Cache"

],function(

  declare
, topic
, Deferred
, when

, Rest
, Observable
, Cache

){

  var cache = {};

  var stores = function( storeName, hash ){

    // if( storeName == 'workspacesContactsCategories') debugger;

    var definedStores, definedStore, resolvedTarget;
    // console.log("Asked for: " + storeName);

    // Gets definedStores from the global registry (in the hotplate global variable)
    if(
      typeof( vars ) == 'object' &&
      typeof( vars.hotCoreStoreVars ) == 'object' &&
      typeof( vars.hotCoreStoreVars.stores ) == 'object'
    ){
      definedStores = vars.hotCoreStoreVars.stores;
    }

    // If the `storeName` parameter is undefined, then the call
    // is simple used to get _all_ cached stores.
    if( typeof( storeName ) === 'undefined' ){
      return cache;
    }

    // If the `hash` parameter is undefined, then the call
    // is simple used to get some stores (matching `storeName`) from the cache. Note that
    // there might well be several stores each with a different target (`/user/3443`, `/user/1111')
    // for the same storeName
    if( typeof( hash ) === 'undefined' ){
      return cache[ storeName ];
    }

    // Gets the store from the global registry (in the hotplate global variable)
    if( typeof( definedStores) !== 'undefined' && typeof( definedStores[ storeName ] ) !== 'undefined' ){
      var definedStore = definedStores[ storeName ];

      // Stores will come as /something/:parameter/other/:id -- we need that :id out of the equation
      var idProperty = definedStore.target.match( /:(\w*)$/ )[1];   
      var target = definedStore.target.replace(/:\w*$/, '');
     
      if( typeof( hash ) === 'object' ){
        resolvedTarget = target;
        for(var k in hash) if( typeof( hash[ k ] ) !== 'undefined' ) resolvedTarget = resolvedTarget.replace( ':' + k, hash[ k ]);
      } else {
        throw( new Error( "Second parameter, if passed,  needs to be a hash: " + storeName ) );
      }
      // if( typeof( hash ) === 'string' ){
      //  resolvedTarget = hash;
      // }
    }

    if( typeof( definedStore ) !== 'undefined' ){


      // ***************************
      // CASE #1: It's in the cache
      // ***************************
   
      if( typeof( cache[ storeName ] ) !== 'undefined' &&
          typeof( cache[ storeName ][ resolvedTarget ] ) !== 'undefined'
      ){

        // console.log("Returned as cached!");
        // console.log(storeName);
        // console.log(resolvedTarget);
        return cache[ storeName ][ resolvedTarget ];

    
      // ********************************
      // CASE #1: It's NOT cached (yet?)
      // ********************************
      } else {


        var type = definedStore.type || 'cached';

        switch( type ){

          case 'uncached':
          //case 'cached':
            var StoreConstructor = declare( [ Observable, Rest ], {
              idProperty: idProperty,
              target: resolvedTarget,
              unresolvedTarget: target,
              sortParam: definedStore.sortParam,
              useRangeHeaders: true,
              defaultNewToStart: definedStore.defaultNewToStart

            });
          break;

          case 'cached':
            var StoreConstructor = declare( [ Observable, Rest, Cache  ], {
              idProperty: idProperty,
              target: resolvedTarget,
              unresolvedTarget: target,
              sortParam: definedStore.sortParam,
              useRangeHeaders: true,
              defaultNewToStart: definedStore.defaultNewToStart,
              constructor: function(){
                this.memCache = this.cachingStore;        
              }
            });
          break;

        } 

        // Make up the "finalStore"
        var finalStore = new StoreConstructor();
 
        // If it needs to always refresh on change, no point in having a queryEngine at all
        if( definedStore.alwaysRefreshOnChange ){
           finalStore.queryEngine = null;
        }

        // Augmenting the final store with (useful) extra informaton
        finalStore['storeName'] = storeName;
        finalStore['resolvedTarget'] = resolvedTarget;
        finalStore['targetHash'] = hash;
        finalStore['alsoNotify'] = definedStore.alsoNotify;
        finalStore['enabledField'] = definedStore.enabledField;
        finalStore['preserveCacheOnReset'] = definedStore.preserveCacheOnReset;

        // Add this result to the cache (including the resolvedTarget)
        if( typeof( cache[ storeName ] ) === 'undefined' ) cache[ storeName ] = {};
        cache[ storeName ][ resolvedTarget ] = finalStore;

        // Publish the fact that a new store was added
        // Other modules can hook to this to modify the store
        topic.publish( 'hotplate/hotClientDojo/newStore', storeName, finalStore );

        // console.log("Final store: (name and object)");
        // console.log( storeName);
        // console.log(finalStore);
        return finalStore;
      }
    } else {
      throw( new Error( "Asked for a non existing store: " + storeName ) );
    }

  }
  
  // A "resetStores" topic means that _all_ caches need to be cleared.
  // The message might come with a `storeData` object, which will imply
  // that stores will need to be pre-filled with that information

  // Note that pre-filling with anything except config stores is tricky/impossible
  // because the same storeName with different targets will be filled
  // with the same data, regardless of filters based on parameters
  // passed in the target. Plus, the server cannot realistically know what is
  // out of sync in terms of displayed data.

  // It's best sticking to predictable config stores for this one
  // So, 'resetStores' will come with `records`, but it will only ever
  // send data for config stores

  topic.subscribe( 'resetStores', function( fromUserId, message ){
        
    console.log('resetStores message received: clearing up the lot');

    // Get the whole cache, which at top level is just an hash where every key
    // is the storeName
    var cache = stores();

    // For each item in the cache...
    Object.keys( cache ).forEach( function( storeName ){
      var storeList = cache[ storeName ];

      // ...there will be a list of stores, each one identified by its target
      Object.keys( storeList ).forEach( function( targetedStore ){
        var store = storeList[ targetedStore ];

        // If the store info came with the reset, fill up the
        // stores' cache with it.
        var records = message.storeRecords[ store.storeName ];
        if( typeof( records ) !== 'undefined' ){

          // It's a lone value -- convert it to Array, so that setData will work
          if( typeof( records.length ) === 'undefined'  ){
            records = [ records ];
          }
          if( store.memCache ) store.memCache.setData( records );

        // If there was NO store data with the reset message, simply
        // zap the store (unless it has preserveCacheOnReset)
        } else {
          if( store.memCache && ! store.preserveCacheOnReset ) store.memCache.setData( [] );
        }

      });
   
    });

    console.log('OK everything should be clean now');
    // Publish topic to tell everybody that stores' cache is no more
    topic.publish( 'refreshData', message.storeRecords );

  });

  return stores;

});

