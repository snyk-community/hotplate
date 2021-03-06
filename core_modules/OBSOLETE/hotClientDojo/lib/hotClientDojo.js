/*jslint node: true */

"use strict";

var dummy
  , hotplate =  require('hotplate')
  , path = require('path')

  , hotCoreStoreRegistry = require('hotCoreStoreRegistry')
  , logger = require('hotCoreServerLogger')
  , hotCorePage = require('hotCorePage')
;

// Simply activate path to client files
hotplate.hotEvents.onCollect( 'clientPath', 'hotClientDojo', function( done ){
  done( null, path.join(__dirname, '../client') );
});


// Some defaults to get things going
//  * needs to be asyncronous, AND
//  * needs to have the package "hotplate" set
//  * needs to have a "local" blank.html file configured via dojoBlankHtmlUrl

var p = path.join( hotplate.config.get( 'hotplate.moduleFilesPrefix' ), 'hotClientDojo/lib' );

hotplate.config.set( 'hotClientDojo.dojoConfig', {
  packages: [

    // This allows ALL modules to have, in their source, require( 'hotplate/...').
    // 'hotplate' will be resolved to hotplate.moduleFilesPrefix
    {
      name: 'hotplate',
      location: hotplate.config.get( 'hotplate.moduleFilesPrefix' ),
    },

    {
      name: 'dgrid',
      location: path.join( p, 'dgrid')
    },

    {
      name: 'put-selector',
      location: path.join( p, 'put-selector')
    },

    {
      name: 'xstyle',
      location: path.join( p, 'xstyle')
    },

    {
      name: 'dstore',
      location: path.join( p, 'dstore')
    },
  ],

  dojoBlankHtmlUrl: path.join( hotplate.config.get( 'hotplate.moduleFilesPrefix' ), 'hotClientDojo', 'blank.html' ),
  async: 1,
});

// By default, take Dojo from the CDN. It will always work. Developers will set
// a direct path for Dojo in their local machine so that debugging is easier
hotplate.config.set( 'hotClientDojo.dojoUrl', "//ajax.googleapis.com/ajax/libs/dojo/1.9.2/dojo/dojo.js.uncompressed.js" );
hotplate.config.set( 'hotClientDojo.cssUrl',  "//ajax.googleapis.com/ajax/libs/dojo/1.9.2/dijit/themes/claro/claro.css" );

// Theme options for Dojo and Dgrid
hotplate.config.set( 'hotClientDojo.bodyClass',  "claro" );
hotplate.config.set( 'hotClientDojo.dgrid-theme', 'claro' );

// Set default routes for welcome, pick and app
hotplate.config.set( 'hotClientDojo.welcomeRoute', hotplate.prefix( '/auth/welcome' ) );
hotplate.config.set( 'hotClientDojo.pickRoute', hotplate.prefix( '/auth/pick' ) );
hotplate.config.set( 'hotClientDojo.appRoute', hotplate.prefix( '/main' ) );

hotplate.hotEvents.onCollect( 'pageElementsPerPage', 'hotClientDojo', function( req, pageName, done ){

  // Make up the list of modules as a comma separated string, depending on what returned
  var listAsArray = [];

  var p = path.join( hotplate.config.get( 'hotplate.moduleFilesPrefix' ), 'hotClientDojo' );
  p = p.substr( 1 );

  // Include modules 'mainWelcome' or 'mainPick' or 'mainContainer' depending on the page viewed
  if( pageName === 'hotClientDojo/Welcome') listAsArray.push( 'hotplate/hotClientDojo/auth/mainWelcome' );
  if( pageName === 'hotClientDojo/Pick') listAsArray.push( 'hotplate/hotClientDojo/auth/mainPick' );
  if( pageName === 'hotClientDojo/container' ) listAsArray.push( 'hotplate/hotClientDojo/appContainer/mainContainer' );


  var requireLine = '';
  requireLine += '<script>\n';
  requireLine += '  // Modules marked as to be loaded by hotplate\n';
  requireLine += '  require(["dojo/topic", "dojo/dom-class", "dojo/_base/window", "hotplate/hotClientDojo/comet/messages", "hotplate/hotClientDojo/globalAlertBar/mainAlertBar", "hotplate/hotClientDojo/stores/StoreCacheUpdater", ';

  // Add modules depending on what's returned by dojoModulesPerPage
  hotplate.hotEvents.emitCollect( 'dojoModulesPerPage', req, pageName, function( err, dojoModules ){
    if( err ) return done( err );

    dojoModules.forEach( function( moduleInfo ){
      moduleInfo.result.forEach( function( moduleResult ){
        listAsArray.push( path.join( 'hotplate', moduleInfo.module, moduleResult) );
      });
    });


    var listAsArrayAsStrings = listAsArray.map( function( str ) { return "'" + str + "'" } ).join();

    requireLine += listAsArrayAsStrings + ', "dojo/domReady!"], function(topic, domClass, win ){\n';

    requireLine += '\n';
    requireLine += '    // This topic will tell hotplate modules that everything has been loaded up\n';

    requireLine += '    domClass.add( win.body(), "' + hotplate.config.get( 'hotClientDojo.bodyClass') + '" );\n';
    requireLine += '    topic.publish( "hotplateModulesLoaded" );\n';
    requireLine += '  })\n';
    requireLine += '</script>\n';

    done( null, { headLines: [ requireLine ] });
  });
});


