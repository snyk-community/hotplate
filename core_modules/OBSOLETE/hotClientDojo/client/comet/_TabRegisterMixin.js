define( [

  "dojo/_base/declare"

, "hotplate/hotClientDojo/stores/stores"
, 'hotplate/hotClientDojo/globals/globals'
, "hotplate/hotClientDojo/widgets/_OverlayMixin"
, "hotplate/hotClientDojo/comet/messages"

], function(

  declare

, stores
, globals
, _OverlayMixin
, messages

){

  return declare( [ _OverlayMixin ], {

    postCreate: function(){
      var self = this;

      this.inherited(arguments);

      // Throw if more than one widget inherits
      if( window._registrationRun ){
        throw( new Error("Only ONE widget can inherit from _TabRegisterMixin!") );
      } 
      window._registrationRun = true;

      // Make sure registerForMessages() is successful with overlay
      // (User will click on overlay to retry)

      self.set( 'overlayStatus', { overlayed: true, clickable: false } ); // RELOAD ON
      registerForMessages();
      //
      this.on( 'overlayClick', function( e ){
        registerForMessages();
      });
      //
      function registerForMessages(){
        messages.register().then(
          function( res ){
            self.set( 'overlayStatus', { overlayed: false, clickable: false } ); // RELOAD OFF
          },
          function( err ){
            self.set( 'overlayStatus', { overlayed: false, clickable: false } ); // RELOAD OFF
            self.set( 'overlayStatus', { overlayed: true, clickable: true } ); // CLICK ON
          }
        );
      };

      window.onbeforeunload = function( e ) {
        messages.unregister();
      }
 
    },

  });

});


