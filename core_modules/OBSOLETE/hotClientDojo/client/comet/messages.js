define( [

  "dojo/_base/declare"
, "dojo/json"
, "dojo/_base/lang"
, "dojo/request"
, "dojo/Evented"
, "dojo/topic"
, "dojo/aspect"
, "dojo/when"

, "hotplate/hotClientDojo/stores/stores"
, 'hotplate/hotClientDojo/globals/globals'

], function(

  declare
, json
, lang
, request
, Evented
, topic
, aspect
, when

, stores
, globals

){

  var Messages = declare( [ Evented ], {

    // Tab ID
    tabId: null,
    registered: false,
    pollingNow: false,
    pollInterval: 5000,
    timeoutId: 0,

    constructor: function(){
    },

    register: function(){
      var self = this;
      return when( stores('tabs', {} ).put( {} )) .then(
      //return when( stores('tabs', {} ).noCache.put( {} )) .then(
        function( res ){
          self.tabId = res.id;
          vars.tabId = res.id;
          self.timeoutId = setTimeout( lang.hitch(self, self.poll), self.pollInterval );
        }
      );

    },

    unregister: function(){
      var self = this;

      return when( stores('tabs', {} ).remove( self.tabId )).then(
        function( res ){
          self.tabId = null;
          vars.tabId = null;

          clearTimeout( self.timeoutId );
          self.timeoutId = 0;
        }
      );
    },


    poll: function(){

      var self = this;

      // this.tabId is 100% necessary -- if it's not there,
      // it means that object wasn't successfully registered. So, quit.
      if( ! this.tabId ) return;

      // If it's polling right now, don't do anything.
      if( this.pollingNow ) return;
      this.pollingNow = true;

      // This came from Javascript, cancel the current timeout and a new one
      // will be created at the end
      if( this.timeoutId ){
        clearTimeout( this.timeoutId );
        this.timeoutId = 0;
      }

      // Makes the request to get messages for this tab. Also passes the workspaceId -- IF there -- as a header
      // (yes, the workspaceId might be needed by the other end to return configuration records with the
      // resetStore message in case the tab has expired/disappeared)
      var headers = {};
      if( typeof( globals.workspaceId ) !== 'undefined' ){
        headers[ 'X-hotplate-workspaceId' ] = globals.workspaceId;
      }
      var tabMessageDispatcher = stores('tabMessageDispatcher', {} );


      when( tabMessageDispatcher.get( self.tabId, { headers: headers } ) ).then(


        function(res){


          // Emit message events. The event name is "type"
          if( res && Array.isArray(res.messages)  ){
            res.messages.forEach( function( item ) {

              // Wait! There was a `resetStores` message! This means that
              // tabId has changed. By definition, a `resetStores` message
              // is the only message in the queue
              if( item.message.type === 'resetStores' ){
                self.tabId = item.message.tabId;
                vars.tabId = item.message.tabId;
              }
              topic.publish( item.message.type, item.fromUserId, item.message, true );
            });
          }

          self.timeoutId = setTimeout( lang.hitch(self, self.poll), self.pollInterval );
          self.pollingNow = false;

          return res;
        },

        function(err){

          // TODO: Make this conditional, if there is a 403 then maybe send back to login page,
          // or (more likely) ask to reauthenticate. Since the re-authentication is the more
          // likely scenario, leaving this out for now
          //if( err.status == 401 ){
          //  window.location = vars['hotCoreAuth']['failURLs']['signin'];
          //  return;
          //}

          // There was an error: set the next timeout, stop the polling,
          // will try again later
          self.timeoutId = setTimeout( lang.hitch(self, self.poll), self.pollInterval );
          self.pollingNow = false;

          // Error handlers need to rethrow
          throw( err );
        }

      );

    },

  } );

  var messages = new Messages();

  // Add the header X-hotplate-tabId to store requests, so that the server
  // knows which tabId is making the request.

  topic.subscribe( 'hotplate/hotClientDojo/newStore', function( storeName, store ){

    function addTabIdToOptions( options ){
      if( typeof( options.headers ) === 'undefined' ) options.headers = {};
      options.headers['X-hotplate-tabId'] = messages.tabId;
    }

    aspect.before( store, 'put', function( object, options ){
      if( typeof( options ) === 'undefined' ) options = {};
      addTabIdToOptions( options );
      return [ object, options ];
    });

    aspect.before( store, 'add', function( object, options ){
      if( typeof( options ) === 'undefined' ) options = {};
      addTabIdToOptions( options );
      return [ object, options ];
    });
    aspect.before( store, 'remove', function( object, options ){
      if( typeof( options ) === 'undefined' ) options = {};
      addTabIdToOptions( options );
      return [ object, options ];
    });
  });


  return messages;

});