hotplate.hotEvents.onCollect( 'pageElements', 'hotClientDojo', hotplate.cacheable( function( done ){

  var headLines, dojoConfigAssign;

  hotplate.hotEvents.emitCollect( 'enrichDojoConf', hotplate.config.get( 'hotClientDojo.dojoConfig'), function( err, results ){
    if( err ) return done( err );

    done( null, {

      vars:  [
        { name: 'appRoute', value: hotplate.config.get('hotClientDojo.appRoute') },
      ],

      headLines: [
        "<script>dojoConfig = " + JSON.stringify( hotplate.config.get( 'hotClientDojo.dojoConfig') ) + "</script>", // MAYBE ADD replace(/\//g,'\\/').
        '<link type="text/css" rel="stylesheet" href="' + hotplate.config.get( 'hotClientDojo.cssUrl' ) + '" media="screen" />',
        '<script src="' + hotplate.config.get( 'hotClientDojo.dojoUrl' ) + '"></script>',
      ],

      csses: [
        'auth/auth.css', // TODO: Should be "per page"
        'dgridWidgets/EditableList.css',
        'dgridWidgets/StoreSelect.css',
        'lib/dgrid/css/skins/' + hotplate.config.get('hotClientDojo.dgrid-theme' ) + '.css',
        'widgets/AlertBar.css', 'widgets/EditingWidget.css','widgets/_OverlayMixin.css', 'widgets/StoreToggle.css', 'widgets/ValidationTextArea.css',
      ]
    });
  });
}));


hotplate.hotEvents.onCollect( 'setRoutes', function( app, done ){

  // Routes for Dojo's welcome, pick and app pages
  app.get(  hotplate.config.get( 'hotClientDojo.welcomeRoute'), pageWelcome );
  app.get(  hotplate.config.get( 'hotClientDojo.pickRoute'), pagePick );
  app.get(  hotplate.config.get( 'hotClientDojo.appRoute'), mainApp );

  done( null );
});

// Send the app page
// Note that workspaceId is not guaranteed to be there -- it's only there
// for multihome environments

