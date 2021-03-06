/* TODO:

  AFTER FIXING MESSAGES
  * Check that login box greys out when updated

*/
define([
  "dojo/_base/declare"
, "dojo/when"

, "dijit/_WidgetBase"
, "dijit/_Container"
, "dijit/layout/_ContentPaneResizeMixin"

, "hotplate/hotClientDojo/globals/globals"
, "hotplate/hotClientDojo/stores/stores"

], function(
  declare
, when

, _WidgetBase
, _Container
, _ContentPaneResizeMixin

, globals
, stores

 ){

  return declare( [ _WidgetBase, _Container, _ContentPaneResizeMixin ], {

    strategyWidgets: {}, 
    strategyIds: null, 

    constructor: function( params ){

      var self = this;

      self.strategyWidgets = {};
    },

    postCreate: function(){
      var self = this;

      var resultSet;

      // The list of allowed strategyIds wasn't passed: get it from the page's global variable
      if( self.strategyIds === null) self.strategyIds = vars['hotCoreAuth']['strategyIds'];

      // TODO: If things go wrong, use overlay to cover things up.
      // Use overlay mixin to do this

      // Gets all of the user's strategies, in order to render
      // the resume widget property
      var store = stores( 'usersStrategies', { userId: globals.userId } );

      // NOTE! This needs to come from the memCache, because most likely the
      // problem is that the user is no longer logged in; so, they won't be able
      // to get the user strategies (they would get a Permission Denied problem)

      resultSet = store.memCache.fetch();
      //resultSet = store.fetch();

      when( resultSet ).then( function( userStrategyDataList ){
     
        // Add a strategy manager for each managed strategy
        self.strategyIds.forEach( function( strategyId ){

          require( [ 'hotplate/hotClientDojo/auth/auth/' + strategyId ], function( Strategy ){        

            var userStrategyData = userStrategyDataList.filter( function( o ) { return o.strategyId == strategyId } )[0];
            var strategyWidget;
 
            // Only add widget if there is actually strategy data there
            if( userStrategyData ){ 
              self.strategyWidgets[ strategyId ] = strategyWidget = new Strategy.Resume( { userStrategyData: userStrategyData });
              strategyWidget.startup();
              self.addChild( strategyWidget );
            }
          });
        });

        
      });

    }

  });
});





