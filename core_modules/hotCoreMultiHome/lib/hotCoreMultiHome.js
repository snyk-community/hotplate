"use strict";

/**
Provides multi-home abilities to Hotplate

WARNING: THIS INFORMATION IS COMPLETELY WRONG AND OUT OF DATE

This module's aim is to make sure Hotplate has full multi-home abilities. The module itself:

* Defines all of the relevant stores ( `workspaces`, `workspacesUsers`, `usersWorkspaces`)
* Places important variables on the rendered page ( `vars.hotCoreMultiHome.enabled` and `.multiHomeURL`)
* Places the crucial `vars.hotCoreMultiHome.workspaceId` variable on the rendered page

However, given the nature of this module, there are _several_ other modules in Hotplate that interact with it.

## SUMMARY: modules that deal with multihome environments:

* hotCoreStore -- it will broadcast comet messages only to workspace users
* hotCoreStoreConfig -- if the url has `:workspaceId`, it will set config stores' records in the page for that workspace
* hotDojoGlobals -- will set global variable workspaceId if it's set within the page
* hotDojoStoreConfig -- will call `stores()` passing `userId` and `workspaceId` in resolution hash, allowing easy workspace-bound setting lists
* hotDojoAppContainer -- fully multi-home aware, will hook to correct URL and, if `:workspaceId` is in the URL, it will check that it exists.
* hotDojoAuth -- fully multi-home aware, providing a pick mechanism etc. Gets the workspace URL from `vars.hotCoreMultiHome.multiHomeURL`

* hotDojoComet -- will add header `X-hotplate-workspaceId` to tab messages requests
* hotCoreComet -- will use `X-hotplate-workspaceId` to return updated config records for the expired workspace

A more detailed explanation of what each module does, in terms of interaction with hotCoreMultiHome, follows. Note that any interaction happens on the basis that `hotCoreMultiHome` is enabled.

## hotCoreStore

* ./node_modules/hotCoreStore/lib/hotCoreStore.js

When broadcasting changes to stores via the hook `cometBroadcast`, it will change its behavious depending on multi-home being enabled or not.

If multiHome is enabled, checks if the record has a workspaceId field -- in which case, it will only broadcast the message to users in that workspaceId (it will do so by passing a `makeTabIdHash()` function to the `cometBroadcast` hook)

## hotCoreStoreConfig

* ./node_modules/hotCoreStoreConfig/lib/hotCoreStoreConfig.js

Implements `pageElementsPerPage` that passes `params.workspaceId` to `getConfig()` -- which means that if the URL has the `workspaceId` parameter, it will add a variable with the workspace's configuration to the page. It also passes `session.userId` to `getConfig()`, so if the user is logged in, it will return that user's config too.

NOTE: `getConfig()` is implemented here. Signature: `function( workspaceId, userId, cb )`. It basically will return all configs with `workspaceId` and/or `userId` set in their `store.configStore` property

## hotDojoGlobals

* ./node_modules/hotDojoGlobals/client/globals.js

Sets the global variable `workspaceId` based on `vars.hotCoreMultiHome.workspaceId` (Unrelated: it also sets `userId` based in `vars.hotCoreAuth.userId`)

## hotDojoStoreConfig

* ./node_modules/hotDojoStoreConfig/client/ConfigVars.js

Config variables are bound to "nothing" (system-wide settings), to a user (user-wide settings), to a workspace (workspace-wide settings) or both (user-specific settings for a specific workspace). That's why ConfigVars will call `stores()` passing `:userId` and :`workspaceId` in resolution hash.

Note that `:workspaceId` and `userId` are the ONLY parameters allowed in a config store URL.


## hotDojoAppContainer

* ./node_modules/hotDojoAppContainer/lib/hotDojoAppContainer.js

In terms of URLs, it will attach to `hotCoreMultiHome.multiHomeURL` or `hotCoreAuth.appU R L ` depending on multi-home being enabled or not. Also, IF `:workspaceId` is in the URL as a parameter, it will check that the workspace actually exists or it will return an error.


## hotDojoAuth

* ./node_modules/hotDojoAuth/lib/hotDojoAuth.js

The pagePick callback is there just for multi-home environments, picking the workspace

* ./node_modules/hotDojoAuth/client/NewWorkspace.js

After adding a new workspace, it will redirect to it thanks to `vars.hotCoreMultiHome.multiHomeURL` (replacing `:workspaceId` with the id of the record that was just created)

* ./node_modules/hotDojoAuth/client/Pick.js

After picking a workspace, it will redirect to it thanks to `vars.hotCoreMultiHome.multiHomeURL` as above

* ./node_modules/hotDojoStoreConfig/client/ConfigVars.js

## hotDojoComet

* ./node_modules/hotDojoComet/client/messages.js

It adds a header `X-hotplate-workspaceId` to tabId requests. This is ESSENTIAL so that hotCoreComet knows which workspaceId the tab belongs to. Yes, IT NEEDS to know it: if the tab is not found or it's expired, hotCoreComet will return only one message, `resetStores`, which will INCLUDE all configuration records for that user and workspace (in order to save GETs and implement error management app-side).

## hotCoreComet

* ./node_modules/hotCoreComet/lib/hotCoreComet.js

Uses the header `X-hotplate-workspaceId` to return the config stores' records for that `workspaceId` in case the tab is expired or not there

@module hotCoreMultiHome
@main hotCoreMultiHome
@class hotCoreMultiHome
@static
*/

