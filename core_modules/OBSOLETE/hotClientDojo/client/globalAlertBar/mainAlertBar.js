define( [

  "dojo/topic"
, "dojo/_base/window"

, "hotplate/hotClientDojo/widgets/AlertBar"

], function(

  topic
, win

, AlertBar

){
  // console.log("In mainAlertBar.js");

  globalAlertBar = new AlertBar( { background: "#FF4444" } );
  globalAlertBar.placeAt( document.body, "first" );
  globalAlertBar.startup();

  topic.subscribe('globalAlert', function( message, displayFor ){
    displayFor = displayFor || 2500;
    globalAlertBar.set( 'message', message );
    globalAlertBar.show( displayFor );
  });


});


