define( [

  "dojo/_base/declare"
, "dojo/when"
, "dojo/topic"
, "dojo/on"
, "dojo/query"
, "dojo/_base/lang"
, "dojo/dom-style"
, "dojo/dom-class"
, "dojo/dom-geometry"
, "dojo/dom-construct"
, "dojo/aspect"
, "dojo/mouse"

, "dijit/a11y"
, "dijit/_WidgetBase"
, "dijit/_TemplatedMixin"
, "dijit/_WidgetsInTemplateMixin"
, "dijit/_OnDijitClickMixin"
, "dijit/focus"
, "dijit/form/Button"
, "dijit/layout/BorderContainer"
, 'dijit/layout/_ContentPaneResizeMixin'
, "dijit/_Container"

, "put-selector/put"

, "hotplate/hotClientDojo/submit/defaultSubmit"
, "hotplate/hotClientDojo/widgets/ConfirmDialog"
, "hotplate/hotClientDojo/widgets/TempDialog"
, "hotplate/hotClientDojo/widgets/_OverlayMixin"
, "hotplate/hotClientDojo/stores/stores"

], function(

  declare
, when
, topic
, on
, query
, lang
, domStyle
, domClass
, domGeometry
, domConstruct
, aspect
, mouse
, a11y

, _WidgetBase
, _TemplatedMixin
, _WidgetsInTemplateMixin
, _OnDijitClickMixin
, focusUtil
, Button
, BorderContainer
, _ContentPaneResizeMixin
, _Container

, put

, ds
, ConfirmDialog
, TempDialog
, _OverlayMixin
, stores

){

  var DefaultButtonsConstructor = declare( [_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, _OnDijitClickMixin ], {

    listWidget: null,

    baseClass: 'button-widgets',

    constructor: function( params ){
      if( typeof( params) == 'undefined' || typeof( params.listWidget ) == 'undefined' ){
        throw( new Error( "The buttonsWidget need to be passed a listWidget parameter in its constructor") );
      }
      this.listWidget = params.listWidget;
    },

    templateString: ''+
                    '<div>\n'+
                    '  <div class="dijitPopup" data-dojo-type="dijit/form/Button" data-dojo-attach-point="editButtonWidget, focusNode" data-dojo-props="label:\'Edit\'"> </div>\n'+
                    '  <div class="dijitPopup" data-dojo-type="dijit/form/Button" data-dojo-attach-point="deleteButtonWidget" data-dojo-props="label:\'Del\'"></div>\n'+
                    '</div>\n'+
                            '',



    postCreate: function(){
      var self = this;

      this.inherited(arguments);

      // Pressing Enter will trigger editing
      self.own(
        self.on( 'keydown' , function( e ){
          if( e.keyCode == 27  ){
            var row = self.listWidget.row( self.listWidget._buttonsRowId );
            domStyle.set( self.domNode, { display: 'none' } );
            row.element.focus();
          }
        })
      );

      // Wire up the default buttons. Note: templateString might have been redefined. That's
      // why the conditional wiring (the buttons might not be there)
      if( self.editButtonWidget ){
        self.own(
          self.editButtonWidget.on('click', function(e){
            var row = self.listWidget.row( self.listWidget._buttonsRowId );
            if( row ) self.listWidget._editRow( row );
          })
        );
      }

      if( self.editButtonWidget ){
        self.own(
          self.deleteButtonWidget.on('click', function(e){
            var row = self.listWidget.row( self.listWidget._buttonsRowId );
            if( row ) self.listWidget._deleteRow( row );
          })
        );
      }

    },
  });



  r = declare( [_WidgetBase, _TemplatedMixin, _Container, _ContentPaneResizeMixin, _OnDijitClickMixin ], {

    templateString: ''+
                    '<div>\n'+
                    '  <div class="adding-widget-top" data-dojo-attach-point="addingWidgetTopNode"></div>\n'+
                    '  <div class="extra-widget-top" data-dojo-attach-point="extraWidgetTopNode"></div>\n'+
                    '  <div class="list-widget" data-dojo-attach-point="listWidgetNode"></div>\n'+
                    '  <div class="adding-widget-bottom" data-dojo-attach-point="addingWidgetBottomNode"></div>\n'+
                    '  <div class="extra-widget-bottom" data-dojo-attach-point="extraWidgetBottomNode"></div>\n'+
                    '</div>\n'+
                    '',

    // Internal list of rows being edited or being deleted
    _inlineEditing: {},
    _inDeletion: {},

    editOnDoubleClick: true,

    // The widget's class
    ownClass: null,

    // Refresh immediately after a refreshData topic
    immediateRefresh: false,

    // Store
    storeName: '',
    storeParameters: null,

    // Internal store variable
    store: null,
    initialSort: [],
    initialFilter: null,

    listWidget: null,

    //ButtonsConstructor: DefaultButtonsConstructor,
    ButtonsConstructor: null,
    buttonsLeftOffset: 0,

    EditingWidgetConstructor: null,
    editingWidgetPlacement: 'inline', // It can be 'inline', 'dialog'
    multipleEditingAllowed: false,

    // Adding and extra widget
    AddingWidgetConstructor: null,
    addingWidget: null,
    addingWidgetPosition: null, // It can be 'top' or 'bottom'

    ExtraWidgetConstructor: null,
    extraWidget: null,
    extraWidgetPosition: null, // It can be 'top' or 'bottom'

    // Close dialog after a submission?
    closeDialogAfterSubmit: false,

    // Mouse statuses, to check if pointer is on the buttons or on the widget
    _onButtonsNode: false,
    _onWidget: false,

    // The row ID the buttons currently refer to. Important when
    // using click, since the buttons are not part of the dgrid DOM
    // and self.row() won't work
    _buttonsRowId: null,

    constructor: function( params ){
      this._inlineEditing = {};
      this._inDeletion = {};

    },


    // Proxy method for listwidget.row()
    row: function( p ){
      return this.listWidget.row( p );
    },

    xConstructorParameters: function( type, recordId ){
      return {
        storeName: this.storeName,
        storeParameters: this.storeParameters,
        recordId: recordId,
      };
    },

    // Helper functon. This is very common: the adding widget is placed in
    // a temporary dialog box
    addingWidgetConstructorInDialog: function( dialogTitle ){

      var self = this;

      var tempDialog = new TempDialog( {
        title: dialogTitle,
      } );

      // Creating the new addingWidget
      var addingWidget = new self.AddingWidgetConstructor(
        lang.mixin( { 'class': 'adding-form' }, self.xConstructorParameters( 'adding', null ) )
      );

      // When subimission is successful, hide the
      // dialog box
      if( self.closeDialogAfterSubmit ){
        self.own(
          addingWidget.on( 'successfulsubmit', function( e ){

            if( tempDialog ) {
              tempDialog.hide().then( function(){
                self.listWidget.focus( self.row( e.received[ self.listWidget.collection.idProperty ] ) );
              });
            }
            
          })
        );
      }

      // Add the adding widget to the dialog, start everything up
      tempDialog.addChild( addingWidget );
      tempDialog.startup();

      // If the adding widget resizes, then re-center the dialog
      aspect.after( addingWidget, 'resize', function( e ){
        tempDialog._position();
      });
    },


    postCreate: function(){

      this.inherited(arguments);
      var self = this;

      // Make up the store internal variable
      self.store = stores( self.storeName, self.storeParameters );

      // Set this widget's own class, if defined in prototype
      if( self.ownClass ){
        domClass.add( self.domNode, self.ownClass );
      }


      // *****************************************
      // *** THE CENTER PIECE: THE LIST WIDGET ***
      // *****************************************

      // Add the right class to the widget. The DOM is created
      // by hand, so classes need to be added programmatically
      put( this.domNode, '.editable-list' );

      // Add the dgrid, always in the middle. Note that it's crucial
      // that the widget inherits from DijitRegistry
      if( ! self.ListConstructor ){
         throw( new Error("You must specify a ListConstructor for this widget to work") );
      }
      var L = declare( [ self.ListConstructor, _OverlayMixin ] );

      // Make up the collection with the initial sorting/filters
      var collection = self.store;
      if( self.initialSort.length) collection = collection.sort( self.initialSort );
      if( self.initialFilter ) collection = collection.filter( self.initialFilter );

      self.listWidget = new L( { collection: collection, region: 'center', parameter: self.listConstructorParameter } );

      // The grid _needs_ to inherit from dgrid/extensions/DijitRegistry
      // as it's been added to a Dijit container
      if( this.listWidget.layoutPriority !== 0 ){
         throw( new Error("The Dgrid needs to inherit from dgrid/extensions/DijitRegistry in order to work here!") );
      }
      domConstruct.place( self.listWidget.domNode, self.listWidgetNode );
      //self.addChild( self.listWidget );

      // Setting the viewing widget. This way, DnD events receiving the grid object
      // as paramerter can get to the viewing widget
      self.listWidget.viewingWidget = self;

      // If there is a change and store is queryEngine-less and has sorting/filtering, will need to refresh
      self.own(
        self.store.on( 'add,update,delete', function( event ){

          if( self.store.alwaysRefreshOnChange ||
             !self.store.queryEngine && self.listWidget._renderedCollection.queryLog.length ) {

            // Zap partialResults, so that Observable doesn't actually work
            self.listWidget._renderedCollection._partialResults = null;

            // Refresh the data
            self.listWidget.refresh( { keepScrollPosition: true } );
          }
        })
      );

      // *** Deal with the overlay ***

      self.own(

        // Don't overlap refresh calls, if the refresh hasn't resolved, the
        // new request will be dead in the water
        // Fixes this: https://github.com/SitePen/dgrid/issues/356
        aspect.around( self.listWidget, 'refresh', function( refresh ){
          return function( options ){

            if( ! self.listWidget._inRefresh ){
              self.listWidget._inRefresh = true;
              self.listWidget.set( 'overlayStatus', { overlayed: true, clickable: false } ); // LOADING ON
              return refresh.call( self.listWidget, options );
            }
          }
        }),

        on( self.listWidget.domNode, 'overlayClick', function( e ){
          self.listWidget.set( 'overlayStatus', { overlayed: false, clickable: true } ); // CLICKME OFF
          self.listWidget.refresh( { keepScrollPosition: true } );
        }),
        topic.subscribe('refreshData', function( ){
          if( self.immediateRefresh ){
            self.listWidget.refresh( { keepScrollPosition: true } );
          } else {
            self.listWidget.set( 'overlayStatus', { overlayed: true, clickable: true } ); // CLICK ON
          }
        }),

        on( self.listWidget.domNode, 'dgrid-refresh-complete', function( e ){
          self.listWidget._inRefresh = false;
          self.listWidget.set( 'overlayStatus', { overlayed: false, clickable: false } ); // LOADING OFF
        }),
        on( self.listWidget.domNode, 'dgrid-error', function( e ){
          self.listWidget._inRefresh = false;
          self.listWidget.set( 'overlayStatus', { overlayed: false, clickable: false } ); // LOADING OFF
          self.listWidget.set( 'overlayStatus', { overlayed: true, clickable: true } ); // CLICKME ON
          topic.publish( 'globalAlert', 'Error: ' + e.error.message, 5000 );
        }) //,

        /*
        // Deal with drag&drop events
        on( self.listWidget.domNode, 'dgrid-drop-removal-started, dgrid-drop-started', function( e ){
          self.listWidget.set( 'overlayStatus', { overlayed: true, clickable: false }  ); // LOADING ON
          if( self.buttonsNode) domStyle.set( self.buttonsNode, 'display', 'none' );
        }),
        on( self.listWidget.domNode, 'dgrid-drop-removal-failed, dgrid-drop-failed, dgrid-drop-removal-completed, dgrid-drop-completed', function( e ){
          self.listWidget.set( 'overlayStatus', { overlayed: false, clickable: false }  ); // LOADING OFF
        })
        */

      );

      if( self.EditingWidgetConstructor && self.editOnDoubleClick ){

        self.own(

          // Trigger editing on doubleClick
          on( self.listWidget, 'dblclick', function( e ){
            var row = self.row( e );
            if( row ) self._editRow( row );
          })
        );
      }

      // *****************************************
      // *** THE OPTIONAL EXTRA WIDGET         ***
      // *****************************************

      if( self.ExtraWidgetConstructor ){
        self.extraWidget = new self.ExtraWidgetConstructor({
          'class': 'extra-widget',
        });
        if( self.extraWidgetPosition ){
          self.extraWidget.placeAt( self.extraWidgetPosition === 'top' ? self.extraWidgetTopNode : self.extraWidgetBottomNode );
        }
      }

      // *****************************************
      // *** THE ADDING WIDGET                 ***
      // *****************************************

      // If it's not defined, it's the same as the editing widget
      if( ! self.AddingWidgetConstructor ) self.AddingWidgetConstructor = self.EditingWidgetConstructor;

      // If a position for the addingWidget was passed, then create it and
      // place it
      if( self.addingWidgetPosition ){

        // Create the using the passed constructor. However,
        // it will set storeName, store (no recordId since it's an add)
        // Then, add it
        self.addingWidget = new self.AddingWidgetConstructor(
          lang.mixin( { 'class': 'adding-form' }, self.xConstructorParameters( 'adding', null ) )
        );

        // If addingWidgetPosition was set, place it in the right spot
        self.addingWidget.placeAt( self.addingWidgetPosition === 'top' ? self.addingWidgetTopNode : self.addingWidgetBottomNode );

      }


      // *****************************************
      // *** THE EDITING WIDGET*S*<--- plural! ***
      // *****************************************

      // Aspect to check if renderRow is called for a row that is being edited
      // IF that's the case, it will need to re-attach the editing widget's domNode
      // to it, so that it doesn't disappear (zapped by renderRow which returns a new DOM)
      if( self.editingWidgetPlacement === 'inline' ){
        self.own( aspect.around( self.listWidget, 'renderRow', function( renderRow ){

          return function( object, options ){

            var id = object[ self.store.idProperty ];
            if( self._inlineEditing[ id ] ){
              var r = renderRow.call( self.listWidget, object, options );
              put( r, self._inlineEditing[ id ].editingWidget.domNode );
              return r;
            } else {
              return renderRow.call( self.listWidget, object, options );
            }
          }

        }) );
      }

      self.own(

        aspect.around( self.listWidget, 'renderRow', function( renderRow ){
          return function( object, options ){
            var r = renderRow.call( self.listWidget, object, options );

            // Row.element cannot be of position 'static' as the placement
            // of the inline editor will not work. Will only override at
            // style level if absolutely necessary
            var pos = domStyle.get( r, 'position' );
            if( pos === '' || pos === 'static' ){
              domStyle.set( r, 'position', 'relative' );
            }

            return r;
          }
        })
      );

      // *****************************************
      // *** THE (MOVING) BUTTONS              ***
      // *****************************************

      if( self.ButtonsConstructor ){


        // BUTTONS: CREATION

        // Create the buttons widget, place it in the document body as
        // invisible
        self.buttons = new self.ButtonsConstructor( { listWidget: self } );
        self.buttons.startup();
        self.buttonsNode = self.buttons.domNode;
        put( document.body, self.buttonsNode );
        self.geoButtons = domGeometry.position( self.buttonsNode, false );
        domStyle.set( self.buttonsNode, { display: 'none', opacity: '0' } );

        // BUTTONS: KEYBOARD

        // Pressing Enter will trigger the appearance of the
        // buttons in the right spot, and the focus on them
        self.own(
          self.listWidget.on( 'keypress' , function( e ){
            var row = self.row( e );

            if( e.charCode == 13 && ! self._inDeletion[ row.id ] ){
              var row = self.row( e );
              _buttonsToRow( row );
              if( self.buttons.focusNode) self.buttons.focusNode.focus();
            }
          })
        );

        // Taking the focus out will make them disappear. This is
        // crucial for when they are created after pressing ENTER,
        // while the mouse pointer was *outside* the listWidget
        // (so there is no leave event)
        focusUtil.on("widget-blur", function( widget ){
          if( widget == self.buttons ){
            if( self.buttonsNode ) domStyle.set( self.buttonsNode, { display: 'none', opacity: '0' } );
          }
        });

        // BUTTONS: MOUSE

        self.own(
          self.listWidget.on( on.selector('.dgrid-content .dgrid-row', mouse.enter), function(e){

            var row = self.row( e );
            _buttonsToRow( row );
          })
        );

        // Make sure the buttons disappear if the mouse leaves the
        // widget. It's tricky, as hovering on the buttons themselves
        // ALSO means "leaving the widget". So, it's important to
        // check both

        self.own(

          on( self.buttonsNode, mouse.enter, function(e){
            self._onButtonsNode = true;
          }),

          on( self.buttonsNode, mouse.leave, function(e){
            self._onButtonsNode = false;
            hideButtonsNode();
          }),

          on( self.listWidget.domNode, mouse.enter, function(e){
            self._onWidget = true;
          }),

          on( self.listWidget.domNode, mouse.leave, function(e){
            self._onWidget = false;
            hideButtonsNode();
          })
        );

        function hideButtonsNode(){
          setTimeout( function(){
            if( !self._onWidget && !self._onButtonsNode ) {
              domStyle.set( self.buttonsNode, 'display', 'none' );
              // self._buttonsRowId = null; // TODO: Decide on this one
            }
          }, 0 );
        }
      }


      function _buttonsToRow( row ){

        // Set a default for buttonsPosition, if needed
        var buttonsPosition = self.buttonsPosition;
        if( buttonsPosition !== 'after' && buttonsPosition !== 'top' && buttonsPosition !== 'bottom' ){
          buttonsPosition = 'top';
        }

        // Don't show buttons if editing right now
        if( self._inlineEditing[ row.id ] ) return;

        // Already displaying buttons for that row, don't do anything
        if( self.buttonsNode && self._buttonsRowId == row.id && domStyle.get( self.buttonsNode, 'display') != 'none' ) return;

        // Sets this one as the last row for which buttons were displayed
        self._buttonsRowId = row.id;

        // Don't show more buttons if a row is being edited and multipleEditingAllowed is false
        if( Object.keys( self._inlineEditing ).length > 0 && ! self.multipleEditingAllowed ) return;


        // Add the buttons if they are present. Manually place them in the right spot.
        // Note: they need to be outside of the document flow, or
        // you might not be able to edit the last element of the grid (as the
        // buttons fall under the visible area)
        if( self.buttonsNode ){

          //var geoButtons = domGeometry.position( self.buttonsNode, false );
          domStyle.set( self.buttonsNode, { 'transition-duration' : 0 } );
          domStyle.set( self.buttonsNode, { display: 'block', opacity: '0' } );

          var geoRow = domGeometry.position( row.element, false );

          var geoGrid = domGeometry.position( self.listWidget.bodyNode, false );

          switch( buttonsPosition ){
            case 'top':
              y = geoRow.y;
              if( y < geoGrid.y ) y = geoGrid.y;
              domStyle.set( self.buttonsNode, 'top', y + 'px' );
            break;
            case 'bottom':
              var y = (geoRow.y + geoRow.h - self.geoButtons.h );
              if( y + self.geoButtons.h > geoGrid.y + geoGrid.h ) y = geoGrid.y + geoGrid.h - self.geoButtons.h;
              domStyle.set( self.buttonsNode, 'top', y + 'px' );

            break;
            case 'after':
              var y = (geoRow.y + geoRow.h - 2 );
              if( y > geoGrid.y + geoGrid.h ) y = geoGrid.y + geoGrid.h;
              domStyle.set( self.buttonsNode, 'top', y + 'px' );
            break;
          }
          domStyle.set( self.buttonsNode, 'left', ( geoRow.x + self.buttonsLeftOffset ) + 'px' );

          domStyle.set( self.buttonsNode, { 'transition-duration': '0.4s' } );
          domStyle.set( self.buttonsNode, { opacity: '1' } );
        }

      }

    },

    destroy: function(){
      var self = this;

      // Destroy placed widgets
      if( self.buttons) self.buttons.destroy();
      if( self.addingWidget) self.addingWidget.destroy();
      if( self.extraWidget) self.extraWidget.destroy();

      this.inherited(arguments);
    },


    // Allows editing of a row in a dialog box
    //
    _editInDialog: function( row, editingWidget ){
      var self = this;
      var editingWidget;

      // editingWidget was not passed: make one up, assuming we are editing a row from
      // this very store
      if( ! editingWidget ){


        // Create an editing widget using the passed constructor. However,
        // it will set storeName, storeParameters and recordId
        editingWidget = new self.EditingWidgetConstructor(
          lang.mixin( { 'class': 'editing-form' }, self.xConstructorParameters( 'editing', row.id ) )
        );

      }

      domClass.add( editingWidget.domNode, 'editing-form' );

      // Make up the dialog with editing widget, show it
      self.dialog = new TempDialog({ title: "Edit" } );
      self.dialog.addChild( editingWidget );
      self.dialog.startup();
      self.dialog.show();

      // Automatically give focus to first widget
      var elems = a11y._getTabNavigable(editingWidget.domNode);
      var firstFocusItem = elems.lowest || elems.first || this.closeButtonNode || this.domNode;
			focusUtil.focus( firstFocusItem );

      // When subimission is successful, hide the
      // dialog box
      if( self.closeDialogAfterSubmit ){
        self.own(
          editingWidget.on( 'successfulsubmit', function( e ){
            self.dialog.hide().then( function(){
              self.listWidget.focus( self.row( row.id ) );   // MERC
            });
          })
        );
      }

    },

    // Allows editing of a row inline
    //
    _editInline: function( row ){
      var self = this;
      var editingWidget;
      var keyHandler;

      // CHecking that the row passed actually exists
      if( ! row || ! row.id ) return;

      if( self._inlineEditing[ row.id ] ) return;

      // Self._inlineEditing will be an object containing several rows
      // indexed by row.id and each row contains:
      //
      // element:        the element's domNode
      // editingWidget:  the editing widget attached to that row
      //
      self._inlineEditing[ row.id ] = { element: row.element } ;

      if( self.buttonsNode ) domStyle.set( self.buttonsNode, { display: 'none' } );

      // Create an editing widget using the passed constructor.
      editingWidget = new self.EditingWidgetConstructor(
        lang.mixin( { 'class': 'editing-form' }, self.xConstructorParameters( 'editing', row.id ) )
      );

      // domClass.add( editingWidget.domNode, 'editing-form' ); // deleted

      self._inlineEditing[ row.id ].editingWidget = editingWidget;

      // Give the row the class .dgrid-cell-editing
      put( row.element, ".dgrid-cell-editing");

      // row.element cannot be 'static', or it will cover up
      // the whole dgrid (the first non-static element) when
      // editing a cell
      //var pos = domStyle.get( row.element, 'position' );
      //if( pos === '' || pos === 'static' ){
      //  domStyle.set( row.element, 'position', 'relative' );
      //}

      // Add the editing widget to the row domNode. It will have
      // absolute positioning, which means it will overlap
      // the actual row
      put( row.element, editingWidget.domNode );
      put( editingWidget.domNode, '.editable-list-row-editor' );

      // Row.element cannot be of position 'static' as the placement
      // of the inline editor will not work. Will only override at
      // style level if absolutely necessary
      var pos = domStyle.get( row.element, 'position' );
      if( pos === '' || pos === 'static' ){
        domStyle.set( row.element, 'position', 'relative' );
      }

      //domStyle.set( row.element, 'position', 'relative' );

      // Startup and show the widget
      editingWidget.startup();
      editingWidget.resize();

      // Automatically give focus to first widget
      var elems = a11y._getTabNavigable(editingWidget.domNode);
      var firstFocusItem = elems.lowest || elems.first || this.closeButtonNode || this.domNode;
			focusUtil.focus( firstFocusItem );

      // Escape and successful submit will close this form (properly)
      self.own(
        editingWidget.formWidget.on( 'keydown' , function( e ){
          if( e.keyCode == 27 ) closeThis();
          e.stopPropagation();
        }),
        editingWidget.on( 'successfulsubmit', function(){
          closeThis();
          self.listWidget.focus( self.row( row.id) );
        })
      );

      // If there is "escape" at widget level, then kill the editing.
      // This is necessary in case escape is pressed at widget level
      // and there are editing forms open and which won't get the focus
      // because of the overlay, or which don't have the focus full stop.
      keyHandler = self.on( 'keydown', function( e ){
        if( e.keyCode == 27 ){
          closeThis();
        }
      });

      // Close this form "properly":
      // * taking the class out
      // * delete the self.editing entry,
      // * destroy the widget
      function closeThis(){
        put( row.element, "!dgrid-cell-editing"); // Take out the extra editing class
        focusUtil.focus( self.row( row.id ).element );
        delete self._inlineEditing[ row.id ]; // Delete the self._inlineEditing holder
        editingWidget.destroyRecursive(); // Destroy the widget and its children
        // self.listWidget.select( row.id );
        keyHandler.remove();
      }
    },


    _editRow: function( row, editingWidget ){
      var self = this;

      if( self.multipleEditingAllowed || Object.keys( self._inlineEditing ).length < 1 ){

        if( self.editingWidgetPlacement === 'inline' ){
          self._editInline( row, editingWidget );
        } else {
          self._editInDialog( row, editingWidget );
        }
      }
    },

    _deleteRow: function( row ){

      var self = this;

      domStyle.set( self.buttons.domNode, { display: 'none' } );

      var myDialog = new ConfirmDialog({
        title: "Are you sure?",
        content: "Are you sure you want to delete the element?",
      });
      myDialog.startup();
      myDialog.show();

      self.own(

        // Declined: give the focus back to the grid
        myDialog.on( 'dialogdeclined', function( e ){
          self.listWidget.focus( row );
        }),

        // Confirmed: place an overlay on the row,
        // disable mouse events, and delete reporting
        // any errors
        myDialog.on( 'dialogconfirmed', function( e ){

          var cover = put( row.element, 'div.editable-list-overlay' );

          domStyle.set( row.element, 'pointer-events', 'none' );
          self._inDeletion[ row.id ] = true;

          when( self.store.remove( row.id )).then(
            function(r){ return r },
            ds.UIErrorMsg( null, null, null )
          ).then(
            function( res ){
              self._inDeletion[ row.id ] = false;
              return res;

            },
            function( err ){
              self._inDeletion[ row.id ] = false;
              put( row.element, cover, '!' );
              domStyle.set( row.element, 'pointer-events', 'all' );
              self.listWidget.focus( row );
              throw( err );
            }
          )
        })
      );// self.own
    }

  });

  // This needs to be available to developers so that they
  // can redefine the default ButtonsConstructor
  r.DefaultButtonsConstructor = DefaultButtonsConstructor;

  return r;

});