var dummy
  , hotplate = require('hotplate')

  , declare = require('simpledeclare')
  , JsonRestStore = require('jsonreststores')
  , SimpleSchema = require('simpleschema')

  , async = require('async')

  , hotCoreStore = require( 'hotplate/core_modules/hotCoreStore' )
  , debug = require('debug')('hotplate:hotCoreMultiHome')
;

var stores = {};

// Some sane defaults

// Multihome enabled
hotplate.config.set('hotCoreMultiHome', {
   enabled: true,
   escapePick: false,
});

/*
  * IF workspaceId is there: return list of tabs belonging to users in that workspace
  * ELSE: return list of tabs belonging to users in workspaces common to requesting userId
  *
*/
exports.makeTabIdHashForMultihome = function( userId, tabId, message, done ){

  var tabIdHash = {};

  debug("In makeTabIdHashForMultihome!", tabId, message );

  hotCoreStore.getAllStores( function( err, allStores ){

    if( err ){
       next( err );
    } else {

      if( typeof(  allStores[ message.storeName ] ) === 'undefined' ){
        debug("The message is for an undefined store, skipping comet broadcast: " , message );
        done( null, {} );
        return;
      };

      // Get a list of all tabs
      allStores.tabs.dbLayer.selectByHash( { },function( err, tabs ){
        if( err ){
          done( err );
        } else {


          debug("TABS: " , tabs );

          var hotGlobalBroadcast = allStores[ message.storeName ].hotGlobalBroadcast;

          // CASE #1

          // Global broadcast required: sending it to _every_ tab!

          if( hotGlobalBroadcast ){
            debug("Global broadcast required! " );

            tabs.forEach( function( tab ){
              if( tab.id != tabId ) tabIdHash[ tab.id ] = true;
            });

            debug("TABS HASH: " , tabIdHash );
            done( null, tabIdHash );
          }

          // CASE #2

          // The record HAS a workspaceId: send it to all tabs of users belonging
          // to that specific workspaceId
          else if( typeof( message.target.workspaceId ) !== 'undefined' ){

            debug("YES workspaceId"  );

            var uids = {};

            // Get a list of users for that workspace
            allStores.workspacesUsersBase.dbLayer.selectByHash( { conditions: { workspaceId: message.target.workspaceId } }, { children: true }, function( err, workspacesUsers ){

              if( err ) return cb( err );
              workspacesUsers.forEach( function( wu ){
                uids[ wu.userId ] = true;
              });

              // Add to tabIdHash any tab that belongs to a "good" user
              tabs.forEach( function( t ){ if( uids[ t.userId ] && t.id != tabId ) tabIdHash[ t.id ] = true; });

              debug("TABS HASH: " , tabIdHash );

              // That's it!
              done( null, tabIdHash );

            });

          // CASE #3

          // The record DOESN'T HAVE a workspaceId: send it to all tabs of users
          // who are in the same workspace as userId
          } else {

            debug("NO workspaceId"  );

            var uids = {};


            // CAVEAT 3a: it doesn't have a userId either. It will necessarily need to spam
            // all tabs about the change
            //
            if( typeof( message.target.userId ) === 'undefined' ){
              debug("No userId in record, will broadcast" );

              tabs.forEach( function( tab ){
                if( tab.id != tabId ) tabIdHash[ tab.id ] = true;
              });

              debug("TABS HASH: " , tabIdHash );
              return done( null, tabIdHash );
            }

            // Get a list of workspaces for the requesting user
            allStores.workspacesUsersBase.dbLayer.selectByHash( { conditions: { userId: message.target.userId } }, { children: true }, function( err, workspacesUsers ){
              if( err ) return done( err );

              debug("Workspaces for user ", message.target.userId,": ", workspacesUsers );

              async.each(
                workspacesUsers,

                function( w, cb ){

                  // Get a list of users for that workspace
                  allStores.workspacesUsersBase.dbLayer.selectByHash( { conditions: { workspaceId: w.workspaceId } }, { children: true }, function( err, workspacesUsers ){
                    if( err ) return cb( err );

                    debug("Users in workspace: " , workspacesUsers );

                    workspacesUsers.forEach( function( u ){

                      debug("ADDING UID: " , w.userId );
                      uids[ u.userId ] = true;
                    });
                    debug("UIDS: " , uids );

                    // Add to tabIdHash any tab that belongs to a "good" user
                    tabs.forEach( function( t ){
                      if( uids[ t.userId ] && t.id != tabId ) tabIdHash[ t.id ] = true;
                    });

                    debug("TABS HASH: " , tabIdHash );
                    cb( null );
                  });
                },

                function( err ){
                  if( err ) return done( err );

                  done( null, tabIdHash );
                }
              ); // async.each


            });
          }
        }
      });
    }
  });
}