function mainApp( req, res, next ){

  // Not logged in: the user must not get this page, redirect to
  // the initial login page instead
  if( ! req.session.loggedIn ){
    return res.redirect( hotplate.config.get('hotCoreAuth.redirectURLs.fail.signin') );
  }

  // Multi home enabled, but no workspaceId in the URL: fail
  if( hotplate.config.get('hotCoreMultiHome.enabled' )  && ! req.params.workspaceId ){
    return res.redirect( hotplate.config.get('hotCoreAuth.redirectURLs.fail.signin') );
  }


  // WorkspaceId is not guaranteed to be there -- it's only there for multihome setups
  if( hotplate.config.get('hotCoreMultiHome.enabled' ) ){

    hotCoreStoreRegistry.getAllStores( function( err, allStores ){
      if( err ) return next( err );

      allStores.workspaces.dbLayer.selectById( req.params.workspaceId, function( err, record ){
        if( err ) return next( err );

        // Check that the user is allowed on the workspace
        allStores.workspacesUsers.dbLayer.selectByHash( { conditions: { workspaceId: req.params.workspaceId, userId: req.session.userId } }, {children: true }, function( err, wsRecords ){
          if( err ) return next( err );

          // Not allowed: knocked back.
          if( wsRecords.length !== 1 ){
            res.redirect( hotplate.config.get('hotCoreAuth.redirectURLs.fail.signin') );
          } else {
            // All good, the page CAN be served!
            restOfTheFunction();
          }
        });
      });
    });
  } else {
    restOfTheFunction();
  }

  function restOfTheFunction(){

    hotCorePage.processPageTemplate(
      {
        vars: (new hotCorePage.Vars() ).add( 'hotClientDojo', {
          name: 'failURLs',
          value: hotplate.config.get('hotCoreAuth.redirectURLs.fail')
        }),
        csses: (new hotCorePage.Csses() ).add( 'hotClientDojo', 'appContainer/mainContainer.css' ),
        bodyLines: (new hotCorePage.BodyLines() ).add( 'hotClientDojo', '<div id="app-container"></div>' ),
      },
      req,
      'hotClientDojo/container',
      function( err, result ){

        if( err ) return next( err );
        //logger.log( { message: "ERROR while App container page served" }, req );
        res.send( result );
        logger.log( { message: "App container page served" }, req );

      }
    );
  }
}

var pageWelcome = function(req, res, next){

  req.session =  {};

  // CASE #1: The user IS NOT logged in. Show the straight login form,
  //          after setting the right variables
  if(! req.session.loggedIn ){

    hotCorePage.processPageTemplate(
      {
        csses: (new hotCorePage.Csses() ).add('hotClientDojo', 'auth/welcome.css'),
        bodyLines: (new hotCorePage.BodyLines() ).add( 'hotClientDojo', '<div data-dojo-type="hotplate/hotClientDojo/Welcome" id="welcome"></div>' ),
      },
      req,
      'hotClientDojo/Welcome',
      function( err, result ){
        if( err ){
          next( err );
        } else {
          res.send( result );
          logger.log( { message: "Welcome page served" } );
        }
      }
    );
    return;
  }

  // CASE #2: The user IS logged in. Redirect to pick()
  if( req.session.userId ){
    res.redirect('/pages/pick');
  }

};

var pagePick = function( req, res, next ){

  if( req.session.loggedIn){

    var allStores = hotCoreStoreRegistry.getAllStores( function( err, allStores ){

      allStores.usersWorkspaces.dbLayer.selectByHash( { conditions: { userId: req.session.userId  }  }, {children: true }, function( err, records ){

        if( err ) return next( err );

        // To escape picking, there needs to be exactly 1 workspace AND escapePick needs to be true
        if( records.length !== 1 || ! hotplate.config.get( 'hotCoreMultiHome.escapePick' ) ){
          hotCorePage.processPageTemplate(
            {
              csses: (new hotCorePage.Csses() ).add( 'hotClientDojo', 'auth/pick.css' ),
              //vars: (new hotCorePage.Vars() ).add( 'hotClientDojo', 'pick.css' ),
              bodyLines: (new hotCorePage.BodyLines() ).add( 'hotClientDojo', '<div data-dojo-type="hotplate/hotClientDojo/Pick" id="pick">' ),
            },
            req,
            'hotClientDojo/Pick',
            function( err, result ){
              if( err ){
                next( err );
              } else {
                res.send( result );
                logger.log( { message: "Pick page served" } );
              }
            }
          );

        // OK, escape successful! Get the application URL and jump there
        } else {
          var applicationURL = hotplate.config.get( 'hotClientDojo.appRoute' );
          applicationURL = applicationURL.replace( ':workspaceId', records[0].workspaceId );
          res.redirect( applicationURL );
        }

      });

    });

  } else {

    var redirectURLs = hotplate.config.get( 'hotCoreAuth.redirectURLs.fail' );
    var redirectURL = redirectURLs.signin || '/' ;
    res.redirect( redirectURL );

  }

};



/*
// This is no longer necessary, BUT! Do use it as a documentation example
hotplate.hotEvents.onCollect( 'dojoModulesPerPage', 'someModule', function( req, pageName, done ){

  // Include modules 'mainWelcome' or 'mainPick' depending on the page viewed
  if( pageName === 'some/Welcome') return done( null, [ 'mainWelcome' ] );
  if( pageName === 'some/Pick') return done( null, [ 'mainPick' ] );

   done( null, [] );
});
*/
