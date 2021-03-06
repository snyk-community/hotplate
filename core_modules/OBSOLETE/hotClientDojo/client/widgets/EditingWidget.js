define( [

  "dojo/_base/declare"
, "dojo/topic"
, "dojo/on"
, "dojo/when"
, "dojo/dom-class"
, "dojo/_base/lang"

, "dijit/_WidgetBase"
, "dijit/_TemplatedMixin"
, "dijit/_WidgetsInTemplateMixin"
, "dijit/form/TextBox"
, "dijit/Destroyable"
, 'dijit/layout/_ContentPaneResizeMixin'
, "dijit/_Container"


, "hotplate/hotClientDojo/submit/defaultSubmit"

, "hotplate/hotClientDojo/widgets/AlertBar"
, "hotplate/hotClientDojo/widgets/_OverlayMixin"
, "hotplate/hotClientDojo/stores/stores"

], function(

  declare
, topic
, on
, when
, domClass
, lang

, _WidgetBase
, _TemplatedMixin
, _WidgetsInTemplateMixin
, TextBox
, Destroyable
, _ContentPaneResizeMixin
, _Container

, ds

, AlertBar
, _OverlayMixin
, stores

){

  return declare( [ _WidgetBase, _TemplatedMixin, _Container, _ContentPaneResizeMixin, _WidgetsInTemplateMixin, _OverlayMixin, Destroyable ] , {

    templateString: '<div><p>You need to set a template for this widget!</p></div>',

    // These will be defined by the templateString
    formWidget: null,
    alertBarWidget: null,
    buttonWidget: null,

    alertBarDomPlacement: 'first',

    storeName: '',
    storeParameters: null,

    loadedInfo: {},

    // Internal store variable
    store: null,

    //storeFields: {},
    recordId: null,

    // Default values for editing form
    defaultValues: {},

    resetOnSuccess: false,

    baseClass: 'editing-widget',

     // The store for records
    store: null,

    _firstResize: true,

    _idTextBox: null,

    savedMessage: 'Saved!',

    manipulateValuesBeforeSubmit: function(){},

    afterFormWidgetSet: function(){},

    constructor: function(){
    },


    postCreate: function(){
      this.inherited(arguments);

      // Make up the store internal variable
      this.store = stores( this.storeName, this.storeParameters );

      var self = this;

      // If there is no alertBarWidget defined, then make one up and
      // place it at the top of the form
      if( ! this.alertBarWidget ){
        this.alertBarWidget = new AlertBar();
        this.alertBarWidget.placeAt( this.formWidget.containerNode, this.alertBarDomPlacement );
      }
     
      // Artificially add a hidden id field to the form. This way, once the form has loaded,
      // the id will be stored and it will then be re-submitted 
      if( self.recordId ) {
        self._idTextBox = new TextBox( { type:"hidden", name: self.store.idProperty, value: self.recordId } );
        self._idTextBox.placeAt( self.formWidget.containerNode, 'first' );
      }

      // Check self the record doesn't get updated by remote
      self.store.on( 'update', function( event ){

        // If the message instructs that the data form isn't changed, then don't do anything
        if( event.keepForm ) return;

        // If the store is updated then place an overlay on the record
        // Note: message.putBefore there means that the item was just repositioned/moved. So, it
        // won't refresh. (There is a small case to be made for API changes doing a full update WITH
        // beforeId set, but it's a small edge case)
        if( event.target[ self.store.idProperty ] == self.recordId && ! event.beforeId ){
          if( event.remote ) {
            self.set( 'overlayStatus', { overlayed: true, clickable: true }  ); // CLICK ON

          } else {
            self.loadInfo();
          }

        }
      });


      self.own(

        // This is to make sure that DnD, if active, doesn't do a nasty preventDefault()
        // and therefore stops text selecting and moving cursor with mouse
        // Finding this one was a bit of a birch
        on( self.domNode, 'mousedown', function( e ){

          // For some reason, stopping propagation here will prevent focus
          // from happening if placeHolder there (!?). So, forcing focus on
          // previousSibling IF the click was on a placeholder;
          // TODO: UNDERSTAND WHY. This may have side effects. Stopping
          // propagation doesn't prevent the default from happening
          // if the placeHolder isn't there...
          if( domClass.contains( e.srcElement, 'dijitPlaceHolder' ) ){
            e.srcElement.previousSibling.focus();
          }
          
          // Stopping propagation, so that event won't reach the DnD
          // element above
          e.stopPropagation();
        }),

        // When the form's overlay is clicked, try and show the form again
        on( self, 'overlayClick', function( e ){
          self.set( 'overlayStatus', { overlayed: false, clickable: true }  ); // CLICK OFF
          self.loadInfo();
        })

      );

      // Submit form, trying to save values
      this.formWidget.onSubmit = ds.defaultSubmit(this.formWidget, this.buttonWidget, function(){

        // Set the values about to be saved
        var formValues = self.formWidget.get('value');

        self.manipulateValuesBeforeSubmit( formValues );

        self.set('overlayStatus', { overlayed: true, clickable: false  } ); // LOADING ON

        // Try to save the values
        when( self.store.put( formValues )) .then(
          ds.UIMsg( self.buttonWidget, self.alertBarWidget, self.savedMessage ),
          ds.UIErrorMsg( self.formWidget, self.buttonWidget, self.alertBarWidget )
        ).then(
          function( res ){


            if( !self.recordId && ! self.resetOnSuccess ){

              // Set recordId since we now have it
              self.recordId = res[ self.store.idProperty ];

             // if( ! self.resetOnSuccess ){

                // Add the hidden value, so that from now on subsequent saves will overwrite
                // newly created records
                if( self._idTextBox ) self._idTextBox.destroy(); // Just in case
                self._idTextBox = new TextBox( { type:"hidden", name: self.store.idProperty, value: self.recordId } );
                self._idTextBox.placeAt( self.formWidget.containerNode, 'first' );
              //}

              // Let everybody know that we now have a recordId
              self.emit( 'successfulcreation', { bubbles: false, submitted: formValues, received: res } );
              topic.publish( 'successfulcreation', { store: self.store, submitted: formValues, received: res }  );

              self.emit( 'gotrecordid', { bubbles: false } );
            }

            // Take the loading overlay off
            self.set( 'overlayStatus', { overlayed: false, clickable: false  } ); // LOADING OFF

            // Reset the form if required
            if( self.resetOnSuccess ){
              self.formWidget.reset();
            }

            // Let anybody interested know that submit was successful
            // Leaving this last because following this, thie widget might well get destroyed...
            self.emit( 'successfulsubmit', { bubbles: false, submitted: formValues, received: res }  );
            topic.publish( 'successfulsubmit', { store: self.store, submitted: formValues, received: res }  );

            return res;
          },
          function( err ){
            self.emit( 'unsuccessfulsubmit', { bubbles: false, submitted: formValues, error: err }  );
            topic.publish( 'unsuccessfulsubmit', { store: self.store, submitted: formValues, error: err }  );

            self.set( 'overlayStatus', { overlayed: false, clickable: false  } ); // LOADING OFF
            throw( err );
          }
        );

      }); // this.formWidget.onSubmit
    }, // postCreate()

    // It calls updateInfo in the first widget's resize
    resize: function(){
     
     this.inherited(arguments);

     if( this._firstResize ){
        this._firstResize = false;
        this.loadInfo();
      }
 
    },

    // loadInfo
    loadInfo: function(){

      this.inherited(arguments);

      var self = this;

      // ****************************************************************
      // There is a recordId set: it's the update of an existing value
      // ****************************************************************
      if( ! self.domNode ) return;

      if( self.recordId ){
       
        // Set the overlay if loading. By default, this widget is overlayed
        this.set( 'overlayStatus', { overlayed: true, clickable: false } ); // LOADING ON

        when( this.store.get( this.recordId )).then(
          ds.UIMsg(),
          ds.UIErrorMsg(null, null, this.alertBarWidget )
        ).then(
          function(res){

            // Set the loadedInfo variable now that it's all loaded
            self.loadedInfo = res;

            // OK things worked out: the overlay can go, values are assigned to form
            self.set( 'overlayStatus', { overlayed: false, clickable: false } ); // LOADING OFF
            self.formWidget.set( 'value', res ); // Thanks Karl Tiedt :D
            self.afterFormWidgetSet( res );

            // Return for chaining...
            return res;

          },
          function(err){
            self.set( 'overlayStatus', { overlayed: false, clickable: false } ); // LOADING OFF - Take out the unclickable overlay
            self.set( 'overlayStatus', { overlayed: true, clickable: true } ); // CLICK ON -- Put a new clickable one in

            // Error handlers need to rethrow...
            throw( err );
          }
        );

      // ****************************************************************
      // There is no recordId set: simply show defaults
      // ****************************************************************
      } else {
        self.formWidget.set( 'value', self.defaultValues ); // Thanks Karl Tiedt :D

      }
    },

    destroy: function(){
      this.inherited(arguments);

      var self = this;

      if( self._idTextBox ) self._idTextBox.destroy();
    },

  });

});