var userInWorkspace = exports.userInWorkspace = function( userId, workspaceId, done ){

  stores.workspacesUsersBase.dbLayer.selectByHash( { conditions: { userId: userId, workspaceId: workspaceId } }, { children: true }, function( err, docs ){
    if( err ){
      done( err );
    } else {
      done( null, docs.length );
    }
  });

}


/*
  IN SHORT:
  * ALWAYS: User must belong to workspace (workspaceId is checked)
  * To WRITE (put, post, delete), userId needs to match logged in user
*/
exports.MultiHomeBasicPermissionsMixin = declare( Object, {

  _checkWorkspaceId: function( request, cb ){
    var self = this;

    // User is not logged in: fail
    if( ! request.session.userId ) return cb( new self.UnauthorizedError() );

    // The request doesn't include a workspaceId: pass it through (nothing to compare against)
    if( ! request.params.workspaceId ) return cb( null, true );

    // workspaceId is different to session's: fail
    userInWorkspace( request.session.userId, request.params.workspaceId, function( err, there ){
      if( ! there ){
        cb( null, false );
      } else {
        cb( null, true );
      }
    });
  },

  _checkUserIdMultiHome: function( request, cb ){
    var self = this;
    // User is not logged in: fail

    if( ! request.session.userId ) return cb( new self.UnauthorizedError() );

    // The request doesn't include a userId: pass it through (nothing to compare against)
    if( ! request.params.userId ) return cb( null, true );

    // userId is different to session's: fail
    if( request.params.userId.toString() !== request.session.userId.toString() ){
      return cb( null, false );
    }

    // Any other cases: pass
    cb( null, true );
  },

  _checkWorkspaceIdAndUserId: function( request, cb ){
    var self = this;

    self._checkWorkspaceId( request, function( err, res ){
      if( err ) return cb( err );
      if( ! res ) return cb( null, false );

      self._checkUserIdMultiHome( request, function( err, res ){
        if( err ) return cb( err );
        cb( null, res );
      });
    });
  },

  checkPermissions: function f( request, method, cb ){
    var self = this;

    this.inheritedAsync( f, arguments, function( err, res ){
      if( err ) return cb( err );
      if( ! res ) return cb( null, false );

      // For query methods, just check that the workspace matches
      // For writing methods, check that user id also matches
      switch( method ){
        case 'getQuery':
        case 'get':
          self._checkWorkspaceId( request, cb );
        break;

        default:
          self._checkWorkspaceIdAndUserId( request, cb );
        break;

      }

    });
  },

});


hotplate.hotEvents.onCollect( 'stores', 'hotCoreMultiHome', hotplate.cacheable( function( done ){


  hotCoreStore.get( function( err, s ){
    if( err ){
      done( err );
    } else {

      var HotStore = s.HotStore;
      var HotSchema = s.HotSchema;

      // ***********************************
      // *** WORKSPACES ********************
      // ***********************************

      var Workspaces = declare( HotStore, {

        schema: new HotSchema({
          workspaceName: { type: 'string', required: true, notEmpty: true, trim: 128, searchable: true,
                           sharedValidator: 'workspaceValidator' },
          ownerUserId:   { type: 'id' },
        }),

        storeName:  'workspaces',

        publicURL: '/workspaces/:id',
        hotExpose: true,

        handlePost: true,
        checkPermissions: function( request, method, cb ){

          // Only 'post' considered
          if( method !== 'post' ) return cb( null, true );

          // User needs to be logged in
          if( ! request.session.userId ) return cb( null, false );

          // Make sure that body.ownerUserId IS indeed SET as the logged in user
          request.body.ownerUserId = request.session.userId;

          cb( null, true );
        },

        // If creating a new workspace, and the user is logged in, then
        // assign the creating user to that workspace
        afterEverything: function f( request, method, cb ){

          // IN hotCoreMultiHome
          this.inheritedAsync( f, arguments, function( err ){
            if( err ) return cb( null );

            // Will only work with 'post'
            if( method !== 'post' ) return cb( null, true );

            if( request.remote && request.session.loggedIn ){
              var userId = request.session.userId;
              if( userId ){

                 stores.workspacesUsers.apiPost( { userId: userId, workspaceId: request.data.doc.id }, cb );
              } else {
                cb( null );
              }
            }
          });
        },

      });
      stores.workspaces = new Workspaces();


/*
  var WorkspaceInvites = exports.WorkspaceInvites = declare( HotStore, {

    schema: new HotSchema({
      inviteCode:  { type: 'blob' },
      email     :  { type: 'blob' },
      name      :  { type: 'blob' },
    }),

    handlePost: true,
    handleGet: true,
    handleGetQuery: true,
    handleDelete: true,

    storeName:  'workspaceInvites',
    paramIds: [ 'workspaceId', 'id' ],
    publicURL: '/workspaces/:workspaceId/invites/:id',
  });
*/


      // The basic schema for the WorkspacesUsers table
      var WorkspacesUsersBase = declare( HotStore, {

        schema: new HotSchema({

          id         : { type: 'id', searchable: true },
          userId     : { type: 'id', searchable: true },
          workspaceId: { type: 'id', searchable: true },
        }),

        onlineSearchSchema: new HotSchema({
        }),

        storeName: 'workspacesUsersBase',
        collectionName: 'workspacesUsers',

        nested: [
          {
            type: 'lookup',
            localField: 'workspaceId',
            store: 'workspaces',
            //layerField: 'id'
          }
        ],

        idProperty: 'id',

      });
      stores.workspacesUsersBase = new WorkspacesUsersBase();

      var WorkspacesUsers = declare( WorkspacesUsersBase, {

        storeName:  'workspacesUsers',
        collectionName: 'workspacesUsers',

        publicURL: '/workspaces/:workspaceId/users/:id',
        hotExpose: true,

        handleGetQuery: true,

        alsoNotify: [ 'usersWorkspaces'],

        checkPermissions: function( request, method, cb ){

          // Will only filter out getQuery
          if( method !== 'getQuery' ) return cb( null, true );

          userInWorkspace( request.session.userId, request.params.workspaceId, cb );
        },

      });
      stores.workspacesUsers = new WorkspacesUsers();

      var UsersWorkspaces = declare( WorkspacesUsersBase, {

        storeName:  'usersWorkspaces',
        collectionName: 'workspacesUsers',

        publicURL: '/users/:userId/workspaces/:id',
        hotExpose: true,

        handleGetQuery: true,
        checkPermissions: function( request, method, cb ){

          // Will only filter out getQuery
          if( method !== 'getQuery' ) return cb( null, true );

          // Only their own workspaces
          if( request.session.userId != request.params.userId ) return cb( null, false );

          cb( null, true );
        },

        alsoNotify: [ 'workspacesUsers'],

      });
      stores.usersWorkspaces = new UsersWorkspaces();

      done( null,  stores );

    }
  })


}));



/*
// Place relevant config variables on the rendered page
hotplate.hotEvents.onCollect( 'pageElements', 'hotCoreMultiHome', function( done ){

  done( null, {
    vars:  [
      { name: 'enabled',      value: hotplate.config.get('hotCoreMultiHome.enabled') },
    ],
  });
});

// Place workspaceId on the rendered page
hotplate.hotEvents.onCollect( 'pageElementsPerPage', 'hotCoreMultiHome', function( req, pageName, done ){

  var vars = [];

  // Add the user ID to the page as a variable
  if( req.params.workspaceId ){
    vars.push( { name: 'workspaceId', value: req.params.workspaceId } );
  }

  done( null, {
    vars: vars
  });

});
*/
